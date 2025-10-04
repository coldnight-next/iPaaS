import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { withCors } from '../_shared/cors.ts'
import { createSupabaseClient, getUserFromRequest } from '../_shared/supabaseClient.ts'
import { decryptJson } from '../_shared/encryption.ts'

function applyFilters(products: any[], filters: any): any[] {
  let filtered = products

  // Status filter
  if (filters.status && filters.status.length > 0) {
    filtered = filtered.filter(p => filters.status.includes(p.status))
  }

  // Price range filter
  if (filters.priceMin !== undefined && filters.priceMin !== null) {
    filtered = filtered.filter(p => p.price >= filters.priceMin)
  }
  if (filters.priceMax !== undefined && filters.priceMax !== null) {
    filtered = filtered.filter(p => p.price <= filters.priceMax)
  }

  // Inventory range filter
  if (filters.inventoryMin !== undefined && filters.inventoryMin !== null) {
    filtered = filtered.filter(p => p.inventory >= filters.inventoryMin)
  }
  if (filters.inventoryMax !== undefined && filters.inventoryMax !== null) {
    filtered = filtered.filter(p => p.inventory <= filters.inventoryMax)
  }

  // Search term filter
  if (filters.searchTerm) {
    const term = filters.searchTerm.toLowerCase()
    filtered = filtered.filter(p => 
      p.name?.toLowerCase().includes(term) ||
      p.sku?.toLowerCase().includes(term) ||
      p.description?.toLowerCase().includes(term)
    )
  }

  // SKU pattern filter (supports wildcards)
  if (filters.skuPattern) {
    const pattern = filters.skuPattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // Escape regex special chars
      .replace(/\*/g, '.*') // Convert * to .*
    const regex = new RegExp(`^${pattern}$`, 'i')
    filtered = filtered.filter(p => p.sku && regex.test(p.sku))
  }

  // Vendor/Brand filter
  if (filters.vendor) {
    const vendor = filters.vendor.toLowerCase()
    filtered = filtered.filter(p => 
      p.vendor?.toLowerCase().includes(vendor) ||
      p.brand?.toLowerCase().includes(vendor)
    )
  }

  // Product type/category filter
  if (filters.productType) {
    const type = filters.productType.toLowerCase()
    filtered = filtered.filter(p => 
      p.productType?.toLowerCase().includes(type) ||
      p.category?.toLowerCase().includes(type)
    )
  }

  // Tags filter (must have ALL tags)
  if (filters.tags && filters.tags.length > 0) {
    filtered = filtered.filter(p => {
      if (!p.tags || !Array.isArray(p.tags)) return false
      const productTags = p.tags.map((t: string) => t.toLowerCase())
      return filters.tags.every((tag: string) => 
        productTags.includes(tag.toLowerCase())
      )
    })
  }

  // Has image filter
  if (filters.hasImage) {
    filtered = filtered.filter(p => p.image && p.image.length > 0)
  }

  // Date filters
  if (filters.createdAfter) {
    const afterDate = new Date(filters.createdAfter)
    filtered = filtered.filter(p => {
      if (!p.createdAt) return false
      return new Date(p.createdAt) >= afterDate
    })
  }

  if (filters.updatedAfter) {
    const afterDate = new Date(filters.updatedAfter)
    filtered = filtered.filter(p => {
      if (!p.updatedAt) return false
      return new Date(p.updatedAt) >= afterDate
    })
  }

  if (filters.dateFrom && filters.dateTo) {
    const fromDate = new Date(filters.dateFrom)
    const toDate = new Date(filters.dateTo)
    filtered = filtered.filter(p => {
      if (!p.lastModified && !p.updatedAt) return false
      const itemDate = new Date(p.lastModified || p.updatedAt)
      return itemDate >= fromDate && itemDate <= toDate
    })
  }

  return filtered
}

serve(async (req) => {
  const origin = req.headers.get('origin')

  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: withCors({ 'Access-Control-Allow-Methods': 'POST,OPTIONS' }, origin)
    })
  }

  const corsJsonHeaders = (status: number, payload: unknown) => new Response(JSON.stringify(payload), {
    status,
    headers: withCors({ 'content-type': 'application/json' }, origin)
  })

  if (req.method !== 'POST') {
    return corsJsonHeaders(405, { error: 'method_not_allowed', message: 'Use POST' })
  }

  let body: any = {}
  try {
    body = await req.json()
  } catch (error) {
    // Body is optional, continue without it
  }

  const filters = body.filters || {}

  let auth
  try {
    auth = await getUserFromRequest(req)
  } catch (error) {
    if (error instanceof Response) {
      return new Response(await error.text(), {
        status: error.status,
        headers: withCors(Object.fromEntries(error.headers.entries()), origin)
      })
    }
    console.error('[fetch-products] Unexpected auth error', error)
    return corsJsonHeaders(500, { error: 'internal_error', message: 'Unable to authenticate request' })
  }

  const supabase = createSupabaseClient()

  // Get user's connections
  const { data: connections, error: connectionsError } = await supabase
    .from('connections')
    .select('*')
    .eq('user_id', auth.user.id)
    .eq('status', 'connected')
    .in('platform', ['netsuite', 'shopify'])

  if (connectionsError) {
    console.error('[fetch-products] Failed to fetch connections', connectionsError)
    return corsJsonHeaders(500, { error: 'database_error', message: 'Failed to fetch connections' })
  }

  const netsuiteConnection = connections?.find(c => c.platform === 'netsuite')
  const shopifyConnection = connections?.find(c => c.platform === 'shopify')

  const results: {
    netsuite: any[]
    shopify: any[]
  } = {
    netsuite: [],
    shopify: []
  }

  // Fetch NetSuite products
  if (netsuiteConnection) {
    try {
      const credentials = await decryptJson(netsuiteConnection.credentials.encrypted)
      const accountId = netsuiteConnection.metadata.account_id

      // NetSuite REST API endpoint for items
      const baseUrl = `https://${accountId.toLowerCase().replace(/_/g, '-')}.suitetalk.api.netsuite.com/services/rest/record/v1`
      
      let endpoint: string
      let items: any[] = []
      
      // If itemId is specified, try different item types
      if (filters.itemId) {
        const itemTypes = [
          'inventoryItem',
          'nonInventoryItem', 
          'assemblyItem',
          'serviceItem',
          'itemGroup',
          'kitItem',
          'lotNumberedInventoryItem',
          'serializedInventoryItem'
        ]
        
        let fetchSucceeded = false
        let lastError: string = ''
        const attemptedTypes: string[] = []
        
        console.log(`[fetch-products] Attempting to fetch item ID ${filters.itemId} across ${itemTypes.length} item types...`)
        
        // Try each item type until we find the right one
        for (const itemType of itemTypes) {
          try {
            endpoint = `${baseUrl}/${itemType}/${filters.itemId}?expandSubResources=true`
            console.log(`[fetch-products] Trying ${itemType}...`)
            
            const response = await fetch(endpoint, {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${credentials.access_token}`,
                'Content-Type': 'application/json',
                'prefer': 'transient'
              }
            })
            
            attemptedTypes.push(itemType)
            
            if (response.ok) {
              const data = await response.json()
              items = [data]
              fetchSucceeded = true
              console.log(`[fetch-products] ✅ SUCCESS! Found item ${filters.itemId} as type ${itemType}`)
              break
            } else {
              const errorText = await response.text()
              lastError = `${response.status}: ${errorText}`
              console.log(`[fetch-products] ❌ ${itemType}: ${response.status} - ${errorText.substring(0, 100)}`)
            }
          } catch (error) {
            lastError = error instanceof Error ? error.message : 'Unknown error'
            console.log(`[fetch-products] ❌ ${itemType} Exception: ${lastError}`)
            attemptedTypes.push(itemType)
          }
        }
        
        if (!fetchSucceeded) {
          const errorMsg = `Item ${filters.itemId} not found in NetSuite.\n\nAttempted types: ${attemptedTypes.join(', ')}\n\nLast error: ${lastError}\n\nPossible reasons:\n1. Item ID doesn't exist\n2. Item type not supported\n3. Permission issues\n4. Item is inactive or deleted`
          console.error(`[fetch-products] ❌ FAILED TO FIND ITEM ${filters.itemId}`)
          console.error(`[fetch-products] Attempted: ${attemptedTypes.join(', ')}`)
          console.error(`[fetch-products] Last error: ${lastError}`)
          // Don't throw - instead set results with helpful error info
          results.netsuite = []
          // Continue to allow Shopify search to work
        }
      } else {
        // For list queries, search across multiple item types if search term provided
        if (filters.searchTerm || filters.skuPattern) {
          const searchTerm = filters.searchTerm || filters.skuPattern?.replace(/\*/g, '%') || ''
          const itemTypes = ['inventoryItem', 'nonInventoryItem', 'assemblyItem', 'serviceItem']
          
          console.log(`[fetch-products] Searching for: "${searchTerm}" across ${itemTypes.length} item types`)
          
          // Search across all item types in parallel
          const searchPromises = itemTypes.map(async (itemType) => {
            try {
              const queryParams = new URLSearchParams({
                expandSubResources: 'true',
                limit: '250',
                q: searchTerm
              })
              
              const searchEndpoint = `${baseUrl}/${itemType}?${queryParams.toString()}`
              const response = await fetch(searchEndpoint, {
                method: 'GET',
                headers: {
                  'Authorization': `Bearer ${credentials.access_token}`,
                  'Content-Type': 'application/json',
                  'prefer': 'transient'
                }
              })
              
              if (response.ok) {
                const data = await response.json()
                const foundItems = data.items || []
                console.log(`[fetch-products] Found ${foundItems.length} items of type ${itemType}`)
                return foundItems
              }
              return []
            } catch (error) {
              console.log(`[fetch-products] Error searching ${itemType}:`, error)
              return []
            }
          })
          
          // Wait for all searches to complete and combine results
          const searchResults = await Promise.all(searchPromises)
          items = searchResults.flat()
          console.log(`[fetch-products] Total search results: ${items.length} items`)
        } else {
          // No search term, just fetch inventory items
          const queryParams = new URLSearchParams({
            expandSubResources: 'true',
            limit: '1000'
          })
          
          endpoint = `${baseUrl}/inventoryItem?${queryParams.toString()}`
        }
      }

      // For list queries, fetch from the endpoint (if not already populated by search)
      if (!filters.itemId && items.length === 0 && endpoint) {
        const response = await fetch(endpoint, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${credentials.access_token}`,
            'Content-Type': 'application/json',
            'prefer': 'transient'
          }
        })

        if (response.ok) {
          const data = await response.json()
          items = data.items || []
        } else {
          console.error('[fetch-products] NetSuite list fetch failed', response.status, await response.text())
        }
      }
      
      // items array is already populated for single item fetch
      if (items.length > 0) {
        
        let products = items.map((item: any) => {
          console.log('[fetch-products] Processing item:', item.id, 'Full item:', JSON.stringify(item, null, 2))
          
          // Extract price levels from NetSuite pricing
          const priceLevels: any = {}
          
          // NetSuite stores pricing in pricingMatrix or itemPricingList
          if (item.pricingMatrix && item.pricingMatrix.pricing) {
            // Format: pricingMatrix.pricing is an array
            const pricingArray = Array.isArray(item.pricingMatrix.pricing) ? item.pricingMatrix.pricing : [item.pricingMatrix.pricing]
            pricingArray.forEach((priceItem: any) => {
              const levelName = priceItem.priceLevel?.name || priceItem.priceLevel?.refName || `Level ${priceItem.priceLevel?.internalId || 'unknown'}`
              priceLevels[levelName] = parseFloat(priceItem.price) || 0
            })
          }
          
          // Also check in itemPricingList
          if (item.itemPricingList && item.itemPricingList.itemPricing) {
            const pricingArray = Array.isArray(item.itemPricingList.itemPricing) ? item.itemPricingList.itemPricing : [item.itemPricingList.itemPricing]
            pricingArray.forEach((priceItem: any) => {
              const levelName = priceItem.priceLevel?.name || priceItem.priceLevel?.refName || `Level ${priceItem.priceLevel?.internalId || 'unknown'}`
              priceLevels[levelName] = parseFloat(priceItem.price) || 0
            })
          }
          
          // Handle price fields from different possible locations
          const basePrice = parseFloat(item.basePrice) || parseFloat(item.cost) || parseFloat(item.purchasePrice) || 0
          const msrp = parseFloat(item.msrp) || parseFloat(item.retailPrice) || null
          const cost = parseFloat(item.cost) || parseFloat(item.purchaseCost) || parseFloat(item.averageCost) || null
          
          // Extract inventory details
          const quantityAvailable = parseFloat(item.quantityAvailable) || 0
          const quantityOnHand = parseFloat(item.quantityOnHand) || 0
          const quantityBackOrdered = parseFloat(item.quantityBackOrdered) || 0
          const quantityCommitted = parseFloat(item.quantityCommitted) || 0
          const quantityOnOrder = parseFloat(item.quantityOnOrder) || 0
          const reorderPoint = parseFloat(item.reorderPoint) || 0
          const preferredStockLevel = parseFloat(item.preferredStockLevel) || 0
          
          return {
            id: item.id,
            name: item.displayName || item.itemId,
            sku: item.itemId,
            price: basePrice,
            inventory: quantityAvailable,
            platform: 'netsuite',
            status: item.isInactive ? 'inactive' : 'active',
            description: item.description || item.salesDescription || item.storeDescription,
            
            // Pricing information
            basePrice: basePrice,
            msrp: msrp,
            cost: cost,
            priceLevels: priceLevels,
            
            // Inventory details
            quantityAvailable: quantityAvailable,
            quantityOnHand: quantityOnHand,
            quantityBackOrdered: quantityBackOrdered,
            quantityCommitted: quantityCommitted,
            quantityOnOrder: quantityOnOrder,
            reorderPoint: reorderPoint,
            preferredStockLevel: preferredStockLevel,
            
            // Classification fields
            vendor: item.vendor?.name || item.vendor?.refName || item.vendorName || '',
            manufacturer: item.manufacturer?.name || item.manufacturer?.refName || item.manufacturerName || '',
            brand: (() => {
              if (item.customFieldList?.customField) {
                const customFields = Array.isArray(item.customFieldList.customField) ? item.customFieldList.customField : [item.customFieldList.customField]
                const brandField = customFields.find((f: any) => f.scriptId === 'custitem_brand' || f.internalId === 'custitem_brand')
                return brandField?.value || brandField?.internalId || ''
              }
              return item.brand || ''
            })(),
            productGroup: item.class?.name || item.class?.refName || item.className || '',
            division: item.department?.name || item.department?.refName || item.departmentName || '',
            subsidiary: (() => {
              if (item.subsidiary?.name) return item.subsidiary.name
              if (item.subsidiaryName) return item.subsidiaryName
              if (item.subsidiaryList?.subsidiary) {
                const subs = Array.isArray(item.subsidiaryList.subsidiary) ? item.subsidiaryList.subsidiary : [item.subsidiaryList.subsidiary]
                return subs.map((s: any) => s.name || s.refName || s).filter(Boolean).join(', ')
              }
              return ''
            })(),
            
            productType: item.itemType || item.type || '',
            category: item.category?.name || item.category?.refName || item.categoryName || '',
            tags: item.tags || [],
            image: item.image,
            
            // Additional product details
            weight: parseFloat(item.weight) || 0,
            weightUnit: item.weightUnit?.name || item.weightUnit || '',
            upcCode: item.upcCode || '',
            
            // Custom fields (NetSuite custom fields)
            customFields: (() => {
              if (item.customFieldList?.customField) {
                return Array.isArray(item.customFieldList.customField) ? item.customFieldList.customField : [item.customFieldList.customField]
              }
              return []
            })(),
            
            // Date information
            createdAt: item.createdDate,
            updatedAt: item.lastModifiedDate,
            lastModified: item.lastModifiedDate,
            
            // Internal IDs for reference
            internalId: item.id,
            externalId: item.externalId,
            
            // Store complete raw data for reference
            rawData: item
          }
        })
        
        // Apply filters (only if not fetching by ID)
        if (!filters.itemId) {
          products = applyFilters(products, filters)
        }
        results.netsuite = products
      }
    } catch (error) {
      console.error('[fetch-products] NetSuite error', error)
      // Set empty results so function doesn't fail completely
      results.netsuite = []
    }
  }

  // Fetch Shopify products
  if (shopifyConnection) {
    try {
      const credentials = await decryptJson(shopifyConnection.credentials.encrypted)
      const shopDomain = shopifyConnection.metadata.shop_domain

      let endpoint = `https://${shopDomain}/admin/api/2024-01/products.json`
      
      // If itemId is specified, fetch single product
      if (filters.itemId) {
        endpoint = `https://${shopDomain}/admin/api/2024-01/products/${filters.itemId}.json`
      }

      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'X-Shopify-Access-Token': credentials.access_token,
          'Content-Type': 'application/json'
        }
      })

      if (response.ok) {
        const data = await response.json()
        
        // Handle single product response vs list response
        let productsData = []
        if (filters.itemId) {
          // Single product response
          productsData = [data.product]
        } else {
          // List response
          productsData = data.products || []
        }
        
        let products = productsData.map((product: any) => {
          const variant = product.variants?.[0]
          return {
            id: product.id.toString(),
            name: product.title,
            sku: variant?.sku || '',
            price: parseFloat(variant?.price || '0'),
            inventory: variant?.inventory_quantity || 0,
            platform: 'shopify',
            status: product.status,
            image: product.images?.[0]?.src,
            description: product.body_html,
            variants: product.variants?.length || 0,
            vendor: product.vendor,
            productType: product.product_type,
            category: product.product_type,
            tags: product.tags?.split(',').map((t: string) => t.trim()) || [],
            createdAt: product.created_at,
            updatedAt: product.updated_at,
            lastModified: product.updated_at,
            rawData: product
          }
        })
        
        // Apply filters (only if not fetching by ID)
        if (!filters.itemId) {
          products = applyFilters(products, filters)
        }
        results.shopify = products
      } else {
        console.error('[fetch-products] Shopify fetch failed', response.status, await response.text())
      }
    } catch (error) {
      console.error('[fetch-products] Shopify error', error)
    }
  }

  return corsJsonHeaders(200, results)
})

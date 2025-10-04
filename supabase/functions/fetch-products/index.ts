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
      let endpoint = `https://${accountId.toLowerCase().replace(/_/g, '-')}.suitetalk.api.netsuite.com/services/rest/record/v1/inventoryItem`
      
      // If itemId is specified, fetch single item
      if (filters.itemId) {
        endpoint = `${endpoint}/${filters.itemId}`
      }

      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${credentials.access_token}`,
          'Content-Type': 'application/json'
        }
      })

      if (response.ok) {
        const data = await response.json()
        
        // Handle single item response vs list response
        let items = []
        if (filters.itemId) {
          // Single item response
          items = [data]
        } else {
          // List response
          items = data.items || []
        }
        
        let products = items.map((item: any) => ({
          id: item.id,
          name: item.displayName || item.itemId,
          sku: item.itemId,
          price: item.basePrice || 0,
          inventory: item.quantityAvailable || 0,
          platform: 'netsuite',
          status: item.isInactive ? 'inactive' : 'active',
          description: item.description,
          rawData: item
        }))
        
        // Apply filters (only if not fetching by ID)
        if (!filters.itemId) {
          products = applyFilters(products, filters)
        }
        results.netsuite = products
      } else {
        console.error('[fetch-products] NetSuite fetch failed', response.status, await response.text())
      }
    } catch (error) {
      console.error('[fetch-products] NetSuite error', error)
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

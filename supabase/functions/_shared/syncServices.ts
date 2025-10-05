import { NetSuiteClient, type NetSuiteItem } from './netsuiteClient.ts'
import { ShopifyClient, type ShopifyProduct } from './shopifyClient.ts'

export interface SyncContext {
  supabase: any
  userId: string
  syncLogId: string
  netsuiteClient: NetSuiteClient
  shopifyClient: ShopifyClient
}

export interface SyncResult {
  processed: number
  succeeded: number
  failed: number
  errors: string[]
}

// Simple in-memory cache for API responses
class MemoryCache {
  private cache = new Map<string, { data: any; expiry: number }>()

  get<T>(key: string): T | null {
    const item = this.cache.get(key)
    if (!item) return null

    if (Date.now() > item.expiry) {
      this.cache.delete(key)
      return null
    }

    return item.data
  }

  set(key: string, data: any, ttlMs: number = 5 * 60 * 1000): void {
    this.cache.set(key, {
      data,
      expiry: Date.now() + ttlMs
    })
  }

  clear(): void {
    this.cache.clear()
  }
}

const apiCache = new MemoryCache()

// Retry utility with exponential backoff
async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000,
  backoffFactor: number = 2
): Promise<T> {
  let lastError: Error

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      if (attempt === maxRetries) {
        break
      }

      // Check if error is retryable
      if (!isRetryableError(lastError)) {
        throw lastError
      }

      const delay = baseDelay * Math.pow(backoffFactor, attempt) + Math.random() * 1000
      console.log(`[Retry] Attempt ${attempt + 1} failed, retrying in ${Math.round(delay)}ms:`, lastError.message)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  throw lastError!
}

function isRetryableError(error: Error): boolean {
  const retryablePatterns = [
    'rate limit',
    'timeout',
    'network',
    'connection',
    'ECONNRESET',
    'ENOTFOUND',
    'ECONNREFUSED',
    '429',
    '502',
    '503',
    '504'
  ]

  const errorMessage = error.message.toLowerCase()
  return retryablePatterns.some(pattern => errorMessage.includes(pattern))
}

// Utility function for controlled parallel processing
async function processInParallel<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  concurrencyLimit: number = 5
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = []

  for (let i = 0; i < items.length; i += concurrencyLimit) {
    const batch = items.slice(i, i + concurrencyLimit)
    const batchPromises = batch.map(item =>
      retryWithBackoff(() => processor(item), 2, 500, 1.5).catch(error => {
        console.error('[Parallel Processing] Error after retries:', error)
        throw error
      })
    )

    const batchResults = await Promise.allSettled(batchPromises)
    results.push(...batchResults)
  }

  return results
}

export interface ProductMapping {
  netsuiteItem: NetSuiteItem
  shopifyProduct?: ShopifyProduct
  action: 'create' | 'update' | 'skip'
  reason?: string
}

// ========== PRODUCT SYNC SERVICE ==========

export class ProductSyncService {
  private context: SyncContext

  constructor(context: SyncContext) {
    this.context = context
  }

  async syncProducts(direction: string): Promise<SyncResult> {
    console.log(`[ProductSync] Starting ${direction} product sync`)
    
    const result: SyncResult = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      errors: []
    }

    try {
      if (direction === 'netsuite_to_shopify') {
        return await this.syncNetSuiteToShopify()
      } else if (direction === 'shopify_to_netsuite') {
        return await this.syncShopifyToNetSuite()
      } else if (direction === 'bidirectional') {
        const nsToShopify = await this.syncNetSuiteToShopify()
        const shopifyToNs = await this.syncShopifyToNetSuite()
        
        return {
          processed: nsToShopify.processed + shopifyToNs.processed,
          succeeded: nsToShopify.succeeded + shopifyToNs.succeeded,
          failed: nsToShopify.failed + shopifyToNs.failed,
          errors: [...nsToShopify.errors, ...shopifyToNs.errors]
        }
      }
    } catch (error) {
      console.error('[ProductSync] Error:', error)
      result.errors.push(error instanceof Error ? error.message : 'Unknown error')
      result.failed++
    }

    return result
  }

  private async syncNetSuiteToShopify(): Promise<SyncResult> {
    console.log('[ProductSync] Syncing NetSuite → Shopify')

    const result: SyncResult = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      errors: []
    }

    try {
      // Get NetSuite items (with pagination support)
      const { items: netsuiteItems } = await this.context.netsuiteClient.searchItems({
        limit: 100
      })

      console.log(`[ProductSync] Found ${netsuiteItems.length} NetSuite items`)
      result.processed = netsuiteItems.length

      if (netsuiteItems.length === 0) {
        return result
      }

      // Get existing products from our database
      const { data: existingProducts } = await this.context.supabase
        .from('products')
        .select('*')
        .eq('user_id', this.context.userId)
        .eq('platform', 'netsuite')

      const existingProductsMap = new Map(
        (existingProducts || []).map((p: any) => [p.platform_product_id, p])
      )

      // Prepare batch operations
      const productsToInsert: any[] = []
      const productsToUpdate: Array<{ item: NetSuiteItem; productId: string }> = []
      const mappingsToCreate: NetSuiteItem[] = []
      const mappingsToUpdate: Array<{ mappingId: string; shopifyProductId: string }> = []

      // Analyze each item and prepare operations
      for (const nsItem of netsuiteItems) {
        const existingProduct = existingProductsMap.get(nsItem.internalId)

        if (existingProduct) {
          productsToUpdate.push({ item: nsItem, productId: existingProduct.id })
        } else {
          productsToInsert.push({
            user_id: this.context.userId,
            platform: 'netsuite',
            platform_product_id: nsItem.internalId,
            sku: nsItem.itemId,
            name: nsItem.displayName,
            description: nsItem.description,
            price: nsItem.basePrice,
            inventory_quantity: nsItem.quantityAvailable || 0,
            attributes: {
              item_type: nsItem.itemType,
              vendor: nsItem.vendor,
              subsidiary: nsItem.subsidiary
            },
            is_active: !nsItem.isInactive,
            last_platform_sync: new Date().toISOString()
          })
        }

        // We'll handle mappings after products are inserted/updated
        mappingsToCreate.push(nsItem)
      }

      // Execute batch database operations
      try {
        // Insert new products in batch
        if (productsToInsert.length > 0) {
          const { error: insertError } = await this.context.supabase
            .from('products')
            .insert(productsToInsert)

          if (insertError) {
            throw new Error(`Failed to batch insert products: ${insertError.message}`)
          }
        }

        // Update existing products in batch
        if (productsToUpdate.length > 0) {
          // For updates, we need individual operations since each has different data
          await Promise.all(productsToUpdate.map(({ item, productId }) =>
            this.updateNetSuiteProductInDb(item, productId)
          ))
        }

        // Process mappings and Shopify operations
        const shopifyOperations: Promise<void>[] = []

        for (const nsItem of mappingsToCreate) {
          try {
            const mapping = await this.findOrCreateMapping(nsItem)

            if (mapping.shopify_product_id) {
              // Sync to existing Shopify product
              shopifyOperations.push(this.pushToShopify(nsItem, mapping.shopify_product_id))
            } else {
              // Create new Shopify product
              shopifyOperations.push(
                this.createShopifyProduct(nsItem).then(shopifyProduct => {
                  mappingsToUpdate.push({ mappingId: mapping.id, shopifyProductId: shopifyProduct.id.toString() })
                })
              )
            }
          } catch (error) {
            result.failed++
            const errorMsg = error instanceof Error ? error.message : 'Unknown error'
            result.errors.push(`Item ${nsItem.itemId}: ${errorMsg}`)
            console.error(`[ProductSync] Failed to process mapping for item ${nsItem.itemId}:`, error)
          }
        }

        // Execute Shopify operations with controlled concurrency
        await processInParallel(shopifyOperations, op => op, 3) // Limit to 3 concurrent Shopify API calls

        // Update mappings for newly created Shopify products
        if (mappingsToUpdate.length > 0) {
          await processInParallel(
            mappingsToUpdate,
            ({ mappingId, shopifyProductId }) => this.updateMapping(mappingId, shopifyProductId),
            10 // Higher concurrency for database operations
          )
        }

        result.succeeded = result.processed - result.failed

        // Log successful operations in batch
        const syncLogs: any[] = []
        for (const nsItem of netsuiteItems) {
          const existingProduct = existingProductsMap.get(nsItem.internalId)
          syncLogs.push({
            sync_log_id: this.context.syncLogId,
            product_id: existingProduct?.id,
            platform: 'netsuite',
            operation: existingProduct ? 'update' : 'create',
            status: 'success'
          })
        }

        if (syncLogs.length > 0) {
          await this.context.supabase
            .from('product_sync_history')
            .insert(syncLogs)
        }

      } catch (error) {
        console.error('[ProductSync] Batch operation error:', error)
        result.errors.push(error instanceof Error ? error.message : 'Batch operation failed')
        result.failed = result.processed
        result.succeeded = 0
      }

    } catch (error) {
      console.error('[ProductSync] NetSuite → Shopify error:', error)
      result.errors.push(error instanceof Error ? error.message : 'Unknown error')
    }

    return result
  }

  private async syncShopifyToNetSuite(): Promise<SyncResult> {
    console.log('[ProductSync] Syncing Shopify → NetSuite')
    
    const result: SyncResult = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      errors: []
    }

    try {
      // Get Shopify products
      const shopifyProducts = await this.context.shopifyClient.getProducts({
        limit: 250
      })

      console.log(`[ProductSync] Found ${shopifyProducts.length} Shopify products`)

      // Get existing products from our database
      const { data: existingProducts } = await this.context.supabase
        .from('products')
        .select('*')
        .eq('user_id', this.context.userId)
        .eq('platform', 'shopify')

      const existingProductsMap = new Map(
        (existingProducts || []).map((p: any) => [p.platform_product_id, p])
      )

      // Process each Shopify product
      for (const shopifyProduct of shopifyProducts) {
        result.processed++

        try {
          const existingProduct = existingProductsMap.get(shopifyProduct.id.toString())

          if (existingProduct) {
            await this.updateShopifyProductInDb(shopifyProduct, existingProduct.id)
          } else {
            await this.insertShopifyProductInDb(shopifyProduct)
          }

          result.succeeded++

          await this.logProductSync({
            platform: 'shopify',
            operation: existingProduct ? 'update' : 'create',
            status: 'success',
            productId: existingProduct?.id
          })

        } catch (error) {
          result.failed++
          const errorMsg = error instanceof Error ? error.message : 'Unknown error'
          result.errors.push(`Product ${shopifyProduct.title}: ${errorMsg}`)
          
          console.error(`[ProductSync] Failed to sync product ${shopifyProduct.title}:`, error)

          await this.logProductSync({
            platform: 'shopify',
            operation: 'update',
            status: 'failed',
            errorMessage: errorMsg
          })
        }
      }

    } catch (error) {
      console.error('[ProductSync] Shopify → NetSuite error:', error)
      result.errors.push(error instanceof Error ? error.message : 'Unknown error')
    }

    return result
  }

  private async insertNetSuiteProductInDb(item: NetSuiteItem): Promise<void> {
    await this.context.supabase
      .from('products')
      .insert({
        user_id: this.context.userId,
        platform: 'netsuite',
        platform_product_id: item.internalId,
        sku: item.itemId,
        name: item.displayName,
        description: item.description,
        price: item.basePrice,
        inventory_quantity: item.quantityAvailable || 0,
        attributes: {
          item_type: item.itemType,
          vendor: item.vendor,
          subsidiary: item.subsidiary
        },
        is_active: !item.isInactive,
        last_platform_sync: new Date().toISOString()
      })
  }

  private async updateNetSuiteProductInDb(item: NetSuiteItem, productId: string): Promise<void> {
    await this.context.supabase
      .from('products')
      .update({
        name: item.displayName,
        description: item.description,
        price: item.basePrice,
        inventory_quantity: item.quantityAvailable || 0,
        is_active: !item.isInactive,
        last_platform_sync: new Date().toISOString()
      })
      .eq('id', productId)
  }

  private async insertShopifyProductInDb(product: ShopifyProduct): Promise<void> {
    await this.context.supabase
      .from('products')
      .insert({
        user_id: this.context.userId,
        platform: 'shopify',
        platform_product_id: product.id.toString(),
        sku: product.variants[0]?.sku,
        name: product.title,
        description: product.body_html,
        product_type: product.product_type,
        vendor: product.vendor,
        tags: product.tags.split(',').map(t => t.trim()),
        price: parseFloat(product.variants[0]?.price || '0'),
        inventory_quantity: product.variants[0]?.inventory_quantity || 0,
        images: product.images,
        variants: product.variants,
        is_active: product.status === 'active',
        last_platform_sync: new Date().toISOString()
      })
  }

  private async updateShopifyProductInDb(product: ShopifyProduct, productId: string): Promise<void> {
    await this.context.supabase
      .from('products')
      .update({
        name: product.title,
        description: product.body_html,
        product_type: product.product_type,
        vendor: product.vendor,
        price: parseFloat(product.variants[0]?.price || '0'),
        inventory_quantity: product.variants[0]?.inventory_quantity || 0,
        is_active: product.status === 'active',
        last_platform_sync: new Date().toISOString()
      })
      .eq('id', productId)
  }

  private async findOrCreateMapping(nsItem: NetSuiteItem): Promise<any> {
    // First, ensure we have the NetSuite product in our database
    const { data: netsuiteProduct } = await this.context.supabase
      .from('products')
      .select('id')
      .eq('user_id', this.context.userId)
      .eq('platform', 'netsuite')
      .eq('platform_product_id', nsItem.internalId)
      .single()

    if (!netsuiteProduct) {
      throw new Error(`NetSuite product ${nsItem.internalId} not found in database`)
    }

    // Try to find existing mapping for this NetSuite product
    const { data: existing } = await this.context.supabase
      .from('item_mappings')
      .select('*')
      .eq('user_id', this.context.userId)
      .eq('netsuite_product_id', netsuiteProduct.id)
      .maybeSingle()

    if (existing) {
      return existing
    }

    // Create new mapping
    const { data: mapping, error } = await this.context.supabase
      .from('item_mappings')
      .insert({
        user_id: this.context.userId,
        netsuite_product_id: netsuiteProduct.id,
        sync_enabled: true,
        sync_status: 'pending'
      })
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to create mapping: ${error.message}`)
    }

    return mapping
  }

  private async updateMapping(mappingId: string, shopifyProductId: string): Promise<void> {
    const { data: shopifyProduct } = await this.context.supabase
      .from('products')
      .select('id')
      .eq('user_id', this.context.userId)
      .eq('platform', 'shopify')
      .eq('platform_product_id', shopifyProductId)
      .single()

    if (shopifyProduct) {
      await this.context.supabase
        .from('item_mappings')
        .update({
          shopify_product_id: shopifyProduct.id,
          sync_status: 'completed',
          last_synced: new Date().toISOString()
        })
        .eq('id', mappingId)
    }
  }

  private async createShopifyProduct(nsItem: NetSuiteItem): Promise<ShopifyProduct> {
    const shopifyProduct = await this.context.shopifyClient.createProduct({
      title: nsItem.displayName,
      body_html: nsItem.description || '',
      vendor: nsItem.vendor?.name,
      product_type: nsItem.itemType,
      status: nsItem.isInactive ? 'draft' : 'active',
      variants: [{
        sku: nsItem.itemId,
        price: nsItem.basePrice?.toString() || '0',
        inventory_quantity: nsItem.quantityAvailable || 0,
        inventory_management: 'shopify'
      } as any]
    })

    // Store in our database
    await this.insertShopifyProductInDb(shopifyProduct)

    return shopifyProduct
  }

  private async pushToShopify(nsItem: NetSuiteItem, shopifyProductId: string): Promise<void> {
    const { data: shopifyProduct } = await this.context.supabase
      .from('products')
      .select('platform_product_id')
      .eq('id', shopifyProductId)
      .single()

    if (shopifyProduct) {
      await this.context.shopifyClient.updateProduct(parseInt(shopifyProduct.platform_product_id), {
        title: nsItem.displayName,
        body_html: nsItem.description,
        status: nsItem.isInactive ? 'draft' : 'active'
      })
    }
  }

  private async logProductSync(params: {
    platform: string
    operation: string
    status: string
    productId?: string
    errorMessage?: string
  }): Promise<void> {
    await this.context.supabase
      .from('product_sync_history')
      .insert({
        sync_log_id: this.context.syncLogId,
        product_id: params.productId,
        platform: params.platform,
        operation: params.operation,
        status: params.status,
        error_message: params.errorMessage
      })
  }
}

// ========== INVENTORY SYNC SERVICE ==========

export class InventorySyncService {
  private context: SyncContext

  constructor(context: SyncContext) {
    this.context = context
  }

  async syncInventory(direction: string): Promise<SyncResult> {
    console.log(`[InventorySync] Starting ${direction} inventory sync`)

    const result: SyncResult = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      errors: []
    }

    try {
      if (direction === 'netsuite_to_shopify') {
        return await this.syncNetSuiteToShopify()
      } else if (direction === 'shopify_to_netsuite') {
        return await this.syncShopifyToNetSuite()
      } else if (direction === 'bidirectional') {
        const nsToShopify = await this.syncNetSuiteToShopify()
        const shopifyToNs = await this.syncShopifyToNetSuite()

        return {
          processed: nsToShopify.processed + shopifyToNs.processed,
          succeeded: nsToShopify.succeeded + shopifyToNs.succeeded,
          failed: nsToShopify.failed + shopifyToNs.failed,
          errors: [...nsToShopify.errors, ...shopifyToNs.errors]
        }
      }
    } catch (error) {
      console.error('[InventorySync] Error:', error)
      result.errors.push(error instanceof Error ? error.message : 'Unknown error')
      result.failed++
    }

    return result
  }

  private async syncNetSuiteToShopify(): Promise<SyncResult> {
    console.log('[InventorySync] Syncing NetSuite inventory → Shopify')

    const result: SyncResult = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      errors: []
    }

    try {
      // Get NetSuite items with inventory levels
      const { items: netsuiteItems } = await this.context.netsuiteClient.searchItems({
        limit: 100
      })

      // Get existing mappings
      const { data: mappings } = await this.context.supabase
        .from('item_mappings')
        .select('*, products!inner(platform_product_id)')
        .eq('user_id', this.context.userId)

      const mappingMap = new Map(
        mappings?.map((m: any) => [m.products.platform_product_id, m]) || []
      )

      // Process inventory updates
      const inventoryUpdates: Array<{ inventoryItemId: number; locationId: number; quantity: number }> = []

      for (const nsItem of netsuiteItems) {
        result.processed++

        try {
          const mapping = mappingMap.get(nsItem.internalId)
          if (!mapping?.shopify_product_id) {
            continue // Skip items without mappings
          }

          // Get Shopify product to find inventory item IDs
          const shopifyProduct = await this.context.supabase
            .from('products')
            .select('variants')
            .eq('id', mapping.shopify_product_id)
            .single()

          if (shopifyProduct?.variants) {
            for (const variant of shopifyProduct.variants) {
              if (variant.inventory_item_id) {
                inventoryUpdates.push({
                  inventoryItemId: variant.inventory_item_id,
                  locationId: 0, // Default location, should be configurable
                  quantity: nsItem.quantityAvailable || 0
                })
              }
            }
          }

          result.succeeded++
        } catch (error) {
          result.failed++
          const errorMsg = error instanceof Error ? error.message : 'Unknown error'
          result.errors.push(`Item ${nsItem.itemId}: ${errorMsg}`)
        }
      }

      // Batch update Shopify inventory
      if (inventoryUpdates.length > 0) {
        await processInParallel(
          inventoryUpdates,
          update => this.context.shopifyClient.setInventoryLevel(
            update.inventoryItemId,
            update.locationId,
            update.quantity
          ),
          5 // Limit concurrent inventory updates
        )
      }

    } catch (error) {
      console.error('[InventorySync] NetSuite → Shopify error:', error)
      result.errors.push(error instanceof Error ? error.message : 'Unknown error')
    }

    return result
  }

  private async syncShopifyToNetSuite(): Promise<SyncResult> {
    console.log('[InventorySync] Syncing Shopify inventory → NetSuite')

    const result: SyncResult = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      errors: []
    }

    try {
      // Get Shopify products with inventory
      const shopifyProducts = await this.context.shopifyClient.getProducts({
        limit: 250
      })

      // Get existing mappings
      const { data: mappings } = await this.context.supabase
        .from('item_mappings')
        .select('*, products!inner(platform_product_id)')
        .eq('user_id', this.context.userId)

      const mappingMap = new Map(
        mappings?.map((m: any) => [m.shopify_product_id, m]) || []
      )

      // Process inventory updates
      const inventoryUpdates: Array<{ itemId: string; quantity: number }> = []

      for (const shopifyProduct of shopifyProducts) {
        result.processed++

        try {
          const mapping = mappingMap.get(shopifyProduct.id.toString())
          if (!mapping) continue

          // Calculate total inventory across variants
          const totalInventory = shopifyProduct.variants?.reduce(
            (sum, variant) => sum + (variant.inventory_quantity || 0),
            0
          ) || 0

          inventoryUpdates.push({
            itemId: mapping.products.platform_product_id,
            quantity: totalInventory
          })

          result.succeeded++
        } catch (error) {
          result.failed++
          const errorMsg = error instanceof Error ? error.message : 'Unknown error'
          result.errors.push(`Product ${shopifyProduct.title}: ${errorMsg}`)
        }
      }

      // Batch update NetSuite inventory
      if (inventoryUpdates.length > 0) {
        await processInParallel(
          inventoryUpdates,
          update => this.context.netsuiteClient.updateInventoryLevel(
            update.itemId,
            '1', // Default location ID
            update.quantity
          ),
          3 // Conservative limit for NetSuite
        )
      }

    } catch (error) {
      console.error('[InventorySync] Shopify → NetSuite error:', error)
      result.errors.push(error instanceof Error ? error.message : 'Unknown error')
    }

    return result
  }
}

// ========== ORDER SYNC SERVICE ==========

export class OrderSyncService {
  private context: SyncContext

  constructor(context: SyncContext) {
    this.context = context
  }

  async syncOrders(direction: string): Promise<SyncResult> {
    console.log(`[OrderSync] Starting ${direction} order sync`)

    const result: SyncResult = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      errors: []
    }

    try {
      if (direction === 'netsuite_to_shopify') {
        return await this.syncNetSuiteToShopify()
      } else if (direction === 'shopify_to_netsuite') {
        return await this.syncShopifyToNetSuite()
      } else if (direction === 'bidirectional') {
        const nsToShopify = await this.syncNetSuiteToShopify()
        const shopifyToNs = await this.syncShopifyToNetSuite()

        return {
          processed: nsToShopify.processed + shopifyToNs.processed,
          succeeded: nsToShopify.succeeded + shopifyToNs.succeeded,
          failed: nsToShopify.failed + shopifyToNs.failed,
          errors: [...nsToShopify.errors, ...shopifyToNs.errors]
        }
      }
    } catch (error) {
      console.error('[OrderSync] Error:', error)
      result.errors.push(error instanceof Error ? error.message : 'Unknown error')
      result.failed++
    }

    return result
  }

  private async syncShopifyToNetSuite(): Promise<SyncResult> {
    console.log('[OrderSync] Syncing Shopify orders → NetSuite')

    const result: SyncResult = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      errors: []
    }

    try {
      // Get recent Shopify orders (last 24 hours to avoid duplicates)
      const sinceDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const shopifyOrders = await this.context.shopifyClient.getOrders({
        created_at_min: sinceDate,
        limit: 250,
        status: 'any',
        financial_status: 'paid'
      })

      console.log(`[OrderSync] Found ${shopifyOrders.length} Shopify orders`)
      result.processed = shopifyOrders.length

      if (shopifyOrders.length === 0) {
        return result
      }

      // Check for existing orders to avoid duplicates
      const orderNumbers = shopifyOrders.map(o => o.order_number.toString())
      const { data: existingOrders } = await this.context.supabase
        .from('sync_logs')
        .select('id')
        .eq('user_id', this.context.userId)
        .in('status', ['completed', 'running'])
        .ilike('sync_type', '%order%')
        .limit(1000)

      // Process orders in batches
      const orderCreations: any[] = []

      for (const shopifyOrder of shopifyOrders) {
        try {
          // Check if order already exists in NetSuite (basic check)
          const existingOrder = existingOrders?.find(log =>
            log.id.includes(shopifyOrder.order_number.toString())
          )

          if (existingOrder) {
            console.log(`[OrderSync] Order ${shopifyOrder.order_number} already synced, skipping`)
            result.succeeded++
            continue
          }

          // Transform Shopify order to NetSuite format
          const netsuiteOrder = this.transformShopifyToNetSuiteOrder(shopifyOrder)
          orderCreations.push(netsuiteOrder)

        } catch (error) {
          result.failed++
          const errorMsg = error instanceof Error ? error.message : 'Unknown error'
          result.errors.push(`Order ${shopifyOrder.order_number}: ${errorMsg}`)
        }
      }

      // Batch create orders in NetSuite
      if (orderCreations.length > 0) {
        const orderResults = await processInParallel(
          orderCreations,
          order => this.context.netsuiteClient.createSalesOrder(order),
          2 // Very conservative for order creation
        )

        result.succeeded += orderResults.filter(r => r.status === 'fulfilled').length
        result.failed += orderResults.filter(r => r.status === 'rejected').length
      }

    } catch (error) {
      console.error('[OrderSync] Shopify → NetSuite error:', error)
      result.errors.push(error instanceof Error ? error.message : 'Unknown error')
    }

    return result
  }

  private async syncNetSuiteToShopify(): Promise<SyncResult> {
    console.log('[OrderSync] Syncing NetSuite orders → Shopify')

    const result: SyncResult = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      errors: []
    }

    try {
      // Get recent NetSuite sales orders
      const { orders: netsuiteOrders } = await this.context.netsuiteClient.searchSalesOrders({
        createdAfter: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        limit: 100
      })

      console.log(`[OrderSync] Found ${netsuiteOrders.length} NetSuite orders`)
      result.processed = netsuiteOrders.length

      if (netsuiteOrders.length === 0) {
        return result
      }

      // Process orders (typically NetSuite orders are created from Shopify, so this might be for updates)
      for (const nsOrder of netsuiteOrders) {
        try {
          // This would typically update order fulfillment status in Shopify
          // For now, just log the order
          console.log(`[OrderSync] Processing NetSuite order ${nsOrder.tranId}`)
          result.succeeded++
        } catch (error) {
          result.failed++
          const errorMsg = error instanceof Error ? error.message : 'Unknown error'
          result.errors.push(`Order ${nsOrder.tranId}: ${errorMsg}`)
        }
      }

    } catch (error) {
      console.error('[OrderSync] NetSuite → Shopify error:', error)
      result.errors.push(error instanceof Error ? error.message : 'Unknown error')
    }

    return result
  }

  private transformShopifyToNetSuiteOrder(shopifyOrder: any): any {
    return {
      entity: {
        externalId: shopifyOrder.customer?.id?.toString()
      },
      tranDate: shopifyOrder.created_at.split('T')[0],
      items: shopifyOrder.line_items?.map((item: any) => ({
        item: {
          externalId: item.sku || item.product_id?.toString()
        },
        quantity: item.quantity,
        rate: parseFloat(item.price),
        amount: parseFloat(item.price) * item.quantity
      })) || [],
      shippingAddress: shopifyOrder.shipping_address ? {
        addressee: `${shopifyOrder.shipping_address.first_name} ${shopifyOrder.shipping_address.last_name}`,
        addr1: shopifyOrder.shipping_address.address1,
        addr2: shopifyOrder.shipping_address.address2,
        city: shopifyOrder.shipping_address.city,
        state: shopifyOrder.shipping_address.province,
        zip: shopifyOrder.shipping_address.zip,
        country: shopifyOrder.shipping_address.country
      } : undefined,
      memo: `Shopify Order #${shopifyOrder.order_number}`
    }
  }
}

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

      // Get existing products from our database
      const { data: existingProducts } = await this.context.supabase
        .from('products')
        .select('*')
        .eq('user_id', this.context.userId)
        .eq('platform', 'netsuite')

      const existingProductsMap = new Map(
        (existingProducts || []).map((p: any) => [p.platform_product_id, p])
      )

      // Process each NetSuite item
      for (const nsItem of netsuiteItems) {
        result.processed++

        try {
          const existingProduct = existingProductsMap.get(nsItem.internalId)

          if (existingProduct) {
            // Update existing product in database
            await this.updateNetSuiteProductInDb(nsItem, existingProduct.id)
          } else {
            // Insert new product in database
            await this.insertNetSuiteProductInDb(nsItem)
          }

          // Check if there's a mapping to Shopify
          const mapping = await this.findOrCreateMapping(nsItem)

          if (mapping.shopify_product_id) {
            // Sync to existing Shopify product
            await this.pushToShopify(nsItem, mapping.shopify_product_id)
          } else {
            // Create new Shopify product
            const shopifyProduct = await this.createShopifyProduct(nsItem)
            await this.updateMapping(mapping.id, shopifyProduct.id.toString())
          }

          result.succeeded++

          // Log success
          await this.logProductSync({
            platform: 'netsuite',
            operation: existingProduct ? 'update' : 'create',
            status: 'success',
            productId: existingProduct?.id
          })

        } catch (error) {
          result.failed++
          const errorMsg = error instanceof Error ? error.message : 'Unknown error'
          result.errors.push(`Item ${nsItem.itemId}: ${errorMsg}`)
          
          console.error(`[ProductSync] Failed to sync item ${nsItem.itemId}:`, error)

          await this.logProductSync({
            platform: 'netsuite',
            operation: 'update',
            status: 'failed',
            errorMessage: errorMsg
          })
        }
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
    // Try to find existing mapping by SKU
    const { data: existing } = await this.context.supabase
      .from('item_mappings')
      .select('*, netsuite_product:netsuite_product_id(platform_product_id)')
      .eq('user_id', this.context.userId)
      .single()

    if (existing) {
      return existing
    }

    // Create new mapping
    const { data: netsuiteProduct } = await this.context.supabase
      .from('products')
      .select('id')
      .eq('user_id', this.context.userId)
      .eq('platform', 'netsuite')
      .eq('platform_product_id', nsItem.internalId)
      .single()

    if (netsuiteProduct) {
      const { data: mapping } = await this.context.supabase
        .from('item_mappings')
        .insert({
          user_id: this.context.userId,
          netsuite_product_id: netsuiteProduct.id,
          sync_enabled: true,
          sync_status: 'pending'
        })
        .select()
        .single()

      return mapping
    }

    throw new Error('Could not create mapping')
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
    
    // Placeholder - will be fully implemented
    return {
      processed: 0,
      succeeded: 0,
      failed: 0,
      errors: []
    }
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
    
    // Placeholder - will be fully implemented
    return {
      processed: 0,
      succeeded: 0,
      failed: 0,
      errors: []
    }
  }
}

/**
 * Inventory Sync Service
 * Handles inventory synchronization from NetSuite to Shopify
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { ShopifyClient } from './shopifyClient.ts'
import { NetSuiteClient } from './netsuiteClient.ts'

export interface InventorySyncOptions {
  userId: string
  syncLogId: string
  productIds?: string[] // Specific products to sync
  threshold?: number // Only sync if quantity differs by this amount
  fullSync?: boolean // Sync all products regardless of changes
}

export interface InventorySyncResult {
  success: boolean
  productsProcessed: number
  productsSucceeded: number
  productsFailed: number
  quantityUpdates: number
  errors: Array<{ productId: string; error: string }>
  warnings: string[]
}

interface InventoryUpdate {
  shopifyProductId: string
  shopifyVariantId: string
  netsuiteItemId: string
  currentQuantity: number
  newQuantity: number
  location: string
}

export class InventorySyncService {
  constructor(
    private supabase: SupabaseClient,
    private shopifyClient: ShopifyClient,
    private netsuiteClient: NetSuiteClient,
    private userId: string
  ) {}

  /**
   * Main sync method - syncs inventory from NetSuite to Shopify
   */
  async syncInventory(options: InventorySyncOptions): Promise<InventorySyncResult> {
    const result: InventorySyncResult = {
      success: false,
      productsProcessed: 0,
      productsSucceeded: 0,
      productsFailed: 0,
      quantityUpdates: 0,
      errors: [],
      warnings: []
    }

    try {
      console.log('[InventorySync] Starting inventory sync', options)

      // Get all item mappings
      const itemMappings = await this.getItemMappings(options)
      console.log(`[InventorySync] Found ${itemMappings.length} item mappings`)

      // Get Shopify locations
      const shopifyLocations = await this.shopifyClient.getLocations()
      const defaultLocation = shopifyLocations[0]

      if (!defaultLocation) {
        throw new Error('No Shopify location found')
      }

      // Process each mapping
      for (const mapping of itemMappings) {
        result.productsProcessed++

        try {
          await this.syncSingleProduct(mapping, defaultLocation, options, result)
          result.productsSucceeded++
        } catch (error) {
          result.productsFailed++
          const errorMessage = error instanceof Error ? error.message : String(error)
          result.errors.push({
            productId: mapping.shopify_product_id || 'unknown',
            error: errorMessage
          })
          console.error(`[InventorySync] Failed to sync product:`, errorMessage)
        }
      }

      result.success = result.productsFailed === 0
      console.log('[InventorySync] Sync completed', result)

      return result
    } catch (error) {
      console.error('[InventorySync] Sync failed:', error)
      result.errors.push({
        productId: 'N/A',
        error: error instanceof Error ? error.message : String(error)
      })
      return result
    }
  }

  /**
   * Sync a single product's inventory
   */
  private async syncSingleProduct(
    mapping: any,
    shopifyLocation: any,
    options: InventorySyncOptions,
    result: InventorySyncResult
  ): Promise<void> {
    // Get NetSuite inventory levels
    const netsuiteItem = await this.netsuiteClient.getInventoryLevels(
      mapping.netsuite_product_id
    )

    // Get Shopify product
    const shopifyProduct = await this.shopifyClient.getProduct(
      parseInt(mapping.shopify_product_id)
    )

    // Get NetSuite available quantity
    const netsuiteQuantity = this.getNetSuiteAvailableQuantity(netsuiteItem)

    // Update each variant
    for (const variant of shopifyProduct.variants) {
      try {
        // Get current Shopify inventory
        const shopifyInventory = await this.getShopifyInventory(
          variant.inventory_item_id,
          shopifyLocation.id
        )

        const currentQuantity = shopifyInventory?.available || 0

        // Check if update is needed
        const threshold = options.threshold || 0
        const quantityDiff = Math.abs(netsuiteQuantity - currentQuantity)

        if (!options.fullSync && quantityDiff <= threshold) {
          console.log(
            `[InventorySync] Skipping ${variant.sku}, diff ${quantityDiff} <= threshold ${threshold}`
          )
          continue
        }

        // Update Shopify inventory
        await this.shopifyClient.setInventoryLevel(
          variant.inventory_item_id,
          shopifyLocation.id,
          netsuiteQuantity
        )

        result.quantityUpdates++

        // Log the update
        await this.logInventoryUpdate({
          shopifyProductId: shopifyProduct.id.toString(),
          shopifyVariantId: variant.id.toString(),
          netsuiteItemId: mapping.netsuite_product_id,
          currentQuantity,
          newQuantity: netsuiteQuantity,
          location: shopifyLocation.name
        })

        console.log(
          `[InventorySync] Updated ${variant.sku}: ${currentQuantity} → ${netsuiteQuantity}`
        )
      } catch (error) {
        console.error(`[InventorySync] Failed to update variant ${variant.id}:`, error)
        result.warnings.push(
          `Failed to update variant ${variant.sku}: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    }

    // Update mapping last synced time
    await this.supabase
      .from('item_mappings')
      .update({
        last_synced: new Date().toISOString()
      })
      .eq('id', mapping.id)
  }

  /**
   * Get item mappings to sync
   */
  private async getItemMappings(options: InventorySyncOptions): Promise<any[]> {
    let query = this.supabase
      .from('item_mappings')
      .select('*')
      .eq('user_id', this.userId)
      .eq('sync_enabled', true)
      .not('shopify_product_id', 'is', null)
      .not('netsuite_product_id', 'is', null)

    if (options.productIds && options.productIds.length > 0) {
      query = query.in('shopify_product_id', options.productIds)
    }

    const { data, error } = await query

    if (error) {
      throw new Error(`Failed to fetch item mappings: ${error.message}`)
    }

    return data || []
  }

  /**
   * Get available quantity from NetSuite inventory item
   */
  private getNetSuiteAvailableQuantity(netsuiteItem: any): number {
    // NetSuite returns inventory by location
    // Sum up available quantities from all locations
    if (netsuiteItem.locations && Array.isArray(netsuiteItem.locations)) {
      return netsuiteItem.locations.reduce(
        (sum: number, loc: any) => sum + (loc.quantityAvailable || 0),
        0
      )
    }

    return netsuiteItem.quantityAvailable || 0
  }

  /**
   * Get Shopify inventory level
   */
  private async getShopifyInventory(
    inventoryItemId: number,
    locationId: number
  ): Promise<any> {
    const inventoryLevels = await this.shopifyClient.getInventoryLevels({
      inventory_item_ids: [inventoryItemId],
      location_ids: [locationId]
    })

    return inventoryLevels[0] || null
  }

  /**
   * Log inventory update
   */
  private async logInventoryUpdate(update: InventoryUpdate): Promise<void> {
    await this.supabase.from('system_metrics').insert({
      metric_name: 'inventory_sync',
      metric_type: 'quantity_update',
      metric_value: update.newQuantity - update.currentQuantity,
      metric_unit: 'units',
      platform: 'shopify',
      user_id: this.userId,
      tags: {
        shopify_product_id: update.shopifyProductId,
        shopify_variant_id: update.shopifyVariantId,
        netsuite_item_id: update.netsuiteItemId,
        previous_quantity: update.currentQuantity,
        new_quantity: update.newQuantity,
        location: update.location
      }
    })
  }

  /**
   * Calculate inventory discrepancies
   */
  async getInventoryDiscrepancies(): Promise<Array<{
    productName: string
    sku: string
    shopifyQuantity: number
    netsuiteQuantity: number
    difference: number
  }>> {
    const discrepancies: Array<any> = []

    // Get all item mappings
    const itemMappings = await this.getItemMappings({ 
      userId: this.userId, 
      syncLogId: '' 
    })

    for (const mapping of itemMappings) {
      try {
        // Get NetSuite quantity
        const netsuiteItem = await this.netsuiteClient.getInventoryLevels(
          mapping.netsuite_product_id
        )
        const netsuiteQuantity = this.getNetSuiteAvailableQuantity(netsuiteItem)

        // Get Shopify quantity
        const shopifyProduct = await this.shopifyClient.getProduct(
          parseInt(mapping.shopify_product_id)
        )

        for (const variant of shopifyProduct.variants) {
          const shopifyQuantity = variant.inventory_quantity || 0
          const difference = Math.abs(shopifyQuantity - netsuiteQuantity)

          if (difference > 0) {
            discrepancies.push({
              productName: shopifyProduct.title,
              sku: variant.sku,
              shopifyQuantity,
              netsuiteQuantity,
              difference
            })
          }
        }
      } catch (error) {
        console.error(`[InventorySync] Error checking discrepancy:`, error)
      }
    }

    return discrepancies
  }

  /**
   * Static factory method to create service from connection data
   */
  static async fromConnections(
    supabase: SupabaseClient,
    userId: string
  ): Promise<InventorySyncService> {
    const { data: connections, error } = await supabase
      .from('connections')
      .select('*')
      .eq('user_id', userId)
      .in('platform', ['shopify', 'netsuite'])

    if (error || !connections || connections.length < 2) {
      throw new Error('Both Shopify and NetSuite connections are required')
    }

    const shopifyConn = connections.find(c => c.platform === 'shopify')
    const netsuiteConn = connections.find(c => c.platform === 'netsuite')

    if (!shopifyConn || !netsuiteConn) {
      throw new Error('Both Shopify and NetSuite connections are required')
    }

    const shopifyClient = await ShopifyClient.fromConnection(shopifyConn, supabase)
    const netsuiteClient = await NetSuiteClient.fromConnection(netsuiteConn, supabase)

    return new InventorySyncService(supabase, shopifyClient, netsuiteClient, userId)
  }
}

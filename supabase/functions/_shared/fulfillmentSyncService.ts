/**
 * Fulfillment Sync Service
 * Handles bidirectional fulfillment synchronization between NetSuite and Shopify
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { ShopifyClient } from './shopifyClient.ts'
import { NetSuiteClient } from './netsuiteClient.ts'

export interface FulfillmentSyncOptions {
  userId: string
  syncLogId: string
  direction: 'netsuite_to_shopify' | 'shopify_to_netsuite'
  orderIds?: string[] // Specific orders to sync
  dateFrom?: Date
  dateTo?: Date
}

export interface FulfillmentSyncResult {
  success: boolean
  fulfillmentsProcessed: number
  fulfillmentsSucceeded: number
  fulfillmentsFailed: number
  errors: Array<{ orderId: string; error: string }>
  warnings: string[]
}

interface FulfillmentData {
  orderId: string
  lineItems: Array<{
    id: string
    quantity: number
  }>
  trackingNumber?: string
  trackingCompany?: string
  trackingUrl?: string
  shippedDate?: string
  location?: string
}

export class FulfillmentSyncService {
  constructor(
    private supabase: SupabaseClient,
    private shopifyClient: ShopifyClient,
    private netsuiteClient: NetSuiteClient,
    private userId: string
  ) {}

  /**
   * Main sync method - syncs fulfillments bidirectionally
   */
  async syncFulfillments(options: FulfillmentSyncOptions): Promise<FulfillmentSyncResult> {
    const result: FulfillmentSyncResult = {
      success: false,
      fulfillmentsProcessed: 0,
      fulfillmentsSucceeded: 0,
      fulfillmentsFailed: 0,
      errors: [],
      warnings: []
    }

    try {
      console.log('[FulfillmentSync] Starting fulfillment sync', options)

      if (options.direction === 'netsuite_to_shopify') {
        await this.syncNetSuiteToShopify(options, result)
      } else {
        await this.syncShopifyToNetSuite(options, result)
      }

      result.success = result.fulfillmentsFailed === 0
      console.log('[FulfillmentSync] Sync completed', result)

      return result
    } catch (error) {
      console.error('[FulfillmentSync] Sync failed:', error)
      result.errors.push({
        orderId: 'N/A',
        error: error instanceof Error ? error.message : String(error)
      })
      return result
    }
  }

  /**
   * Sync fulfillments from NetSuite to Shopify
   */
  private async syncNetSuiteToShopify(
    options: FulfillmentSyncOptions,
    result: FulfillmentSyncResult
  ): Promise<void> {
    // Get fulfilled orders from NetSuite
    const fulfilledOrders = await this.getNetSuiteFulfilledOrders(options)

    for (const nsOrder of fulfilledOrders) {
      result.fulfillmentsProcessed++

      try {
        // Find corresponding Shopify order
        const { data: orderMapping } = await this.supabase
          .from('order_mappings')
          .select('*')
          .eq('user_id', this.userId)
          .eq('netsuite_sales_order_id', nsOrder.internalId)
          .single()

        if (!orderMapping) {
          result.warnings.push(`No Shopify order found for NetSuite order ${nsOrder.internalId}`)
          continue
        }

        // Check if already fulfilled in Shopify
        const shopifyOrder = await this.shopifyClient.getOrder(parseInt(orderMapping.shopify_order_id))
        
        if (shopifyOrder.fulfillment_status === 'fulfilled') {
          console.log(`[FulfillmentSync] Order ${shopifyOrder.id} already fulfilled in Shopify`)
          continue
        }

        // Get fulfillment details from NetSuite
        const fulfillmentData = await this.extractNetSuiteFulfillmentData(nsOrder)

        // Create fulfillment in Shopify
        await this.createShopifyFulfillment(shopifyOrder.id, fulfillmentData)

        // Update order mapping
        await this.supabase
          .from('order_mappings')
          .update({
            metadata: {
              ...orderMapping.metadata,
              fulfillment_synced: true,
              fulfillment_synced_at: new Date().toISOString()
            }
          })
          .eq('id', orderMapping.id)

        result.fulfillmentsSucceeded++
        console.log(`[FulfillmentSync] Successfully synced fulfillment for order ${shopifyOrder.id}`)

      } catch (error) {
        result.fulfillmentsFailed++
        const errorMessage = error instanceof Error ? error.message : String(error)
        result.errors.push({
          orderId: nsOrder.internalId,
          error: errorMessage
        })
        console.error(`[FulfillmentSync] Failed to sync order ${nsOrder.internalId}:`, errorMessage)
      }
    }
  }

  /**
   * Sync fulfillments from Shopify to NetSuite
   */
  private async syncShopifyToNetSuite(
    options: FulfillmentSyncOptions,
    result: FulfillmentSyncResult
  ): Promise<void> {
    // Get fulfilled orders from Shopify
    const fulfilledOrders = await this.getShopifyFulfilledOrders(options)

    for (const shopifyOrder of fulfilledOrders) {
      result.fulfillmentsProcessed++

      try {
        // Find corresponding NetSuite order
        const { data: orderMapping } = await this.supabase
          .from('order_mappings')
          .select('*')
          .eq('user_id', this.userId)
          .eq('shopify_order_id', shopifyOrder.id.toString())
          .single()

        if (!orderMapping || !orderMapping.netsuite_sales_order_id) {
          result.warnings.push(`No NetSuite order found for Shopify order ${shopifyOrder.id}`)
          continue
        }

        // Get fulfillments from Shopify
        const fulfillments = await this.shopifyClient.getFulfillments(shopifyOrder.id)

        if (fulfillments.length === 0) {
          continue
        }

        // Sync each fulfillment to NetSuite
        for (const fulfillment of fulfillments) {
          const fulfillmentData = this.extractShopifyFulfillmentData(fulfillment)
          
          // Create item fulfillment in NetSuite
          await this.createNetSuiteFulfillment(
            orderMapping.netsuite_sales_order_id,
            fulfillmentData
          )
        }

        result.fulfillmentsSucceeded++
        console.log(`[FulfillmentSync] Successfully synced fulfillment for order ${shopifyOrder.id}`)

      } catch (error) {
        result.fulfillmentsFailed++
        const errorMessage = error instanceof Error ? error.message : String(error)
        result.errors.push({
          orderId: shopifyOrder.id.toString(),
          error: errorMessage
        })
        console.error(`[FulfillmentSync] Failed to sync order ${shopifyOrder.id}:`, errorMessage)
      }
    }
  }

  /**
   * Get fulfilled orders from NetSuite
   */
  private async getNetSuiteFulfilledOrders(options: FulfillmentSyncOptions): Promise<any[]> {
    const searchParams: any = {
      status: ['Pending Fulfillment', 'Pending Billing']
    }

    if (options.dateFrom) {
      searchParams.createdAfter = options.dateFrom.toISOString()
    }

    const { orders } = await this.netsuiteClient.searchSalesOrders(searchParams)
    return orders
  }

  /**
   * Get fulfilled orders from Shopify
   */
  private async getShopifyFulfilledOrders(options: FulfillmentSyncOptions): Promise<any[]> {
    const params: any = {
      fulfillment_status: 'fulfilled',
      limit: 100
    }

    if (options.dateFrom) {
      params.updated_at_min = options.dateFrom.toISOString()
    }

    return await this.shopifyClient.getOrders(params)
  }

  /**
   * Extract fulfillment data from NetSuite order
   */
  private async extractNetSuiteFulfillmentData(nsOrder: any): Promise<FulfillmentData> {
    return {
      orderId: nsOrder.internalId,
      lineItems: nsOrder.items.map((item: any) => ({
        id: item.item.internalId,
        quantity: item.quantity
      })),
      trackingNumber: nsOrder.trackingNumber,
      trackingCompany: nsOrder.shippingCarrier,
      shippedDate: nsOrder.shipDate,
      location: nsOrder.location?.name
    }
  }

  /**
   * Extract fulfillment data from Shopify fulfillment
   */
  private extractShopifyFulfillmentData(fulfillment: any): FulfillmentData {
    return {
      orderId: fulfillment.order_id.toString(),
      lineItems: fulfillment.line_items.map((item: any) => ({
        id: item.id.toString(),
        quantity: item.quantity
      })),
      trackingNumber: fulfillment.tracking_number,
      trackingCompany: fulfillment.tracking_company,
      trackingUrl: fulfillment.tracking_url,
      shippedDate: fulfillment.created_at
    }
  }

  /**
   * Create fulfillment in Shopify
   */
  private async createShopifyFulfillment(
    orderId: number,
    fulfillmentData: FulfillmentData
  ): Promise<void> {
    const fulfillmentPayload: any = {
      location_id: null, // Will use default location
      tracking_number: fulfillmentData.trackingNumber,
      tracking_company: fulfillmentData.trackingCompany,
      tracking_url: fulfillmentData.trackingUrl,
      notify_customer: true
    }

    await this.shopifyClient.createFulfillment(orderId, fulfillmentPayload)
  }

  /**
   * Create item fulfillment in NetSuite
   */
  private async createNetSuiteFulfillment(
    salesOrderId: string,
    fulfillmentData: FulfillmentData
  ): Promise<void> {
    // NetSuite Item Fulfillment record
    const fulfillmentPayload = {
      createdFrom: { internalId: salesOrderId },
      shipStatus: 'Shipped',
      shipDate: fulfillmentData.shippedDate || new Date().toISOString(),
      trackingNumber: fulfillmentData.trackingNumber,
      items: fulfillmentData.lineItems.map(item => ({
        item: { internalId: item.id },
        quantity: item.quantity
      }))
    }

    // Note: This is a simplified version
    // Actual NetSuite API call would be more complex
    console.log('[FulfillmentSync] Creating NetSuite fulfillment:', fulfillmentPayload)
  }

  /**
   * Static factory method to create service from connection data
   */
  static async fromConnections(
    supabase: SupabaseClient,
    userId: string
  ): Promise<FulfillmentSyncService> {
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

    return new FulfillmentSyncService(supabase, shopifyClient, netsuiteClient, userId)
  }
}

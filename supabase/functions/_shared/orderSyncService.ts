/**
 * Order Sync Service
 * Handles synchronization of orders from Shopify to NetSuite
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { ShopifyClient } from './shopifyClient.ts'
import { NetSuiteClient } from './netsuiteClient.ts'
import { CurrencyService } from './currencyService.ts'

export interface OrderSyncOptions {
  userId: string
  syncLogId: string
  dateFrom?: Date
  dateTo?: Date
  orderStatus?: string[]
  limit?: number
}

export interface OrderSyncResult {
  success: boolean
  ordersProcessed: number
  ordersSucceeded: number
  ordersFailed: number
  errors: Array<{ orderId: string; error: string }>
  warnings: string[]
}

export class OrderSyncService {
  private currencyService: CurrencyService;
  private baseCurrency: string = 'USD'; // Default base currency for reporting

  constructor(
    private supabase: SupabaseClient,
    private shopifyClient: ShopifyClient,
    private netsuiteClient: NetSuiteClient,
    private userId: string
  ) {
    this.currencyService = new CurrencyService(supabase);
  }

  /**
   * Main sync method - syncs Shopify orders to NetSuite
   */
  async syncOrders(options: OrderSyncOptions): Promise<OrderSyncResult> {
    const result: OrderSyncResult = {
      success: false,
      ordersProcessed: 0,
      ordersSucceeded: 0,
      ordersFailed: 0,
      errors: [],
      warnings: []
    }

    try {
      console.log('[OrderSync] Starting order sync', options)

      // Fetch Shopify orders
      const orders = await this.fetchShopifyOrders(options)
      console.log(`[OrderSync] Found ${orders.length} orders to process`)

      // Process each order
      for (const shopifyOrder of orders) {
        result.ordersProcessed++

        try {
          await this.syncSingleOrder(shopifyOrder, options.syncLogId)
          result.ordersSucceeded++
        } catch (error) {
          result.ordersFailed++
          const errorMessage = error instanceof Error ? error.message : String(error)
          result.errors.push({
            orderId: shopifyOrder.id.toString(),
            error: errorMessage
          })
          console.error(`[OrderSync] Failed to sync order ${shopifyOrder.id}:`, errorMessage)
        }
      }

      // Update sync log
      await this.updateSyncLog(options.syncLogId, result)

      result.success = result.ordersFailed === 0
      console.log('[OrderSync] Sync completed', result)

      return result
    } catch (error) {
      console.error('[OrderSync] Sync failed:', error)
      result.errors.push({
        orderId: 'N/A',
        error: error instanceof Error ? error.message : String(error)
      })
      return result
    }
  }

  /**
   * Fetch orders from Shopify
   */
  private async fetchShopifyOrders(options: OrderSyncOptions): Promise<any[]> {
    const params: any = {
      status: 'any',
      limit: options.limit || 50
    }

    if (options.dateFrom) {
      params.created_at_min = options.dateFrom.toISOString()
    }

    if (options.dateTo) {
      params.created_at_max = options.dateTo.toISOString()
    }

    if (options.orderStatus && options.orderStatus.length > 0) {
      params.status = options.orderStatus.join(',')
    }

    return await this.shopifyClient.getOrders(params)
  }

  /**
   * Sync a single Shopify order to NetSuite
   */
  private async syncSingleOrder(shopifyOrder: any, syncLogId: string): Promise<void> {
    const startTime = Date.now()

    try {
      // Check if order already exists
      const { data: existingMapping } = await this.supabase
        .from('order_mappings')
        .select('*')
        .eq('user_id', this.userId)
        .eq('shopify_order_id', shopifyOrder.id.toString())
        .maybeSingle()

      if (existingMapping?.sync_status === 'synced') {
        console.log(`[OrderSync] Order ${shopifyOrder.id} already synced, skipping`)
        return
      }

      // Step 1: Find or create customer mapping
      const customerMappingId = await this.findOrCreateCustomer(shopifyOrder.customer)

      // Step 2: Get customer mapping details
      const { data: customerMapping } = await this.supabase
        .from('customer_mappings')
        .select('netsuite_customer_id')
        .eq('id', customerMappingId)
        .single()

      if (!customerMapping?.netsuite_customer_id) {
        // Create NetSuite customer if doesn't exist
        const netsuiteCustomerId = await this.createNetSuiteCustomer(shopifyOrder.customer)
        
        // Update customer mapping
        await this.supabase
          .from('customer_mappings')
          .update({
            netsuite_customer_id: netsuiteCustomerId,
            sync_status: 'synced',
            last_synced: new Date().toISOString()
          })
          .eq('id', customerMappingId)
      }

      // Step 3: Create order mapping record
      const orderMappingId = await this.createOrderMapping(shopifyOrder, existingMapping)

      // Step 4: Map line items
      const lineItems = await this.mapLineItems(shopifyOrder.line_items, orderMappingId)

      // Step 5: Create NetSuite sales order
      const netsuiteOrderData = await this.buildNetSuiteOrderData(
        shopifyOrder,
        customerMapping.netsuite_customer_id,
        lineItems
      )

      const netsuiteOrderId = await this.netsuiteClient.createSalesOrder(netsuiteOrderData)

      // Step 6: Update order mapping with NetSuite order ID
      await this.supabase
        .from('order_mappings')
        .update({
          netsuite_sales_order_id: netsuiteOrderId,
          sync_status: 'synced',
          last_synced: new Date().toISOString()
        })
        .eq('id', orderMappingId)

      // Step 7: Log the sync operation
      await this.logOrderSync(
        syncLogId,
        orderMappingId,
        'create',
        'success',
        shopifyOrder,
        netsuiteOrderData,
        Date.now() - startTime
      )

      console.log(`[OrderSync] Successfully synced order ${shopifyOrder.id} to NetSuite order ${netsuiteOrderId}`)
    } catch (error) {
      console.error(`[OrderSync] Error syncing order ${shopifyOrder.id}:`, error)
      
      // Log the failure
      await this.logOrderSync(
        syncLogId,
        null,
        'create',
        'failed',
        shopifyOrder,
        null,
        Date.now() - startTime,
        error instanceof Error ? error.message : String(error)
      )

      throw error
    }
  }

  /**
   * Find or create customer mapping
   */
  private async findOrCreateCustomer(customer: any): Promise<string> {
    if (!customer) {
      throw new Error('Order has no customer information')
    }

    const { data, error } = await this.supabase
      .rpc('find_or_create_customer_mapping', {
        p_user_id: this.userId,
        p_shopify_customer_id: customer.id.toString(),
        p_email: customer.email,
        p_first_name: customer.first_name,
        p_last_name: customer.last_name,
        p_company: customer.default_address?.company || null
      })

    if (error) {
      throw new Error(`Failed to create customer mapping: ${error.message}`)
    }

    return data
  }

  /**
   * Create NetSuite customer
   */
  private async createNetSuiteCustomer(customer: any): Promise<string> {
    const customerData = {
      companyName: customer.default_address?.company || `${customer.first_name} ${customer.last_name}`,
      email: customer.email,
      firstName: customer.first_name,
      lastName: customer.last_name,
      phone: customer.phone || customer.default_address?.phone,
      billingAddress: customer.default_address ? {
        address1: customer.default_address.address1,
        address2: customer.default_address.address2,
        city: customer.default_address.city,
        state: customer.default_address.province,
        zip: customer.default_address.zip,
        country: customer.default_address.country
      } : undefined
    }

    return await this.netsuiteClient.createCustomer(customerData)
  }

  /**
   * Create order mapping record
   */
  private async createOrderMapping(shopifyOrder: any, existingMapping: any): Promise<string> {
    const orderTotal = parseFloat(shopifyOrder.total_price);
    const orderCurrency = shopifyOrder.currency || 'USD';
    
    // Get currency conversion data
    let convertedAmount = orderTotal;
    let exchangeRate = 1.0;
    
    if (orderCurrency !== this.baseCurrency) {
      try {
        const conversionData = await this.currencyService.getConversionData(
          orderTotal,
          orderCurrency,
          this.baseCurrency
        );
        convertedAmount = conversionData.convertedAmount;
        exchangeRate = conversionData.exchangeRate;
        console.log(`[OrderSync] Currency conversion: ${orderTotal} ${orderCurrency} = ${convertedAmount} ${this.baseCurrency} (rate: ${exchangeRate})`);
      } catch (error) {
        console.error(`[OrderSync] Currency conversion failed, using original amount:`, error);
        // Fall back to original amount if conversion fails
      }
    }
    
    const orderData = {
      user_id: this.userId,
      shopify_order_id: shopifyOrder.id.toString(),
      shopify_order_number: shopifyOrder.name,
      order_date: shopifyOrder.created_at,
      total_amount: orderTotal,
      currency: orderCurrency,
      base_currency: this.baseCurrency,
      exchange_rate: exchangeRate,
      converted_amount: convertedAmount,
      sync_status: 'pending',
      metadata: {
        financial_status: shopifyOrder.financial_status,
        fulfillment_status: shopifyOrder.fulfillment_status,
        tags: shopifyOrder.tags,
        note: shopifyOrder.note
      }
    }

    if (existingMapping) {
      await this.supabase
        .from('order_mappings')
        .update(orderData)
        .eq('id', existingMapping.id)

      return existingMapping.id
    } else {
      const { data, error } = await this.supabase
        .from('order_mappings')
        .insert(orderData)
        .select('id')
        .single()

      if (error) {
        throw new Error(`Failed to create order mapping: ${error.message}`)
      }

      return data.id
    }
  }

  /**
   * Map line items and create records
   */
  private async mapLineItems(lineItems: any[], orderMappingId: string): Promise<any[]> {
    const mappedItems = []

    for (const item of lineItems) {
      // Find product mapping by SKU
      const { data: productMapping } = await this.supabase
        .from('item_mappings')
        .select('id, netsuite_product_id')
        .eq('user_id', this.userId)
        .eq('shopify_product_id', item.product_id.toString())
        .maybeSingle()

      // Create line item mapping record
      const { data: lineMapping, error } = await this.supabase
        .from('order_line_mappings')
        .insert({
          order_mapping_id: orderMappingId,
          shopify_line_item_id: item.id.toString(),
          product_mapping_id: productMapping?.id || null,
          sku: item.sku,
          product_name: item.name,
          quantity: item.quantity,
          unit_price: parseFloat(item.price),
          total_price: parseFloat(item.price) * item.quantity,
          tax_amount: item.tax_lines?.reduce((sum: number, tax: any) => sum + parseFloat(tax.price), 0) || 0,
          discount_amount: parseFloat(item.total_discount) || 0,
          sync_status: productMapping ? 'pending' : 'failed'
        })
        .select()
        .single()

      if (error) {
        console.error(`[OrderSync] Failed to create line mapping:`, error)
        continue
      }

      if (!productMapping) {
        console.warn(`[OrderSync] No product mapping found for SKU: ${item.sku}`)
      }

      mappedItems.push({
        ...lineMapping,
        netsuite_item_id: productMapping?.netsuite_product_id
      })
    }

    return mappedItems
  }

  /**
   * Build NetSuite sales order data
   */
  private async buildNetSuiteOrderData(
    shopifyOrder: any,
    netsuiteCustomerId: string,
    lineItems: any[]
  ): Promise<any> {
    return {
      entity: netsuiteCustomerId,
      tranDate: shopifyOrder.created_at,
      otherRefNum: shopifyOrder.name, // Shopify order number
      memo: shopifyOrder.note || `Shopify Order ${shopifyOrder.name}`,
      items: lineItems.map(item => ({
        item: item.netsuite_item_id,
        quantity: item.quantity,
        rate: item.unit_price,
        amount: item.total_price,
        taxAmount: item.tax_amount
      })),
      shippingCost: parseFloat(shopifyOrder.total_shipping_price_set?.shop_money?.amount || '0'),
      taxTotal: shopifyOrder.tax_lines?.reduce((sum: number, tax: any) => sum + parseFloat(tax.price), 0) || 0,
      total: parseFloat(shopifyOrder.total_price),
      shippingAddress: shopifyOrder.shipping_address ? {
        addressee: shopifyOrder.shipping_address.name,
        address1: shopifyOrder.shipping_address.address1,
        address2: shopifyOrder.shipping_address.address2,
        city: shopifyOrder.shipping_address.city,
        state: shopifyOrder.shipping_address.province,
        zip: shopifyOrder.shipping_address.zip,
        country: shopifyOrder.shipping_address.country
      } : undefined
    }
  }

  /**
   * Log order sync operation
   */
  private async logOrderSync(
    syncLogId: string,
    orderMappingId: string | null,
    operation: string,
    status: string,
    shopifyData: any,
    netsuiteData: any,
    processingTimeMs: number,
    errorMessage?: string
  ): Promise<void> {
    await this.supabase
      .from('order_sync_history')
      .insert({
        sync_log_id: syncLogId,
        order_mapping_id: orderMappingId,
        operation,
        status,
        shopify_data: shopifyData,
        netsuite_data: netsuiteData,
        error_message: errorMessage,
        processing_time_ms: processingTimeMs
      })
  }

  /**
   * Update sync log with results
   */
  private async updateSyncLog(syncLogId: string, result: OrderSyncResult): Promise<void> {
    await this.supabase
      .from('sync_logs')
      .update({
        order_count: result.ordersProcessed,
        items_succeeded: result.ordersSucceeded,
        items_failed: result.ordersFailed,
        order_sync_details: {
          errors: result.errors,
          warnings: result.warnings
        },
        status: result.success ? 'completed' : 'partial_success',
        completed_at: new Date().toISOString()
      })
      .eq('id', syncLogId)
  }

  /**
   * Static factory method to create service from connection data
   */
  static async fromConnections(
    supabase: SupabaseClient,
    userId: string
  ): Promise<OrderSyncService> {
    // Fetch connections
    const { data: connections, error } = await supabase
      .from('connections')
      .select('*')
      .eq('user_id', userId)
      .in('platform', ['shopify', 'netsuite'])

    if (error || !connections || connections.length < 2) {
      throw new Error('Both Shopify and NetSuite connections are required for order sync')
    }

    const shopifyConn = connections.find(c => c.platform === 'shopify')
    const netsuiteConn = connections.find(c => c.platform === 'netsuite')

    if (!shopifyConn || !netsuiteConn) {
      throw new Error('Both Shopify and NetSuite connections are required')
    }

    const shopifyClient = await ShopifyClient.fromConnection(shopifyConn, supabase)
    const netsuiteClient = await NetSuiteClient.fromConnection(netsuiteConn, supabase)

    return new OrderSyncService(supabase, shopifyClient, netsuiteClient, userId)
  }
}

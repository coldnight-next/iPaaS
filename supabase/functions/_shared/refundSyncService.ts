import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { NetSuiteClient } from './netsuiteClient.ts';
import { CurrencyService } from './currencyService.ts';

/**
 * RefundSyncService handles synchronization of refunds from Shopify to NetSuite
 * Creates credit memos in NetSuite for Shopify refunds
 */
export class RefundSyncService {
  private currencyService: CurrencyService;
  private baseCurrency: string = 'USD';

  constructor(
    private supabase: SupabaseClient,
    private netsuiteClient: NetSuiteClient,
    private userId: string
  ) {
    this.currencyService = new CurrencyService(supabase);
  }

  /**
   * Sync a single refund from Shopify to NetSuite
   */
  async syncRefund(shopifyRefund: any): Promise<void> {
    const startTime = Date.now();

    try {
      console.log(`[RefundSync] Processing refund ${shopifyRefund.id}`);

      // Step 1: Find the original order mapping
      const orderMapping = await this.findOrderMapping(shopifyRefund.order_id);

      // Step 2: Check if refund already exists
      const existingRefund = await this.checkExistingRefund(shopifyRefund.id.toString());
      if (existingRefund?.sync_status === 'synced') {
        console.log(`[RefundSync] Refund ${shopifyRefund.id} already synced`);
        return;
      }

      // Step 3: Calculate currency conversion if needed
      const refundAmount = parseFloat(shopifyRefund.total || shopifyRefund.amount || '0');
      const refundCurrency = shopifyRefund.currency || orderMapping.currency || 'USD';
      
      let convertedAmount = refundAmount;
      let exchangeRate = 1.0;

      if (refundCurrency !== this.baseCurrency) {
        try {
          const conversionData = await this.currencyService.getConversionData(
            refundAmount,
            refundCurrency,
            this.baseCurrency
          );
          convertedAmount = conversionData.convertedAmount;
          exchangeRate = conversionData.exchangeRate;
          console.log(`[RefundSync] Currency conversion: ${refundAmount} ${refundCurrency} = ${convertedAmount} ${this.baseCurrency}`);
        } catch (error) {
          console.error(`[RefundSync] Currency conversion failed:`, error);
        }
      }

      // Step 4: Create or update refund mapping
      const refundMappingId = await this.createRefundMapping({
        orderMapping,
        shopifyRefund,
        refundAmount,
        refundCurrency,
        exchangeRate,
        convertedAmount,
        existingRefund,
      });

      // Step 5: Create credit memo in NetSuite
      const creditMemoData = await this.buildCreditMemoData(
        shopifyRefund,
        orderMapping,
        refundAmount
      );

      const netsuiteCreditmemoId = await this.netsuiteClient.createCreditMemo(creditMemoData);

      // Step 6: Update refund mapping with NetSuite credit memo ID
      await this.supabase
        .from('refund_mappings')
        .update({
          netsuite_credit_memo_id: netsuiteCreditmemoId,
          sync_status: 'synced',
          last_synced: new Date().toISOString(),
          processed_at: new Date().toISOString(),
          error_message: null,
        })
        .eq('id', refundMappingId);

      const processingTime = Date.now() - startTime;
      console.log(`[RefundSync] Successfully synced refund ${shopifyRefund.id} to NetSuite credit memo ${netsuiteCreditmemoId} in ${processingTime}ms`);
    } catch (error) {
      console.error(`[RefundSync] Failed to sync refund ${shopifyRefund.id}:`, error);
      
      // Update refund mapping with error
      if (shopifyRefund.id) {
        await this.updateRefundError(shopifyRefund.id.toString(), error);
      }

      throw error;
    }
  }

  /**
   * Find the original order mapping for the refund
   */
  private async findOrderMapping(shopifyOrderId: string | number): Promise<any> {
    const { data, error } = await this.supabase
      .from('order_mappings')
      .select('*')
      .eq('user_id', this.userId)
      .eq('shopify_order_id', shopifyOrderId.toString())
      .single();

    if (error || !data) {
      throw new Error(`Original order not found for order ID ${shopifyOrderId}`);
    }

    if (!data.netsuite_sales_order_id) {
      throw new Error(`Order ${shopifyOrderId} has not been synced to NetSuite yet`);
    }

    return data;
  }

  /**
   * Check if refund already exists
   */
  private async checkExistingRefund(shopifyRefundId: string): Promise<any> {
    const { data } = await this.supabase
      .from('refund_mappings')
      .select('*')
      .eq('user_id', this.userId)
      .eq('shopify_refund_id', shopifyRefundId)
      .maybeSingle();

    return data;
  }

  /**
   * Create or update refund mapping
   */
  private async createRefundMapping(params: {
    orderMapping: any;
    shopifyRefund: any;
    refundAmount: number;
    refundCurrency: string;
    exchangeRate: number;
    convertedAmount: number;
    existingRefund: any;
  }): Promise<string> {
    const {
      orderMapping,
      shopifyRefund,
      refundAmount,
      refundCurrency,
      exchangeRate,
      convertedAmount,
      existingRefund,
    } = params;

    // Determine refund type
    const refundType = this.determineRefundType(shopifyRefund, orderMapping);

    const refundData = {
      user_id: this.userId,
      order_mapping_id: orderMapping.id,
      shopify_refund_id: shopifyRefund.id.toString(),
      refund_number: shopifyRefund.name || `#${shopifyRefund.id}`,
      refund_amount: refundAmount,
      currency: refundCurrency,
      exchange_rate: exchangeRate,
      converted_amount: convertedAmount,
      reason: shopifyRefund.note || null,
      refund_type: refundType,
      restocking_fee: parseFloat(shopifyRefund.restocking_fee || '0'),
      line_items: shopifyRefund.refund_line_items || [],
      refund_date: shopifyRefund.created_at || new Date().toISOString(),
      sync_status: 'pending',
      metadata: {
        shopify_order_id: shopifyRefund.order_id,
        shopify_order_number: orderMapping.shopify_order_number,
        transactions: shopifyRefund.transactions || [],
      },
    };

    if (existingRefund) {
      await this.supabase
        .from('refund_mappings')
        .update(refundData)
        .eq('id', existingRefund.id);

      return existingRefund.id;
    } else {
      const { data, error } = await this.supabase
        .from('refund_mappings')
        .insert(refundData)
        .select('id')
        .single();

      if (error) {
        throw new Error(`Failed to create refund mapping: ${error.message}`);
      }

      return data.id;
    }
  }

  /**
   * Build NetSuite credit memo data
   */
  private async buildCreditMemoData(
    shopifyRefund: any,
    orderMapping: any,
    refundAmount: number
  ): Promise<any> {
    // Get customer from order mapping
    const { data: customerMapping } = await this.supabase
      .from('customer_mappings')
      .select('netsuite_customer_id')
      .eq('user_id', this.userId)
      .eq('shopify_customer_id', orderMapping.metadata?.customer_id || '')
      .maybeSingle();

    // Map refund line items to NetSuite items
    const refundLineItems = await this.mapRefundLineItems(
      shopifyRefund.refund_line_items || [],
      orderMapping.id
    );

    return {
      customer: customerMapping?.netsuite_customer_id,
      createdFrom: orderMapping.netsuite_sales_order_id,
      tranDate: shopifyRefund.created_at || new Date().toISOString(),
      memo: shopifyRefund.note || `Refund for Shopify order ${orderMapping.shopify_order_number}`,
      items: refundLineItems,
      total: refundAmount,
      currency: shopifyRefund.currency || 'USD',
      customFields: {
        shopify_refund_id: shopifyRefund.id.toString(),
        shopify_order_number: orderMapping.shopify_order_number,
      },
    };
  }

  /**
   * Map Shopify refund line items to NetSuite line items
   */
  private async mapRefundLineItems(
    refundLineItems: any[],
    orderMappingId: string
  ): Promise<any[]> {
    const mappedItems = [];

    for (const refundItem of refundLineItems) {
      try {
        // Find the original order line item
        const { data: orderLineItem } = await this.supabase
          .from('order_line_mappings')
          .select('*')
          .eq('order_mapping_id', orderMappingId)
          .eq('shopify_line_item_id', refundItem.line_item_id.toString())
          .maybeSingle();

        if (orderLineItem) {
          // Find product mapping
          const { data: productMapping } = await this.supabase
            .from('item_mappings')
            .select('netsuite_product_id')
            .eq('id', orderLineItem.product_mapping_id)
            .maybeSingle();

          if (productMapping) {
            mappedItems.push({
              item: productMapping.netsuite_product_id,
              quantity: refundItem.quantity,
              rate: parseFloat(refundItem.subtotal) / refundItem.quantity,
              amount: parseFloat(refundItem.subtotal),
            });
          }
        }
      } catch (error) {
        console.error(`[RefundSync] Error mapping refund line item:`, error);
      }
    }

    return mappedItems;
  }

  /**
   * Determine refund type based on line items
   */
  private determineRefundType(shopifyRefund: any, orderMapping: any): string {
    const refundAmount = parseFloat(shopifyRefund.total || shopifyRefund.amount || '0');
    const orderTotal = parseFloat(orderMapping.total_amount || '0');

    // Full refund if amounts match
    if (Math.abs(refundAmount - orderTotal) < 0.01) {
      return 'full';
    }

    // Partial refund
    return 'partial';
  }

  /**
   * Update refund mapping with error
   */
  private async updateRefundError(shopifyRefundId: string, error: any): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : String(error);

    await this.supabase
      .from('refund_mappings')
      .update({
        sync_status: 'failed',
        error_message: errorMessage,
        last_synced: new Date().toISOString(),
      })
      .eq('user_id', this.userId)
      .eq('shopify_refund_id', shopifyRefundId);
  }

  /**
   * Retry failed refund syncs
   */
  async retryFailedRefunds(limit: number = 10): Promise<number> {
    // Get failed refunds
    const { data: failedRefunds, error } = await this.supabase
      .from('refund_mappings')
      .select('*')
      .eq('user_id', this.userId)
      .eq('sync_status', 'failed')
      .limit(limit);

    if (error || !failedRefunds) {
      throw new Error(`Failed to fetch failed refunds: ${error?.message}`);
    }

    let successCount = 0;

    for (const refund of failedRefunds) {
      try {
        // Reconstruct Shopify refund object from metadata
        const shopifyRefund = {
          id: refund.shopify_refund_id,
          order_id: refund.metadata?.shopify_order_id,
          total: refund.refund_amount,
          currency: refund.currency,
          note: refund.reason,
          created_at: refund.refund_date,
          refund_line_items: refund.line_items,
        };

        await this.syncRefund(shopifyRefund);
        successCount++;
      } catch (error) {
        console.error(`[RefundSync] Retry failed for refund ${refund.id}:`, error);
      }
    }

    console.log(`[RefundSync] Retried ${failedRefunds.length} refunds, ${successCount} succeeded`);
    return successCount;
  }

  /**
   * Static factory method to create service from connections
   */
  static async fromConnections(
    supabase: SupabaseClient,
    userId: string
  ): Promise<RefundSyncService> {
    // Fetch NetSuite connection
    const { data: netsuiteConn, error } = await supabase
      .from('connections')
      .select('*')
      .eq('user_id', userId)
      .eq('platform', 'netsuite')
      .single();

    if (error || !netsuiteConn) {
      throw new Error('NetSuite connection is required for refund sync');
    }

    const netsuiteClient = await NetSuiteClient.fromConnection(netsuiteConn, supabase);

    return new RefundSyncService(supabase, netsuiteClient, userId);
  }
}

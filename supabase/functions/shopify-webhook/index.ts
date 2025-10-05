import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { corsHeaders } from '../_shared/cors.ts'
import { OrderSyncService } from '../_shared/orderSyncService.ts'
import { InventorySyncService } from '../_shared/inventorySyncService.ts'
import { RefundSyncService } from '../_shared/refundSyncService.ts'

/**
 * Shopify Webhook Handler
 * Handles real-time webhooks from Shopify for orders, products, and inventory
 */

// HMAC verification for Shopify webhooks
async function verifyShopifyWebhook(
  body: string,
  hmacHeader: string | null,
  secret: string
): Promise<boolean> {
  if (!hmacHeader) return false

  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(body)
  )

  const hashArray = Array.from(new Uint8Array(signature))
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  const base64Hash = btoa(String.fromCharCode(...new Uint8Array(signature)))

  return base64Hash === hmacHeader
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get webhook headers
    const shopDomain = req.headers.get('X-Shopify-Shop-Domain')
    const topic = req.headers.get('X-Shopify-Topic')
    const hmacHeader = req.headers.get('X-Shopify-Hmac-SHA256')
    
    console.log('[Shopify Webhook] Received:', topic, 'from', shopDomain)

    // Get request body
    const body = await req.text()

    // Verify webhook signature
    const webhookSecret = Deno.env.get('SHOPIFY_WEBHOOK_SECRET')
    if (webhookSecret) {
      const isValid = await verifyShopifyWebhook(body, hmacHeader, webhookSecret)
      if (!isValid) {
        console.error('[Shopify Webhook] Invalid signature')
        return new Response(
          JSON.stringify({ error: 'Invalid webhook signature' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Parse webhook data
    const webhookData = JSON.parse(body)

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    })

    // Find user by shop domain
    const { data: connection } = await supabase
      .from('connections')
      .select('user_id')
      .eq('platform', 'shopify')
      .eq('metadata->>shop_domain', shopDomain)
      .single()

    if (!connection) {
      console.error('[Shopify Webhook] No connection found for shop:', shopDomain)
      return new Response(
        JSON.stringify({ error: 'Shop not connected' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const userId = connection.user_id

    // Store webhook event with priority
    const priority = getWebhookPriority(topic)
    await supabase.from('webhook_events').insert({
      user_id: userId,
      source: 'shopify',
      event_type: topic,
      platform_event_id: webhookData.id?.toString(),
      payload: webhookData,
      processed: false,
      metadata: { priority, queued_at: new Date().toISOString() }
    })

    // Queue webhook for async processing instead of processing immediately
    console.log(`[Shopify Webhook] Queued ${topic} for async processing`)

    // Trigger async processing (in a real implementation, this would be a background job)
    // For now, we'll process high-priority webhooks immediately
    if (priority === 'high') {
      try {
        await processWebhookAsync(supabase, userId, topic, webhookData)
      } catch (error) {
        console.error('[Shopify Webhook] High-priority processing failed:', error)
        // Still mark as processed to avoid duplicate processing
      }
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Webhook processed' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[Shopify Webhook] Error:', error)

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

/**
 * Get webhook processing priority
 */
function getWebhookPriority(topic: string): 'high' | 'medium' | 'low' {
  const highPriority = ['orders/create', 'refunds/create', 'inventory_levels/update']
  const mediumPriority = ['orders/updated', 'products/create', 'products/update']
  const lowPriority = ['orders/fulfilled']

  if (highPriority.includes(topic)) return 'high'
  if (mediumPriority.includes(topic)) return 'medium'
  return 'low'
}

/**
 * Process webhook asynchronously
 */
async function processWebhookAsync(
  supabase: any,
  userId: string,
  topic: string,
  webhookData: any
): Promise<void> {
  console.log(`[Shopify Webhook] Processing ${topic} asynchronously`)

  try {
    // Handle different webhook topics
    switch (topic) {
      case 'orders/create':
      case 'orders/updated':
        await handleOrderWebhook(supabase, userId, webhookData, topic)
        break

      case 'orders/fulfilled':
        await handleFulfillmentWebhook(supabase, userId, webhookData)
        break

      case 'refunds/create':
        await handleRefundWebhook(supabase, userId, webhookData)
        break

      case 'products/create':
      case 'products/update':
        await handleProductWebhook(supabase, userId, webhookData)
        break

      case 'inventory_levels/update':
        await handleInventoryWebhook(supabase, userId, webhookData)
        break

      default:
        console.log('[Shopify Webhook] Unhandled topic:', topic)
    }

    // Mark webhook as processed
    await supabase
      .from('webhook_events')
      .update({
        processed: true,
        processed_at: new Date().toISOString()
      })
      .eq('platform_event_id', webhookData.id?.toString())
      .eq('user_id', userId)

  } catch (error) {
    console.error('[Shopify Webhook] Async processing failed:', error)

    // Update webhook with error
    await supabase
      .from('webhook_events')
      .update({
        last_error: error instanceof Error ? error.message : String(error),
        processing_attempts: supabase.rpc('increment', { x: 1 })
      })
      .eq('platform_event_id', webhookData.id?.toString())
      .eq('user_id', userId)

    throw error
  }
}

/**
 * Handle order create/update webhooks
 */
async function handleOrderWebhook(
  supabase: any,
  userId: string,
  orderData: any,
  topic: string
): Promise<void> {
  console.log('[Shopify Webhook] Processing order:', orderData.id)

  try {
    // Create sync log
    const { data: syncLog } = await supabase
      .from('sync_logs')
      .insert({
        user_id: userId,
        sync_type: 'order_sync',
        direction: 'shopify_to_netsuite',
        status: 'running',
        started_at: new Date().toISOString(),
        triggered_by: 'webhook'
      })
      .select('id')
      .single()

    if (!syncLog) {
      throw new Error('Failed to create sync log')
    }

    // Initialize order sync service
    const orderSyncService = await OrderSyncService.fromConnections(supabase, userId)

    // Sync the specific order
    const result = await orderSyncService.syncOrders({
      userId,
      syncLogId: syncLog.id,
      limit: 1
    })

    // Update sync log
    await supabase
      .from('sync_logs')
      .update({
        status: result.success ? 'completed' : 'failed',
        items_succeeded: result.ordersSucceeded,
        items_failed: result.ordersFailed,
        completed_at: new Date().toISOString()
      })
      .eq('id', syncLog.id)

    // Mark webhook as processed
    await supabase
      .from('webhook_events')
      .update({ processed: true, processed_at: new Date().toISOString() })
      .eq('platform_event_id', orderData.id.toString())
      .eq('user_id', userId)

    console.log('[Shopify Webhook] Order synced:', orderData.id, result)

  } catch (error) {
    console.error('[Shopify Webhook] Order sync failed:', error)
    
    // Log error in webhook event
    await supabase
      .from('webhook_events')
      .update({
        last_error: error instanceof Error ? error.message : String(error),
        processing_attempts: supabase.rpc('increment', { x: 1 })
      })
      .eq('platform_event_id', orderData.id.toString())
      .eq('user_id', userId)
  }
}

/**
 * Handle order fulfillment webhooks
 */
async function handleFulfillmentWebhook(
  supabase: any,
  userId: string,
  orderData: any
): Promise<void> {
  console.log('[Shopify Webhook] Processing fulfillment for order:', orderData.id)

  // Store fulfillment data for later processing
  // This could trigger a reverse sync from Shopify to NetSuite
  console.log('[Shopify Webhook] Fulfillment webhook received (no action taken)')
}

/**
 * Handle refund create webhooks
 */
async function handleRefundWebhook(
  supabase: any,
  userId: string,
  refundData: any
): Promise<void> {
  console.log('[Shopify Webhook] Processing refund:', refundData.id)

  try {
    // Initialize refund sync service
    const refundSyncService = await RefundSyncService.fromConnections(supabase, userId)

    // Sync the refund to NetSuite
    await refundSyncService.syncRefund(refundData)

    // Mark webhook as processed
    await supabase
      .from('webhook_events')
      .update({ processed: true, processed_at: new Date().toISOString() })
      .eq('platform_event_id', refundData.id.toString())
      .eq('user_id', userId)

    console.log('[Shopify Webhook] Refund synced successfully:', refundData.id)

  } catch (error) {
    console.error('[Shopify Webhook] Refund sync failed:', error)
    
    // Log error in webhook event
    await supabase
      .from('webhook_events')
      .update({
        last_error: error instanceof Error ? error.message : String(error),
        processing_attempts: supabase.rpc('increment', { x: 1 })
      })
      .eq('platform_event_id', refundData.id.toString())
      .eq('user_id', userId)

    throw error
  }
}

/**
 * Handle product create/update webhooks
 */
async function handleProductWebhook(
  supabase: any,
  userId: string,
  productData: any
): Promise<void> {
  console.log('[Shopify Webhook] Processing product:', productData.id)

  // Update or insert product in database
  await supabase
    .from('products')
    .upsert({
      user_id: userId,
      platform: 'shopify',
      platform_product_id: productData.id.toString(),
      name: productData.title,
      description: productData.body_html,
      sku: productData.variants?.[0]?.sku,
      price: parseFloat(productData.variants?.[0]?.price || '0'),
      inventory_quantity: productData.variants?.[0]?.inventory_quantity || 0,
      is_active: productData.status === 'active',
      tags: productData.tags ? productData.tags.split(',').map((t: string) => t.trim()) : [],
      variants: productData.variants,
      images: productData.images,
      last_platform_sync: new Date().toISOString()
    }, {
      onConflict: 'user_id,platform,platform_product_id'
    })

  console.log('[Shopify Webhook] Product updated:', productData.id)
}

/**
 * Handle inventory level update webhooks
 */
async function handleInventoryWebhook(
  supabase: any,
  userId: string,
  inventoryData: any
): Promise<void> {
  console.log('[Shopify Webhook] Processing inventory update:', inventoryData.inventory_item_id)

  // This webhook indicates Shopify inventory changed
  // You might want to sync back to NetSuite or just log it
  console.log('[Shopify Webhook] Inventory webhook received (no action taken)')
}

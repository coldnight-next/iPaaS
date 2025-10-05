import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { withCors } from '../_shared/cors.ts'
import { createSupabaseClient, getUserFromRequest } from '../_shared/supabaseClient.ts'
import { NetSuiteClient } from '../_shared/netsuiteClient.ts'

interface AddItemRequest {
  itemId: string
  syncDirection: 'netsuite_to_shopify' | 'shopify_to_netsuite' | 'bidirectional'
  syncMode?: 'delta' | 'full'
}

serve(async req => {
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
    console.error('[add-item-to-sync] Unexpected auth error', error)
    return corsJsonHeaders(500, { error: 'internal_error', message: 'Unable to authenticate request' })
  }

  let body: AddItemRequest | null = null
  try {
    body = await req.json()
  } catch (_error) {
    return corsJsonHeaders(400, { error: 'invalid_payload', message: 'Body must be valid JSON' })
  }

  if (!body?.itemId || !body?.syncDirection) {
    return corsJsonHeaders(400, { error: 'invalid_payload', message: 'itemId and syncDirection are required' })
  }

  const supabase = createSupabaseClient()

  try {
    // Get user connections
    const { data: connections, error: connectionsError } = await supabase
      .from('connections')
      .select('*')
      .eq('user_id', auth.user.id)
      .eq('status', 'connected')

    if (connectionsError) {
      console.error('[add-item-to-sync] Failed to fetch connections', connectionsError)
      return corsJsonHeaders(500, { error: 'database_error', message: 'Failed to fetch connections' })
    }

    if (!connections || connections.length === 0) {
      return corsJsonHeaders(400, { error: 'no_connections', message: 'No active connections found' })
    }

    const netsuiteConnection = connections.find(c => c.platform === 'netsuite')
    const shopifyConnection = connections.find(c => c.platform === 'shopify')

    if (!netsuiteConnection) {
      return corsJsonHeaders(400, { error: 'missing_connections', message: 'NetSuite connection is required' })
    }

    // Initialize NetSuite client
    let netsuiteClient: NetSuiteClient
    try {
      netsuiteClient = await NetSuiteClient.fromConnection(netsuiteConnection)
    } catch (error) {
      console.error('[add-item-to-sync] Failed to initialize NetSuite client', error)
      return corsJsonHeaders(500, {
        error: 'client_init_error',
        message: error instanceof Error ? error.message : 'Failed to initialize NetSuite client'
      })
    }

    // Fetch the item from NetSuite
    let netsuiteItem
    try {
      netsuiteItem = await netsuiteClient.getItem(body.itemId)
      console.log('[add-item-to-sync] Fetched item from NetSuite:', netsuiteItem.itemId)
    } catch (error) {
      console.error('[add-item-to-sync] Failed to fetch item from NetSuite:', error)
      return corsJsonHeaders(404, {
        error: 'item_not_found',
        message: `Item ${body.itemId} not found in NetSuite or access denied`
      })
    }

    // Check if item already exists in products table
    const { data: existingProduct } = await supabase
      .from('products')
      .select('id')
      .eq('user_id', auth.user.id)
      .eq('platform', 'netsuite')
      .eq('platform_product_id', netsuiteItem.internalId)
      .single()

    let productId: string

    if (existingProduct) {
      // Update existing product
      productId = existingProduct.id
      await supabase
        .from('products')
        .update({
          sku: netsuiteItem.itemId,
          name: netsuiteItem.displayName,
          description: netsuiteItem.description,
          price: netsuiteItem.basePrice,
          inventory_quantity: netsuiteItem.quantityAvailable || 0,
          is_active: !netsuiteItem.isInactive,
          last_platform_sync: new Date().toISOString()
        })
        .eq('id', productId)
    } else {
      // Insert new product
      const { data: newProduct, error: insertError } = await supabase
        .from('products')
        .insert({
          user_id: auth.user.id,
          platform: 'netsuite',
          platform_product_id: netsuiteItem.internalId,
          sku: netsuiteItem.itemId,
          name: netsuiteItem.displayName,
          description: netsuiteItem.description,
          price: netsuiteItem.basePrice,
          inventory_quantity: netsuiteItem.quantityAvailable || 0,
          is_active: !netsuiteItem.isInactive,
          last_platform_sync: new Date().toISOString()
        })
        .select('id')
        .single()

      if (insertError) {
        console.error('[add-item-to-sync] Failed to insert product:', insertError)
        return corsJsonHeaders(500, { error: 'database_error', message: 'Failed to save product' })
      }

      productId = newProduct.id
    }

    // Add to sync list
    const { data: syncItem, error: syncError } = await supabase
      .from('sync_list')
      .insert({
        user_id: auth.user.id,
        netsuite_item_id: netsuiteItem.internalId,
        shopify_product_id: null, // Will be set when synced to Shopify
        sku: netsuiteItem.itemId,
        product_name: netsuiteItem.displayName || netsuiteItem.itemId,
        sync_direction: body.syncDirection,
        sync_mode: body.syncMode || 'delta',
        is_active: true,
        priority: 1
      })
      .select()
      .single()

    if (syncError) {
      console.error('[add-item-to-sync] Failed to add to sync list:', syncError)
      return corsJsonHeaders(500, { error: 'database_error', message: 'Failed to add item to sync list' })
    }

    console.log('[add-item-to-sync] Successfully added item to sync list:', syncItem.id)

    return corsJsonHeaders(200, {
      success: true,
      item: {
        id: syncItem.id,
        sku: netsuiteItem.itemId,
        name: netsuiteItem.displayName,
        syncDirection: body.syncDirection,
        syncMode: body.syncMode || 'delta'
      },
      message: `Item ${netsuiteItem.itemId} added to sync list successfully`
    })

  } catch (error) {
    console.error('[add-item-to-sync] Unexpected error:', error)
    return corsJsonHeaders(500, { error: 'internal_error', message: 'Add item to sync list failed unexpectedly' })
  }
})
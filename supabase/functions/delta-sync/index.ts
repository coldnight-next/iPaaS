import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { withCors } from '../_shared/cors.ts'
import { createSupabaseClient, getUserFromRequest } from '../_shared/supabaseClient.ts'
import { NetSuiteClient } from '../_shared/netsuiteClient.ts'
import { ShopifyClient } from '../_shared/shopifyClient.ts'

interface DeltaSyncRequest {
  syncListIds?: string[] // Specific sync list items to process
  itemType?: 'product' | 'order' | 'inventory'
}

interface DeltaSyncResult {
  syncHistoryId: string
  status: 'completed' | 'failed' | 'partial_success'
  itemsProcessed: number
  itemsCreated: number
  itemsUpdated: number
  itemsFailed: number
  duration: number
  errors: Array<{ itemId: string; error: string }>
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
    console.error('[delta-sync] Unexpected auth error', error)
    return corsJsonHeaders(500, { error: 'internal_error', message: 'Unable to authenticate request' })
  }

  let body: DeltaSyncRequest = {}
  try {
    body = await req.json()
  } catch (_error) {
    // Empty body is acceptable
  }

  const supabase = createSupabaseClient()
  const startTime = Date.now()

  try {
    // Get active sync list items
    let query = supabase
      .from('sync_list')
      .select('*')
      .eq('user_id', auth.user.id)
      .eq('is_active', true)
      .eq('sync_mode', 'delta')

    if (body.syncListIds && body.syncListIds.length > 0) {
      query = query.in('id', body.syncListIds)
    }

    if (body.itemType) {
      query = query.eq('item_type', body.itemType)
    }

    const { data: syncListItems, error: syncListError } = await query

    if (syncListError) {
      console.error('[delta-sync] Failed to fetch sync list', syncListError)
      return corsJsonHeaders(500, { error: 'database_error', message: 'Failed to fetch sync list' })
    }

    if (!syncListItems || syncListItems.length === 0) {
      return corsJsonHeaders(400, { error: 'no_items', message: 'No active sync list items found' })
    }

    // Get user connections
    const { data: connections, error: connectionsError } = await supabase
      .from('connections')
      .select('*')
      .eq('user_id', auth.user.id)
      .eq('status', 'connected')

    if (connectionsError) {
      console.error('[delta-sync] Failed to fetch connections', connectionsError)
      return corsJsonHeaders(500, { error: 'database_error', message: 'Failed to fetch connections' })
    }

    if (!connections || connections.length === 0) {
      return corsJsonHeaders(400, { error: 'no_connections', message: 'No active connections found' })
    }

    const netsuiteConnection = connections.find(c => c.platform === 'netsuite')
    const shopifyConnection = connections.find(c => c.platform === 'shopify')

    if (!netsuiteConnection || !shopifyConnection) {
      return corsJsonHeaders(400, { error: 'missing_connections', message: 'Both NetSuite and Shopify connections are required' })
    }

    // Initialize API clients
    const netsuiteClient = await NetSuiteClient.fromConnection(netsuiteConnection)
    const shopifyClient = await ShopifyClient.fromConnection(shopifyConnection)

    const result: DeltaSyncResult = {
      syncHistoryId: '',
      status: 'completed',
      itemsProcessed: 0,
      itemsCreated: 0,
      itemsUpdated: 0,
      itemsFailed: 0,
      duration: 0,
      errors: []
    }

    // Process each sync list item
    for (const syncItem of syncListItems) {
      try {
        result.itemsProcessed++

        // Check if item has changed since last sync
        const lastSyncedAt = syncItem.last_synced_at
        let hasChanged = false

        if (syncItem.source_platform === 'netsuite') {
          // Fetch from NetSuite and check if modified
          const sourceItem = await netsuiteClient.getProduct(syncItem.source_id)
          
          if (!lastSyncedAt || (sourceItem.lastModified && new Date(sourceItem.lastModified) > new Date(lastSyncedAt))) {
            hasChanged = true
            
            // Sync to Shopify
            if (syncItem.target_id) {
              // Update existing
              await shopifyClient.updateProduct(syncItem.target_id, sourceItem)
              result.itemsUpdated++
            } else {
              // Create new
              const newProduct = await shopifyClient.createProduct(sourceItem)
              result.itemsCreated++
              
              // Update sync list with target_id
              await supabase
                .from('sync_list')
                .update({ target_id: newProduct.id })
                .eq('id', syncItem.id)
            }
          }
        } else if (syncItem.source_platform === 'shopify') {
          // Fetch from Shopify and check if modified
          const sourceItem = await shopifyClient.getProduct(syncItem.source_id)
          
          if (!lastSyncedAt || (sourceItem.updated_at && new Date(sourceItem.updated_at) > new Date(lastSyncedAt))) {
            hasChanged = true
            
            // Sync to NetSuite
            if (syncItem.target_id) {
              // Update existing
              await netsuiteClient.updateProduct(syncItem.target_id, sourceItem)
              result.itemsUpdated++
            } else {
              // Create new
              const newProduct = await netsuiteClient.createProduct(sourceItem)
              result.itemsCreated++
              
              // Update sync list with target_id
              await supabase
                .from('sync_list')
                .update({ target_id: newProduct.internalId })
                .eq('id', syncItem.id)
            }
          }
        }

        // Update sync list item with last sync time and status
        if (hasChanged) {
          await supabase
            .from('sync_list')
            .update({
              last_synced_at: new Date().toISOString(),
              last_sync_status: 'success'
            })
            .eq('id', syncItem.id)
        }

      } catch (error) {
        console.error(`[delta-sync] Error syncing item ${syncItem.id}:`, error)
        result.itemsFailed++
        result.errors.push({
          itemId: syncItem.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        })

        // Update sync list item with failure status
        await supabase
          .from('sync_list')
          .update({
            last_sync_status: 'failed',
            error_message: error instanceof Error ? error.message : 'Unknown error'
          })
          .eq('id', syncItem.id)
      }
    }

    result.duration = Date.now() - startTime
    result.status = result.itemsFailed === 0 ? 'completed' : 
                    result.itemsSucceeded > 0 ? 'partial_success' : 'failed'

    // Create sync history record
    const { data: syncHistory, error: syncHistoryError } = await supabase
      .from('sync_history')
      .insert({
        user_id: auth.user.id,
        sync_type: 'delta',
        status: result.status,
        items_processed: result.itemsProcessed,
        items_created: result.itemsCreated,
        items_updated: result.itemsUpdated,
        items_failed: result.itemsFailed,
        duration_ms: result.duration,
        metadata: {
          syncListIds: body.syncListIds,
          itemType: body.itemType,
          errors: result.errors
        }
      })
      .select()
      .single()

    if (syncHistoryError) {
      console.error('[delta-sync] Failed to create sync history', syncHistoryError)
    } else {
      result.syncHistoryId = syncHistory.id
    }

    return corsJsonHeaders(200, result)

  } catch (error) {
    console.error('[delta-sync] Unexpected error', error)
    return corsJsonHeaders(500, {
      error: 'sync_error',
      message: error instanceof Error ? error.message : 'Delta sync failed'
    })
  }
})

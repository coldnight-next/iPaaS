import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { withCors } from '../_shared/cors.ts'
import { createSupabaseClient, getUserFromRequest } from '../_shared/supabaseClient.ts'
import { NetSuiteClient } from '../_shared/netsuiteClient.ts'
import { ShopifyClient } from '../_shared/shopifyClient.ts'
import { ProductSyncService, InventorySyncService, OrderSyncService, type SyncContext } from '../_shared/syncServices.ts'
import { monitoringService } from '../_shared/monitoringService.ts'

interface SyncProfile {
  id: string
  name: string
  dataTypes: {
    products: boolean
    inventory: boolean
    orders: boolean
  }
  syncDirection: 'netsuite_to_shopify' | 'shopify_to_netsuite' | 'bidirectional'
  filters: {
    productCategories: string[]
    orderStatuses: string[]
  }
}

interface SyncResult {
  syncLogId: string
  status: 'completed' | 'failed' | 'partial_success'
  itemsProcessed: number
  itemsSucceeded: number
  itemsFailed: number
  duration: number
  errors: string[]
}

serve(async req => {
  const origin = req.headers.get('origin')

  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: withCors({ 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' }, origin)
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
    console.error('[sync] Unexpected auth error', error)
    return corsJsonHeaders(500, { error: 'internal_error', message: 'Unable to authenticate request' })
  }

  let body: { profileId?: string; profile?: SyncProfile } | null = null
  try {
    body = await req.json()
  } catch (_error) {
    return corsJsonHeaders(400, { error: 'invalid_payload', message: 'Body must be valid JSON' })
  }

  if (!body?.profileId && !body?.profile) {
    return corsJsonHeaders(400, { error: 'invalid_payload', message: 'Either profileId or profile is required' })
  }

  const supabase = createSupabaseClient()
  const startTime = Date.now()

  try {
    // Check for running syncs to prevent concurrent operations
    const { data: runningSyncs, error: runningSyncsError } = await supabase
      .from('sync_logs')
      .select('id')
      .eq('user_id', auth.user.id)
      .eq('status', 'running')
      .limit(1)

    if (runningSyncsError) {
      console.error('[sync] Error checking running syncs:', runningSyncsError)
      return corsJsonHeaders(500, { error: 'database_error', message: 'Failed to check running syncs' })
    }

    if (runningSyncs && runningSyncs.length > 0) {
      return corsJsonHeaders(409, {
        error: 'sync_in_progress',
        message: 'A sync operation is already running. Please wait for it to complete.'
      })
    }

    // Get user connections
    const { data: connections, error: connectionsError } = await supabase
      .from('connections')
      .select('*')
      .eq('user_id', auth.user.id)
      .eq('status', 'connected')

    if (connectionsError) {
      console.error('[sync] Failed to fetch connections', connectionsError)
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

    // Get or use provided profile
    let profile: SyncProfile
    if (body.profileId) {
      // For now, we'll use a default profile since profiles are stored in frontend state
      // In a real implementation, profiles would be stored in the database
      profile = {
        id: 'default',
        name: 'Default Profile',
        dataTypes: { products: true, inventory: true, orders: true },
        syncDirection: 'bidirectional',
        filters: { productCategories: [], orderStatuses: ['paid', 'fulfilled'] }
      }
    } else {
      profile = body.profile!
    }

    // Create sync log
    const { data: syncLog, error: syncLogError } = await supabase
      .from('sync_logs')
      .insert({
        user_id: auth.user.id,
        sync_type: 'manual',
        direction: profile.syncDirection,
        status: 'running',
        started_at: new Date().toISOString(),
        triggered_by: 'api'
      })
      .select()
      .single()

    if (syncLogError) {
      console.error('[sync] Failed to create sync log', syncLogError)
      return corsJsonHeaders(500, { error: 'database_error', message: 'Failed to create sync log' })
    }

    const result: SyncResult = {
      syncLogId: syncLog.id,
      status: 'completed',
      itemsProcessed: 0,
      itemsSucceeded: 0,
      itemsFailed: 0,
      duration: 0,
      errors: []
    }

    // Initialize API clients
    let netsuiteClient: NetSuiteClient
    let shopifyClient: ShopifyClient

    try {
      netsuiteClient = await NetSuiteClient.fromConnection(netsuiteConnection)
      shopifyClient = await ShopifyClient.fromConnection(shopifyConnection)
    } catch (error) {
      console.error('[sync] Failed to initialize API clients', error)
      return corsJsonHeaders(500, {
        error: 'client_init_error',
        message: error instanceof Error ? error.message : 'Failed to initialize API clients'
      })
    }

    // Create sync context
    const syncContext: SyncContext = {
      supabase,
      userId: auth.user.id,
      syncLogId: syncLog.id,
      netsuiteClient,
      shopifyClient
    }

    // Start monitoring session
    const sessionId = await monitoringService.startSession({
      userId: auth.user.id,
      syncLogId: syncLog.id,
      syncType: profile.syncDirection,
      direction: profile.syncDirection,
      totalItems: 0 // Will be updated as we process
    })

    // Execute sync based on profile
    try {
      if (profile.dataTypes.products) {
        const productService = new ProductSyncService(syncContext)
        const productResult = await productService.syncProducts(profile.syncDirection)
        result.itemsProcessed += productResult.processed
        result.itemsSucceeded += productResult.succeeded
        result.itemsFailed += productResult.failed
        result.errors.push(...productResult.errors)
      }

      if (profile.dataTypes.inventory) {
        const inventoryService = new InventorySyncService(syncContext)
        const inventoryResult = await inventoryService.syncInventory(profile.syncDirection)
        result.itemsProcessed += inventoryResult.processed
        result.itemsSucceeded += inventoryResult.succeeded
        result.itemsFailed += inventoryResult.failed
        result.errors.push(...inventoryResult.errors)
      }

      if (profile.dataTypes.orders) {
        const orderService = new OrderSyncService(syncContext)
        const orderResult = await orderService.syncOrders(profile.syncDirection)
        result.itemsProcessed += orderResult.processed
        result.itemsSucceeded += orderResult.succeeded
        result.itemsFailed += orderResult.failed
        result.errors.push(...orderResult.errors)
      }

      result.status = result.itemsFailed === 0 ? 'completed' : result.itemsSucceeded > 0 ? 'partial_success' : 'failed'
    } catch (error) {
      console.error('[sync] Sync execution error', error)
      result.status = 'failed'
      result.errors.push(error instanceof Error ? error.message : 'Unknown sync error')

      // Create alert for sync failure
      await monitoringService.createAlert({
        userId: auth.user.id,
        alertType: 'sync_failure',
        severity: 'high',
        title: 'Sync Operation Failed',
        message: `Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        source: 'sync_engine'
      })
    }

    result.duration = Date.now() - startTime

    // Collect performance metrics
    const metrics = {
      totalDuration: result.duration,
      itemsPerSecond: result.itemsProcessed / (result.duration / 1000),
      successRate: result.itemsProcessed > 0 ? (result.itemsSucceeded / result.itemsProcessed) * 100 : 0,
      errorRate: result.itemsProcessed > 0 ? (result.itemsFailed / result.itemsProcessed) * 100 : 0,
      profile: profile.name,
      direction: profile.syncDirection,
      dataTypes: Object.keys(profile.dataTypes).filter(key => profile.dataTypes[key as keyof typeof profile.dataTypes])
    }

    console.log('[sync] Performance metrics:', metrics)

    // Update sync log with metrics
    await supabase
      .from('sync_logs')
      .update({
        status: result.status,
        items_processed: result.itemsProcessed,
        items_succeeded: result.itemsSucceeded,
        items_failed: result.itemsFailed,
        completed_at: new Date().toISOString(),
        duration_seconds: Math.round(result.duration / 1000),
        error_details: result.errors.length > 0 ? result.errors : null,
        // Store metrics in metadata (you might want to add a metrics column to sync_logs table)
        metadata: {
          performance: metrics,
          profile: profile,
          timestamp: new Date().toISOString()
        }
      })
      .eq('id', syncLog.id)

    // End monitoring session
    await monitoringService.endSession(sessionId)

    // Record performance metrics
    await monitoringService.recordPerformanceMetrics(auth.user.id)

    // Check for alerts
    await monitoringService.checkAndCreateAlerts(auth.user.id)

    return corsJsonHeaders(200, result)

  } catch (error) {
    console.error('[sync] Unexpected error', error)
    return corsJsonHeaders(500, { error: 'internal_error', message: 'Sync failed unexpectedly' })
  }
})


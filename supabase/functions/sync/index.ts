import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { withCors } from '../_shared/cors.ts'
import { createSupabaseClient, getUserFromRequest } from '../_shared/supabaseClient.ts'
import { NetSuiteClient } from '../_shared/netsuiteClient.ts'
import { ShopifyClient } from '../_shared/shopifyClient.ts'
import { ProductSyncService, InventorySyncService, OrderSyncService, type SyncContext } from '../_shared/syncServices.ts'
import { performanceMonitor } from '../_shared/performanceMonitor.ts'
import { monitoringService } from '../_shared/monitoringService.ts'
import { AISyncIntelligenceEngine, SyncIntelligenceContext } from '../_shared/aiSyncIntelligence.ts'
import { AdvancedErrorRecoverySystem } from '../_shared/advancedErrorRecovery.ts'
import { PredictivePerformanceOptimizer } from '../_shared/predictivePerformanceOptimizer.ts'
import { EventDrivenSyncEngine } from '../_shared/eventDrivenSync.ts'
import { AdvancedDataProcessingPipeline } from '../_shared/advancedDataProcessing.ts'

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
  return await performanceMonitor.monitorFunction('sync', async () => {
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

    // Initialize AI-powered systems
    const aiIntelligence = new AISyncIntelligenceEngine({
      supabase,
      userId: auth.user.id,
      syncLogId: syncLog.id,
      netsuiteClient,
      shopifyClient,
      historicalData: {
        averageSyncTime: 0,
        successRate: 0,
        commonErrors: [],
        peakUsageHours: [],
        apiCallPatterns: [],
        dataVolumeTrends: []
      },
      systemMetrics: {
        currentLoad: 0,
        availableResources: {
          cpu: 100,
          memory: 100,
          networkBandwidth: 100,
          concurrentConnections: 100
        },
        networkLatency: 0,
        apiRateLimits: [],
        errorRates: {
          totalErrors: 0,
          errorRate: 0,
          errorTypes: {},
          recoverySuccessRate: 0
        }
      }
    })

    const errorRecovery = new AdvancedErrorRecoverySystem(supabase, aiIntelligence)
    const performanceOptimizer = new PredictivePerformanceOptimizer(supabase, aiIntelligence)
    const eventEngine = new EventDrivenSyncEngine(supabase, aiIntelligence)
    const dataProcessingPipeline = new AdvancedDataProcessingPipeline(supabase, aiIntelligence)

    // Create sync context with advanced systems
    const syncContext: SyncContext = {
      supabase,
      userId: auth.user.id,
      syncLogId: syncLog.id,
      netsuiteClient,
      shopifyClient,
      aiIntelligence,
      errorRecovery
    }

    // Get performance predictions before starting
    const performancePrediction = await performanceOptimizer.predictOptimalPerformance(
      'products', // Primary operation type
      1000, // Estimated data volume
      {
        cpu: 50,
        memory: 512,
        network: 100,
        concurrentOperations: 2,
        priority: 'normal'
      }
    )

    console.log(`[sync] Performance prediction: ${performancePrediction.estimatedDuration}ms, ${performancePrediction.optimalBatchSize} batch size, ${performancePrediction.recommendedConcurrency} concurrency`)

    // Publish sync started event
    await eventEngine.publishEvent({
      type: 'sync_requested',
      source: 'user',
      entityType: 'webhook',
      entityId: syncLog.id,
      userId: auth.user.id,
      payload: {
        profileId: profile.id,
        dataTypes: profile.dataTypes,
        syncDirection: profile.syncDirection
      },
      metadata: {
        priority: 'normal',
        retryCount: 0,
        maxRetries: 3,
        processingHistory: [],
        tags: ['sync', 'manual'],
        businessImpact: 'medium'
      }
    })

    // Execute sync based on profile with performance monitoring
    let apiCalls = 0
    const syncStartTime = Date.now()

    try {
      if (profile.dataTypes.products) {
        const productService = new ProductSyncService(syncContext)
        const productResult = await productService.syncProducts(profile.syncDirection)
        result.itemsProcessed += productResult.processed
        result.itemsSucceeded += productResult.succeeded
        result.itemsFailed += productResult.failed
        result.errors.push(...productResult.errors)
        apiCalls += Math.ceil(productResult.processed / 100) // Estimate API calls

        // Performance monitoring during sync
        const currentMetrics = {
          timestamp: new Date(),
          operation: 'products',
          duration: Date.now() - syncStartTime,
          itemsProcessed: result.itemsProcessed,
          successRate: result.itemsSucceeded / Math.max(1, result.itemsProcessed),
          errorRate: result.itemsFailed / Math.max(1, result.itemsProcessed),
          apiCalls,
          memoryUsage: 60, // Would be measured
          cpuUsage: 45, // Would be measured
          networkLatency: 150, // Would be measured
          throughput: result.itemsProcessed / Math.max(1, (Date.now() - syncStartTime) / 1000)
        }

        // Apply real-time optimization
        const optimization = await performanceOptimizer.optimizeRunningSync(
          syncLog.id,
          currentMetrics,
          {
            supabase,
            userId: auth.user.id,
            syncLogId: syncLog.id,
            netsuiteClient,
            shopifyClient,
            historicalData: {
              averageSyncTime: 0,
              successRate: 0,
              commonErrors: [],
              peakUsageHours: [],
              apiCallPatterns: [],
              dataVolumeTrends: []
            },
            systemMetrics: {
              currentLoad: 45,
              availableResources: {
                cpu: 55,
                memory: 40,
                networkBandwidth: 60,
                concurrentConnections: 5
              },
              networkLatency: 150,
              apiRateLimits: [],
              errorRates: {
                totalErrors: result.itemsFailed,
                errorRate: result.itemsFailed / Math.max(1, result.itemsProcessed),
                errorTypes: {},
                recoverySuccessRate: 0.8
              }
            }
          }
        )

        console.log(`[sync] Applied optimization: batchSize=${optimization.batchSize}, concurrency=${optimization.concurrency}`)
      }

      if (profile.dataTypes.inventory) {
        const inventoryService = new InventorySyncService(syncContext)
        const inventoryResult = await inventoryService.syncInventory(profile.syncDirection)
        result.itemsProcessed += inventoryResult.processed
        result.itemsSucceeded += inventoryResult.succeeded
        result.itemsFailed += inventoryResult.failed
        result.errors.push(...inventoryResult.errors)
        apiCalls += Math.ceil(inventoryResult.processed / 50) // Estimate API calls
      }

      if (profile.dataTypes.orders) {
        const orderService = new OrderSyncService(syncContext)
        const orderResult = await orderService.syncOrders(profile.syncDirection)
        result.itemsProcessed += orderResult.processed
        result.itemsSucceeded += orderResult.succeeded
        result.itemsFailed += orderResult.failed
        result.errors.push(...orderResult.errors)
        apiCalls += Math.ceil(orderResult.processed / 25) // Estimate API calls
      }

      result.status = result.itemsFailed === 0 ? 'completed' : result.itemsSucceeded > 0 ? 'partial_success' : 'failed'

      // Publish sync completed event
      await eventEngine.publishEvent({
        type: 'sync_completed',
        source: 'system',
        entityType: 'webhook',
        entityId: syncLog.id,
        userId: auth.user.id,
        payload: {
          result,
          duration: Date.now() - syncStartTime,
          apiCalls
        },
        metadata: {
          priority: 'normal',
          retryCount: 0,
          maxRetries: 0,
          processingHistory: [],
          tags: ['sync', 'completed'],
          businessImpact: result.status === 'completed' ? 'low' : 'medium'
        }
      })

    } catch (error) {
      console.error('[sync] Sync execution error', error)
      result.status = 'failed'
      result.errors.push(error instanceof Error ? error.message : 'Unknown sync error')

      // Publish sync failed event
      await eventEngine.publishEvent({
        type: 'sync_failed',
        source: 'system',
        entityType: 'webhook',
        entityId: syncLog.id,
        userId: auth.user.id,
        payload: {
          error: error instanceof Error ? error.message : 'Unknown sync error',
          duration: Date.now() - syncStartTime,
          partialResult: result
        },
        metadata: {
          priority: 'high',
          retryCount: 0,
          maxRetries: 3,
          processingHistory: [],
          tags: ['sync', 'failed'],
          businessImpact: 'high'
        }
      })
    }

    result.duration = Date.now() - startTime

    // Record sync performance metrics
    await monitoringService.recordSyncMetrics(auth.user.id, syncLog.id, {
      duration: result.duration,
      itemsProcessed: result.itemsProcessed,
      itemsSucceeded: result.itemsSucceeded,
      itemsFailed: result.itemsFailed,
      apiCalls,
      errors: result.errors
    })

    // Update sync log
    await supabase
      .from('sync_logs')
      .update({
        status: result.status,
        items_processed: result.itemsProcessed,
        items_succeeded: result.itemsSucceeded,
        items_failed: result.itemsFailed,
        completed_at: new Date().toISOString(),
        duration_seconds: Math.round(result.duration / 1000),
        error_details: result.errors.length > 0 ? result.errors : null
      })
      .eq('id', syncLog.id)

    // Send completion notification (if enabled)
    try {
      // Check user notification preferences
      const { data: preferences } = await supabase
        .from('notification_preferences')
        .select('email_notifications')
        .eq('user_id', auth.user.id)
        .single()

      // Send notification if email notifications are enabled (default to true if no preference set)
      if (preferences?.email_notifications !== false) {
        const notificationMessage = result.status === 'completed'
          ? `Sync completed successfully! Processed ${result.itemsProcessed} items in ${Math.round(result.duration / 1000)}s.`
          : result.status === 'partial_success'
          ? `Sync completed with issues. ${result.itemsSucceeded} succeeded, ${result.itemsFailed} failed.`
          : `Sync failed. ${result.errors.join(', ')}`

        await supabase.functions.invoke('send-notification', {
          body: {
            type: 'email',
            recipient: auth.user.email || '', // Get from user profile
            subject: `Sync ${result.status === 'completed' ? 'Completed' : 'Failed'}`,
            message: notificationMessage,
            metadata: {
              syncLogId: syncLog.id,
              status: result.status,
              duration: result.duration,
              itemsProcessed: result.itemsProcessed
            }
          }
        })
      }
    } catch (notificationError) {
      console.error('[sync] Failed to send notification:', notificationError)
      // Don't fail the sync for notification errors
    }

    // Check for alerts
    await monitoringService.checkAlerts(auth.user.id)

    return corsJsonHeaders(200, result)

  } catch (error) {
    console.error('[sync] Unexpected error', error)
    return corsJsonHeaders(500, { error: 'internal_error', message: 'Sync failed unexpectedly' })
  }
 })
})


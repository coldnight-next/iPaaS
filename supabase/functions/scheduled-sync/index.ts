import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { withCors } from '../_shared/cors.ts'
import { createSupabaseClient } from '../_shared/supabaseClient.ts'

/**
 * Scheduled Sync Function
 * 
 * This function is designed to be triggered by Supabase cron jobs or external schedulers.
 * It processes all active sync list items that are due for synchronization based on their
 * sync mode (delta or full) and schedule.
 * 
 * Can be triggered with:
 * - No authentication (for system cron jobs) using a service role key
 * - With user authentication (for manual trigger via UI)
 */

interface ScheduledSyncResult {
  totalUsers: number
  totalItems: number
  itemsProcessed: number
  itemsSucceeded: number
  itemsFailed: number
  duration: number
  userResults: Array<{
    userId: string
    itemsProcessed: number
    itemsSucceeded: number
    itemsFailed: number
    errors: string[]
  }>
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

  const supabase = createSupabaseClient()
  const startTime = Date.now()

  try {
    // Get all active sync list items from all users
    const { data: syncListItems, error: syncListError } = await supabase
      .from('sync_list')
      .select('*, saved_search_patterns(*)')
      .eq('is_active', true)
      .order('user_id')

    if (syncListError) {
      console.error('[scheduled-sync] Failed to fetch sync list', syncListError)
      return corsJsonHeaders(500, { error: 'database_error', message: 'Failed to fetch sync list' })
    }

    if (!syncListItems || syncListItems.length === 0) {
      console.log('[scheduled-sync] No active sync list items found')
      return corsJsonHeaders(200, {
        totalUsers: 0,
        totalItems: 0,
        itemsProcessed: 0,
        itemsSucceeded: 0,
        itemsFailed: 0,
        duration: Date.now() - startTime,
        userResults: []
      })
    }

    // Group items by user
    const itemsByUser = new Map<string, typeof syncListItems>()
    for (const item of syncListItems) {
      const userId = item.user_id
      if (!itemsByUser.has(userId)) {
        itemsByUser.set(userId, [])
      }
      itemsByUser.get(userId)!.push(item)
    }

    const result: ScheduledSyncResult = {
      totalUsers: itemsByUser.size,
      totalItems: syncListItems.length,
      itemsProcessed: 0,
      itemsSucceeded: 0,
      itemsFailed: 0,
      duration: 0,
      userResults: []
    }

    // Process each user's sync list items
    for (const [userId, userItems] of itemsByUser) {
      const userResult = {
        userId,
        itemsProcessed: 0,
        itemsSucceeded: 0,
        itemsFailed: 0,
        errors: [] as string[]
      }

      try {
        // Invoke delta-sync function for this user's items
        const deltaResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/delta-sync`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
          },
          body: JSON.stringify({
            syncListIds: userItems.map(item => item.id),
            userId: userId
          })
        })

        if (!deltaResponse.ok) {
          const errorData = await deltaResponse.json()
          throw new Error(`Delta sync failed: ${errorData.message || 'Unknown error'}`)
        }

        const deltaResult = await deltaResponse.json()
        
        userResult.itemsProcessed = deltaResult.itemsProcessed || 0
        userResult.itemsSucceeded = (deltaResult.itemsCreated || 0) + (deltaResult.itemsUpdated || 0)
        userResult.itemsFailed = deltaResult.itemsFailed || 0
        
        if (deltaResult.errors && deltaResult.errors.length > 0) {
          userResult.errors = deltaResult.errors.map((e: any) => `${e.itemId}: ${e.error}`)
        }

        result.itemsProcessed += userResult.itemsProcessed
        result.itemsSucceeded += userResult.itemsSucceeded
        result.itemsFailed += userResult.itemsFailed

      } catch (error) {
        console.error(`[scheduled-sync] Error processing user ${userId}:`, error)
        userResult.itemsFailed = userItems.length
        userResult.errors.push(error instanceof Error ? error.message : 'Unknown error')
        result.itemsFailed += userItems.length
      }

      result.userResults.push(userResult)
    }

    result.duration = Date.now() - startTime

    // Log the scheduled sync execution
    const { error: logError } = await supabase
      .from('sync_history')
      .insert({
        user_id: null, // System-level sync
        sync_type: 'scheduled',
        status: result.itemsFailed === 0 ? 'completed' : 
                result.itemsSucceeded > 0 ? 'partial_success' : 'failed',
        items_processed: result.itemsProcessed,
        items_created: 0, // Aggregated in user-level syncs
        items_updated: result.itemsSucceeded,
        items_failed: result.itemsFailed,
        duration_ms: result.duration,
        metadata: {
          totalUsers: result.totalUsers,
          userResults: result.userResults.map(ur => ({
            userId: ur.userId,
            processed: ur.itemsProcessed,
            succeeded: ur.itemsSucceeded,
            failed: ur.itemsFailed,
            errorCount: ur.errors.length
          }))
        }
      })

    if (logError) {
      console.error('[scheduled-sync] Failed to log scheduled sync', logError)
    }

    console.log(`[scheduled-sync] Completed: ${result.itemsSucceeded}/${result.itemsProcessed} items succeeded across ${result.totalUsers} users`)

    return corsJsonHeaders(200, result)

  } catch (error) {
    console.error('[scheduled-sync] Unexpected error', error)
    return corsJsonHeaders(500, {
      error: 'sync_error',
      message: error instanceof Error ? error.message : 'Scheduled sync failed'
    })
  }
})

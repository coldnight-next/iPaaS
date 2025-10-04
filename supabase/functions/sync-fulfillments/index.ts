import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { corsHeaders } from '../_shared/cors.ts'
import { FulfillmentSyncService } from '../_shared/fulfillmentSyncService.ts'

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get authorization token
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    })

    // Verify user from JWT token
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse request body
    const body = await req.json()
    const {
      direction = 'netsuite_to_shopify', // or 'shopify_to_netsuite'
      orderIds,
      dateFrom,
      dateTo
    } = body

    console.log('[sync-fulfillments] Starting fulfillment sync for user:', user.id)
    console.log('[sync-fulfillments] Direction:', direction)

    // Create sync log entry
    const { data: syncLog, error: syncLogError } = await supabase
      .from('sync_logs')
      .insert({
        user_id: user.id,
        sync_type: 'fulfillment_sync',
        direction,
        status: 'running',
        started_at: new Date().toISOString()
      })
      .select('id')
      .single()

    if (syncLogError || !syncLog) {
      throw new Error(`Failed to create sync log: ${syncLogError?.message}`)
    }

    try {
      // Initialize FulfillmentSyncService
      const fulfillmentSyncService = await FulfillmentSyncService.fromConnections(supabase, user.id)

      // Perform the sync
      const result = await fulfillmentSyncService.syncFulfillments({
        userId: user.id,
        syncLogId: syncLog.id,
        direction,
        orderIds,
        dateFrom: dateFrom ? new Date(dateFrom) : undefined,
        dateTo: dateTo ? new Date(dateTo) : undefined
      })

      // Update sync log
      await supabase
        .from('sync_logs')
        .update({
          status: result.success ? 'completed' : 'partial_success',
          items_processed: result.fulfillmentsProcessed,
          items_succeeded: result.fulfillmentsSucceeded,
          items_failed: result.fulfillmentsFailed,
          completed_at: new Date().toISOString()
        })
        .eq('id', syncLog.id)

      console.log('[sync-fulfillments] Sync completed:', result)

      // Return success response
      return new Response(
        JSON.stringify({
          success: result.success,
          syncLogId: syncLog.id,
          summary: {
            fulfillmentsProcessed: result.fulfillmentsProcessed,
            fulfillmentsSucceeded: result.fulfillmentsSucceeded,
            fulfillmentsFailed: result.fulfillmentsFailed
          },
          errors: result.errors,
          warnings: result.warnings
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    } catch (syncError) {
      // Update sync log with error
      await supabase
        .from('sync_logs')
        .update({
          status: 'failed',
          error_details: { message: syncError instanceof Error ? syncError.message : String(syncError) },
          completed_at: new Date().toISOString()
        })
        .eq('id', syncLog.id)

      throw syncError
    }
  } catch (error) {
    console.error('[sync-fulfillments] Error:', error)

    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred'
    
    return new Response(
      JSON.stringify({
        error: errorMessage,
        details: error instanceof Error ? error.stack : undefined
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})

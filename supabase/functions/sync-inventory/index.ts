import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { corsHeaders } from '../_shared/cors.ts'
import { InventorySyncService } from '../_shared/inventorySyncService.ts'

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
      productIds,
      threshold = 0,
      fullSync = false
    } = body

    console.log('[sync-inventory] Starting inventory sync for user:', user.id)

    // Create sync log entry
    const { data: syncLog, error: syncLogError } = await supabase
      .from('sync_logs')
      .insert({
        user_id: user.id,
        sync_type: 'inventory_sync',
        direction: 'netsuite_to_shopify',
        status: 'running',
        started_at: new Date().toISOString()
      })
      .select('id')
      .single()

    if (syncLogError || !syncLog) {
      throw new Error(`Failed to create sync log: ${syncLogError?.message}`)
    }

    try {
      // Initialize InventorySyncService
      const inventorySyncService = await InventorySyncService.fromConnections(supabase, user.id)

      // Perform the sync
      const result = await inventorySyncService.syncInventory({
        userId: user.id,
        syncLogId: syncLog.id,
        productIds,
        threshold,
        fullSync
      })

      // Update sync log
      await supabase
        .from('sync_logs')
        .update({
          status: result.success ? 'completed' : 'partial_success',
          items_processed: result.productsProcessed,
          items_succeeded: result.productsSucceeded,
          items_failed: result.productsFailed,
          completed_at: new Date().toISOString()
        })
        .eq('id', syncLog.id)

      console.log('[sync-inventory] Sync completed:', result)

      // Return success response
      return new Response(
        JSON.stringify({
          success: result.success,
          syncLogId: syncLog.id,
          summary: {
            productsProcessed: result.productsProcessed,
            productsSucceeded: result.productsSucceeded,
            productsFailed: result.productsFailed,
            quantityUpdates: result.quantityUpdates
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
    console.error('[sync-inventory] Error:', error)

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

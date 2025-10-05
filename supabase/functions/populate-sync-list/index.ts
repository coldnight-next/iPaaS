import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { withCors } from '../_shared/cors.ts'
import { createSupabaseClient, getUserFromRequest } from '../_shared/supabaseClient.ts'

interface PopulateRequest {
  patternId: string
  clearExisting?: boolean
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
    console.error('[populate-sync-list] Unexpected auth error', error)
    return corsJsonHeaders(500, { error: 'internal_error', message: 'Unable to authenticate request' })
  }

  let body: PopulateRequest | null = null
  try {
    body = await req.json()
  } catch (_error) {
    return corsJsonHeaders(400, { error: 'invalid_payload', message: 'Body must be valid JSON' })
  }

  if (!body?.patternId) {
    return corsJsonHeaders(400, { error: 'invalid_payload', message: 'patternId is required' })
  }

  const supabase = createSupabaseClient()

  try {
    // Get the pattern
    const { data: pattern, error: patternError } = await supabase
      .from('saved_search_patterns')
      .select('*')
      .eq('id', body.patternId)
      .eq('user_id', auth.user.id)
      .single()

    if (patternError || !pattern) {
      console.error('[populate-sync-list] Pattern not found:', patternError)
      return corsJsonHeaders(404, { error: 'pattern_not_found', message: 'Pattern not found' })
    }

    // Clear existing items if requested
    if (body.clearExisting) {
      const { error: clearError } = await supabase
        .from('sync_list')
        .delete()
        .eq('user_id', auth.user.id)

      if (clearError) {
        console.error('[populate-sync-list] Error clearing sync list:', clearError)
        return corsJsonHeaders(500, { error: 'database_error', message: 'Failed to clear existing items' })
      }
    }

    // Get products based on pattern filters
    let productsQuery = supabase
      .from('products')
      .select('*')
      .eq('user_id', auth.user.id)

    // Apply filters from pattern
    if (pattern.filters) {
      const filters = pattern.filters

      if (filters.platform) {
        productsQuery = productsQuery.eq('platform', filters.platform)
      }

      if (filters.sku) {
        productsQuery = productsQuery.ilike('sku', `%${filters.sku}%`)
      }

      if (filters.name) {
        productsQuery = productsQuery.ilike('name', `%${filters.name}%`)
      }

      if (filters.is_active !== undefined) {
        productsQuery = productsQuery.eq('is_active', filters.is_active)
      }
    }

    const { data: products, error: productsError } = await productsQuery

    if (productsError) {
      console.error('[populate-sync-list] Error fetching products:', productsError)
      return corsJsonHeaders(500, { error: 'database_error', message: 'Failed to fetch products' })
    }

    if (!products || products.length === 0) {
      return corsJsonHeaders(200, {
        success: true,
        stats: { inserted: 0, updated: 0, failed: 0 },
        message: 'No products found matching the pattern'
      })
    }

    // Prepare sync list items
    const syncItems = products.map(product => ({
      user_id: auth.user.id,
      netsuite_item_id: product.platform === 'netsuite' ? product.platform_product_id : null,
      shopify_product_id: product.platform === 'shopify' ? product.platform_product_id : null,
      sku: product.sku,
      product_name: product.name || product.sku || 'Unknown Product',
      sync_direction: pattern.sync_direction,
      sync_mode: 'delta',
      is_active: true,
      priority: 1
    }))

    // Insert items (upsert to handle duplicates)
    const { data: insertedItems, error: insertError } = await supabase
      .from('sync_list')
      .upsert(syncItems, {
        onConflict: 'user_id,netsuite_item_id,shopify_product_id',
        ignoreDuplicates: false
      })
      .select()

    if (insertError) {
      console.error('[populate-sync-list] Error inserting sync items:', insertError)
      return corsJsonHeaders(500, { error: 'database_error', message: 'Failed to populate sync list' })
    }

    // Update pattern's last_populated_at
    await supabase
      .from('saved_search_patterns')
      .update({ last_populated_at: new Date().toISOString() })
      .eq('id', body.patternId)

    const stats = {
      inserted: insertedItems?.length || 0,
      updated: 0, // Upsert doesn't distinguish between insert/update
      failed: 0
    }

    console.log(`[populate-sync-list] Successfully populated sync list:`, stats)

    return corsJsonHeaders(200, {
      success: true,
      stats,
      message: `Sync list populated with ${stats.inserted} items`
    })

  } catch (error) {
    console.error('[populate-sync-list] Unexpected error:', error)
    return corsJsonHeaders(500, { error: 'internal_error', message: 'Populate sync list failed unexpectedly' })
  }
})
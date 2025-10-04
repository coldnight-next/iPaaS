import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { decryptJson } from '../_shared/encryption.ts'
import { proactiveTokenRefresh, refreshNetSuiteToken } from '../_shared/tokenRefresh.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface PopulateSyncListRequest {
  patternId: string  // The saved search pattern ID
  syncDirection?: string  // Override the pattern's sync direction if needed
  clearExisting?: boolean  // Whether to clear existing items before populating
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    // Get the user
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser()

    if (userError || !user) {
      throw new Error('Unauthorized')
    }

    const { patternId, syncDirection, clearExisting = false }: PopulateSyncListRequest = await req.json()

    // Fetch the saved search pattern
    const { data: pattern, error: patternError } = await supabaseClient
      .from('saved_search_patterns')
      .select('*')
      .eq('id', patternId)
      .eq('user_id', user.id)
      .single()

    if (patternError || !pattern) {
      throw new Error('Saved search pattern not found')
    }

    // Get NetSuite connection details
    const { data: connection, error: connError } = await supabaseClient
      .from('connections')
      .select('*')
      .eq('user_id', user.id)
      .eq('platform', 'netsuite')
      .eq('status', 'connected')
      .single()

    if (connError || !connection) {
      throw new Error('NetSuite connection not found or not active')
    }

    // Decrypt credentials
    let credentials = await decryptJson(connection.credentials.encrypted)
    const accountId = connection.metadata?.account_id
    
    if (!accountId) {
      throw new Error('NetSuite account ID not found in connection metadata')
    }
    
    console.log('Account ID:', accountId)
    
    // Proactively refresh token if it's about to expire
    credentials.access_token = await proactiveTokenRefresh(connection.id, credentials)
    const accessToken = credentials.access_token

    let items: any[] = []

    // Check if this is a NetSuite saved search or a filter-based pattern
    if (pattern.netsuite_saved_search_id) {
      console.log(`Fetching items from NetSuite saved search: ${pattern.netsuite_saved_search_id}`)
      
      // NetSuite saved search ID format can be:
      // - customsearch123 (custom search)
      // - customsearch_my_search (custom search with name)
      // - 123 (numeric ID)
      
      const searchId = pattern.netsuite_saved_search_id
      
      // Use NetSuite's search API endpoint
      // Format: /services/rest/record/v1/item?savedSearchId=customsearch123
      const searchUrl = `https://${accountId.toLowerCase().replace(/_/g, '-')}.suitetalk.api.netsuite.com/services/rest/record/v1/item`
      const params = new URLSearchParams()
      params.append('limit', '1000')
      params.append('savedSearchId', searchId)
      
      const fullUrl = `${searchUrl}?${params.toString()}`
      console.log('Fetching from URL:', fullUrl)
      
      const searchResponse = await fetch(fullUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'prefer': 'transient',
        },
      })

      if (!searchResponse.ok) {
        const errorText = await searchResponse.text()
        console.error('NetSuite saved search error:', errorText)
        throw new Error(`Failed to fetch saved search results: ${searchResponse.status} ${errorText}`)
      }

      const searchData = await searchResponse.json()
      items = searchData.items || []
      
      console.log(`Fetched ${items.length} items from saved search`)
    } else if (pattern.filters && Object.keys(pattern.filters).length > 0) {
      console.log('Fetching items using filter criteria:', pattern.filters)
      
      // Use the existing fetch-products logic with the pattern's filters
      const filters = pattern.filters
      const itemTypes = ['inventoryItem', 'nonInventoryItem', 'assemblyItem', 'kitItem', 'serviceItem']
      
      for (const itemType of itemTypes) {
        const baseUrl = `https://${accountId.toLowerCase().replace(/_/g, '-')}.suitetalk.api.netsuite.com/services/rest/record/v1/${itemType}`
        
        // Build query parameters
        const params = new URLSearchParams()
        params.append('limit', '1000')
        
        if (filters.searchTerm) {
          params.append('q', filters.searchTerm)
        }
        
        const url = `${baseUrl}?${params.toString()}`
        
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        })

        if (response.ok) {
          const data = await response.json()
          if (data.items && data.items.length > 0) {
            items.push(...data.items)
          }
        }
      }
      
      console.log(`Fetched ${items.length} items using filters`)
    } else {
      throw new Error('Pattern must have either a NetSuite saved search ID or filters defined')
    }

    // Clear existing sync list items if requested
    if (clearExisting) {
      const { error: deleteError } = await supabaseClient
        .from('sync_list')
        .delete()
        .eq('user_id', user.id)
        .eq('sync_direction', syncDirection || pattern.sync_direction)

      if (deleteError) {
        console.error('Error clearing existing items:', deleteError)
      } else {
        console.log('Cleared existing sync list items')
      }
    }

    // Transform and insert items into sync_list
    const syncListItems = items.map((item: any) => ({
      user_id: user.id,
      netsuite_item_id: item.id || item.internalId,
      sku: item.itemid || item.sku || item.displayname,
      product_name: item.displayname || item.name || item.itemid,
      sync_direction: syncDirection || pattern.sync_direction,
      sync_mode: 'delta',
      is_active: true,
      metadata: {
        price: item.baseprice || item.price,
        inventory: item.quantityavailable || item.quantity,
        source: 'saved_search',
        pattern_id: patternId,
        pattern_name: pattern.name,
      },
    }))

    // Batch insert with upsert logic (update if SKU already exists)
    let inserted = 0
    let updated = 0
    let failed = 0

    for (const item of syncListItems) {
      try {
        // Check if item already exists
        const { data: existing } = await supabaseClient
          .from('sync_list')
          .select('id')
          .eq('user_id', user.id)
          .eq('sku', item.sku)
          .single()

        if (existing) {
          // Update existing item
          const { error: updateError } = await supabaseClient
            .from('sync_list')
            .update({
              netsuite_item_id: item.netsuite_item_id,
              product_name: item.product_name,
              metadata: item.metadata,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id)

          if (updateError) {
            console.error('Update error:', updateError)
            failed++
          } else {
            updated++
          }
        } else {
          // Insert new item
          const { error: insertError } = await supabaseClient
            .from('sync_list')
            .insert(item)

          if (insertError) {
            console.error('Insert error:', insertError)
            failed++
          } else {
            inserted++
          }
        }
      } catch (error) {
        console.error('Error processing item:', error)
        failed++
      }
    }

    // Update the pattern's last_populated_at timestamp
    await supabaseClient
      .from('saved_search_patterns')
      .update({ last_populated_at: new Date().toISOString() })
      .eq('id', patternId)

    console.log(`Sync list populated: ${inserted} inserted, ${updated} updated, ${failed} failed`)

    return new Response(
      JSON.stringify({
        success: true,
        message: `Sync list populated successfully`,
        stats: {
          total: items.length,
          inserted,
          updated,
          failed,
        },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({
        error: error.message || 'An error occurred',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})

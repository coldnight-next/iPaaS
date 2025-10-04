import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import * as oauth from 'https://deno.land/x/oauth4webapi@v2.0.0/mod.ts'

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

    const credentials = connection.credentials as any
    const accountId = connection.metadata?.account_id
    
    if (!accountId) {
      throw new Error('NetSuite account ID not found in connection metadata')
    }
    
    console.log('Account ID:', accountId)
    let accessToken = credentials.access_token

    // Check if token needs refresh
    if (credentials.expires_at && new Date(credentials.expires_at) <= new Date()) {
      console.log('Access token expired, refreshing...')
      
      // Refresh the token
      const tokenEndpoint = `https://${accountId.toLowerCase().replace(/_/g, '-')}.suitetalk.api.netsuite.com/services/rest/auth/oauth2/v1/token`
      
      const refreshResponse = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${btoa(`${credentials.consumer_key}:${credentials.consumer_secret}`)}`,
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: credentials.refresh_token,
        }),
      })

      if (!refreshResponse.ok) {
        throw new Error('Failed to refresh access token')
      }

      const tokenData = await refreshResponse.json()
      accessToken = tokenData.access_token

      // Update stored credentials
      await supabaseClient
        .from('connections')
        .update({
          credentials: {
            ...credentials,
            access_token: tokenData.access_token,
            expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', connection.id)
    }

    let items: any[] = []

    // Check if this is a NetSuite saved search or a filter-based pattern
    if (pattern.netsuite_saved_search_id) {
      console.log(`Fetching items from NetSuite saved search: ${pattern.netsuite_saved_search_id}`)
      
      // Fetch items from NetSuite saved search
      const searchUrl = `https://${accountId.toLowerCase().replace(/_/g, '-')}.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql`
      
      // Use SuiteQL to query the saved search results
      const suiteQLQuery = `SELECT id, itemid, displayname, baseprice, quantityavailable FROM item WHERE id IN (SELECT id FROM item WHERE id IN (SELECT itemid FROM customsearch_${pattern.netsuite_saved_search_id}))`
      
      const searchResponse = await fetch(searchUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'prefer': 'transient',
        },
        body: JSON.stringify({
          q: suiteQLQuery
        }),
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

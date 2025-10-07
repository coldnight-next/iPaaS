import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { withCors } from '../_shared/cors.ts'
import { createSupabaseClient, getUserFromRequest } from '../_shared/supabaseClient.ts'
import { NetSuiteClient } from '../_shared/netsuiteClient.ts'

interface NetSuiteEntity {
  internalId: string
  name: string
  type?: string
}

serve(async req => {
  const origin = req.headers.get('origin')

  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: withCors({ 'Access-Control-Allow-Methods': 'GET,OPTIONS' }, origin)
    })
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'method_not_allowed', message: 'Use GET' }), {
      status: 405,
      headers: withCors({ 'content-type': 'application/json' }, origin)
    })
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
    console.error('[get-netsuite-entities] Unexpected auth error', error)
    return new Response(JSON.stringify({ error: 'internal_error', message: 'Unable to authenticate request' }), {
      status: 500,
      headers: withCors({ 'content-type': 'application/json' }, origin)
    })
  }

  const url = new URL(req.url)
  const entityType = url.searchParams.get('entityType')

  if (!entityType) {
    return new Response(JSON.stringify({ error: 'invalid_params', message: 'entityType parameter is required' }), {
      status: 400,
      headers: withCors({ 'content-type': 'application/json' }, origin)
    })
  }

  const supabase = createSupabaseClient()
  const { data: connection, error: fetchError } = await supabase
    .from('connections')
    .select('*')
    .eq('user_id', auth.user.id)
    .eq('platform', 'netsuite')
    .eq('status', 'connected')
    .maybeSingle()

  if (fetchError) {
    console.error('[get-netsuite-entities] Failed to fetch connection', fetchError)
    return new Response(JSON.stringify({ error: 'database_error', message: 'Failed to fetch NetSuite connection' }), {
      status: 500,
      headers: withCors({ 'content-type': 'application/json' }, origin)
    })
  }

  if (!connection) {
    return new Response(JSON.stringify({ error: 'no_connection', message: 'No active NetSuite connection found' }), {
      status: 404,
      headers: withCors({ 'content-type': 'application/json' }, origin)
    })
  }

  try {
    const netsuiteClient = await NetSuiteClient.fromConnection(connection)
    let entities: NetSuiteEntity[] = []

    switch (entityType) {
      case 'subsidiaries':
        entities = await fetchSubsidiaries(netsuiteClient)
        break
      case 'divisions':
        entities = await fetchDivisions(netsuiteClient)
        break
      case 'brands':
        entities = await fetchBrands(netsuiteClient)
        break
      case 'productGroups':
        entities = await fetchProductGroups(netsuiteClient)
        break
      default:
        return new Response(JSON.stringify({ error: 'invalid_entity_type', message: `Unsupported entity type: ${entityType}` }), {
          status: 400,
          headers: withCors({ 'content-type': 'application/json' }, origin)
        })
    }

    return new Response(JSON.stringify({ entities }), {
      status: 200,
      headers: withCors({ 'content-type': 'application/json' }, origin)
    })

  } catch (error) {
    console.error(`[get-netsuite-entities] Error fetching ${entityType}:`, error)
    return new Response(JSON.stringify({
      error: 'netsuite_error',
      message: `Failed to fetch ${entityType} from NetSuite: ${error.message}`
    }), {
      status: 500,
      headers: withCors({ 'content-type': 'application/json' }, origin)
    })
  }
})

// Helper functions to fetch different entity types from NetSuite

async function fetchSubsidiaries(client: NetSuiteClient): Promise<NetSuiteEntity[]> {
  try {
    // NetSuite subsidiaries are typically accessed via subsidiary record type
    const response = await client.request<any>('subsidiary', {
      params: { limit: '1000' }
    })

    return (response.items || []).map((item: any) => ({
      internalId: item.internalId,
      name: item.name || item.legalName || `Subsidiary ${item.internalId}`,
      type: 'subsidiary'
    }))
  } catch (error) {
    console.error('[fetchSubsidiaries] Error:', error)
    // Return empty array if subsidiaries endpoint is not available
    return []
  }
}

async function fetchDivisions(client: NetSuiteClient): Promise<NetSuiteEntity[]> {
  try {
    // Divisions might be custom records or classifications
    // Try to fetch from classification records or custom records
    const response = await client.request<any>('classification', {
      params: { limit: '1000' }
    })

    return (response.items || [])
      .filter((item: any) => item.recordType === 'division' || item.name?.toLowerCase().includes('division'))
      .map((item: any) => ({
        internalId: item.internalId,
        name: item.name || `Division ${item.internalId}`,
        type: 'division'
      }))
  } catch (error) {
    console.error('[fetchDivisions] Error:', error)
    // Return empty array if divisions endpoint is not available
    return []
  }
}

async function fetchBrands(client: NetSuiteClient): Promise<NetSuiteEntity[]> {
  try {
    // Brands might be custom records or item options
    // Try to fetch from custom records first
    const response = await client.request<any>('customrecord', {
      params: {
        type: 'customrecord_brand', // Common custom record type for brands
        limit: '1000'
      }
    })

    if (response.items && response.items.length > 0) {
      return response.items.map((item: any) => ({
        internalId: item.internalId,
        name: item.name || item.custrecord_brand_name || `Brand ${item.internalId}`,
        type: 'brand'
      }))
    }

    // Fallback: try to get brands from item custom fields
    const itemsResponse = await client.searchItems({ limit: 100 })
    const brandSet = new Set<string>()

    itemsResponse.items.forEach((item: any) => {
      if (item.customFields?.brand) {
        brandSet.add(item.customFields.brand)
      }
    })

    return Array.from(brandSet).map((brand, index) => ({
      internalId: `brand_${index}`,
      name: brand,
      type: 'brand'
    }))
  } catch (error) {
    console.error('[fetchBrands] Error:', error)
    return []
  }
}

async function fetchProductGroups(client: NetSuiteClient): Promise<NetSuiteEntity[]> {
  try {
    // Product groups might be custom records or item options
    const response = await client.request<any>('customrecord', {
      params: {
        type: 'customrecord_productgroup', // Common custom record type for product groups
        limit: '1000'
      }
    })

    if (response.items && response.items.length > 0) {
      return response.items.map((item: any) => ({
        internalId: item.internalId,
        name: item.name || item.custrecord_pg_name || `Product Group ${item.internalId}`,
        type: 'productGroup'
      }))
    }

    // Fallback: try to get product groups from item custom fields
    const itemsResponse = await client.searchItems({ limit: 100 })
    const groupSet = new Set<string>()

    itemsResponse.items.forEach((item: any) => {
      if (item.customFields?.productGroup || item.customFields?.product_group) {
        groupSet.add(item.customFields.productGroup || item.customFields.product_group)
      }
    })

    return Array.from(groupSet).map((group, index) => ({
      internalId: `pg_${index}`,
      name: group,
      type: 'productGroup'
    }))
  } catch (error) {
    console.error('[fetchProductGroups] Error:', error)
    return []
  }
}
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { withCors } from '../_shared/cors.ts'
import { createSupabaseClient, getUserFromRequest } from '../_shared/supabaseClient.ts'

const shopifyClientId = Deno.env.get('SHOPIFY_APP_KEY')
const shopifyScopes = Deno.env.get('SHOPIFY_APP_SCOPES') || 'read_products,write_products'
const netsuiteClientId = Deno.env.get('NETSUITE_CLIENT_ID')
const netsuiteScopes = Deno.env.get('NETSUITE_SCOPES') || 'restlets,rest_webservices'
const fallbackFunctionsBase = `${(Deno.env.get('SUPABASE_URL') || 'http://localhost:54321').replace(/\/$/, '')}/functions/v1`
const functionBaseUrl = (Deno.env.get('OAUTH_FUNCTION_BASE_URL') || fallbackFunctionsBase).replace(/\/$/, '')

if (!shopifyClientId) {
  console.warn('[oauth-start] SHOPIFY_APP_KEY is not configured; Shopify OAuth will fail until it is provided')
}

if (!netsuiteClientId) {
  console.warn('[oauth-start] NETSUITE_CLIENT_ID is not configured; NetSuite OAuth will fail until it is provided')
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
    console.error('[oauth-start] Unexpected auth error', error)
    return corsJsonHeaders(500, { error: 'internal_error', message: 'Unable to authenticate request' })
  }

  let body: { platform?: string; shopDomain?: string; redirectTo?: string } | null = null
  try {
    body = await req.json()
  } catch (_error) {
    return corsJsonHeaders(400, { error: 'invalid_payload', message: 'Body must be valid JSON' })
  }

  if (!body?.platform) {
    return corsJsonHeaders(400, { error: 'invalid_payload', message: 'platform is required' })
  }

  const platform = body.platform.toLowerCase()

  if (platform !== 'shopify' && platform !== 'netsuite') {
    return corsJsonHeaders(400, { error: 'unsupported_platform', message: `OAuth start is not ready for platform ${platform}` })
  }

  // Platform-specific validation and setup
  let sanitizedDomain: string
  let authorizeBaseUrl: string
  let clientId: string
  let scopes: string

  if (platform === 'shopify') {
    if (!shopifyClientId) {
      return corsJsonHeaders(500, { error: 'missing_configuration', message: 'SHOPIFY_APP_KEY must be configured on the server' })
    }

    const shopDomain = body?.shopDomain?.trim()
    if (!shopDomain) {
      return corsJsonHeaders(400, { error: 'invalid_payload', message: 'shopDomain is required for Shopify connections' })
    }

    sanitizedDomain = shopDomain.replace(/^https?:\/\//i, '').replace(/\/$/, '')
    if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(sanitizedDomain)) {
      return corsJsonHeaders(400, { error: 'invalid_payload', message: 'shopDomain must be a valid myshopify.com domain' })
    }

    authorizeBaseUrl = `https://${sanitizedDomain}/admin/oauth/authorize`
    clientId = shopifyClientId
    scopes = shopifyScopes
  } else if (platform === 'netsuite') {
    if (!netsuiteClientId) {
      return corsJsonHeaders(500, { error: 'missing_configuration', message: 'NETSUITE_CLIENT_ID must be configured on the server' })
    }

    const accountId = body?.accountId?.trim()
    if (!accountId) {
      return corsJsonHeaders(400, { error: 'invalid_payload', message: 'accountId is required for NetSuite connections' })
    }

    // Validate NetSuite account ID format (typically alphanumeric with underscores/hyphens)
    if (!/^[a-zA-Z0-9_-]+$/.test(accountId)) {
      return corsJsonHeaders(400, { error: 'invalid_payload', message: 'accountId must contain only letters, numbers, hyphens, and underscores' })
    }

    sanitizedDomain = accountId
    authorizeBaseUrl = `https://system.netsuite.com/app/login/oauth2/authorize.nl`
    clientId = netsuiteClientId
    scopes = netsuiteScopes
  } else {
    return corsJsonHeaders(400, { error: 'unsupported_platform', message: `Platform ${platform} is not supported` })
  }

  const supabase = createSupabaseClient()
  const state = crypto.randomUUID()
  const now = new Date().toISOString()

  const { data: existingConnection, error: fetchError } = await supabase
    .from('connections')
    .select('id, metadata, credentials')
    .eq('user_id', auth.user.id)
    .eq('platform', platform)
    .maybeSingle()

  if (fetchError) {
    console.error('[oauth-start] Failed fetching existing connection', fetchError)
    return corsJsonHeaders(500, { error: 'database_error', message: 'Failed preparing OAuth state' })
  }

  const existingMetadata = (existingConnection?.metadata as Record<string, unknown> | null) ?? {}
  const metadata = {
    ...existingMetadata,
    oauth_state: state,
    ...(platform === 'shopify' ? { shop_domain: sanitizedDomain } : { account_id: sanitizedDomain }),
    redirect_to: body?.redirectTo || null,
    oauth_requested_at: now
  }

  if (existingConnection) {
    const { error: updateError } = await supabase
      .from('connections')
      .update({
        status: 'authorizing',
        metadata
      })
      .eq('id', existingConnection.id)

    if (updateError) {
      console.error('[oauth-start] Failed updating connection', updateError)
      return corsJsonHeaders(500, { error: 'database_error', message: 'Unable to update connection for OAuth' })
    }
  } else {
    const { error: insertError } = await supabase
      .from('connections')
      .insert({
        user_id: auth.user.id,
        platform,
        status: 'authorizing',
        credentials: {},
        metadata
      })

    if (insertError) {
      console.error('[oauth-start] Failed inserting connection', insertError)
      return corsJsonHeaders(500, { error: 'database_error', message: 'Unable to create connection record for OAuth' })
    }
  }

  const redirectUri = `${functionBaseUrl}/oauth-callback`
  const authorizeUrl = new URL(authorizeBaseUrl)
  authorizeUrl.searchParams.set('client_id', clientId)
  authorizeUrl.searchParams.set('scope', scopes)
  authorizeUrl.searchParams.set('redirect_uri', redirectUri)
  authorizeUrl.searchParams.set('state', state)
  authorizeUrl.searchParams.set('response_type', 'code')
  
  // NetSuite-specific parameters
  if (platform === 'netsuite') {
    authorizeUrl.searchParams.set('account', sanitizedDomain)
  }

  return corsJsonHeaders(200, {
    url: authorizeUrl.toString(),
    state
  })
})
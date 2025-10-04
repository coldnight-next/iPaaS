import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { decodeHex } from 'https://deno.land/std@0.224.0/encoding/hex.ts'
import { timingSafeEqual } from 'https://deno.land/std@0.224.0/crypto/timing_safe_equal.ts'
import { withCors } from '../_shared/cors.ts'
import { createSupabaseClient } from '../_shared/supabaseClient.ts'
import { encryptJson } from '../_shared/encryption.ts'

const shopifyClientId = Deno.env.get('SHOPIFY_APP_KEY')
const shopifyClientSecret = Deno.env.get('SHOPIFY_APP_SECRET')
const netsuiteClientId = Deno.env.get('NETSUITE_CLIENT_ID')
const netsuiteClientSecret = Deno.env.get('NETSUITE_CLIENT_SECRET')
const defaultSuccessRedirect = Deno.env.get('OAUTH_SUCCESS_REDIRECT') || '/oauth/success'
const defaultFailureRedirect = Deno.env.get('OAUTH_FAILURE_REDIRECT') || '/oauth/error'

if (!shopifyClientId || !shopifyClientSecret) {
  console.warn('[oauth-callback] Shopify credentials are not fully configured; callbacks will fail until they are set')
}

if (!netsuiteClientId || !netsuiteClientSecret) {
  console.warn('[oauth-callback] NetSuite credentials are not fully configured; callbacks will fail until they are set')
}

function renderHtml(message: string, status: 'success' | 'error'): string {
  const color = status === 'success' ? '#16a34a' : '#dc2626'
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>OAuth ${status}</title><style>body{font-family:system-ui,sans-serif;background:#f8fafc;margin:0;padding:40px;color:#0f172a}main{max-width:560px;margin:0 auto;background:white;border-radius:12px;padding:32px;box-shadow:0 15px 45px rgba(15,23,42,0.08);}h1{color:${color};margin-bottom:16px;font-size:1.5rem;}p{line-height:1.6;margin:0;}a{color:#2563eb;text-decoration:none;}a:hover{text-decoration:underline;}</style></head><body><main><h1>${status === 'success' ? 'Connection authorized' : 'Authorization failed'}</h1><p>${message}</p></main></body></html>`
}

async function verifyShopifyHmac(url: URL, secret: string): Promise<boolean> {
  const hmac = url.searchParams.get('hmac')
  if (!hmac) {
    return false
  }

  const sorted = Array.from(url.searchParams.entries())
    .filter(([key]) => key !== 'hmac' && key !== 'signature')
    .sort(([a], [b]) => a.localeCompare(b))

  const payload = sorted.map(([key, value]) => `${key}=${value}`).join('&')
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signed = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
  const expectedBytes = new Uint8Array(signed)
  const providedBytes = decodeHex(hmac)

  if (expectedBytes.length !== providedBytes.length) {
    return false
  }

  return timingSafeEqual(expectedBytes, providedBytes)
}

serve(async req => {
  const origin = req.headers.get('origin')

  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: withCors({ 'Access-Control-Allow-Methods': 'GET,OPTIONS' }, origin)
    })
  }

  if (req.method !== 'GET') {
    return new Response(renderHtml('Unsupported request method', 'error'), {
      status: 405,
      headers: {
        'content-type': 'text/html; charset=utf-8'
      }
    })
  }

  const url = new URL(req.url)
  const state = url.searchParams.get('state')
  const code = url.searchParams.get('code')
  const errorParam = url.searchParams.get('error')

  if (!state) {
    return new Response(renderHtml('Missing state parameter', 'error'), {
      status: 400,
      headers: { 'content-type': 'text/html; charset=utf-8' }
    })
  }

  const supabase = createSupabaseClient()
  const { data: connection, error: fetchError } = await supabase
    .from('connections')
    .select('id, platform, metadata, credentials')
    .eq('metadata->>oauth_state', state)
    .maybeSingle()

  if (fetchError) {
    console.error('[oauth-callback] Failed to load connection', fetchError)
    return new Response(renderHtml('Unable to locate connection state', 'error'), {
      status: 500,
      headers: { 'content-type': 'text/html; charset=utf-8' }
    })
  }

  if (!connection) {
    return new Response(renderHtml('Unknown or expired OAuth state', 'error'), {
      status: 400,
      headers: { 'content-type': 'text/html; charset=utf-8' }
    })
  }

  const metadata = (connection.metadata as Record<string, unknown> | null) ?? {}
  const redirectTo = typeof metadata.redirect_to === 'string' && metadata.redirect_to.length > 0
    ? metadata.redirect_to
    : null

  const redirectWithStatus = (status: 'success' | 'error', message: string) => {
    const target = redirectTo || (status === 'success' ? defaultSuccessRedirect : defaultFailureRedirect)
    try {
      const targetUrl = new URL(target, target.startsWith('http') ? undefined : Deno.env.get('APP_BASE_URL') || 'http://localhost:5173')
      targetUrl.searchParams.set('status', status)
      targetUrl.searchParams.set('platform', connection.platform)
      if (message) {
        targetUrl.searchParams.set('message', message)
      }
      return Response.redirect(targetUrl.toString(), 302)
    } catch (_error) {
      return new Response(renderHtml(message, status), {
        status: status === 'success' ? 200 : 400,
        headers: { 'content-type': 'text/html; charset=utf-8' }
      })
    }
  }

  if (errorParam) {
    await supabase
      .from('connections')
      .update({
        status: 'error',
        metadata: {
          ...metadata,
          oauth_state: null,
          oauth_error: errorParam,
          oauth_completed_at: new Date().toISOString()
        }
      })
      .eq('id', connection.id)

    return redirectWithStatus('error', errorParam)
  }

  if (connection.platform !== 'shopify' && connection.platform !== 'netsuite') {
    return redirectWithStatus('error', `Platform ${connection.platform} is not supported yet`)
  }

  if (!code) {
    return redirectWithStatus('error', 'Missing authorization code')
  }

  // Handle platform-specific OAuth flows
  if (connection.platform === 'shopify') {
    if (!shopifyClientId || !shopifyClientSecret) {
      return redirectWithStatus('error', 'Shopify OAuth is not configured on the server')
    }

    const shopDomain = typeof metadata.shop_domain === 'string' ? metadata.shop_domain : null
    if (!shopDomain) {
      return redirectWithStatus('error', 'Missing shop domain metadata')
    }

    const hmacValid = await verifyShopifyHmac(url, shopifyClientSecret)
    if (!hmacValid) {
      return redirectWithStatus('error', 'Shopify callback could not be verified (invalid HMAC)')
    }

    return await handleShopifyTokenExchange(connection, shopDomain, code, shopifyClientId, shopifyClientSecret, metadata, supabase, redirectWithStatus)
  } else if (connection.platform === 'netsuite') {
    if (!netsuiteClientId || !netsuiteClientSecret) {
      return redirectWithStatus('error', 'NetSuite OAuth is not configured on the server')
    }

    const accountId = typeof metadata.account_id === 'string' ? metadata.account_id : null
    if (!accountId) {
      return redirectWithStatus('error', 'Missing NetSuite account ID metadata')
    }

    return await handleNetSuiteTokenExchange(connection, accountId, code, netsuiteClientId, netsuiteClientSecret, metadata, supabase, redirectWithStatus)
  }

  return redirectWithStatus('error', `Unsupported platform: ${connection.platform}`)
})

// Shopify token exchange handler
async function handleShopifyTokenExchange(
  connection: any,
  shopDomain: string,
  code: string,
  clientId: string,
  clientSecret: string,
  metadata: Record<string, unknown>,
  supabase: any,
  redirectWithStatus: (status: 'success' | 'error', message: string) => Response
): Promise<Response> {

  const tokenResponse = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code
    })
  })

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text()
    console.error('[oauth-callback] Shopify token exchange failed', tokenResponse.status, errorText)
    await supabase
      .from('connections')
      .update({
        status: 'error',
        metadata: {
          ...metadata,
          oauth_state: null,
          oauth_error: 'token_exchange_failed',
          oauth_completed_at: new Date().toISOString(),
          oauth_error_detail: errorText
        }
      })
      .eq('id', connection.id)

    return redirectWithStatus('error', 'Failed to exchange authorization code with Shopify')
  }

  interface ShopifyTokenResponse {
    access_token: string
    scope: string
    expires_in?: number
    associated_user_scope?: string
    associated_user?: Record<string, unknown>
  }

  const payload = await tokenResponse.json() as ShopifyTokenResponse

  const expiresAt = payload.expires_in ? new Date(Date.now() + payload.expires_in * 1000).toISOString() : null

  const encryptedCredentials = await encryptJson({
    access_token: payload.access_token,
    scope: payload.scope,
    expires_at: expiresAt,
    obtained_at: new Date().toISOString(),
    associated_user: payload.associated_user,
    associated_user_scope: payload.associated_user_scope,
    shop_domain: shopDomain
  })

  const { error: updateError } = await supabase
    .from('connections')
    .update({
      status: 'connected',
      credentials: {
        provider: 'shopify',
        version: '2023-10',
        encrypted: encryptedCredentials
      },
      metadata: {
        ...metadata,
        oauth_state: null,
        oauth_error: null,
        oauth_completed_at: new Date().toISOString(),
        shop_domain: shopDomain
      },
      last_sync: null
    })
    .eq('id', connection.id)

  if (updateError) {
    console.error('[oauth-callback] Failed to persist credentials', updateError)
    return redirectWithStatus('error', 'Failed to store Shopify credentials')
  }

  return redirectWithStatus('success', 'Connection established')
}

// NetSuite token exchange handler
async function handleNetSuiteTokenExchange(
  connection: any,
  accountId: string,
  code: string,
  clientId: string,
  clientSecret: string,
  metadata: Record<string, unknown>,
  supabase: any,
  redirectWithStatus: (status: 'success' | 'error', message: string) => Response
): Promise<Response> {
  const redirectUri = `${Deno.env.get('OAUTH_FUNCTION_BASE_URL') || ''}/oauth-callback`
  
  console.log('[oauth-callback] NetSuite token exchange params:', {
    accountId,
    redirectUri,
    codeLength: code?.length
  })

  // NetSuite OAuth 2.0 token endpoint
  const tokenResponse = await fetch('https://system.netsuite.com/app/login/oauth2/token.nl', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: redirectUri
    }).toString()
  })

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text()
    console.error('[oauth-callback] NetSuite token exchange failed', tokenResponse.status, errorText)
    await supabase
      .from('connections')
      .update({
        status: 'error',
        metadata: {
          ...metadata,
          oauth_state: null,
          oauth_error: 'token_exchange_failed',
          oauth_completed_at: new Date().toISOString(),
          oauth_error_detail: errorText
        }
      })
      .eq('id', connection.id)

    return redirectWithStatus('error', 'Failed to exchange authorization code with NetSuite')
  }

  interface NetSuiteTokenResponse {
    access_token: string
    token_type: string
    expires_in?: number
    refresh_token?: string
    scope: string
  }

  const payload = await tokenResponse.json() as NetSuiteTokenResponse

  const expiresAt = payload.expires_in ? new Date(Date.now() + payload.expires_in * 1000).toISOString() : null

  const encryptedCredentials = await encryptJson({
    access_token: payload.access_token,
    token_type: payload.token_type,
    refresh_token: payload.refresh_token,
    scope: payload.scope,
    expires_at: expiresAt,
    obtained_at: new Date().toISOString(),
    account_id: accountId
  })

  const { error: updateError } = await supabase
    .from('connections')
    .update({
      status: 'connected',
      credentials: {
        provider: 'netsuite',
        version: '2024-1',
        encrypted: encryptedCredentials
      },
      metadata: {
        ...metadata,
        oauth_state: null,
        oauth_error: null,
        oauth_completed_at: new Date().toISOString(),
        account_id: accountId
      },
      last_sync: null
    })
    .eq('id', connection.id)

  if (updateError) {
    console.error('[oauth-callback] Failed to persist NetSuite credentials', updateError)
    return redirectWithStatus('error', 'Failed to store NetSuite credentials')
  }

  return redirectWithStatus('success', 'NetSuite connection established')
}

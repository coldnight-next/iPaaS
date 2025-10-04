const allowedOrigin = Deno.env.get('OAUTH_ALLOWED_ORIGIN') || '*'

// Default CORS headers for simple cases
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
}

export function buildCorsHeaders(origin: string | null): HeadersInit {
  if (allowedOrigin === '*') {
    return corsHeaders
  }

  const incomingOrigin = origin ?? ''
  const allowList = allowedOrigin.split(',').map(value => value.trim()).filter(Boolean)
  const matchedOrigin = allowList.find(value => value === incomingOrigin)

  return {
    'Access-Control-Allow-Origin': matchedOrigin || allowList[0] || '',
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'authorization,content-type,sentry-trace,baggage'
  }
}

export function withCors(headers: HeadersInit, origin: string | null): HeadersInit {
  const corsHeaders = buildCorsHeaders(origin)
  return {
    ...corsHeaders,
    ...headers
  }
}
const allowedOrigin = Deno.env.get('OAUTH_ALLOWED_ORIGIN') || '*'

export function buildCorsHeaders(origin: string | null): HeadersInit {
  if (allowedOrigin === '*') {
    return {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'authorization,content-type,sentry-trace,baggage'
    }
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
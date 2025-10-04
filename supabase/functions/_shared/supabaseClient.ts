import { createClient, type User } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL') || Deno.env.get('SUPABASE_URL_INTERNAL')
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_KEY')

if (!supabaseUrl) {
  throw new Error('Missing SUPABASE_URL environment variable for edge functions')
}

if (!serviceKey) {
  throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY) environment variable for edge functions')
}

export const createSupabaseClient = <Database = Record<string, never>>() => {
  return createClient<Database>(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  })
}

export interface AuthenticatedRequest {
  user: User
  accessToken: string
}

export async function getUserFromRequest(req: Request): Promise<AuthenticatedRequest> {
  const authorization = req.headers.get('authorization') || req.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) {
    throw new Response(JSON.stringify({ error: 'Unauthorized', message: 'Missing bearer token' }), {
      status: 401,
      headers: { 'content-type': 'application/json' }
    })
  }

  const accessToken = authorization.replace('Bearer ', '').trim()
  if (!accessToken) {
    throw new Response(JSON.stringify({ error: 'Unauthorized', message: 'Missing bearer token' }), {
      status: 401,
      headers: { 'content-type': 'application/json' }
    })
  }

  const supabase = createSupabaseClient()
  const { data, error } = await supabase.auth.getUser(accessToken)
  if (error || !data?.user) {
    throw new Response(JSON.stringify({ error: 'Unauthorized', message: 'Invalid access token' }), {
      status: 401,
      headers: { 'content-type': 'application/json' }
    })
  }

  return { user: data.user, accessToken }
}
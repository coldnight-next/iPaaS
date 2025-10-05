import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

interface UpdateSettingRequest {
  key: string
  value: any
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get the authenticated user from the request
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if user is admin
    const { data: currentUserProfile, error: profileError } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('user_id', user.id)
      .single()

    if (profileError || currentUserProfile?.role !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'Forbidden: Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse request body
    const body: UpdateSettingRequest | UpdateSettingRequest[] = await req.json()
    const updates = Array.isArray(body) ? body : [body]

    const results = []
    const errors = []

    // Process each update
    for (const update of updates) {
      try {
        const { key, value } = update

        if (!key) {
          errors.push({ key, error: 'Setting key is required' })
          continue
        }

        // Get the setting to check if it's editable
        const { data: setting, error: fetchError } = await supabase
          .from('system_settings')
          .select('*')
          .eq('setting_key', key)
          .single()

        if (fetchError || !setting) {
          errors.push({ key, error: 'Setting not found' })
          continue
        }

        if (!setting.is_editable) {
          errors.push({ key, error: 'Setting is not editable' })
          continue
        }

        // Convert value to JSON string based on type
        let jsonValue: string
        switch (setting.setting_type) {
          case 'string':
            jsonValue = JSON.stringify(String(value))
            break
          case 'number':
            jsonValue = String(Number(value))
            break
          case 'boolean':
            jsonValue = String(Boolean(value))
            break
          case 'array':
          case 'json':
            jsonValue = JSON.stringify(value)
            break
          default:
            jsonValue = JSON.stringify(value)
        }

        // Update the setting
        const { data: updated, error: updateError } = await supabase
          .from('system_settings')
          .update({
            setting_value: jsonValue,
            updated_by: user.id
          })
          .eq('setting_key', key)
          .select()
          .single()

        if (updateError) {
          errors.push({ key, error: updateError.message })
          continue
        }

        results.push({
          key,
          value: JSON.parse(jsonValue),
          updated: true
        })
      } catch (error) {
        errors.push({
          key: update.key,
          error: error instanceof Error ? error.message : 'Update failed'
        })
      }
    }

    return new Response(
      JSON.stringify({
        success: errors.length === 0,
        updated: results.length,
        failed: errors.length,
        results,
        errors: errors.length > 0 ? errors : undefined
      }),
      {
        status: errors.length === updates.length ? 400 : 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

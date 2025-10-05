import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

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

    // Parse query parameters
    const url = new URL(req.url)
    const category = url.searchParams.get('category') || ''
    const key = url.searchParams.get('key') || ''

    // Build query
    let query = supabase
      .from('system_settings')
      .select('*')
      .order('category', { ascending: true })
      .order('display_name', { ascending: true })

    // Apply filters
    if (category) {
      query = query.eq('category', category)
    }
    
    if (key) {
      query = query.eq('setting_key', key)
    }

    const { data: settings, error: settingsError } = await query

    if (settingsError) {
      console.error('Error fetching settings:', settingsError)
      return new Response(
        JSON.stringify({ error: settingsError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Transform settings into a more usable format
    const settingsMap: Record<string, any> = {}
    const settingsByCategory: Record<string, any[]> = {}

    settings?.forEach(setting => {
      // Parse JSON value based on type
      let value = setting.setting_value
      try {
        value = JSON.parse(setting.setting_value)
      } catch {
        // If parsing fails, use as is
      }

      const settingData = {
        key: setting.setting_key,
        value,
        type: setting.setting_type,
        category: setting.category,
        displayName: setting.display_name,
        description: setting.description,
        isEditable: setting.is_editable,
        isPublic: setting.is_public,
        defaultValue: setting.default_value
      }

      // Add to flat map
      settingsMap[setting.setting_key] = value

      // Add to category grouping
      if (!settingsByCategory[setting.category]) {
        settingsByCategory[setting.category] = []
      }
      settingsByCategory[setting.category].push(settingData)
    })

    return new Response(
      JSON.stringify({
        settings: settingsMap,
        settingsByCategory,
        count: settings?.length || 0
      }),
      {
        status: 200,
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

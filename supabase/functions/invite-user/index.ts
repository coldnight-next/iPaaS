import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

interface InviteUserRequest {
  email: string
  firstName?: string
  lastName?: string
  role?: 'admin' | 'manager' | 'user' | 'viewer'
  department?: string
  jobTitle?: string
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
    const body: InviteUserRequest = await req.json()
    const { email, firstName, lastName, role = 'user', department, jobTitle } = body

    if (!email) {
      return new Response(
        JSON.stringify({ error: 'email is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: 'Invalid email format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('user_list')
      .select('email')
      .eq('email', email)
      .single()

    if (existingUser) {
      return new Response(
        JSON.stringify({ error: 'User with this email already exists' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create user using admin API
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email,
      email_confirm: false, // User will need to confirm their email
      user_metadata: {
        role,
        first_name: firstName,
        last_name: lastName,
        department,
        job_title: jobTitle,
        invited_by: user.id
      }
    })

    if (createError) {
      console.error('Error creating user:', createError)
      return new Response(
        JSON.stringify({ error: createError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // The user_profiles entry will be created automatically by the trigger
    // But we can also update it with additional information
    if (newUser.user) {
      const { error: profileUpdateError } = await supabase
        .from('user_profiles')
        .update({
          first_name: firstName,
          last_name: lastName,
          department,
          job_title: jobTitle,
          role,
          status: 'pending'
        })
        .eq('user_id', newUser.user.id)

      if (profileUpdateError) {
        console.error('Error updating profile:', profileUpdateError)
        // Don't fail the request, just log the error
      }
    }

    // Send invitation email (Supabase handles this automatically)
    const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${supabaseUrl}/auth/callback`
    })

    if (inviteError) {
      console.error('Error sending invitation:', inviteError)
      // User is created but email failed - log but don't fail
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'User invited successfully',
        user: {
          id: newUser.user?.id,
          email,
          role
        }
      }),
      {
        status: 201,
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

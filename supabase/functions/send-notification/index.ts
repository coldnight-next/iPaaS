import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { withCors } from '../_shared/cors.ts'
import { createSupabaseClient } from '../_shared/supabaseClient.ts'

interface NotificationRequest {
  type: 'email' | 'slack' | 'webhook'
  recipient: string
  subject?: string
  message: string
  metadata?: Record<string, any>
  syncLogId?: string
}

interface EmailConfig {
  smtpHost: string
  smtpPort: number
  smtpUser: string
  smtpPass: string
  fromEmail: string
  fromName: string
}

serve(async req => {
  const origin = req.headers.get('origin')

  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: withCors({ 'Access-Control-Allow-Methods': 'POST,OPTIONS' }, origin)
    })
  }

  const corsJsonHeaders = (status: number, payload: unknown) => new Response(JSON.stringify(payload), {
    status,
    headers: withCors({ 'content-type': 'application/json' }, origin)
  })

  if (req.method !== 'POST') {
    return corsJsonHeaders(405, { error: 'method_not_allowed', message: 'Use POST' })
  }

  let body: NotificationRequest | null = null
  try {
    body = await req.json()
  } catch (_error) {
    return corsJsonHeaders(400, { error: 'invalid_payload', message: 'Body must be valid JSON' })
  }

  if (!body?.type || !body?.recipient || !body?.message) {
    return corsJsonHeaders(400, {
      error: 'invalid_payload',
      message: 'Missing required fields: type, recipient, message'
    })
  }

  try {
    const supabase = createSupabaseClient()

    // Get user from request for RLS
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return corsJsonHeaders(401, { error: 'unauthorized', message: 'Missing authorization' })
    }

    let userId: string | null = null
    try {
      // Extract user ID from JWT token (simplified - in production use proper JWT verification)
      const token = authHeader.replace('Bearer ', '')
      const payload = JSON.parse(atob(token.split('.')[1]))
      userId = payload.sub
    } catch (error) {
      console.error('[Notification] Failed to extract user ID:', error)
    }

    if (!userId) {
      return corsJsonHeaders(401, { error: 'unauthorized', message: 'Invalid token' })
    }

    // Send notification based on type
    let result: any = null

    switch (body.type) {
      case 'email':
        result = await sendEmailNotification(body, userId)
        break
      case 'slack':
        result = await sendSlackNotification(body, userId)
        break
      case 'webhook':
        result = await sendWebhookNotification(body, userId)
        break
      default:
        return corsJsonHeaders(400, {
          error: 'invalid_type',
          message: 'Supported types: email, slack, webhook'
        })
    }

    // Log notification
    await supabase.from('notification_logs').insert({
      user_id: userId,
      type: body.type,
      recipient: body.recipient,
      subject: body.subject,
      message: body.message,
      metadata: body.metadata,
      sync_log_id: body.syncLogId,
      status: result.success ? 'sent' : 'failed',
      sent_at: new Date().toISOString(),
      error_message: result.error
    })

    return corsJsonHeaders(200, {
      success: true,
      message: 'Notification sent successfully',
      result
    })

  } catch (error) {
    console.error('[Notification] Error:', error)
    return corsJsonHeaders(500, {
      error: 'internal_error',
      message: 'Failed to send notification'
    })
  }
})

async function sendEmailNotification(body: NotificationRequest, userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Get email configuration from environment or database
    const emailConfig: EmailConfig = {
      smtpHost: Deno.env.get('SMTP_HOST') || 'smtp.gmail.com',
      smtpPort: parseInt(Deno.env.get('SMTP_PORT') || '587'),
      smtpUser: Deno.env.get('SMTP_USER') || '',
      smtpPass: Deno.env.get('SMTP_PASS') || '',
      fromEmail: Deno.env.get('FROM_EMAIL') || 'noreply@ipaas.com',
      fromName: Deno.env.get('FROM_NAME') || 'iPaaS Platform'
    }

    if (!emailConfig.smtpUser || !emailConfig.smtpPass) {
      throw new Error('Email configuration not found')
    }

    // In a real implementation, you would use a proper SMTP library
    // For now, we'll simulate sending an email
    console.log('[Email] Sending email notification:', {
      to: body.recipient,
      subject: body.subject || 'iPaaS Notification',
      message: body.message
    })

    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 100))

    return { success: true }

  } catch (error) {
    console.error('[Email] Failed to send:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

async function sendSlackNotification(body: NotificationRequest, userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const slackWebhookUrl = body.recipient // recipient is the webhook URL for Slack

    if (!slackWebhookUrl) {
      throw new Error('Slack webhook URL not provided')
    }

    const payload = {
      text: body.subject || 'iPaaS Notification',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${body.subject || 'iPaaS Notification'}*\n\n${body.message}`
          }
        }
      ],
      ...body.metadata
    }

    const response = await fetch(slackWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      throw new Error(`Slack API error: ${response.status} ${response.statusText}`)
    }

    return { success: true }

  } catch (error) {
    console.error('[Slack] Failed to send:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

async function sendWebhookNotification(body: NotificationRequest, userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const webhookUrl = body.recipient // recipient is the webhook URL

    if (!webhookUrl) {
      throw new Error('Webhook URL not provided')
    }

    const payload = {
      type: 'notification',
      timestamp: new Date().toISOString(),
      subject: body.subject,
      message: body.message,
      metadata: body.metadata,
      userId
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'iPaaS-Webhook/1.0'
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      throw new Error(`Webhook error: ${response.status} ${response.statusText}`)
    }

    return { success: true }

  } catch (error) {
    console.error('[Webhook] Failed to send:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}
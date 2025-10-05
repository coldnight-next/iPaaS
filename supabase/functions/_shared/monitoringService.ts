// Monitoring Service
// Collects performance metrics, system health data, and provides alerting capabilities

import { createSupabaseClient } from './supabaseClient.ts'

export interface SystemMetrics {
  timestamp: Date
  userId: string
  syncLogId?: string
  metricType: 'performance' | 'error' | 'api_usage' | 'system_health'
  metricName: string
  value: number
  unit: string
  metadata?: Record<string, any>
}

export interface AlertRule {
  id: string
  userId: string
  name: string
  description: string
  metricName: string
  condition: 'greater_than' | 'less_than' | 'equals' | 'not_equals'
  threshold: number
  severity: 'low' | 'medium' | 'high' | 'critical'
  enabled: boolean
  notificationChannels: ('email' | 'slack' | 'webhook')[]
  cooldownMinutes: number
  lastTriggered?: Date
}

export interface Alert {
  id: string
  alertRuleId: string
  userId: string
  message: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  status: 'active' | 'acknowledged' | 'resolved'
  triggeredAt: Date
  resolvedAt?: Date
  metadata?: Record<string, any>
}

export class MonitoringService {
  private supabase = createSupabaseClient()

  // Record performance metrics
  async recordMetric(metric: Omit<SystemMetrics, 'timestamp'>): Promise<void> {
    try {
      await this.supabase.from('system_metrics').insert({
        ...metric,
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error('[Monitoring] Failed to record metric:', error)
    }
  }

  // Record sync performance metrics
  async recordSyncMetrics(
    userId: string,
    syncLogId: string,
    metrics: {
      duration: number
      itemsProcessed: number
      itemsSucceeded: number
      itemsFailed: number
      apiCalls: number
      errors: string[]
    }
  ): Promise<void> {
    const metricsToRecord: Omit<SystemMetrics, 'timestamp'>[] = [
      {
        userId,
        syncLogId,
        metricType: 'performance',
        metricName: 'sync_duration_seconds',
        value: metrics.duration,
        unit: 'seconds',
        metadata: { syncLogId }
      },
      {
        userId,
        syncLogId,
        metricType: 'performance',
        metricName: 'sync_items_processed',
        value: metrics.itemsProcessed,
        unit: 'count',
        metadata: { syncLogId }
      },
      {
        userId,
        syncLogId,
        metricType: 'performance',
        metricName: 'sync_success_rate',
        value: metrics.itemsProcessed > 0 ? (metrics.itemsSucceeded / metrics.itemsProcessed) * 100 : 0,
        unit: 'percentage',
        metadata: { syncLogId }
      },
      {
        userId,
        syncLogId,
        metricType: 'api_usage',
        metricName: 'api_calls_made',
        value: metrics.apiCalls,
        unit: 'count',
        metadata: { syncLogId }
      }
    ]

    // Record error metrics
    if (metrics.errors.length > 0) {
      metricsToRecord.push({
        userId,
        syncLogId,
        metricType: 'error',
        metricName: 'sync_errors_count',
        value: metrics.errors.length,
        unit: 'count',
        metadata: { syncLogId, errors: metrics.errors }
      })
    }

    // Record all metrics
    await Promise.all(metricsToRecord.map(metric => this.recordMetric(metric)))
  }

  // Record API usage metrics
  async recordApiUsage(
    userId: string,
    platform: 'netsuite' | 'shopify',
    operation: string,
    responseTime: number,
    success: boolean,
    errorMessage?: string
  ): Promise<void> {
    await this.recordMetric({
      userId,
      metricType: 'api_usage',
      metricName: `${platform}_api_${operation}`,
      value: responseTime,
      unit: 'milliseconds',
      metadata: {
        platform,
        operation,
        success,
        errorMessage
      }
    })
  }

  // Check alert rules and trigger alerts
  async checkAlerts(userId: string): Promise<void> {
    const alertRules = await this.getActiveAlertRules(userId)

    for (const rule of alertRules) {
      try {
        const shouldTrigger = await this.evaluateAlertRule(rule)

        if (shouldTrigger) {
          await this.triggerAlert(rule)
        }
      } catch (error) {
        console.error(`[Monitoring] Error checking alert rule ${rule.id}:`, error)
      }
    }
  }

  // Evaluate if an alert rule should trigger
  private async evaluateAlertRule(rule: AlertRule): Promise<boolean> {
    // Check cooldown period
    if (rule.lastTriggered) {
      const cooldownEnd = new Date(rule.lastTriggered.getTime() + rule.cooldownMinutes * 60 * 1000)
      if (new Date() < cooldownEnd) {
        return false // Still in cooldown
      }
    }

    // Get recent metrics for this rule
    const { data: metrics } = await this.supabase
      .from('system_metrics')
      .select('value')
      .eq('user_id', rule.userId)
      .eq('metric_name', rule.metricName)
      .gte('timestamp', new Date(Date.now() - 5 * 60 * 1000).toISOString()) // Last 5 minutes
      .order('timestamp', { ascending: false })
      .limit(1)

    if (!metrics || metrics.length === 0) {
      return false
    }

    const currentValue = metrics[0].value

    // Evaluate condition
    switch (rule.condition) {
      case 'greater_than':
        return currentValue > rule.threshold
      case 'less_than':
        return currentValue < rule.threshold
      case 'equals':
        return currentValue === rule.threshold
      case 'not_equals':
        return currentValue !== rule.threshold
      default:
        return false
    }
  }

  // Trigger an alert
  private async triggerAlert(rule: AlertRule): Promise<void> {
    const alert: Omit<Alert, 'id'> = {
      alertRuleId: rule.id,
      userId: rule.userId,
      message: `${rule.name}: ${rule.metricName} is ${rule.condition.replace('_', ' ')} ${rule.threshold}`,
      severity: rule.severity,
      status: 'active',
      triggeredAt: new Date(),
      metadata: {
        metricName: rule.metricName,
        condition: rule.condition,
        threshold: rule.threshold
      }
    }

    // Create alert record
    const { data: alertRecord } = await this.supabase
      .from('alerts')
      .insert(alert)
      .select()
      .single()

    if (alertRecord) {
      // Send notifications
      await this.sendAlertNotifications(rule, alertRecord)

      // Update last triggered timestamp
      await this.supabase
        .from('alert_rules')
        .update({ last_triggered: new Date().toISOString() })
        .eq('id', rule.id)
    }
  }

  // Send alert notifications
  private async sendAlertNotifications(rule: AlertRule, alert: Alert): Promise<void> {
    const notificationPromises: Promise<void>[] = []

    if (rule.notificationChannels.includes('email')) {
      notificationPromises.push(this.sendEmailAlert(rule, alert))
    }

    if (rule.notificationChannels.includes('slack')) {
      notificationPromises.push(this.sendSlackAlert(rule, alert))
    }

    if (rule.notificationChannels.includes('webhook')) {
      notificationPromises.push(this.sendWebhookAlert(rule, alert))
    }

    await Promise.all(notificationPromises)
  }

  // Send email alert
  private async sendEmailAlert(rule: AlertRule, alert: Alert): Promise<void> {
    try {
      // Get user's email from auth
      const { data: user } = await this.supabase.auth.admin.getUserById(rule.userId)

      if (user?.email) {
        await this.supabase.functions.invoke('send-notification', {
          body: {
            type: 'email',
            recipient: user.email,
            subject: `Alert: ${rule.name}`,
            message: alert.message,
            metadata: {
              alertId: alert.id,
              severity: alert.severity,
              ruleId: rule.id
            }
          }
        })
      }
    } catch (error) {
      console.error('[Monitoring] Failed to send email alert:', error)
    }
  }

  // Send Slack alert
  private async sendSlackAlert(rule: AlertRule, alert: Alert): Promise<void> {
    try {
      // Get user's Slack webhook from settings
      const { data: settings } = await this.supabase
        .from('sync_configurations')
        .select('config_value')
        .eq('user_id', rule.userId)
        .eq('config_key', 'notification_settings')
        .single()

      const slackWebhook = settings?.config_value?.slackWebhook

      if (slackWebhook) {
        await this.supabase.functions.invoke('send-notification', {
          body: {
            type: 'slack',
            recipient: slackWebhook,
            subject: `Alert: ${rule.name}`,
            message: alert.message,
            metadata: {
              alertId: alert.id,
              severity: alert.severity,
              ruleId: rule.id
            }
          }
        })
      }
    } catch (error) {
      console.error('[Monitoring] Failed to send Slack alert:', error)
    }
  }

  // Send webhook alert
  private async sendWebhookAlert(rule: AlertRule, alert: Alert): Promise<void> {
    try {
      // Get user's webhook URL from settings
      const { data: settings } = await this.supabase
        .from('sync_configurations')
        .select('config_value')
        .eq('user_id', rule.userId)
        .eq('config_key', 'notification_settings')
        .single()

      const webhookUrl = settings?.config_value?.webhookUrl

      if (webhookUrl) {
        await this.supabase.functions.invoke('send-notification', {
          body: {
            type: 'webhook',
            recipient: webhookUrl,
            subject: `Alert: ${rule.name}`,
            message: alert.message,
            metadata: {
              alertId: alert.id,
              severity: alert.severity,
              ruleId: rule.id
            }
          }
        })
      }
    } catch (error) {
      console.error('[Monitoring] Failed to send webhook alert:', error)
    }
  }

  // Get active alert rules for a user
  async getActiveAlertRules(userId: string): Promise<AlertRule[]> {
    const { data, error } = await this.supabase
      .from('alert_rules')
      .select('*')
      .eq('user_id', userId)
      .eq('enabled', true)

    if (error) {
      console.error('[Monitoring] Failed to get alert rules:', error)
      return []
    }

    return (data || []).map(rule => ({
      ...rule,
      lastTriggered: rule.last_triggered ? new Date(rule.last_triggered) : undefined
    }))
  }

  // Create an alert rule
  async createAlertRule(rule: Omit<AlertRule, 'id'>): Promise<AlertRule | null> {
    const { data, error } = await this.supabase
      .from('alert_rules')
      .insert(rule)
      .select()
      .single()

    if (error) {
      console.error('[Monitoring] Failed to create alert rule:', error)
      return null
    }

    return {
      ...data,
      lastTriggered: data.last_triggered ? new Date(data.last_triggered) : undefined
    }
  }

  // Get system health metrics
  async getSystemHealth(userId: string): Promise<{
    syncSuccessRate: number
    averageSyncDuration: number
    errorRate: number
    apiResponseTime: number
    activeAlerts: number
  }> {
    // Get metrics from the last 24 hours
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const { data: metrics } = await this.supabase
      .from('system_metrics')
      .select('*')
      .eq('user_id', userId)
      .gte('timestamp', since)

    const { data: alerts } = await this.supabase
      .from('alerts')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'active')

    // Calculate health metrics
    const syncMetrics = metrics?.filter(m => m.metric_name.includes('sync_')) || []
    const errorMetrics = metrics?.filter(m => m.metric_name.includes('error')) || []
    const apiMetrics = metrics?.filter(m => m.metric_name.includes('api_')) || []

    const syncSuccessRate = syncMetrics.find(m => m.metric_name === 'sync_success_rate')?.value || 0
    const averageSyncDuration = syncMetrics
      .filter(m => m.metric_name === 'sync_duration_seconds')
      .reduce((sum, m) => sum + m.value, 0) / Math.max(syncMetrics.filter(m => m.metric_name === 'sync_duration_seconds').length, 1)

    const errorRate = errorMetrics.length > 0 ?
      errorMetrics.reduce((sum, m) => sum + m.value, 0) / errorMetrics.length : 0

    const apiResponseTime = apiMetrics.length > 0 ?
      apiMetrics.reduce((sum, m) => sum + m.value, 0) / apiMetrics.length : 0

    return {
      syncSuccessRate,
      averageSyncDuration,
      errorRate,
      apiResponseTime,
      activeAlerts: alerts?.length || 0
    }
  }

  // Acknowledge an alert
  async acknowledgeAlert(alertId: string, userId: string): Promise<boolean> {
    const { error } = await this.supabase
      .from('alerts')
      .update({
        status: 'acknowledged',
        resolved_at: new Date().toISOString()
      })
      .eq('id', alertId)
      .eq('user_id', userId)

    return !error
  }
}

// Export singleton instance
export const monitoringService = new MonitoringService()
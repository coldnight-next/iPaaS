import { createSupabaseClient } from './supabaseClient.ts'

export interface AlertData {
  userId: string
  alertType: 'sync_failure' | 'api_rate_limit' | 'connection_error' | 'performance_degradation' | 'system_error'
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  title: string
  message: string
  source?: string
  metadata?: Record<string, any>
}

export interface QueueItem {
  userId: string
  syncType: 'manual' | 'scheduled' | 'webhook' | 'bulk'
  direction: 'netsuite_to_shopify' | 'shopify_to_netsuite' | 'bidirectional'
  priority?: number
  estimatedItems?: number
  metadata?: Record<string, any>
}

export interface SessionData {
  userId: string
  syncLogId: string
  syncType: string
  direction: string
  totalItems: number
  metadata?: Record<string, any>
}

export class MonitoringService {
  private supabase = createSupabaseClient()

  // Alert Management
  async createAlert(alertData: AlertData): Promise<string> {
    const { data, error } = await this.supabase
      .from('system_alerts')
      .insert([{
        user_id: alertData.userId,
        alert_type: alertData.alertType,
        severity: alertData.severity,
        title: alertData.title,
        message: alertData.message,
        source: alertData.source,
        metadata: alertData.metadata || {}
      }])
      .select('id')
      .single()

    if (error) throw error
    return data.id
  }

  async acknowledgeAlert(alertId: string, userId: string): Promise<void> {
    const { error } = await this.supabase
      .from('system_alerts')
      .update({
        is_acknowledged: true,
        acknowledged_at: new Date().toISOString(),
        acknowledged_by: userId
      })
      .eq('id', alertId)

    if (error) throw error
  }

  async resolveAlert(alertId: string, userId: string): Promise<void> {
    const { error } = await this.supabase
      .from('system_alerts')
      .update({
        is_resolved: true,
        resolved_at: new Date().toISOString(),
        resolved_by: userId
      })
      .eq('id', alertId)

    if (error) throw error
  }

  // Queue Management
  async addToQueue(queueData: QueueItem): Promise<string> {
    const { data, error } = await this.supabase
      .from('sync_queue')
      .insert([{
        user_id: queueData.userId,
        sync_type: queueData.syncType,
        direction: queueData.direction,
        priority: queueData.priority || 1,
        estimated_items: queueData.estimatedItems || 0,
        metadata: queueData.metadata || {}
      }])
      .select('id')
      .single()

    if (error) throw error
    return data.id
  }

  async updateQueueStatus(
    queueId: string,
    status: 'queued' | 'processing' | 'paused' | 'completed' | 'failed',
    updates: {
      processedItems?: number
      failedItems?: number
      currentOperation?: string
      errorMessage?: string
    } = {}
  ): Promise<void> {
    const updateData: any = {
      status,
      updated_at: new Date().toISOString()
    }

    if (status === 'processing' && !updates.processedItems) {
      updateData.started_at = new Date().toISOString()
    }

    if (status === 'completed' || status === 'failed') {
      updateData.completed_at = new Date().toISOString()
    }

    if (updates.processedItems !== undefined) {
      updateData.processed_items = updates.processedItems
      const estimated = await this.getQueueItem(queueId).then(item => item?.estimated_items || 0)
      updateData.progress_percentage = estimated > 0 ? (updates.processedItems / estimated) * 100 : 0
    }

    if (updates.failedItems !== undefined) {
      updateData.failed_items = updates.failedItems
    }

    if (updates.currentOperation) {
      updateData.current_operation = updates.currentOperation
    }

    if (updates.errorMessage) {
      updateData.error_message = updates.errorMessage
    }

    const { error } = await this.supabase
      .from('sync_queue')
      .update(updateData)
      .eq('id', queueId)

    if (error) throw error
  }

  async getQueueItem(queueId: string) {
    const { data, error } = await this.supabase
      .from('sync_queue')
      .select('*')
      .eq('id', queueId)
      .single()

    if (error) throw error
    return data
  }

  // Active Session Management
  async startSession(sessionData: SessionData): Promise<string> {
    const { data, error } = await this.supabase
      .from('active_sync_sessions')
      .insert([{
        user_id: sessionData.userId,
        sync_log_id: sessionData.syncLogId,
        sync_type: sessionData.syncType,
        direction: sessionData.direction,
        total_items: sessionData.totalItems,
        status: 'running',
        metadata: sessionData.metadata || {}
      }])
      .select('id')
      .single()

    if (error) throw error
    return data.id
  }

  async updateSession(
    sessionId: string,
    updates: {
      processedItems?: number
      currentItemSku?: string
      itemsPerSecond?: number
      elapsedSeconds?: number
      estimatedRemainingSeconds?: number
      status?: 'running' | 'paused' | 'completed' | 'failed'
    }
  ): Promise<void> {
    const updateData: any = {
      last_updated: new Date().toISOString()
    }

    if (updates.processedItems !== undefined) {
      updateData.processed_items = updates.processedItems
    }

    if (updates.currentItemSku) {
      updateData.current_item_sku = updates.currentItemSku
    }

    if (updates.itemsPerSecond !== undefined) {
      updateData.items_per_second = updates.itemsPerSecond
    }

    if (updates.elapsedSeconds !== undefined) {
      updateData.elapsed_seconds = updates.elapsedSeconds
    }

    if (updates.estimatedRemainingSeconds !== undefined) {
      updateData.estimated_remaining_seconds = updates.estimatedRemainingSeconds
    }

    if (updates.status) {
      updateData.status = updates.status
    }

    const { error } = await this.supabase
      .from('active_sync_sessions')
      .update(updateData)
      .eq('id', sessionId)

    if (error) throw error
  }

  async endSession(sessionId: string): Promise<void> {
    const { error } = await this.supabase
      .from('active_sync_sessions')
      .delete()
      .eq('id', sessionId)

    if (error) throw error
  }

  // Performance Metrics
  async recordPerformanceMetrics(userId: string): Promise<void> {
    const now = new Date()
    const hourStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours())
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const weekStart = new Date(dayStart.getTime() - (dayStart.getDay() * 24 * 60 * 60 * 1000))
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    // Create performance stats for different periods
    await this.supabase.rpc('create_performance_stats', {
      p_user_id: userId,
      p_period_start: hourStart.toISOString(),
      p_period_end: now.toISOString(),
      p_time_period: 'hour'
    })

    await this.supabase.rpc('create_performance_stats', {
      p_user_id: userId,
      p_period_start: dayStart.toISOString(),
      p_period_end: now.toISOString(),
      p_time_period: 'day'
    })

    await this.supabase.rpc('create_performance_stats', {
      p_user_id: userId,
      p_period_start: weekStart.toISOString(),
      p_period_end: now.toISOString(),
      p_time_period: 'week'
    })

    await this.supabase.rpc('create_performance_stats', {
      p_user_id: userId,
      p_period_start: monthStart.toISOString(),
      p_period_end: now.toISOString(),
      p_time_period: 'month'
    })
  }

  // Alert Triggers
  async checkAndCreateAlerts(userId: string): Promise<void> {
    // Check for high error rates
    const { data: recentStats } = await this.supabase
      .from('sync_performance_stats')
      .select('*')
      .eq('user_id', userId)
      .eq('time_period', 'hour')
      .order('period_start', { ascending: false })
      .limit(1)
      .single()

    if (recentStats && recentStats.error_rate_percentage > 50) {
      await this.createAlert({
        userId,
        alertType: 'performance_degradation',
        severity: 'high',
        title: 'High Error Rate Detected',
        message: `Error rate is ${recentStats.error_rate_percentage.toFixed(1)}% in the last hour`,
        source: 'performance_monitor'
      })
    }

    // Check for failed syncs
    const { data: recentLogs } = await this.supabase
      .from('sync_logs')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'failed')
      .gte('started_at', new Date(Date.now() - 60 * 60 * 1000).toISOString()) // Last hour

    if (recentLogs && recentLogs.length >= 3) {
      await this.createAlert({
        userId,
        alertType: 'sync_failure',
        severity: 'critical',
        title: 'Multiple Sync Failures',
        message: `${recentLogs.length} sync operations failed in the last hour`,
        source: 'sync_monitor'
      })
    }
  }
}

// Export singleton instance
export const monitoringService = new MonitoringService()
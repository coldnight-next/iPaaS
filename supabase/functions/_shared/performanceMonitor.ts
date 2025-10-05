// Performance Monitoring and APM System
// Tracks function performance, creates alerts, and provides insights

import { createSupabaseClient } from './supabaseClient.ts'

export interface PerformanceMetric {
  functionName: string
  executionTime: number
  memoryUsage?: number
  status: 'success' | 'error' | 'timeout'
  timestamp: Date
  metadata?: Record<string, any>
}

export interface AlertRule {
  id: string
  name: string
  condition: {
    metric: string
    operator: '>' | '<' | '>=' | '<=' | '=='
    threshold: number
    duration?: number // in minutes
  }
  severity: 'low' | 'medium' | 'high' | 'critical'
  enabled: boolean
  cooldownMinutes: number
  lastTriggered?: Date
}

export class PerformanceMonitor {
  private supabase = createSupabaseClient()
  private metrics: PerformanceMetric[] = []
  private alertRules: AlertRule[] = []

  // Record a performance metric
  async recordMetric(metric: PerformanceMetric): Promise<void> {
    this.metrics.push(metric)

    // Store in database for historical analysis
    try {
      await this.supabase.from('performance_metrics').insert({
        function_name: metric.functionName,
        execution_time_ms: metric.executionTime,
        memory_usage_mb: metric.memoryUsage,
        status: metric.status,
        timestamp: metric.timestamp.toISOString(),
        metadata: metric.metadata || {}
      })
    } catch (error) {
      console.error('[PerformanceMonitor] Failed to store metric:', error)
    }

    // Check alert rules
    await this.checkAlertRules(metric)
  }

  // Performance monitoring wrapper for functions
  async monitorFunction<T>(
    functionName: string,
    fn: () => Promise<T>,
    metadata?: Record<string, any>
  ): Promise<T> {
    const startTime = performance.now()
    const startMemory = this.getMemoryUsage()

    try {
      const result = await fn()
      const endTime = performance.now()
      const endMemory = this.getMemoryUsage()

      await this.recordMetric({
        functionName,
        executionTime: endTime - startTime,
        memoryUsage: endMemory - startMemory,
        status: 'success',
        timestamp: new Date(),
        metadata
      })

      return result
    } catch (error) {
      const endTime = performance.now()

      await this.recordMetric({
        functionName,
        executionTime: endTime - startTime,
        status: 'error',
        timestamp: new Date(),
        metadata: { ...metadata, error: error instanceof Error ? error.message : String(error) }
      })

      throw error
    }
  }

  // Load alert rules from database
  async loadAlertRules(): Promise<void> {
    try {
      const { data } = await this.supabase
        .from('alert_rules')
        .select('*')
        .eq('enabled', true)

      this.alertRules = (data || []).map(rule => ({
        id: rule.id,
        name: rule.name,
        condition: rule.condition,
        severity: rule.severity,
        enabled: rule.enabled,
        cooldownMinutes: rule.cooldown_minutes,
        lastTriggered: rule.last_triggered ? new Date(rule.last_triggered) : undefined
      }))
    } catch (error) {
      console.error('[PerformanceMonitor] Failed to load alert rules:', error)
    }
  }

  // Check if any alert rules are triggered
  private async checkAlertRules(metric: PerformanceMetric): Promise<void> {
    for (const rule of this.alertRules) {
      if (this.shouldTriggerAlert(rule, metric)) {
        await this.createAlert(rule, metric)
        rule.lastTriggered = new Date()
      }
    }
  }

  private shouldTriggerAlert(rule: AlertRule, metric: PerformanceMetric): boolean {
    // Check cooldown
    if (rule.lastTriggered) {
      const cooldownEnd = new Date(rule.lastTriggered.getTime() + rule.cooldownMinutes * 60 * 1000)
      if (new Date() < cooldownEnd) {
        return false
      }
    }

    // Evaluate condition
    const value = this.getMetricValue(metric, rule.condition.metric)
    if (value === undefined) return false

    switch (rule.condition.operator) {
      case '>': return value > rule.condition.threshold
      case '<': return value < rule.condition.threshold
      case '>=': return value >= rule.condition.threshold
      case '<=': return value <= rule.condition.threshold
      case '==': return value === rule.condition.threshold
      default: return false
    }
  }

  private getMetricValue(metric: PerformanceMetric, metricName: string): number | undefined {
    switch (metricName) {
      case 'execution_time': return metric.executionTime
      case 'memory_usage': return metric.memoryUsage
      default: return undefined
    }
  }

  private async createAlert(rule: AlertRule, metric: PerformanceMetric): Promise<void> {
    try {
      await this.supabase.from('alerts').insert({
        alert_rule_id: rule.id,
        message: `${rule.name}: ${metric.functionName} ${rule.condition.metric} ${rule.condition.operator} ${rule.condition.threshold} (${this.getMetricValue(metric, rule.condition.metric)} actual)`,
        severity: rule.severity,
        status: 'active',
        triggered_at: new Date().toISOString(),
        metadata: {
          functionName: metric.functionName,
          metric: rule.condition.metric,
          threshold: rule.condition.threshold,
          actualValue: this.getMetricValue(metric, rule.condition.metric),
          executionTime: metric.executionTime,
          memoryUsage: metric.memoryUsage
        }
      })

      console.warn(`[PerformanceMonitor] Alert triggered: ${rule.name}`)
    } catch (error) {
      console.error('[PerformanceMonitor] Failed to create alert:', error)
    }
  }

  // Get performance statistics
  async getPerformanceStats(functionName?: string, hours: number = 24): Promise<{
    averageExecutionTime: number
    maxExecutionTime: number
    minExecutionTime: number
    errorRate: number
    totalCalls: number
    p95ExecutionTime: number
  }> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000)

    let query = this.supabase
      .from('performance_metrics')
      .select('*')
      .gte('timestamp', since.toISOString())

    if (functionName) {
      query = query.eq('function_name', functionName)
    }

    const { data } = await query

    if (!data || data.length === 0) {
      return {
        averageExecutionTime: 0,
        maxExecutionTime: 0,
        minExecutionTime: 0,
        errorRate: 0,
        totalCalls: 0,
        p95ExecutionTime: 0
      }
    }

    const executionTimes = data.map(d => d.execution_time_ms).sort((a, b) => a - b)
    const errors = data.filter(d => d.status === 'error').length

    return {
      averageExecutionTime: executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length,
      maxExecutionTime: Math.max(...executionTimes),
      minExecutionTime: Math.min(...executionTimes),
      errorRate: errors / data.length,
      totalCalls: data.length,
      p95ExecutionTime: executionTimes[Math.floor(executionTimes.length * 0.95)]
    }
  }

  private getMemoryUsage(): number {
    // Deno memory usage in MB
    try {
      // @ts-ignore - Deno specific
      const memInfo = Deno.memoryUsage?.()
      return memInfo ? (memInfo.heapUsed + memInfo.external) / 1024 / 1024 : 0
    } catch {
      return 0
    }
  }
}

// Export singleton instance
export const performanceMonitor = new PerformanceMonitor()

// Initialize alert rules on startup
performanceMonitor.loadAlertRules().catch(console.error)
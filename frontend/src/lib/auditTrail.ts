// Comprehensive Audit Trail and Logging System
// Tracks all operations, changes, and system events for compliance and debugging

export enum AuditEventType {
  // User Actions
  USER_LOGIN = 'user_login',
  USER_LOGOUT = 'user_logout',
  USER_CREATED = 'user_created',
  USER_UPDATED = 'user_updated',
  USER_DELETED = 'user_deleted',

  // Connection Actions
  CONNECTION_CREATED = 'connection_created',
  CONNECTION_UPDATED = 'connection_updated',
  CONNECTION_DELETED = 'connection_deleted',
  CONNECTION_TESTED = 'connection_tested',

  // Sync Operations
  SYNC_STARTED = 'sync_started',
  SYNC_COMPLETED = 'sync_completed',
  SYNC_FAILED = 'sync_failed',
  SYNC_CANCELLED = 'sync_cancelled',

  // Data Operations
  DATA_CREATED = 'data_created',
  DATA_UPDATED = 'data_updated',
  DATA_DELETED = 'data_deleted',
  DATA_IMPORTED = 'data_imported',
  DATA_EXPORTED = 'data_exported',

  // Configuration Changes
  CONFIG_UPDATED = 'config_updated',
  SETTINGS_CHANGED = 'settings_changed',

  // System Events
  SYSTEM_STARTUP = 'system_startup',
  SYSTEM_SHUTDOWN = 'system_shutdown',
  BACKUP_CREATED = 'backup_created',
  BACKUP_RESTORED = 'backup_restored',

  // Error Events
  ERROR_OCCURRED = 'error_occurred',
  ERROR_RESOLVED = 'error_resolved',

  // Security Events
  SECURITY_VIOLATION = 'security_violation',
  PERMISSION_CHANGED = 'permission_changed'
}

export enum AuditSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export interface AuditEntry {
  id: string
  timestamp: Date
  eventType: AuditEventType
  severity: AuditSeverity
  userId?: string
  sessionId?: string
  resourceType?: string
  resourceId?: string
  action: string
  description: string
  metadata: Record<string, any>
  ipAddress?: string
  userAgent?: string
  oldValues?: Record<string, any>
  newValues?: Record<string, any>
  success: boolean
  errorMessage?: string
  processingTime?: number // in milliseconds
}

export interface AuditQuery {
  startDate?: Date
  endDate?: Date
  eventTypes?: AuditEventType[]
  severities?: AuditSeverity[]
  userId?: string
  resourceType?: string
  resourceId?: string
  success?: boolean
  limit?: number
  offset?: number
}

export interface AuditStats {
  totalEvents: number
  eventsByType: Record<AuditEventType, number>
  eventsBySeverity: Record<AuditSeverity, number>
  eventsByDay: Array<{ date: string; count: number }>
  topUsers: Array<{ userId: string; count: number }>
  errorRate: number
  averageProcessingTime: number
}

export class AuditTrail {
  private static instance: AuditTrail
  private entries: AuditEntry[] = []
  private maxEntries: number = 10000 // Keep last 10k entries in memory
  private listeners: Array<(entry: AuditEntry) => void> = []

  private constructor() {}

  static getInstance(): AuditTrail {
    if (!AuditTrail.instance) {
      AuditTrail.instance = new AuditTrail()
    }
    return AuditTrail.instance
  }

  // Log an audit event
  log(entry: Omit<AuditEntry, 'id' | 'timestamp'>): string {
    const auditEntry: AuditEntry = {
      id: this.generateId(),
      timestamp: new Date(),
      ...entry
    }

    this.entries.push(auditEntry)

    // Maintain max entries limit
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries)
    }

    // Notify listeners
    this.listeners.forEach(listener => {
      try {
        listener(auditEntry)
      } catch (error) {
        console.error('Audit listener error:', error)
      }
    })

    // Log to console in development
    if (import.meta.env.DEV) {
      console.log('[AUDIT]', auditEntry.eventType, auditEntry.description, auditEntry.metadata)
    }

    return auditEntry.id
  }

  // Convenience methods for common events
  logUserAction(
    eventType: AuditEventType,
    userId: string,
    action: string,
    description: string,
    metadata: Record<string, any> = {},
    success: boolean = true
  ): string {
    return this.log({
      eventType,
      severity: AuditSeverity.MEDIUM,
      userId,
      action,
      description,
      metadata,
      success
    })
  }

  logSystemEvent(
    eventType: AuditEventType,
    severity: AuditSeverity,
    description: string,
    metadata: Record<string, any> = {}
  ): string {
    return this.log({
      eventType,
      severity,
      action: 'system',
      description,
      metadata,
      success: true
    })
  }

  logDataOperation(
    eventType: AuditEventType,
    userId: string,
    resourceType: string,
    resourceId: string,
    action: string,
    description: string,
    oldValues?: Record<string, any>,
    newValues?: Record<string, any>,
    success: boolean = true,
    processingTime?: number
  ): string {
    return this.log({
      eventType,
      severity: success ? AuditSeverity.LOW : AuditSeverity.MEDIUM,
      userId,
      resourceType,
      resourceId,
      action,
      description,
      oldValues,
      newValues,
      success,
      processingTime,
      metadata: {
        resourceType,
        resourceId,
        hasOldValues: !!oldValues,
        hasNewValues: !!newValues
      }
    })
  }

  logSyncOperation(
    eventType: AuditEventType,
    userId: string,
    syncId: string,
    description: string,
    metadata: Record<string, any> = {},
    success: boolean = true,
    processingTime?: number
  ): string {
    return this.log({
      eventType,
      severity: success ? AuditSeverity.LOW : AuditSeverity.HIGH,
      userId,
      resourceType: 'sync',
      resourceId: syncId,
      action: 'sync',
      description,
      metadata,
      success,
      processingTime
    })
  }

  logError(
    error: Error,
    context: {
      userId?: string
      resourceType?: string
      resourceId?: string
      action?: string
      metadata?: Record<string, any>
    } = {}
  ): string {
    return this.log({
      eventType: AuditEventType.ERROR_OCCURRED,
      severity: AuditSeverity.HIGH,
      userId: context.userId,
      resourceType: context.resourceType,
      resourceId: context.resourceId,
      action: context.action || 'error',
      description: `Error occurred: ${error.message}`,
      metadata: {
        errorName: error.name,
        errorMessage: error.message,
        stack: error.stack,
        ...context.metadata
      },
      success: false,
      errorMessage: error.message
    })
  }

  // Query audit entries
  query(query: AuditQuery): AuditEntry[] {
    let results = [...this.entries]

    if (query.startDate) {
      results = results.filter(entry => entry.timestamp >= query.startDate!)
    }

    if (query.endDate) {
      results = results.filter(entry => entry.timestamp <= query.endDate!)
    }

    if (query.eventTypes && query.eventTypes.length > 0) {
      results = results.filter(entry => query.eventTypes!.includes(entry.eventType))
    }

    if (query.severities && query.severities.length > 0) {
      results = results.filter(entry => query.severities!.includes(entry.severity))
    }

    if (query.userId) {
      results = results.filter(entry => entry.userId === query.userId)
    }

    if (query.resourceType) {
      results = results.filter(entry => entry.resourceType === query.resourceType)
    }

    if (query.resourceId) {
      results = results.filter(entry => entry.resourceId === query.resourceId)
    }

    if (query.success !== undefined) {
      results = results.filter(entry => entry.success === query.success)
    }

    // Sort by timestamp descending (newest first)
    results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())

    // Apply pagination
    const offset = query.offset || 0
    const limit = query.limit || results.length
    return results.slice(offset, offset + limit)
  }

  // Get statistics
  getStats(query: AuditQuery = {}): AuditStats {
    const entries = this.query({ ...query, limit: undefined, offset: undefined })

    const eventsByType = entries.reduce((acc, entry) => {
      acc[entry.eventType] = (acc[entry.eventType] || 0) + 1
      return acc
    }, {} as Record<AuditEventType, number>)

    const eventsBySeverity = entries.reduce((acc, entry) => {
      acc[entry.severity] = (acc[entry.severity] || 0) + 1
      return acc
    }, {} as Record<AuditSeverity, number>)

    // Events by day (last 30 days)
    const last30Days = Array.from({ length: 30 }, (_, i) => {
      const date = new Date()
      date.setDate(date.getDate() - (29 - i))
      return date.toISOString().split('T')[0]
    })

    const eventsByDay = last30Days.map(date => ({
      date,
      count: entries.filter(entry =>
        entry.timestamp.toISOString().split('T')[0] === date
      ).length
    }))

    // Top users
    const userCounts = entries.reduce((acc, entry) => {
      if (entry.userId) {
        acc[entry.userId] = (acc[entry.userId] || 0) + 1
      }
      return acc
    }, {} as Record<string, number>)

    const topUsers = Object.entries(userCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([userId, count]) => ({ userId, count }))

    const errorCount = entries.filter(entry => !entry.success).length
    const errorRate = entries.length > 0 ? (errorCount / entries.length) * 100 : 0

    const processingTimes = entries
      .filter(entry => entry.processingTime !== undefined)
      .map(entry => entry.processingTime!)

    const averageProcessingTime = processingTimes.length > 0
      ? processingTimes.reduce((sum, time) => sum + time, 0) / processingTimes.length
      : 0

    return {
      totalEvents: entries.length,
      eventsByType,
      eventsBySeverity,
      eventsByDay,
      topUsers,
      errorRate,
      averageProcessingTime
    }
  }

  // Add event listener
  addListener(listener: (entry: AuditEntry) => void): void {
    this.listeners.push(listener)
  }

  // Remove event listener
  removeListener(listener: (entry: AuditEntry) => void): void {
    this.listeners = this.listeners.filter(l => l !== listener)
  }

  // Export audit data
  exportData(format: 'json' | 'csv' = 'json', query: AuditQuery = {}): string {
    const entries = this.query({ ...query, limit: undefined, offset: undefined })

    if (format === 'csv') {
      const headers = [
        'id', 'timestamp', 'eventType', 'severity', 'userId', 'resourceType',
        'resourceId', 'action', 'description', 'success', 'errorMessage', 'processingTime'
      ]
      const csvData = entries.map(entry => [
        entry.id,
        entry.timestamp.toISOString(),
        entry.eventType,
        entry.severity,
        entry.userId || '',
        entry.resourceType || '',
        entry.resourceId || '',
        entry.action,
        `"${entry.description.replace(/"/g, '""')}"`,
        entry.success,
        `"${(entry.errorMessage || '').replace(/"/g, '""')}"`,
        entry.processingTime || ''
      ])
      return [headers, ...csvData].map(row => row.join(',')).join('\n')
    }

    return JSON.stringify(entries, null, 2)
  }

  // Clear old entries
  clearOldEntries(olderThanDays: number): number {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays)

    const initialLength = this.entries.length
    this.entries = this.entries.filter(entry => entry.timestamp >= cutoffDate)

    return initialLength - this.entries.length
  }

  private generateId(): string {
    return `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
}

// Global audit trail instance
export const auditTrail = AuditTrail.getInstance()

// Utility functions for common audit operations
export const audit = {
  userAction: (eventType: AuditEventType, userId: string, action: string, description: string, metadata?: Record<string, any>) =>
    auditTrail.logUserAction(eventType, userId, action, description, metadata),

  systemEvent: (eventType: AuditEventType, severity: AuditSeverity, description: string, metadata?: Record<string, any>) =>
    auditTrail.logSystemEvent(eventType, severity, description, metadata),

  dataOperation: (eventType: AuditEventType, userId: string, resourceType: string, resourceId: string, action: string, description: string, oldValues?: Record<string, any>, newValues?: Record<string, any>, success?: boolean, processingTime?: number) =>
    auditTrail.logDataOperation(eventType, userId, resourceType, resourceId, action, description, oldValues, newValues, success, processingTime),

  syncOperation: (eventType: AuditEventType, userId: string, syncId: string, description: string, metadata?: Record<string, any>, success?: boolean, processingTime?: number) =>
    auditTrail.logSyncOperation(eventType, userId, syncId, description, metadata, success, processingTime),

  error: (error: Error, context?: { userId?: string; resourceType?: string; resourceId?: string; action?: string; metadata?: Record<string, any> }) =>
    auditTrail.logError(error, context)
}
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { AISyncIntelligenceEngine, SyncIntelligenceContext } from './aiSyncIntelligence.ts'

export interface SyncEvent {
  id: string
  type: SyncEventType
  source: 'netsuite' | 'shopify' | 'system' | 'user'
  entityType: 'product' | 'order' | 'inventory' | 'customer' | 'webhook'
  entityId: string
  userId: string
  timestamp: Date
  payload: Record<string, any>
  metadata: EventMetadata
  correlationId?: string
  causationId?: string
  version: number
}

export type SyncEventType =
  | 'entity_created'
  | 'entity_updated'
  | 'entity_deleted'
  | 'sync_requested'
  | 'sync_completed'
  | 'sync_failed'
  | 'webhook_received'
  | 'api_rate_limited'
  | 'system_health_changed'
  | 'user_action_performed'

export interface EventMetadata {
  priority: 'low' | 'normal' | 'high' | 'critical'
  ttl?: number // Time to live in seconds
  retryCount: number
  maxRetries: number
  processingHistory: ProcessingRecord[]
  tags: string[]
  businessImpact: 'low' | 'medium' | 'high' | 'critical'
}

export interface ProcessingRecord {
  processor: string
  timestamp: Date
  result: 'success' | 'failure' | 'deferred'
  duration: number
  error?: string
}

export interface EventSubscription {
  id: string
  name: string
  eventTypes: SyncEventType[]
  entityTypes: string[]
  sources: string[]
  filter: EventFilter
  handler: EventHandler
  priority: number
  enabled: boolean
  backoffStrategy: BackoffStrategy
}

export interface EventFilter {
  conditions: FilterCondition[]
  operator: 'AND' | 'OR'
  timeWindow?: {
    start: Date
    end: Date
  }
  sampling?: {
    rate: number // 0-1, percentage of events to process
    strategy: 'random' | 'first' | 'last' | 'intelligent'
  }
}

export interface FilterCondition {
  field: string
  operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than' | 'regex' | 'in' | 'not_in'
  value: any
}

export interface EventHandler {
  name: string
  execute: (event: SyncEvent, context: EventProcessingContext) => Promise<EventProcessingResult>
  rollback?: (event: SyncEvent, context: EventProcessingContext) => Promise<void>
  timeout: number // milliseconds
  retryStrategy: RetryStrategy
}

export interface EventProcessingContext {
  supabase: SupabaseClient
  aiIntelligence: AISyncIntelligenceEngine
  eventStore: EventStore
  correlationContext: CorrelationContext
  systemState: SystemState
}

export interface EventProcessingResult {
  success: boolean
  actions: ProcessingAction[]
  newEvents: SyncEvent[]
  metrics: ProcessingMetrics
  deferUntil?: Date
  error?: string
}

export interface ProcessingAction {
  type: 'sync_trigger' | 'notification' | 'alert' | 'cache_invalidate' | 'workflow_start' | 'data_transform'
  payload: Record<string, any>
  priority: 'low' | 'normal' | 'high' | 'critical'
}

export interface ProcessingMetrics {
  processingTime: number
  resourcesUsed: {
    cpu: number
    memory: number
    network: number
  }
  apiCalls: number
  dataProcessed: number
}

export interface CorrelationContext {
  correlationId: string
  parentEvents: string[]
  childEvents: string[]
  sessionId: string
  userContext: UserContext
  businessContext: BusinessContext
}

export interface UserContext {
  userId: string
  preferences: Record<string, any>
  permissions: string[]
  activeConnections: string[]
}

export interface BusinessContext {
  businessRules: BusinessRule[]
  complianceRequirements: string[]
  dataSensitivity: 'public' | 'internal' | 'confidential' | 'restricted'
}

export interface BusinessRule {
  id: string
  name: string
  condition: string
  action: string
  priority: number
  enabled: boolean
}

export interface SystemState {
  load: number
  availableResources: ResourceAvailability
  activeConnections: number
  queuedEvents: number
  processingCapacity: number
}

export interface ResourceAvailability {
  cpu: number
  memory: number
  network: number
  apiQuota: number
}

export interface BackoffStrategy {
  type: 'fixed' | 'exponential' | 'linear'
  initialDelay: number
  maxDelay: number
  multiplier: number
  jitter: boolean
}

export interface RetryStrategy {
  maxRetries: number
  backoffStrategy: BackoffStrategy
  retryableErrors: string[]
  nonRetryableErrors: string[]
}

export interface EventStore {
  append: (event: SyncEvent) => Promise<void>
  getById: (id: string) => Promise<SyncEvent | null>
  getByCorrelationId: (correlationId: string) => Promise<SyncEvent[]>
  getByEntity: (entityType: string, entityId: string) => Promise<SyncEvent[]>
  query: (filter: EventQuery) => Promise<SyncEvent[]>
  replay: (fromEventId: string, toEventId?: string) => Promise<SyncEvent[]>
}

export interface EventQuery {
  eventTypes?: SyncEventType[]
  sources?: string[]
  entityTypes?: string[]
  timeRange?: {
    start: Date
    end: Date
  }
  correlationId?: string
  limit?: number
  offset?: number
}

/**
 * Event-Driven Sync Architecture
 *
 * This architecture provides real-time, intelligent sync operations that respond
 * to events rather than relying on polling, making it far superior to Celigo's
 * traditional batch processing approach.
 */
export class EventDrivenSyncEngine {
  private supabase: SupabaseClient
  private aiIntelligence: AISyncIntelligenceEngine
  private eventStore: EventStore
  private subscriptions: Map<string, EventSubscription> = new Map()
  private processingQueue: EventProcessingQueue
  private correlationEngine: EventCorrelationEngine

  constructor(supabase: SupabaseClient, aiIntelligence: AISyncIntelligenceEngine) {
    this.supabase = supabase
    this.aiIntelligence = aiIntelligence
    this.eventStore = new PostgresEventStore(supabase)
    this.processingQueue = new EventProcessingQueue()
    this.correlationEngine = new EventCorrelationEngine()

    this.initializeDefaultSubscriptions()
    this.startEventProcessing()
  }

  /**
   * Publish an event to the event stream
   */
  async publishEvent(event: Omit<SyncEvent, 'id' | 'timestamp' | 'version'>): Promise<string> {
    const fullEvent: SyncEvent = {
      ...event,
      id: crypto.randomUUID(),
      timestamp: new Date(),
      version: 1
    }

    console.log(`[EventDrivenSync] Publishing event: ${fullEvent.type} for ${fullEvent.entityType}:${fullEvent.entityId}`)

    // Store the event
    await this.eventStore.append(fullEvent)

    // Process the event immediately for critical events
    if (fullEvent.metadata.priority === 'critical') {
      await this.processEventImmediately(fullEvent)
    } else {
      // Queue for processing
      await this.processingQueue.enqueue(fullEvent)
    }

    return fullEvent.id
  }

  /**
   * Subscribe to specific event types
   */
  subscribe(subscription: Omit<EventSubscription, 'id'>): string {
    const id = crypto.randomUUID()
    const fullSubscription: EventSubscription = {
      ...subscription,
      id
    }

    this.subscriptions.set(id, fullSubscription)
    console.log(`[EventDrivenSync] Registered subscription: ${subscription.name} (${id})`)

    return id
  }

  /**
   * Unsubscribe from events
   */
  unsubscribe(subscriptionId: string): boolean {
    return this.subscriptions.delete(subscriptionId)
  }

  /**
   * Get event processing statistics
   */
  async getProcessingStats(): Promise<{
    totalEvents: number
    processedEvents: number
    failedEvents: number
    queuedEvents: number
    averageProcessingTime: number
    topEventTypes: Array<{ type: string; count: number }>
  }> {
    // This would query the database for statistics
    return {
      totalEvents: 0,
      processedEvents: 0,
      failedEvents: 0,
      queuedEvents: this.processingQueue.size(),
      averageProcessingTime: 0,
      topEventTypes: []
    }
  }

  /**
   * Replay events for debugging or recovery
   */
  async replayEvents(
    fromEventId: string,
    toEventId?: string,
    targetSubscription?: string
  ): Promise<void> {
    console.log(`[EventDrivenSync] Replaying events from ${fromEventId} to ${toEventId || 'latest'}`)

    const events = await this.eventStore.replay(fromEventId, toEventId)

    for (const event of events) {
      if (targetSubscription) {
        const subscription = this.subscriptions.get(targetSubscription)
        if (subscription && this.matchesSubscription(event, subscription)) {
          await this.processEventWithSubscription(event, subscription)
        }
      } else {
        // Replay to all matching subscriptions
        await this.processEventImmediately(event)
      }
    }
  }

  // Private methods

  private initializeDefaultSubscriptions(): void {
    // Product change subscription
    this.subscribe({
      name: 'Product Change Handler',
      eventTypes: ['entity_created', 'entity_updated', 'entity_deleted'],
      entityTypes: ['product'],
      sources: ['netsuite', 'shopify'],
      filter: {
        conditions: [],
        operator: 'AND'
      },
      handler: {
        name: 'Product Sync Handler',
        execute: async (event, context) => {
          // Intelligent product sync based on the event
          const syncDecision = await context.aiIntelligence.analyzeSyncRequirements(
            'products',
            1, // Single product
            'normal'
          )

          return {
            success: true,
            actions: [{
              type: 'sync_trigger',
              payload: {
                type: 'products',
                direction: event.source === 'netsuite' ? 'netsuite_to_shopify' : 'shopify_to_netsuite',
                filters: { productIds: [event.entityId] },
                priority: syncDecision.suggestedSchedule.priority
              },
              priority: 'normal'
            }],
            newEvents: [],
            metrics: {
              processingTime: 100,
              resourcesUsed: { cpu: 5, memory: 10, network: 5 },
              apiCalls: 1,
              dataProcessed: 1
            }
          }
        },
        timeout: 30000,
        retryStrategy: {
          maxRetries: 3,
          backoffStrategy: {
            type: 'exponential',
            initialDelay: 1000,
            maxDelay: 30000,
            multiplier: 2,
            jitter: true
          },
          retryableErrors: ['timeout', 'network'],
          nonRetryableErrors: ['authentication', 'authorization']
        }
      },
      priority: 1,
      enabled: true,
      backoffStrategy: {
        type: 'exponential',
        initialDelay: 1000,
        maxDelay: 60000,
        multiplier: 2,
        jitter: true
      }
    })

    // Order webhook subscription
    this.subscribe({
      name: 'Order Webhook Handler',
      eventTypes: ['webhook_received'],
      entityTypes: ['order'],
      sources: ['shopify'],
      filter: {
        conditions: [{
          field: 'payload.action',
          operator: 'equals',
          value: 'created'
        }],
        operator: 'AND'
      },
      handler: {
        name: 'Order Sync Handler',
        execute: async (event, context) => {
          // Immediate order sync for new orders
          return {
            success: true,
            actions: [{
              type: 'sync_trigger',
              payload: {
                type: 'orders',
                direction: 'shopify_to_netsuite',
                filters: { orderIds: [event.entityId] },
                priority: 'high'
              },
              priority: 'high'
            }],
            newEvents: [],
            metrics: {
              processingTime: 50,
              resourcesUsed: { cpu: 3, memory: 5, network: 3 },
              apiCalls: 1,
              dataProcessed: 1
            }
          }
        },
        timeout: 15000,
        retryStrategy: {
          maxRetries: 2,
          backoffStrategy: {
            type: 'fixed',
            initialDelay: 5000,
            maxDelay: 5000,
            multiplier: 1,
            jitter: false
          },
          retryableErrors: ['timeout'],
          nonRetryableErrors: ['authentication', 'not_found']
        }
      },
      priority: 2,
      enabled: true,
      backoffStrategy: {
        type: 'fixed',
        initialDelay: 5000,
        maxDelay: 5000,
        multiplier: 1,
        jitter: false
      }
    })

    // System health monitor
    this.subscribe({
      name: 'System Health Monitor',
      eventTypes: ['system_health_changed', 'api_rate_limited'],
      entityTypes: ['system'],
      sources: ['system'],
      filter: {
        conditions: [],
        operator: 'AND'
      },
      handler: {
        name: 'Health Alert Handler',
        execute: async (event, context) => {
          // Handle system health events
          const actions: ProcessingAction[] = []

          if (event.type === 'api_rate_limited') {
            actions.push({
              type: 'alert',
              payload: {
                level: 'warning',
                message: `API rate limit reached for ${event.payload.platform}`,
                suggestedActions: ['Reduce sync frequency', 'Implement backoff']
              },
              priority: 'high'
            })
          }

          return {
            success: true,
            actions,
            newEvents: [],
            metrics: {
              processingTime: 10,
              resourcesUsed: { cpu: 1, memory: 2, network: 1 },
              apiCalls: 0,
              dataProcessed: 0
            }
          }
        },
        timeout: 5000,
        retryStrategy: {
          maxRetries: 1,
          backoffStrategy: {
            type: 'fixed',
            initialDelay: 1000,
            maxDelay: 1000,
            multiplier: 1,
            jitter: false
          },
          retryableErrors: [],
          nonRetryableErrors: []
        }
      },
      priority: 3,
      enabled: true,
      backoffStrategy: {
        type: 'fixed',
        initialDelay: 1000,
        maxDelay: 1000,
        multiplier: 1,
        jitter: false
      }
    })
  }

  private async startEventProcessing(): Promise<void> {
    // Start background processing of queued events
    setInterval(async () => {
      try {
        const event = await this.processingQueue.dequeue()
        if (event) {
          await this.processEventImmediately(event)
        }
      } catch (error) {
        console.error('[EventDrivenSync] Error processing queued event:', error)
      }
    }, 1000) // Process every second
  }

  private async processEventImmediately(event: SyncEvent): Promise<void> {
    console.log(`[EventDrivenSync] Processing event: ${event.type}`)

    // Find matching subscriptions
    const matchingSubscriptions = Array.from(this.subscriptions.values())
      .filter(sub => sub.enabled && this.matchesSubscription(event, sub))
      .sort((a, b) => b.priority - a.priority) // Higher priority first

    // Process with each matching subscription
    for (const subscription of matchingSubscriptions) {
      try {
        await this.processEventWithSubscription(event, subscription)
      } catch (error) {
        console.error(`[EventDrivenSync] Error processing event with subscription ${subscription.name}:`, error)

        // Record processing failure
        await this.recordProcessingFailure(event, subscription, error)
      }
    }
  }

  private matchesSubscription(event: SyncEvent, subscription: EventSubscription): boolean {
    // Check event type
    if (!subscription.eventTypes.includes(event.type)) return false

    // Check entity type
    if (subscription.entityTypes.length > 0 && !subscription.entityTypes.includes(event.entityType)) return false

    // Check source
    if (subscription.sources.length > 0 && !subscription.sources.includes(event.source)) return false

    // Check filter conditions
    return this.matchesFilter(event, subscription.filter)
  }

  private matchesFilter(event: SyncEvent, filter: EventFilter): boolean {
    if (filter.conditions.length === 0) return true

    const results = filter.conditions.map(condition => this.evaluateCondition(event, condition))

    return filter.operator === 'AND'
      ? results.every(r => r)
      : results.some(r => r)
  }

  private evaluateCondition(event: SyncEvent, condition: FilterCondition): boolean {
    const value = this.getNestedValue(event, condition.field)

    switch (condition.operator) {
      case 'equals':
        return value === condition.value
      case 'not_equals':
        return value !== condition.value
      case 'contains':
        return String(value).includes(String(condition.value))
      case 'greater_than':
        return Number(value) > Number(condition.value)
      case 'less_than':
        return Number(value) < Number(condition.value)
      case 'in':
        return Array.isArray(condition.value) && condition.value.includes(value)
      case 'not_in':
        return Array.isArray(condition.value) && !condition.value.includes(value)
      case 'regex':
        return new RegExp(condition.value).test(String(value))
      default:
        return false
    }
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj)
  }

  private async processEventWithSubscription(
    event: SyncEvent,
    subscription: EventSubscription
  ): Promise<void> {
    const context: EventProcessingContext = {
      supabase: this.supabase,
      aiIntelligence: this.aiIntelligence,
      eventStore: this.eventStore,
      correlationContext: await this.correlationEngine.getCorrelationContext(event),
      systemState: await this.getCurrentSystemState()
    }

    const startTime = Date.now()

    try {
      const result = await this.executeWithTimeout(
        subscription.handler.execute(event, context),
        subscription.handler.timeout
      )

      const processingTime = Date.now() - startTime

      // Record successful processing
      await this.recordProcessingSuccess(event, subscription, result, processingTime)

      // Publish any new events
      for (const newEvent of result.newEvents) {
        await this.publishEvent(newEvent)
      }

      // Execute actions
      await this.executeActions(result.actions, event)

    } catch (error) {
      const processingTime = Date.now() - startTime

      // Handle processing failure with retry strategy
      await this.handleProcessingFailure(event, subscription, error, processingTime)
    }
  }

  private async executeWithTimeout<T>(promise: Promise<T>, timeout: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeout}ms`))
      }, timeout)

      promise
        .then(resolve)
        .catch(reject)
        .finally(() => clearTimeout(timer))
    })
  }

  private async executeActions(actions: ProcessingAction[], originalEvent: SyncEvent): Promise<void> {
    for (const action of actions) {
      try {
        switch (action.type) {
          case 'sync_trigger':
            await this.triggerSync(action.payload, originalEvent)
            break
          case 'notification':
            await this.sendNotification(action.payload, originalEvent)
            break
          case 'alert':
            await this.createAlert(action.payload, originalEvent)
            break
          case 'cache_invalidate':
            await this.invalidateCache(action.payload, originalEvent)
            break
          case 'workflow_start':
            await this.startWorkflow(action.payload, originalEvent)
            break
          case 'data_transform':
            await this.transformData(action.payload, originalEvent)
            break
        }
      } catch (error) {
        console.error(`[EventDrivenSync] Error executing action ${action.type}:`, error)
      }
    }
  }

  private async triggerSync(payload: any, event: SyncEvent): Promise<void> {
    // Trigger a sync operation based on the event
    console.log(`[EventDrivenSync] Triggering sync:`, payload)

    // This would call the sync API with the specified parameters
    // For now, just log it
  }

  private async sendNotification(payload: any, event: SyncEvent): Promise<void> {
    console.log(`[EventDrivenSync] Sending notification:`, payload)
    // Implement notification sending
  }

  private async createAlert(payload: any, event: SyncEvent): Promise<void> {
    console.log(`[EventDrivenSync] Creating alert:`, payload)
    // Implement alert creation
  }

  private async invalidateCache(payload: any, event: SyncEvent): Promise<void> {
    console.log(`[EventDrivenSync] Invalidating cache:`, payload)
    // Implement cache invalidation
  }

  private async startWorkflow(payload: any, event: SyncEvent): Promise<void> {
    console.log(`[EventDrivenSync] Starting workflow:`, payload)
    // Implement workflow triggering
  }

  private async transformData(payload: any, event: SyncEvent): Promise<void> {
    console.log(`[EventDrivenSync] Transforming data:`, payload)
    // Implement data transformation
  }

  private async recordProcessingSuccess(
    event: SyncEvent,
    subscription: EventSubscription,
    result: EventProcessingResult,
    processingTime: number
  ): Promise<void> {
    // Record successful processing in the event metadata
    await this.supabase
      .from('event_processing_history')
      .insert({
        event_id: event.id,
        subscription_id: subscription.id,
        result: 'success',
        processing_time: processingTime,
        metrics: result.metrics,
        actions_taken: result.actions.length,
        created_at: new Date().toISOString()
      })
  }

  private async recordProcessingFailure(
    event: SyncEvent,
    subscription: EventSubscription,
    error: any
  ): Promise<void> {
    await this.supabase
      .from('event_processing_history')
      .insert({
        event_id: event.id,
        subscription_id: subscription.id,
        result: 'failure',
        error_message: error.message,
        created_at: new Date().toISOString()
      })
  }

  private async handleProcessingFailure(
    event: SyncEvent,
    subscription: EventSubscription,
    error: any,
    processingTime: number
  ): Promise<void> {
    const currentRetryCount = event.metadata.retryCount

    if (currentRetryCount < subscription.handler.retryStrategy.maxRetries) {
      // Schedule retry
      const delay = this.calculateRetryDelay(subscription.backoffStrategy, currentRetryCount)
      const retryTime = new Date(Date.now() + delay)

      console.log(`[EventDrivenSync] Scheduling retry for event ${event.id} at ${retryTime.toISOString()}`)

      // Update event retry count
      event.metadata.retryCount++
      event.metadata.processingHistory.push({
        processor: subscription.handler.name,
        timestamp: new Date(),
        result: 'deferred',
        duration: processingTime,
        error: error.message
      })

      // Re-queue the event
      setTimeout(() => {
        this.processingQueue.enqueue(event)
      }, delay)

    } else {
      // Max retries exceeded - escalate
      console.error(`[EventDrivenSync] Max retries exceeded for event ${event.id}`)

      // Create dead letter entry or alert
      await this.escalateFailedEvent(event, subscription, error)
    }
  }

  private calculateRetryDelay(strategy: BackoffStrategy, retryCount: number): number {
    let delay = strategy.initialDelay

    switch (strategy.type) {
      case 'exponential':
        delay = strategy.initialDelay * Math.pow(strategy.multiplier, retryCount)
        break
      case 'linear':
        delay = strategy.initialDelay + (strategy.multiplier * retryCount)
        break
      case 'fixed':
        delay = strategy.initialDelay
        break
    }

    delay = Math.min(delay, strategy.maxDelay)

    if (strategy.jitter) {
      delay = delay * (0.5 + Math.random() * 0.5) // Add up to 50% jitter
    }

    return delay
  }

  private async escalateFailedEvent(
    event: SyncEvent,
    subscription: EventSubscription,
    error: any
  ): Promise<void> {
    // Create an alert or dead letter entry
    console.error(`[EventDrivenSync] Escalating failed event ${event.id}:`, error)

    // This would create a dead letter entry or send an alert
  }

  private async getCurrentSystemState(): Promise<SystemState> {
    // Get current system state
    return {
      load: 45, // Would be measured
      availableResources: {
        cpu: 55,
        memory: 60,
        network: 70,
        apiQuota: 80
      },
      activeConnections: 5,
      queuedEvents: this.processingQueue.size(),
      processingCapacity: 10
    }
  }
}

/**
 * Event Processing Queue with priority support
 */
class EventProcessingQueue {
  private queue: SyncEvent[] = []
  private priorities: Map<string, number> = new Map()

  enqueue(event: SyncEvent): void {
    this.queue.push(event)
    this.priorities.set(event.id, this.getPriorityValue(event.metadata.priority))

    // Sort by priority (higher priority first)
    this.queue.sort((a, b) => {
      const priorityA = this.priorities.get(a.id) || 0
      const priorityB = this.priorities.get(b.id) || 0
      return priorityB - priorityA
    })
  }

  async dequeue(): Promise<SyncEvent | null> {
    return this.queue.shift() || null
  }

  size(): number {
    return this.queue.length
  }

  private getPriorityValue(priority: string): number {
    switch (priority) {
      case 'critical': return 4
      case 'high': return 3
      case 'normal': return 2
      case 'low': return 1
      default: return 2
    }
  }
}

/**
 * Event Correlation Engine for tracking related events
 */
class EventCorrelationEngine {
  async getCorrelationContext(event: SyncEvent): Promise<CorrelationContext> {
    // Generate or retrieve correlation context
    const correlationId = event.correlationId || crypto.randomUUID()

    return {
      correlationId,
      parentEvents: [],
      childEvents: [],
      sessionId: crypto.randomUUID(),
      userContext: {
        userId: event.userId,
        preferences: {},
        permissions: [],
        activeConnections: []
      },
      businessContext: {
        businessRules: [],
        complianceRequirements: [],
        dataSensitivity: 'internal'
      }
    }
  }
}

/**
 * PostgreSQL-based Event Store implementation
 */
class PostgresEventStore implements EventStore {
  constructor(private supabase: SupabaseClient) {}

  async append(event: SyncEvent): Promise<void> {
    await this.supabase
      .from('sync_events')
      .insert({
        id: event.id,
        type: event.type,
        source: event.source,
        entity_type: event.entityType,
        entity_id: event.entityId,
        user_id: event.userId,
        timestamp: event.timestamp.toISOString(),
        payload: event.payload,
        metadata: event.metadata,
        correlation_id: event.correlationId,
        causation_id: event.causationId,
        version: event.version
      })
  }

  async getById(id: string): Promise<SyncEvent | null> {
    const { data } = await this.supabase
      .from('sync_events')
      .select('*')
      .eq('id', id)
      .single()

    if (!data) return null

    return {
      id: data.id,
      type: data.type,
      source: data.source,
      entityType: data.entity_type,
      entityId: data.entity_id,
      userId: data.user_id,
      timestamp: new Date(data.timestamp),
      payload: data.payload,
      metadata: data.metadata,
      correlationId: data.correlation_id,
      causationId: data.causation_id,
      version: data.version
    }
  }

  async getByCorrelationId(correlationId: string): Promise<SyncEvent[]> {
    const { data } = await this.supabase
      .from('sync_events')
      .select('*')
      .eq('correlation_id', correlationId)
      .order('timestamp', { ascending: true })

    return data?.map(this.mapDatabaseRow) || []
  }

  async getByEntity(entityType: string, entityId: string): Promise<SyncEvent[]> {
    const { data } = await this.supabase
      .from('sync_events')
      .select('*')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('timestamp', { ascending: true })

    return data?.map(this.mapDatabaseRow) || []
  }

  async query(filter: EventQuery): Promise<SyncEvent[]> {
    let query = this.supabase
      .from('sync_events')
      .select('*')
      .order('timestamp', { ascending: false })

    if (filter.eventTypes?.length) {
      query = query.in('type', filter.eventTypes)
    }

    if (filter.sources?.length) {
      query = query.in('source', filter.sources)
    }

    if (filter.entityTypes?.length) {
      query = query.in('entity_type', filter.entityTypes)
    }

    if (filter.timeRange) {
      query = query
        .gte('timestamp', filter.timeRange.start.toISOString())
        .lte('timestamp', filter.timeRange.end.toISOString())
    }

    if (filter.correlationId) {
      query = query.eq('correlation_id', filter.correlationId)
    }

    if (filter.limit) {
      query = query.limit(filter.limit)
    }

    if (filter.offset) {
      query = query.offset(filter.offset)
    }

    const { data } = await query
    return data?.map(this.mapDatabaseRow) || []
  }

  async replay(fromEventId: string, toEventId?: string): Promise<SyncEvent[]> {
    let query = this.supabase
      .from('sync_events')
      .select('*')
      .order('timestamp', { ascending: true })

    // For simplicity, we'll replay all events after the fromEventId
    // In a real implementation, you'd use sequence numbers or timestamps
    const { data } = await query

    if (!data) return []

    const events = data.map(this.mapDatabaseRow)
    const fromIndex = events.findIndex(e => e.id === fromEventId)

    if (fromIndex === -1) return []

    let toIndex = events.length
    if (toEventId) {
      const toIdx = events.findIndex(e => e.id === toEventId)
      if (toIdx !== -1) toIndex = toIdx + 1
    }

    return events.slice(fromIndex, toIndex)
  }

  private mapDatabaseRow = (row: any): SyncEvent => ({
    id: row.id,
    type: row.type,
    source: row.source,
    entityType: row.entity_type,
    entityId: row.entity_id,
    userId: row.user_id,
    timestamp: new Date(row.timestamp),
    payload: row.payload,
    metadata: row.metadata,
    correlationId: row.correlation_id,
    causationId: row.causation_id,
    version: row.version
  })
}
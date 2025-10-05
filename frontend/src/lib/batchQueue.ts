// Batch Processing Queue with Priority Management
// Handles large-scale operations with intelligent queuing and resource management

export enum QueuePriority {
  LOW = 1,
  NORMAL = 2,
  HIGH = 3,
  CRITICAL = 4
}

export enum BatchStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

export interface BatchItem<T = any> {
  id: string
  data: T
  priority: QueuePriority
  status: BatchStatus
  createdAt: Date
  startedAt?: Date
  completedAt?: Date
  retryCount: number
  maxRetries: number
  error?: string
  result?: any
  dependencies?: string[] // IDs of items this depends on
  metadata?: Record<string, any>
}

export interface BatchOptions {
  maxConcurrency?: number
  maxRetries?: number
  retryDelay?: number
  timeout?: number
  onProgress?: (completed: number, total: number, item: BatchItem) => void
  onError?: (error: Error, item: BatchItem) => void
  onComplete?: (results: BatchItem[]) => void
}

export interface QueueStats {
  total: number
  pending: number
  processing: number
  completed: number
  failed: number
  cancelled: number
  averageProcessingTime: number
  throughput: number // items per minute
}

export class BatchQueue<T = any> {
  private items: Map<string, BatchItem<T>> = new Map()
  private processing: Set<string> = new Set()
  private options: Required<BatchOptions>
  private isRunning: boolean = false
  private startTime: Date = new Date()

  constructor(options: BatchOptions = {}) {
    this.options = {
      maxConcurrency: 5,
      maxRetries: 3,
      retryDelay: 1000,
      timeout: 300000, // 5 minutes
      onProgress: () => {},
      onError: () => {},
      onComplete: () => {},
      ...options
    }
  }

  // Add items to the queue
  add(items: Omit<BatchItem<T>, 'status' | 'createdAt' | 'retryCount'>[]): void {
    for (const item of items) {
      const batchItem: BatchItem<T> = {
        ...item,
        status: BatchStatus.PENDING,
        createdAt: new Date(),
        retryCount: 0,
        maxRetries: this.options.maxRetries
      }
      this.items.set(item.id, batchItem)
    }
  }

  // Add single item
  addItem(item: Omit<BatchItem<T>, 'status' | 'createdAt' | 'retryCount'>): void {
    this.add([item])
  }

  // Start processing the queue
  async start(processor: (item: BatchItem<T>) => Promise<any>): Promise<BatchItem<T>[]> {
    if (this.isRunning) {
      throw new Error('Queue is already running')
    }

    this.isRunning = true
    this.startTime = new Date()

    const results: BatchItem<T>[] = []

    try {
      while (this.hasPendingItems()) {
        const batch = this.getNextBatch()
        if (batch.length === 0) break

        // Process batch concurrently
        const promises = batch.map(async (item) => {
          this.processing.add(item.id)
          item.status = BatchStatus.PROCESSING
          item.startedAt = new Date()

          try {
            const result = await this.processWithTimeout(processor, item)
            item.status = BatchStatus.COMPLETED
            item.completedAt = new Date()
            item.result = result

            this.options.onProgress(results.length + 1, this.items.size, item)
            results.push(item)
          } catch (error) {
            await this.handleItemError(error as Error, item)
          } finally {
            this.processing.delete(item.id)
          }
        })

        await Promise.allSettled(promises)

        // Small delay between batches to prevent overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    } finally {
      this.isRunning = false
    }

    this.options.onComplete(results)
    return results
  }

  // Stop processing
  stop(): void {
    this.isRunning = false
    // Mark all processing items as cancelled
    for (const id of this.processing) {
      const item = this.items.get(id)
      if (item) {
        item.status = BatchStatus.CANCELLED
        item.completedAt = new Date()
      }
    }
    this.processing.clear()
  }

  // Get queue statistics
  getStats(): QueueStats {
    const allItems = Array.from(this.items.values())
    const completedItems = allItems.filter(item => item.status === BatchStatus.COMPLETED)
    const processingTimes = completedItems
      .filter(item => item.startedAt && item.completedAt)
      .map(item => item.completedAt!.getTime() - item.startedAt!.getTime())

    const averageProcessingTime = processingTimes.length > 0
      ? processingTimes.reduce((sum, time) => sum + time, 0) / processingTimes.length
      : 0

    const runtimeMinutes = (Date.now() - this.startTime.getTime()) / (1000 * 60)
    const throughput = runtimeMinutes > 0 ? completedItems.length / runtimeMinutes : 0

    return {
      total: allItems.length,
      pending: allItems.filter(item => item.status === BatchStatus.PENDING).length,
      processing: this.processing.size,
      completed: completedItems.length,
      failed: allItems.filter(item => item.status === BatchStatus.FAILED).length,
      cancelled: allItems.filter(item => item.status === BatchStatus.CANCELLED).length,
      averageProcessingTime,
      throughput
    }
  }

  // Get all items
  getItems(): BatchItem<T>[] {
    return Array.from(this.items.values())
  }

  // Get item by ID
  getItem(id: string): BatchItem<T> | undefined {
    return this.items.get(id)
  }

  // Clear completed items
  clearCompleted(): void {
    for (const [id, item] of this.items) {
      if (item.status === BatchStatus.COMPLETED) {
        this.items.delete(id)
      }
    }
  }

  // Clear all items
  clear(): void {
    this.items.clear()
    this.processing.clear()
    this.isRunning = false
  }

  private hasPendingItems(): boolean {
    return Array.from(this.items.values()).some(item =>
      item.status === BatchStatus.PENDING &&
      this.canProcessItem(item)
    )
  }

  private canProcessItem(item: BatchItem<T>): boolean {
    // Check if all dependencies are completed
    if (item.dependencies && item.dependencies.length > 0) {
      return item.dependencies.every(depId => {
        const dep = this.items.get(depId)
        return dep && dep.status === BatchStatus.COMPLETED
      })
    }
    return true
  }

  private getNextBatch(): BatchItem<T>[] {
    const pendingItems = Array.from(this.items.values())
      .filter(item =>
        item.status === BatchStatus.PENDING &&
        this.canProcessItem(item) &&
        !this.processing.has(item.id)
      )
      .sort((a, b) => {
        // Sort by priority (higher first), then by creation time (older first)
        if (a.priority !== b.priority) {
          return b.priority - a.priority
        }
        return a.createdAt.getTime() - b.createdAt.getTime()
      })

    return pendingItems.slice(0, this.options.maxConcurrency - this.processing.size)
  }

  private async processWithTimeout(
    processor: (item: BatchItem<T>) => Promise<any>,
    item: BatchItem<T>
  ): Promise<any> {
    return new Promise(async (resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Operation timed out after ${this.options.timeout}ms`))
      }, this.options.timeout)

      try {
        const result = await processor(item)
        clearTimeout(timeoutId)
        resolve(result)
      } catch (error) {
        clearTimeout(timeoutId)
        reject(error)
      }
    })
  }

  private async handleItemError(error: Error, item: BatchItem<T>): Promise<void> {
    item.error = error.message
    item.retryCount++

    if (item.retryCount < item.maxRetries) {
      // Schedule retry
      item.status = BatchStatus.PENDING
      setTimeout(() => {
        // Item will be picked up in next batch
      }, this.options.retryDelay * item.retryCount)
    } else {
      // Max retries reached
      item.status = BatchStatus.FAILED
      item.completedAt = new Date()
      this.options.onError(error, item)
    }
  }
}

// Utility functions for common batch operations
export const createSyncBatch = (items: any[], priority: QueuePriority = QueuePriority.NORMAL) => {
  return items.map((item, index) => ({
    id: `sync_${Date.now()}_${index}`,
    data: item,
    priority,
    maxRetries: 3,
    metadata: { type: 'sync', originalIndex: index }
  }))
}

export const createImportBatch = (data: any[], priority: QueuePriority = QueuePriority.NORMAL) => {
  return data.map((item, index) => ({
    id: `import_${Date.now()}_${index}`,
    data: item,
    priority,
    maxRetries: 2,
    metadata: { type: 'import', originalIndex: index }
  }))
}

export const createExportBatch = (queries: any[], priority: QueuePriority = QueuePriority.NORMAL) => {
  return queries.map((query, index) => ({
    id: `export_${Date.now()}_${index}`,
    data: query,
    priority,
    maxRetries: 1,
    metadata: { type: 'export', originalIndex: index }
  }))
}
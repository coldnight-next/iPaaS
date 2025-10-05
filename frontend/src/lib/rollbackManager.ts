// Rollback Manager for Failed Operations
// Provides ability to undo changes and restore system state

export interface RollbackPoint {
  id: string
  timestamp: Date
  operation: string
  description: string
  changes: RollbackChange[]
  metadata?: Record<string, any>
}

export interface RollbackChange {
  type: 'create' | 'update' | 'delete'
  resourceType: string
  resourceId: string
  beforeState?: any
  afterState?: any
  rollbackAction: () => Promise<void>
}

export interface RollbackResult {
  success: boolean
  rolledBack: number
  failed: number
  errors: string[]
}

export class RollbackManager {
  private static instance: RollbackManager
  private rollbackPoints: Map<string, RollbackPoint> = new Map()
  private maxPoints: number = 100

  private constructor() {}

  static getInstance(): RollbackManager {
    if (!RollbackManager.instance) {
      RollbackManager.instance = new RollbackManager()
    }
    return RollbackManager.instance
  }

  // Create a rollback point
  createPoint(
    operation: string,
    description: string,
    changes: RollbackChange[],
    metadata?: Record<string, any>
  ): string {
    const id = `rollback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    const point: RollbackPoint = {
      id,
      timestamp: new Date(),
      operation,
      description,
      changes,
      metadata
    }

    this.rollbackPoints.set(id, point)

    // Maintain max points limit
    if (this.rollbackPoints.size > this.maxPoints) {
      const oldestKey = Array.from(this.rollbackPoints.keys())[0]
      this.rollbackPoints.delete(oldestKey)
    }

    return id
  }

  // Execute rollback for a specific point
  async rollback(pointId: string): Promise<RollbackResult> {
    const point = this.rollbackPoints.get(pointId)
    if (!point) {
      return {
        success: false,
        rolledBack: 0,
        failed: 0,
        errors: [`Rollback point ${pointId} not found`]
      }
    }

    const result: RollbackResult = {
      success: true,
      rolledBack: 0,
      failed: 0,
      errors: []
    }

    // Execute rollback actions in reverse order
    const reversedChanges = [...point.changes].reverse()

    for (const change of reversedChanges) {
      try {
        await change.rollbackAction()
        result.rolledBack++
      } catch (error) {
        result.failed++
        result.errors.push(`Failed to rollback ${change.type} ${change.resourceType} ${change.resourceId}: ${error}`)
        result.success = false
      }
    }

    // Remove the rollback point after successful rollback
    if (result.success) {
      this.rollbackPoints.delete(pointId)
    }

    return result
  }

  // Get all rollback points
  getPoints(): RollbackPoint[] {
    return Array.from(this.rollbackPoints.values())
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
  }

  // Get rollback point by ID
  getPoint(id: string): RollbackPoint | undefined {
    return this.rollbackPoints.get(id)
  }

  // Clear old rollback points
  clearOldPoints(olderThanHours: number): number {
    const cutoffTime = Date.now() - (olderThanHours * 60 * 60 * 1000)
    let removed = 0

    for (const [id, point] of this.rollbackPoints) {
      if (point.timestamp.getTime() < cutoffTime) {
        this.rollbackPoints.delete(id)
        removed++
      }
    }

    return removed
  }

  // Validate rollback point
  validatePoint(pointId: string): { valid: boolean; errors: string[] } {
    const point = this.rollbackPoints.get(pointId)
    if (!point) {
      return { valid: false, errors: ['Rollback point not found'] }
    }

    const errors: string[] = []

    for (const change of point.changes) {
      if (!change.resourceType || !change.resourceId) {
        errors.push(`Invalid change: missing resource type or ID`)
      }
      if (typeof change.rollbackAction !== 'function') {
        errors.push(`Invalid change: rollback action is not a function`)
      }
    }

    return {
      valid: errors.length === 0,
      errors
    }
  }
}

// Utility functions for creating rollback changes
export const createRollbackChange = {
  create: (
    resourceType: string,
    resourceId: string,
    createdData: any,
    deleteFunction: () => Promise<void>
  ): RollbackChange => ({
    type: 'create',
    resourceType,
    resourceId,
    afterState: createdData,
    rollbackAction: deleteFunction
  }),

  update: (
    resourceType: string,
    resourceId: string,
    oldData: any,
    newData: any,
    updateFunction: (oldData: any) => Promise<void>
  ): RollbackChange => ({
    type: 'update',
    resourceType,
    resourceId,
    beforeState: oldData,
    afterState: newData,
    rollbackAction: () => updateFunction(oldData)
  }),

  delete: (
    resourceType: string,
    resourceId: string,
    deletedData: any,
    restoreFunction: () => Promise<void>
  ): RollbackChange => ({
    type: 'delete',
    resourceType,
    resourceId,
    beforeState: deletedData,
    rollbackAction: restoreFunction
  })
}

// Global rollback manager instance
export const rollbackManager = RollbackManager.getInstance()
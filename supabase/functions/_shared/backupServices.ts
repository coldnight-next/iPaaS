import type { NetSuiteClient } from './netsuiteClient.ts'
import type { ShopifyClient } from './shopifyClient.ts'

export interface BackupContext {
  supabase: any
  userId: string
  syncLogId?: string
  netsuiteClient?: NetSuiteClient
  shopifyClient?: ShopifyClient
}

export interface Snapshot {
  id: string
  product_id: string
  platform: string
  snapshot_data: any
  data_checksum: string
  created_at: string
}

export interface RestorePoint {
  id: string
  name: string
  description: string
  created_at: string
  products_count: number
  total_snapshots: number
}

export interface RollbackResult {
  success: boolean
  items_restored: number
  items_failed: number
  errors: string[]
  warnings: string[]
}

// ========== SNAPSHOT SERVICE ==========

export class SnapshotService {
  private context: BackupContext

  constructor(context: BackupContext) {
    this.context = context
  }

  /**
   * Create a snapshot of a single product before modification
   */
  async createProductSnapshot(
    productId: string,
    platform: 'netsuite' | 'shopify',
    snapshotType: 'pre_sync' | 'post_sync' | 'manual' = 'pre_sync'
  ): Promise<string> {
    console.log(`[Snapshot] Creating ${snapshotType} snapshot for product ${productId}`)

    // Get current product state
    const { data: product, error } = await this.context.supabase
      .from('products')
      .select('*')
      .eq('id', productId)
      .single()

    if (error || !product) {
      throw new Error(`Failed to fetch product for snapshot: ${error?.message}`)
    }

    // Calculate checksum
    const checksum = await this.calculateChecksum(product)

    // Get previous snapshot for versioning
    const { data: previousSnapshot } = await this.context.supabase
      .from('product_snapshots')
      .select('id, version')
      .eq('product_id', productId)
      .eq('platform', platform)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    const version = previousSnapshot ? previousSnapshot.version + 1 : 1

    // Create snapshot
    const { data: snapshot, error: snapshotError } = await this.context.supabase
      .from('product_snapshots')
      .insert({
        user_id: this.context.userId,
        product_id: productId,
        platform,
        snapshot_type: snapshotType,
        sync_log_id: this.context.syncLogId,
        snapshot_data: product,
        data_checksum: checksum,
        version,
        previous_snapshot_id: previousSnapshot?.id,
        metadata: {
          created_by: 'system',
          source: 'sync_operation'
        }
      })
      .select()
      .single()

    if (snapshotError) {
      throw new Error(`Failed to create snapshot: ${snapshotError.message}`)
    }

    console.log(`[Snapshot] Created snapshot ${snapshot.id} (version ${version})`)
    return snapshot.id
  }

  /**
   * Create snapshots for multiple products (batch operation)
   */
  async createBatchSnapshots(
    productIds: string[],
    platform: 'netsuite' | 'shopify',
    snapshotType: 'pre_sync' | 'post_sync' | 'manual' = 'pre_sync'
  ): Promise<string[]> {
    console.log(`[Snapshot] Creating batch snapshots for ${productIds.length} products`)

    const snapshotIds: string[] = []
    const errors: string[] = []

    for (const productId of productIds) {
      try {
        const snapshotId = await this.createProductSnapshot(productId, platform, snapshotType)
        snapshotIds.push(snapshotId)
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error'
        errors.push(`Product ${productId}: ${errorMsg}`)
        console.error(`[Snapshot] Failed to create snapshot for product ${productId}:`, error)
      }
    }

    if (errors.length > 0) {
      console.warn(`[Snapshot] ${errors.length} snapshot(s) failed:`, errors)
    }

    return snapshotIds
  }

  /**
   * Get the latest snapshot for a product
   */
  async getLatestSnapshot(productId: string, platform: string): Promise<Snapshot | null> {
    const { data, error } = await this.context.supabase
      .from('product_snapshots')
      .select('*')
      .eq('product_id', productId)
      .eq('platform', platform)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (error) {
      console.error('[Snapshot] Failed to get latest snapshot:', error)
      return null
    }

    return data
  }

  /**
   * Get snapshot at specific timestamp
   */
  async getSnapshotAtTime(
    productId: string,
    platform: string,
    timestamp: string
  ): Promise<Snapshot | null> {
    const { data, error } = await this.context.supabase
      .from('product_snapshots')
      .select('*')
      .eq('product_id', productId)
      .eq('platform', platform)
      .lte('created_at', timestamp)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (error) {
      console.error('[Snapshot] Failed to get snapshot at time:', error)
      return null
    }

    return data
  }

  /**
   * Calculate MD5 checksum of data
   */
  private async calculateChecksum(data: any): Promise<string> {
    const dataStr = JSON.stringify(data)
    const encoder = new TextEncoder()
    const dataBuffer = encoder.encode(dataStr)
    const hashBuffer = await crypto.subtle.digest('MD5', dataBuffer)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  }

  /**
   * Verify snapshot integrity
   */
  async verifySnapshot(snapshotId: string): Promise<boolean> {
    const { data: snapshot, error } = await this.context.supabase
      .from('product_snapshots')
      .select('snapshot_data, data_checksum')
      .eq('id', snapshotId)
      .single()

    if (error || !snapshot) {
      return false
    }

    const calculatedChecksum = await this.calculateChecksum(snapshot.snapshot_data)
    return calculatedChecksum === snapshot.data_checksum
  }
}

// ========== CHANGE TRACKER SERVICE ==========

export class ChangeTracker {
  private context: BackupContext

  constructor(context: BackupContext) {
    this.context = context
  }

  /**
   * Log a field-level change
   */
  async logChange(params: {
    entityType: 'product' | 'inventory' | 'order'
    entityId: string
    platform: 'netsuite' | 'shopify'
    operation: 'create' | 'update' | 'delete' | 'sync'
    fieldName: string
    oldValue: any
    newValue: any
    changeSource: 'sync' | 'manual' | 'api' | 'webhook'
    triggeredBy?: string
    beforeSnapshotId?: string
    afterSnapshotId?: string
  }): Promise<void> {
    // Calculate diff for complex objects
    const valueDiff = this.calculateDiff(params.oldValue, params.newValue)

    await this.context.supabase
      .from('change_log')
      .insert({
        user_id: this.context.userId,
        entity_type: params.entityType,
        entity_id: params.entityId,
        platform: params.platform,
        operation: params.operation,
        sync_log_id: this.context.syncLogId,
        field_name: params.fieldName,
        old_value: params.oldValue,
        new_value: params.newValue,
        value_diff: valueDiff,
        change_source: params.changeSource,
        triggered_by: params.triggeredBy || 'system',
        before_snapshot_id: params.beforeSnapshotId,
        after_snapshot_id: params.afterSnapshotId
      })
  }

  /**
   * Log multiple changes in batch
   */
  async logBatchChanges(changes: Array<{
    entityType: 'product' | 'inventory' | 'order'
    entityId: string
    platform: 'netsuite' | 'shopify'
    operation: 'create' | 'update' | 'delete' | 'sync'
    fieldName: string
    oldValue: any
    newValue: any
  }>, changeSource: 'sync' | 'manual' | 'api' | 'webhook'): Promise<void> {
    const changeRecords = changes.map(change => ({
      user_id: this.context.userId,
      entity_type: change.entityType,
      entity_id: change.entityId,
      platform: change.platform,
      operation: change.operation,
      sync_log_id: this.context.syncLogId,
      field_name: change.fieldName,
      old_value: change.oldValue,
      new_value: change.newValue,
      value_diff: this.calculateDiff(change.oldValue, change.newValue),
      change_source: changeSource,
      triggered_by: 'system'
    }))

    await this.context.supabase
      .from('change_log')
      .insert(changeRecords)
  }

  /**
   * Get changes for an entity within a time range
   */
  async getEntityChanges(
    entityId: string,
    startTime: string,
    endTime: string
  ): Promise<any[]> {
    const { data, error } = await this.context.supabase
      .from('change_log')
      .select('*')
      .eq('user_id', this.context.userId)
      .eq('entity_id', entityId)
      .gte('changed_at', startTime)
      .lte('changed_at', endTime)
      .order('changed_at', { ascending: false })

    if (error) {
      console.error('[ChangeTracker] Failed to get entity changes:', error)
      return []
    }

    return data || []
  }

  /**
   * Calculate diff between two values
   */
  private calculateDiff(oldValue: any, newValue: any): any {
    if (typeof oldValue !== 'object' || typeof newValue !== 'object') {
      return { type: 'simple', changed: oldValue !== newValue }
    }

    const diff: any = {}
    const allKeys = new Set([
      ...Object.keys(oldValue || {}),
      ...Object.keys(newValue || {})
    ])

    for (const key of allKeys) {
      const oldVal = oldValue?.[key]
      const newVal = newValue?.[key]

      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        diff[key] = {
          old: oldVal,
          new: newVal
        }
      }
    }

    return diff
  }
}

// ========== RESTORE POINT SERVICE ==========

export class RestorePointService {
  private context: BackupContext

  constructor(context: BackupContext) {
    this.context = context
  }

  /**
   * Create a named restore point
   */
  async createRestorePoint(
    name: string,
    description: string = '',
    pointType: 'automatic' | 'manual' | 'pre_sync' | 'post_sync' = 'manual'
  ): Promise<string> {
    console.log(`[RestorePoint] Creating restore point: ${name}`)

    // Use database function to create restore point
    const { data, error } = await this.context.supabase
      .rpc('create_restore_point', {
        p_user_id: this.context.userId,
        p_name: name,
        p_description: description,
        p_point_type: pointType
      })

    if (error) {
      throw new Error(`Failed to create restore point: ${error.message}`)
    }

    const restorePointId = data

    // Create snapshots for all current products
    const { data: products } = await this.context.supabase
      .from('products')
      .select('id, platform')
      .eq('user_id', this.context.userId)

    if (products && products.length > 0) {
      const snapshotService = new SnapshotService(this.context)
      
      for (const product of products) {
        try {
          await snapshotService.createProductSnapshot(
            product.id,
            product.platform,
            'manual'
          )
        } catch (error) {
          console.error(`[RestorePoint] Failed to create snapshot for product ${product.id}:`, error)
        }
      }

      // Link snapshots to restore point
      await this.context.supabase
        .from('product_snapshots')
        .update({ restore_point_id: restorePointId })
        .eq('user_id', this.context.userId)
        .gte('created_at', new Date(Date.now() - 60000).toISOString()) // Last minute
    }

    console.log(`[RestorePoint] Created restore point ${restorePointId} with ${products?.length || 0} snapshots`)
    return restorePointId
  }

  /**
   * Get all restore points within time range
   */
  async getRestorePoints(
    startDate?: string,
    endDate?: string
  ): Promise<RestorePoint[]> {
    let query = this.context.supabase
      .from('restore_points')
      .select('*')
      .eq('user_id', this.context.userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })

    if (startDate) {
      query = query.gte('created_at', startDate)
    }

    if (endDate) {
      query = query.lte('created_at', endDate)
    }

    const { data, error } = await query

    if (error) {
      console.error('[RestorePoint] Failed to get restore points:', error)
      return []
    }

    return data || []
  }

  /**
   * Get restore points from last N days
   */
  async getRecentRestorePoints(days: number = 14): Promise<RestorePoint[]> {
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    return this.getRestorePoints(startDate.toISOString())
  }
}

// ========== ROLLBACK SERVICE ==========

export class RollbackService {
  private context: BackupContext

  constructor(context: BackupContext) {
    this.context = context
  }

  /**
   * Execute rollback to a restore point
   */
  async rollbackToRestorePoint(
    restorePointId: string,
    options: {
      dryRun?: boolean
      platforms?: ('netsuite' | 'shopify')[]
      entityIds?: string[]
    } = {}
  ): Promise<RollbackResult> {
    console.log(`[Rollback] Starting rollback to restore point ${restorePointId}`)

    const result: RollbackResult = {
      success: false,
      items_restored: 0,
      items_failed: 0,
      errors: [],
      warnings: []
    }

    // Get restore point
    const { data: restorePoint, error: rpError } = await this.context.supabase
      .from('restore_points')
      .select('*')
      .eq('id', restorePointId)
      .single()

    if (rpError || !restorePoint) {
      result.errors.push('Restore point not found')
      return result
    }

    // Get snapshots associated with this restore point
    let snapshotsQuery = this.context.supabase
      .from('product_snapshots')
      .select('*')
      .eq('restore_point_id', restorePointId)

    if (options.platforms) {
      snapshotsQuery = snapshotsQuery.in('platform', options.platforms)
    }

    if (options.entityIds) {
      snapshotsQuery = snapshotsQuery.in('product_id', options.entityIds)
    }

    const { data: snapshots, error: snapshotsError } = await snapshotsQuery

    if (snapshotsError || !snapshots) {
      result.errors.push('Failed to retrieve snapshots')
      return result
    }

    console.log(`[Rollback] Found ${snapshots.length} snapshots to restore`)

    // Create rollback operation record
    const { data: rollbackOp, error: rollbackError } = await this.context.supabase
      .from('rollback_operations')
      .insert({
        user_id: this.context.userId,
        restore_point_id: restorePointId,
        target_timestamp: restorePoint.created_at,
        entity_type: 'product',
        entity_ids: options.entityIds || null,
        platforms: options.platforms || ['netsuite', 'shopify'],
        status: 'running',
        dry_run: options.dryRun || false,
        items_to_restore: snapshots.length
      })
      .select()
      .single()

    if (rollbackError) {
      result.errors.push('Failed to create rollback operation')
      return result
    }

    // Restore each snapshot
    for (const snapshot of snapshots) {
      try {
        if (!options.dryRun) {
          await this.restoreProductFromSnapshot(snapshot)
        }
        
        result.items_restored++
        
        console.log(`[Rollback] Restored product ${snapshot.product_id} from snapshot ${snapshot.id}`)
      } catch (error) {
        result.items_failed++
        const errorMsg = error instanceof Error ? error.message : 'Unknown error'
        result.errors.push(`Product ${snapshot.product_id}: ${errorMsg}`)
        
        console.error(`[Rollback] Failed to restore product ${snapshot.product_id}:`, error)
      }
    }

    result.success = result.items_failed === 0

    // Update rollback operation
    await this.context.supabase
      .from('rollback_operations')
      .update({
        status: result.success ? 'completed' : 'failed',
        items_restored: result.items_restored,
        items_failed: result.items_failed,
        errors: result.errors,
        warnings: result.warnings,
        completed_at: new Date().toISOString()
      })
      .eq('id', rollbackOp.id)

    // Update restore point status
    if (result.success && !options.dryRun) {
      await this.context.supabase
        .from('restore_points')
        .update({
          status: 'restored',
          restored_at: new Date().toISOString(),
          restored_by: this.context.userId,
          restore_result: result
        })
        .eq('id', restorePointId)
    }

    console.log(`[Rollback] Rollback completed: ${result.items_restored} restored, ${result.items_failed} failed`)
    return result
  }

  /**
   * Rollback to specific timestamp
   */
  async rollbackToTimestamp(
    timestamp: string,
    options: {
      dryRun?: boolean
      platforms?: ('netsuite' | 'shopify')[]
      entityIds?: string[]
    } = {}
  ): Promise<RollbackResult> {
    console.log(`[Rollback] Starting rollback to timestamp ${timestamp}`)

    const result: RollbackResult = {
      success: false,
      items_restored: 0,
      items_failed: 0,
      errors: [],
      warnings: []
    }

    // Get all products
    let productsQuery = this.context.supabase
      .from('products')
      .select('id, platform')
      .eq('user_id', this.context.userId)

    if (options.platforms) {
      productsQuery = productsQuery.in('platform', options.platforms)
    }

    if (options.entityIds) {
      productsQuery = productsQuery.in('id', options.entityIds)
    }

    const { data: products, error: productsError } = await productsQuery

    if (productsError || !products) {
      result.errors.push('Failed to retrieve products')
      return result
    }

    // For each product, get snapshot at the target timestamp
    for (const product of products) {
      try {
        const { data: snapshot } = await this.context.supabase
          .from('product_snapshots')
          .select('*')
          .eq('product_id', product.id)
          .eq('platform', product.platform)
          .lte('created_at', timestamp)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        if (snapshot) {
          if (!options.dryRun) {
            await this.restoreProductFromSnapshot(snapshot)
          }
          result.items_restored++
        } else {
          result.warnings.push(`No snapshot found for product ${product.id} at ${timestamp}`)
        }
      } catch (error) {
        result.items_failed++
        const errorMsg = error instanceof Error ? error.message : 'Unknown error'
        result.errors.push(`Product ${product.id}: ${errorMsg}`)
      }
    }

    result.success = result.items_failed === 0

    return result
  }

  /**
   * Restore a product from a snapshot
   */
  private async restoreProductFromSnapshot(snapshot: Snapshot): Promise<void> {
    const snapshotData = snapshot.snapshot_data

    // Update product in database
    const { error } = await this.context.supabase
      .from('products')
      .update({
        ...snapshotData,
        updated_at: new Date().toISOString()
      })
      .eq('id', snapshot.product_id)

    if (error) {
      throw new Error(`Failed to restore product: ${error.message}`)
    }

    // Log the restoration
    const changeTracker = new ChangeTracker(this.context)
    await changeTracker.logChange({
      entityType: 'product',
      entityId: snapshot.product_id,
      platform: snapshot.platform as 'netsuite' | 'shopify',
      operation: 'update',
      fieldName: '_restored',
      oldValue: 'current_state',
      newValue: `restored_from_snapshot_${snapshot.id}`,
      changeSource: 'manual',
      triggeredBy: 'rollback_operation',
      beforeSnapshotId: snapshot.id
    })
  }

  /**
   * Validate rollback feasibility (dry run)
   */
  async validateRollback(
    restorePointId: string,
    platforms?: ('netsuite' | 'shopify')[]
  ): Promise<{
    valid: boolean
    errors: string[]
    warnings: string[]
    itemsToRestore: number
  }> {
    const validation = {
      valid: true,
      errors: [] as string[],
      warnings: [] as string[],
      itemsToRestore: 0
    }

    // Check if restore point exists
    const { data: restorePoint, error } = await this.context.supabase
      .from('restore_points')
      .select('*')
      .eq('id', restorePointId)
      .single()

    if (error || !restorePoint) {
      validation.valid = false
      validation.errors.push('Restore point not found')
      return validation
    }

    // Check if snapshots exist
    let snapshotsQuery = this.context.supabase
      .from('product_snapshots')
      .select('id, product_id, data_checksum')
      .eq('restore_point_id', restorePointId)

    if (platforms) {
      snapshotsQuery = snapshotsQuery.in('platform', platforms)
    }

    const { data: snapshots } = await snapshotsQuery

    if (!snapshots || snapshots.length === 0) {
      validation.valid = false
      validation.errors.push('No snapshots found for restore point')
      return validation
    }

    validation.itemsToRestore = snapshots.length

    // Verify snapshot integrity
    const snapshotService = new SnapshotService(this.context)
    for (const snapshot of snapshots) {
      const isValid = await snapshotService.verifySnapshot(snapshot.id)
      if (!isValid) {
        validation.warnings.push(`Snapshot ${snapshot.id} has integrity issues`)
      }
    }

    return validation
  }
}

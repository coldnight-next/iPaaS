// Field Mapping Service
// Handles custom field mappings and transformations during sync operations

import { createSupabaseClient } from './supabaseClient.ts'

export interface FieldMapping {
  id: string
  user_id: string
  source_platform: 'netsuite' | 'shopify'
  target_platform: 'netsuite' | 'shopify'
  source_field: string
  target_field: string
  transformation_type: 'direct' | 'uppercase' | 'lowercase' | 'trim' | 'date_format' | 'number_format' | 'lookup' | 'javascript'
  transformation_config?: Record<string, any>
  is_active: boolean
  priority: number
  created_at: string
  updated_at: string
}

export interface MappingResult {
  success: boolean
  originalValue: any
  transformedValue: any
  appliedMapping?: FieldMapping
  error?: string
}

export class FieldMappingService {
  private supabase = createSupabaseClient()

  // Get all active field mappings for a user
  async getFieldMappings(userId: string): Promise<FieldMapping[]> {
    const { data, error } = await this.supabase
      .from('field_mappings')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('priority', { ascending: false })

    if (error) {
      console.error('[FieldMapping] Failed to get mappings:', error)
      return []
    }

    return data || []
  }

  // Apply field mappings to data
  async applyFieldMappings(
    data: Record<string, any>,
    sourcePlatform: 'netsuite' | 'shopify',
    targetPlatform: 'netsuite' | 'shopify',
    userId: string
  ): Promise<Record<string, any>> {
    const mappings = await this.getFieldMappings(userId)
    const result = { ...data }

    // Filter mappings for this platform pair
    const relevantMappings = mappings.filter(mapping =>
      mapping.source_platform === sourcePlatform &&
      mapping.target_platform === targetPlatform
    )

    // Apply each mapping
    for (const mapping of relevantMappings) {
      const mappingResult = await this.applySingleMapping(data, mapping)

      if (mappingResult.success && mappingResult.transformedValue !== undefined) {
        result[mapping.target_field] = mappingResult.transformedValue
      } else if (mappingResult.error) {
        console.warn(`[FieldMapping] Failed to apply mapping ${mapping.id}:`, mappingResult.error)
      }
    }

    return result
  }

  // Apply a single field mapping
  private async applySingleMapping(
    data: Record<string, any>,
    mapping: FieldMapping
  ): Promise<MappingResult> {
    const originalValue = data[mapping.source_field]

    // Skip if source field doesn't exist
    if (originalValue === undefined || originalValue === null) {
      return {
        success: true,
        originalValue,
        transformedValue: undefined
      }
    }

    try {
      let transformedValue: any

      switch (mapping.transformation_type) {
        case 'direct':
          transformedValue = originalValue
          break

        case 'uppercase':
          transformedValue = String(originalValue).toUpperCase()
          break

        case 'lowercase':
          transformedValue = String(originalValue).toLowerCase()
          break

        case 'trim':
          transformedValue = String(originalValue).trim()
          break

        case 'date_format':
          transformedValue = this.transformDateFormat(originalValue, mapping.transformation_config)
          break

        case 'number_format':
          transformedValue = this.transformNumberFormat(originalValue, mapping.transformation_config)
          break

        case 'lookup':
          transformedValue = await this.transformLookup(originalValue, mapping.transformation_config)
          break

        case 'javascript':
          transformedValue = this.transformJavaScript(originalValue, mapping.transformation_config)
          break

        default:
          return {
            success: false,
            originalValue,
            transformedValue: undefined,
            error: `Unknown transformation type: ${mapping.transformation_type}`
          }
      }

      return {
        success: true,
        originalValue,
        transformedValue,
        appliedMapping: mapping
      }

    } catch (error) {
      return {
        success: false,
        originalValue,
        transformedValue: undefined,
        error: error instanceof Error ? error.message : 'Transformation failed'
      }
    }
  }

  // Date format transformation
  private transformDateFormat(value: any, config?: Record<string, any>): string {
    const date = new Date(value)
    if (isNaN(date.getTime())) {
      throw new Error('Invalid date value')
    }

    const format = config?.format || 'YYYY-MM-DD'
    // Simple date formatting - in production, use a proper date library
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')

    switch (format) {
      case 'YYYY-MM-DD':
        return `${year}-${month}-${day}`
      case 'MM/DD/YYYY':
        return `${month}/${day}/${year}`
      case 'DD/MM/YYYY':
        return `${day}/${month}/${year}`
      default:
        return date.toISOString().split('T')[0]
    }
  }

  // Number format transformation
  private transformNumberFormat(value: any, config?: Record<string, any>): number | string {
    const num = Number(value)
    if (isNaN(num)) {
      throw new Error('Invalid number value')
    }

    const decimals = config?.decimals ?? 2
    const format = config?.format || 'number'

    switch (format) {
      case 'currency':
        return num.toFixed(decimals)
      case 'percentage':
        return `${(num * 100).toFixed(decimals)}%`
      case 'integer':
        return Math.round(num)
      default:
        return Number(num.toFixed(decimals))
    }
  }

  // Lookup table transformation
  private async transformLookup(value: any, config?: Record<string, any>): Promise<any> {
    if (!config?.tableName) {
      throw new Error('Lookup table name not specified')
    }

    const { data, error } = await this.supabase
      .from(config.tableName)
      .select(config.targetColumn || 'value')
      .eq(config.sourceColumn || 'key', value)
      .single()

    if (error) {
      throw new Error(`Lookup failed: ${error.message}`)
    }

    return data?.[config.targetColumn || 'value']
  }

  // JavaScript transformation (with safety restrictions)
  private transformJavaScript(value: any, config?: Record<string, any>): any {
    if (!config?.script) {
      throw new Error('JavaScript transformation script not provided')
    }

    // Create a safe evaluation context
    const context = {
      input: value,
      output: null,
      // Add utility functions
      uppercase: (str: string) => str.toUpperCase(),
      lowercase: (str: string) => str.toLowerCase(),
      trim: (str: string) => str.trim(),
      substring: (str: string, start: number, end?: number) => str.substring(start, end),
      replace: (str: string, search: string, replace: string) => str.replace(search, replace),
      split: (str: string, separator: string) => str.split(separator),
      join: (arr: any[], separator: string) => arr.join(separator)
    }

    try {
      // Evaluate the script in the safe context
      const script = config.script
      // Simple script evaluation - in production, use a proper sandbox
      const result = new Function('context', `with(context) { ${script} }`)(context)

      return context.output !== null ? context.output : result
    } catch (error) {
      throw new Error(`JavaScript transformation failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // Create a new field mapping
  async createFieldMapping(mapping: Omit<FieldMapping, 'id' | 'created_at' | 'updated_at'>): Promise<FieldMapping | null> {
    const { data, error } = await this.supabase
      .from('field_mappings')
      .insert(mapping)
      .select()
      .single()

    if (error) {
      console.error('[FieldMapping] Failed to create mapping:', error)
      return null
    }

    return data
  }

  // Update an existing field mapping
  async updateFieldMapping(id: string, updates: Partial<FieldMapping>): Promise<boolean> {
    const { error } = await this.supabase
      .from('field_mappings')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) {
      console.error('[FieldMapping] Failed to update mapping:', error)
      return false
    }

    return true
  }

  // Delete a field mapping
  async deleteFieldMapping(id: string): Promise<boolean> {
    const { error } = await this.supabase
      .from('field_mappings')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('[FieldMapping] Failed to delete mapping:', error)
      return false
    }

    return true
  }

  // Validate a field mapping configuration
  async validateMapping(mapping: Partial<FieldMapping>): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = []

    if (!mapping.user_id) errors.push('User ID is required')
    if (!mapping.source_platform) errors.push('Source platform is required')
    if (!mapping.target_platform) errors.push('Target platform is required')
    if (!mapping.source_field) errors.push('Source field is required')
    if (!mapping.target_field) errors.push('Target field is required')
    if (!mapping.transformation_type) errors.push('Transformation type is required')

    // Validate transformation-specific requirements
    if (mapping.transformation_type === 'lookup') {
      if (!mapping.transformation_config?.tableName) {
        errors.push('Lookup transformation requires tableName in config')
      }
    }

    if (mapping.transformation_type === 'javascript') {
      if (!mapping.transformation_config?.script) {
        errors.push('JavaScript transformation requires script in config')
      }
    }

    return {
      valid: errors.length === 0,
      errors
    }
  }

  // Get mapping statistics
  async getMappingStats(userId: string): Promise<{
    totalMappings: number
    activeMappings: number
    mappingsByType: Record<string, number>
    recentErrors: any[]
  }> {
    const mappings = await this.getFieldMappings(userId)

    const stats = {
      totalMappings: mappings.length,
      activeMappings: mappings.filter(m => m.is_active).length,
      mappingsByType: mappings.reduce((acc, mapping) => {
        acc[mapping.transformation_type] = (acc[mapping.transformation_type] || 0) + 1
        return acc
      }, {} as Record<string, number>),
      recentErrors: [] // Would be populated from error logs
    }

    return stats
  }
}

// Export singleton instance
export const fieldMappingService = new FieldMappingService()
// Automatic Error Resolution System
// Automatically resolves common errors without user intervention

import { ErrorType, classifyError } from './retryUtils'
import { auditTrail } from './auditTrail'

export interface AutoResolutionRule {
  id: string
  errorType: ErrorType
  condition: (error: any, context?: any) => boolean
  resolution: (error: any, context?: any) => Promise<boolean>
  description: string
  enabled: boolean
}

export interface ResolutionResult {
  resolved: boolean
  action: string
  message: string
}

export class AutoErrorResolver {
  private static instance: AutoErrorResolver
  private rules: AutoResolutionRule[] = []

  private constructor() {
    this.initializeDefaultRules()
  }

  static getInstance(): AutoErrorResolver {
    if (!AutoErrorResolver.instance) {
      AutoErrorResolver.instance = new AutoErrorResolver()
    }
    return AutoErrorResolver.instance
  }

  private initializeDefaultRules() {
    // Rule 1: Handle expired OAuth tokens
    this.addRule({
      id: 'oauth_token_refresh',
      errorType: ErrorType.AUTHENTICATION,
      condition: (error) => {
        return error.message?.includes('token') ||
               error.message?.includes('expired') ||
               error.status === 401
      },
      resolution: async (error, context) => {
        // Attempt to refresh OAuth token
        console.log('[AutoResolver] Attempting OAuth token refresh')
        // Implementation would call OAuth refresh endpoint
        return false // Placeholder - would return true if successful
      },
      description: 'Automatically refresh expired OAuth tokens',
      enabled: true
    })

    // Rule 2: Handle rate limiting
    this.addRule({
      id: 'rate_limit_backoff',
      errorType: ErrorType.RATE_LIMIT,
      condition: (error) => {
        return error.status === 429 ||
               error.message?.includes('rate limit') ||
               error.message?.includes('too many requests')
      },
      resolution: async (error, context) => {
        // Wait for rate limit reset
        const resetTime = error.headers?.['x-ratelimit-reset'] ||
                          error.headers?.['retry-after'] ||
                          60 // Default 60 seconds

        console.log(`[AutoResolver] Waiting ${resetTime} seconds for rate limit reset`)
        await new Promise(resolve => setTimeout(resolve, resetTime * 1000))
        return true
      },
      description: 'Wait for rate limit reset before retrying',
      enabled: true
    })

    // Rule 3: Handle temporary network issues
    this.addRule({
      id: 'network_retry',
      errorType: ErrorType.NETWORK,
      condition: (error) => {
        return error.name === 'NetworkError' ||
               error.message?.includes('fetch') ||
               error.code === 'NETWORK_ERROR'
      },
      resolution: async (error, context) => {
        // Simple retry after short delay
        console.log('[AutoResolver] Retrying after network error')
        await new Promise(resolve => setTimeout(resolve, 2000))
        return true
      },
      description: 'Retry after temporary network issues',
      enabled: true
    })

    // Rule 4: Handle timeout errors
    this.addRule({
      id: 'timeout_extension',
      errorType: ErrorType.TIMEOUT,
      condition: (error) => {
        return error.message?.includes('timeout') ||
               error.code === 'ETIMEDOUT' ||
               error.status === 408
      },
      resolution: async (error, context) => {
        // Increase timeout for next attempt
        console.log('[AutoResolver] Extending timeout for next attempt')
        if (context?.increaseTimeout) {
          context.increaseTimeout()
        }
        return true
      },
      description: 'Extend timeout for operations that are taking longer',
      enabled: true
    })

    // Rule 5: Handle validation errors by cleaning data
    this.addRule({
      id: 'data_validation_fix',
      errorType: ErrorType.VALIDATION,
      condition: (error) => {
        return error.status === 422 ||
               error.message?.includes('validation') ||
               error.message?.includes('invalid')
      },
      resolution: async (error, context) => {
        // Attempt to clean/sanitize data
        console.log('[AutoResolver] Attempting to fix validation error')
        if (context?.sanitizeData) {
          context.sanitizeData()
          return true
        }
        return false
      },
      description: 'Automatically clean data to fix validation errors',
      enabled: true
    })
  }

  addRule(rule: AutoResolutionRule): void {
    this.rules.push(rule)
  }

  removeRule(ruleId: string): void {
    this.rules = this.rules.filter(rule => rule.id !== ruleId)
  }

  async resolveError(error: any, context?: any): Promise<ResolutionResult> {
    const classifiedError = classifyError(error)

    // Find matching enabled rules
    const matchingRules = this.rules.filter(rule =>
      rule.enabled &&
      rule.errorType === classifiedError.type &&
      rule.condition(error, context)
    )

    if (matchingRules.length === 0) {
      return {
        resolved: false,
        action: 'none',
        message: 'No automatic resolution available for this error type'
      }
    }

    // Try each matching rule
    for (const rule of matchingRules) {
      try {
        console.log(`[AutoResolver] Attempting resolution: ${rule.description}`)
        const resolved = await rule.resolution(error, context)

        if (resolved) {
          // Log successful resolution
          auditTrail.logSystemEvent(
            'error_resolved',
            'medium',
            `Auto-resolved ${classifiedError.type} error: ${rule.description}`,
            {
              errorType: classifiedError.type,
              ruleId: rule.id,
              originalError: error.message
            }
          )

          return {
            resolved: true,
            action: rule.id,
            message: `Automatically resolved: ${rule.description}`
          }
        }
      } catch (resolutionError) {
        console.error(`[AutoResolver] Resolution failed for rule ${rule.id}:`, resolutionError)
        // Continue to next rule
      }
    }

    return {
      resolved: false,
      action: 'failed',
      message: 'All automatic resolution attempts failed'
    }
  }

  getRules(): AutoResolutionRule[] {
    return [...this.rules]
  }

  enableRule(ruleId: string): void {
    const rule = this.rules.find(r => r.id === ruleId)
    if (rule) {
      rule.enabled = true
    }
  }

  disableRule(ruleId: string): void {
    const rule = this.rules.find(r => r.id === ruleId)
    if (rule) {
      rule.enabled = false
    }
  }

  // Get resolution statistics
  getStats(): {
    totalRules: number
    enabledRules: number
    rulesByType: Record<ErrorType, number>
  } {
    const enabledRules = this.rules.filter(r => r.enabled)
    const rulesByType = this.rules.reduce((acc, rule) => {
      acc[rule.errorType] = (acc[rule.errorType] || 0) + 1
      return acc
    }, {} as Record<ErrorType, number>)

    return {
      totalRules: this.rules.length,
      enabledRules: enabledRules.length,
      rulesByType
    }
  }
}

// Global auto resolver instance
export const autoErrorResolver = AutoErrorResolver.getInstance()

// Utility function for easy error resolution
export const resolveError = (error: any, context?: any) =>
  autoErrorResolver.resolveError(error, context)
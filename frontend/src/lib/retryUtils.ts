// Smart Retry Utility with Exponential Backoff
// Provides intelligent retry logic for API calls and operations

export interface RetryOptions {
  maxRetries?: number
  baseDelay?: number
  maxDelay?: number
  backoffFactor?: number
  retryCondition?: (error: any) => boolean
  onRetry?: (attempt: number, error: any, delay: number) => void
}

export interface RetryResult<T> {
  success: boolean
  data?: T
  error?: any
  attempts: number
  totalDelay: number
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  backoffFactor: 2,
  retryCondition: (error: any) => {
    // Default retry condition - retry on network errors, 5xx, and specific 4xx
    if (!error) return false

    // Network errors
    if (error.name === 'NetworkError' || error.message?.includes('fetch')) return true

    // HTTP status codes
    const status = error.status || error.response?.status
    if (status) {
      // Retry on server errors (5xx)
      if (status >= 500) return true
      // Retry on specific client errors (429 rate limit, 408 timeout)
      if ([408, 429].includes(status)) return true
    }

    return false
  },
  onRetry: (attempt: number, error: any, delay: number) => {
    console.log(`[Retry] Attempt ${attempt} failed, retrying in ${delay}ms:`, error.message || error)
  }
}

export class RetryManager {
  private static calculateDelay(attempt: number, options: Required<RetryOptions>): number {
    const exponentialDelay = options.baseDelay * Math.pow(options.backoffFactor, attempt - 1)
    const jitteredDelay = exponentialDelay * (0.5 + Math.random() * 0.5) // Add jitter
    return Math.min(jitteredDelay, options.maxDelay)
  }

  static async execute<T>(
    operation: () => Promise<T>,
    options: RetryOptions = {}
  ): Promise<RetryResult<T>> {
    const config = { ...DEFAULT_OPTIONS, ...options }
    let lastError: any
    let totalDelay = 0

    for (let attempt = 1; attempt <= config.maxRetries + 1; attempt++) {
      try {
        const result = await operation()
        return {
          success: true,
          data: result,
          attempts: attempt,
          totalDelay
        }
      } catch (error) {
        lastError = error

        // Check if we should retry
        if (attempt <= config.maxRetries && config.retryCondition(error)) {
          const delay = this.calculateDelay(attempt, config)
          totalDelay += delay

          config.onRetry(attempt, error, delay)
          await new Promise(resolve => setTimeout(resolve, delay))
          continue
        }

        // No more retries or shouldn't retry
        break
      }
    }

    return {
      success: false,
      error: lastError,
      attempts: config.maxRetries + 1,
      totalDelay
    }
  }

  // Specialized retry for API calls
  static async apiCall<T>(
    apiCall: () => Promise<T>,
    options: RetryOptions = {}
  ): Promise<RetryResult<T>> {
    const apiOptions: RetryOptions = {
      maxRetries: 3,
      baseDelay: 1000,
      retryCondition: (error) => {
        // API-specific retry conditions
        if (error.name === 'NetworkError') return true
        if (error.message?.includes('fetch')) return true

        const status = error.status || error.response?.status
        if (status) {
          // Server errors
          if (status >= 500) return true
          // Rate limiting
          if (status === 429) return true
          // Request timeout
          if (status === 408) return true
        }

        return false
      },
      ...options
    }

    return this.execute(apiCall, apiOptions)
  }

  // Specialized retry for database operations
  static async databaseOperation<T>(
    dbOperation: () => Promise<T>,
    options: RetryOptions = {}
  ): Promise<RetryResult<T>> {
    const dbOptions: RetryOptions = {
      maxRetries: 2,
      baseDelay: 500,
      retryCondition: (error) => {
        // Database-specific retry conditions
        if (error.code === 'PGRST301') return true // Connection error
        if (error.message?.includes('connection')) return true
        if (error.message?.includes('timeout')) return true
        return false
      },
      ...options
    }

    return this.execute(dbOperation, dbOptions)
  }
}

// Utility functions for common retry scenarios
export const retryApiCall = RetryManager.apiCall.bind(RetryManager)
export const retryDatabaseOperation = RetryManager.databaseOperation.bind(RetryManager)
export const retryWithBackoff = RetryManager.execute.bind(RetryManager)

// Error classification utility
export enum ErrorType {
  NETWORK = 'network',
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  RATE_LIMIT = 'rate_limit',
  VALIDATION = 'validation',
  SERVER_ERROR = 'server_error',
  TIMEOUT = 'timeout',
  UNKNOWN = 'unknown'
}

export interface ClassifiedError {
  type: ErrorType
  message: string
  originalError: any
  retryable: boolean
  userMessage: string
}

export function classifyError(error: any): ClassifiedError {
  const errorMessage = error.message || error.toString()
  const status = error.status || error.response?.status

  // Network errors
  if (error.name === 'NetworkError' || errorMessage.includes('fetch')) {
    return {
      type: ErrorType.NETWORK,
      message: errorMessage,
      originalError: error,
      retryable: true,
      userMessage: 'Network connection issue. Please check your internet connection.'
    }
  }

  // HTTP status codes
  if (status) {
    switch (status) {
      case 401:
        return {
          type: ErrorType.AUTHENTICATION,
          message: errorMessage,
          originalError: error,
          retryable: false,
          userMessage: 'Authentication failed. Please check your credentials.'
        }
      case 403:
        return {
          type: ErrorType.AUTHORIZATION,
          message: errorMessage,
          originalError: error,
          retryable: false,
          userMessage: 'Access denied. You do not have permission for this action.'
        }
      case 429:
        return {
          type: ErrorType.RATE_LIMIT,
          message: errorMessage,
          originalError: error,
          retryable: true,
          userMessage: 'Too many requests. Please wait a moment and try again.'
        }
      case 408:
      case 504:
        return {
          type: ErrorType.TIMEOUT,
          message: errorMessage,
          originalError: error,
          retryable: true,
          userMessage: 'Request timed out. Please try again.'
        }
      case 422:
        return {
          type: ErrorType.VALIDATION,
          message: errorMessage,
          originalError: error,
          retryable: false,
          userMessage: 'Invalid data provided. Please check your input.'
        }
      default:
        if (status >= 500) {
          return {
            type: ErrorType.SERVER_ERROR,
            message: errorMessage,
            originalError: error,
            retryable: true,
            userMessage: 'Server error occurred. Please try again later.'
          }
        }
    }
  }

  // Timeout errors
  if (errorMessage.includes('timeout') || error.code === 'ETIMEDOUT') {
    return {
      type: ErrorType.TIMEOUT,
      message: errorMessage,
      originalError: error,
      retryable: true,
      userMessage: 'Operation timed out. Please try again.'
    }
  }

  // Unknown error
  return {
    type: ErrorType.UNKNOWN,
    message: errorMessage,
    originalError: error,
    retryable: false,
    userMessage: 'An unexpected error occurred. Please try again or contact support.'
  }
}
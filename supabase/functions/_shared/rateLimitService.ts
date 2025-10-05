// API Rate Limit Intelligence Service
// Intelligent rate limit detection, adaptive throttling, and API usage optimization

import { createSupabaseClient } from './supabaseClient.ts'

export interface RateLimitConfig {
  platform: 'netsuite' | 'shopify'
  maxRequestsPerMinute: number
  maxRequestsPerHour: number
  burstLimit: number
  backoffMultiplier: number
  maxBackoffSeconds: number
  retryAfterHeader?: string
}

export interface RateLimitState {
  platform: string
  userId: string
  requestsThisMinute: number
  requestsThisHour: number
  lastRequestTime: Date
  currentBackoffSeconds: number
  isThrottled: boolean
  throttleUntil?: Date
  consecutiveErrors: number
  lastErrorTime?: Date
}

export interface ApiCallResult {
  success: boolean
  statusCode?: number
  retryAfter?: number
  rateLimitRemaining?: number
  rateLimitReset?: number
  error?: string
}

const DEFAULT_CONFIGS: Record<string, RateLimitConfig> = {
  netsuite: {
    platform: 'netsuite',
    maxRequestsPerMinute: 100, // Conservative estimate
    maxRequestsPerHour: 5000,
    burstLimit: 10,
    backoffMultiplier: 2,
    maxBackoffSeconds: 300, // 5 minutes
    retryAfterHeader: 'Retry-After'
  },
  shopify: {
    platform: 'shopify',
    maxRequestsPerMinute: 40, // Shopify limit is 40 per app per store
    maxRequestsPerHour: 2000,
    burstLimit: 4,
    backoffMultiplier: 1.5,
    maxBackoffSeconds: 600, // 10 minutes
    retryAfterHeader: 'Retry-After'
  }
}

export class RateLimitService {
  private supabase = createSupabaseClient()
  private rateLimitStates = new Map<string, RateLimitState>()

  // Get rate limit configuration for a platform
  async getConfig(platform: 'netsuite' | 'shopify'): Promise<RateLimitConfig> {
    // Try to get custom config from database
    const { data: customConfig } = await this.supabase
      .from('sync_configurations')
      .select('config_value')
      .eq('config_key', `${platform}_rate_limit_config`)
      .single()

    if (customConfig?.config_value) {
      return { ...DEFAULT_CONFIGS[platform], ...customConfig.config_value }
    }

    return DEFAULT_CONFIGS[platform]
  }

  // Check if a request can be made
  async canMakeRequest(userId: string, platform: 'netsuite' | 'shopify'): Promise<{
    allowed: boolean
    waitTimeSeconds?: number
    reason?: string
  }> {
    const config = await this.getConfig(platform)
    const stateKey = `${userId}:${platform}`
    const now = new Date()

    // Get or create rate limit state
    let state = this.rateLimitStates.get(stateKey)
    if (!state) {
      state = await this.loadRateLimitState(userId, platform)
      this.rateLimitStates.set(stateKey, state)
    }

    // Check if currently throttled
    if (state.isThrottled && state.throttleUntil && state.throttleUntil > now) {
      const waitTime = Math.ceil((state.throttleUntil.getTime() - now.getTime()) / 1000)
      return {
        allowed: false,
        waitTimeSeconds: waitTime,
        reason: `Throttled due to rate limit violation. Wait ${waitTime} seconds.`
      }
    }

    // Reset counters if time windows have passed
    this.resetTimeWindows(state, now)

    // Check rate limits
    if (state.requestsThisMinute >= config.maxRequestsPerMinute) {
      const waitTime = 60 - Math.floor((now.getTime() - state.lastRequestTime.getTime()) / 1000)
      return {
        allowed: false,
        waitTimeSeconds: Math.max(1, waitTime),
        reason: `Minute limit exceeded (${state.requestsThisMinute}/${config.maxRequestsPerMinute}). Wait ${waitTime} seconds.`
      }
    }

    if (state.requestsThisHour >= config.maxRequestsPerHour) {
      const waitTime = 3600 - Math.floor((now.getTime() - state.lastRequestTime.getTime()) / 1000)
      return {
        allowed: false,
        waitTimeSeconds: Math.max(1, waitTime),
        reason: `Hour limit exceeded (${state.requestsThisHour}/${config.maxRequestsPerHour}). Wait ${waitTime} seconds.`
      }
    }

    return { allowed: true }
  }

  // Record a successful API call
  async recordSuccessfulCall(userId: string, platform: 'netsuite' | 'shopify', result: ApiCallResult): Promise<void> {
    const stateKey = `${userId}:${platform}`
    const state = this.rateLimitStates.get(stateKey)

    if (state) {
      state.requestsThisMinute++
      state.requestsThisHour++
      state.lastRequestTime = new Date()
      state.consecutiveErrors = 0 // Reset error counter

      // Update rate limit headers if provided
      if (result.rateLimitRemaining !== undefined) {
        // Could store this for more intelligent throttling
      }

      await this.saveRateLimitState(state)
    }
  }

  // Handle rate limit error
  async handleRateLimitError(
    userId: string,
    platform: 'netsuite' | 'shopify',
    result: ApiCallResult
  ): Promise<{ waitTimeSeconds: number; shouldRetry: boolean }> {
    const config = await this.getConfig(platform)
    const stateKey = `${userId}:${platform}`
    const state = this.rateLimitStates.get(stateKey)

    if (!state) return { waitTimeSeconds: 60, shouldRetry: true }

    state.consecutiveErrors++
    state.lastErrorTime = new Date()

    // Calculate backoff time
    let waitTimeSeconds = config.maxBackoffSeconds

    if (result.retryAfter) {
      // Use server-provided retry time
      waitTimeSeconds = Math.min(result.retryAfter, config.maxBackoffSeconds)
    } else {
      // Calculate exponential backoff
      const baseBackoff = Math.pow(config.backoffMultiplier, Math.min(state.consecutiveErrors - 1, 5))
      waitTimeSeconds = Math.min(baseBackoff * 30, config.maxBackoffSeconds) // Start with 30 seconds
    }

    // Set throttle state
    state.isThrottled = true
    state.throttleUntil = new Date(Date.now() + waitTimeSeconds * 1000)
    state.currentBackoffSeconds = waitTimeSeconds

    await this.saveRateLimitState(state)

    // Create alert for rate limit violation
    await this.createRateLimitAlert(userId, platform, state, waitTimeSeconds)

    const shouldRetry = state.consecutiveErrors < 5 // Stop retrying after 5 consecutive errors

    return { waitTimeSeconds, shouldRetry }
  }

  // Intelligent API call wrapper
  async makeIntelligentApiCall<T>(
    userId: string,
    platform: 'netsuite' | 'shopify',
    apiCall: () => Promise<T>,
    options: {
      maxRetries?: number
      timeoutMs?: number
      priority?: 'low' | 'normal' | 'high'
    } = {}
  ): Promise<{ success: boolean; data?: T; error?: string; retryCount?: number }> {
    const { maxRetries = 3, timeoutMs = 30000 } = options

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Check if we can make the request
        const rateLimitCheck = await this.canMakeRequest(userId, platform)

        if (!rateLimitCheck.allowed) {
          if (attempt === maxRetries) {
            return {
              success: false,
              error: rateLimitCheck.reason || 'Rate limit exceeded',
              retryCount: attempt
            }
          }

          // Wait and retry
          await new Promise(resolve => setTimeout(resolve, (rateLimitCheck.waitTimeSeconds || 60) * 1000))
          continue
        }

        // Make the API call with timeout
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('API call timeout')), timeoutMs)
        )

        const result = await Promise.race([apiCall(), timeoutPromise])

        // Record successful call
        await this.recordSuccessfulCall(userId, platform, { success: true })

        return {
          success: true,
          data: result,
          retryCount: attempt
        }

      } catch (error: any) {
        const apiResult: ApiCallResult = {
          success: false,
          error: error.message
        }

        // Check if it's a rate limit error
        if (this.isRateLimitError(error)) {
          const rateLimitResponse = await this.handleRateLimitError(userId, platform, {
            ...apiResult,
            statusCode: error.status || error.statusCode,
            retryAfter: this.extractRetryAfter(error)
          })

          if (!rateLimitResponse.shouldRetry || attempt === maxRetries) {
            return {
              success: false,
              error: `Rate limit exceeded. Wait ${rateLimitResponse.waitTimeSeconds} seconds.`,
              retryCount: attempt
            }
          }

          // Wait and retry
          await new Promise(resolve => setTimeout(resolve, rateLimitResponse.waitTimeSeconds * 1000))
          continue
        }

        // Other types of errors
        if (attempt === maxRetries) {
          return {
            success: false,
            error: error.message,
            retryCount: attempt
          }
        }

        // Exponential backoff for other errors
        const backoffMs = Math.min(1000 * Math.pow(2, attempt), 30000)
        await new Promise(resolve => setTimeout(resolve, backoffMs))
      }
    }

    return {
      success: false,
      error: 'Max retries exceeded',
      retryCount: maxRetries
    }
  }

  // Get rate limit status for monitoring
  async getRateLimitStatus(userId: string, platform: 'netsuite' | 'shopify'): Promise<{
    requestsThisMinute: number
    requestsThisHour: number
    isThrottled: boolean
    throttleUntil?: Date
    consecutiveErrors: number
    config: RateLimitConfig
  }> {
    const config = await this.getConfig(platform)
    const stateKey = `${userId}:${platform}`
    const state = this.rateLimitStates.get(stateKey) || await this.loadRateLimitState(userId, platform)

    return {
      requestsThisMinute: state.requestsThisMinute,
      requestsThisHour: state.requestsThisHour,
      isThrottled: state.isThrottled,
      throttleUntil: state.throttleUntil,
      consecutiveErrors: state.consecutiveErrors,
      config
    }
  }

  // Update rate limit configuration
  async updateConfig(platform: 'netsuite' | 'shopify', config: Partial<RateLimitConfig>): Promise<void> {
    const currentConfig = await this.getConfig(platform)
    const updatedConfig = { ...currentConfig, ...config }

    await this.supabase
      .from('sync_configurations')
      .upsert({
        config_key: `${platform}_rate_limit_config`,
        config_value: updatedConfig
      })
  }

  // Private helper methods
  private async loadRateLimitState(userId: string, platform: string): Promise<RateLimitState> {
    const { data } = await this.supabase
      .from('rate_limit_states')
      .select('*')
      .eq('user_id', userId)
      .eq('platform', platform)
      .single()

    if (data) {
      return {
        ...data,
        lastRequestTime: new Date(data.last_request_time),
        throttleUntil: data.throttle_until ? new Date(data.throttle_until) : undefined,
        lastErrorTime: data.last_error_time ? new Date(data.last_error_time) : undefined
      }
    }

    // Create new state
    return {
      platform,
      userId,
      requestsThisMinute: 0,
      requestsThisHour: 0,
      lastRequestTime: new Date(),
      currentBackoffSeconds: 0,
      isThrottled: false,
      consecutiveErrors: 0
    }
  }

  private async saveRateLimitState(state: RateLimitState): Promise<void> {
    await this.supabase
      .from('rate_limit_states')
      .upsert({
        user_id: state.userId,
        platform: state.platform,
        requests_this_minute: state.requestsThisMinute,
        requests_this_hour: state.requestsThisHour,
        last_request_time: state.lastRequestTime.toISOString(),
        current_backoff_seconds: state.currentBackoffSeconds,
        is_throttled: state.isThrottled,
        throttle_until: state.throttleUntil?.toISOString(),
        consecutive_errors: state.consecutiveErrors,
        last_error_time: state.lastErrorTime?.toISOString()
      })
  }

  private resetTimeWindows(state: RateLimitState, now: Date): void {
    const timeSinceLastRequest = now.getTime() - state.lastRequestTime.getTime()
    const secondsSinceLastRequest = timeSinceLastRequest / 1000

    // Reset minute counter if more than a minute has passed
    if (secondsSinceLastRequest >= 60) {
      state.requestsThisMinute = 0
    }

    // Reset hour counter if more than an hour has passed
    if (secondsSinceLastRequest >= 3600) {
      state.requestsThisHour = 0
    }

    // Reset throttle if time has passed
    if (state.isThrottled && state.throttleUntil && state.throttleUntil <= now) {
      state.isThrottled = false
      state.throttleUntil = undefined
      state.currentBackoffSeconds = 0
    }
  }

  private isRateLimitError(error: any): boolean {
    const statusCode = error.status || error.statusCode
    const message = error.message?.toLowerCase() || ''

    return (
      statusCode === 429 ||
      statusCode === 420 ||
      message.includes('rate limit') ||
      message.includes('too many requests') ||
      message.includes('throttle') ||
      message.includes('quota exceeded')
    )
  }

  private extractRetryAfter(error: any): number | undefined {
    // Try to extract retry-after from headers or response
    if (error.headers?.['retry-after']) {
      return parseInt(error.headers['retry-after'])
    }

    if (error.response?.headers?.['retry-after']) {
      return parseInt(error.response.headers['retry-after'])
    }

    // Try to extract from error message
    const match = error.message?.match(/retry after (\d+) seconds?/i)
    if (match) {
      return parseInt(match[1])
    }

    return undefined
  }

  private async createRateLimitAlert(
    userId: string,
    platform: string,
    state: RateLimitState,
    waitTimeSeconds: number
  ): Promise<void> {
    try {
      await this.supabase.from('alerts').insert({
        alert_rule_id: null, // System-generated alert
        user_id: userId,
        message: `Rate limit exceeded for ${platform}. Throttled for ${waitTimeSeconds} seconds. Consecutive errors: ${state.consecutiveErrors}`,
        severity: state.consecutiveErrors > 2 ? 'high' : 'medium',
        status: 'active',
        triggered_at: new Date().toISOString(),
        metadata: {
          platform,
          consecutiveErrors: state.consecutiveErrors,
          waitTimeSeconds,
          requestsThisMinute: state.requestsThisMinute,
          requestsThisHour: state.requestsThisHour
        }
      })
    } catch (error) {
      console.error('[RateLimit] Failed to create alert:', error)
    }
  }
}

// Export singleton instance
export const rateLimitService = new RateLimitService()
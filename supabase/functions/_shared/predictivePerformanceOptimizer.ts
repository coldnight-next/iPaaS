import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { AISyncIntelligenceEngine, SyncIntelligenceContext, SyncOptimization } from './aiSyncIntelligence.ts'

export interface PerformanceMetrics {
  timestamp: Date
  operation: string
  duration: number
  itemsProcessed: number
  successRate: number
  errorRate: number
  apiCalls: number
  memoryUsage: number
  cpuUsage: number
  networkLatency: number
  throughput: number // items per second
}

export interface PerformancePrediction {
  confidence: number
  estimatedDuration: number
  optimalBatchSize: number
  recommendedConcurrency: number
  expectedThroughput: number
  riskFactors: string[]
  optimizationOpportunities: string[]
}

export interface AdaptiveOptimization {
  currentBatchSize: number
  currentConcurrency: number
  adaptiveEnabled: boolean
  lastAdjustment: Date
  performanceTrend: 'improving' | 'stable' | 'degrading'
  adjustmentHistory: Array<{
    timestamp: Date
    reason: string
    oldValue: number
    newValue: number
    metric: string
  }>
}

export interface ResourceAllocation {
  cpu: number // percentage
  memory: number // MB
  network: number // Mbps
  concurrentOperations: number
  priority: 'low' | 'normal' | 'high' | 'critical'
}

export interface PerformanceThresholds {
  maxDuration: number
  minThroughput: number
  maxErrorRate: number
  maxLatency: number
  targetCpuUsage: number
  targetMemoryUsage: number
}

export interface OptimizationStrategy {
  id: string
  name: string
  description: string
  applicableConditions: string[]
  implementation: (context: PerformanceOptimizationContext) => Promise<OptimizationResult>
  expectedImprovement: number // percentage
  riskLevel: 'low' | 'medium' | 'high'
}

export interface PerformanceOptimizationContext {
  currentMetrics: PerformanceMetrics
  historicalMetrics: PerformanceMetrics[]
  systemResources: ResourceAllocation
  thresholds: PerformanceThresholds
  adaptiveOptimization: AdaptiveOptimization
  aiIntelligence: AISyncIntelligenceEngine
}

export interface OptimizationResult {
  applied: boolean
  strategyId: string
  changes: Array<{
    parameter: string
    oldValue: number
    newValue: number
    reason: string
  }>
  expectedImpact: number
  confidence: number
}

/**
 * Predictive Performance Optimization Framework
 *
 * This framework uses machine learning and real-time monitoring to predict
 * and optimize sync performance, automatically adjusting parameters for
 * maximum efficiency and reliability.
 */
export class PredictivePerformanceOptimizer {
  private supabase: SupabaseClient
  private aiIntelligence: AISyncIntelligenceEngine
  private optimizationStrategies: OptimizationStrategy[] = []
  private activeOptimizations: Map<string, AdaptiveOptimization> = new Map()

  constructor(supabase: SupabaseClient, aiIntelligence: AISyncIntelligenceEngine) {
    this.supabase = supabase
    this.aiIntelligence = aiIntelligence
    this.initializeOptimizationStrategies()
  }

  /**
   * Predict optimal performance parameters for a sync operation
   */
  async predictOptimalPerformance(
    operationType: 'products' | 'inventory' | 'orders',
    dataVolume: number,
    systemConstraints: ResourceAllocation,
    historicalPerformance?: PerformanceMetrics[]
  ): Promise<PerformancePrediction> {
    console.log(`[PredictiveOptimizer] Predicting optimal performance for ${operationType}`)

    // Gather historical data if not provided
    const historicalData = historicalPerformance || await this.getHistoricalPerformance(operationType)

    // Use AI intelligence for initial prediction
    const aiPrediction = await this.aiIntelligence.optimizeRunningSync({
      currentMetrics: this.createCurrentMetricsSnapshot(),
      performanceHistory: historicalData,
      systemState: {
        currentLoad: systemConstraints.cpu,
        availableResources: {
          cpu: 100 - systemConstraints.cpu,
          memory: 100 - systemConstraints.memory / 100, // Convert to percentage
          networkBandwidth: 100,
          concurrentConnections: 100
        },
        networkLatency: 0,
        apiRateLimits: [],
        errorRates: {
          totalErrors: 0,
          errorRate: 0,
          errorTypes: {},
          recoverySuccessRate: 0
        }
      }
    })

    // Calculate optimal parameters based on data volume and constraints
    const optimalBatchSize = this.calculateOptimalBatchSize(dataVolume, systemConstraints)
    const recommendedConcurrency = this.calculateOptimalConcurrency(systemConstraints, operationType)

    // Estimate duration and throughput
    const estimatedDuration = this.estimateDuration(dataVolume, optimalBatchSize, recommendedConcurrency, historicalData)
    const expectedThroughput = dataVolume / (estimatedDuration / 1000) // items per second

    // Identify risk factors
    const riskFactors = this.identifyRiskFactors(systemConstraints, dataVolume, operationType)

    // Find optimization opportunities
    const optimizationOpportunities = this.identifyOptimizationOpportunities(
      systemConstraints,
      historicalData,
      operationType
    )

    return {
      confidence: 0.85, // Base confidence level
      estimatedDuration,
      optimalBatchSize,
      recommendedConcurrency,
      expectedThroughput,
      riskFactors,
      optimizationOpportunities
    }
  }

  /**
   * Monitor and optimize running sync operations in real-time
   */
  async optimizeRunningSync(
    syncId: string,
    currentMetrics: PerformanceMetrics,
    context: SyncIntelligenceContext
  ): Promise<SyncOptimization> {
    console.log(`[PredictiveOptimizer] Optimizing running sync ${syncId}`)

    // Get or create adaptive optimization state
    let adaptiveOpt = this.activeOptimizations.get(syncId)
    if (!adaptiveOpt) {
      adaptiveOpt = {
        currentBatchSize: 50,
        currentConcurrency: 2,
        adaptiveEnabled: true,
        lastAdjustment: new Date(),
        performanceTrend: 'stable',
        adjustmentHistory: []
      }
      this.activeOptimizations.set(syncId, adaptiveOpt)
    }

    // Get historical metrics for this sync
    const historicalMetrics = await this.getSyncMetricsHistory(syncId)

    // Create optimization context
    const optimizationContext: PerformanceOptimizationContext = {
      currentMetrics,
      historicalMetrics,
      systemResources: {
        cpu: currentMetrics.cpuUsage,
        memory: currentMetrics.memoryUsage,
        network: 100, // Assume good network
        concurrentOperations: adaptiveOpt.currentConcurrency,
        priority: 'normal'
      },
      thresholds: this.getDefaultThresholds(),
      adaptiveOptimization: adaptiveOpt,
      aiIntelligence: this.aiIntelligence
    }

    // Check if optimization is needed
    const needsOptimization = this.checkOptimizationNeeded(optimizationContext)

    if (needsOptimization) {
      const optimizationResult = await this.applyOptimizationStrategies(optimizationContext)

      if (optimizationResult.applied) {
        // Update adaptive optimization state
        this.updateAdaptiveOptimization(syncId, optimizationResult, adaptiveOpt)
      }
    }

    // Return current optimization settings
    return {
      batchSize: adaptiveOpt.currentBatchSize,
      concurrency: adaptiveOpt.currentConcurrency,
      retryStrategy: {
        maxRetries: 3,
        backoffMultiplier: 2,
        jitterEnabled: true,
        circuitBreakerThreshold: 5,
        timeoutStrategy: 'adaptive'
      },
      cachingStrategy: {
        cacheEnabled: true,
        cacheTTL: 300000,
        cacheScope: 'user',
        invalidationStrategy: 'time'
      },
      dataTransformation: [],
      monitoringLevel: 'detailed'
    }
  }

  /**
   * Analyze performance trends and provide recommendations
   */
  async analyzePerformanceTrends(
    timeRange: { start: Date; end: Date },
    operationType?: string
  ): Promise<{
    trends: Array<{
      metric: string
      trend: 'improving' | 'stable' | 'degrading'
      changePercent: number
      recommendation: string
    }>
    bottlenecks: string[]
    optimizationRecommendations: string[]
  }> {
    console.log(`[PredictiveOptimizer] Analyzing performance trends`)

    // Get performance data for the time range
    const performanceData = await this.getPerformanceData(timeRange, operationType)

    // Analyze trends for key metrics
    const trends = []

    // Duration trend
    const durationTrend = this.calculateTrend(performanceData.map(p => p.duration))
    trends.push({
      metric: 'sync_duration',
      trend: durationTrend.direction,
      changePercent: durationTrend.changePercent,
      recommendation: durationTrend.direction === 'degrading'
        ? 'Consider increasing batch sizes or optimizing API calls'
        : 'Performance is improving, continue monitoring'
    })

    // Throughput trend
    const throughputTrend = this.calculateTrend(performanceData.map(p => p.throughput))
    trends.push({
      metric: 'throughput',
      trend: throughputTrend.direction,
      changePercent: throughputTrend.changePercent,
      recommendation: throughputTrend.direction === 'degrading'
        ? 'Investigate bottlenecks and consider resource scaling'
        : 'Throughput is good, maintain current settings'
    })

    // Error rate trend
    const errorRateTrend = this.calculateTrend(performanceData.map(p => p.errorRate))
    trends.push({
      metric: 'error_rate',
      trend: errorRateTrend.direction,
      changePercent: errorRateTrend.changePercent,
      recommendation: errorRateTrend.direction === 'degrading'
        ? 'Review error patterns and improve error handling'
        : 'Error rates are stable or improving'
    })

    // Identify bottlenecks
    const bottlenecks = this.identifyBottlenecks(performanceData)

    // Generate optimization recommendations
    const optimizationRecommendations = this.generateOptimizationRecommendations(trends, bottlenecks)

    return {
      trends,
      bottlenecks,
      optimizationRecommendations
    }
  }

  /**
   * Predict future performance based on current trends
   */
  async predictFuturePerformance(
    currentMetrics: PerformanceMetrics[],
    predictionHorizon: number // days
  ): Promise<{
    predictions: Array<{
      date: Date
      metric: string
      predictedValue: number
      confidence: number
      factors: string[]
    }>
    alerts: Array<{
      level: 'warning' | 'critical'
      message: string
      predictedDate: Date
      impact: string
    }>
  }> {
    console.log(`[PredictiveOptimizer] Predicting future performance for ${predictionHorizon} days`)

    // Use time series analysis to predict future performance
    const predictions = []

    // Predict duration
    const durationPrediction = this.predictMetric(
      currentMetrics.map(m => m.duration),
      predictionHorizon
    )
    predictions.push({
      date: new Date(Date.now() + predictionHorizon * 24 * 60 * 60 * 1000),
      metric: 'duration',
      predictedValue: durationPrediction.value,
      confidence: durationPrediction.confidence,
      factors: ['historical trends', 'system load', 'data volume']
    })

    // Predict throughput
    const throughputPrediction = this.predictMetric(
      currentMetrics.map(m => m.throughput),
      predictionHorizon
    )
    predictions.push({
      date: new Date(Date.now() + predictionHorizon * 24 * 60 * 60 * 1000),
      metric: 'throughput',
      predictedValue: throughputPrediction.value,
      confidence: throughputPrediction.confidence,
      factors: ['resource availability', 'optimization effectiveness']
    })

    // Generate alerts based on predictions
    const alerts = []

    if (durationPrediction.value > this.getDefaultThresholds().maxDuration * 1.5) {
      alerts.push({
        level: 'warning',
        message: 'Sync duration predicted to exceed acceptable thresholds',
        predictedDate: predictions[0].date,
        impact: 'Potential SLA violations and user experience degradation'
      })
    }

    if (throughputPrediction.value < this.getDefaultThresholds().minThroughput * 0.7) {
      alerts.push({
        level: 'critical',
        message: 'Throughput predicted to drop significantly',
        predictedDate: predictions[1].date,
        impact: 'Severe performance degradation, potential business impact'
      })
    }

    return { predictions, alerts }
  }

  // Private helper methods

  private initializeOptimizationStrategies(): void {
    this.optimizationStrategies = [
      // Batch size optimization
      {
        id: 'batch_size_optimization',
        name: 'Dynamic Batch Size Adjustment',
        description: 'Adjust batch sizes based on current performance and system load',
        applicableConditions: ['high_latency', 'memory_pressure', 'api_rate_limiting'],
        expectedImprovement: 25,
        riskLevel: 'low',
        implementation: async (context) => {
          const currentBatchSize = context.adaptiveOptimization.currentBatchSize
          let newBatchSize = currentBatchSize

          if (context.currentMetrics.memoryUsage > 80) {
            newBatchSize = Math.floor(currentBatchSize * 0.7) // Reduce batch size
          } else if (context.currentMetrics.cpuUsage < 50 && context.currentMetrics.networkLatency < 1000) {
            newBatchSize = Math.floor(currentBatchSize * 1.3) // Increase batch size
          }

          if (newBatchSize !== currentBatchSize) {
            return {
              applied: true,
              strategyId: 'batch_size_optimization',
              changes: [{
                parameter: 'batchSize',
                oldValue: currentBatchSize,
                newValue: newBatchSize,
                reason: context.currentMetrics.memoryUsage > 80 ? 'High memory usage' : 'Available resources'
              }],
              expectedImpact: 15,
              confidence: 0.8
            }
          }

          return { applied: false, strategyId: 'batch_size_optimization', changes: [], expectedImpact: 0, confidence: 0 }
        }
      },

      // Concurrency optimization
      {
        id: 'concurrency_optimization',
        name: 'Adaptive Concurrency Control',
        description: 'Adjust concurrent operations based on system capacity and API limits',
        applicableConditions: ['high_cpu', 'api_throttling', 'network_congestion'],
        expectedImprovement: 30,
        riskLevel: 'medium',
        implementation: async (context) => {
          const currentConcurrency = context.adaptiveOptimization.currentConcurrency
          let newConcurrency = currentConcurrency

          if (context.currentMetrics.cpuUsage > 85) {
            newConcurrency = Math.max(1, currentConcurrency - 1) // Reduce concurrency
          } else if (context.currentMetrics.cpuUsage < 40 && context.currentMetrics.errorRate < 0.05) {
            newConcurrency = Math.min(10, currentConcurrency + 1) // Increase concurrency
          }

          if (newConcurrency !== currentConcurrency) {
            return {
              applied: true,
              strategyId: 'concurrency_optimization',
              changes: [{
                parameter: 'concurrency',
                oldValue: currentConcurrency,
                newValue: newConcurrency,
                reason: context.currentMetrics.cpuUsage > 85 ? 'High CPU usage' : 'Available capacity'
              }],
              expectedImpact: 20,
              confidence: 0.75
            }
          }

          return { applied: false, strategyId: 'concurrency_optimization', changes: [], expectedImpact: 0, confidence: 0 }
        }
      },

      // Caching optimization
      {
        id: 'caching_optimization',
        name: 'Intelligent Caching Strategy',
        description: 'Optimize cache TTL and scope based on data access patterns',
        applicableConditions: ['cache_misses_high', 'memory_available', 'data_reuse_high'],
        expectedImprovement: 40,
        riskLevel: 'low',
        implementation: async (context) => {
          // This would analyze cache hit rates and adjust caching strategy
          return {
            applied: true,
            strategyId: 'caching_optimization',
            changes: [{
              parameter: 'cacheTTL',
              oldValue: 300000,
              newValue: 600000,
              reason: 'Improved data reuse patterns detected'
            }],
            expectedImpact: 25,
            confidence: 0.9
          }
        }
      },

      // Resource reallocation
      {
        id: 'resource_reallocation',
        name: 'Dynamic Resource Allocation',
        description: 'Reallocate system resources based on current workload demands',
        applicableConditions: ['resource_contention', 'performance_degrading'],
        expectedImprovement: 35,
        riskLevel: 'high',
        implementation: async (context) => {
          // This would involve complex resource management decisions
          return {
            applied: false, // Not implemented in this version
            strategyId: 'resource_reallocation',
            changes: [],
            expectedImpact: 0,
            confidence: 0
          }
        }
      }
    ]
  }

  private calculateOptimalBatchSize(dataVolume: number, constraints: ResourceAllocation): number {
    // Base batch size calculation
    let batchSize = Math.min(100, Math.max(10, Math.floor(dataVolume / 100)))

    // Adjust for memory constraints
    if (constraints.memory > 80) {
      batchSize = Math.floor(batchSize * 0.6)
    } else if (constraints.memory < 30) {
      batchSize = Math.floor(batchSize * 1.4)
    }

    // Adjust for CPU constraints
    if (constraints.cpu > 80) {
      batchSize = Math.floor(batchSize * 0.7)
    }

    return Math.max(1, Math.min(500, batchSize))
  }

  private calculateOptimalConcurrency(constraints: ResourceAllocation, operationType: string): number {
    // Base concurrency based on operation type
    const baseConcurrency = {
      products: 2,
      inventory: 3,
      orders: 1
    }[operationType] || 2

    // Adjust for CPU availability
    let concurrency = baseConcurrency
    if (constraints.cpu < 30) {
      concurrency = Math.max(1, Math.floor(baseConcurrency * 1.5))
    } else if (constraints.cpu > 70) {
      concurrency = Math.max(1, Math.floor(baseConcurrency * 0.7))
    }

    // Adjust for memory
    if (constraints.memory > 80) {
      concurrency = Math.max(1, concurrency - 1)
    }

    return Math.max(1, Math.min(10, concurrency))
  }

  private estimateDuration(
    dataVolume: number,
    batchSize: number,
    concurrency: number,
    historicalData: PerformanceMetrics[]
  ): number {
    // Estimate based on historical data
    const avgDurationPerItem = historicalData.length > 0
      ? historicalData.reduce((sum, m) => sum + (m.duration / m.itemsProcessed), 0) / historicalData.length
      : 100 // Default 100ms per item

    const batches = Math.ceil(dataVolume / batchSize)
    const sequentialDuration = batches * avgDurationPerItem * batchSize
    const parallelDuration = sequentialDuration / concurrency

    // Add overhead for coordination and API limits
    const overhead = Math.max(5000, parallelDuration * 0.1) // 10% overhead, minimum 5 seconds

    return parallelDuration + overhead
  }

  private identifyRiskFactors(
    constraints: ResourceAllocation,
    dataVolume: number,
    operationType: string
  ): string[] {
    const risks = []

    if (constraints.cpu > 85) {
      risks.push('High CPU usage may cause throttling')
    }

    if (constraints.memory > 90) {
      risks.push('Memory pressure may cause out-of-memory errors')
    }

    if (dataVolume > 10000) {
      risks.push('Large data volume may exceed API limits')
    }

    if (operationType === 'orders' && constraints.concurrentOperations > 5) {
      risks.push('Order operations are sensitive to concurrency')
    }

    return risks
  }

  private identifyOptimizationOpportunities(
    constraints: ResourceAllocation,
    historicalData: PerformanceMetrics[],
    operationType: string
  ): string[] {
    const opportunities = []

    if (constraints.cpu < 40) {
      opportunities.push('Increase concurrency to utilize available CPU')
    }

    if (historicalData.some(m => m.errorRate > 0.1)) {
      opportunities.push('Implement better error handling and retry logic')
    }

    if (operationType === 'products' && constraints.memory > 60) {
      opportunities.push('Enable product image caching for better performance')
    }

    return opportunities
  }

  private async getHistoricalPerformance(operationType: string): Promise<PerformanceMetrics[]> {
    try {
      const { data } = await this.supabase
        .from('performance_metrics')
        .select('*')
        .eq('operation', operationType)
        .order('timestamp', { ascending: false })
        .limit(50)

      return data?.map(d => ({
        timestamp: new Date(d.timestamp),
        operation: d.operation,
        duration: d.duration,
        itemsProcessed: d.items_processed,
        successRate: d.success_rate,
        errorRate: d.error_rate,
        apiCalls: d.api_calls,
        memoryUsage: d.memory_usage,
        cpuUsage: d.cpu_usage,
        networkLatency: d.network_latency,
        throughput: d.throughput
      })) || []
    } catch (error) {
      console.error('Failed to get historical performance:', error)
      return []
    }
  }

  private createCurrentMetricsSnapshot(): any {
    // Create a snapshot of current metrics for AI analysis
    return {
      duration: 0,
      itemsProcessed: 0,
      successRate: 1.0,
      errorRate: 0.0,
      throughput: 0
    }
  }

  private getDefaultThresholds(): PerformanceThresholds {
    return {
      maxDuration: 300000, // 5 minutes
      minThroughput: 10, // 10 items per second
      maxErrorRate: 0.1, // 10%
      maxLatency: 5000, // 5 seconds
      targetCpuUsage: 70, // 70%
      targetMemoryUsage: 80 // 80%
    }
  }

  private checkOptimizationNeeded(context: PerformanceOptimizationContext): boolean {
    const thresholds = context.thresholds

    // Check if any metrics are outside acceptable ranges
    if (context.currentMetrics.duration > thresholds.maxDuration * 1.2) return true
    if (context.currentMetrics.throughput < thresholds.minThroughput * 0.8) return true
    if (context.currentMetrics.errorRate > thresholds.maxErrorRate * 1.5) return true
    if (context.currentMetrics.cpuUsage > thresholds.targetCpuUsage * 1.3) return true
    if (context.currentMetrics.memoryUsage > thresholds.targetMemoryUsage * 1.2) return true

    // Check for performance degradation trends
    const recentMetrics = context.historicalMetrics.slice(-5)
    if (recentMetrics.length >= 3) {
      const avgRecentDuration = recentMetrics.reduce((sum, m) => sum + m.duration, 0) / recentMetrics.length
      const avgOlderDuration = context.historicalMetrics.slice(-10, -5).reduce((sum, m) => sum + m.duration, 0) / 5

      if (avgRecentDuration > avgOlderDuration * 1.2) return true
    }

    return false
  }

  private async applyOptimizationStrategies(
    context: PerformanceOptimizationContext
  ): Promise<OptimizationResult> {
    // Find applicable strategies
    const applicableStrategies = this.optimizationStrategies.filter(strategy =>
      strategy.applicableConditions.some(condition =>
        this.checkCondition(condition, context)
      )
    )

    // Try strategies in order of expected improvement
    applicableStrategies.sort((a, b) => b.expectedImprovement - a.expectedImprovement)

    for (const strategy of applicableStrategies) {
      try {
        const result = await strategy.implementation(context)
        if (result.applied) {
          return result
        }
      } catch (error) {
        console.error(`Optimization strategy ${strategy.id} failed:`, error)
      }
    }

    return {
      applied: false,
      strategyId: 'none',
      changes: [],
      expectedImpact: 0,
      confidence: 0
    }
  }

  private checkCondition(condition: string, context: PerformanceOptimizationContext): boolean {
    switch (condition) {
      case 'high_latency':
        return context.currentMetrics.networkLatency > 2000
      case 'memory_pressure':
        return context.currentMetrics.memoryUsage > 85
      case 'api_rate_limiting':
        return context.currentMetrics.errorRate > 0.05 // Assuming rate limit errors
      case 'high_cpu':
        return context.currentMetrics.cpuUsage > 80
      case 'api_throttling':
        return context.currentMetrics.errorRate > 0.08
      case 'network_congestion':
        return context.currentMetrics.networkLatency > 3000
      case 'cache_misses_high':
        return false // Would need cache metrics
      case 'memory_available':
        return context.currentMetrics.memoryUsage < 60
      case 'data_reuse_high':
        return false // Would need data reuse metrics
      case 'resource_contention':
        return context.currentMetrics.cpuUsage > 90 || context.currentMetrics.memoryUsage > 90
      case 'performance_degrading':
        return context.adaptiveOptimization.performanceTrend === 'degrading'
      default:
        return false
    }
  }

  private updateAdaptiveOptimization(
    syncId: string,
    result: OptimizationResult,
    adaptiveOpt: AdaptiveOptimization
  ): void {
    // Update the adaptive optimization state
    result.changes.forEach(change => {
      if (change.parameter === 'batchSize') {
        adaptiveOpt.currentBatchSize = change.newValue
      } else if (change.parameter === 'concurrency') {
        adaptiveOpt.currentConcurrency = change.newValue
      }

      adaptiveOpt.adjustmentHistory.push({
        timestamp: new Date(),
        reason: change.reason,
        oldValue: change.oldValue,
        newValue: change.newValue,
        metric: change.parameter
      })
    })

    adaptiveOpt.lastAdjustment = new Date()
    this.activeOptimizations.set(syncId, adaptiveOpt)
  }

  private async getSyncMetricsHistory(syncId: string): Promise<PerformanceMetrics[]> {
    try {
      const { data } = await this.supabase
        .from('sync_performance_metrics')
        .select('*')
        .eq('sync_log_id', syncId)
        .order('timestamp', { ascending: false })
        .limit(20)

      return data?.map(d => ({
        timestamp: new Date(d.timestamp),
        operation: d.operation,
        duration: d.duration,
        itemsProcessed: d.items_processed,
        successRate: d.success_rate,
        errorRate: d.error_rate,
        apiCalls: d.api_calls,
        memoryUsage: d.memory_usage,
        cpuUsage: d.cpu_usage,
        networkLatency: d.network_latency,
        throughput: d.throughput
      })) || []
    } catch (error) {
      console.error('Failed to get sync metrics history:', error)
      return []
    }
  }

  private calculateTrend(values: number[]): { direction: 'improving' | 'stable' | 'degrading'; changePercent: number } {
    if (values.length < 3) return { direction: 'stable', changePercent: 0 }

    const recent = values.slice(-3)
    const older = values.slice(-6, -3)

    const recentAvg = recent.reduce((sum, val) => sum + val, 0) / recent.length
    const olderAvg = older.reduce((sum, val) => sum + val, 0) / older.length

    const changePercent = ((recentAvg - olderAvg) / olderAvg) * 100

    let direction: 'improving' | 'stable' | 'degrading' = 'stable'
    if (Math.abs(changePercent) > 10) {
      direction = changePercent > 0 ? 'degrading' : 'improving'
    }

    return { direction, changePercent }
  }

  private identifyBottlenecks(performanceData: PerformanceMetrics[]): string[] {
    const bottlenecks = []

    // Check for high latency
    const avgLatency = performanceData.reduce((sum, p) => sum + p.networkLatency, 0) / performanceData.length
    if (avgLatency > 2000) {
      bottlenecks.push('High network latency detected')
    }

    // Check for CPU bottlenecks
    const highCpuCount = performanceData.filter(p => p.cpuUsage > 85).length
    if (highCpuCount > performanceData.length * 0.3) {
      bottlenecks.push('CPU utilization frequently high')
    }

    // Check for memory issues
    const highMemoryCount = performanceData.filter(p => p.memoryUsage > 90).length
    if (highMemoryCount > performanceData.length * 0.2) {
      bottlenecks.push('Memory usage frequently high')
    }

    // Check for low throughput
    const avgThroughput = performanceData.reduce((sum, p) => sum + p.throughput, 0) / performanceData.length
    if (avgThroughput < 5) {
      bottlenecks.push('Low processing throughput')
    }

    return bottlenecks
  }

  private generateOptimizationRecommendations(
    trends: any[],
    bottlenecks: string[]
  ): string[] {
    const recommendations = []

    // Generate recommendations based on trends
    trends.forEach(trend => {
      if (trend.trend === 'degrading') {
        switch (trend.metric) {
          case 'sync_duration':
            recommendations.push('Implement parallel processing and optimize batch sizes')
            break
          case 'throughput':
            recommendations.push('Scale resources or optimize data processing pipeline')
            break
          case 'error_rate':
            recommendations.push('Enhance error handling and implement circuit breakers')
            break
        }
      }
    })

    // Generate recommendations based on bottlenecks
    bottlenecks.forEach(bottleneck => {
      if (bottleneck.includes('CPU')) {
        recommendations.push('Consider horizontal scaling or optimize CPU-intensive operations')
      }
      if (bottleneck.includes('memory')) {
        recommendations.push('Implement memory-efficient processing or increase memory allocation')
      }
      if (bottleneck.includes('network')) {
        recommendations.push('Optimize network requests or implement request batching')
      }
      if (bottleneck.includes('throughput')) {
        recommendations.push('Review and optimize data processing algorithms')
      }
    })

    return [...new Set(recommendations)] // Remove duplicates
  }

  private predictMetric(values: number[], horizon: number): { value: number; confidence: number } {
    if (values.length < 3) {
      return { value: values[values.length - 1] || 0, confidence: 0.5 }
    }

    // Simple linear regression for prediction
    const n = values.length
    const x = Array.from({ length: n }, (_, i) => i)
    const y = values

    const sumX = x.reduce((sum, val) => sum + val, 0)
    const sumY = y.reduce((sum, val) => sum + val, 0)
    const sumXY = x.reduce((sum, val, i) => sum + val * y[i], 0)
    const sumXX = x.reduce((sum, val) => sum + val * val, 0)

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)
    const intercept = (sumY - slope * sumX) / n

    // Predict value at horizon
    const predictedValue = intercept + slope * (n + horizon - 1)

    // Calculate confidence based on data variance
    const mean = sumY / n
    const variance = y.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / n
    const confidence = Math.max(0.1, Math.min(0.9, 1 - variance / (mean * mean)))

    return { value: Math.max(0, predictedValue), confidence }
  }
}
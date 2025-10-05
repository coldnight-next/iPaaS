import React, { useState, useEffect } from 'react'
import {
  Card,
  Progress,
  Space,
  Typography,
  Alert,
  Button,
  Tooltip,
  Statistic,
  Row,
  Col,
  Badge,
  Tag,
  Divider
} from 'antd'
import {
  WarningOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ReloadOutlined,
  SettingOutlined,
  ThunderboltOutlined
} from '@ant-design/icons'
import { supabase } from '../lib/supabase'

const { Title, Text, Paragraph } = Typography

interface RateLimitStatus {
  requestsThisMinute: number
  requestsThisHour: number
  isThrottled: boolean
  throttleUntil?: string
  consecutiveErrors: number
  config: {
    maxRequestsPerMinute: number
    maxRequestsPerHour: number
    burstLimit: number
    backoffMultiplier: number
    maxBackoffSeconds: number
  }
}

interface RateLimitMonitorProps {
  userId?: string
  showConfig?: boolean
  compact?: boolean
  refreshInterval?: number // in milliseconds
}

const RateLimitMonitor: React.FC<RateLimitMonitorProps> = ({
  userId,
  showConfig = false,
  compact = false,
  refreshInterval = 30000 // 30 seconds
}) => {
  const [netSuiteStatus, setNetSuiteStatus] = useState<RateLimitStatus | null>(null)
  const [shopifyStatus, setShopifyStatus] = useState<RateLimitStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchRateLimitStatus = async () => {
    try {
      setLoading(true)
      setError(null)

      // Fetch NetSuite status
      const { data: nsData, error: nsError } = await supabase
        .rpc('get_rate_limit_status', {
          p_user_id: userId || (await supabase.auth.getUser()).data.user?.id,
          p_platform: 'netsuite'
        })

      if (nsError) throw nsError
      setNetSuiteStatus(nsData)

      // Fetch Shopify status
      const { data: sfData, error: sfError } = await supabase
        .rpc('get_rate_limit_status', {
          p_user_id: userId || (await supabase.auth.getUser()).data.user?.id,
          p_platform: 'shopify'
        })

      if (sfError) throw sfError
      setShopifyStatus(sfData)

    } catch (err: any) {
      console.error('Failed to fetch rate limit status:', err)
      setError(err.message || 'Failed to load rate limit status')
    } finally {
      setLoading(false)
    }
  }

  const resetRateLimit = async (platform: 'netsuite' | 'shopify') => {
    try {
      const { error } = await supabase
        .rpc('reset_rate_limit_state', {
          p_user_id: userId || (await supabase.auth.getUser()).data.user?.id,
          p_platform: platform
        })

      if (error) throw error

      // Refresh status
      await fetchRateLimitStatus()
    } catch (err: any) {
      console.error('Failed to reset rate limit:', err)
      setError(err.message || 'Failed to reset rate limit')
    }
  }

  useEffect(() => {
    fetchRateLimitStatus()

    // Set up periodic refresh
    const interval = setInterval(fetchRateLimitStatus, refreshInterval)

    return () => clearInterval(interval)
  }, [userId, refreshInterval])

  const renderPlatformStatus = (platform: string, status: RateLimitStatus | null) => {
    if (!status) return null

    const minutePercent = (status.requestsThisMinute / status.config.maxRequestsPerMinute) * 100
    const hourPercent = (status.requestsThisHour / status.config.maxRequestsPerHour) * 100

    const isNearLimit = minutePercent > 80 || hourPercent > 80
    const isThrottled = status.isThrottled
    const hasErrors = status.consecutiveErrors > 0

    let statusColor = 'success'
    let statusIcon = <CheckCircleOutlined />
    let statusText = 'Normal'

    if (isThrottled) {
      statusColor = 'error'
      statusIcon = <WarningOutlined />
      statusText = 'Throttled'
    } else if (isNearLimit) {
      statusColor = 'warning'
      statusIcon = <ClockCircleOutlined />
      statusText = 'Near Limit'
    } else if (hasErrors) {
      statusColor = 'warning'
      statusIcon = <WarningOutlined />
      statusText = 'Errors'
    }

    if (compact) {
      return (
        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          <Space>
            <Badge status={statusColor as any} />
            <Text strong style={{ textTransform: 'capitalize' }}>{platform}</Text>
            <Tag color={statusColor}>{statusText}</Tag>
          </Space>

          <Space size="large">
            <Text type="secondary">
              {status.requestsThisMinute}/{status.config.maxRequestsPerMinute} req/min
            </Text>
            <Text type="secondary">
              {status.requestsThisHour}/{status.config.maxRequestsPerHour} req/hr
            </Text>
          </Space>

          {isThrottled && status.throttleUntil && (
            <Alert
              message={`Throttled until ${new Date(status.throttleUntil).toLocaleTimeString()}`}
              type="error"
              showIcon
              style={{ fontSize: '12px', padding: '4px 8px' }}
            />
          )}
        </Space>
      )
    }

    return (
      <Card
        title={
          <Space>
            <ThunderboltOutlined />
            <span style={{ textTransform: 'capitalize' }}>{platform} API Status</span>
            <Badge status={statusColor as any} text={statusText} />
          </Space>
        }
        size="small"
        extra={
          <Space>
            <Tooltip title="Reset rate limit counters">
              <Button
                size="small"
                icon={<ReloadOutlined />}
                onClick={() => resetRateLimit(platform as 'netsuite' | 'shopify')}
                disabled={loading}
              >
                Reset
              </Button>
            </Tooltip>
            <Button
              size="small"
              icon={<ReloadOutlined />}
              onClick={fetchRateLimitStatus}
              loading={loading}
            >
              Refresh
            </Button>
          </Space>
        }
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          {/* Throttle Alert */}
          {isThrottled && status.throttleUntil && (
            <Alert
              message="Rate Limit Exceeded"
              description={`API calls are throttled until ${new Date(status.throttleUntil).toLocaleString()}. Please wait before making more requests.`}
              type="error"
              showIcon
              action={
                <Button
                  size="small"
                  onClick={() => resetRateLimit(platform as 'netsuite' | 'shopify')}
                >
                  Reset Counter
                </Button>
              }
            />
          )}

          {/* Error Alert */}
          {hasErrors && (
            <Alert
              message={`Consecutive Errors: ${status.consecutiveErrors}`}
              description="Multiple API calls have failed. This may indicate rate limiting or connectivity issues."
              type="warning"
              showIcon
            />
          )}

          {/* Rate Limit Progress */}
          <Row gutter={16}>
            <Col span={12}>
              <Statistic
                title="Requests This Minute"
                value={status.requestsThisMinute}
                suffix={`/ ${status.config.maxRequestsPerMinute}`}
                valueStyle={{
                  color: minutePercent > 90 ? '#cf1322' : minutePercent > 70 ? '#faad14' : '#3f8600'
                }}
              />
              <Progress
                percent={Math.min(minutePercent, 100)}
                status={minutePercent > 90 ? 'exception' : minutePercent > 70 ? 'warning' : 'success'}
                size="small"
                showInfo={false}
              />
            </Col>
            <Col span={12}>
              <Statistic
                title="Requests This Hour"
                value={status.requestsThisHour}
                suffix={`/ ${status.config.maxRequestsPerHour}`}
                valueStyle={{
                  color: hourPercent > 90 ? '#cf1322' : hourPercent > 70 ? '#faad14' : '#3f8600'
                }}
              />
              <Progress
                percent={Math.min(hourPercent, 100)}
                status={hourPercent > 90 ? 'exception' : hourPercent > 70 ? 'warning' : 'success'}
                size="small"
                showInfo={false}
              />
            </Col>
          </Row>

          {/* Configuration */}
          {showConfig && (
            <>
              <Divider style={{ margin: '12px 0' }} />
              <Title level={5}>Rate Limit Configuration</Title>
              <Row gutter={16}>
                <Col span={8}>
                  <Statistic
                    title="Burst Limit"
                    value={status.config.burstLimit}
                    prefix={<SettingOutlined />}
                  />
                </Col>
                <Col span={8}>
                  <Statistic
                    title="Backoff Multiplier"
                    value={status.config.backoffMultiplier}
                    precision={1}
                  />
                </Col>
                <Col span={8}>
                  <Statistic
                    title="Max Backoff"
                    value={status.config.maxBackoffSeconds}
                    suffix="s"
                  />
                </Col>
              </Row>
            </>
          )}
        </Space>
      </Card>
    )
  }

  if (error) {
    return (
      <Alert
        message="Rate Limit Monitor Error"
        description={error}
        type="error"
        showIcon
        action={
          <Button size="small" onClick={fetchRateLimitStatus}>
            Retry
          </Button>
        }
      />
    )
  }

  if (compact) {
    return (
      <Card size="small" loading={loading}>
        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          {renderPlatformStatus('NetSuite', netSuiteStatus)}
          <Divider style={{ margin: '8px 0' }} />
          {renderPlatformStatus('Shopify', shopifyStatus)}
        </Space>
      </Card>
    )
  }

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      {renderPlatformStatus('NetSuite', netSuiteStatus)}
      {renderPlatformStatus('Shopify', shopifyStatus)}
    </Space>
  )
}

export default RateLimitMonitor
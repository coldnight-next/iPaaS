import { useState, useEffect, useCallback } from 'react'
import {
  Card, Row, Col, Statistic, Table, Progress, Tag, Space, Button, Badge, Alert,
  Typography, Timeline, Tabs, Empty, Spin, message, Tooltip, Select, DatePicker
} from 'antd'
import {
  SyncOutlined, CheckCircleOutlined, CloseCircleOutlined, WarningOutlined,
  ClockCircleOutlined, RocketOutlined, ThunderboltOutlined, ApiOutlined,
  LineChartOutlined, BellOutlined, ReloadOutlined, FilterOutlined
} from '@ant-design/icons'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

const { Title, Text, Paragraph } = Typography
const { RangePicker } = DatePicker

interface SyncQueueItem {
  id: string
  sync_type: string
  direction: string
  status: string
  priority: number
  estimated_items: number
  processed_items: number
  failed_items: number
  progress_percentage: number
  current_operation: string
  estimated_completion: string
  started_at: string
  queued_at: string
  error_message: string
}

interface SystemAlert {
  id: string
  alert_type: string
  severity: string
  title: string
  message: string
  source: string
  is_acknowledged: boolean
  is_resolved: boolean
  created_at: string
}

interface SyncPerformanceStats {
  total_syncs: number
  successful_syncs: number
  failed_syncs: number
  total_items: number
  successful_items: number
  failed_items: number
  avg_duration_seconds: number
  avg_items_per_second: number
  error_rate_percentage: number
}

interface ActiveSyncSession {
  id: string
  sync_type: string
  direction: string
  status: string
  total_items: number
  processed_items: number
  current_item_sku: string
  items_per_second: number
  elapsed_seconds: number
  estimated_remaining_seconds: number
  started_at: string
}

interface MonitoringDashboardProps {
  session: Session
  embedded?: boolean
}

export default function MonitoringDashboard({ session, embedded = false }: MonitoringDashboardProps) {
  const [syncQueue, setSyncQueue] = useState<SyncQueueItem[]>([])
  const [alerts, setAlerts] = useState<SystemAlert[]>([])
  const [performanceStats, setPerformanceStats] = useState<SyncPerformanceStats | null>(null)
  const [activeSessions, setActiveSessions] = useState<ActiveSyncSession[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshInterval, setRefreshInterval] = useState(5000) // 5 seconds
  const [autoRefresh, setAutoRefresh] = useState(true)

  // Load sync queue
  const loadSyncQueue = useCallback(async () => {
    if (!session) return
    try {
      const { data, error } = await supabase
        .from('sync_queue')
        .select('*')
        .eq('user_id', session.user.id)
        .in('status', ['queued', 'processing', 'paused'])
        .order('priority', { ascending: false })
        .order('queued_at', { ascending: true })

      if (error) throw error
      setSyncQueue(data || [])
    } catch (error) {
      console.error('Error loading sync queue:', error)
    }
  }, [session])

  // Load system alerts
  const loadAlerts = useCallback(async () => {
    if (!session) return
    try {
      const { data, error } = await supabase
        .from('system_alerts')
        .select('*')
        .eq('user_id', session.user.id)
        .eq('is_resolved', false)
        .order('created_at', { ascending: false })
        .limit(10)

      if (error) throw error
      setAlerts(data || [])
    } catch (error) {
      console.error('Error loading alerts:', error)
    }
  }, [session])

  // Load performance statistics
  const loadPerformanceStats = useCallback(async () => {
    if (!session) return
    try {
      // Get stats from the last 24 hours
      const { data, error } = await supabase
        .from('sync_performance_stats')
        .select('*')
        .eq('user_id', session.user.id)
        .eq('time_period', 'day')
        .order('period_start', { ascending: false })
        .limit(1)
        .single()

      if (error && error.code !== 'PGRST116') throw error // PGRST116 = no rows
      setPerformanceStats(data)
    } catch (error) {
      console.error('Error loading performance stats:', error)
    }
  }, [session])

  // Load active sync sessions
  const loadActiveSessions = useCallback(async () => {
    if (!session) return
    try {
      const { data, error } = await supabase
        .from('active_sync_sessions')
        .select('*')
        .eq('user_id', session.user.id)
        .not('status', 'in', '(completed,failed)')
        .order('started_at', { ascending: false })

      if (error) throw error
      setActiveSessions(data || [])
    } catch (error) {
      console.error('Error loading active sessions:', error)
    }
  }, [session])

  // Initial load
  useEffect(() => {
    const loadAll = async () => {
      setLoading(true)
      await Promise.all([
        loadSyncQueue(),
        loadAlerts(),
        loadPerformanceStats(),
        loadActiveSessions()
      ])
      setLoading(false)
    }
    loadAll()
  }, [loadSyncQueue, loadAlerts, loadPerformanceStats, loadActiveSessions])

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(() => {
      loadSyncQueue()
      loadActiveSessions()
      loadAlerts()
    }, refreshInterval)

    return () => clearInterval(interval)
  }, [autoRefresh, refreshInterval, loadSyncQueue, loadActiveSessions, loadAlerts])

  // Real-time subscriptions
  useEffect(() => {
    if (!session) return

    // Subscribe to sync queue changes
    const queueChannel = supabase
      .channel('sync_queue_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sync_queue',
          filter: `user_id=eq.${session.user.id}`
        },
        () => {
          loadSyncQueue()
        }
      )
      .subscribe()

    // Subscribe to alert changes
    const alertChannel = supabase
      .channel('alert_changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'system_alerts',
          filter: `user_id=eq.${session.user.id}`
        },
        (payload) => {
          loadAlerts()
          // Show notification for high/critical alerts
          const newAlert = payload.new as SystemAlert
          if (newAlert.severity === 'critical' || newAlert.severity === 'high') {
            message.warning({
              content: `${newAlert.title}: ${newAlert.message}`,
              duration: 10
            })
          }
        }
      )
      .subscribe()

    return () => {
      queueChannel.unsubscribe()
      alertChannel.unsubscribe()
    }
  }, [session, loadSyncQueue, loadAlerts])

  const handleAcknowledgeAlert = async (alertId: string) => {
    try {
      const { error } = await supabase
        .from('system_alerts')
        .update({
          is_acknowledged: true,
          acknowledged_at: new Date().toISOString(),
          acknowledged_by: session.user.id
        })
        .eq('id', alertId)

      if (error) throw error
      message.success('Alert acknowledged')
      loadAlerts()
    } catch (error) {
      console.error('Error acknowledging alert:', error)
      message.error('Failed to acknowledge alert')
    }
  }

  const handleResolveAlert = async (alertId: string) => {
    try {
      const { error } = await supabase
        .from('system_alerts')
        .update({
          is_resolved: true,
          resolved_at: new Date().toISOString()
        })
        .eq('id', alertId)

      if (error) throw error
      message.success('Alert resolved')
      loadAlerts()
    } catch (error) {
      console.error('Error resolving alert:', error)
      message.error('Failed to resolve alert')
    }
  }

  const queueColumns = [
    {
      title: 'Sync Type',
      dataIndex: 'sync_type',
      key: 'sync_type',
      render: (type: string) => <Tag color="blue">{type}</Tag>
    },
    {
      title: 'Direction',
      dataIndex: 'direction',
      key: 'direction',
      render: (direction: string) => (
        <Tag color="purple">
          {direction === 'bidirectional' ? '⇄' : direction === 'netsuite_to_shopify' ? '→' : '←'}
        </Tag>
      )
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const config = {
          queued: { color: 'default', icon: <ClockCircleOutlined /> },
          processing: { color: 'processing', icon: <SyncOutlined spin /> },
          paused: { color: 'warning', icon: <WarningOutlined /> },
          completed: { color: 'success', icon: <CheckCircleOutlined /> },
          failed: { color: 'error', icon: <CloseCircleOutlined /> }
        }[status] || { color: 'default', icon: null }

        return (
          <Tag icon={config.icon} color={config.color}>
            {status}
          </Tag>
        )
      }
    },
    {
      title: 'Progress',
      key: 'progress',
      render: (_: any, record: SyncQueueItem) => (
        <div style={{ width: 150 }}>
          <Progress
            percent={record.progress_percentage}
            size="small"
            status={record.status === 'failed' ? 'exception' : 'active'}
            format={() => `${record.processed_items}/${record.estimated_items}`}
          />
        </div>
      )
    },
    {
      title: 'Current Operation',
      dataIndex: 'current_operation',
      key: 'current_operation',
      ellipsis: true,
      render: (text: string) => <Text type="secondary" ellipsis>{text || '—'}</Text>
    },
    {
      title: 'Priority',
      dataIndex: 'priority',
      key: 'priority',
      render: (priority: number) => (
        <Badge
          count={priority}
          style={{
            backgroundColor: priority <= 3 ? '#f5222d' : priority <= 5 ? '#fa8c16' : '#52c41a'
          }}
        />
      )
    }
  ]

  const alertColumns = [
    {
      title: 'Severity',
      dataIndex: 'severity',
      key: 'severity',
      render: (severity: string) => {
        const config = {
          critical: { color: 'red', icon: <CloseCircleOutlined /> },
          high: { color: 'orange', icon: <WarningOutlined /> },
          medium: { color: 'gold', icon: <WarningOutlined /> },
          low: { color: 'blue', icon: <WarningOutlined /> },
          info: { color: 'default', icon: <WarningOutlined /> }
        }[severity] || { color: 'default', icon: null }

        return (
          <Tag icon={config.icon} color={config.color}>
            {severity.toUpperCase()}
          </Tag>
        )
      }
    },
    {
      title: 'Alert',
      key: 'alert',
      render: (_: any, record: SystemAlert) => (
        <Space direction="vertical" size="small">
          <Text strong>{record.title}</Text>
          <Text type="secondary">{record.message}</Text>
        </Space>
      )
    },
    {
      title: 'Source',
      dataIndex: 'source',
      key: 'source',
      render: (source: string) => source ? <Tag>{source}</Tag> : '—'
    },
    {
      title: 'Time',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date: string) => (
        <Tooltip title={new Date(date).toLocaleString()}>
          <Text type="secondary">{getTimeAgo(date)}</Text>
        </Tooltip>
      )
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: SystemAlert) => (
        <Space size="small">
          {!record.is_acknowledged && (
            <Button
              type="link"
              size="small"
              onClick={() => handleAcknowledgeAlert(record.id)}
            >
              Acknowledge
            </Button>
          )}
          <Button
            type="link"
            size="small"
            onClick={() => handleResolveAlert(record.id)}
          >
            Resolve
          </Button>
        </Space>
      )
    }
  ]

  const getTimeAgo = (dateString: string): string => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return `${diffDays}d ago`
  }

  const unacknowledgedAlertsCount = alerts.filter(a => !a.is_acknowledged).length
  const criticalAlertsCount = alerts.filter(a => a.severity === 'critical').length

  return (
    <div>
      {!embedded && (
        <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
          <Col>
            <Title level={2}>Real-Time Monitoring Dashboard</Title>
            <Paragraph>
              Monitor live sync operations, performance metrics, and system health.
            </Paragraph>
          </Col>
          <Col>
            <Space>
              <Select
                value={refreshInterval}
                onChange={setRefreshInterval}
                style={{ width: 120 }}
                disabled={!autoRefresh}
              >
                <Select.Option value={2000}>2 sec</Select.Option>
                <Select.Option value={5000}>5 sec</Select.Option>
                <Select.Option value={10000}>10 sec</Select.Option>
                <Select.Option value={30000}>30 sec</Select.Option>
              </Select>
              <Button
                icon={autoRefresh ? <SyncOutlined spin /> : <ReloadOutlined />}
                onClick={() => setAutoRefresh(!autoRefresh)}
                type={autoRefresh ? 'primary' : 'default'}
              >
                {autoRefresh ? 'Auto-Refresh ON' : 'Auto-Refresh OFF'}
              </Button>
              <Button
                icon={<ReloadOutlined />}
                onClick={() => {
                  setLoading(true)
                  Promise.all([
                    loadSyncQueue(),
                    loadAlerts(),
                    loadPerformanceStats(),
                    loadActiveSessions()
                  ]).finally(() => setLoading(false))
                }}
              >
                Refresh Now
              </Button>
            </Space>
          </Col>
        </Row>
      )}

      {/* Alert Banner */}
      {criticalAlertsCount > 0 && (
        <Alert
          message={`${criticalAlertsCount} Critical Alert${criticalAlertsCount > 1 ? 's' : ''}`}
          description="There are critical alerts that require immediate attention."
          type="error"
          showIcon
          closable
          style={{ marginBottom: 24 }}
          action={
            <Button size="small" danger onClick={() => document.getElementById('alerts-tab')?.click()}>
              View Alerts
            </Button>
          }
        />
      )}

      {/* Performance Statistics Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Active Syncs"
              value={activeSessions.length}
              prefix={<SyncOutlined spin={activeSessions.length > 0} />}
              valueStyle={{ color: activeSessions.length > 0 ? '#3f8600' : '#d9d9d9' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Queued Jobs"
              value={syncQueue.length}
              prefix={<ClockCircleOutlined />}
              valueStyle={{ color: syncQueue.length > 0 ? '#fa8c16' : '#d9d9d9' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Success Rate (24h)"
              value={performanceStats ? (100 - performanceStats.error_rate_percentage).toFixed(1) : 0}
              suffix="%"
              prefix={<CheckCircleOutlined />}
              valueStyle={{
                color: !performanceStats || performanceStats.error_rate_percentage < 5 ? '#3f8600' : '#cf1322'
              }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Active Alerts"
              value={unacknowledgedAlertsCount}
              prefix={<BellOutlined />}
              valueStyle={{ color: unacknowledgedAlertsCount > 0 ? '#cf1322' : '#d9d9d9' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Performance Details */}
      {performanceStats && (
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col xs={24} lg={12}>
            <Card title="Performance Metrics (Last 24 Hours)" size="small">
              <Row gutter={16}>
                <Col span={8}>
                  <Statistic
                    title="Total Syncs"
                    value={performanceStats.total_syncs}
                    prefix={<ThunderboltOutlined />}
                  />
                </Col>
                <Col span={8}>
                  <Statistic
                    title="Successful"
                    value={performanceStats.successful_syncs}
                    valueStyle={{ color: '#3f8600' }}
                  />
                </Col>
                <Col span={8}>
                  <Statistic
                    title="Failed"
                    value={performanceStats.failed_syncs}
                    valueStyle={{ color: '#cf1322' }}
                  />
                </Col>
              </Row>
            </Card>
          </Col>
          <Col xs={24} lg={12}>
            <Card title="Throughput Metrics" size="small">
              <Row gutter={16}>
                <Col span={8}>
                  <Statistic
                    title="Total Items"
                    value={performanceStats.total_items}
                  />
                </Col>
                <Col span={8}>
                  <Statistic
                    title="Avg Duration"
                    value={performanceStats.avg_duration_seconds.toFixed(1)}
                    suffix="sec"
                  />
                </Col>
                <Col span={8}>
                  <Statistic
                    title="Items/Second"
                    value={performanceStats.avg_items_per_second.toFixed(2)}
                    prefix={<RocketOutlined />}
                  />
                </Col>
              </Row>
            </Card>
          </Col>
        </Row>
      )}

      {/* Active Sessions */}
      {activeSessions.length > 0 && (
        <Card
          title={<><SyncOutlined spin /> Active Sync Sessions</>}
          style={{ marginBottom: 24 }}
        >
          {activeSessions.map(session => (
            <Card key={session.id} type="inner" style={{ marginBottom: 16 }}>
              <Row gutter={16} align="middle">
                <Col flex="auto">
                  <Space direction="vertical" size="small" style={{ width: '100%' }}>
                    <Space>
                      <Tag color="blue">{session.sync_type}</Tag>
                      <Tag>{session.direction}</Tag>
                      <Tag color="processing">{session.status}</Tag>
                    </Space>
                    <Text type="secondary">
                      Processing: {session.current_item_sku || 'Initializing...'}
                    </Text>
                    <Progress
                      percent={(session.processed_items / session.total_items) * 100}
                      format={() => `${session.processed_items}/${session.total_items}`}
                      status="active"
                    />
                    <Space split="|">
                      <Text type="secondary">
                        Speed: {session.items_per_second.toFixed(2)} items/sec
                      </Text>
                      <Text type="secondary">
                        Elapsed: {session.elapsed_seconds}s
                      </Text>
                      {session.estimated_remaining_seconds && (
                        <Text type="secondary">
                          Remaining: ~{session.estimated_remaining_seconds}s
                        </Text>
                      )}
                    </Space>
                  </Space>
                </Col>
              </Row>
            </Card>
          ))}
        </Card>
      )}

      {/* Tabs for Queue and Alerts */}
      <Card>
        <Tabs
          defaultActiveKey="queue"
          items={[
            {
              key: 'queue',
              label: <span><ClockCircleOutlined /> Sync Queue ({syncQueue.length})</span>,
              children: (
                <Table
                  dataSource={syncQueue}
                  columns={queueColumns}
                  rowKey="id"
                  loading={loading}
                  pagination={{ pageSize: 10 }}
                  locale={{
                    emptyText: (
                      <Empty
                        description="No sync operations in queue"
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                      />
                    )
                  }}
                />
              )
            },
            {
              key: 'alerts',
              label: (
                <span id="alerts-tab">
                  <BellOutlined />
                  {' '}Alerts ({unacknowledgedAlertsCount}/{alerts.length})
                  {criticalAlertsCount > 0 && (
                    <Badge count={criticalAlertsCount} style={{ marginLeft: 8 }} />
                  )}
                </span>
              ),
              children: (
                <Table
                  dataSource={alerts}
                  columns={alertColumns}
                  rowKey="id"
                  loading={loading}
                  pagination={{ pageSize: 10 }}
                  locale={{
                    emptyText: (
                      <Empty
                        description="No active alerts"
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                      />
                    )
                  }}
                />
              )
            }
          ]}
        />
      </Card>
    </div>
  )
}

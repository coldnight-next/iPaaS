import { useState, useEffect, useCallback } from 'react'
import { Card, Timeline, Typography, Tag, Space, Button, Empty, Spin, Tooltip } from 'antd'
import {
  SyncOutlined, CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined,
  ReloadOutlined, DatabaseOutlined, ShoppingOutlined, FileTextOutlined
} from '@ant-design/icons'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

const { Text, Title } = Typography

interface SyncLog {
  id: string
  sync_type: string
  direction: string
  status: string
  items_processed: number
  items_succeeded: number
  items_failed: number
  started_at: string
  completed_at: string
  error_details: any[]
}

interface RecentActivityFeedProps {
  session: Session
  limit?: number
  autoRefresh?: boolean
  refreshInterval?: number
}

export default function RecentActivityFeed({ 
  session, 
  limit = 50, 
  autoRefresh = true,
  refreshInterval = 10000 
}: RecentActivityFeedProps) {
  const [activities, setActivities] = useState<SyncLog[]>([])
  const [loading, setLoading] = useState(false)

  const loadActivities = useCallback(async () => {
    if (!session) return
    
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('sync_logs')
        .select('*')
        .eq('user_id', session.user.id)
        .order('started_at', { ascending: false })
        .limit(limit)

      if (error) throw error
      setActivities(data || [])
    } catch (error) {
      console.error('Error loading activities:', error)
    } finally {
      setLoading(false)
    }
  }, [session, limit])

  useEffect(() => {
    loadActivities()
  }, [loadActivities])

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(() => {
      loadActivities()
    }, refreshInterval)

    return () => clearInterval(interval)
  }, [autoRefresh, refreshInterval, loadActivities])

  // Real-time subscription
  useEffect(() => {
    if (!session) return

    const channel = supabase
      .channel('sync_logs_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sync_logs',
          filter: `user_id=eq.${session.user.id}`
        },
        () => {
          loadActivities()
        }
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [session, loadActivities])

  const getActivityIcon = (log: SyncLog) => {
    if (log.status === 'completed') {
      return <CheckCircleOutlined style={{ color: '#52c41a' }} />
    } else if (log.status === 'failed') {
      return <CloseCircleOutlined style={{ color: '#f5222d' }} />
    } else if (log.status === 'running') {
      return <SyncOutlined spin style={{ color: '#1890ff' }} />
    } else {
      return <ClockCircleOutlined style={{ color: '#faad14' }} />
    }
  }

  const getSyncTypeIcon = (syncType: string) => {
    switch (syncType) {
      case 'product':
        return <DatabaseOutlined />
      case 'inventory':
        return <ShoppingOutlined />
      case 'order':
        return <FileTextOutlined />
      default:
        return <SyncOutlined />
    }
  }

  const formatTimeAgo = (dateString: string): string => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  const getDirectionLabel = (direction: string) => {
    if (direction === 'netsuite_to_shopify') return 'NS → Shopify'
    if (direction === 'shopify_to_netsuite') return 'Shopify → NS'
    return 'Bidirectional'
  }

  const getSuccessRate = (log: SyncLog) => {
    if (log.items_processed === 0) return 0
    return Math.round((log.items_succeeded / log.items_processed) * 100)
  }

  if (loading && activities.length === 0) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>
            <Text type="secondary">Loading recent activity...</Text>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <Card
      title={
        <Space>
          <ClockCircleOutlined />
          <span>Recent Activity</span>
          <Tag color="blue">{activities.length} events</Tag>
        </Space>
      }
      extra={
        <Button
          icon={<ReloadOutlined />}
          onClick={() => loadActivities()}
          loading={loading}
          size="small"
        >
          Refresh
        </Button>
      }
    >
      {activities.length === 0 ? (
        <Empty
          description="No recent activity"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      ) : (
        <Timeline mode="left" style={{ marginTop: 16 }}>
          {activities.map((log) => (
            <Timeline.Item
              key={log.id}
              dot={getActivityIcon(log)}
              color={
                log.status === 'completed' ? 'green' :
                log.status === 'failed' ? 'red' :
                log.status === 'running' ? 'blue' : 'gray'
              }
            >
              <Space direction="vertical" size="small" style={{ width: '100%' }}>
                <Space>
                  {getSyncTypeIcon(log.sync_type)}
                  <Text strong style={{ textTransform: 'capitalize' }}>
                    {log.sync_type} Sync
                  </Text>
                  <Tag color="purple" style={{ margin: 0 }}>
                    {getDirectionLabel(log.direction)}
                  </Tag>
                </Space>

                <Space split="|">
                  <Tooltip title={new Date(log.started_at).toLocaleString()}>
                    <Text type="secondary">
                      {formatTimeAgo(log.started_at)}
                    </Text>
                  </Tooltip>

                  {log.status === 'completed' && (
                    <>
                      <Text type="secondary">
                        {log.items_processed} items
                      </Text>
                      <Text style={{ color: '#52c41a' }}>
                        {getSuccessRate(log)}% success
                      </Text>
                    </>
                  )}

                  {log.status === 'failed' && log.error_details && log.error_details.length > 0 && (
                    <Text type="danger">
                      {log.error_details.length} error{log.error_details.length > 1 ? 's' : ''}
                    </Text>
                  )}

                  {log.status === 'running' && (
                    <Text type="secondary">
                      <SyncOutlined spin /> In progress...
                    </Text>
                  )}
                </Space>

                {log.status === 'completed' && log.items_failed > 0 && (
                  <Text type="warning" style={{ fontSize: '12px' }}>
                    ⚠️ {log.items_failed} item{log.items_failed > 1 ? 's' : ''} failed
                  </Text>
                )}
              </Space>
            </Timeline.Item>
          ))}
        </Timeline>
      )}
    </Card>
  )
}

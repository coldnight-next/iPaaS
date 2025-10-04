import { useState, useEffect, useCallback } from 'react'
import { Row, Col, Card, Statistic, Tooltip, Spin } from 'antd'
import {
  CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined,
  ThunderboltOutlined, RiseOutlined, FallOutlined
} from '@ant-design/icons'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

interface SyncStats {
  total_syncs: number
  successful_syncs: number
  failed_syncs: number
  running_syncs: number
  avg_duration_seconds: number
  last_sync_time: string | null
  success_rate: number
  items_processed_today: number
}

interface SyncStatisticsCardsProps {
  session: Session
  timeRange?: '24h' | '7d' | '30d'
}

export default function SyncStatisticsCards({ session, timeRange = '24h' }: SyncStatisticsCardsProps) {
  const [stats, setStats] = useState<SyncStats | null>(null)
  const [loading, setLoading] = useState(true)

  const loadStats = useCallback(async () => {
    if (!session) return

    setLoading(true)
    try {
      // Calculate time range
      const now = new Date()
      let startDate = new Date()
      
      switch (timeRange) {
        case '24h':
          startDate.setHours(now.getHours() - 24)
          break
        case '7d':
          startDate.setDate(now.getDate() - 7)
          break
        case '30d':
          startDate.setDate(now.getDate() - 30)
          break
      }

      // Get sync logs within time range
      const { data: logs, error } = await supabase
        .from('sync_logs')
        .select('*')
        .eq('user_id', session.user.id)
        .gte('started_at', startDate.toISOString())
        .order('started_at', { ascending: false })

      if (error) throw error

      if (!logs || logs.length === 0) {
        setStats({
          total_syncs: 0,
          successful_syncs: 0,
          failed_syncs: 0,
          running_syncs: 0,
          avg_duration_seconds: 0,
          last_sync_time: null,
          success_rate: 0,
          items_processed_today: 0
        })
        return
      }

      // Calculate statistics
      const total_syncs = logs.length
      const successful_syncs = logs.filter(l => l.status === 'completed').length
      const failed_syncs = logs.filter(l => l.status === 'failed').length
      const running_syncs = logs.filter(l => l.status === 'running').length
      
      // Calculate average duration for completed syncs
      const completedLogs = logs.filter(l => l.status === 'completed' && l.duration_seconds)
      const avg_duration_seconds = completedLogs.length > 0
        ? completedLogs.reduce((sum, log) => sum + (log.duration_seconds || 0), 0) / completedLogs.length
        : 0

      // Get last sync time
      const last_sync_time = logs[0]?.started_at || null

      // Calculate success rate
      const success_rate = total_syncs > 0 ? (successful_syncs / total_syncs) * 100 : 0

      // Calculate items processed today
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const todayLogs = logs.filter(l => new Date(l.started_at) >= today)
      const items_processed_today = todayLogs.reduce((sum, log) => sum + (log.items_processed || 0), 0)

      setStats({
        total_syncs,
        successful_syncs,
        failed_syncs,
        running_syncs,
        avg_duration_seconds,
        last_sync_time,
        success_rate,
        items_processed_today
      })
    } catch (error) {
      console.error('Error loading sync statistics:', error)
    } finally {
      setLoading(false)
    }
  }, [session, timeRange])

  useEffect(() => {
    loadStats()
    
    // Refresh every 30 seconds
    const interval = setInterval(loadStats, 30000)
    return () => clearInterval(interval)
  }, [loadStats])

  // Real-time subscription for updates
  useEffect(() => {
    if (!session) return

    const channel = supabase
      .channel('sync_stats_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sync_logs',
          filter: `user_id=eq.${session.user.id}`
        },
        () => {
          loadStats()
        }
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [session, loadStats])

  if (loading) {
    return (
      <Row gutter={[16, 16]}>
        {[1, 2, 3, 4].map((i) => (
          <Col key={i} xs={24} sm={12} lg={6}>
            <Card>
              <div style={{ textAlign: 'center', padding: '20px' }}>
                <Spin />
              </div>
            </Card>
          </Col>
        ))}
      </Row>
    )
  }

  if (!stats) return null

  const timeRangeLabel = {
    '24h': 'Last 24 Hours',
    '7d': 'Last 7 Days',
    '30d': 'Last 30 Days'
  }[timeRange]

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} sm={12} lg={6}>
        <Card>
          <Tooltip title={`Total synchronization operations in ${timeRangeLabel.toLowerCase()}`}>
            <Statistic
              title="Total Syncs"
              value={stats.total_syncs}
              prefix={<ThunderboltOutlined />}
              suffix={
                stats.running_syncs > 0 && (
                  <span style={{ fontSize: '14px', color: '#1890ff' }}>
                    ({stats.running_syncs} active)
                  </span>
                )
              }
            />
          </Tooltip>
        </Card>
      </Col>

      <Col xs={24} sm={12} lg={6}>
        <Card>
          <Tooltip title={`Success rate: ${stats.success_rate.toFixed(1)}%`}>
            <Statistic
              title="Success Rate"
              value={stats.success_rate.toFixed(1)}
              precision={1}
              suffix="%"
              prefix={<CheckCircleOutlined />}
              valueStyle={{
                color: stats.success_rate >= 95 ? '#3f8600' : 
                       stats.success_rate >= 80 ? '#faad14' : '#cf1322'
              }}
            />
          </Tooltip>
        </Card>
      </Col>

      <Col xs={24} sm={12} lg={6}>
        <Card>
          <Tooltip title="Average time to complete a sync operation">
            <Statistic
              title="Avg Sync Time"
              value={stats.avg_duration_seconds}
              precision={1}
              suffix="sec"
              prefix={<ClockCircleOutlined />}
              valueStyle={{ color: stats.avg_duration_seconds < 30 ? '#3f8600' : '#fa8c16' }}
            />
          </Tooltip>
        </Card>
      </Col>

      <Col xs={24} sm={12} lg={6}>
        <Card>
          <Tooltip title="Total items synchronized today">
            <Statistic
              title="Items Today"
              value={stats.items_processed_today}
              prefix={<RiseOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Tooltip>
        </Card>
      </Col>

      {/* Second row with more detailed stats */}
      <Col xs={24} sm={12} lg={6}>
        <Card size="small">
          <Statistic
            title="Successful"
            value={stats.successful_syncs}
            valueStyle={{ color: '#52c41a', fontSize: '20px' }}
            prefix={<CheckCircleOutlined />}
          />
        </Card>
      </Col>

      <Col xs={24} sm={12} lg={6}>
        <Card size="small">
          <Statistic
            title="Failed"
            value={stats.failed_syncs}
            valueStyle={{ color: '#f5222d', fontSize: '20px' }}
            prefix={<CloseCircleOutlined />}
          />
        </Card>
      </Col>

      <Col xs={24} sm={12} lg={6}>
        <Card size="small">
          <Statistic
            title="Last Sync"
            value={
              stats.last_sync_time
                ? new Date(stats.last_sync_time).toLocaleTimeString()
                : 'Never'
            }
            valueStyle={{ fontSize: '16px' }}
          />
        </Card>
      </Col>

      <Col xs={24} sm={12} lg={6}>
        <Card size="small">
          <Statistic
            title="Period"
            value={timeRangeLabel}
            valueStyle={{ fontSize: '16px' }}
          />
        </Card>
      </Col>
    </Row>
  )
}

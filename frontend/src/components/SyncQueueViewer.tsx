import React, { useState, useEffect, useMemo } from 'react'
import {
  Card,
  Table,
  Space,
  Tag,
  Button,
  Select,
  DatePicker,
  Input,
  Progress,
  Tooltip,
  Badge,
  Avatar,
  Dropdown,
  Menu
} from 'antd'
import {
  SyncOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  StopOutlined,
  FilterOutlined,
  SearchOutlined,
  ReloadOutlined,
  MoreOutlined
} from '@ant-design/icons'
import { supabase } from '../lib/supabase'
import dayjs from 'dayjs'
import type { RangePickerProps } from 'antd/es/date-picker'

interface SyncQueueItem {
  id: string
  sync_type: 'manual' | 'scheduled' | 'webhook' | 'bulk'
  direction: 'netsuite_to_shopify' | 'shopify_to_netsuite' | 'bidirectional'
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  items_processed: number
  items_succeeded: number
  items_failed: number
  started_at: string
  completed_at?: string
  duration_seconds?: number
  triggered_by: string
  error_details?: any
  created_at: string
}

const SyncQueueViewer: React.FC = () => {
  const [queueItems, setQueueItems] = useState<SyncQueueItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({
    status: 'all',
    type: 'all',
    direction: 'all',
    dateRange: null as [dayjs.Dayjs, dayjs.Dayjs] | null,
    search: ''
  })

  // Fetch sync queue data
  const fetchQueueData = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('sync_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)

      if (error) throw error
      setQueueItems(data || [])
    } catch (error) {
      console.error('Failed to fetch sync queue:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchQueueData()

    // Set up real-time subscription
    const subscription = supabase
      .channel('sync_logs_changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'sync_logs' },
        (payload) => {
          console.log('Sync log change:', payload)
          fetchQueueData() // Refresh data on any change
        }
      )
      .subscribe()

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  // Filter and search logic
  const filteredItems = useMemo(() => {
    return queueItems.filter(item => {
      // Status filter
      if (filters.status !== 'all' && item.status !== filters.status) return false

      // Type filter
      if (filters.type !== 'all' && item.sync_type !== filters.type) return false

      // Direction filter
      if (filters.direction !== 'all' && item.direction !== filters.direction) return false

      // Date range filter
      if (filters.dateRange) {
        const itemDate = dayjs(item.created_at)
        if (itemDate.isBefore(filters.dateRange[0]) || itemDate.isAfter(filters.dateRange[1])) {
          return false
        }
      }

      // Search filter
      if (filters.search) {
        const searchLower = filters.search.toLowerCase()
        const searchableText = [
          item.id,
          item.sync_type,
          item.direction,
          item.status,
          item.triggered_by,
          item.error_details?.message
        ].join(' ').toLowerCase()

        if (!searchableText.includes(searchLower)) return false
      }

      return true
    })
  }, [queueItems, filters])

  // Status statistics
  const stats = useMemo(() => {
    const total = filteredItems.length
    const pending = filteredItems.filter(item => item.status === 'pending').length
    const running = filteredItems.filter(item => item.status === 'running').length
    const completed = filteredItems.filter(item => item.status === 'completed').length
    const failed = filteredItems.filter(item => item.status === 'failed').length

    return { total, pending, running, completed, failed }
  }, [filteredItems])

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <ClockCircleOutlined style={{ color: '#faad14' }} />
      case 'running':
        return <SyncOutlined spin style={{ color: '#1890ff' }} />
      case 'completed':
        return <CheckCircleOutlined style={{ color: '#52c41a' }} />
      case 'failed':
        return <CloseCircleOutlined style={{ color: '#f5222d' }} />
      case 'cancelled':
        return <StopOutlined style={{ color: '#8c8c8c' }} />
      default:
        return <ClockCircleOutlined />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'orange'
      case 'running':
        return 'blue'
      case 'completed':
        return 'green'
      case 'failed':
        return 'red'
      case 'cancelled':
        return 'default'
      default:
        return 'default'
    }
  }

  const getSyncTypeIcon = (type: string) => {
    switch (type) {
      case 'manual':
        return '👤'
      case 'scheduled':
        return '⏰'
      case 'webhook':
        return '🪝'
      case 'bulk':
        return '📦'
      default:
        return '🔄'
    }
  }

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '-'
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}m ${remainingSeconds}s`
  }

  const getProgressPercent = (item: SyncQueueItem) => {
    const total = item.items_processed + item.items_succeeded + item.items_failed
    if (total === 0) return 0
    return Math.round(((item.items_succeeded + item.items_failed) / total) * 100)
  }

  const handleRetry = async (itemId: string) => {
    // Implement retry logic
    console.log('Retrying sync:', itemId)
    // This would call the sync API again
  }

  const handleCancel = async (itemId: string) => {
    // Implement cancel logic
    console.log('Cancelling sync:', itemId)
    // This would send a cancel signal to the running sync
  }

  const columns = [
    {
      title: 'Type',
      dataIndex: 'sync_type',
      key: 'sync_type',
      render: (type: string) => (
        <Space>
          <span style={{ fontSize: '16px' }}>{getSyncTypeIcon(type)}</span>
          <span style={{ textTransform: 'capitalize' }}>{type}</span>
        </Space>
      ),
      filters: [
        { text: 'Manual', value: 'manual' },
        { text: 'Scheduled', value: 'scheduled' },
        { text: 'Webhook', value: 'webhook' },
        { text: 'Bulk', value: 'bulk' }
      ],
      onFilter: (value: string | number | boolean, record: SyncQueueItem) =>
        record.sync_type === value
    },
    {
      title: 'Direction',
      dataIndex: 'direction',
      key: 'direction',
      render: (direction: string) => {
        const labels = {
          'netsuite_to_shopify': 'NetSuite → Shopify',
          'shopify_to_netsuite': 'Shopify → NetSuite',
          'bidirectional': '↔ Bidirectional'
        }
        return <Tag>{labels[direction as keyof typeof labels] || direction}</Tag>
      },
      filters: [
        { text: 'NetSuite → Shopify', value: 'netsuite_to_shopify' },
        { text: 'Shopify → NetSuite', value: 'shopify_to_netsuite' },
        { text: 'Bidirectional', value: 'bidirectional' }
      ],
      onFilter: (value: string | number | boolean, record: SyncQueueItem) =>
        record.direction === value
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string, record: SyncQueueItem) => (
        <Space>
          {getStatusIcon(status)}
          <Tag color={getStatusColor(status)} style={{ textTransform: 'capitalize' }}>
            {status}
          </Tag>
          {record.status === 'running' && (
            <Progress
              type="circle"
              percent={getProgressPercent(record)}
              size={20}
              showInfo={false}
            />
          )}
        </Space>
      ),
      filters: [
        { text: 'Pending', value: 'pending' },
        { text: 'Running', value: 'running' },
        { text: 'Completed', value: 'completed' },
        { text: 'Failed', value: 'failed' },
        { text: 'Cancelled', value: 'cancelled' }
      ],
      onFilter: (value: string | number | boolean, record: SyncQueueItem) =>
        record.status === value
    },
    {
      title: 'Progress',
      key: 'progress',
      render: (record: SyncQueueItem) => {
        const total = record.items_processed || 0
        const success = record.items_succeeded || 0
        const failed = record.items_failed || 0

        if (total === 0) return '-'

        return (
          <div style={{ minWidth: '120px' }}>
            <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>
              {success + failed}/{total} items
            </div>
            <Progress
              percent={getProgressPercent(record)}
              size="small"
              status={failed > 0 ? 'exception' : 'success'}
            />
          </div>
        )
      }
    },
    {
      title: 'Duration',
      dataIndex: 'duration_seconds',
      key: 'duration_seconds',
      render: (duration: number) => formatDuration(duration),
      sorter: (a: SyncQueueItem, b: SyncQueueItem) =>
        (a.duration_seconds || 0) - (b.duration_seconds || 0)
    },
    {
      title: 'Started',
      dataIndex: 'started_at',
      key: 'started_at',
      render: (date: string) => dayjs(date).format('MMM DD, HH:mm:ss'),
      sorter: (a: SyncQueueItem, b: SyncQueueItem) =>
        dayjs(a.started_at).unix() - dayjs(b.started_at).unix()
    },
    {
      title: 'Triggered By',
      dataIndex: 'triggered_by',
      key: 'triggered_by',
      render: (triggeredBy: string) => (
        <Space>
          <Avatar size="small" style={{ backgroundColor: '#1890ff' }}>
            {triggeredBy.charAt(0).toUpperCase()}
          </Avatar>
          <span>{triggeredBy}</span>
        </Space>
      )
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (record: SyncQueueItem) => {
        const menuItems = []

        if (record.status === 'failed') {
          menuItems.push({
            key: 'retry',
            icon: <ReloadOutlined />,
            label: 'Retry',
            onClick: () => handleRetry(record.id)
          })
        }

        if (record.status === 'running') {
          menuItems.push({
            key: 'cancel',
            icon: <StopOutlined />,
            label: 'Cancel',
            danger: true,
            onClick: () => handleCancel(record.id)
          })
        }

        return menuItems.length > 0 ? (
          <Dropdown menu={{ items: menuItems }} trigger={['click']}>
            <Button icon={<MoreOutlined />} size="small" />
          </Dropdown>
        ) : null
      }
    }
  ]

  return (
    <div>
      {/* Statistics Cards */}
      <Space style={{ marginBottom: '16px', flexWrap: 'wrap' }}>
        <Card size="small" style={{ minWidth: '120px' }}>
          <Statistic
            title="Total"
            value={stats.total}
            prefix={<Badge count={stats.running} showZero={false} />}
          />
        </Card>
        <Card size="small" style={{ minWidth: '120px' }}>
          <Statistic
            title="Running"
            value={stats.running}
            valueStyle={{ color: '#1890ff' }}
            prefix={<SyncOutlined spin />}
          />
        </Card>
        <Card size="small" style={{ minWidth: '120px' }}>
          <Statistic
            title="Completed"
            value={stats.completed}
            valueStyle={{ color: '#52c41a' }}
            prefix={<CheckCircleOutlined />}
          />
        </Card>
        <Card size="small" style={{ minWidth: '120px' }}>
          <Statistic
            title="Failed"
            value={stats.failed}
            valueStyle={{ color: stats.failed > 0 ? '#f5222d' : undefined }}
            prefix={<CloseCircleOutlined />}
          />
        </Card>
      </Space>

      {/* Filters */}
      <Card style={{ marginBottom: '16px' }}>
        <Space wrap>
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px' }}>
              Status
            </label>
            <Select
              value={filters.status}
              onChange={(value) => setFilters(prev => ({ ...prev, status: value }))}
              style={{ width: '120px' }}
              size="small"
            >
              <Select.Option value="all">All Status</Select.Option>
              <Select.Option value="pending">Pending</Select.Option>
              <Select.Option value="running">Running</Select.Option>
              <Select.Option value="completed">Completed</Select.Option>
              <Select.Option value="failed">Failed</Select.Option>
              <Select.Option value="cancelled">Cancelled</Select.Option>
            </Select>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px' }}>
              Type
            </label>
            <Select
              value={filters.type}
              onChange={(value) => setFilters(prev => ({ ...prev, type: value }))}
              style={{ width: '120px' }}
              size="small"
            >
              <Select.Option value="all">All Types</Select.Option>
              <Select.Option value="manual">Manual</Select.Option>
              <Select.Option value="scheduled">Scheduled</Select.Option>
              <Select.Option value="webhook">Webhook</Select.Option>
              <Select.Option value="bulk">Bulk</Select.Option>
            </Select>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px' }}>
              Direction
            </label>
            <Select
              value={filters.direction}
              onChange={(value) => setFilters(prev => ({ ...prev, direction: value }))}
              style={{ width: '140px' }}
              size="small"
            >
              <Select.Option value="all">All Directions</Select.Option>
              <Select.Option value="netsuite_to_shopify">NetSuite → Shopify</Select.Option>
              <Select.Option value="shopify_to_netsuite">Shopify → NetSuite</Select.Option>
              <Select.Option value="bidirectional">Bidirectional</Select.Option>
            </Select>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px' }}>
              Date Range
            </label>
            <DatePicker.RangePicker
              value={filters.dateRange}
              onChange={(dates) => setFilters(prev => ({ ...prev, dateRange: dates }))}
              size="small"
              style={{ width: '240px' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px' }}>
              Search
            </label>
            <Input
              placeholder="Search sync logs..."
              value={filters.search}
              onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
              prefix={<SearchOutlined />}
              size="small"
              style={{ width: '200px' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px' }}>
              &nbsp;
            </label>
            <Button
              icon={<ReloadOutlined />}
              onClick={fetchQueueData}
              loading={loading}
              size="small"
            >
              Refresh
            </Button>
          </div>
        </Space>
      </Card>

      {/* Queue Table */}
      <Card>
        <Table
          columns={columns}
          dataSource={filteredItems}
          rowKey="id"
          loading={loading}
          pagination={{
            pageSize: 20,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} syncs`
          }}
          scroll={{ x: 1200 }}
          expandable={{
            expandedRowRender: (record) => (
              <div style={{ padding: '16px', backgroundColor: '#fafafa', borderRadius: '6px' }}>
                <Space direction="vertical" size="small" style={{ width: '100%' }}>
                  <div>
                    <strong>Sync ID:</strong> {record.id}
                  </div>
                  {record.error_details && (
                    <div>
                      <strong>Error Details:</strong>
                      <pre style={{
                        backgroundColor: '#f5f5f5',
                        padding: '8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        overflow: 'auto',
                        maxHeight: '100px'
                      }}>
                        {JSON.stringify(record.error_details, null, 2)}
                      </pre>
                    </div>
                  )}
                  <div>
                    <strong>Created:</strong> {dayjs(record.created_at).format('MMM DD, YYYY HH:mm:ss')}
                  </div>
                  {record.completed_at && (
                    <div>
                      <strong>Completed:</strong> {dayjs(record.completed_at).format('MMM DD, YYYY HH:mm:ss')}
                    </div>
                  )}
                </Space>
              </div>
            )
          }}
        />
      </Card>
    </div>
  )
}

export default SyncQueueViewer
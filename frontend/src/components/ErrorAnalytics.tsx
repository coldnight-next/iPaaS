import React, { useState, useMemo } from 'react'
import {
  Card,
  Row,
  Col,
  Statistic,
  Table,
  Select,
  DatePicker,
  Space,
  Tag,
  Progress,
  Alert,
  Button,
  Tooltip
} from 'antd'
import {
  ExclamationCircleOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ReloadOutlined,
  BarChartOutlined,
  LineChartOutlined
} from '@ant-design/icons'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import dayjs from 'dayjs'
import type { RangePickerProps } from 'antd/es/date-picker'

interface ErrorRecord {
  id: string
  timestamp: Date
  type: 'network' | 'auth' | 'validation' | 'server' | 'timeout' | 'rate_limit' | 'unknown'
  message: string
  source: 'sync' | 'webhook' | 'api' | 'ui'
  userId?: string
  resolved: boolean
  resolvedAt?: Date
  retryCount: number
  metadata?: Record<string, any>
}

interface ErrorAnalyticsProps {
  errors: ErrorRecord[]
  onResolveError?: (errorId: string) => void
  onRetryError?: (errorId: string) => void
  onBulkResolve?: (errorIds: string[]) => void
}

const ErrorAnalytics: React.FC<ErrorAnalyticsProps> = ({
  errors,
  onResolveError,
  onRetryError,
  onBulkResolve
}) => {
  const [timeRange, setTimeRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().subtract(7, 'days'),
    dayjs()
  ])
  const [selectedType, setSelectedType] = useState<string>('all')
  const [selectedSource, setSelectedSource] = useState<string>('all')

  // Filter errors based on time range and filters
  const filteredErrors = useMemo(() => {
    return errors.filter(error => {
      const inTimeRange = dayjs(error.timestamp).isBetween(timeRange[0], timeRange[1], 'day', '[]')
      const matchesType = selectedType === 'all' || error.type === selectedType
      const matchesSource = selectedSource === 'all' || error.source === selectedSource
      return inTimeRange && matchesType && matchesSource
    })
  }, [errors, timeRange, selectedType, selectedSource])

  // Calculate analytics
  const analytics = useMemo(() => {
    const total = filteredErrors.length
    const resolved = filteredErrors.filter(e => e.resolved).length
    const unresolved = total - resolved
    const resolutionRate = total > 0 ? Math.round((resolved / total) * 100) : 0

    // Errors by type
    const byType = filteredErrors.reduce((acc, error) => {
      acc[error.type] = (acc[error.type] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    // Errors by source
    const bySource = filteredErrors.reduce((acc, error) => {
      acc[error.source] = (acc[error.source] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    // Errors over time (last 7 days)
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const date = dayjs().subtract(6 - i, 'days').format('MMM DD')
      const count = filteredErrors.filter(e =>
        dayjs(e.timestamp).format('MMM DD') === date
      ).length
      return { date, count }
    })

    return {
      total,
      resolved,
      unresolved,
      resolutionRate,
      byType: Object.entries(byType).map(([type, count]) => ({ type, count })),
      bySource: Object.entries(bySource).map(([source, count]) => ({ source, count })),
      timeline: last7Days
    }
  }, [filteredErrors])

  const getErrorTypeColor = (type: string) => {
    const colors = {
      network: '#1890ff',
      auth: '#722ed1',
      validation: '#faad14',
      server: '#f5222d',
      timeout: '#13c2c2',
      rate_limit: '#eb2f96',
      unknown: '#8c8c8c'
    }
    return colors[type as keyof typeof colors] || '#8c8c8c'
  }

  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'sync': return <BarChartOutlined />
      case 'webhook': return <LineChartOutlined />
      case 'api': return <CheckCircleOutlined />
      case 'ui': return <ExclamationCircleOutlined />
      default: return <ExclamationCircleOutlined />
    }
  }

  const columns = [
    {
      title: 'Timestamp',
      dataIndex: 'timestamp',
      key: 'timestamp',
      render: (timestamp: Date) => dayjs(timestamp).format('MMM DD, HH:mm:ss'),
      sorter: (a: ErrorRecord, b: ErrorRecord) => dayjs(a.timestamp).unix() - dayjs(b.timestamp).unix()
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      render: (type: string) => (
        <Tag color={getErrorTypeColor(type)}>
          {type.replace('_', ' ').toUpperCase()}
        </Tag>
      ),
      filters: [
        { text: 'Network', value: 'network' },
        { text: 'Auth', value: 'auth' },
        { text: 'Validation', value: 'validation' },
        { text: 'Server', value: 'server' },
        { text: 'Timeout', value: 'timeout' },
        { text: 'Rate Limit', value: 'rate_limit' },
        { text: 'Unknown', value: 'unknown' }
      ],
      onFilter: (value: string | number | boolean, record: ErrorRecord) => record.type === value
    },
    {
      title: 'Source',
      dataIndex: 'source',
      key: 'source',
      render: (source: string) => (
        <Space>
          {getSourceIcon(source)}
          <span>{source.toUpperCase()}</span>
        </Space>
      )
    },
    {
      title: 'Message',
      dataIndex: 'message',
      key: 'message',
      ellipsis: true,
      render: (message: string) => (
        <Tooltip title={message}>
          <span>{message.length > 50 ? `${message.substring(0, 50)}...` : message}</span>
        </Tooltip>
      )
    },
    {
      title: 'Status',
      dataIndex: 'resolved',
      key: 'resolved',
      render: (resolved: boolean) => (
        <Tag color={resolved ? 'success' : 'error'}>
          {resolved ? 'Resolved' : 'Unresolved'}
        </Tag>
      ),
      filters: [
        { text: 'Resolved', value: true },
        { text: 'Unresolved', value: false }
      ],
      onFilter: (value: boolean | string | number, record: ErrorRecord) => record.resolved === value
    },
    {
      title: 'Retries',
      dataIndex: 'retryCount',
      key: 'retryCount',
      render: (count: number) => count > 0 ? <Tag>{count}</Tag> : '-'
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: ErrorRecord) => (
        <Space size="small">
          {!record.resolved && onResolveError && (
            <Button
              size="small"
              type="primary"
              onClick={() => onResolveError(record.id)}
            >
              Resolve
            </Button>
          )}
          {!record.resolved && onRetryError && (
            <Tooltip title="Retry operation">
              <Button
                size="small"
                icon={<ReloadOutlined />}
                onClick={() => onRetryError(record.id)}
              />
            </Tooltip>
          )}
        </Space>
      )
    }
  ]

  const COLORS = ['#1890ff', '#faad14', '#f5222d', '#722ed1', '#13c2c2', '#eb2f96', '#8c8c8c']

  return (
    <div>
      {/* Summary Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
        <Col xs={24} sm={6}>
          <Card>
            <Statistic
              title="Total Errors"
              value={analytics.total}
              prefix={<ExclamationCircleOutlined />}
              valueStyle={{ color: analytics.total > 0 ? '#f5222d' : '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card>
            <Statistic
              title="Resolved"
              value={analytics.resolved}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card>
            <Statistic
              title="Unresolved"
              value={analytics.unresolved}
              prefix={<ClockCircleOutlined />}
              valueStyle={{ color: analytics.unresolved > 0 ? '#faad14' : '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card>
            <Statistic
              title="Resolution Rate"
              value={analytics.resolutionRate}
              suffix="%"
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: analytics.resolutionRate >= 80 ? '#52c41a' : '#faad14' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Filters */}
      <Card style={{ marginBottom: '24px' }}>
        <Space wrap>
          <div>
            <label style={{ display: 'block', marginBottom: '4px' }}>Time Range:</label>
            <DatePicker.RangePicker
              value={timeRange}
              onChange={(dates) => {
                if (dates && dates[0] && dates[1]) {
                  setTimeRange([dates[0], dates[1]])
                }
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '4px' }}>Error Type:</label>
            <Select
              value={selectedType}
              onChange={setSelectedType}
              style={{ width: '120px' }}
            >
              <Select.Option value="all">All Types</Select.Option>
              <Select.Option value="network">Network</Select.Option>
              <Select.Option value="auth">Auth</Select.Option>
              <Select.Option value="validation">Validation</Select.Option>
              <Select.Option value="server">Server</Select.Option>
              <Select.Option value="timeout">Timeout</Select.Option>
              <Select.Option value="rate_limit">Rate Limit</Select.Option>
              <Select.Option value="unknown">Unknown</Select.Option>
            </Select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '4px' }}>Source:</label>
            <Select
              value={selectedSource}
              onChange={setSelectedSource}
              style={{ width: '120px' }}
            >
              <Select.Option value="all">All Sources</Select.Option>
              <Select.Option value="sync">Sync</Select.Option>
              <Select.Option value="webhook">Webhook</Select.Option>
              <Select.Option value="api">API</Select.Option>
              <Select.Option value="ui">UI</Select.Option>
            </Select>
          </div>
        </Space>
      </Card>

      {/* Charts */}
      <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
        <Col xs={24} lg={12}>
          <Card title="Errors Over Time">
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={analytics.timeline}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <RechartsTooltip />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#f5222d"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Errors by Type">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={analytics.byType}
                  dataKey="count"
                  nameKey="type"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ type, count }) => `${type}: ${count}`}
                >
                  {analytics.byType.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </Col>
      </Row>

      {/* Error Table */}
      <Card title="Error Details">
        {analytics.unresolved > 0 && (
          <Alert
            message={`${analytics.unresolved} unresolved errors`}
            description="Consider resolving these errors to improve system reliability."
            type="warning"
            showIcon
            style={{ marginBottom: '16px' }}
            action={
              onBulkResolve && analytics.unresolved > 0 ? (
                <Button
                  size="small"
                  onClick={() => {
                    const unresolvedIds = filteredErrors
                      .filter(e => !e.resolved)
                      .map(e => e.id)
                    onBulkResolve(unresolvedIds)
                  }}
                >
                  Resolve All
                </Button>
              ) : undefined
            }
          />
        )}
        <Table
          columns={columns}
          dataSource={filteredErrors}
          rowKey="id"
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} errors`
          }}
          scroll={{ x: 800 }}
        />
      </Card>
    </div>
  )
}

export default ErrorAnalytics
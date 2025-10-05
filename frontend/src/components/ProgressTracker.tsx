import React, { useEffect, useState } from 'react'
import { Progress, Card, Space, Typography, Button, Tooltip, Spin } from 'antd'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  StopOutlined
} from '@ant-design/icons'

export interface ProgressItem {
  id: string
  name: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  progress: number // 0-100
  message?: string
  startTime?: Date
  endTime?: Date
  error?: string
  metadata?: Record<string, any>
}

export interface ProgressTrackerProps {
  items: ProgressItem[]
  title?: string
  showControls?: boolean
  onPause?: (id: string) => void
  onResume?: (id: string) => void
  onCancel?: (id: string) => void
  onRetry?: (id: string) => void
  maxHeight?: number
}

const ProgressTracker: React.FC<ProgressTrackerProps> = ({
  items,
  title = 'Progress',
  showControls = false,
  onPause,
  onResume,
  onCancel,
  onRetry,
  maxHeight = 400
}) => {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())

  const getStatusIcon = (status: ProgressItem['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircleOutlined style={{ color: '#52c41a' }} />
      case 'failed':
        return <CloseCircleOutlined style={{ color: '#f5222d' }} />
      case 'running':
        return <Spin size="small" />
      case 'cancelled':
        return <StopOutlined style={{ color: '#8c8c8c' }} />
      case 'pending':
        return <ClockCircleOutlined style={{ color: '#faad14' }} />
      default:
        return <ClockCircleOutlined />
    }
  }

  const getStatusColor = (status: ProgressItem['status']) => {
    switch (status) {
      case 'completed':
        return '#52c41a'
      case 'failed':
        return '#f5222d'
      case 'running':
        return '#1890ff'
      case 'cancelled':
        return '#8c8c8c'
      case 'pending':
        return '#faad14'
      default:
        return '#d9d9d9'
    }
  }

  const formatDuration = (start: Date, end?: Date) => {
    const endTime = end || new Date()
    const duration = endTime.getTime() - start.getTime()
    const seconds = Math.floor(duration / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)

    if (hours > 0) return `${hours}h ${minutes % 60}m`
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`
    return `${seconds}s`
  }

  const toggleExpanded = (id: string) => {
    const newExpanded = new Set(expandedItems)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpandedItems(newExpanded)
  }

  const overallProgress = items.length > 0
    ? Math.round(items.reduce((sum, item) => sum + item.progress, 0) / items.length)
    : 0

  const completedCount = items.filter(item => item.status === 'completed').length
  const failedCount = items.filter(item => item.status === 'failed').length
  const runningCount = items.filter(item => item.status === 'running').length

  return (
    <Card
      title={
        <Space>
          <span>{title}</span>
          <Typography.Text type="secondary">
            ({completedCount + failedCount}/{items.length} completed)
          </Typography.Text>
        </Space>
      }
      size="small"
    >
      {/* Overall Progress */}
      <div style={{ marginBottom: '16px' }}>
        <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: '8px' }}>
          <Typography.Text strong>Overall Progress</Typography.Text>
          <Typography.Text>{overallProgress}%</Typography.Text>
        </Space>
        <Progress
          percent={overallProgress}
          status={failedCount > 0 ? 'exception' : runningCount > 0 ? 'active' : 'success'}
          strokeColor={failedCount > 0 ? '#f5222d' : undefined}
        />
      </div>

      {/* Individual Items */}
      <div
        style={{
          maxHeight,
          overflow: 'auto',
          border: '1px solid #f0f0f0',
          borderRadius: '6px'
        }}
      >
        {items.map((item) => (
          <div
            key={item.id}
            style={{
              padding: '12px',
              borderBottom: '1px solid #f0f0f0',
              backgroundColor: item.status === 'failed' ? '#fff2f0' : 'transparent',
              cursor: 'pointer'
            }}
            onClick={() => toggleExpanded(item.id)}
          >
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Space>
                {getStatusIcon(item.status)}
                <div>
                  <Typography.Text
                    strong={!item.message}
                    style={{
                      maxWidth: '200px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {item.name}
                  </Typography.Text>
                  {item.message && (
                    <div>
                      <Typography.Text
                        type="secondary"
                        style={{ fontSize: '12px' }}
                      >
                        {item.message}
                      </Typography.Text>
                    </div>
                  )}
                </div>
              </Space>

              <Space>
                <Typography.Text style={{ fontSize: '12px' }}>
                  {item.progress}%
                </Typography.Text>
                {showControls && (
                  <Space size="small">
                    {item.status === 'running' && onPause && (
                      <Tooltip title="Pause">
                        <Button
                          size="small"
                          icon={<PauseCircleOutlined />}
                          onClick={(e) => {
                            e.stopPropagation()
                            onPause(item.id)
                          }}
                        />
                      </Tooltip>
                    )}
                    {item.status === 'pending' && onResume && (
                      <Tooltip title="Resume">
                        <Button
                          size="small"
                          icon={<PlayCircleOutlined />}
                          onClick={(e) => {
                            e.stopPropagation()
                            onResume(item.id)
                          }}
                        />
                      </Tooltip>
                    )}
                    {(item.status === 'running' || item.status === 'pending') && onCancel && (
                      <Tooltip title="Cancel">
                        <Button
                          size="small"
                          danger
                          icon={<StopOutlined />}
                          onClick={(e) => {
                            e.stopPropagation()
                            onCancel(item.id)
                          }}
                        />
                      </Tooltip>
                    )}
                    {item.status === 'failed' && onRetry && (
                      <Tooltip title="Retry">
                        <Button
                          size="small"
                          type="primary"
                          onClick={(e) => {
                            e.stopPropagation()
                            onRetry(item.id)
                          }}
                        >
                          Retry
                        </Button>
                      </Tooltip>
                    )}
                  </Space>
                )}
              </Space>
            </Space>

            {/* Progress Bar */}
            <Progress
              percent={item.progress}
              size="small"
              status={
                item.status === 'failed' ? 'exception' :
                item.status === 'cancelled' ? 'normal' :
                item.status === 'running' ? 'active' : 'success'
              }
              strokeColor={getStatusColor(item.status)}
              style={{ marginTop: '8px' }}
            />

            {/* Expanded Details */}
            {expandedItems.has(item.id) && (
              <div style={{ marginTop: '12px', padding: '8px', backgroundColor: '#fafafa', borderRadius: '4px' }}>
                <Space direction="vertical" size="small" style={{ width: '100%' }}>
                  {item.startTime && (
                    <div>
                      <Typography.Text strong>Started:</Typography.Text>{' '}
                      <Typography.Text>{item.startTime.toLocaleString()}</Typography.Text>
                    </div>
                  )}
                  {item.endTime && (
                    <div>
                      <Typography.Text strong>Completed:</Typography.Text>{' '}
                      <Typography.Text>{item.endTime.toLocaleString()}</Typography.Text>
                    </div>
                  )}
                  {item.startTime && (
                    <div>
                      <Typography.Text strong>Duration:</Typography.Text>{' '}
                      <Typography.Text>
                        {formatDuration(item.startTime, item.endTime)}
                      </Typography.Text>
                    </div>
                  )}
                  {item.error && (
                    <div>
                      <Typography.Text strong type="danger">Error:</Typography.Text>{' '}
                      <Typography.Text type="danger">{item.error}</Typography.Text>
                    </div>
                  )}
                  {item.metadata && Object.keys(item.metadata).length > 0 && (
                    <div>
                      <Typography.Text strong>Details:</Typography.Text>
                      <pre style={{
                        fontSize: '11px',
                        backgroundColor: '#f5f5f5',
                        padding: '4px',
                        borderRadius: '2px',
                        marginTop: '4px',
                        overflow: 'auto'
                      }}>
                        {JSON.stringify(item.metadata, null, 2)}
                      </pre>
                    </div>
                  )}
                </Space>
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  )
}

export default ProgressTracker
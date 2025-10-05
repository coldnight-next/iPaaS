import React from 'react'
import { Card, Statistic, Tooltip } from 'antd'
import {
  ArrowUpOutlined,
  ArrowDownOutlined,
  MinusOutlined,
  LoadingOutlined
} from '@ant-design/icons'
import { SkeletonLoader } from './SkeletonLoader'

interface TrendData {
  value: number
  change: number // percentage change
  period: string // e.g., "vs last week", "vs yesterday"
}

interface EnhancedKPICardProps {
  title: string
  value: number | string
  prefix?: React.ReactNode
  suffix?: React.ReactNode
  precision?: number
  loading?: boolean
  trend?: TrendData
  color?: 'primary' | 'success' | 'warning' | 'error' | 'default'
  size?: 'small' | 'default'
  onClick?: () => void
}

const EnhancedKPICard: React.FC<EnhancedKPICardProps> = ({
  title,
  value,
  prefix,
  suffix,
  precision = 0,
  loading = false,
  trend,
  color = 'default',
  size = 'default',
  onClick
}) => {
  const getTrendIcon = (change: number) => {
    if (change > 0) return <ArrowUpOutlined style={{ color: '#52c41a' }} />
    if (change < 0) return <ArrowDownOutlined style={{ color: '#f5222d' }} />
    return <MinusOutlined style={{ color: '#8c8c8c' }} />
  }

  const getTrendColor = (change: number) => {
    if (change > 0) return '#52c41a'
    if (change < 0) return '#f5222d'
    return '#8c8c8c'
  }

  const formatTrendValue = (change: number) => {
    const sign = change > 0 ? '+' : ''
    return `${sign}${change.toFixed(1)}%`
  }

  if (loading) {
    return (
      <Card
        hoverable={!!onClick}
        onClick={onClick}
        size={size}
        style={{ cursor: onClick ? 'pointer' : 'default' }}
      >
        <SkeletonLoader height={20} width="70%" style={{ marginBottom: '8px' }} />
        <SkeletonLoader height={32} width="50%" />
      </Card>
    )
  }

  return (
    <Card
      hoverable={!!onClick}
      onClick={onClick}
      size={size}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      <Statistic
        title={title}
        value={value}
        prefix={prefix}
        suffix={suffix}
        precision={precision}
        valueStyle={{
          color: color === 'primary' ? '#1890ff' :
                 color === 'success' ? '#52c41a' :
                 color === 'warning' ? '#faad14' :
                 color === 'error' ? '#f5222d' : undefined
        }}
      />
      {trend && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          marginTop: '8px',
          fontSize: '12px',
          color: '#8c8c8c'
        }}>
          <Tooltip title={`${formatTrendValue(trend.change)} ${trend.period}`}>
            {getTrendIcon(trend.change)}
          </Tooltip>
          <span style={{ color: getTrendColor(trend.change) }}>
            {formatTrendValue(trend.change)}
          </span>
          <span>{trend.period}</span>
        </div>
      )}
    </Card>
  )
}

export default EnhancedKPICard
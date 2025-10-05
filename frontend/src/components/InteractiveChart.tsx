import React, { useMemo } from 'react'
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts'
import { Card, Select, Space } from 'antd'
import { ChartSkeleton } from './SkeletonLoader'

interface DataPoint {
  date: string
  value: number
  [key: string]: any
}

interface InteractiveChartProps {
  title: string
  data: DataPoint[]
  type?: 'line' | 'area' | 'bar'
  dataKey?: string
  xAxisKey?: string
  loading?: boolean
  height?: number
  color?: string
  showLegend?: boolean
  showGrid?: boolean
  timeRange?: '7d' | '30d' | '90d' | '1y'
  onTimeRangeChange?: (range: string) => void
}

const InteractiveChart: React.FC<InteractiveChartProps> = ({
  title,
  data,
  type = 'line',
  dataKey = 'value',
  xAxisKey = 'date',
  loading = false,
  height = 300,
  color = '#1890ff',
  showLegend = false,
  showGrid = true,
  timeRange,
  onTimeRangeChange
}) => {
  const chartData = useMemo(() => {
    return data.map(item => ({
      ...item,
      [xAxisKey]: new Date(item[xAxisKey]).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      })
    }))
  }, [data, xAxisKey])

  const renderChart = () => {
    const commonProps = {
      data: chartData,
      margin: { top: 5, right: 30, left: 20, bottom: 5 }
    }

    switch (type) {
      case 'area':
        return (
          <AreaChart {...commonProps}>
            {showGrid && <CartesianGrid strokeDasharray="3 3" />}
            <XAxis dataKey={xAxisKey} />
            <YAxis />
            <Tooltip
              formatter={(value: number) => [value.toLocaleString(), title]}
              labelFormatter={(label) => `Date: ${label}`}
            />
            {showLegend && <Legend />}
            <Area
              type="monotone"
              dataKey={dataKey}
              stroke={color}
              fill={color}
              fillOpacity={0.3}
            />
          </AreaChart>
        )

      case 'bar':
        return (
          <BarChart {...commonProps}>
            {showGrid && <CartesianGrid strokeDasharray="3 3" />}
            <XAxis dataKey={xAxisKey} />
            <YAxis />
            <Tooltip
              formatter={(value: number) => [value.toLocaleString(), title]}
              labelFormatter={(label) => `Date: ${label}`}
            />
            {showLegend && <Legend />}
            <Bar dataKey={dataKey} fill={color} />
          </BarChart>
        )

      default: // line
        return (
          <LineChart {...commonProps}>
            {showGrid && <CartesianGrid strokeDasharray="3 3" />}
            <XAxis dataKey={xAxisKey} />
            <YAxis />
            <Tooltip
              formatter={(value: number) => [value.toLocaleString(), title]}
              labelFormatter={(label) => `Date: ${label}`}
            />
            {showLegend && <Legend />}
            <Line
              type="monotone"
              dataKey={dataKey}
              stroke={color}
              strokeWidth={2}
              dot={{ fill: color, strokeWidth: 2, r: 4 }}
              activeDot={{ r: 6, stroke: color, strokeWidth: 2 }}
            />
          </LineChart>
        )
    }
  }

  if (loading) {
    return <ChartSkeleton />
  }

  return (
    <Card
      title={
        <Space>
          {title}
          {onTimeRangeChange && (
            <Select
              value={timeRange}
              onChange={onTimeRangeChange}
              size="small"
              style={{ minWidth: '80px' }}
            >
              <Select.Option value="7d">7 days</Select.Option>
              <Select.Option value="30d">30 days</Select.Option>
              <Select.Option value="90d">90 days</Select.Option>
              <Select.Option value="1y">1 year</Select.Option>
            </Select>
          )}
        </Space>
      }
      size="small"
    >
      <ResponsiveContainer width="100%" height={height}>
        {renderChart()}
      </ResponsiveContainer>
    </Card>
  )
}

export default InteractiveChart
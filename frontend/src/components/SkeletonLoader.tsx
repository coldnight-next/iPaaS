import React from 'react'
import Skeleton from 'react-loading-skeleton'
import 'react-loading-skeleton/dist/skeleton.css'
import { useTheme } from '../contexts/ThemeContext'

interface SkeletonLoaderProps {
  count?: number
  height?: number | string
  width?: number | string
  circle?: boolean
  className?: string
  style?: React.CSSProperties
}

export const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({
  count = 1,
  height = 20,
  width,
  circle = false,
  className,
  style
}) => {
  const { isDark } = useTheme()

  return (
    <Skeleton
      count={count}
      height={height}
      width={width}
      circle={circle}
      className={className}
      style={style}
      baseColor={isDark ? '#303030' : '#f5f5f5'}
      highlightColor={isDark ? '#434343' : '#e8e8e8'}
    />
  )
}

// Specialized skeleton components for common use cases
export const CardSkeleton: React.FC = () => (
  <div style={{ padding: '24px', border: '1px solid #f0f0f0', borderRadius: '8px' }}>
    <SkeletonLoader height={24} width="60%" style={{ marginBottom: '16px' }} />
    <SkeletonLoader height={40} width="100%" style={{ marginBottom: '12px' }} />
    <SkeletonLoader height={20} width="80%" />
  </div>
)

export const TableSkeleton: React.FC<{ rows?: number; columns?: number }> = ({
  rows = 5,
  columns = 4
}) => (
  <div>
    {/* Table header */}
    <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', padding: '12px 0', borderBottom: '1px solid #f0f0f0' }}>
      {Array.from({ length: columns }).map((_, i) => (
        <SkeletonLoader key={i} height={16} width={`${100 / columns}%`} />
      ))}
    </div>
    {/* Table rows */}
    {Array.from({ length: rows }).map((_, rowIndex) => (
      <div key={rowIndex} style={{ display: 'flex', gap: '16px', padding: '12px 0', borderBottom: '1px solid #f0f0f0' }}>
        {Array.from({ length: columns }).map((_, colIndex) => (
          <SkeletonLoader key={colIndex} height={14} width={`${100 / columns}%`} />
        ))}
      </div>
    ))}
  </div>
)

export const StatsSkeleton: React.FC<{ count?: number }> = ({ count = 4 }) => (
  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${count}, 1fr)`, gap: '16px' }}>
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} style={{ padding: '20px', border: '1px solid #f0f0f0', borderRadius: '8px', textAlign: 'center' }}>
        <SkeletonLoader height={32} width="50%" style={{ margin: '0 auto 8px' }} />
        <SkeletonLoader height={16} width="70%" style={{ margin: '0 auto' }} />
      </div>
    ))}
  </div>
)

export const ChartSkeleton: React.FC = () => (
  <div style={{ height: '300px', border: '1px solid #f0f0f0', borderRadius: '8px', padding: '24px' }}>
    <SkeletonLoader height={24} width="30%" style={{ marginBottom: '24px' }} />
    <div style={{ height: '200px', display: 'flex', alignItems: 'end', gap: '8px' }}>
      {Array.from({ length: 12 }).map((_, i) => (
        <SkeletonLoader
          key={i}
          height={`${Math.random() * 150 + 50}px`}
          width="100%"
          style={{ flex: 1 }}
        />
      ))}
    </div>
  </div>
)
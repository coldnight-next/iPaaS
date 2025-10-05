import { useState, useEffect, useCallback } from 'react'
import { Button, message, Badge, Space, Typography, Tooltip, Card, Row, Col } from 'antd'
import {
  DownloadOutlined, ReloadOutlined, CheckCircleOutlined, CloseCircleOutlined,
  ApiOutlined, ShoppingOutlined, SyncOutlined
} from '@ant-design/icons'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

const { Text } = Typography

// Export Sync Logs Component
interface ExportSyncLogsProps {
  session: Session
  startDate?: Date
  endDate?: Date
}

export function ExportSyncLogs({ session, startDate, endDate }: ExportSyncLogsProps) {
  const [exporting, setExporting] = useState(false)

  const handleExport = async () => {
    if (!session) {
      message.error('Please sign in to export sync logs')
      return
    }

    setExporting(true)
    try {
      // Build query
      let query = supabase
        .from('sync_logs')
        .select('*')
        .eq('user_id', session.user.id)
        .order('started_at', { ascending: false })

      // Apply date filters if provided
      if (startDate) {
        query = query.gte('started_at', startDate.toISOString())
      }
      if (endDate) {
        query = query.lte('started_at', endDate.toISOString())
      }

      const { data: logs, error } = await query.limit(1000)

      if (error) throw error

      if (!logs || logs.length === 0) {
        message.warning('No sync logs found for the selected period')
        return
      }

      // Convert to CSV
      const headers = [
        'ID',
        'Sync Type',
        'Direction',
        'Status',
        'Items Processed',
        'Items Succeeded',
        'Items Failed',
        'Duration (sec)',
        'Started At',
        'Completed At',
        'Error Count'
      ]

      const csvRows = [
        headers.join(','),
        ...logs.map(log => [
          log.id,
          log.sync_type || '',
          log.direction || '',
          log.status || '',
          log.items_processed || 0,
          log.items_succeeded || 0,
          log.items_failed || 0,
          log.duration_seconds || 0,
          log.started_at || '',
          log.completed_at || '',
          (log.error_details || []).length
        ].map(field => `"${field}"`).join(','))
      ]

      const csvContent = csvRows.join('\n')
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `sync-logs-${new Date().toISOString().split('T')[0]}.csv`
      link.click()
      URL.revokeObjectURL(url)

      message.success(`Exported ${logs.length} sync log${logs.length > 1 ? 's' : ''}`)
    } catch (error) {
      console.error('Export error:', error)
      message.error('Failed to export sync logs')
    } finally {
      setExporting(false)
    }
  }

  return (
    <Button
      icon={<DownloadOutlined />}
      onClick={handleExport}
      loading={exporting}
    >
      Export CSV
    </Button>
  )
}

// Platform Connection Status Component
interface PlatformConnectionStatusProps {
  session: Session
}

interface ConnectionStatus {
  platform: string
  status: 'connected' | 'disconnected' | 'error'
  last_check: string | null
  shop_domain?: string
  account_id?: string
}

export function PlatformConnectionStatus({ session }: PlatformConnectionStatusProps) {
  const [connections, setConnections] = useState<ConnectionStatus[]>([])
  const [checking, setChecking] = useState(false)
  const [loading, setLoading] = useState(true)

  const loadConnections = useCallback(async () => {
    if (!session) return

    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('connections')
        .select('*')
        .eq('user_id', session.user.id)

      if (error) throw error

      const statuses: ConnectionStatus[] = [
        {
          platform: 'NetSuite',
          status: 'disconnected',
          last_check: null
        },
        {
          platform: 'Shopify',
          status: 'disconnected',
          last_check: null
        }
      ]

      data?.forEach(conn => {
        const index = conn.platform === 'netsuite' ? 0 : 1
        statuses[index] = {
          platform: conn.platform === 'netsuite' ? 'NetSuite' : 'Shopify',
          status: conn.status === 'connected' ? 'connected' : 'disconnected',
          last_check: conn.updated_at,
          shop_domain: conn.metadata?.shop_domain,
          account_id: conn.metadata?.account_id
        }
      })

      setConnections(statuses)
    } catch (error) {
      console.error('Error loading connections:', error)
    } finally {
      setLoading(false)
    }
  }, [session])

  useEffect(() => {
    loadConnections()
  }, [loadConnections])

  const handleCheck = async () => {
    setChecking(true)
    await loadConnections()
    message.success('Connection status refreshed')
    setChecking(false)
  }

  if (loading) {
    return <Card loading />
  }

  return (
    <Card
      title="Platform Connections"
      extra={
        <Button
          icon={<ReloadOutlined />}
          size="small"
          onClick={handleCheck}
          loading={checking}
        >
          Check
        </Button>
      }
      size="small"
    >
      <Space direction="vertical" style={{ width: '100%' }}>
        {connections.map((conn) => (
          <Row key={conn.platform} justify="space-between" align="middle">
            <Col>
              <Space>
                {conn.platform === 'NetSuite' ? <ApiOutlined /> : <ShoppingOutlined />}
                <Text strong>{conn.platform}</Text>
                {conn.shop_domain && (
                  <Text type="secondary" style={{ fontSize: '12px' }}>
                    ({conn.shop_domain})
                  </Text>
                )}
                {conn.account_id && (
                  <Text type="secondary" style={{ fontSize: '12px' }}>
                    ({conn.account_id})
                  </Text>
                )}
              </Space>
            </Col>
            <Col>
              <Tooltip
                title={
                  conn.last_check
                    ? `Last checked: ${new Date(conn.last_check).toLocaleString()}`
                    : 'Never checked'
                }
              >
                {conn.status === 'connected' ? (
                  <Badge status="success" text="Connected" />
                ) : conn.status === 'error' ? (
                  <Badge status="error" text="Error" />
                ) : (
                  <Badge status="default" text="Disconnected" />
                )}
              </Tooltip>
            </Col>
          </Row>
        ))}
      </Space>
    </Card>
  )
}

// Quick Retry Button for Failed Syncs
interface QuickRetryButtonProps {
  session: Session
  syncLogId: string
  onRetryComplete?: () => void
}

export function QuickRetryButton({ session, syncLogId, onRetryComplete }: QuickRetryButtonProps) {
  const [retrying, setRetrying] = useState(false)

  const handleRetry = async () => {
    if (!session) return

    setRetrying(true)
    try {
      // Get the failed sync log
      const { data: log, error: logError } = await supabase
        .from('sync_logs')
        .select('*')
        .eq('id', syncLogId)
        .single()

      if (logError) throw logError
      if (!log) throw new Error('Sync log not found')

      // Determine the sync endpoint based on sync_type
      const syncTypeMap: Record<string, string> = {
        'order_sync': 'sync-orders',
        'inventory_sync': 'sync-inventory',
        'product_sync': 'sync',
        'manual': 'sync',
        'scheduled': 'sync',
        'webhook': 'sync',
        'bulk': 'sync'
      }

      const endpoint = syncTypeMap[log.sync_type] || 'sync'
      const functionsBase = import.meta.env.VITE_SUPABASE_URL
        ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
        : 'http://localhost:54321/functions/v1'

      // Retry the sync with original parameters
      const response = await fetch(`${functionsBase}/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          // Pass metadata if it exists (contains original parameters)
          ...(log.metadata as Record<string, any> || {}),
          // Indicate this is a retry
          isRetry: true,
          originalSyncLogId: syncLogId
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Sync retry failed')
      }

      const result = await response.json()
      
      message.success(`Sync retry completed successfully! ${result.summary?.itemsSucceeded || 0} items synced.`)
      onRetryComplete?.()
    } catch (error) {
      console.error('Retry error:', error)
      message.error(error instanceof Error ? error.message : 'Failed to retry sync')
    } finally {
      setRetrying(false)
    }
  }

  return (
    <Button
      icon={<SyncOutlined />}
      size="small"
      onClick={handleRetry}
      loading={retrying}
      type="primary"
    >
      Retry
    </Button>
  )
}

// Basic Search Component
interface BasicSearchProps {
  placeholder?: string
  onSearch: (value: string) => void
}

export function BasicSearch({ placeholder = 'Search...', onSearch }: BasicSearchProps) {
  const [searchValue, setSearchValue] = useState('')

  useEffect(() => {
    const debounce = setTimeout(() => {
      onSearch(searchValue)
    }, 300)

    return () => clearTimeout(debounce)
  }, [searchValue, onSearch])

  return (
    <input
      type="text"
      placeholder={placeholder}
      value={searchValue}
      onChange={(e) => setSearchValue(e.target.value)}
      style={{
        padding: '8px 12px',
        border: '1px solid #d9d9d9',
        borderRadius: '4px',
        width: '300px',
        fontSize: '14px'
      }}
    />
  )
}

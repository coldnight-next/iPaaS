import { useState, useEffect, useMemo } from 'react'
import { Card, Table, Button, Space, Tag, Modal, Form, Input, Select, message, Drawer, Tabs, Statistic, Row, Col, Switch, Popconfirm, Badge, Typography, Tooltip, Alert, DatePicker } from 'antd'
import { SaveOutlined, SyncOutlined, DeleteOutlined, PlusOutlined, HistoryOutlined, FilterOutlined, ClockCircleOutlined, ThunderboltOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import EnhancedProductSearch from './EnhancedProductSearch'

const { Title, Text } = Typography
const { TabPane } = Tabs
const { TextArea } = Input

interface SavedPattern {
  id: string
  name: string
  description?: string
  filters: any
  sync_direction: string
  is_active: boolean
  created_at: string
}

interface SyncListItem {
  id: string
  netsuite_item_id?: string
  shopify_product_id?: string
  sku: string
  product_name: string
  sync_direction: string
  sync_mode: 'delta' | 'full'
  last_synced_at?: string
  last_sync_status?: string
  sync_count: number
  is_active: boolean
}

interface SyncHistory {
  id: string
  sync_type: string
  items_synced: number
  items_created: number
  items_updated: number
  items_failed: number
  status: string
  started_at: string
  completed_at?: string
  duration_seconds?: number
}

interface SyncSchedule {
  id: string
  name: string
  description?: string
  schedule_type: string
  cron_expression?: string
  interval_minutes?: number
  is_active: boolean
  last_run?: string
  next_run?: string
  sync_direction: string
  target_filters: any
  created_at: string
}

const configuredFunctionsBase = import.meta.env.VITE_FUNCTIONS_BASE_URL as string | undefined
const inferredFunctionsBase = import.meta.env.VITE_SUPABASE_URL
  ? `${(import.meta.env.VITE_SUPABASE_URL as string).replace(/\/$/, '')}/functions/v1`
  : undefined
const FUNCTIONS_BASE = configuredFunctionsBase || inferredFunctionsBase || 'http://localhost:54321/functions/v1'

export default function SyncManagement() {
  const { session } = useAuth()
  const [savedPatterns, setSavedPatterns] = useState<SavedPattern[]>([])
  const [syncList, setSyncList] = useState<SyncListItem[]>([])
  const [syncHistory, setSyncHistory] = useState<SyncHistory[]>([])
  const [loading, setLoading] = useState(false)
  const [savePatternModalVisible, setSavePatternModalVisible] = useState(false)
  const [currentFilters, setCurrentFilters] = useState<any>({})
  const [populatingPattern, setPopulatingPattern] = useState<string | null>(null)
  const [savingPattern, setSavingPattern] = useState(false)
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([])
  const [bulkSyncLoading, setBulkSyncLoading] = useState(false)
  const [syncSchedules, setSyncSchedules] = useState<SyncSchedule[]>([])
  const [scheduleModalVisible, setScheduleModalVisible] = useState(false)
  const [addItemModalVisible, setAddItemModalVisible] = useState(false)
  const [addingItem, setAddingItem] = useState(false)
  const [form] = Form.useForm()
  const [scheduleForm] = Form.useForm()
  const [addItemForm] = Form.useForm()

  // Advanced filtering state
  const [patternsFilters, setPatternsFilters] = useState({
    status: 'all',
    direction: 'all',
    search: ''
  })
  const [syncListFilters, setSyncListFilters] = useState({
    status: 'all',
    direction: 'all',
    mode: 'all',
    search: ''
  })
  const [historyFilters, setHistoryFilters] = useState({
    status: 'all',
    type: 'all',
    dateRange: null as [dayjs.Dayjs, dayjs.Dayjs] | null,
    search: ''
  })
  const [scheduleFilters, setScheduleFilters] = useState({
    status: 'all',
    direction: 'all',
    search: ''
  })

  // NetSuite entity filters state
  const [netsuiteEntities, setNetsuiteEntities] = useState({
    subsidiaries: [] as Array<{ internalId: string; name: string }>,
    divisions: [] as Array<{ internalId: string; name: string }>,
    brands: [] as Array<{ internalId: string; name: string }>,
    productGroups: [] as Array<{ internalId: string; name: string }>
  })
  const [loadingEntities, setLoadingEntities] = useState(false)
  const [selectedEntities, setSelectedEntities] = useState({
    subsidiary: '',
    division: '',
    brand: '',
    productGroup: ''
  })

  // Filtered data
  const filteredPatterns = useMemo(() => {
    return savedPatterns.filter(pattern => {
      if (patternsFilters.status !== 'all' && (patternsFilters.status === 'active' ? !pattern.is_active : pattern.is_active)) return false
      if (patternsFilters.direction !== 'all' && pattern.sync_direction !== patternsFilters.direction) return false
      if (patternsFilters.search) {
        const searchLower = patternsFilters.search.toLowerCase()
        const searchableText = [pattern.name, pattern.description, pattern.sync_direction].join(' ').toLowerCase()
        if (!searchableText.includes(searchLower)) return false
      }
      return true
    })
  }, [savedPatterns, patternsFilters])

  const filteredSyncList = useMemo(() => {
    return syncList.filter(item => {
      if (syncListFilters.status !== 'all' && item.last_sync_status !== syncListFilters.status) return false
      if (syncListFilters.direction !== 'all' && item.sync_direction !== syncListFilters.direction) return false
      if (syncListFilters.mode !== 'all' && item.sync_mode !== syncListFilters.mode) return false
      if (syncListFilters.search) {
        const searchLower = syncListFilters.search.toLowerCase()
        const searchableText = [item.sku, item.product_name, item.sync_direction, item.sync_mode].join(' ').toLowerCase()
        if (!searchableText.includes(searchLower)) return false
      }
      return true
    })
  }, [syncList, syncListFilters])

  const filteredHistory = useMemo(() => {
    return syncHistory.filter(item => {
      if (historyFilters.status !== 'all' && item.status !== historyFilters.status) return false
      if (historyFilters.type !== 'all' && item.sync_type !== historyFilters.type) return false
      if (historyFilters.dateRange) {
        const itemDate = dayjs(item.started_at)
        if (itemDate.isBefore(historyFilters.dateRange[0]) || itemDate.isAfter(historyFilters.dateRange[1])) return false
      }
      if (historyFilters.search) {
        const searchLower = historyFilters.search.toLowerCase()
        const searchableText = [item.sync_type, item.status, item.started_at].join(' ').toLowerCase()
        if (!searchableText.includes(searchLower)) return false
      }
      return true
    })
  }, [syncHistory, historyFilters])

  const filteredSchedules = useMemo(() => {
    return syncSchedules.filter(schedule => {
      if (scheduleFilters.status !== 'all' && (scheduleFilters.status === 'active' ? !schedule.is_active : schedule.is_active)) return false
      if (scheduleFilters.direction !== 'all' && schedule.sync_direction !== scheduleFilters.direction) return false
      if (scheduleFilters.search) {
        const searchLower = scheduleFilters.search.toLowerCase()
        const searchableText = [schedule.name, schedule.description, schedule.sync_direction].join(' ').toLowerCase()
        if (!searchableText.includes(searchLower)) return false
      }
      return true
    })
  }, [syncSchedules, scheduleFilters])

  useEffect(() => {
    if (session) {
      loadSavedPatterns()
      loadSyncList()
      loadSyncHistory()
      loadSyncSchedules()
    }
  }, [session])

  const loadSavedPatterns = async () => {
    try {
      const { data, error } = await supabase
        .from('saved_search_patterns')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setSavedPatterns(data || [])
    } catch (error) {
      console.error('Error loading patterns:', error)
    }
  }

  const loadSyncList = async () => {
    try {
      const { data, error } = await supabase
        .from('sync_list')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setSyncList(data || [])
    } catch (error) {
      console.error('Error loading sync list:', error)
    }
  }

  const loadSyncHistory = async () => {
    try {
      const { data, error } = await supabase
        .from('sync_logs')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(20)

      if (error) throw error
      // Transform sync_logs to match expected format
      const transformedData = (data || []).map(log => ({
        id: log.id,
        sync_type: log.sync_type,
        items_synced: log.items_processed || 0,
        items_created: log.items_succeeded || 0,
        items_updated: 0, // Not tracked separately in our schema
        items_failed: log.items_failed || 0,
        status: log.status,
        started_at: log.started_at,
        completed_at: log.completed_at,
        duration_seconds: log.duration_seconds
      }))
      setSyncHistory(transformedData)
    } catch (error) {
      console.error('Error loading sync history:', error)
    }
  }

  const loadSyncSchedules = async () => {
    try {
      const { data, error } = await supabase
        .from('sync_schedules')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setSyncSchedules(data || [])
    } catch (error) {
      console.error('Error loading sync schedules:', error)
    }
  }

  const loadNetsuiteEntities = async () => {
    if (!session) return

    setLoadingEntities(true)
    try {
      const entityTypes = ['subsidiaries', 'divisions', 'brands', 'productGroups']
      const results = await Promise.allSettled(
        entityTypes.map(async (entityType) => {
          const response = await fetch(`${FUNCTIONS_BASE}/get-netsuite-entities?entityType=${entityType}`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`
            }
          })

          if (!response.ok) {
            const errorData = await response.json()
            throw new Error(errorData.message || `Failed to load ${entityType}`)
          }

          const data = await response.json()
          return { entityType, entities: data.entities || [] }
        })
      )

      const newEntities = {
        subsidiaries: [] as Array<{ internalId: string; name: string }>,
        divisions: [] as Array<{ internalId: string; name: string }>,
        brands: [] as Array<{ internalId: string; name: string }>,
        productGroups: [] as Array<{ internalId: string; name: string }>
      }

      results.forEach((result) => {
        if (result.status === 'fulfilled') {
          const { entityType, entities } = result.value
          newEntities[entityType as keyof typeof newEntities] = entities
        } else {
          console.error(`Failed to load ${result.reason}`)
          message.warning(`Failed to load some NetSuite entities: ${result.reason}`)
        }
      })

      setNetsuiteEntities(newEntities)
      message.success('NetSuite entities loaded successfully!')
    } catch (error: any) {
      console.error('Error loading NetSuite entities:', error)
      message.error('Failed to load NetSuite entities: ' + error.message)
    } finally {
      setLoadingEntities(false)
    }
  }

  const savePattern = async () => {
    setSavingPattern(true)
    try {
      console.log('Starting pattern save...')
      console.log('Session:', session)
      console.log('User ID:', session?.user?.id)
      
      const values = await form.validateFields()
      console.log('Form values:', values)
      
      const insertData = {
        user_id: session?.user.id,
        ...values,
        filters: currentFilters
      }
      console.log('Data to insert:', insertData)
      
      const { data, error } = await supabase
        .from('saved_search_patterns')
        .insert([insertData])
        .select()

      console.log('Insert result:', { data, error })
      console.log('Error details:', error ? JSON.stringify(error, null, 2) : 'No error')
      
      if (error) throw error
      
      message.success('Search pattern saved!')
      setSavePatternModalVisible(false)
      form.resetFields()
      await loadSavedPatterns()
    } catch (error: any) {
      console.error('Error saving pattern:', error)
      console.error('Error type:', typeof error)
      console.error('Error keys:', error ? Object.keys(error) : 'null')
      console.error('Error message:', error?.message)
      console.error('Error code:', error?.code)
      console.error('Error details:', error?.details)
      console.error('Error hint:', error?.hint)
      console.error('Full error JSON:', JSON.stringify(error, null, 2))
      
      // Better error handling
      if (error.errorFields) {
        // Validation error
        message.error('Please fill in all required fields')
      } else if (error.code === '23505') {
        // Unique constraint violation
        message.error('A pattern with this name already exists')
      } else if (error.message) {
        message.error('Failed to save pattern: ' + error.message)
      } else {
        message.error('Failed to save pattern. Check console for details.')
      }
    } finally {
      setSavingPattern(false)
    }
  }

  const populateSyncListFromPattern = async (patternId: string, clearExisting: boolean = false) => {
    if (!session) {
      message.error('Please log in to populate sync list')
      return
    }

    setPopulatingPattern(patternId)
    try {
      const response = await fetch(`${FUNCTIONS_BASE}/populate-sync-list`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          patternId,
          clearExisting
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to populate sync list')
      }

      const result = await response.json()
      message.success(
        `Sync list populated! ${result.stats.inserted} new, ${result.stats.updated} updated, ${result.stats.failed} failed`
      )
      
      // Refresh the sync list and patterns
      await Promise.all([
        loadSyncList(),
        loadSavedPatterns()
      ])
    } catch (error: any) {
      console.error('Error populating sync list:', error)
      message.error(error.message || 'Failed to populate sync list')
    } finally {
      setPopulatingPattern(null)
    }
  }

  const deletePattern = async (id: string) => {
    try {
      const { error } = await supabase
        .from('saved_search_patterns')
        .delete()
        .eq('id', id)

      if (error) throw error
      message.success('Pattern deleted')
      loadSavedPatterns()
    } catch (error: any) {
      message.error('Failed to delete: ' + error.message)
    }
  }

  const addToSyncList = async (product: any, direction: string) => {
    try {
      const { data, error} = await supabase
        .from('sync_list')
        .insert([{
          user_id: session?.user.id,
          netsuite_item_id: product.platform === 'netsuite' ? product.id : null,
          shopify_product_id: product.platform === 'shopify' ? product.id : null,
          sku: product.sku,
          product_name: product.name,
          sync_direction: direction,
          sync_mode: 'delta',
          is_active: true
        }])

      if (error) throw error
      message.success(`${product.name} added to sync list!`)
      loadSyncList()
    } catch (error: any) {
      message.error('Failed to add: ' + error.message)
    }
  }

  const removeFromSyncList = async (id: string) => {
    try {
      const { error } = await supabase
        .from('sync_list')
        .delete()
        .eq('id', id)

      if (error) throw error
      message.success('Removed from sync list')
      loadSyncList()
    } catch (error: any) {
      message.error('Failed to remove: ' + error.message)
    }
  }

  const toggleSyncMode = async (id: string, currentMode: string) => {
    const newMode = currentMode === 'delta' ? 'full' : 'delta'
    try {
      const { error } = await supabase
        .from('sync_list')
        .update({ sync_mode: newMode })
        .eq('id', id)

      if (error) throw error
      message.success(`Sync mode changed to ${newMode}`)
      loadSyncList()
    } catch (error: any) {
      message.error('Failed to update: ' + error.message)
    }
  }

  const bulkSyncSelected = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('Please select items to sync')
      return
    }

    setBulkSyncLoading(true)
    try {
      // Get selected items
      const selectedItems = syncList.filter(item => selectedRowKeys.includes(item.id))

      // Group by sync direction for efficient processing
      const directionGroups = selectedItems.reduce((acc, item) => {
        const direction = item.sync_direction
        if (!acc[direction]) acc[direction] = []
        acc[direction].push(item)
        return acc
      }, {} as Record<string, SyncListItem[]>)

      let totalProcessed = 0
      let totalSucceeded = 0
      let totalFailed = 0

      // Process each direction group
      for (const [direction, items] of Object.entries(directionGroups)) {
        try {
          const response = await fetch(`${FUNCTIONS_BASE}/sync`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session?.access_token}`
            },
            body: JSON.stringify({
              profile: {
                dataTypes: { products: true, inventory: true, orders: true },
                syncDirection: direction,
                filters: {}
              }
            })
          })

          if (!response.ok) {
            const errorData = await response.json()
            throw new Error(errorData.error || 'Sync failed')
          }

          const result = await response.json()
          totalProcessed += result.itemsProcessed
          totalSucceeded += result.itemsSucceeded
          totalFailed += result.itemsFailed

          // Update sync status for processed items
          for (const item of items) {
            await supabase
              .from('sync_list')
              .update({
                last_synced_at: new Date().toISOString(),
                last_sync_status: 'success',
                sync_count: (item.sync_count || 0) + 1
              })
              .eq('id', item.id)
          }

        } catch (error: any) {
          console.error(`Bulk sync failed for ${direction}:`, error)
          totalFailed += items.length

          // Mark failed items
          for (const item of items) {
            await supabase
              .from('sync_list')
              .update({
                last_sync_status: 'failed'
              })
              .eq('id', item.id)
          }
        }
      }

      message.success(
        `Bulk sync completed! ${totalSucceeded} succeeded, ${totalFailed} failed`
      )

      // Refresh data
      await Promise.all([loadSyncList(), loadSyncHistory()])

    } catch (error: any) {
      console.error('Bulk sync error:', error)
      message.error('Bulk sync failed: ' + error.message)
    } finally {
      setBulkSyncLoading(false)
      setSelectedRowKeys([])
    }
  }

  const bulkRemoveSelected = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('Please select items to remove')
      return
    }

    try {
      const { error } = await supabase
        .from('sync_list')
        .delete()
        .in('id', selectedRowKeys)

      if (error) throw error

      message.success(`${selectedRowKeys.length} items removed from sync list`)
      setSelectedRowKeys([])
      loadSyncList()
    } catch (error: any) {
      message.error('Failed to remove items: ' + error.message)
    }
  }

  const createSyncSchedule = async () => {
    try {
      const values = await scheduleForm.validateFields()
      const { data, error } = await supabase
        .from('sync_schedules')
        .insert([{
          user_id: session?.user.id,
          ...values,
          is_active: true
        }])
        .select()

      if (error) throw error

      message.success('Sync schedule created!')
      setScheduleModalVisible(false)
      scheduleForm.resetFields()
      loadSyncSchedules()
    } catch (error: any) {
      message.error('Failed to create schedule: ' + error.message)
    }
  }

  const toggleScheduleStatus = async (id: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('sync_schedules')
        .update({ is_active: !currentStatus })
        .eq('id', id)

      if (error) throw error

      message.success(`Schedule ${!currentStatus ? 'enabled' : 'disabled'}`)
      loadSyncSchedules()
    } catch (error: any) {
      message.error('Failed to update schedule: ' + error.message)
    }
  }

  const deleteSchedule = async (id: string) => {
    try {
      const { error } = await supabase
        .from('sync_schedules')
        .delete()
        .eq('id', id)

      if (error) throw error

      message.success('Schedule deleted')
      loadSyncSchedules()
    } catch (error: any) {
      message.error('Failed to delete schedule: ' + error.message)
    }
  }

  const addItemToSyncList = async () => {
    setAddingItem(true)
    try {
      const values = await addItemForm.validateFields()

      const response = await fetch(`${FUNCTIONS_BASE}/add-item-to-sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`
        },
        body: JSON.stringify(values)
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to add item')
      }

      const result = await response.json()
      message.success(result.message)
      setAddItemModalVisible(false)
      addItemForm.resetFields()
      loadSyncList()
    } catch (error: any) {
      console.error('Error adding item to sync list:', error)
      message.error(error.message || 'Failed to add item to sync list')
    } finally {
      setAddingItem(false)
    }
  }

  const patternsColumns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: any) => (
        <Space direction="vertical" size={0}>
          <Text strong>{name}</Text>
          {record.netsuite_saved_search_id && (
            <Text type="secondary" style={{ fontSize: '12px' }}>
              NetSuite Search: {record.netsuite_saved_search_id}
            </Text>
          )}
        </Space>
      )
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
    },
    {
      title: 'Direction',
      dataIndex: 'sync_direction',
      key: 'sync_direction',
      render: (dir: string) => {
        const config: any = {
          'netsuite-to-shopify': { color: 'blue', text: 'NS → Shopify' },
          'shopify-to-netsuite': { color: 'green', text: 'Shopify → NS' },
          'bidirectional': { color: 'purple', text: 'Bidirectional' }
        }
        return <Tag color={config[dir]?.color}>{config[dir]?.text}</Tag>
      }
    },
    {
      title: 'Last Populated',
      dataIndex: 'last_populated_at',
      key: 'last_populated_at',
      render: (date: string) => date ? new Date(date).toLocaleString() : 'Never'
    },
    {
      title: 'Status',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (active: boolean) => (
        <Tag color={active ? 'green' : 'red'}>{active ? 'Active' : 'Inactive'}</Tag>
      )
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: SavedPattern) => (
        <Space wrap>
          <Tooltip title="Populate sync list from this pattern">
            <Button 
              size="small" 
              type="primary"
              icon={<ThunderboltOutlined />}
              onClick={() => populateSyncListFromPattern(record.id, false)}
              loading={populatingPattern === record.id}
            >
              Populate
            </Button>
          </Tooltip>
          <Tooltip title="Clear existing and populate fresh">
            <Button 
              size="small" 
              icon={<ReloadOutlined />}
              onClick={() => {
                Modal.confirm({
                  title: 'Replace sync list?',
                  content: 'This will clear all existing items and populate fresh from this pattern.',
                  onOk: () => populateSyncListFromPattern(record.id, true)
                })
              }}
              loading={populatingPattern === record.id}
            >
              Replace All
            </Button>
          </Tooltip>
          <Button size="small" icon={<FilterOutlined />}>View Filters</Button>
          <Popconfirm title="Delete this pattern?" onConfirm={() => deletePattern(record.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )
    }
  ]

  const syncListColumns = [
    {
      title: 'SKU',
      dataIndex: 'sku',
      key: 'sku',
    },
    {
      title: 'Product',
      dataIndex: 'product_name',
      key: 'product_name',
    },
    {
      title: 'Direction',
      dataIndex: 'sync_direction',
      key: 'sync_direction',
      render: (dir: string) => <Tag>{dir}</Tag>
    },
    {
      title: 'Mode',
      dataIndex: 'sync_mode',
      key: 'sync_mode',
      render: (mode: string, record: SyncListItem) => (
        <Space>
          <Switch
            checked={mode === 'delta'}
            onChange={() => toggleSyncMode(record.id, mode)}
            checkedChildren="Delta"
            unCheckedChildren="Full"
          />
        </Space>
      )
    },
    {
      title: 'Last Sync',
      dataIndex: 'last_synced_at',
      key: 'last_synced_at',
      render: (date: string) => date ? new Date(date).toLocaleString() : 'Never'
    },
    {
      title: 'Status',
      dataIndex: 'last_sync_status',
      key: 'last_sync_status',
      render: (status?: string) => {
        const colors: any = { success: 'green', failed: 'red', pending: 'orange' }
        return status ? <Tag color={colors[status]}>{status}</Tag> : <Tag>Pending</Tag>
      }
    },
    {
      title: 'Sync Count',
      dataIndex: 'sync_count',
      key: 'sync_count',
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: SyncListItem) => (
        <Space>
          <Button size="small" type="primary" icon={<SyncOutlined />}>Sync Now</Button>
          <Popconfirm title="Remove from sync list?" onConfirm={() => removeFromSyncList(record.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )
    }
  ]

  const historyColumns = [
    {
      title: 'Type',
      dataIndex: 'sync_type',
      key: 'sync_type',
      render: (type: string) => <Tag>{type}</Tag>
    },
    {
      title: 'Items',
      dataIndex: 'items_synced',
      key: 'items_synced',
    },
    {
      title: 'Created',
      dataIndex: 'items_created',
      key: 'items_created',
      render: (count: number) => <Text type="success">{count}</Text>
    },
    {
      title: 'Updated',
      dataIndex: 'items_updated',
      key: 'items_updated',
      render: (count: number) => <Text type="warning">{count}</Text>
    },
    {
      title: 'Failed',
      dataIndex: 'items_failed',
      key: 'items_failed',
      render: (count: number) => <Text type="danger">{count}</Text>
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const colors: any = { success: 'green', partial: 'orange', failed: 'red' }
        return <Tag color={colors[status]}>{status}</Tag>
      }
    },
    {
      title: 'Started',
      dataIndex: 'started_at',
      key: 'started_at',
      render: (date: string) => new Date(date).toLocaleString()
    },
    {
      title: 'Duration',
      dataIndex: 'duration_seconds',
      key: 'duration_seconds',
      render: (seconds?: number) => seconds ? `${seconds}s` : 'N/A'
    }
  ]

  const scheduleColumns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: SyncSchedule) => (
        <Space direction="vertical" size={0}>
          <Text strong>{name}</Text>
          {record.description && (
            <Text type="secondary" style={{ fontSize: '12px' }}>
              {record.description}
            </Text>
          )}
        </Space>
      )
    },
    {
      title: 'Schedule',
      dataIndex: 'schedule_type',
      key: 'schedule_type',
      render: (type: string, record: SyncSchedule) => {
        if (type === 'interval') {
          return <Text>Every {record.interval_minutes} minutes</Text>
        } else if (type === 'cron') {
          return <Text>Cron: {record.cron_expression}</Text>
        }
        return <Text>Manual</Text>
      }
    },
    {
      title: 'Direction',
      dataIndex: 'sync_direction',
      key: 'sync_direction',
      render: (dir: string) => <Tag>{dir}</Tag>
    },
    {
      title: 'Last Run',
      dataIndex: 'last_run',
      key: 'last_run',
      render: (date?: string) => date ? new Date(date).toLocaleString() : 'Never'
    },
    {
      title: 'Next Run',
      dataIndex: 'next_run',
      key: 'next_run',
      render: (date?: string) => date ? new Date(date).toLocaleString() : 'N/A'
    },
    {
      title: 'Status',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (active: boolean, record: SyncSchedule) => (
        <Switch
          checked={active}
          onChange={() => toggleScheduleStatus(record.id, active)}
          checkedChildren="Active"
          unCheckedChildren="Inactive"
        />
      )
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: SyncSchedule) => (
        <Space>
          <Button size="small" type="primary" icon={<SyncOutlined />}>Run Now</Button>
          <Popconfirm title="Delete this schedule?" onConfirm={() => deleteSchedule(record.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )
    }
  ]

  return (
    <div style={{ padding: '24px' }}>
      <Card>
        <Title level={3}>Sync Management</Title>
        
        <Tabs defaultActiveKey="patterns">
          <TabPane tab={<span><FilterOutlined /> Saved Patterns</span>} key="patterns">
            <Alert
              message="Saved Search Patterns"
              description={
                <span>
                  Saved patterns can store filter criteria or NetSuite saved search IDs. 
                  Click <strong>Populate</strong> to add matching items to your sync list, or <strong>Replace All</strong> to clear and refresh your entire sync list.
                </span>
              }
              type="info"
              showIcon
              closable
              style={{ marginBottom: 16 }}
            />
            <Space style={{ marginBottom: 16 }}>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setSavePatternModalVisible(true)}
              >
                Create New Pattern
              </Button>
            </Space>

            {/* Advanced Filters for Patterns */}
            <Card style={{ marginBottom: 16 }}>
              <Space wrap>
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px' }}>
                    Status
                  </label>
                  <Select
                    value={patternsFilters.status}
                    onChange={(value) => setPatternsFilters(prev => ({ ...prev, status: value }))}
                    style={{ width: '120px' }}
                    size="small"
                  >
                    <Select.Option value="all">All Status</Select.Option>
                    <Select.Option value="active">Active</Select.Option>
                    <Select.Option value="inactive">Inactive</Select.Option>
                  </Select>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px' }}>
                    Direction
                  </label>
                  <Select
                    value={patternsFilters.direction}
                    onChange={(value) => setPatternsFilters(prev => ({ ...prev, direction: value }))}
                    style={{ width: '140px' }}
                    size="small"
                  >
                    <Select.Option value="all">All Directions</Select.Option>
                    <Select.Option value="netsuite-to-shopify">NS → Shopify</Select.Option>
                    <Select.Option value="shopify-to-netsuite">Shopify → NS</Select.Option>
                    <Select.Option value="bidirectional">Bidirectional</Select.Option>
                  </Select>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px' }}>
                    Search
                  </label>
                  <Input
                    placeholder="Search patterns..."
                    value={patternsFilters.search}
                    onChange={(e) => setPatternsFilters(prev => ({ ...prev, search: e.target.value }))}
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
                    onClick={() => setPatternsFilters({ status: 'all', direction: 'all', search: '' })}
                    size="small"
                  >
                    Clear
                  </Button>
                </div>
              </Space>
            </Card>

            <Table
              columns={patternsColumns}
              dataSource={filteredPatterns}
              rowKey="id"
              pagination={{ pageSize: 10 }}
            />
          </TabPane>

          <TabPane tab={<span><SyncOutlined /> Sync List ({syncList.length})</span>} key="synclist">
            {/* NetSuite Connection Test */}
            <Card style={{ marginBottom: 16 }}>
              <Title level={4} style={{ marginBottom: 16 }}>NetSuite Connection Test</Title>
              <Alert
                message="Test NetSuite Connection"
                description="Load NetSuite entities (divisions, subsidiaries, brands, product groups) to verify your connection is working properly."
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
              />
              <Space>
                <Button
                  type="primary"
                  icon={<ReloadOutlined />}
                  onClick={loadNetsuiteEntities}
                  loading={loadingEntities}
                >
                  Load NetSuite Entities
                </Button>
                {Object.values(netsuiteEntities).some(arr => arr.length > 0) && (
                  <Button
                    onClick={() => {
                      setNetsuiteEntities({
                        subsidiaries: [],
                        divisions: [],
                        brands: [],
                        productGroups: []
                      })
                      setSelectedEntities({
                        subsidiary: '',
                        division: '',
                        brand: '',
                        productGroup: ''
                      })
                    }}
                  >
                    Clear
                  </Button>
                )}
              </Space>

              {/* Entity Dropdowns */}
              {(netsuiteEntities.subsidiaries.length > 0 ||
                netsuiteEntities.divisions.length > 0 ||
                netsuiteEntities.brands.length > 0 ||
                netsuiteEntities.productGroups.length > 0) && (
                <div style={{ marginTop: 16 }}>
                  <Row gutter={16}>
                    <Col span={6}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: 'bold' }}>
                          Subsidiary ({netsuiteEntities.subsidiaries.length})
                        </label>
                        <Select
                          placeholder="Select subsidiary"
                          value={selectedEntities.subsidiary}
                          onChange={(value) => setSelectedEntities(prev => ({ ...prev, subsidiary: value }))}
                          style={{ width: '100%' }}
                          size="small"
                          allowClear
                        >
                          {netsuiteEntities.subsidiaries.map(entity => (
                            <Select.Option key={entity.internalId} value={entity.internalId}>
                              {entity.name}
                            </Select.Option>
                          ))}
                        </Select>
                      </div>
                    </Col>
                    <Col span={6}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: 'bold' }}>
                          Division ({netsuiteEntities.divisions.length})
                        </label>
                        <Select
                          placeholder="Select division"
                          value={selectedEntities.division}
                          onChange={(value) => setSelectedEntities(prev => ({ ...prev, division: value }))}
                          style={{ width: '100%' }}
                          size="small"
                          allowClear
                        >
                          {netsuiteEntities.divisions.map(entity => (
                            <Select.Option key={entity.internalId} value={entity.internalId}>
                              {entity.name}
                            </Select.Option>
                          ))}
                        </Select>
                      </div>
                    </Col>
                    <Col span={6}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: 'bold' }}>
                          Brand ({netsuiteEntities.brands.length})
                        </label>
                        <Select
                          placeholder="Select brand"
                          value={selectedEntities.brand}
                          onChange={(value) => setSelectedEntities(prev => ({ ...prev, brand: value }))}
                          style={{ width: '100%' }}
                          size="small"
                          allowClear
                        >
                          {netsuiteEntities.brands.map(entity => (
                            <Select.Option key={entity.internalId} value={entity.internalId}>
                              {entity.name}
                            </Select.Option>
                          ))}
                        </Select>
                      </div>
                    </Col>
                    <Col span={6}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: 'bold' }}>
                          Product Group ({netsuiteEntities.productGroups.length})
                        </label>
                        <Select
                          placeholder="Select product group"
                          value={selectedEntities.productGroup}
                          onChange={(value) => setSelectedEntities(prev => ({ ...prev, productGroup: value }))}
                          style={{ width: '100%' }}
                          size="small"
                          allowClear
                        >
                          {netsuiteEntities.productGroups.map(entity => (
                            <Select.Option key={entity.internalId} value={entity.internalId}>
                              {entity.name}
                            </Select.Option>
                          ))}
                        </Select>
                      </div>
                    </Col>
                  </Row>
                </div>
              )}
            </Card>

            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col span={6}>
                <Card>
                  <Statistic title="Total Items" value={syncList.length} />
                </Card>
              </Col>
              <Col span={6}>
                <Card>
                  <Statistic
                    title="Active"
                    value={syncList.filter(i => i.is_active).length}
                    valueStyle={{ color: '#3f8600' }}
                  />
                </Card>
              </Col>
              <Col span={6}>
                <Card>
                  <Statistic
                    title="Delta Mode"
                    value={syncList.filter(i => i.sync_mode === 'delta').length}
                  />
                </Card>
              </Col>
              <Col span={6}>
                <Card>
                  <Statistic
                    title="Full Sync Mode"
                    value={syncList.filter(i => i.sync_mode === 'full').length}
                  />
                </Card>
              </Col>
            </Row>
            {/* Enhanced Product Search */}
            <Card style={{ marginBottom: 16 }}>
              <EnhancedProductSearch
                placeholder="Search products to add to sync list..."
                onProductSelect={(product) => {
                  // Add selected product to sync list
                  addToSyncList({
                    id: product.platform_product_id,
                    name: product.name,
                    sku: product.sku,
                    platform: product.platform
                  }, 'netsuite_to_shopify') // Default direction
                }}
                showFilters={true}
                showHistory={true}
                maxResults={20}
                enableFuzzyMatching={true}
              />
            </Card>

            <Space style={{ marginBottom: 16 }}>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setAddItemModalVisible(true)}
              >
                Add Item by ID
              </Button>
              <Button
                type="primary"
                icon={<SyncOutlined />}
                onClick={bulkSyncSelected}
                loading={bulkSyncLoading}
                disabled={selectedRowKeys.length === 0}
              >
                Sync Selected ({selectedRowKeys.length})
              </Button>
              <Button
                danger
                icon={<DeleteOutlined />}
                onClick={bulkRemoveSelected}
                disabled={selectedRowKeys.length === 0}
              >
                Remove Selected ({selectedRowKeys.length})
              </Button>
              {selectedRowKeys.length > 0 && (
                <Button onClick={() => setSelectedRowKeys([])}>
                  Clear Selection
                </Button>
              )}
            </Space>

            {/* Advanced Filters for Sync List */}
            <Card style={{ marginBottom: 16 }}>
              <Space wrap>
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px' }}>
                    Status
                  </label>
                  <Select
                    value={syncListFilters.status}
                    onChange={(value) => setSyncListFilters(prev => ({ ...prev, status: value }))}
                    style={{ width: '120px' }}
                    size="small"
                  >
                    <Select.Option value="all">All Status</Select.Option>
                    <Select.Option value="success">Success</Select.Option>
                    <Select.Option value="failed">Failed</Select.Option>
                    <Select.Option value="pending">Pending</Select.Option>
                  </Select>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px' }}>
                    Direction
                  </label>
                  <Select
                    value={syncListFilters.direction}
                    onChange={(value) => setSyncListFilters(prev => ({ ...prev, direction: value }))}
                    style={{ width: '140px' }}
                    size="small"
                  >
                    <Select.Option value="all">All Directions</Select.Option>
                    <Select.Option value="netsuite_to_shopify">NS → Shopify</Select.Option>
                    <Select.Option value="shopify_to_netsuite">Shopify → NS</Select.Option>
                    <Select.Option value="bidirectional">Bidirectional</Select.Option>
                  </Select>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px' }}>
                    Mode
                  </label>
                  <Select
                    value={syncListFilters.mode}
                    onChange={(value) => setSyncListFilters(prev => ({ ...prev, mode: value }))}
                    style={{ width: '120px' }}
                    size="small"
                  >
                    <Select.Option value="all">All Modes</Select.Option>
                    <Select.Option value="delta">Delta</Select.Option>
                    <Select.Option value="full">Full</Select.Option>
                  </Select>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px' }}>
                    Search
                  </label>
                  <Input
                    placeholder="Search SKU, product..."
                    value={syncListFilters.search}
                    onChange={(e) => setSyncListFilters(prev => ({ ...prev, search: e.target.value }))}
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
                    onClick={() => setSyncListFilters({ status: 'all', direction: 'all', mode: 'all', search: '' })}
                    size="small"
                  >
                    Clear
                  </Button>
                </div>
              </Space>
            </Card>
            <Table
              rowSelection={{
                selectedRowKeys,
                onChange: setSelectedRowKeys,
                selections: [
                  Table.SELECTION_ALL,
                  Table.SELECTION_INVERT,
                  Table.SELECTION_NONE,
                ],
              }}
              columns={syncListColumns}
              dataSource={filteredSyncList}
              rowKey="id"
              pagination={{ pageSize: 20 }}
            />
          </TabPane>

          <TabPane tab={<span><HistoryOutlined /> History</span>} key="history">
            {/* Advanced Filters for History */}
            <Card style={{ marginBottom: 16 }}>
              <Space wrap>
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px' }}>
                    Status
                  </label>
                  <Select
                    value={historyFilters.status}
                    onChange={(value) => setHistoryFilters(prev => ({ ...prev, status: value }))}
                    style={{ width: '120px' }}
                    size="small"
                  >
                    <Select.Option value="all">All Status</Select.Option>
                    <Select.Option value="completed">Completed</Select.Option>
                    <Select.Option value="partial_success">Partial Success</Select.Option>
                    <Select.Option value="failed">Failed</Select.Option>
                  </Select>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px' }}>
                    Type
                  </label>
                  <Select
                    value={historyFilters.type}
                    onChange={(value) => setHistoryFilters(prev => ({ ...prev, type: value }))}
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
                    Date Range
                  </label>
                  <DatePicker.RangePicker
                    value={historyFilters.dateRange}
                    onChange={(dates) => setHistoryFilters(prev => ({ ...prev, dateRange: dates }))}
                    size="small"
                    style={{ width: '240px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px' }}>
                    Search
                  </label>
                  <Input
                    placeholder="Search history..."
                    value={historyFilters.search}
                    onChange={(e) => setHistoryFilters(prev => ({ ...prev, search: e.target.value }))}
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
                    onClick={() => setHistoryFilters({ status: 'all', type: 'all', dateRange: null, search: '' })}
                    size="small"
                  >
                    Clear
                  </Button>
                </div>
              </Space>
            </Card>

            <Table
              columns={historyColumns}
              dataSource={filteredHistory}
              rowKey="id"
              pagination={{ pageSize: 20 }}
            />
          </TabPane>

          <TabPane tab={<span><ClockCircleOutlined /> Schedules ({syncSchedules.length})</span>} key="schedules">
            <Alert
              message="Automated Sync Schedules"
              description="Create schedules to automatically run sync operations at regular intervals. Supports both interval-based and cron expression scheduling."
              type="info"
              showIcon
              closable
              style={{ marginBottom: 16 }}
            />
            <Space style={{ marginBottom: 16 }}>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setScheduleModalVisible(true)}
              >
                Create Schedule
              </Button>
            </Space>

            {/* Advanced Filters for Schedules */}
            <Card style={{ marginBottom: 16 }}>
              <Space wrap>
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px' }}>
                    Status
                  </label>
                  <Select
                    value={scheduleFilters.status}
                    onChange={(value) => setScheduleFilters(prev => ({ ...prev, status: value }))}
                    style={{ width: '120px' }}
                    size="small"
                  >
                    <Select.Option value="all">All Status</Select.Option>
                    <Select.Option value="active">Active</Select.Option>
                    <Select.Option value="inactive">Inactive</Select.Option>
                  </Select>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px' }}>
                    Direction
                  </label>
                  <Select
                    value={scheduleFilters.direction}
                    onChange={(value) => setScheduleFilters(prev => ({ ...prev, direction: value }))}
                    style={{ width: '140px' }}
                    size="small"
                  >
                    <Select.Option value="all">All Directions</Select.Option>
                    <Select.Option value="netsuite_to_shopify">NS → Shopify</Select.Option>
                    <Select.Option value="shopify_to_netsuite">Shopify → NS</Select.Option>
                    <Select.Option value="bidirectional">Bidirectional</Select.Option>
                  </Select>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px' }}>
                    Search
                  </label>
                  <Input
                    placeholder="Search schedules..."
                    value={scheduleFilters.search}
                    onChange={(e) => setScheduleFilters(prev => ({ ...prev, search: e.target.value }))}
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
                    onClick={() => setScheduleFilters({ status: 'all', direction: 'all', search: '' })}
                    size="small"
                  >
                    Clear
                  </Button>
                </div>
              </Space>
            </Card>

            <Table
              columns={scheduleColumns}
              dataSource={filteredSchedules}
              rowKey="id"
              pagination={{ pageSize: 10 }}
            />
          </TabPane>
        </Tabs>

        <Modal
          title="Create Search Pattern"
          open={savePatternModalVisible}
          onOk={savePattern}
          onCancel={() => {
            setSavePatternModalVisible(false)
            form.resetFields()
          }}
          confirmLoading={savingPattern}
          width={600}
          okText="Save Pattern"
        >
          <Form form={form} layout="vertical">
            <Alert
              message="Pattern Types"
              description={
                <ul style={{ margin: 0, paddingLeft: '20px' }}>
                  <li><strong>Filter-based (Recommended):</strong> Uses filter criteria from Product Sync Preview - fully supported</li>
                  <li><strong>NetSuite Saved Search:</strong> Coming soon - currently not supported by NetSuite REST API</li>
                </ul>
              }
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />
            <Form.Item
              label="Pattern Name"
              name="name"
              rules={[{ required: true, message: 'Please enter a name' }]}
            >
              <Input placeholder="e.g., Active Electronics" />
            </Form.Item>
            <Form.Item label="Description" name="description">
              <TextArea rows={3} placeholder="Optional description of this pattern" />
            </Form.Item>
            <Form.Item
              label="NetSuite Saved Search ID (Coming Soon)"
              name="netsuite_saved_search_id"
              tooltip="NetSuite saved search support is coming soon. For now, use filter-based patterns from Product Sync Preview."
            >
              <Input placeholder="Not yet supported - use filters instead" disabled />
            </Form.Item>
            <Form.Item
              label="Sync Direction"
              name="sync_direction"
              rules={[{ required: true }]}
            >
              <Select>
                <Select.Option value="netsuite-to-shopify">NetSuite → Shopify</Select.Option>
                <Select.Option value="shopify-to-netsuite">Shopify → NetSuite</Select.Option>
                <Select.Option value="bidirectional">Bidirectional</Select.Option>
              </Select>
            </Form.Item>
            <Form.Item
              label="Auto-populate"
              name="auto_populate"
              valuePropName="checked"
              tooltip="Automatically refresh sync list from this pattern on a schedule"
            >
              <Switch />
            </Form.Item>
            <Form.Item
              label="Population Frequency"
              name="population_frequency"
              tooltip="How often to automatically refresh the sync list (requires auto-populate enabled)"
            >
              <Select placeholder="Select frequency">
                <Select.Option value="manual">Manual Only</Select.Option>
                <Select.Option value="hourly">Hourly</Select.Option>
                <Select.Option value="daily">Daily</Select.Option>
                <Select.Option value="weekly">Weekly</Select.Option>
              </Select>
            </Form.Item>
          </Form>
        </Modal>

        <Modal
          title="Create Sync Schedule"
          open={scheduleModalVisible}
          onOk={createSyncSchedule}
          onCancel={() => {
            setScheduleModalVisible(false)
            scheduleForm.resetFields()
          }}
          width={600}
          okText="Create Schedule"
        >
          <Form form={scheduleForm} layout="vertical">
            <Form.Item
              label="Schedule Name"
              name="name"
              rules={[{ required: true, message: 'Please enter a name' }]}
            >
              <Input placeholder="e.g., Daily Product Sync" />
            </Form.Item>
            <Form.Item label="Description" name="description">
              <TextArea rows={2} placeholder="Optional description" />
            </Form.Item>
            <Form.Item
              label="Schedule Type"
              name="schedule_type"
              rules={[{ required: true }]}
            >
              <Select>
                <Select.Option value="interval">Interval (minutes)</Select.Option>
                <Select.Option value="cron">Cron Expression</Select.Option>
              </Select>
            </Form.Item>
            <Form.Item
              noStyle
              shouldUpdate={(prevValues, currentValues) => prevValues.schedule_type !== currentValues.schedule_type}
            >
              {({ getFieldValue }) =>
                getFieldValue('schedule_type') === 'interval' ? (
                  <Form.Item
                    label="Interval (minutes)"
                    name="interval_minutes"
                    rules={[{ required: true, message: 'Please enter interval' }]}
                  >
                    <Select placeholder="Select interval">
                      <Select.Option value={15}>15 minutes</Select.Option>
                      <Select.Option value={30}>30 minutes</Select.Option>
                      <Select.Option value={60}>1 hour</Select.Option>
                      <Select.Option value={360}>6 hours</Select.Option>
                      <Select.Option value={720}>12 hours</Select.Option>
                      <Select.Option value={1440}>24 hours</Select.Option>
                    </Select>
                  </Form.Item>
                ) : (
                  <Form.Item
                    label="Cron Expression"
                    name="cron_expression"
                    rules={[{ required: true, message: 'Please enter cron expression' }]}
                    tooltip="Examples: '0 */1 * * *' (hourly), '0 9 * * *' (daily at 9am)"
                  >
                    <Input placeholder="0 */1 * * * (hourly)" />
                  </Form.Item>
                )
              }
            </Form.Item>
            <Form.Item
              label="Sync Direction"
              name="sync_direction"
              rules={[{ required: true }]}
            >
              <Select>
                <Select.Option value="netsuite_to_shopify">NetSuite → Shopify</Select.Option>
                <Select.Option value="shopify_to_netsuite">Shopify → NetSuite</Select.Option>
                <Select.Option value="bidirectional">Bidirectional</Select.Option>
              </Select>
            </Form.Item>
          </Form>
        </Modal>

        <Modal
          title="Add Item to Sync List"
          open={addItemModalVisible}
          onOk={addItemToSyncList}
          onCancel={() => {
            setAddItemModalVisible(false)
            addItemForm.resetFields()
          }}
          confirmLoading={addingItem}
          width={500}
          okText="Add Item"
        >
          <Alert
            message="Add Specific Item by ID"
            description="Enter a NetSuite item ID to fetch and add that specific item to your sync list. The item will be retrieved from NetSuite and stored in your products database."
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />
          <Form form={addItemForm} layout="vertical">
            <Form.Item
              label="NetSuite Item ID"
              name="itemId"
              rules={[{ required: true, message: 'Please enter the NetSuite item ID' }]}
              tooltip="The internal ID or item ID from NetSuite (e.g., 42782)"
            >
              <Input placeholder="e.g., 42782" />
            </Form.Item>
            <Form.Item
              label="Sync Direction"
              name="syncDirection"
              rules={[{ required: true }]}
            >
              <Select>
                <Select.Option value="netsuite_to_shopify">NetSuite → Shopify</Select.Option>
                <Select.Option value="shopify_to_netsuite">Shopify → NetSuite</Select.Option>
                <Select.Option value="bidirectional">Bidirectional</Select.Option>
              </Select>
            </Form.Item>
            <Form.Item
              label="Sync Mode"
              name="syncMode"
              initialValue="delta"
            >
              <Select>
                <Select.Option value="delta">Delta Sync (changes only)</Select.Option>
                <Select.Option value="full">Full Sync (complete data)</Select.Option>
              </Select>
            </Form.Item>
          </Form>
        </Modal>
      </Card>
    </div>
  )
}

import { useState, useEffect } from 'react'
import { Card, Table, Button, Space, Tag, Modal, Form, Input, Select, message, Drawer, Tabs, Statistic, Row, Col, Switch, Popconfirm, Badge, Typography, Tooltip, Alert } from 'antd'
import { SaveOutlined, SyncOutlined, DeleteOutlined, PlusOutlined, HistoryOutlined, FilterOutlined, ClockCircleOutlined, ThunderboltOutlined, ReloadOutlined } from '@ant-design/icons'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

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
  const [form] = Form.useForm()

  useEffect(() => {
    if (session) {
      loadSavedPatterns()
      loadSyncList()
      loadSyncHistory()
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
        .from('sync_history')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(20)

      if (error) throw error
      setSyncHistory(data || [])
    } catch (error) {
      console.error('Error loading sync history:', error)
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
            <Table
              columns={patternsColumns}
              dataSource={savedPatterns}
              rowKey="id"
              pagination={{ pageSize: 10 }}
            />
          </TabPane>

          <TabPane tab={<span><SyncOutlined /> Sync List ({syncList.length})</span>} key="synclist">
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
            <Table
              columns={syncListColumns}
              dataSource={syncList}
              rowKey="id"
              pagination={{ pageSize: 20 }}
            />
          </TabPane>

          <TabPane tab={<span><HistoryOutlined /> History</span>} key="history">
            <Table
              columns={historyColumns}
              dataSource={syncHistory}
              rowKey="id"
              pagination={{ pageSize: 20 }}
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
      </Card>
    </div>
  )
}

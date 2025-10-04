import { useState, useEffect } from 'react'
import { Card, Table, Button, Space, Tag, Modal, Form, Input, Select, message, Drawer, Tabs, Statistic, Row, Col, Switch, Popconfirm, Badge } from 'antd'
import { SaveOutlined, SyncOutlined, DeleteOutlined, PlusOutlined, HistoryOutlined, FilterOutlined, ClockCircleOutlined } from '@ant-design/icons'
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

export default function SyncManagement() {
  const { session } = useAuth()
  const [savedPatterns, setSavedPatterns] = useState<SavedPattern[]>([])
  const [syncList, setSyncList] = useState<SyncListItem[]>([])
  const [syncHistory, setSyncHistory] = useState<SyncHistory[]>([])
  const [loading, setLoading] = useState(false)
  const [savePatternModalVisible, setSavePatternModalVisible] = useState(false)
  const [currentFilters, setCurrentFilters] = useState<any>({})
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
    try {
      const values = await form.validateFields()
      const { data, error } = await supabase
        .from('saved_search_patterns')
        .insert([{
          user_id: session?.user.id,
          ...values,
          filters: currentFilters
        }])

      if (error) throw error
      message.success('Search pattern saved!')
      setSavePatternModalVisible(false)
      form.resetFields()
      loadSavedPatterns()
    } catch (error: any) {
      message.error('Failed to save pattern: ' + error.message)
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
        <Space>
          <Button size="small" icon={<FilterOutlined />}>Apply</Button>
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
            <Space style={{ marginBottom: 16 }}>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setSavePatternModalVisible(true)}
              >
                Save Current Filters
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
          title="Save Search Pattern"
          open={savePatternModalVisible}
          onOk={savePattern}
          onCancel={() => setSavePatternModalVisible(false)}
        >
          <Form form={form} layout="vertical">
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
          </Form>
        </Modal>
      </Card>
    </div>
  )
}

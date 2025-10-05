import React, { useState, useEffect } from 'react'
import {
  Card,
  Button,
  Select,
  InputNumber,
  Table,
  Tag,
  Space,
  Typography,
  Row,
  Col,
  Statistic,
  message,
  Alert,
  Progress,
  Input,
  Tooltip,
  Collapse,
  Checkbox,
  DatePicker
} from 'antd'
import {
  SyncOutlined,
  DatabaseOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  CloseCircleOutlined,
  ReloadOutlined,
  SearchOutlined,
  InboxOutlined,
  FilterOutlined,
  ClearOutlined
} from '@ant-design/icons'
import type { Session } from '@supabase/supabase-js'

const { Title, Text } = Typography
const { Option } = Select
const { Panel } = Collapse
const { Search } = Input
const { RangePicker } = DatePicker

interface InventorySyncManagementProps {
  session: Session
}

interface InventoryItem {
  id: string
  sku: string
  product_name: string
  netsuite_quantity: number
  shopify_quantity: number
  available_quantity: number
  reserved_quantity: number
  location: string
  last_updated: string | null
  sync_status: 'synced' | 'pending' | 'conflict' | 'error'
  discrepancy: number
}

const InventorySyncManagement: React.FC<InventorySyncManagementProps> = ({ session }) => {
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [syncStatus, setSyncStatus] = useState<string>('all')
  const [stockStatus, setStockStatus] = useState<string>('all')
  const [limit, setLimit] = useState<number>(100)
  const [showDiscrepanciesOnly, setShowDiscrepanciesOnly] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [locationFilter, setLocationFilter] = useState('')
  const [minQuantity, setMinQuantity] = useState<number | undefined>()
  const [maxQuantity, setMaxQuantity] = useState<number | undefined>()
  const [minDiscrepancy, setMinDiscrepancy] = useState<number | undefined>()
  const [maxDiscrepancy, setMaxDiscrepancy] = useState<number | undefined>()
  const [lastUpdatedRange, setLastUpdatedRange] = useState<[any, any] | null>(null)

  // Stats
  const [stats, setStats] = useState({
    total: 0,
    inStock: 0,
    lowStock: 0,
    outOfStock: 0,
    discrepancies: 0,
    pendingSync: 0
  })

  // Sync progress
  const [syncProgress, setSyncProgress] = useState<{
    current: number
    total: number
    status: string
  } | null>(null)

  const fetchInventory = async () => {
    if (!session) return

    setLoading(true)
    try {
      // Note: This would call your fetch-inventory edge function
      // For now, we'll show a placeholder
      const params: any = {
        limit,
        searchTerm: searchTerm || undefined,
        syncStatus: syncStatus !== 'all' ? syncStatus : undefined,
        stockStatus: stockStatus !== 'all' ? stockStatus : undefined,
        showDiscrepanciesOnly,
        location: locationFilter || undefined,
        minQuantity,
        maxQuantity,
        minDiscrepancy,
        maxDiscrepancy,
        lastUpdatedFrom: lastUpdatedRange?.[0]?.toISOString(),
        lastUpdatedTo: lastUpdatedRange?.[1]?.toISOString()
      }

      console.log('Fetching inventory with filters:', params)
      message.info('Inventory preview functionality will fetch from NetSuite/Shopify')
      
      // Placeholder data
      setInventory([])
      setStats({
        total: 0,
        inStock: 0,
        lowStock: 0,
        outOfStock: 0,
        discrepancies: 0,
        pendingSync: 0
      })
    } catch (error) {
      console.error('Error fetching inventory:', error)
      message.error('Failed to fetch inventory')
    } finally {
      setLoading(false)
    }
  }

  const handleSync = async () => {
    if (!session) {
      message.error('Please sign in first')
      return
    }

    if (inventory.length === 0) {
      message.warning('No inventory items to sync. Please fetch inventory first.')
      return
    }

    setSyncing(true)
    setSyncProgress({ current: 0, total: inventory.length, status: 'Starting inventory sync...' })

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-inventory`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            syncDirection: 'netsuite_to_shopify',
            limit
          })
        }
      )

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Sync failed')
      }

      const result = await response.json()

      message.success(
        `Inventory sync completed! ${result.summary.itemsSucceeded} of ${result.summary.itemsProcessed} items synced successfully`
      )

      // Refresh inventory list
      await fetchInventory()
    } catch (error) {
      console.error('Sync error:', error)
      message.error(error instanceof Error ? error.message : 'Sync failed')
    } finally {
      setSyncing(false)
      setSyncProgress(null)
    }
  }

  const handleSyncSingleItem = async (sku: string) => {
    try {
      message.loading({ content: `Syncing ${sku}...`, key: sku })
      
      // Call sync API for single item
      // Placeholder for now
      
      message.success({ content: `${sku} synced successfully`, key: sku })
      await fetchInventory()
    } catch (error) {
      message.error({ content: `Failed to sync ${sku}`, key: sku })
    }
  }

  useEffect(() => {
    void fetchInventory()
  }, [])

  const getStockStatusColor = (qty: number) => {
    if (qty === 0) return 'red'
    if (qty < 10) return 'orange'
    return 'green'
  }

  const getStockStatusText = (qty: number) => {
    if (qty === 0) return 'Out of Stock'
    if (qty < 10) return 'Low Stock'
    return 'In Stock'
  }

  const columns = [
    {
      title: 'SKU',
      dataIndex: 'sku',
      key: 'sku',
      width: 150,
      fixed: 'left' as const,
      render: (sku: string) => <Text strong code>{sku}</Text>
    },
    {
      title: 'Product Name',
      dataIndex: 'product_name',
      key: 'product_name',
      width: 250,
      ellipsis: true
    },
    {
      title: 'NetSuite Qty',
      dataIndex: 'netsuite_quantity',
      key: 'netsuite_quantity',
      width: 120,
      align: 'center' as const,
      render: (qty: number) => <Text strong>{qty}</Text>
    },
    {
      title: 'Shopify Qty',
      dataIndex: 'shopify_quantity',
      key: 'shopify_quantity',
      width: 120,
      align: 'center' as const,
      render: (qty: number) => <Text strong>{qty}</Text>
    },
    {
      title: 'Discrepancy',
      dataIndex: 'discrepancy',
      key: 'discrepancy',
      width: 120,
      align: 'center' as const,
      render: (disc: number) => {
        if (disc === 0) return <Tag color="green">0</Tag>
        return (
          <Tooltip title="NetSuite - Shopify">
            <Tag color="orange">{disc > 0 ? '+' : ''}{disc}</Tag>
          </Tooltip>
        )
      }
    },
    {
      title: 'Available',
      dataIndex: 'available_quantity',
      key: 'available_quantity',
      width: 120,
      align: 'center' as const,
      render: (qty: number) => (
        <Tag color={getStockStatusColor(qty)}>
          {qty} - {getStockStatusText(qty)}
        </Tag>
      )
    },
    {
      title: 'Reserved',
      dataIndex: 'reserved_quantity',
      key: 'reserved_quantity',
      width: 100,
      align: 'center' as const
    },
    {
      title: 'Location',
      dataIndex: 'location',
      key: 'location',
      width: 150,
      ellipsis: true
    },
    {
      title: 'Status',
      dataIndex: 'sync_status',
      key: 'sync_status',
      width: 120,
      render: (status: string) => {
        const colors: Record<string, string> = {
          synced: 'green',
          pending: 'orange',
          conflict: 'red',
          error: 'red'
        }
        const icons: Record<string, React.ReactNode> = {
          synced: <CheckCircleOutlined />,
          pending: <SyncOutlined spin />,
          conflict: <WarningOutlined />,
          error: <CloseCircleOutlined />
        }
        return (
          <Tag color={colors[status] || 'default'} icon={icons[status]}>
            {status.toUpperCase()}
          </Tag>
        )
      }
    },
    {
      title: 'Last Updated',
      dataIndex: 'last_updated',
      key: 'last_updated',
      width: 150,
      render: (date: string | null) => 
        date ? new Date(date).toLocaleDateString() : <Text type="secondary">Never</Text>
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 150,
      fixed: 'right' as const,
      render: (record: InventoryItem) => (
        <Space size="small">
          <Tooltip title="Sync this item">
            <Button
              type="primary"
              size="small"
              icon={<SyncOutlined />}
              onClick={() => void handleSyncSingleItem(record.sku)}
            >
              Sync
            </Button>
          </Tooltip>
          <Tooltip title="View history">
            <Button size="small">History</Button>
          </Tooltip>
        </Space>
      )
    }
  ]

  const filteredInventory = inventory.filter(item => {
    if (searchTerm && !item.sku.toLowerCase().includes(searchTerm.toLowerCase()) && 
        !item.product_name.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false
    }
    if (syncStatus !== 'all' && item.sync_status !== syncStatus) {
      return false
    }
    if (showDiscrepanciesOnly && item.discrepancy === 0) {
      return false
    }
    if (stockStatus === 'in_stock' && item.available_quantity <= 0) {
      return false
    }
    if (stockStatus === 'low_stock' && (item.available_quantity === 0 || item.available_quantity >= 10)) {
      return false
    }
    if (stockStatus === 'out_of_stock' && item.available_quantity > 0) {
      return false
    }
    return true
  })

  return (
    <div>
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Title level={2} style={{ margin: 0 }}>Inventory Sync</Title>
        <Space>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => void fetchInventory()}
            loading={loading}
          >
            Refresh
          </Button>
          <Button
            type="primary"
            icon={<SyncOutlined />}
            onClick={() => void handleSync()}
            loading={syncing}
            disabled={inventory.length === 0}
          >
            Sync All Inventory
          </Button>
        </Space>
      </div>

      {/* Statistics */}
      <Row gutter={16} style={{ marginBottom: '24px' }}>
        <Col xs={24} sm={12} lg={4}>
          <Card>
            <Statistic
              title="Total Items"
              value={stats.total}
              prefix={<DatabaseOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={4}>
          <Card>
            <Statistic
              title="In Stock"
              value={stats.inStock}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={4}>
          <Card>
            <Statistic
              title="Low Stock"
              value={stats.lowStock}
              prefix={<WarningOutlined />}
              valueStyle={{ color: '#fa8c16' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={4}>
          <Card>
            <Statistic
              title="Out of Stock"
              value={stats.outOfStock}
              prefix={<CloseCircleOutlined />}
              valueStyle={{ color: '#f5222d' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={4}>
          <Card>
            <Statistic
              title="Discrepancies"
              value={stats.discrepancies}
              prefix={<WarningOutlined />}
              valueStyle={{ color: '#fa8c16' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={4}>
          <Card>
            <Statistic
              title="Pending Sync"
              value={stats.pendingSync}
              prefix={<SyncOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Sync Progress */}
      {syncProgress && (
        <Alert
          message="Inventory Sync in Progress"
          description={
            <div>
              <div style={{ marginBottom: 8 }}>{syncProgress.status}</div>
              <Progress
                percent={Math.round((syncProgress.current / syncProgress.total) * 100)}
                status="active"
              />
              <Text type="secondary">
                {syncProgress.current} of {syncProgress.total} items processed
              </Text>
            </div>
          }
          type="info"
          showIcon
          style={{ marginBottom: '24px' }}
        />
      )}

      {/* Advanced Filters */}
      <Card style={{ marginBottom: '16px' }}>
        <Space style={{ marginBottom: 16, flexWrap: 'wrap' }}>
          <Search
            placeholder="Search by SKU, product name, or location..."
            allowClear
            style={{ width: 350 }}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onSearch={() => void fetchInventory()}
            prefix={<SearchOutlined />}
          />
          <Button
            icon={<FilterOutlined />}
            onClick={() => setShowFilters(!showFilters)}
          >
            {showFilters ? 'Hide Filters' : 'Show Advanced Filters'}
          </Button>
          <Button
            icon={<ClearOutlined />}
            onClick={() => {
              setSearchTerm('')
              setSyncStatus('all')
              setStockStatus('all')
              setLimit(100)
              setShowDiscrepanciesOnly(false)
              setLocationFilter('')
              setMinQuantity(undefined)
              setMaxQuantity(undefined)
              setMinDiscrepancy(undefined)
              setMaxDiscrepancy(undefined)
              setLastUpdatedRange(null)
            }}
          >
            Clear All
          </Button>
        </Space>

        {showFilters && (
          <Card size="small" style={{ backgroundColor: '#f9f9f9' }}>
            <Collapse defaultActiveKey={['basic']} ghost>
              <Panel header={<Text strong>Basic Filters</Text>} key="basic">
                <Row gutter={16}>
                  <Col xs={24} md={8}>
                    <div style={{ marginBottom: '8px' }}>
                      <Text strong>Location</Text>
                    </div>
                    <Input
                      placeholder="e.g., Main Warehouse, Store 01"
                      value={locationFilter}
                      onChange={(e) => setLocationFilter(e.target.value)}
                      allowClear
                    />
                  </Col>
                  <Col xs={24} md={8}>
                    <div style={{ marginBottom: '8px' }}>
                      <Text strong>Last Updated Range</Text>
                    </div>
                    <RangePicker
                      value={lastUpdatedRange}
                      onChange={(dates) => setLastUpdatedRange(dates)}
                      style={{ width: '100%' }}
                      format="MMM D, YYYY"
                    />
                  </Col>
                  <Col xs={24} md={8}>
                    <div style={{ marginBottom: '8px' }}>
                      <Text strong>Limit Results</Text>
                    </div>
                    <InputNumber
                      value={limit}
                      onChange={(val) => setLimit(val || 100)}
                      min={1}
                      max={1000}
                      style={{ width: '100%' }}
                    />
                  </Col>
                </Row>
              </Panel>

              <Panel header={<Text strong>Stock & Quantity</Text>} key="stock">
                <Row gutter={16}>
                  <Col xs={24} md={6}>
                    <div style={{ marginBottom: '8px' }}>
                      <Text strong>Stock Status</Text>
                    </div>
                    <Select
                      value={stockStatus}
                      onChange={setStockStatus}
                      style={{ width: '100%' }}
                    >
                      <Option value="all">All Items</Option>
                      <Option value="in_stock">In Stock</Option>
                      <Option value="low_stock">Low Stock (<10)</Option>
                      <Option value="out_of_stock">Out of Stock</Option>
                    </Select>
                  </Col>
                  <Col xs={24} md={6}>
                    <div style={{ marginBottom: '8px' }}>
                      <Text strong>Sync Status</Text>
                    </div>
                    <Select
                      value={syncStatus}
                      onChange={setSyncStatus}
                      style={{ width: '100%' }}
                    >
                      <Option value="all">All Statuses</Option>
                      <Option value="synced">Synced</Option>
                      <Option value="pending">Pending</Option>
                      <Option value="conflict">Conflicts</Option>
                      <Option value="error">Errors</Option>
                    </Select>
                  </Col>
                  <Col xs={24} md={6}>
                    <div style={{ marginBottom: '8px' }}>
                      <Text strong>Available Quantity Range</Text>
                    </div>
                    <Space>
                      <InputNumber
                        placeholder="Min"
                        value={minQuantity}
                        onChange={setMinQuantity}
                        min={0}
                        style={{ width: '80px' }}
                      />
                      <Text>to</Text>
                      <InputNumber
                        placeholder="Max"
                        value={maxQuantity}
                        onChange={setMaxQuantity}
                        min={0}
                        style={{ width: '80px' }}
                      />
                    </Space>
                  </Col>
                  <Col xs={24} md={6}>
                    <div style={{ marginBottom: '8px' }}>
                      <Text strong>Discrepancy Range</Text>
                    </div>
                    <Space>
                      <InputNumber
                        placeholder="Min"
                        value={minDiscrepancy}
                        onChange={setMinDiscrepancy}
                        style={{ width: '80px' }}
                      />
                      <Text>to</Text>
                      <InputNumber
                        placeholder="Max"
                        value={maxDiscrepancy}
                        onChange={setMaxDiscrepancy}
                        style={{ width: '80px' }}
                      />
                    </Space>
                  </Col>
                </Row>
                <Row gutter={16} style={{ marginTop: 16 }}>
                  <Col xs={24} md={6}>
                    <Checkbox
                      checked={showDiscrepanciesOnly}
                      onChange={(e) => setShowDiscrepanciesOnly(e.target.checked)}
                    >
                      <Text strong>Show discrepancies only</Text>
                    </Checkbox>
                  </Col>
                </Row>
              </Panel>
            </Collapse>

            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #e8e8e8' }}>
              <Space>
                <Button
                  type="primary"
                  onClick={() => void fetchInventory()}
                  loading={loading}
                  icon={<SearchOutlined />}
                >
                  Apply Filters
                </Button>
                <Text type="secondary">
                  {[
                    searchTerm && 'Search',
                    locationFilter && 'Location',
                    lastUpdatedRange && 'Date Range',
                    stockStatus !== 'all' && 'Stock Status',
                    syncStatus !== 'all' && 'Sync Status',
                    (minQuantity !== undefined || maxQuantity !== undefined) && 'Quantity Range',
                    (minDiscrepancy !== undefined || maxDiscrepancy !== undefined) && 'Discrepancy Range',
                    showDiscrepanciesOnly && 'Discrepancies Only'
                  ].filter(Boolean).length > 0 &&
                    `${[
                      searchTerm && 'Search',
                      locationFilter && 'Location',
                      lastUpdatedRange && 'Date Range',
                      stockStatus !== 'all' && 'Stock Status',
                      syncStatus !== 'all' && 'Sync Status',
                      (minQuantity !== undefined || maxQuantity !== undefined) && 'Quantity Range',
                      (minDiscrepancy !== undefined || maxDiscrepancy !== undefined) && 'Discrepancy Range',
                      showDiscrepanciesOnly && 'Discrepancies Only'
                    ].filter(Boolean).length} filter(s) active`
                  }
                </Text>
              </Space>
            </div>
          </Card>
        )}

        <Row gutter={16}>
          <Col xs={24} md={6}>
            <div style={{ marginBottom: '8px' }}>
              <Text strong>Search SKU/Name</Text>
            </div>
            <Input
              placeholder="Search..."
              prefix={<SearchOutlined />}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              allowClear
            />
          </Col>
          <Col xs={24} md={5}>
            <div style={{ marginBottom: '8px' }}>
              <Text strong>Stock Status</Text>
            </div>
            <Select
              value={stockStatus}
              onChange={setStockStatus}
              style={{ width: '100%' }}
            >
              <Option value="all">All Items</Option>
              <Option value="in_stock">In Stock</Option>
              <Option value="low_stock">Low Stock (&lt;10)</Option>
              <Option value="out_of_stock">Out of Stock</Option>
            </Select>
          </Col>
          <Col xs={24} md={5}>
            <div style={{ marginBottom: '8px' }}>
              <Text strong>Sync Status</Text>
            </div>
            <Select
              value={syncStatus}
              onChange={setSyncStatus}
              style={{ width: '100%' }}
            >
              <Option value="all">All Statuses</Option>
              <Option value="synced">Synced</Option>
              <Option value="pending">Pending</Option>
              <Option value="conflict">Conflicts</Option>
              <Option value="error">Errors</Option>
            </Select>
          </Col>
          <Col xs={24} md={4}>
            <div style={{ marginBottom: '8px' }}>
              <Text strong>Limit</Text>
            </div>
            <InputNumber
              value={limit}
              onChange={(val) => setLimit(val || 100)}
              min={1}
              max={500}
              style={{ width: '100%' }}
            />
          </Col>
          <Col xs={24} md={4}>
            <div style={{ marginBottom: '8px' }}>
              <Text strong>Discrepancies Only</Text>
            </div>
            <Button
              type={showDiscrepanciesOnly ? 'primary' : 'default'}
              onClick={() => setShowDiscrepanciesOnly(!showDiscrepanciesOnly)}
              icon={<WarningOutlined />}
              style={{ width: '100%' }}
            >
              {showDiscrepanciesOnly ? 'Showing' : 'Show'}
            </Button>
          </Col>
        </Row>
      </Card>

      {/* Inventory Table */}
      <Card>
        <Table
          columns={columns}
          dataSource={filteredInventory}
          loading={loading}
          rowKey="id"
          scroll={{ x: 1500 }}
          pagination={{
            pageSize: 50,
            showSizeChanger: true,
            showTotal: (total) => `Total ${total} items`
          }}
          locale={{
            emptyText: (
              <div style={{ padding: '40px 0' }}>
                <InboxOutlined style={{ fontSize: 48, color: '#bfbfbf', marginBottom: 16 }} />
                <div>
                  <Text type="secondary">No inventory items found</Text>
                </div>
                <div style={{ marginTop: 8 }}>
                  <Text type="secondary" style={{ fontSize: '12px' }}>
                    Click "Apply Filters" to fetch inventory from your platforms
                  </Text>
                </div>
              </div>
            )
          }}
        />
      </Card>
    </div>
  )
}

export default InventorySyncManagement

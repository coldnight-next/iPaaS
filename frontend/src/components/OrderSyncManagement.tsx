import React, { useState, useEffect } from 'react'
import {
  Card,
  Button,
  Select,
  DatePicker,
  InputNumber,
  Table,
  Tag,
  Space,
  Typography,
  Row,
  Col,
  Statistic,
  message,
  Spin,
  Alert,
  Tooltip,
  Progress,
  Input,
  Collapse,
  Checkbox
} from 'antd'
import {
  SyncOutlined,
  ShoppingOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  DollarOutlined,
  ReloadOutlined,
  SearchOutlined,
  FilterOutlined,
  ClearOutlined
} from '@ant-design/icons'
import type { Session } from '@supabase/supabase-js'
import dayjs, { Dayjs } from 'dayjs'

const { Title, Text } = Typography
const { RangePicker } = DatePicker
const { Option } = Select
const { Panel } = Collapse
const { Search } = Input

interface OrderSyncManagementProps {
  session: Session
}

interface OrderPreview {
  id: string
  order_number: string
  customer_name: string
  customer_email: string
  total_price: string
  currency: string
  financial_status: string
  fulfillment_status: string
  created_at: string
  line_items_count: number
}

const OrderSyncManagement: React.FC<OrderSyncManagementProps> = ({ session }) => {
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [orders, setOrders] = useState<OrderPreview[]>([])
  
  // Filters
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>([
    dayjs().subtract(7, 'days'),
    dayjs()
  ])
  const [orderStatus, setOrderStatus] = useState<string>('all')
  const [fulfillmentStatus, setFulfillmentStatus] = useState<string>('all')
  const [limit, setLimit] = useState<number>(50)
  const [searchTerm, setSearchTerm] = useState('')
  const [minAmount, setMinAmount] = useState<number | undefined>()
  const [maxAmount, setMaxAmount] = useState<number | undefined>()
  const [customerEmail, setCustomerEmail] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [syncStatus, setSyncStatus] = useState<string>('all')
  const [hasMultipleItems, setHasMultipleItems] = useState<boolean | undefined>()

  // Stats
  const [stats, setStats] = useState({
    total: 0,
    paid: 0,
    pending: 0,
    fulfilled: 0,
    unfulfilled: 0
  })

  // Sync progress
  const [syncProgress, setSyncProgress] = useState<{
    current: number
    total: number
    status: string
  } | null>(null)

  const fetchOrders = async () => {
    if (!session) return

    setLoading(true)
    try {
      const params: any = {
        limit
      }

      if (dateRange) {
        params.dateFrom = dateRange[0].toISOString()
        params.dateTo = dateRange[1].toISOString()
      }

      if (orderStatus !== 'all') {
        params.orderStatus = orderStatus
      }

      if (fulfillmentStatus !== 'all') {
        params.fulfillmentStatus = fulfillmentStatus
      }

      if (searchTerm) {
        params.searchTerm = searchTerm
      }

      if (minAmount !== undefined) {
        params.minAmount = minAmount
      }

      if (maxAmount !== undefined) {
        params.maxAmount = maxAmount
      }

      if (customerEmail) {
        params.customerEmail = customerEmail
      }

      if (syncStatus !== 'all') {
        params.syncStatus = syncStatus
      }

      if (hasMultipleItems !== undefined) {
        params.hasMultipleItems = hasMultipleItems
      }

      // Note: This would call your fetch-orders edge function
      // For now, we'll show a placeholder
      message.info('Order preview functionality will fetch from Shopify')
      
      // Placeholder data
      setOrders([])
      setStats({
        total: 0,
        paid: 0,
        pending: 0,
        fulfilled: 0,
        unfulfilled: 0
      })
    } catch (error) {
      console.error('Error fetching orders:', error)
      message.error('Failed to fetch orders')
    } finally {
      setLoading(false)
    }
  }

  const handleSync = async () => {
    if (!session) {
      message.error('Please sign in first')
      return
    }

    if (orders.length === 0) {
      message.warning('No orders to sync. Please fetch orders first.')
      return
    }

    setSyncing(true)
    setSyncProgress({ current: 0, total: orders.length, status: 'Starting sync...' })

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-orders`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            dateFrom: dateRange?.[0].toISOString(),
            dateTo: dateRange?.[1].toISOString(),
            orderStatus: orderStatus !== 'all' ? orderStatus : undefined,
            fulfillmentStatus: fulfillmentStatus !== 'all' ? fulfillmentStatus : undefined,
            searchTerm: searchTerm || undefined,
            minAmount,
            maxAmount,
            customerEmail: customerEmail || undefined,
            syncStatus: syncStatus !== 'all' ? syncStatus : undefined,
            hasMultipleItems,
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
        `Sync completed! ${result.summary.ordersSucceeded} of ${result.summary.ordersProcessed} orders synced successfully`
      )

      // Refresh orders list
      await fetchOrders()
    } catch (error) {
      console.error('Sync error:', error)
      message.error(error instanceof Error ? error.message : 'Sync failed')
    } finally {
      setSyncing(false)
      setSyncProgress(null)
    }
  }

  useEffect(() => {
    void fetchOrders()
  }, [])

  const columns = [
    {
      title: 'Order #',
      dataIndex: 'order_number',
      key: 'order_number',
      width: 120,
      render: (num: string) => <Text strong>#{num}</Text>
    },
    {
      title: 'Customer',
      key: 'customer',
      width: 200,
      render: (record: OrderPreview) => (
        <div>
          <div>{record.customer_name}</div>
          <Text type="secondary" style={{ fontSize: '12px' }}>
            {record.customer_email}
          </Text>
        </div>
      )
    },
    {
      title: 'Total',
      key: 'total',
      width: 120,
      render: (record: OrderPreview) => (
        <Text strong>
          {record.currency} {record.total_price}
        </Text>
      )
    },
    {
      title: 'Financial Status',
      dataIndex: 'financial_status',
      key: 'financial_status',
      width: 150,
      render: (status: string) => {
        const colors: Record<string, string> = {
          paid: 'green',
          pending: 'orange',
          refunded: 'red',
          partially_refunded: 'orange',
          voided: 'default'
        }
        return <Tag color={colors[status] || 'default'}>{status.toUpperCase()}</Tag>
      }
    },
    {
      title: 'Fulfillment',
      dataIndex: 'fulfillment_status',
      key: 'fulfillment_status',
      width: 150,
      render: (status: string) => {
        const colors: Record<string, string> = {
          fulfilled: 'green',
          partial: 'orange',
          unfulfilled: 'red',
          null: 'default'
        }
        const display = status || 'unfulfilled'
        return <Tag color={colors[status] || 'default'}>{display.toUpperCase()}</Tag>
      }
    },
    {
      title: 'Items',
      dataIndex: 'line_items_count',
      key: 'line_items_count',
      width: 80,
      align: 'center' as const
    },
    {
      title: 'Date',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 150,
      render: (date: string) => dayjs(date).format('MMM D, YYYY HH:mm')
    }
  ]

  return (
    <div>
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Title level={2} style={{ margin: 0 }}>Order Sync</Title>
        <Space>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => void fetchOrders()}
            loading={loading}
          >
            Refresh
          </Button>
          <Button
            type="primary"
            icon={<SyncOutlined />}
            onClick={() => void handleSync()}
            loading={syncing}
            disabled={orders.length === 0}
          >
            Sync Orders
          </Button>
        </Space>
      </div>

      {/* Statistics */}
      <Row gutter={16} style={{ marginBottom: '24px' }}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Total Orders"
              value={stats.total}
              prefix={<ShoppingOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Paid"
              value={stats.paid}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Fulfilled"
              value={stats.fulfilled}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Pending"
              value={stats.pending}
              prefix={<ClockCircleOutlined />}
              valueStyle={{ color: '#fa8c16' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Sync Progress */}
      {syncProgress && (
        <Alert
          message="Sync in Progress"
          description={
            <div>
              <div style={{ marginBottom: 8 }}>{syncProgress.status}</div>
              <Progress
                percent={Math.round((syncProgress.current / syncProgress.total) * 100)}
                status="active"
              />
              <Text type="secondary">
                {syncProgress.current} of {syncProgress.total} orders processed
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
            placeholder="Search orders by number, customer name, or email..."
            allowClear
            style={{ width: 350 }}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onSearch={() => void fetchOrders()}
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
              setDateRange([dayjs().subtract(7, 'days'), dayjs()])
              setOrderStatus('all')
              setFulfillmentStatus('all')
              setMinAmount(undefined)
              setMaxAmount(undefined)
              setCustomerEmail('')
              setSyncStatus('all')
              setHasMultipleItems(undefined)
              setLimit(50)
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
                      <Text strong>Date Range</Text>
                    </div>
                    <RangePicker
                      value={dateRange}
                      onChange={(dates) => setDateRange(dates as [Dayjs, Dayjs] | null)}
                      style={{ width: '100%' }}
                      format="MMM D, YYYY"
                    />
                  </Col>
                  <Col xs={24} md={8}>
                    <div style={{ marginBottom: '8px' }}>
                      <Text strong>Customer Email</Text>
                    </div>
                    <Input
                      placeholder="customer@example.com"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      allowClear
                    />
                  </Col>
                  <Col xs={24} md={8}>
                    <div style={{ marginBottom: '8px' }}>
                      <Text strong>Limit Results</Text>
                    </div>
                    <InputNumber
                      value={limit}
                      onChange={(val) => setLimit(val || 50)}
                      min={1}
                      max={500}
                      style={{ width: '100%' }}
                    />
                  </Col>
                </Row>
              </Panel>

              <Panel header={<Text strong>Order Status & Value</Text>} key="status">
                <Row gutter={16}>
                  <Col xs={24} md={6}>
                    <div style={{ marginBottom: '8px' }}>
                      <Text strong>Financial Status</Text>
                    </div>
                    <Select
                      value={orderStatus}
                      onChange={setOrderStatus}
                      style={{ width: '100%' }}
                    >
                      <Option value="all">All Statuses</Option>
                      <Option value="paid">Paid</Option>
                      <Option value="pending">Pending</Option>
                      <Option value="refunded">Refunded</Option>
                      <Option value="partially_refunded">Partially Refunded</Option>
                      <Option value="voided">Voided</Option>
                    </Select>
                  </Col>
                  <Col xs={24} md={6}>
                    <div style={{ marginBottom: '8px' }}>
                      <Text strong>Fulfillment Status</Text>
                    </div>
                    <Select
                      value={fulfillmentStatus}
                      onChange={setFulfillmentStatus}
                      style={{ width: '100%' }}
                    >
                      <Option value="all">All Statuses</Option>
                      <Option value="fulfilled">Fulfilled</Option>
                      <Option value="unfulfilled">Unfulfilled</Option>
                      <Option value="partial">Partially Fulfilled</Option>
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
                      <Option value="all">All Sync Statuses</Option>
                      <Option value="synced">Synced</Option>
                      <Option value="pending">Pending Sync</Option>
                      <Option value="failed">Sync Failed</Option>
                    </Select>
                  </Col>
                  <Col xs={24} md={6}>
                    <div style={{ marginBottom: '8px' }}>
                      <Text strong>Order Size</Text>
                    </div>
                    <Select
                      value={hasMultipleItems === undefined ? 'all' : hasMultipleItems ? 'multiple' : 'single'}
                      onChange={(value) => setHasMultipleItems(value === 'all' ? undefined : value === 'multiple')}
                      style={{ width: '100%' }}
                    >
                      <Option value="all">All Orders</Option>
                      <Option value="single">Single Item Orders</Option>
                      <Option value="multiple">Multi-Item Orders</Option>
                    </Select>
                  </Col>
                </Row>
                <Row gutter={16} style={{ marginTop: 16 }}>
                  <Col xs={24} md={12}>
                    <div style={{ marginBottom: '8px' }}>
                      <Text strong>Order Value Range</Text>
                    </div>
                    <Space>
                      <InputNumber
                        placeholder="Min"
                        prefix="$"
                        value={minAmount}
                        onChange={setMinAmount}
                        min={0}
                        step={10}
                        style={{ width: '140px' }}
                      />
                      <Text>to</Text>
                      <InputNumber
                        placeholder="Max"
                        prefix="$"
                        value={maxAmount}
                        onChange={setMaxAmount}
                        min={0}
                        step={10}
                        style={{ width: '140px' }}
                      />
                    </Space>
                  </Col>
                </Row>
              </Panel>
            </Collapse>

            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #e8e8e8' }}>
              <Space>
                <Button
                  type="primary"
                  onClick={() => void fetchOrders()}
                  loading={loading}
                  icon={<SearchOutlined />}
                >
                  Apply Filters
                </Button>
                <Text type="secondary">
                  {[
                    searchTerm && 'Search',
                    dateRange && 'Date Range',
                    orderStatus !== 'all' && 'Financial Status',
                    fulfillmentStatus !== 'all' && 'Fulfillment Status',
                    syncStatus !== 'all' && 'Sync Status',
                    (minAmount !== undefined || maxAmount !== undefined) && 'Order Value',
                    customerEmail && 'Customer Email',
                    hasMultipleItems !== undefined && 'Order Size'
                  ].filter(Boolean).length > 0 &&
                    `${[
                      searchTerm && 'Search',
                      dateRange && 'Date Range',
                      orderStatus !== 'all' && 'Financial Status',
                      fulfillmentStatus !== 'all' && 'Fulfillment Status',
                      syncStatus !== 'all' && 'Sync Status',
                      (minAmount !== undefined || maxAmount !== undefined) && 'Order Value',
                      customerEmail && 'Customer Email',
                      hasMultipleItems !== undefined && 'Order Size'
                    ].filter(Boolean).length} filter(s) active`
                  }
                </Text>
              </Space>
            </div>
          </Card>
        )}
      </Card>

      {/* Orders Table */}
      <Card>
        <Table
          columns={columns}
          dataSource={orders}
          loading={loading}
          rowKey="id"
          pagination={{
            pageSize: 20,
            showSizeChanger: true,
            showTotal: (total) => `Total ${total} orders`
          }}
          locale={{
            emptyText: (
              <div style={{ padding: '40px 0' }}>
                <ShoppingOutlined style={{ fontSize: 48, color: '#bfbfbf', marginBottom: 16 }} />
                <div>
                  <Text type="secondary">No orders found</Text>
                </div>
                <div style={{ marginTop: 8 }}>
                  <Text type="secondary" style={{ fontSize: '12px' }}>
                    Adjust your filters and click "Apply Filters" to fetch orders
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

export default OrderSyncManagement

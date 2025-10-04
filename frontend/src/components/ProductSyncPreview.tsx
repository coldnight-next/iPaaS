import { useState, useEffect } from 'react'
import { Card, Table, Button, Space, Tag, Spin, Alert, Typography, Row, Col, Select, Input, Checkbox, Statistic, Tabs, Modal, message, Radio, DatePicker, InputNumber, Collapse, Drawer, Form } from 'antd'
import { SyncOutlined, CheckCircleOutlined, ExclamationCircleOutlined, SearchOutlined, FilterOutlined, ArrowRightOutlined, EyeOutlined, SwapOutlined, DatabaseOutlined, EditOutlined, SaveOutlined, CloseOutlined } from '@ant-design/icons'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const { Title, Text, Paragraph } = Typography
const { TabPane } = Tabs
const { Search } = Input
const { RangePicker } = DatePicker
const { Panel } = Collapse

interface Product {
  id: string
  name: string
  sku: string
  price: number
  inventory: number
  platform: 'netsuite' | 'shopify'
  status: string
  image?: string
  description?: string
  variants?: number
  lastModified?: string
  rawData?: any
  staged?: boolean
  stagedChanges?: Partial<Product>
}

interface FetchFilters {
  status?: string[]
  dateRange?: [string, string]
  priceMin?: number
  priceMax?: number
  inventoryMin?: number
  inventoryMax?: number
  category?: string
  searchTerm?: string
}

interface SyncMapping {
  netsuiteId: string
  shopifyId?: string
  action: 'create' | 'update' | 'skip'
  conflicts?: string[]
}

const configuredFunctionsBase = import.meta.env.VITE_FUNCTIONS_BASE_URL as string | undefined
const inferredFunctionsBase = import.meta.env.VITE_SUPABASE_URL
  ? `${(import.meta.env.VITE_SUPABASE_URL as string).replace(/\/$/, '')}/functions/v1`
  : undefined
const FUNCTIONS_BASE = configuredFunctionsBase || inferredFunctionsBase || 'http://localhost:54321/functions/v1'

export default function ProductSyncPreview() {
  const { session } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [netsuiteProducts, setNetsuiteProducts] = useState<Product[]>([])
  const [shopifyProducts, setShopifyProducts] = useState<Product[]>([])
  const [mappings, setMappings] = useState<SyncMapping[]>([])
  const [selectedProducts, setSelectedProducts] = useState<string[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [previewModalVisible, setPreviewModalVisible] = useState(false)
  const [previewProduct, setPreviewProduct] = useState<Product | null>(null)
  const [syncDirection, setSyncDirection] = useState<'netsuite-to-shopify' | 'shopify-to-netsuite' | 'bidirectional'>('netsuite-to-shopify')
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)
  const [fetchFilters, setFetchFilters] = useState<FetchFilters>({})
  const [showFilters, setShowFilters] = useState(false)
  const [stagedProducts, setStagedProducts] = useState<Map<string, Product>>(new Map())
  const [editDrawerVisible, setEditDrawerVisible] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [syncingProductId, setSyncingProductId] = useState<string | null>(null)
  const [form] = Form.useForm()

  const loadProducts = async () => {
    if (!session) {
      message.error('Please log in to fetch products')
      return
    }
    
    setLoading(true)
    setError(null)
    setHasLoadedOnce(true)
    
    try {
      const response = await fetch(`${FUNCTIONS_BASE}/fetch-products`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          platforms: ['netsuite', 'shopify'],
          filters: fetchFilters
        })
      })

      if (!response.ok) {
        throw new Error('Failed to fetch products')
      }

      const data = await response.json()
      setNetsuiteProducts(data.netsuite || [])
      setShopifyProducts(data.shopify || [])
      
      // Auto-generate mappings based on SKU
      generateMappings(data.netsuite || [], data.shopify || [])
      message.success(`Loaded ${data.netsuite?.length || 0} NetSuite products and ${data.shopify?.length || 0} Shopify products`)
    } catch (error: any) {
      console.error('Error loading products:', error)
      setError(error.message || 'Failed to load products')
      message.error('Failed to load products. Please check your connections.')
    } finally {
      setLoading(false)
    }
  }

  const stageProduct = (product: Product) => {
    const newStaged = new Map(stagedProducts)
    newStaged.set(product.id, { ...product, staged: true })
    setStagedProducts(newStaged)
    message.success(`${product.name} added to staging area`)
  }

  const unstageProduct = (productId: string) => {
    const newStaged = new Map(stagedProducts)
    newStaged.delete(productId)
    setStagedProducts(newStaged)
    message.info('Product removed from staging area')
  }

  const editProduct = (product: Product) => {
    const stagedProduct = stagedProducts.get(product.id) || product
    setEditingProduct(stagedProduct)
    form.setFieldsValue({
      name: stagedProduct.name,
      sku: stagedProduct.sku,
      price: stagedProduct.price,
      inventory: stagedProduct.inventory,
      description: stagedProduct.description,
      status: stagedProduct.status
    })
    setEditDrawerVisible(true)
  }

  const saveProductEdit = () => {
    const values = form.getFieldsValue()
    if (editingProduct) {
      const updatedProduct = {
        ...editingProduct,
        ...values,
        stagedChanges: values,
        staged: true
      }
      const newStaged = new Map(stagedProducts)
      newStaged.set(editingProduct.id, updatedProduct)
      setStagedProducts(newStaged)
      message.success('Changes saved to staging area')
      setEditDrawerVisible(false)
    }
  }

  const syncSingleProduct = async (product: Product) => {
    if (!session) return
    
    setSyncingProductId(product.id)
    try {
      const productToSync = stagedProducts.get(product.id) || product
      const mapping = mappings.find(m => 
        syncDirection === 'netsuite-to-shopify' 
          ? m.netsuiteId === product.id 
          : m.shopifyId === product.id
      )

      const response = await fetch(`${FUNCTIONS_BASE}/sync-products`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          mappings: [mapping],
          direction: syncDirection,
          product: productToSync.stagedChanges || productToSync
        })
      })

      if (!response.ok) {
        throw new Error('Sync failed')
      }

      const result = await response.json()
      message.success(`${product.name} synced successfully!`)
      
      // Remove from staging after successful sync
      unstageProduct(product.id)
      
      // Refresh products to see updated state
      await loadProducts()
    } catch (error) {
      console.error('Sync error:', error)
      message.error(`Failed to sync ${product.name}`)
    } finally {
      setSyncingProductId(null)
    }
  }

  const generateMappings = (netsuiteItems: Product[], shopifyItems: Product[]) => {
    if (syncDirection === 'netsuite-to-shopify') {
      const shopifyBySku = new Map(shopifyItems.map(p => [p.sku, p]))
      
      const newMappings: SyncMapping[] = netsuiteItems.map(nsProduct => {
        const shopifyMatch = shopifyBySku.get(nsProduct.sku)
        
        return {
          netsuiteId: nsProduct.id,
          shopifyId: shopifyMatch?.id,
          action: shopifyMatch ? 'update' : 'create',
          conflicts: []
        }
      })
      
      setMappings(newMappings)
      setSelectedProducts(newMappings.map(m => m.netsuiteId))
    } else {
      // Shopify to NetSuite direction (reverse mapping)
      const netsuiteBySku = new Map(netsuiteItems.map(p => [p.sku, p]))
      
      const newMappings: SyncMapping[] = shopifyItems.map(shopifyProduct => {
        const netsuiteMatch = netsuiteBySku.get(shopifyProduct.sku)
        
        return {
          netsuiteId: netsuiteMatch?.id || '',
          shopifyId: shopifyProduct.id,
          action: netsuiteMatch ? 'update' : 'create',
          conflicts: []
        }
      })
      
      setMappings(newMappings)
      setSelectedProducts(newMappings.map(m => m.shopifyId!).filter(Boolean))
    }
  }

  const handleSync = async () => {
    if (selectedProducts.length === 0) {
      message.warning('Please select at least one product to sync')
      return
    }

    setSyncing(true)
    try {
      const selectedMappings = syncDirection === 'netsuite-to-shopify'
        ? mappings.filter(m => selectedProducts.includes(m.netsuiteId))
        : mappings.filter(m => m.shopifyId && selectedProducts.includes(m.shopifyId))
      
      const response = await fetch(`${FUNCTIONS_BASE}/sync-products`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({
          mappings: selectedMappings,
          direction: syncDirection
        })
      })

      if (!response.ok) {
        throw new Error('Sync failed')
      }

      const result = await response.json()
      message.success(`Sync completed! ${result.created} created, ${result.updated} updated`)
      
      // Reload products
      await loadProducts()
    } catch (error) {
      console.error('Sync error:', error)
      message.error('Sync failed. Please try again.')
    } finally {
      setSyncing(false)
    }
  }

  const showPreview = (product: Product) => {
    setPreviewProduct(product)
    setPreviewModalVisible(true)
  }

  const sourceProducts = syncDirection === 'netsuite-to-shopify' ? netsuiteProducts : shopifyProducts
  const filteredProducts = sourceProducts.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.sku.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const stats = {
    toCreate: syncDirection === 'netsuite-to-shopify'
      ? mappings.filter(m => m.action === 'create' && selectedProducts.includes(m.netsuiteId)).length
      : mappings.filter(m => m.action === 'create' && m.shopifyId && selectedProducts.includes(m.shopifyId)).length,
    toUpdate: syncDirection === 'netsuite-to-shopify'
      ? mappings.filter(m => m.action === 'update' && selectedProducts.includes(m.netsuiteId)).length
      : mappings.filter(m => m.action === 'update' && m.shopifyId && selectedProducts.includes(m.shopifyId)).length,
    total: selectedProducts.length,
    staged: stagedProducts.size
  }

  const columns = [
    {
      title: 'Select',
      key: 'select',
      width: 60,
      render: (_: any, record: Product) => (
        <Checkbox
          checked={selectedProducts.includes(record.id)}
          onChange={(e) => {
            if (e.target.checked) {
              setSelectedProducts([...selectedProducts, record.id])
            } else {
              setSelectedProducts(selectedProducts.filter(id => id !== record.id))
            }
          }}
        />
      )
    },
    {
      title: 'SKU',
      dataIndex: 'sku',
      key: 'sku',
      width: 120,
    },
    {
      title: 'Product Name',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: Product) => (
        <Space>
          <Text strong>{name}</Text>
          <Button 
            type="link" 
            size="small" 
            icon={<EyeOutlined />}
            onClick={() => showPreview(record)}
          >
            Preview
          </Button>
        </Space>
      )
    },
    {
      title: 'Price',
      dataIndex: 'price',
      key: 'price',
      width: 100,
      render: (price: number) => `$${price?.toFixed(2) || '0.00'}`
    },
    {
      title: 'Inventory',
      dataIndex: 'inventory',
      key: 'inventory',
      width: 100,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => (
        <Tag color={status === 'active' ? 'green' : 'orange'}>{status}</Tag>
      )
    },
    {
      title: 'Action',
      key: 'action',
      width: 100,
      render: (_: any, record: Product) => {
        const mapping = mappings.find(m => m.netsuiteId === record.id)
        return (
          <Tag color={mapping?.action === 'create' ? 'blue' : 'orange'}>
            {mapping?.action === 'create' ? 'Create New' : 'Update Existing'}
          </Tag>
        )
      }
    },
    {
      title: 'Shopify Match',
      key: 'match',
      width: 120,
      render: (_: any, record: Product) => {
        const mapping = mappings.find(m => m.netsuiteId === record.id)
        const shopifyProduct = shopifyProducts.find(p => p.id === mapping?.shopifyId)
        
        if (shopifyProduct) {
          return (
            <Space direction="vertical" size="small">
              <CheckCircleOutlined style={{ color: '#52c41a' }} />
              <Text type="secondary" style={{ fontSize: '12px' }}>{shopifyProduct.name.substring(0, 20)}...</Text>
            </Space>
          )
        }
        return <Text type="secondary">No match</Text>
      }
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 200,
      fixed: 'right' as const,
      render: (_: any, record: Product) => {
        const isStaged = stagedProducts.has(record.id)
        const isSyncing = syncingProductId === record.id
        
        return (
          <Space size="small">
            {!isStaged ? (
              <Button
                size="small"
                icon={<SaveOutlined />}
                onClick={() => stageProduct(record)}
              >
                Stage
              </Button>
            ) : (
              <Tag color="blue">Staged</Tag>
            )}
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => editProduct(record)}
            >
              Edit
            </Button>
            <Button
              type="primary"
              size="small"
              icon={<ArrowRightOutlined />}
              onClick={() => syncSingleProduct(record)}
              loading={isSyncing}
              disabled={!isStaged}
            >
              Sync
            </Button>
          </Space>
        )
      }
    }
  ]

  // Show error state
  if (error) {
    return (
      <div style={{ padding: '24px' }}>
        <Alert
          message="Error Loading Products"
          description={error}
          type="error"
          showIcon
          action={
            <Button onClick={loadProducts} loading={loading}>
              Retry
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div style={{ padding: '24px' }}>
      <Card>
        <Title level={3}>
          <SyncOutlined spin={loading} /> Product Sync Preview
        </Title>
        <Paragraph>
          Configure your sync settings and fetch products to preview the synchronization.
        </Paragraph>

        {/* Sync Settings Card - Always Visible */}
        <Card style={{ marginBottom: 24, backgroundColor: '#f0f5ff' }}>
          <Space direction="vertical" style={{ width: '100%' }} size="large">
            {/* Sync Direction Selector */}
            <div>
              <Text strong style={{ fontSize: '16px', display: 'block', marginBottom: 12 }}>1. Select Sync Direction:</Text>
              <Radio.Group
                value={syncDirection}
                onChange={(e) => {
                  setSyncDirection(e.target.value)
                  if (hasLoadedOnce) {
                    generateMappings(netsuiteProducts, shopifyProducts)
                  }
                }}
                buttonStyle="solid"
                size="large"
              >
                <Radio.Button value="netsuite-to-shopify">
                  <Space>
                    <DatabaseOutlined />
                    NetSuite → Shopify
                  </Space>
                </Radio.Button>
                <Radio.Button value="shopify-to-netsuite">
                  <Space>
                    Shopify → NetSuite
                  </Space>
                </Radio.Button>
                <Radio.Button value="bidirectional">
                  <Space>
                    <SwapOutlined />
                    Bidirectional
                  </Space>
                </Radio.Button>
              </Radio.Group>
              <Alert
                message={
                  syncDirection === 'netsuite-to-shopify'
                    ? 'Products from NetSuite will be created or updated in Shopify'
                    : syncDirection === 'shopify-to-netsuite'
                    ? 'Products from Shopify will be created or updated in NetSuite'
                    : 'Products will be synced in both directions based on last modified date'
                }
                type="info"
                showIcon
                style={{ marginTop: 12 }}
              />
            </div>

            {/* Filters */}
            <div>
              <Space style={{ marginBottom: 12 }}>
                <Text strong style={{ fontSize: '16px' }}>2. Configure Filters (Optional):</Text>
                <Button
                  size="small"
                  icon={<FilterOutlined />}
                  onClick={() => setShowFilters(!showFilters)}
                >
                  {showFilters ? 'Hide Filters' : 'Show Filters'}
                </Button>
              </Space>
              {showFilters && (
                <Card size="small" style={{ backgroundColor: '#fff' }}>
                  <Row gutter={16}>
                    <Col span={12}>
                      <Space direction="vertical" style={{ width: '100%' }}>
                        <Text strong>Product Status:</Text>
                        <Select
                          mode="multiple"
                          placeholder="Select status"
                          style={{ width: '100%' }}
                          value={fetchFilters.status}
                          onChange={(value) => setFetchFilters({ ...fetchFilters, status: value })}
                        >
                          <Select.Option value="active">Active</Select.Option>
                          <Select.Option value="draft">Draft</Select.Option>
                          <Select.Option value="archived">Archived</Select.Option>
                        </Select>
                      </Space>
                    </Col>
                    <Col span={12}>
                      <Space direction="vertical" style={{ width: '100%' }}>
                        <Text strong>Price Range:</Text>
                        <Space>
                          <InputNumber
                            placeholder="Min"
                            prefix="$"
                            value={fetchFilters.priceMin}
                            onChange={(value) => setFetchFilters({ ...fetchFilters, priceMin: value || undefined })}
                          />
                          <Text>to</Text>
                          <InputNumber
                            placeholder="Max"
                            prefix="$"
                            value={fetchFilters.priceMax}
                            onChange={(value) => setFetchFilters({ ...fetchFilters, priceMax: value || undefined })}
                          />
                        </Space>
                      </Space>
                    </Col>
                  </Row>
                  <Row gutter={16} style={{ marginTop: 16 }}>
                    <Col span={12}>
                      <Space direction="vertical" style={{ width: '100%' }}>
                        <Text strong>Inventory Range:</Text>
                        <Space>
                          <InputNumber
                            placeholder="Min"
                            value={fetchFilters.inventoryMin}
                            onChange={(value) => setFetchFilters({ ...fetchFilters, inventoryMin: value || undefined })}
                          />
                          <Text>to</Text>
                          <InputNumber
                            placeholder="Max"
                            value={fetchFilters.inventoryMax}
                            onChange={(value) => setFetchFilters({ ...fetchFilters, inventoryMax: value || undefined })}
                          />
                        </Space>
                      </Space>
                    </Col>
                    <Col span={12}>
                      <Space direction="vertical" style={{ width: '100%' }}>
                        <Text strong>Search Term:</Text>
                        <Input
                          placeholder="Search in product name or SKU"
                          value={fetchFilters.searchTerm}
                          onChange={(e) => setFetchFilters({ ...fetchFilters, searchTerm: e.target.value })}
                        />
                      </Space>
                    </Col>
                  </Row>
                  <Row style={{ marginTop: 16 }}>
                    <Button
                      size="small"
                      onClick={() => setFetchFilters({})}
                    >
                      Clear Filters
                    </Button>
                  </Row>
                </Card>
              )}
            </div>

            {/* Fetch Products Button */}
            <div>
              <Text strong style={{ fontSize: '16px', display: 'block', marginBottom: 12 }}>3. Fetch Products:</Text>
              <Button
                type="primary"
                size="large"
                icon={<SyncOutlined spin={loading} />}
                onClick={loadProducts}
                loading={loading}
                disabled={!session}
              >
                {loading ? 'Fetching Products...' : hasLoadedOnce ? 'Refresh Products' : 'Fetch Products from Both Platforms'}
              </Button>
              {!session && (
                <Alert
                  message="Please log in to fetch products"
                  type="warning"
                  showIcon
                  style={{ marginTop: 12 }}
                />
              )}
            </div>
          </Space>
        </Card>

        {/* Statistics - Only show after products are loaded */}
        {hasLoadedOnce && (
          <Row gutter={16} style={{ marginBottom: 24 }}>
            <Col span={4}>
              <Card>
                <Statistic
                  title="Total Products"
                  value={sourceProducts.length}
                  prefix={<DatabaseOutlined />}
                />
              </Card>
            </Col>
            <Col span={5}>
              <Card>
                <Statistic
                  title="Staged for Sync"
                  value={stats.staged}
                  valueStyle={{ color: '#1890ff' }}
                  prefix={<SaveOutlined />}
                />
              </Card>
            </Col>
            <Col span={5}>
              <Card>
                <Statistic
                  title="Selected"
                  value={stats.total}
                  prefix={<CheckCircleOutlined />}
                />
              </Card>
            </Col>
            <Col span={5}>
              <Card>
                <Statistic
                  title="New Products"
                  value={stats.toCreate}
                  valueStyle={{ color: '#52c41a' }}
                />
              </Card>
            </Col>
            <Col span={5}>
              <Card>
                <Statistic
                  title="Updates"
                  value={stats.toUpdate}
                  valueStyle={{ color: '#faad14' }}
                />
              </Card>
            </Col>
          </Row>
        )}

        {/* Actions & Products Table - Only show after products are loaded */}
        {hasLoadedOnce && (
          <>
            <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
              <Space>
                <Search
                  placeholder="Search products..."
                  allowClear
                  style={{ width: 300 }}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  prefix={<SearchOutlined />}
                />
                <Button icon={<FilterOutlined />}>Filters</Button>
              </Space>
              <Space>
                <Button onClick={loadProducts} loading={loading}>
                  Refresh
                </Button>
                <Button
                  type="primary"
                  icon={<ArrowRightOutlined />}
                  onClick={handleSync}
                  loading={syncing}
                  disabled={selectedProducts.length === 0}
                >
                  Sync {selectedProducts.length} Products
                </Button>
              </Space>
            </Space>

            {/* Products Table */}
            {loading ? (
              <div style={{ textAlign: 'center', padding: '60px' }}>
                <Spin size="large" />
                <Paragraph style={{ marginTop: 16 }}>Loading products from NetSuite and Shopify...</Paragraph>
              </div>
            ) : (
              <Table
                columns={columns}
                dataSource={filteredProducts}
                rowKey="id"
                pagination={{
                  pageSize: 20,
                  showSizeChanger: true,
                  showTotal: (total) => `Total ${total} products`
                }}
              />
            )}
          </>
        )}

        {/* Initial State - Before First Fetch */}
        {!hasLoadedOnce && !loading && (
          <div style={{ textAlign: 'center', padding: '60px' }}>
            <DatabaseOutlined style={{ fontSize: '64px', color: '#d9d9d9', marginBottom: 16 }} />
            <Title level={4} type="secondary">Ready to Fetch Products</Title>
            <Paragraph type="secondary">
              Configure your sync direction above and click "Fetch Products" to get started.
            </Paragraph>
          </div>
        )}

        {/* Preview Modal */}
        <Modal
          title="Product Preview"
          open={previewModalVisible}
          onCancel={() => setPreviewModalVisible(false)}
          footer={null}
          width={800}
        >
          {previewProduct && (
            <div>
              <Row gutter={16}>
                <Col span={12}>
                  <Card title="NetSuite" size="small">
                    {previewProduct.image && (
                      <img src={previewProduct.image} alt={previewProduct.name} style={{ width: '100%', marginBottom: 16 }} />
                    )}
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <div><Text strong>Name:</Text> {previewProduct.name}</div>
                      <div><Text strong>SKU:</Text> {previewProduct.sku}</div>
                      <div><Text strong>Price:</Text> ${previewProduct.price?.toFixed(2)}</div>
                      <div><Text strong>Inventory:</Text> {previewProduct.inventory}</div>
                      <div><Text strong>Status:</Text> <Tag>{previewProduct.status}</Tag></div>
                      {previewProduct.description && (
                        <div><Text strong>Description:</Text> <Paragraph ellipsis={{ rows: 3 }}>{previewProduct.description}</Paragraph></div>
                      )}
                    </Space>
                  </Card>
                </Col>
                <Col span={12}>
                  <Card title="Will Sync To Shopify As" size="small">
                    <Alert
                      message={mappings.find(m => m.netsuiteId === previewProduct.id)?.action === 'create' ? 'New Product' : 'Update Existing'}
                      type={mappings.find(m => m.netsuiteId === previewProduct.id)?.action === 'create' ? 'info' : 'warning'}
                      showIcon
                      style={{ marginBottom: 16 }}
                    />
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <div><Text strong>Title:</Text> {previewProduct.name}</div>
                      <div><Text strong>SKU:</Text> {previewProduct.sku}</div>
                      <div><Text strong>Price:</Text> ${previewProduct.price?.toFixed(2)}</div>
                      <div><Text strong>Inventory:</Text> {previewProduct.inventory} units</div>
                      <div><Text strong>Status:</Text> {previewProduct.status === 'active' ? 'Active' : 'Draft'}</div>
                    </Space>
                  </Card>
                </Col>
              </Row>
            </div>
          )}
        </Modal>

        {/* Edit Product Drawer */}
        <Drawer
          title="Edit Product"
          width={600}
          open={editDrawerVisible}
          onClose={() => setEditDrawerVisible(false)}
          extra={
            <Space>
              <Button onClick={() => setEditDrawerVisible(false)} icon={<CloseOutlined />}>
                Cancel
              </Button>
              <Button type="primary" onClick={saveProductEdit} icon={<SaveOutlined />}>
                Save to Staging
              </Button>
            </Space>
          }
        >
          {editingProduct && (
            <Form form={form} layout="vertical">
              <Alert
                message="Editing in Staging Area"
                description="Changes will be saved to the staging area. Click 'Sync' to push changes to Shopify."
                type="info"
                showIcon
                style={{ marginBottom: 24 }}
              />
              
              <Form.Item label="Product Name" name="name" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              
              <Form.Item label="SKU" name="sku" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item label="Price" name="price" rules={[{ required: true }]}>
                    <InputNumber
                      prefix="$"
                      style={{ width: '100%' }}
                      min={0}
                      step={0.01}
                      precision={2}
                    />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="Inventory" name="inventory" rules={[{ required: true }]}>
                    <InputNumber
                      style={{ width: '100%' }}
                      min={0}
                    />
                  </Form.Item>
                </Col>
              </Row>
              
              <Form.Item label="Status" name="status" rules={[{ required: true }]}>
                <Select>
                  <Select.Option value="active">Active</Select.Option>
                  <Select.Option value="draft">Draft</Select.Option>
                  <Select.Option value="archived">Archived</Select.Option>
                </Select>
              </Form.Item>
              
              <Form.Item label="Description" name="description">
                <Input.TextArea rows={4} />
              </Form.Item>
            </Form>
          )}
        </Drawer>
      </Card>
    </div>
  )
}

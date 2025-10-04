import { useState, useEffect } from 'react'
import { Card, Table, Button, Space, Tag, Spin, Alert, Typography, Row, Col, Select, Input, Checkbox, Statistic, Tabs, Modal, message, Radio, DatePicker, InputNumber, Collapse, Drawer, Form } from 'antd'
import { SyncOutlined, CheckCircleOutlined, ExclamationCircleOutlined, SearchOutlined, FilterOutlined, ArrowRightOutlined, EyeOutlined, SwapOutlined, DatabaseOutlined, EditOutlined, SaveOutlined, CloseOutlined, PlusCircleOutlined } from '@ant-design/icons'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import dayjs from 'dayjs'

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
  
  // Extended NetSuite fields
  basePrice?: number
  msrp?: number
  cost?: number
  priceLevels?: Record<string, number>
  manufacturer?: string
  vendor?: string
  brand?: string
  productGroup?: string
  division?: string
  subsidiary?: string
  productType?: string
  category?: string
  weight?: number
  weightUnit?: string
  upcCode?: string
  customFields?: any[]
  createdAt?: string
  updatedAt?: string
  
  // Inventory fields
  quantityAvailable?: number
  quantityOnHand?: number
  quantityBackOrdered?: number
  quantityCommitted?: number
  quantityOnOrder?: number
  reorderPoint?: number
  preferredStockLevel?: number
  
  // System fields
  internalId?: string
  externalId?: string
}

interface FetchFilters {
  status?: string[]
  dateFrom?: string
  dateTo?: string
  priceMin?: number
  priceMax?: number
  inventoryMin?: number
  inventoryMax?: number
  category?: string
  searchTerm?: string
  itemId?: string
  vendor?: string
  productType?: string
  tags?: string[]
  updatedAfter?: string
  createdAfter?: string
  hasImage?: boolean
  isActive?: boolean
  skuPattern?: string
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
  const [detailsDrawerVisible, setDetailsDrawerVisible] = useState(false)
  const [detailsProduct, setDetailsProduct] = useState<Product | null>(null)
  const [form] = Form.useForm()
  const [addingToSyncList, setAddingToSyncList] = useState<string | null>(null)

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

  const showDetails = (product: Product) => {
    setDetailsProduct(product)
    setDetailsDrawerVisible(true)
  }

  const addToSyncList = async (product: Product) => {
    if (!session) {
      message.error('Please log in to add items to sync list')
      return
    }
    
    setAddingToSyncList(product.id)
    try {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) throw new Error('User not found')

      // Check if item already exists in sync list
      const { data: existing } = await supabase
        .from('sync_list')
        .select('id')
        .eq('user_id', userData.user.id)
        .eq('item_type', 'product')
        .eq('source_platform', product.platform)
        .eq('source_id', product.id)
        .single()

      if (existing) {
        message.warning('This product is already in your sync list')
        return
      }

      // Add to sync list
      const { error } = await supabase
        .from('sync_list')
        .insert({
          user_id: userData.user.id,
          item_type: 'product',
          source_platform: product.platform,
          target_platform: syncDirection === 'netsuite-to-shopify' ? 'shopify' : 'netsuite',
          source_id: product.id,
          sync_mode: 'delta',
          is_active: true,
          filter_config: fetchFilters,
          metadata: {
            name: product.name,
            sku: product.sku,
            price: product.price
          }
        })

      if (error) throw error

      message.success(`${product.name} added to sync list`)
    } catch (error: any) {
      console.error('Error adding to sync list:', error)
      message.error(error.message || 'Failed to add to sync list')
    } finally {
      setAddingToSyncList(null)
    }
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
      width: 340,
      fixed: 'right' as const,
      render: (_: any, record: Product) => {
        const isStaged = stagedProducts.has(record.id)
        const isSyncing = syncingProductId === record.id
        
        return (
          <Space size="small" wrap>
            <Button
              size="small"
              icon={<DatabaseOutlined />}
              onClick={() => showDetails(record)}
            >
              Details
            </Button>
            <Button
              size="small"
              icon={<PlusCircleOutlined />}
              onClick={() => addToSyncList(record)}
              loading={addingToSyncList === record.id}
              type="dashed"
            >
              Add to Sync List
            </Button>
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
                  <Collapse
                    defaultActiveKey={['basic']}
                    items={[
                      {
                        key: 'basic',
                        label: <Text strong>Basic Filters</Text>,
                        children: (
                          <>
                            <Alert
                              message="Search Tips"
                              description={
                                <ul style={{ margin: 0, paddingLeft: '20px' }}>
                                  <li><strong>Item ID:</strong> Enter a NetSuite internal ID (e.g., 42782) or Shopify product ID to fetch a single product</li>
                                  <li><strong>Search Term:</strong> Search by SKU, product name, or description across all item types (inventory, non-inventory, assembly, service)</li>
                                  <li><strong>SKU Pattern:</strong> Use wildcards (*) for flexible SKU matching (e.g., PROD-*-2024)</li>
                                </ul>
                              }
                              type="info"
                              showIcon
                              closable
                              style={{ marginBottom: 16 }}
                            />
                            <Row gutter={16}>
                              <Col span={12}>
                                <Space direction="vertical" style={{ width: '100%' }}>
                                  <Text strong>Item ID (Single Product):</Text>
                                  <Input
                                    placeholder="e.g., 42782 (NetSuite ID) or 123456789 (Shopify ID)"
                                    value={fetchFilters.itemId}
                                    onChange={(e) => setFetchFilters({ ...fetchFilters, itemId: e.target.value })}
                                    allowClear
                                  />
                                  <Text type="secondary" style={{ fontSize: '12px' }}>Searches all NetSuite item types automatically</Text>
                                </Space>
                              </Col>
                              <Col span={12}>
                                <Space direction="vertical" style={{ width: '100%' }}>
                                  <Text strong>Product Status:</Text>
                                  <Select
                                    mode="multiple"
                                    placeholder="All statuses"
                                    style={{ width: '100%' }}
                                    value={fetchFilters.status}
                                    onChange={(value) => setFetchFilters({ ...fetchFilters, status: value })}
                                    disabled={!!fetchFilters.itemId}
                                  >
                                    <Select.Option value="active">Active</Select.Option>
                                    <Select.Option value="draft">Draft</Select.Option>
                                    <Select.Option value="archived">Archived</Select.Option>
                                  </Select>
                                </Space>
                              </Col>
                            </Row>
                            <Row gutter={16} style={{ marginTop: 16 }}>
                              <Col span={12}>
                                <Space direction="vertical" style={{ width: '100%' }}>
                                  <Text strong>Search Term:</Text>
                                  <Input
                                    placeholder="e.g., Widget, PROD-123, Acme Products"
                                    value={fetchFilters.searchTerm}
                                    onChange={(e) => setFetchFilters({ ...fetchFilters, searchTerm: e.target.value })}
                                    disabled={!!fetchFilters.itemId}
                                    prefix={<SearchOutlined />}
                                  />
                                  <Text type="secondary" style={{ fontSize: '12px' }}>Searches across SKU, name, and description in all item types</Text>
                                </Space>
                              </Col>
                              <Col span={12}>
                                <Space direction="vertical" style={{ width: '100%' }}>
                                  <Text strong>SKU Pattern:</Text>
                                  <Input
                                    placeholder="e.g., PROD-*, *-2024"
                                    value={fetchFilters.skuPattern}
                                    onChange={(e) => setFetchFilters({ ...fetchFilters, skuPattern: e.target.value })}
                                    disabled={!!fetchFilters.itemId}
                                  />
                                  <Text type="secondary" style={{ fontSize: '12px' }}>Use * as wildcard</Text>
                                </Space>
                              </Col>
                            </Row>
                          </>
                        )
                      },
                      {
                        key: 'pricing',
                        label: <Text strong>Pricing & Inventory</Text>,
                        children: (
                          <>
                            <Row gutter={16}>
                              <Col span={12}>
                                <Space direction="vertical" style={{ width: '100%' }}>
                                  <Text strong>Price Range:</Text>
                                  <Space>
                                    <InputNumber
                                      placeholder="Min"
                                      prefix="$"
                                      value={fetchFilters.priceMin}
                                      onChange={(value) => setFetchFilters({ ...fetchFilters, priceMin: value || undefined })}
                                      disabled={!!fetchFilters.itemId}
                                      style={{ width: '140px' }}
                                    />
                                    <Text>to</Text>
                                    <InputNumber
                                      placeholder="Max"
                                      prefix="$"
                                      value={fetchFilters.priceMax}
                                      onChange={(value) => setFetchFilters({ ...fetchFilters, priceMax: value || undefined })}
                                      disabled={!!fetchFilters.itemId}
                                      style={{ width: '140px' }}
                                    />
                                  </Space>
                                </Space>
                              </Col>
                              <Col span={12}>
                                <Space direction="vertical" style={{ width: '100%' }}>
                                  <Text strong>Inventory Range:</Text>
                                  <Space>
                                    <InputNumber
                                      placeholder="Min"
                                      value={fetchFilters.inventoryMin}
                                      onChange={(value) => setFetchFilters({ ...fetchFilters, inventoryMin: value || undefined })}
                                      disabled={!!fetchFilters.itemId}
                                      style={{ width: '140px' }}
                                    />
                                    <Text>to</Text>
                                    <InputNumber
                                      placeholder="Max"
                                      value={fetchFilters.inventoryMax}
                                      onChange={(value) => setFetchFilters({ ...fetchFilters, inventoryMax: value || undefined })}
                                      disabled={!!fetchFilters.itemId}
                                      style={{ width: '140px' }}
                                    />
                                  </Space>
                                </Space>
                              </Col>
                            </Row>
                          </>
                        )
                      },
                      {
                        key: 'classification',
                        label: <Text strong>Product Classification</Text>,
                        children: (
                          <>
                            <Row gutter={16}>
                              <Col span={12}>
                                <Space direction="vertical" style={{ width: '100%' }}>
                                  <Text strong>Vendor/Brand:</Text>
                                  <Input
                                    placeholder="Enter vendor or brand name"
                                    value={fetchFilters.vendor}
                                    onChange={(e) => setFetchFilters({ ...fetchFilters, vendor: e.target.value })}
                                    disabled={!!fetchFilters.itemId}
                                  />
                                </Space>
                              </Col>
                              <Col span={12}>
                                <Space direction="vertical" style={{ width: '100%' }}>
                                  <Text strong>Product Type/Category:</Text>
                                  <Input
                                    placeholder="e.g., Electronics, Apparel"
                                    value={fetchFilters.productType}
                                    onChange={(e) => setFetchFilters({ ...fetchFilters, productType: e.target.value })}
                                    disabled={!!fetchFilters.itemId}
                                  />
                                </Space>
                              </Col>
                            </Row>
                            <Row gutter={16} style={{ marginTop: 16 }}>
                              <Col span={12}>
                                <Space direction="vertical" style={{ width: '100%' }}>
                                  <Text strong>Tags:</Text>
                                  <Select
                                    mode="tags"
                                    placeholder="Enter tags (comma-separated)"
                                    style={{ width: '100%' }}
                                    value={fetchFilters.tags}
                                    onChange={(value) => setFetchFilters({ ...fetchFilters, tags: value })}
                                    disabled={!!fetchFilters.itemId}
                                    tokenSeparators={[',']}
                                  />
                                  <Text type="secondary" style={{ fontSize: '12px' }}>Products must have ALL these tags</Text>
                                </Space>
                              </Col>
                              <Col span={12}>
                                <Space direction="vertical" style={{ width: '100%' }}>
                                  <Checkbox
                                    checked={fetchFilters.hasImage}
                                    onChange={(e) => setFetchFilters({ ...fetchFilters, hasImage: e.target.checked || undefined })}
                                    disabled={!!fetchFilters.itemId}
                                  >
                                    <Text strong>Only products with images</Text>
                                  </Checkbox>
                                </Space>
                              </Col>
                            </Row>
                          </>
                        )
                      },
                      {
                        key: 'dates',
                        label: <Text strong>Date Filters</Text>,
                        children: (
                          <>
                            <Row gutter={16}>
                              <Col span={12}>
                                <Space direction="vertical" style={{ width: '100%' }}>
                                  <Text strong>Created After:</Text>
                                  <DatePicker
                                    style={{ width: '100%' }}
                                    placeholder="Select date"
                                    value={fetchFilters.createdAfter ? dayjs(fetchFilters.createdAfter) : null}
                                    onChange={(date) => setFetchFilters({ ...fetchFilters, createdAfter: date?.toISOString() })}
                                    disabled={!!fetchFilters.itemId}
                                  />
                                  <Text type="secondary" style={{ fontSize: '12px' }}>Products created on or after this date</Text>
                                </Space>
                              </Col>
                              <Col span={12}>
                                <Space direction="vertical" style={{ width: '100%' }}>
                                  <Text strong>Updated After:</Text>
                                  <DatePicker
                                    style={{ width: '100%' }}
                                    placeholder="Select date"
                                    value={fetchFilters.updatedAfter ? dayjs(fetchFilters.updatedAfter) : null}
                                    onChange={(date) => setFetchFilters({ ...fetchFilters, updatedAfter: date?.toISOString() })}
                                    disabled={!!fetchFilters.itemId}
                                  />
                                  <Text type="secondary" style={{ fontSize: '12px' }}>Products modified on or after this date</Text>
                                </Space>
                              </Col>
                            </Row>
                            <Row gutter={16} style={{ marginTop: 16 }}>
                              <Col span={24}>
                                <Space direction="vertical" style={{ width: '100%' }}>
                                  <Text strong>Date Range:</Text>
                                  <RangePicker
                                    style={{ width: '100%' }}
                                    value={[
                                      fetchFilters.dateFrom ? dayjs(fetchFilters.dateFrom) : null,
                                      fetchFilters.dateTo ? dayjs(fetchFilters.dateTo) : null
                                    ]}
                                    onChange={(dates) => {
                                      setFetchFilters({
                                        ...fetchFilters,
                                        dateFrom: dates?.[0]?.toISOString(),
                                        dateTo: dates?.[1]?.toISOString()
                                      })
                                    }}
                                    disabled={!!fetchFilters.itemId}
                                  />
                                  <Text type="secondary" style={{ fontSize: '12px' }}>Filter by last modified date range</Text>
                                </Space>
                              </Col>
                            </Row>
                          </>
                        )
                      }
                    ]}
                  />
                  <Row style={{ marginTop: 16 }}>
                    <Space>
                      <Button
                        icon={<CloseOutlined />}
                        onClick={() => setFetchFilters({})}
                      >
                        Clear All Filters
                      </Button>
                      <Text type="secondary">
                        {Object.keys(fetchFilters).length > 0 && `${Object.keys(fetchFilters).length} filter(s) active`}
                      </Text>
                    </Space>
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

        {/* Product Details Drawer */}
        <Drawer
          title={<Space><DatabaseOutlined /> Product Details</Space>}
          width={800}
          open={detailsDrawerVisible}
          onClose={() => setDetailsDrawerVisible(false)}
        >
          {detailsProduct && (
            <div>
              <Tabs defaultActiveKey="overview">
                <TabPane tab="Overview" key="overview">
                  <Card size="small" style={{ marginBottom: 16 }}>
                    <Space direction="vertical" style={{ width: '100%' }} size="large">
                      {detailsProduct.image && (
                        <img src={detailsProduct.image} alt={detailsProduct.name} style={{ width: '100%', maxWidth: '300px' }} />
                      )}
                      <div>
                        <Title level={4}>{detailsProduct.name}</Title>
                        <Tag color={detailsProduct.status === 'active' ? 'green' : 'orange'}>{detailsProduct.status}</Tag>
                      </div>
                      <Row gutter={16}>
                        <Col span={12}><Text strong>SKU:</Text> {detailsProduct.sku}</Col>
                        <Col span={12}><Text strong>ID:</Text> {detailsProduct.id}</Col>
                      </Row>
                      {detailsProduct.description && (
                        <div>
                          <Text strong>Description:</Text>
                          <Paragraph>{detailsProduct.description}</Paragraph>
                        </div>
                      )}
                    </Space>
                  </Card>
                </TabPane>
                
                <TabPane tab="Pricing" key="pricing">
                  <Card title="Price Information" size="small" style={{ marginBottom: 16 }}>
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <Row gutter={16}>
                        <Col span={12}>
                          <Statistic title="Base Price" value={detailsProduct.basePrice || detailsProduct.price} prefix="$" precision={2} />
                        </Col>
                        <Col span={12}>
                          <Statistic title="Cost" value={detailsProduct.cost || 0} prefix="$" precision={2} />
                        </Col>
                      </Row>
                      {detailsProduct.msrp && (
                        <Row gutter={16}>
                          <Col span={12}>
                            <Statistic title="MSRP" value={detailsProduct.msrp} prefix="$" precision={2} />
                          </Col>
                        </Row>
                      )}
                    </Space>
                  </Card>
                  
                  {detailsProduct.priceLevels && Object.keys(detailsProduct.priceLevels).length > 0 && (
                    <Card title="Price Levels" size="small">
                      <Space direction="vertical" style={{ width: '100%' }}>
                        {Object.entries(detailsProduct.priceLevels).map(([level, price]) => (
                          <Row key={level} gutter={16} style={{ borderBottom: '1px solid #f0f0f0', padding: '8px 0' }}>
                            <Col span={12}>
                              <Text strong>{level}</Text>
                            </Col>
                            <Col span={12} style={{ textAlign: 'right' }}>
                              <Text>${(price as number).toFixed(2)}</Text>
                            </Col>
                          </Row>
                        ))}
                      </Space>
                    </Card>
                  )}
                </TabPane>
                
                <TabPane tab="Classification" key="classification">
                  <Space direction="vertical" style={{ width: '100%' }} size="middle">
                    <Card size="small">
                      <Row gutter={[16, 16]}>
                        <Col span={12}>
                          <Text type="secondary">Manufacturer:</Text><br />
                          <Text strong>{detailsProduct.manufacturer || 'N/A'}</Text>
                        </Col>
                        <Col span={12}>
                          <Text type="secondary">Vendor:</Text><br />
                          <Text strong>{detailsProduct.vendor || 'N/A'}</Text>
                        </Col>
                        <Col span={12}>
                          <Text type="secondary">Brand:</Text><br />
                          <Text strong>{detailsProduct.brand || 'N/A'}</Text>
                        </Col>
                        <Col span={12}>
                          <Text type="secondary">Product Group/Class:</Text><br />
                          <Text strong>{detailsProduct.productGroup || 'N/A'}</Text>
                        </Col>
                        <Col span={12}>
                          <Text type="secondary">Division/Department:</Text><br />
                          <Text strong>{detailsProduct.division || 'N/A'}</Text>
                        </Col>
                        <Col span={12}>
                          <Text type="secondary">Subsidiary:</Text><br />
                          <Text strong>{detailsProduct.subsidiary || 'N/A'}</Text>
                        </Col>
                        <Col span={12}>
                          <Text type="secondary">Product Type:</Text><br />
                          <Text strong>{detailsProduct.productType || 'N/A'}</Text>
                        </Col>
                        <Col span={12}>
                          <Text type="secondary">Category:</Text><br />
                          <Text strong>{detailsProduct.category || 'N/A'}</Text>
                        </Col>
                      </Row>
                    </Card>
                  </Space>
                </TabPane>
                
                <TabPane tab="Inventory" key="inventory">
                  <Card title="Inventory Summary" size="small" style={{ marginBottom: 16 }}>
                    <Row gutter={16}>
                      <Col span={8}>
                        <Statistic 
                          title="Available" 
                          value={detailsProduct.quantityAvailable ?? detailsProduct.inventory ?? 0} 
                          valueStyle={{ color: '#3f8600' }}
                        />
                      </Col>
                      <Col span={8}>
                        <Statistic 
                          title="On Hand" 
                          value={detailsProduct.quantityOnHand ?? 0} 
                        />
                      </Col>
                      <Col span={8}>
                        <Statistic 
                          title="Committed" 
                          value={detailsProduct.quantityCommitted ?? 0} 
                          valueStyle={{ color: '#cf1322' }}
                        />
                      </Col>
                    </Row>
                    <Row gutter={16} style={{ marginTop: 16 }}>
                      <Col span={8}>
                        <Statistic 
                          title="On Order" 
                          value={detailsProduct.quantityOnOrder ?? 0} 
                        />
                      </Col>
                      <Col span={8}>
                        <Statistic 
                          title="Back Ordered" 
                          value={detailsProduct.quantityBackOrdered ?? 0} 
                        />
                      </Col>
                      <Col span={8}>
                        <Statistic 
                          title="Reorder Point" 
                          value={detailsProduct.reorderPoint ?? 0} 
                        />
                      </Col>
                    </Row>
                    {detailsProduct.preferredStockLevel && detailsProduct.preferredStockLevel > 0 && (
                      <Row gutter={16} style={{ marginTop: 16 }}>
                        <Col span={8}>
                          <Statistic 
                            title="Preferred Stock Level" 
                            value={detailsProduct.preferredStockLevel} 
                          />
                        </Col>
                      </Row>
                    )}
                  </Card>
                  
                  <Card title="Product Details" size="small">
                    <Space direction="vertical" style={{ width: '100%' }} size="middle">
                      {(detailsProduct.weight && detailsProduct.weight > 0) && (
                        <div>
                          <Text type="secondary">Weight:</Text><br />
                          <Text strong>{detailsProduct.weight} {detailsProduct.weightUnit || 'lbs'}</Text>
                        </div>
                      )}
                      {detailsProduct.upcCode && (
                        <div>
                          <Text type="secondary">UPC Code:</Text><br />
                          <Text strong>{detailsProduct.upcCode}</Text>
                        </div>
                      )}
                    </Space>
                  </Card>
                </TabPane>
                
                <TabPane tab="System Info" key="system">
                  <Card size="small">
                    <Space direction="vertical" style={{ width: '100%' }} size="middle">
                      <Row gutter={[16, 16]}>
                        <Col span={12}>
                          <Text type="secondary">Platform:</Text><br />
                          <Tag color="blue">{detailsProduct.platform.toUpperCase()}</Tag>
                        </Col>
                        <Col span={12}>
                          <Text type="secondary">Status:</Text><br />
                          <Tag color={detailsProduct.status === 'active' ? 'green' : 'orange'}>
                            {detailsProduct.status.toUpperCase()}
                          </Tag>
                        </Col>
                        <Col span={12}>
                          <Text type="secondary">Internal ID:</Text><br />
                          <Text copyable>{detailsProduct.internalId || detailsProduct.id}</Text>
                        </Col>
                        {detailsProduct.externalId && (
                          <Col span={12}>
                            <Text type="secondary">External ID:</Text><br />
                            <Text copyable>{detailsProduct.externalId}</Text>
                          </Col>
                        )}
                        <Col span={12}>
                          <Text type="secondary">SKU:</Text><br />
                          <Text copyable>{detailsProduct.sku}</Text>
                        </Col>
                        {detailsProduct.createdAt && (
                          <Col span={12}>
                            <Text type="secondary">Created Date:</Text><br />
                            <Text>{new Date(detailsProduct.createdAt).toLocaleString()}</Text>
                          </Col>
                        )}
                        {detailsProduct.updatedAt && (
                          <Col span={12}>
                            <Text type="secondary">Last Modified:</Text><br />
                            <Text>{new Date(detailsProduct.updatedAt).toLocaleString()}</Text>
                          </Col>
                        )}
                        {detailsProduct.lastModified && (
                          <Col span={12}>
                            <Text type="secondary">Last Modified (Alt):</Text><br />
                            <Text>{new Date(detailsProduct.lastModified).toLocaleString()}</Text>
                          </Col>
                        )}
                      </Row>
                      
                      {detailsProduct.customFields && detailsProduct.customFields.length > 0 && (
                        <div style={{ marginTop: 16 }}>
                          <Text strong>Custom Fields ({detailsProduct.customFields.length}):</Text>
                          <div style={{ marginTop: 8, maxHeight: '200px', overflow: 'auto' }}>
                            {detailsProduct.customFields.map((field: any, index: number) => (
                              <div key={index} style={{ padding: '4px 0', borderBottom: '1px solid #f0f0f0' }}>
                                <Text type="secondary">{field.scriptId || field.internalId}:</Text>{' '}
                                <Text>{field.value || 'N/A'}</Text>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </Space>
                  </Card>
                </TabPane>
                
                <TabPane tab="Raw Data" key="raw">
                  <Card size="small">
                    <pre style={{ maxHeight: '500px', overflow: 'auto', fontSize: '12px' }}>
                      {JSON.stringify(detailsProduct.rawData, null, 2)}
                    </pre>
                  </Card>
                </TabPane>
              </Tabs>
            </div>
          )}
        </Drawer>
      </Card>
    </div>
  )
}

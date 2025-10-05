import React, { useState } from 'react'
import {
  Button,
  Modal,
  Form,
  Select,
  Input,
  Space,
  Tag,
  message,
  Progress,
  Card,
  Typography,
  Alert
} from 'antd'
import {
  SyncOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  ShopOutlined,
  DatabaseOutlined
} from '@ant-design/icons'
import { supabase } from '../lib/supabase'

interface Product {
  id: string
  platform: 'netsuite' | 'shopify'
  platform_product_id: string
  name: string
  sku?: string
  last_platform_sync?: string
  is_active: boolean
}

interface QuickProductSyncProps {
  product?: Product
  buttonType?: 'primary' | 'default' | 'text' | 'link'
  buttonSize?: 'small' | 'middle' | 'large'
  showText?: boolean
  onSyncComplete?: (result: any) => void
}

const QuickProductSync: React.FC<QuickProductSyncProps> = ({
  product,
  buttonType = 'default',
  buttonSize = 'small',
  showText = true,
  onSyncComplete
}) => {
  const [isModalVisible, setIsModalVisible] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState(0)
  const [syncResult, setSyncResult] = useState<any>(null)
  const [form] = Form.useForm()

  const showModal = () => {
    setIsModalVisible(true)
    setSyncProgress(0)
    setSyncResult(null)

    // Pre-fill form if product is provided
    if (product) {
      form.setFieldsValue({
        productId: product.platform_product_id,
        platform: product.platform,
        direction: product.platform === 'netsuite' ? 'netsuite_to_shopify' : 'shopify_to_netsuite'
      })
    }
  }

  const handleCancel = () => {
    setIsModalVisible(false)
    setSyncProgress(0)
    setSyncResult(null)
    form.resetFields()
  }

  const handleSync = async (values: any) => {
    setIsSyncing(true)
    setSyncProgress(0)
    setSyncResult(null)

    try {
      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setSyncProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval)
            return 90
          }
          return prev + 10
        })
      }, 200)

      // Call the sync API
      const { data, error } = await supabase.functions.invoke('sync', {
        body: {
          profile: {
            dataTypes: { products: true, inventory: false, orders: false },
            syncDirection: values.direction,
            filters: {
              productIds: [values.productId]
            }
          }
        }
      })

      clearInterval(progressInterval)
      setSyncProgress(100)

      if (error) throw error

      setSyncResult({
        success: true,
        data,
        message: `Successfully synced product ${values.productId}`
      })

      message.success(`Product sync completed successfully!`)

      if (onSyncComplete) {
        onSyncComplete(data)
      }

    } catch (error: any) {
      setSyncResult({
        success: false,
        error: error.message || 'Sync failed',
        message: `Failed to sync product: ${error.message || 'Unknown error'}`
      })

      message.error(`Product sync failed: ${error.message || 'Unknown error'}`)
    } finally {
      setIsSyncing(false)
    }
  }

  const getDirectionIcon = (direction: string) => {
    switch (direction) {
      case 'netsuite_to_shopify':
        return <><DatabaseOutlined /> → <ShopOutlined /></>
      case 'shopify_to_netsuite':
        return <><ShopOutlined /> → <DatabaseOutlined /></>
      case 'bidirectional':
        return <><DatabaseOutlined /> ↔ <ShopOutlined /></>
      default:
        return <SyncOutlined />
    }
  }

  const getDirectionLabel = (direction: string) => {
    switch (direction) {
      case 'netsuite_to_shopify':
        return 'NetSuite → Shopify'
      case 'shopify_to_netsuite':
        return 'Shopify → NetSuite'
      case 'bidirectional':
        return 'Bidirectional'
      default:
        return direction
    }
  }

  return (
    <>
      <Button
        type={buttonType}
        size={buttonSize}
        icon={<SyncOutlined />}
        onClick={showModal}
        disabled={isSyncing}
      >
        {showText && 'Quick Sync'}
      </Button>

      <Modal
        title={
          <Space>
            <SyncOutlined />
            Quick Product Sync
          </Space>
        }
        open={isModalVisible}
        onCancel={handleCancel}
        footer={[
          <Button key="cancel" onClick={handleCancel}>
            Cancel
          </Button>,
          <Button
            key="sync"
            type="primary"
            loading={isSyncing}
            onClick={() => form.submit()}
            icon={<SyncOutlined />}
          >
            {isSyncing ? 'Syncing...' : 'Start Sync'}
          </Button>
        ]}
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSync}
          initialValues={{
            direction: 'bidirectional'
          }}
        >
          <Alert
            message="Quick Product Sync"
            description="Sync an individual product between platforms. This performs a targeted sync operation."
            type="info"
            showIcon
            style={{ marginBottom: '16px' }}
          />

          <Form.Item
            name="productId"
            label="Product ID"
            rules={[{ required: true, message: 'Please enter a product ID' }]}
          >
            <Input
              placeholder="Enter product ID (SKU or platform ID)"
              prefix={<DatabaseOutlined />}
            />
          </Form.Item>

          <Form.Item
            name="platform"
            label="Source Platform"
            rules={[{ required: true, message: 'Please select the source platform' }]}
          >
            <Select placeholder="Select platform">
              <Select.Option value="netsuite">
                <Space>
                  <DatabaseOutlined />
                  NetSuite
                </Space>
              </Select.Option>
              <Select.Option value="shopify">
                <Space>
                  <ShopOutlined />
                  Shopify
                </Space>
              </Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="direction"
            label="Sync Direction"
            rules={[{ required: true, message: 'Please select sync direction' }]}
          >
            <Select placeholder="Select sync direction">
              <Select.Option value="netsuite_to_shopify">
                <Space>
                  {getDirectionIcon('netsuite_to_shopify')}
                  NetSuite → Shopify
                </Space>
              </Select.Option>
              <Select.Option value="shopify_to_netsuite">
                <Space>
                  {getDirectionIcon('shopify_to_netsuite')}
                  Shopify → NetSuite
                </Space>
              </Select.Option>
              <Select.Option value="bidirectional">
                <Space>
                  {getDirectionIcon('bidirectional')}
                  Bidirectional
                </Space>
              </Select.Option>
            </Select>
          </Form.Item>

          <Form.Item name="notes" label="Notes (Optional)">
            <Input.TextArea
              placeholder="Add any notes about this sync operation..."
              rows={2}
            />
          </Form.Item>
        </Form>

        {/* Sync Progress */}
        {(isSyncing || syncProgress > 0) && (
          <Card size="small" style={{ marginTop: '16px' }}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <div>
                <Typography.Text strong>Sync Progress</Typography.Text>
              </div>
              <Progress
                percent={syncProgress}
                status={isSyncing ? 'active' : syncResult?.success ? 'success' : 'exception'}
                strokeColor={syncResult?.success ? '#52c41a' : undefined}
              />
              {isSyncing && (
                <Typography.Text type="secondary">
                  Processing sync operation...
                </Typography.Text>
              )}
            </Space>
          </Card>
        )}

        {/* Sync Result */}
        {syncResult && (
          <Card
            size="small"
            style={{
              marginTop: '16px',
              borderColor: syncResult.success ? '#b7eb8f' : '#ffccc7'
            }}
          >
            <Space direction="vertical" style={{ width: '100%' }}>
              <div>
                <Typography.Text strong>
                  {syncResult.success ? (
                    <Space>
                      <CheckCircleOutlined style={{ color: '#52c41a' }} />
                      Sync Completed Successfully
                    </Space>
                  ) : (
                    <Space>
                      <CloseCircleOutlined style={{ color: '#f5222d' }} />
                      Sync Failed
                    </Space>
                  )}
                </Typography.Text>
              </div>

              <Typography.Text>{syncResult.message}</Typography.Text>

              {syncResult.success && syncResult.data && (
                <div>
                  <Typography.Text strong>Results:</Typography.Text>
                  <div style={{ marginTop: '8px' }}>
                    <Space wrap>
                      <Tag color="blue">
                        Processed: {syncResult.data.itemsProcessed || 0}
                      </Tag>
                      <Tag color="green">
                        Succeeded: {syncResult.data.itemsSucceeded || 0}
                      </Tag>
                      {syncResult.data.itemsFailed > 0 && (
                        <Tag color="red">
                          Failed: {syncResult.data.itemsFailed || 0}
                        </Tag>
                      )}
                    </Space>
                  </div>
                </div>
              )}

              {syncResult.error && (
                <Alert
                  message="Error Details"
                  description={syncResult.error}
                  type="error"
                  showIcon
                />
              )}
            </Space>
          </Card>
        )}
      </Modal>
    </>
  )
}

export default QuickProductSync
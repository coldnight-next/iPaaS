import { useState } from 'react'
import { Card, Form, Input, Button, Space, Typography, Alert, Tabs, message, Divider } from 'antd'
import { ShopOutlined, DatabaseOutlined, SaveOutlined, LockOutlined } from '@ant-design/icons'
import { supabase } from '../lib/supabase'

const { Title, Text, Paragraph } = Typography
const { TabPane } = Tabs

interface ManualConnectionSetupProps {
  onConnectionSaved?: () => void
}

export default function ManualConnectionSetup({ onConnectionSaved }: ManualConnectionSetupProps) {
  const [netsuiteForm] = Form.useForm()
  const [shopifyForm] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const handleNetSuiteSubmit = async (values: any) => {
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setError('Please sign in first')
        return
      }

      // Check if connection already exists
      const { data: existingConnection } = await supabase
        .from('connections')
        .select('id')
        .eq('user_id', session.user.id)
        .eq('platform', 'netsuite')
        .maybeSingle()

      const connectionData = {
        user_id: session.user.id,
        platform: 'netsuite',
        status: 'connected',
        credentials: {
          account_id: values.accountId,
          consumer_key: values.consumerKey,
          consumer_secret: values.consumerSecret,
          token_id: values.tokenId,
          token_secret: values.tokenSecret,
          auth_type: 'token_based_authentication',
        },
        metadata: {
          account_id: values.accountId,
          setup_method: 'manual',
          setup_at: new Date().toISOString(),
        }
      }

      if (existingConnection) {
        // Update existing connection
        const { error: updateError } = await supabase
          .from('connections')
          .update(connectionData)
          .eq('id', existingConnection.id)

        if (updateError) throw updateError
        setSuccess('NetSuite connection updated successfully!')
        message.success('NetSuite credentials saved!')
      } else {
        // Insert new connection
        const { error: insertError } = await supabase
          .from('connections')
          .insert(connectionData)

        if (insertError) throw insertError
        setSuccess('NetSuite connection created successfully!')
        message.success('NetSuite credentials saved!')
      }

      netsuiteForm.resetFields()
      if (onConnectionSaved) onConnectionSaved()

    } catch (err: any) {
      console.error('NetSuite connection error:', err)
      setError(err.message || 'Failed to save NetSuite credentials')
      message.error('Failed to save credentials')
    } finally {
      setLoading(false)
    }
  }

  const handleShopifySubmit = async (values: any) => {
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setError('Please sign in first')
        return
      }

      // Check if connection already exists
      const { data: existingConnection } = await supabase
        .from('connections')
        .select('id')
        .eq('user_id', session.user.id)
        .eq('platform', 'shopify')
        .maybeSingle()

      const connectionData = {
        user_id: session.user.id,
        platform: 'shopify',
        status: 'connected',
        credentials: {
          shop_domain: values.shopDomain,
          api_key: values.apiKey,
          api_secret: values.apiSecret,
          access_token: values.accessToken,
          auth_type: 'custom_app',
        },
        metadata: {
          shop_domain: values.shopDomain,
          setup_method: 'manual',
          setup_at: new Date().toISOString(),
        }
      }

      if (existingConnection) {
        // Update existing connection
        const { error: updateError } = await supabase
          .from('connections')
          .update(connectionData)
          .eq('id', existingConnection.id)

        if (updateError) throw updateError
        setSuccess('Shopify connection updated successfully!')
        message.success('Shopify credentials saved!')
      } else {
        // Insert new connection
        const { error: insertError } = await supabase
          .from('connections')
          .insert(connectionData)

        if (insertError) throw insertError
        setSuccess('Shopify connection created successfully!')
        message.success('Shopify credentials saved!')
      }

      shopifyForm.resetFields()
      if (onConnectionSaved) onConnectionSaved()

    } catch (err: any) {
      console.error('Shopify connection error:', err)
      setError(err.message || 'Failed to save Shopify credentials')
      message.error('Failed to save credentials')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px' }}>
      <Card>
        <Title level={3}>
          <LockOutlined /> Manual Connection Setup
        </Title>
        <Paragraph>
          Enter your API credentials directly to quickly connect your NetSuite and Shopify accounts.
          This method is ideal for testing or when you have existing API credentials.
        </Paragraph>
        <Alert
          message="Security Note"
          description="Your credentials are encrypted and stored securely in the database. We recommend using OAuth for production environments."
          type="info"
          showIcon
          style={{ marginBottom: 24 }}
        />

        {error && (
          <Alert
            message="Error"
            description={error}
            type="error"
            closable
            onClose={() => setError(null)}
            style={{ marginBottom: 24 }}
          />
        )}

        {success && (
          <Alert
            message="Success"
            description={success}
            type="success"
            closable
            onClose={() => setSuccess(null)}
            style={{ marginBottom: 24 }}
          />
        )}

        <Tabs defaultActiveKey="netsuite" size="large">
          <TabPane
            tab={
              <span>
                <DatabaseOutlined /> NetSuite
              </span>
            }
            key="netsuite"
          >
            <Card type="inner" style={{ marginTop: 16 }}>
              <Title level={5}>NetSuite Token-Based Authentication</Title>
              <Paragraph type="secondary">
                To get these credentials, go to your NetSuite account → Setup → Integration → Manage Integrations
              </Paragraph>

              <Form
                form={netsuiteForm}
                layout="vertical"
                onFinish={handleNetSuiteSubmit}
                autoComplete="off"
              >
                <Form.Item
                  name="accountId"
                  label="Account ID"
                  rules={[{ required: true, message: 'Please enter your NetSuite Account ID' }]}
                  extra="Your NetSuite account identifier (e.g., 1234567, TSTDRV1234567)"
                >
                  <Input placeholder="e.g., 1234567 or TSTDRV1234567" size="large" />
                </Form.Item>

                <Divider />

                <Form.Item
                  name="consumerKey"
                  label="Consumer Key / Client ID"
                  rules={[{ required: true, message: 'Please enter your Consumer Key' }]}
                  extra="From your Integration record"
                >
                  <Input.Password placeholder="Consumer Key" size="large" />
                </Form.Item>

                <Form.Item
                  name="consumerSecret"
                  label="Consumer Secret / Client Secret"
                  rules={[{ required: true, message: 'Please enter your Consumer Secret' }]}
                  extra="From your Integration record"
                >
                  <Input.Password placeholder="Consumer Secret" size="large" />
                </Form.Item>

                <Divider />

                <Form.Item
                  name="tokenId"
                  label="Token ID"
                  rules={[{ required: true, message: 'Please enter your Token ID' }]}
                  extra="From Setup → Users/Roles → Access Tokens"
                >
                  <Input.Password placeholder="Token ID" size="large" />
                </Form.Item>

                <Form.Item
                  name="tokenSecret"
                  label="Token Secret"
                  rules={[{ required: true, message: 'Please enter your Token Secret' }]}
                  extra="From Setup → Users/Roles → Access Tokens"
                >
                  <Input.Password placeholder="Token Secret" size="large" />
                </Form.Item>

                <Form.Item>
                  <Button
                    type="primary"
                    htmlType="submit"
                    size="large"
                    loading={loading}
                    icon={<SaveOutlined />}
                    block
                  >
                    Save NetSuite Credentials
                  </Button>
                </Form.Item>
              </Form>
            </Card>
          </TabPane>

          <TabPane
            tab={
              <span>
                <ShopOutlined /> Shopify
              </span>
            }
            key="shopify"
          >
            <Card type="inner" style={{ marginTop: 16 }}>
              <Title level={5}>Shopify Custom App Credentials</Title>
              <Paragraph type="secondary">
                To get these credentials, go to your Shopify Admin → Apps → Develop apps → Create a custom app
              </Paragraph>

              <Form
                form={shopifyForm}
                layout="vertical"
                onFinish={handleShopifySubmit}
                autoComplete="off"
              >
                <Form.Item
                  name="shopDomain"
                  label="Shop Domain"
                  rules={[
                    { required: true, message: 'Please enter your Shopify domain' },
                    { pattern: /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i, message: 'Must be a valid myshopify.com domain' }
                  ]}
                  extra="Your store's myshopify.com domain (e.g., your-store.myshopify.com)"
                >
                  <Input placeholder="your-store.myshopify.com" size="large" />
                </Form.Item>

                <Divider />

                <Form.Item
                  name="apiKey"
                  label="API Key / Client ID"
                  rules={[{ required: true, message: 'Please enter your API Key' }]}
                  extra="From your custom app's API credentials"
                >
                  <Input.Password placeholder="API Key" size="large" />
                </Form.Item>

                <Form.Item
                  name="apiSecret"
                  label="API Secret Key / Client Secret"
                  rules={[{ required: true, message: 'Please enter your API Secret' }]}
                  extra="From your custom app's API credentials"
                >
                  <Input.Password placeholder="API Secret" size="large" />
                </Form.Item>

                <Form.Item
                  name="accessToken"
                  label="Admin API Access Token"
                  rules={[{ required: true, message: 'Please enter your Access Token' }]}
                  extra="Generated when you install the custom app (starts with 'shpat_')"
                >
                  <Input.Password placeholder="shpat_..." size="large" />
                </Form.Item>

                <Form.Item>
                  <Button
                    type="primary"
                    htmlType="submit"
                    size="large"
                    loading={loading}
                    icon={<SaveOutlined />}
                    block
                  >
                    Save Shopify Credentials
                  </Button>
                </Form.Item>
              </Form>
            </Card>
          </TabPane>
        </Tabs>

        <Divider />

        <Alert
          message="Need Help Getting Credentials?"
          description={
            <Space direction="vertical">
              <Text strong>NetSuite:</Text>
              <Text>Setup → Integration → Manage Integrations → New → Create Token-Based Authentication integration</Text>
              <Text strong style={{ marginTop: 8, display: 'block' }}>Shopify:</Text>
              <Text>Admin → Apps → App development → Create an app → Configure Admin API scopes → Install app</Text>
            </Space>
          }
          type="warning"
          showIcon
        />
      </Card>
    </div>
  )
}

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase, db, type Connection } from '../lib/supabase'
import { Avatar, Badge, Button, Card, Dropdown, Statistic, Table, Form, Input, Typography, Alert, Space, Tag, Row, Col, Steps, message, Checkbox, Modal, Select, Switch } from 'antd'
import {
  UserOutlined, LogoutOutlined, DashboardOutlined, LinkOutlined, SettingOutlined,
   SyncOutlined, UsergroupAddOutlined, LockOutlined,
   ToolOutlined, MonitorOutlined, ApiOutlined, CloudSyncOutlined, DatabaseOutlined
} from '@ant-design/icons'
import { FileTextOutlined } from '@ant-design/icons'
import FieldMappingManager from '../components/FieldMappingManager'
import MonitoringDashboard from '../components/MonitoringDashboard'
import ManualConnectionSetup from '../components/ManualConnectionSetup'
import ProductSyncPreview from '../components/ProductSyncPreview'
import SyncManagement from '../components/SyncManagement'

const configuredFunctionsBase = import.meta.env.VITE_FUNCTIONS_BASE_URL as string | undefined
const inferredFunctionsBase = import.meta.env.VITE_SUPABASE_URL
  ? `${(import.meta.env.VITE_SUPABASE_URL as string).replace(/\/$/, '')}/functions/v1`
  : undefined
const FUNCTIONS_BASE = configuredFunctionsBase || inferredFunctionsBase || 'http://localhost:54321/functions/v1'

export default function Dashboard() {
  const { session, user, signOut } = useAuth()
  const [activeTab, setActiveTab] = useState('dashboard')

  const [shopifyDomain, setShopifyDomain] = useState('')
  const [netsuiteAccountId, setNetsuiteAccountId] = useState('')
  const [connectError, setConnectError] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)

  const [connections, setConnections] = useState<Connection[]>([])
  const [connectionsLoading, setConnectionsLoading] = useState(false)

  const [oauthBanner, setOauthBanner] = useState<{ status: 'success' | 'error'; message: string } | null>(null)

  // Configuration Wizard State
  const [wizardCurrentStep, setWizardCurrentStep] = useState(0)
  const [wizardData, setWizardData] = useState({
    netsuiteAccountId: '',
    netsuiteConsumerKey: '',
    netsuiteConsumerSecret: '',
    netsuiteTokenId: '',
    netsuiteTokenSecret: '',
    shopifyDomain: '',
    shopifyApiKey: '',
    shopifyApiSecret: '',
    syncProducts: true,
    syncInventory: true,
    syncOrders: true,
    syncInterval: 30,
  })

  // Sync Profiles State
  const [syncProfiles, setSyncProfiles] = useState([
    {
      id: '1',
      name: 'Default Profile',
      description: 'Standard synchronization for all data types',
      isActive: true,
      dataTypes: {
        products: true,
        inventory: true,
        orders: true,
      },
      syncDirection: 'bidirectional',
      schedule: {
        enabled: true,
        interval: 30,
        unit: 'minutes',
      },
      filters: {
        productCategories: [],
        orderStatuses: ['paid', 'fulfilled'],
        dateRange: null,
      },
      fieldMappings: {
        productFields: {},
        inventoryFields: {},
        orderFields: {},
      },
      createdAt: new Date().toISOString(),
      lastModified: new Date().toISOString(),
    },
  ])
  const [selectedProfile, setSelectedProfile] = useState(null)
  const [profileModalVisible, setProfileModalVisible] = useState(false)
  const [editingProfile, setEditingProfile] = useState<any>(null)

  const [syncLogs, setSyncLogs] = useState([])
  const [syncLogsLoading, setSyncLogsLoading] = useState(false)

  // Sidebar responsive state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  // Auto-collapse sidebar on mobile
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setSidebarCollapsed(true)
      }
    }

    // Set initial state
    handleResize()

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Session is now managed by AuthContext

  const loadConnections = useCallback(async () => {
    if (!session) {
      setConnections([])
      return
    }
    setConnectionsLoading(true)
    try {
      const { data, error } = await db.getConnections()
      if (error) {
        console.error('Failed to load connections', error)
        setConnections([])
        return
      }
      setConnections(data ?? [])
    } finally {
      setConnectionsLoading(false)
    }
  }, [session])

  const loadSyncLogs = useCallback(async () => {
    if (!session) {
      setSyncLogs([])
      return
    }
    setSyncLogsLoading(true)
    try {
      const { data, error } = await supabase
        .from('sync_logs')
        .select('*')
        .eq('user_id', session.user.id)
        .order('started_at', { ascending: false })
        .limit(50)

      if (error) {
        console.error('Failed to load sync logs', error)
        setSyncLogs([])
        return
      }
      setSyncLogs(data ?? [])
    } finally {
      setSyncLogsLoading(false)
    }
  }, [session])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const status = params.get('status')
    if (status === 'success' || status === 'error') {
      const message = params.get('message') ?? ''
      setOauthBanner({ status, message })
      params.delete('status')
      params.delete('message')
      params.delete('platform')
      const nextQuery = params.toString()
      const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}`
      window.history.replaceState({}, document.title, nextUrl)
      if (status === 'success') {
        void loadConnections()
      }
    }
  }, [loadConnections])

  useEffect(() => {
    if (session) {
      void loadConnections()
      void loadSyncLogs()
    }
  }, [session, loadConnections, loadSyncLogs])

  // Auth handled by AuthContext - signOut is imported from useAuth()

  const handleShopifyConnect = async () => {
    setConnectError(null)
    if (!session) {
      setConnectError('Please sign in first.')
      return
    }

    const trimmedDomain = shopifyDomain.trim()
    if (!trimmedDomain) {
      setConnectError('Enter your myshopify.com domain before continuing.')
      return
    }

    setConnecting(true)
    try {
      const response = await fetch(`${FUNCTIONS_BASE}/oauth-start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          platform: 'shopify',
          shopDomain: trimmedDomain
        })
      })

      const payload = await response.json()
      if (!response.ok || typeof payload?.url !== 'string') {
        const message = typeof payload?.message === 'string' ? payload.message : 'Failed to start Shopify OAuth'
        throw new Error(message)
      }

      window.location.assign(payload.url)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to start Shopify OAuth'
      setConnectError(message)
    } finally {
      setConnecting(false)
    }
  }

  const handleNetSuiteConnect = async () => {
    setConnectError(null)
    if (!session) {
      setConnectError('Please sign in first.')
      return
    }

    const trimmedAccountId = netsuiteAccountId.trim()
    if (!trimmedAccountId) {
      setConnectError('Enter your NetSuite Account ID before continuing.')
      return
    }

    setConnecting(true)
    try {
      const response = await fetch(`${FUNCTIONS_BASE}/oauth-start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          platform: 'netsuite',
          accountId: trimmedAccountId
        })
      })

      const payload = await response.json()
      if (!response.ok || typeof payload?.url !== 'string') {
        const message = typeof payload?.message === 'string' ? payload.message : 'Failed to start NetSuite OAuth'
        throw new Error(message)
      }

      window.location.assign(payload.url)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to start NetSuite OAuth'
      setConnectError(message)
    } finally {
      setConnecting(false)
    }
  }

  const activeConnections = useMemo(() => connections.filter(connection => connection.status === 'connected'), [connections])

  const handleRunSync = async (profile: any) => {
    if (!session) {
      message.error('Please sign in first')
      return
    }

    try {
      const response = await fetch(`${FUNCTIONS_BASE}/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          profile: {
            id: profile.id,
            name: profile.name,
            dataTypes: profile.dataTypes,
            syncDirection: profile.syncDirection,
            filters: profile.filters
          }
        })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.message || 'Sync failed')
      }

      message.success(`Sync completed! Processed ${result.itemsProcessed} items, ${result.itemsSucceeded} succeeded, ${result.itemsFailed} failed`)

      // Refresh connections to update last sync time
      void loadConnections()
      // Refresh sync logs
      void loadSyncLogs()
    } catch (error) {
      console.error('Sync error:', error)
      message.error(error instanceof Error ? error.message : 'Sync failed')
    }
  }

  // Check if user has admin role (simplified - in real app, check user metadata or database)
  // For development, also check if we're in development mode
  const isAdmin = session?.user?.email?.includes('admin') ||
                   session?.user?.user_metadata?.role === 'admin' ||
                   import.meta.env.DEV // Show admin features in development mode

  // Always show admin menu in development mode for testing
  const showAdminMenu = isAdmin || import.meta.env.DEV

  // Build menu items with admin sections for development
  const menuItems = [
    {
      key: 'dashboard',
      icon: <DashboardOutlined />,
      label: 'Dashboard',
    },
    {
      key: 'connections',
      icon: <LinkOutlined />,
      label: 'Platform Connections',
    },
    {
      key: 'manual-setup',
      icon: <LockOutlined />,
      label: 'Manual Setup',
    },
    {
      key: 'setup-wizard',
      icon: <SettingOutlined />,
      label: 'Setup Wizard',
    },
    {
      type: 'divider' as const,
      key: 'divider-1',
    },
    {
      key: 'products',
      icon: <DatabaseOutlined />,
      label: 'Products',
    },
    {
      key: 'inventory',
      icon: <DatabaseOutlined />,
      label: 'Inventory',
    },
    {
      key: 'orders',
      icon: <FileTextOutlined />,
      label: 'Orders',
    },
    {
      key: 'mappings',
      icon: <LinkOutlined />,
      label: 'Product Mappings',
    },
    {
      key: 'field-mapping',
      icon: <SettingOutlined />,
      label: 'Field Mapping',
    },
    {
      key: 'sync-profiles',
      icon: <SettingOutlined />,
      label: 'Sync Profiles',
    },
    {
      key: 'sync-management',
      icon: <CloudSyncOutlined />,
      label: 'Sync Management',
    },
    {
      type: 'divider' as const,
      key: 'divider-2',
    },
    {
      key: 'admin-dashboard',
      icon: <DashboardOutlined />,
      label: 'Admin Dashboard',
    },
    {
      key: 'configurations',
      icon: <SettingOutlined />,
      label: 'Configurations',
    },
    {
      key: 'sync-scheduling',
      icon: <SettingOutlined />,
      label: 'Sync Scheduling',
    },
    {
      key: 'sync-history',
      icon: <FileTextOutlined />,
      label: 'Sync History',
    },
    {
      key: 'user-management',
      icon: <UsergroupAddOutlined />,
      label: 'User Management',
    },
    {
      key: 'system-settings',
      icon: <ToolOutlined />,
      label: 'System Settings',
    },
    {
      key: 'monitoring',
      icon: <MonitorOutlined />,
      label: 'Monitoring',
    },
    {
      key: 'api-management',
      icon: <ApiOutlined />,
      label: 'API Management',
    },
    {
      key: 'logs',
      icon: <FileTextOutlined />,
      label: 'Logs',
    },
  ]

  const userMenuItems = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: 'Profile',
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Sign out',
      onClick: signOut,
    },
  ]

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      {/* Sidebar */}
      <div style={{
        width: sidebarCollapsed ? '80px' : '280px',
        minWidth: sidebarCollapsed ? '80px' : '280px',
        background: '#001529',
        color: 'white',
        padding: '16px',
        position: 'relative',
        transition: 'width 0.3s ease, min-width 0.3s ease'
      }}>
        <div style={{
          marginBottom: '24px',
          fontSize: sidebarCollapsed ? '14px' : '20px',
          fontWeight: 'bold',
          textAlign: sidebarCollapsed ? 'center' : 'left',
          transition: 'font-size 0.3s ease',
          color: '#1890ff'
        }}>
          {sidebarCollapsed ? '⚡' : '⚡ SyncFlow'}
        </div>
        <div style={{
          position: 'absolute',
          top: '16px',
          right: '-12px',
          background: '#001529',
          border: '1px solid #1890ff',
          borderRadius: '50%',
          width: '24px',
          height: '24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          zIndex: 1000
        }} onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>
          {sidebarCollapsed ? '→' : '←'}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {menuItems.map(item => {
            if (item.type === 'divider') {
              return <hr key={item.key} style={{ borderColor: '#1890ff', margin: '16px 0' }} />;
            }
            return (
              <div
                key={item.key}
                onClick={() => item.key && setActiveTab(item.key)}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  borderRadius: '4px',
                  background: activeTab === item.key ? '#1890ff' : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  justifyContent: sidebarCollapsed ? 'center' : 'flex-start'
                }}
                title={sidebarCollapsed ? item.label : undefined}
              >
                {item.icon}
                {!sidebarCollapsed && <span>{item.label}</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #d9d9d9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Badge
              status={activeConnections.length > 0 ? 'success' : 'warning'}
              text="System Status"
            />
            {showAdminMenu && (
              <Badge
                status="processing"
                text="Admin Mode"
                style={{ marginLeft: '8px' }}
              />
            )}
          </div>
          <Dropdown
            menu={{
              items: userMenuItems,
            }}
            placement="bottomRight"
          >
            <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Avatar src={session?.user?.user_metadata?.avatar_url} />
              <span>{session?.user?.email}</span>
            </div>
          </Dropdown>
        </div>

        {/* Content */}
        <div style={{ flex: 1, padding: '24px', overflow: 'auto' }}>
        {showAdminMenu && activeTab.startsWith('admin') && (
          <Card style={{ marginBottom: '24px' }}>
            <Typography.Title level={4} style={{ marginBottom: '16px' }}>
              Admin Navigation
            </Typography.Title>
            <Space wrap>
              <Button
                type={activeTab === 'admin-dashboard' ? 'primary' : 'default'}
                onClick={() => setActiveTab('admin-dashboard')}
                icon={<DashboardOutlined />}
              >
                Dashboard
              </Button>
              <Button
                type={activeTab === 'configurations' ? 'primary' : 'default'}
                onClick={() => setActiveTab('configurations')}
                icon={<SettingOutlined />}
              >
                Configurations
              </Button>
              <Button
                type={activeTab === 'sync-management' ? 'primary' : 'default'}
                onClick={() => setActiveTab('sync-management')}
                icon={<CloudSyncOutlined />}
              >
                Sync Management
              </Button>
              <Button
                type={activeTab === 'user-management' ? 'primary' : 'default'}
                onClick={() => setActiveTab('user-management')}
                icon={<UsergroupAddOutlined />}
              >
                User Management
              </Button>
              <Button
                type={activeTab === 'system-settings' ? 'primary' : 'default'}
                onClick={() => setActiveTab('system-settings')}
                icon={<ToolOutlined />}
              >
                System Settings
              </Button>
              <Button
                type={activeTab === 'monitoring' ? 'primary' : 'default'}
                onClick={() => setActiveTab('monitoring')}
                icon={<MonitorOutlined />}
              >
                Monitoring
              </Button>
              <Button
                type={activeTab === 'api-management' ? 'primary' : 'default'}
                onClick={() => setActiveTab('api-management')}
                icon={<ApiOutlined />}
              >
                API Management
              </Button>
            </Space>
          </Card>
        )}
        {oauthBanner && (
          <Alert
            message={oauthBanner.message || (oauthBanner.status === 'success' ? 'Authorization completed successfully.' : 'Authorization failed. Check the logs for more details.')}
            type={oauthBanner.status}
            showIcon
            closable
            style={{ marginBottom: '24px' }}
          />
        )}

        {activeTab === 'dashboard' && !activeTab.startsWith('admin') && (
          <div>
            {showAdminMenu && (
              <Alert
                message="Admin Mode Active"
                description="You have access to admin features. Use the sidebar menu to navigate to admin sections."
                type="info"
                showIcon
                style={{ marginBottom: '24px' }}
              />
            )}
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={12} lg={6}>
                <Card>
                  <Statistic
                    title="Connected Shopify stores"
                    value={activeConnections.filter(connection => connection.platform === 'shopify').length}
                    prefix={<LinkOutlined />}
                  />
                </Card>
              </Col>
            <Col xs={24} sm={12} lg={6}>
              <Card>
                <Statistic
                  title="NetSuite tokens"
                  value={activeConnections.filter(connection => connection.platform === 'netsuite').length}
                  prefix={<SettingOutlined />}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Card>
                <Statistic
                  title="Pending connections"
                  value={connections.filter(connection => connection.status === 'authorizing').length}
                  prefix={<SyncOutlined />}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Card>
                <Statistic
                  title="Last refresh"
                  value={new Date().toLocaleTimeString()}
                  prefix={<DashboardOutlined />}
                />
              </Card>
            </Col>
          </Row>
          </div>
        )}

        {activeTab === 'connections' && (
          <div style={{ padding: '24px 0' }}>
                <Card
                  title="Connected platforms"
                  extra={
                    <Button onClick={() => void loadConnections()} loading={connectionsLoading}>
                      Refresh
                    </Button>
                  }
                  style={{ marginBottom: '16px' }}
                >
                  <Table
                    dataSource={connections}
                    columns={[
                      {
                        title: 'Platform',
                        dataIndex: 'platform',
                        key: 'platform',
                        render: (platform: string) => platform.charAt(0).toUpperCase() + platform.slice(1),
                      },
                      {
                        title: 'Status',
                        dataIndex: 'status',
                        key: 'status',
                        render: (status: string) => (
                          <Tag color={
                            status === 'connected' ? 'green' :
                            status === 'authorizing' ? 'orange' : 'default'
                          }>
                            {status}
                          </Tag>
                        ),
                      },
                      {
                        title: 'Last sync',
                        dataIndex: 'last_sync',
                        key: 'last_sync',
                        render: (lastSync: string) => lastSync ? new Date(lastSync).toLocaleString() : '—',
                      },
                      {
                        title: 'Shop / Account',
                        dataIndex: 'metadata',
                        key: 'shop_account',
                        render: (metadata: any) => {
                          if (metadata?.shop_domain) {
                            return metadata.shop_domain
                          }
                          if (metadata?.account_id) {
                            return `Account: ${metadata.account_id}`
                          }
                          return '—'
                        },
                      },
                    ]}
                    locale={{ emptyText: 'No connections yet. Start by connecting Shopify below.' }}
                    rowKey="id"
                  />
                </Card>

                <Row gutter={[16, 16]}>
                  <Col xs={24} lg={12}>
                    <Card title="Connect a Shopify store">
                      <p>Authorize the app to access your store using the Shopify OAuth flow.</p>
                      <Form layout="vertical" style={{ marginTop: '16px' }}>
                        <Form.Item label="Shop domain">
                          <Input
                            placeholder="example.myshopify.com"
                            value={shopifyDomain}
                            onChange={event => setShopifyDomain(event.target.value)}
                          />
                        </Form.Item>
                        <Form.Item>
                          <Button type="primary" onClick={handleShopifyConnect} loading={connecting} block>
                            Connect Shopify
                          </Button>
                        </Form.Item>
                      </Form>
                      {connectError && (
                        <Alert message={connectError} type="error" style={{ marginTop: '16px' }} />
                      )}
                      <Typography.Text type="secondary" style={{ fontSize: '12px', display: 'block', marginTop: '8px' }}>
                        Make sure the domain ends with .myshopify.com. You will be redirected to Shopify to authorize access.
                      </Typography.Text>
                    </Card>
                  </Col>
                  <Col xs={24} lg={12}>
                    <Card title="Connect NetSuite">
                      <p>Connect to your NetSuite account using OAuth 2.0 for secure access to your ERP data.</p>
                      <Form layout="vertical" style={{ marginTop: '16px' }}>
                        <Form.Item label="NetSuite Account ID">
                          <Input
                            placeholder="Your NetSuite Account ID"
                            value={netsuiteAccountId}
                            onChange={event => setNetsuiteAccountId(event.target.value)}
                          />
                        </Form.Item>
                        <Form.Item>
                          <Button type="primary" onClick={handleNetSuiteConnect} loading={connecting} block>
                            Connect NetSuite
                          </Button>
                        </Form.Item>
                      </Form>
                      {connectError && (
                        <Alert message={connectError} type="error" style={{ marginTop: '16px' }} />
                      )}
                      <Typography.Text type="secondary" style={{ fontSize: '12px', display: 'block', marginTop: '8px' }}>
                        Enter your NetSuite Account ID (found in your NetSuite URL). You will be redirected to NetSuite to authorize access.
                      </Typography.Text>
                    </Card>
                  </Col>
                </Row>
          </div>
        )}

        {/* Manual Setup Page */}
        {activeTab === 'manual-setup' && (
          <ManualConnectionSetup onConnectionSaved={loadConnections} />
        )}

        {/* Setup Wizard Page */}
        {activeTab === 'setup-wizard' && (
          <div>
            <Typography.Title level={2} style={{ marginBottom: '24px' }}>
              Configuration Wizard
            </Typography.Title>
            <Card>
              <Steps current={wizardCurrentStep} style={{ marginBottom: '32px' }}>
                <Steps.Step title="Welcome" description="Getting started" />
                <Steps.Step title="NetSuite Setup" description="Configure NetSuite connection" />
                <Steps.Step title="Shopify Setup" description="Configure Shopify connection" />
                <Steps.Step title="Test Connections" description="Verify configurations" />
                <Steps.Step title="Sync Configuration" description="Set up initial sync" />
                <Steps.Step title="Complete" description="Finish setup" />
              </Steps>

              <div style={{ minHeight: '400px' }}>
                {wizardCurrentStep === 0 && (
                  <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                    <Typography.Title level={3} style={{ marginBottom: '16px' }}>
                      Welcome to SyncFlow Setup
                    </Typography.Title>
                    <Typography.Paragraph style={{ fontSize: '16px', marginBottom: '24px' }}>
                      This wizard will guide you through setting up your integration between NetSuite and Shopify.
                      We'll help you configure both platforms and establish your initial synchronization settings.
                    </Typography.Paragraph>
                    <Space direction="vertical" size="large">
                      <div>
                        <Typography.Text strong>What you'll need:</Typography.Text>
                        <ul style={{ textAlign: 'left', display: 'inline-block', marginTop: '8px' }}>
                          <li>NetSuite Account ID and API credentials</li>
                          <li>Shopify store domain and API credentials</li>
                          <li>Administrative access to both platforms</li>
                        </ul>
                      </div>
                      <Alert
                        message="Tip"
                        description="You can always return to this wizard later to modify your settings."
                        type="info"
                        showIcon
                      />
                    </Space>
                  </div>
                )}

                {wizardCurrentStep === 1 && (
                  <div>
                    <Typography.Title level={4} style={{ marginBottom: '16px' }}>
                      NetSuite Configuration
                    </Typography.Title>
                    <Typography.Paragraph style={{ marginBottom: '24px' }}>
                      NetSuite uses Token-based Authentication for secure API access. You'll need to create an integration record and access tokens in your NetSuite account.
                    </Typography.Paragraph>

                    <Card title="Setup Instructions" style={{ marginBottom: '24px' }}>
                      <Typography.Title level={5}>Step 1: Create Integration Record</Typography.Title>
                      <ol style={{ marginBottom: '16px' }}>
                        <li>Log into your NetSuite account</li>
                        <li>Navigate to <strong>Setup → Integration → Manage Integrations → New</strong></li>
                        <li>Fill in the details:
                          <ul style={{ marginLeft: '20px', marginTop: '8px' }}>
                            <li><strong>Name:</strong> "Shopify iPaaS Integration"</li>
                            <li><strong>State:</strong> Enabled</li>
                            <li><strong>Authentication:</strong> Token-based Authentication</li>
                          </ul>
                        </li>
                        <li><strong>Save</strong> the record</li>
                        <li><strong>Copy</strong> the Consumer Key and Consumer Secret (shown only once!)</li>
                      </ol>

                      <Typography.Title level={5}>Step 2: Create Access Token</Typography.Title>
                      <ol style={{ marginBottom: '16px' }}>
                        <li>Go to <strong>Setup → Users/Roles → Access Tokens → New</strong></li>
                        <li>Fill in the details:
                          <ul style={{ marginLeft: '20px', marginTop: '8px' }}>
                            <li><strong>Application Name:</strong> Select your integration record</li>
                            <li><strong>User:</strong> Choose an integration user or admin</li>
                            <li><strong>Role:</strong> Select appropriate permissions (e.g., "Shopify Integration" role)</li>
                          </ul>
                        </li>
                        <li><strong>Save</strong> the token</li>
                        <li><strong>Copy</strong> the Token ID and Token Secret</li>
                      </ol>

                      <Typography.Title level={5}>Step 3: Get Account ID</Typography.Title>
                      <p>Your Account ID can be found in <strong>Setup → Company → Company Information</strong> under the "Account ID" field.</p>
                    </Card>

                    <Form layout="vertical">
                      <Row gutter={16}>
                        <Col span={12}>
                          <Form.Item label="Account ID" required>
                            <Input
                              placeholder="Enter your NetSuite Account ID"
                              value={wizardData.netsuiteAccountId}
                              onChange={(e) => setWizardData({...wizardData, netsuiteAccountId: e.target.value})}
                            />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item label="Consumer Key" required>
                            <Input
                              placeholder="Enter Consumer Key from Integration Record"
                              value={wizardData.netsuiteConsumerKey}
                              onChange={(e) => setWizardData({...wizardData, netsuiteConsumerKey: e.target.value})}
                            />
                          </Form.Item>
                        </Col>
                      </Row>
                      <Row gutter={16}>
                        <Col span={12}>
                          <Form.Item label="Consumer Secret" required>
                            <Input.Password
                              placeholder="Enter Consumer Secret from Integration Record"
                              value={wizardData.netsuiteConsumerSecret}
                              onChange={(e) => setWizardData({...wizardData, netsuiteConsumerSecret: e.target.value})}
                            />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item label="Token ID" required>
                            <Input
                              placeholder="Enter Token ID from Access Token"
                              value={wizardData.netsuiteTokenId}
                              onChange={(e) => setWizardData({...wizardData, netsuiteTokenId: e.target.value})}
                            />
                          </Form.Item>
                        </Col>
                      </Row>
                      <Form.Item label="Token Secret" required>
                        <Input.Password
                          placeholder="Enter Token Secret from Access Token"
                          value={wizardData.netsuiteTokenSecret}
                          onChange={(e) => setWizardData({...wizardData, netsuiteTokenSecret: e.target.value})}
                        />
                      </Form.Item>
                      <Alert
                        message="Security Note"
                        description="Your credentials are encrypted and stored securely. They are only used to establish the connection between platforms."
                        type="info"
                        showIcon
                        style={{ marginTop: '16px' }}
                      />
                      <Alert
                        message="Important"
                        description="Make sure to copy the Consumer Key/Secret immediately after creating the integration record - they are only shown once!"
                        type="warning"
                        showIcon
                        style={{ marginTop: '16px' }}
                      />
                    </Form>
                  </div>
                )}

                {wizardCurrentStep === 2 && (
                  <div>
                    <Typography.Title level={4} style={{ marginBottom: '16px' }}>
                      Shopify Configuration
                    </Typography.Title>
                    <Typography.Paragraph style={{ marginBottom: '24px' }}>
                      Shopify requires a custom app for API access. You'll need to create a custom app in your Shopify store and configure the necessary permissions.
                    </Typography.Paragraph>

                    <Card title="Setup Instructions" style={{ marginBottom: '24px' }}>
                      <Typography.Title level={5}>Step 1: Create Custom App</Typography.Title>
                      <ol style={{ marginBottom: '16px' }}>
                        <li>Log into your Shopify admin panel</li>
                        <li>Go to <strong>Apps → App development</strong></li>
                        <li>Click <strong>"Create an app"</strong></li>
                        <li>Fill in the details:
                          <ul style={{ marginLeft: '20px', marginTop: '8px' }}>
                            <li><strong>App name:</strong> "NetSuite iPaaS Integration"</li>
                            <li><strong>App URL:</strong> Your integration endpoint (can be updated later)</li>
                          </ul>
                        </li>
                        <li>Click <strong>"Create app"</strong></li>
                      </ol>

                      <Typography.Title level={5}>Step 2: Configure API Permissions</Typography.Title>
                      <p>In the API configuration section, add these permissions:</p>
                      <ul style={{ marginBottom: '16px' }}>
                        <li><strong>Products:</strong> Read and write</li>
                        <li><strong>Inventory:</strong> Read and write</li>
                        <li><strong>Orders:</strong> Read and write</li>
                        <li><strong>Content:</strong> Read access (optional)</li>
                        <li><strong>Store settings:</strong> Read access (optional)</li>
                      </ul>

                      <Typography.Title level={5}>Step 3: Install the App</Typography.Title>
                      <ol style={{ marginBottom: '16px' }}>
                        <li>Click <strong>"Install app"</strong> in the app settings</li>
                        <li>Review and approve the permissions</li>
                        <li>After installation, go to <strong>"API credentials"</strong> section</li>
                        <li><strong>Copy</strong> the Admin API access token</li>
                      </ol>

                      <Typography.Title level={5}>Step 4: Get Store Domain</Typography.Title>
                      <p>Your store domain is the part before ".myshopify.com" in your admin URL (e.g., "yourstore" if your URL is "yourstore.myshopify.com").</p>
                    </Card>

                    <Form layout="vertical">
                      <Form.Item label="Store Domain" required>
                        <Input
                          placeholder="yourstore"
                          value={wizardData.shopifyDomain}
                          onChange={(e) => setWizardData({...wizardData, shopifyDomain: e.target.value})}
                          addonAfter=".myshopify.com"
                        />
                      </Form.Item>
                      <Form.Item label="Admin API Access Token" required>
                        <Input.Password
                          placeholder="Enter the Admin API access token from your custom app"
                          value={wizardData.shopifyApiKey}
                          onChange={(e) => setWizardData({...wizardData, shopifyApiKey: e.target.value})}
                        />
                      </Form.Item>
                      <Form.Item label="API Secret Key (Optional)" help="Only needed for some authentication methods">
                        <Input.Password
                          placeholder="Enter API Secret Key if required"
                          value={wizardData.shopifyApiSecret}
                          onChange={(e) => setWizardData({...wizardData, shopifyApiSecret: e.target.value})}
                        />
                      </Form.Item>
                      <Alert
                        message="Security Note"
                        description="The Admin API access token provides full access to your store data. Keep it secure and never share it publicly."
                        type="warning"
                        showIcon
                        style={{ marginTop: '16px' }}
                      />
                      <Alert
                        message="App Installation Required"
                        description="Make sure you've installed the custom app in your Shopify store and granted all necessary permissions before proceeding."
                        type="info"
                        showIcon
                        style={{ marginTop: '16px' }}
                      />
                    </Form>
                  </div>
                )}

                {wizardCurrentStep === 3 && (
                  <div>
                    <Typography.Title level={4} style={{ marginBottom: '16px' }}>
                      Test Connections
                    </Typography.Title>
                    <Typography.Paragraph style={{ marginBottom: '24px' }}>
                      Let's verify that both connections are working properly before proceeding.
                    </Typography.Paragraph>
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <Card size="small">
                        <Row align="middle" justify="space-between">
                          <Col>
                            <Typography.Text strong>NetSuite Connection</Typography.Text>
                            <br />
                            <Typography.Text type="secondary">Testing API access...</Typography.Text>
                          </Col>
                          <Col>
                            <Tag color="processing">Testing...</Tag>
                          </Col>
                        </Row>
                      </Card>
                      <Card size="small">
                        <Row align="middle" justify="space-between">
                          <Col>
                            <Typography.Text strong>Shopify Connection</Typography.Text>
                            <br />
                            <Typography.Text type="secondary">Testing API access...</Typography.Text>
                          </Col>
                          <Col>
                            <Tag color="processing">Testing...</Tag>
                          </Col>
                        </Row>
                      </Card>
                      <Button type="primary" block style={{ marginTop: '16px' }}>
                        Run Connection Tests
                      </Button>
                    </Space>
                  </div>
                )}

                {wizardCurrentStep === 4 && (
                  <div>
                    <Typography.Title level={4} style={{ marginBottom: '16px' }}>
                      Initial Sync Configuration
                    </Typography.Title>
                    <Typography.Paragraph style={{ marginBottom: '24px' }}>
                      Choose what data you want to synchronize initially and set your sync preferences.
                    </Typography.Paragraph>
                    <Form layout="vertical">
                      <Typography.Title level={5} style={{ marginBottom: '16px' }}>
                        Data Types to Sync
                      </Typography.Title>
                      <Row gutter={16}>
                        <Col span={8}>
                          <Card hoverable>
                            <Checkbox
                              checked={wizardData.syncProducts}
                              onChange={(e) => setWizardData({...wizardData, syncProducts: e.target.checked})}
                            >
                              <Typography.Text strong>Products</Typography.Text>
                              <br />
                              <Typography.Text type="secondary" style={{ fontSize: '12px' }}>
                                Sync product catalog and pricing
                              </Typography.Text>
                            </Checkbox>
                          </Card>
                        </Col>
                        <Col span={8}>
                          <Card hoverable>
                            <Checkbox
                              checked={wizardData.syncInventory}
                              onChange={(e) => setWizardData({...wizardData, syncInventory: e.target.checked})}
                            >
                              <Typography.Text strong>Inventory</Typography.Text>
                              <br />
                              <Typography.Text type="secondary" style={{ fontSize: '12px' }}>
                                Sync stock levels and locations
                              </Typography.Text>
                            </Checkbox>
                          </Card>
                        </Col>
                        <Col span={8}>
                          <Card hoverable>
                            <Checkbox
                              checked={wizardData.syncOrders}
                              onChange={(e) => setWizardData({...wizardData, syncOrders: e.target.checked})}
                            >
                              <Typography.Text strong>Orders</Typography.Text>
                              <br />
                              <Typography.Text type="secondary" style={{ fontSize: '12px' }}>
                                Sync order data and fulfillment
                              </Typography.Text>
                            </Checkbox>
                          </Card>
                        </Col>
                      </Row>
                      <Form.Item label="Sync Interval (minutes)" style={{ marginTop: '24px' }}>
                        <Input
                          type="number"
                          min={5}
                          max={1440}
                          value={wizardData.syncInterval}
                          onChange={(e) => setWizardData({...wizardData, syncInterval: parseInt(e.target.value) || 30})}
                          style={{ width: '200px' }}
                        />
                        <Typography.Text type="secondary" style={{ marginLeft: '8px' }}>
                          How often to check for updates (5-1440 minutes)
                        </Typography.Text>
                      </Form.Item>
                    </Form>
                  </div>
                )}

                {wizardCurrentStep === 5 && (
                  <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                    <Typography.Title level={3} style={{ marginBottom: '16px' }}>
                      Setup Complete! 🎉
                    </Typography.Title>
                    <Typography.Paragraph style={{ fontSize: '16px', marginBottom: '24px' }}>
                      Your NetSuite ↔ Shopify integration has been configured successfully.
                      The system will now begin synchronizing your data according to your settings.
                    </Typography.Paragraph>
                    <Space direction="vertical" size="large">
                      <Card>
                        <Typography.Title level={5}>What's Next:</Typography.Title>
                        <ul style={{ textAlign: 'left', marginTop: '8px' }}>
                          <li>Monitor your first sync in the Dashboard</li>
                          <li>Review and adjust product mappings if needed</li>
                          <li>Set up automated sync schedules</li>
                          <li>Configure additional settings in Admin panel</li>
                        </ul>
                      </Card>
                      <Alert
                        message="First Sync Starting"
                        description="Your initial data synchronization will begin shortly. You can monitor progress in the Dashboard."
                        type="success"
                        showIcon
                      />
                    </Space>
                  </div>
                )}
              </div>

              <div style={{ marginTop: '32px', display: 'flex', justifyContent: 'space-between' }}>
                <Button
                  disabled={wizardCurrentStep === 0}
                  onClick={() => setWizardCurrentStep(wizardCurrentStep - 1)}
                >
                  Previous
                </Button>
                <Button
                  type="primary"
                  onClick={() => {
                    if (wizardCurrentStep < 5) {
                      setWizardCurrentStep(wizardCurrentStep + 1)
                    } else {
                      message.success('Setup completed successfully!')
                      setActiveTab('dashboard')
                    }
                  }}
                >
                  {wizardCurrentStep === 5 ? 'Finish Setup' : 'Next'}
                </Button>
              </div>
            </Card>
          </div>
        )}

        {/* Admin Pages */}
        {activeTab.startsWith('admin') && !isAdmin && (
          <Card>
            <Typography.Title level={4} style={{ marginBottom: '16px' }}>
              Access Denied
            </Typography.Title>
            <Typography.Text type="secondary">
              You don't have permission to access this admin section. Please contact your administrator.
            </Typography.Text>
          </Card>
        )}

        {activeTab === 'admin-dashboard' && isAdmin && (
          <div>
            <Typography.Title level={2} style={{ marginBottom: '24px' }}>
              Admin Dashboard
            </Typography.Title>
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={12} lg={6}>
                <Card>
                  <Statistic
                    title="Total Users"
                    value={0}
                    prefix={<UserOutlined />}
                  />
                </Card>
              </Col>
              <Col xs={24} sm={12} lg={6}>
                <Card>
                  <Statistic
                    title="Active Syncs"
                    value={0}
                    prefix={<CloudSyncOutlined />}
                  />
                </Card>
              </Col>
              <Col xs={24} sm={12} lg={6}>
                <Card>
                  <Statistic
                    title="System Health"
                    value={98}
                    suffix="%"
                    prefix={<MonitorOutlined />}
                  />
                </Card>
              </Col>
              <Col xs={24} sm={12} lg={6}>
                <Card>
                  <Statistic
                    title="API Calls Today"
                    value={0}
                    prefix={<ApiOutlined />}
                  />
                </Card>
              </Col>
            </Row>
            <Row gutter={[16, 16]} style={{ marginTop: '24px' }}>
              <Col xs={24} lg={12}>
                <Card title="Recent Activity" size="small">
                  <Typography.Text type="secondary">
                    No recent activity to display.
                  </Typography.Text>
                </Card>
              </Col>
              <Col xs={24} lg={12}>
                <Card title="System Status" size="small">
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography.Text>Database</Typography.Text>
                      <Tag color="green">Online</Tag>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography.Text>API Gateway</Typography.Text>
                      <Tag color="green">Online</Tag>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography.Text>Sync Service</Typography.Text>
                      <Tag color="yellow">Warning</Tag>
                    </div>
                  </Space>
                </Card>
              </Col>
            </Row>
          </div>
        )}

        {activeTab === 'configurations' && isAdmin && (
          <div>
            <Typography.Title level={2} style={{ marginBottom: '24px' }}>
              Configuration Management
            </Typography.Title>
            <Card>
              <Typography.Title level={4} style={{ marginBottom: '16px' }}>
                Platform Configurations
              </Typography.Title>
              <Form layout="vertical">
                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item label="Shopify API Version">
                      <Input placeholder="2024-01" />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item label="NetSuite API Version">
                      <Input placeholder="2023.2" />
                    </Form.Item>
                  </Col>
                </Row>
                <Form.Item label="Default Sync Interval (minutes)">
                  <Input type="number" placeholder="30" />
                </Form.Item>
                <Form.Item label="Max Retry Attempts">
                  <Input type="number" placeholder="3" />
                </Form.Item>
                <Button type="primary" style={{ marginRight: '8px' }}>
                  Save Configuration
                </Button>
                <Button>Reset to Defaults</Button>
              </Form>
            </Card>
          </div>
        )}

        {activeTab === 'sync-management' && (
          <SyncManagement />
        )}

        {activeTab === 'user-management' && isAdmin && (
          <div>
            <Typography.Title level={2} style={{ marginBottom: '24px' }}>
              User Management
            </Typography.Title>
            <Card
              title="Users"
              extra={
                <Button type="primary" icon={<UsergroupAddOutlined />}>
                  Add User
                </Button>
              }
            >
              <Table
                columns={[
                  { title: 'Name', dataIndex: 'name', key: 'name' },
                  { title: 'Email', dataIndex: 'email', key: 'email' },
                  { title: 'Role', dataIndex: 'role', key: 'role', render: (role: string) => <Tag color={role === 'admin' ? 'red' : 'blue'}>{role}</Tag> },
                  { title: 'Status', dataIndex: 'status', key: 'status', render: (status: string) => <Tag color={status === 'active' ? 'green' : 'orange'}>{status}</Tag> },
                  { title: 'Last Login', dataIndex: 'lastLogin', key: 'lastLogin' },
                  {
                    title: 'Actions',
                    key: 'actions',
                    render: () => (
                      <Space>
                        <Button size="small">Edit</Button>
                        <Button size="small" danger>Delete</Button>
                      </Space>
                    ),
                  },
                ]}
                dataSource={[]}
                locale={{ emptyText: 'No users found.' }}
                pagination={{ pageSize: 10 }}
              />
            </Card>
          </div>
        )}

        {activeTab === 'system-settings' && isAdmin && (
          <div>
            <Typography.Title level={2} style={{ marginBottom: '24px' }}>
              System Settings
            </Typography.Title>
            <Row gutter={[16, 16]}>
              <Col span={12}>
                <Card title="General Settings">
                  <Form layout="vertical">
                    <Form.Item label="System Name">
                      <Input placeholder="NetSuite Shopify iPaaS" />
                    </Form.Item>
                    <Form.Item label="Contact Email">
                      <Input placeholder="admin@example.com" />
                    </Form.Item>
                    <Form.Item label="Maintenance Mode">
                      <Button type="primary" danger>Enable Maintenance Mode</Button>
                    </Form.Item>
                  </Form>
                </Card>
              </Col>
              <Col span={12}>
                <Card title="Security Settings">
                  <Form layout="vertical">
                    <Form.Item label="Session Timeout (minutes)">
                      <Input type="number" placeholder="60" />
                    </Form.Item>
                    <Form.Item label="Password Policy">
                      <Input placeholder="Minimum 8 characters" />
                    </Form.Item>
                    <Form.Item label="Two-Factor Authentication">
                      <Button type="primary">Configure 2FA</Button>
                    </Form.Item>
                  </Form>
                </Card>
              </Col>
            </Row>
          </div>
        )}

        {activeTab === 'monitoring' && isAdmin && session && (
          <MonitoringDashboard session={session} />
        )}

        {activeTab === 'api-management' && isAdmin && (
          <div>
            <Typography.Title level={2} style={{ marginBottom: '24px' }}>
              API Management
            </Typography.Title>
            <Card title="API Endpoints">
              <Table
                columns={[
                  { title: 'Endpoint', dataIndex: 'endpoint', key: 'endpoint' },
                  { title: 'Method', dataIndex: 'method', key: 'method', render: (method: string) => <Tag color="blue">{method}</Tag> },
                  { title: 'Status', dataIndex: 'status', key: 'status', render: (status: string) => <Tag color={status === 'active' ? 'green' : 'red'}>{status}</Tag> },
                  { title: 'Rate Limit', dataIndex: 'rateLimit', key: 'rateLimit' },
                  {
                    title: 'Actions',
                    key: 'actions',
                    render: () => (
                      <Space>
                        <Button size="small">Edit</Button>
                        <Button size="small" danger>Disable</Button>
                      </Space>
                    ),
                  },
                ]}
                dataSource={[
                  { endpoint: '/api/oauth/start', method: 'POST', status: 'active', rateLimit: '100/min' },
                  { endpoint: '/api/oauth/callback', method: 'GET', status: 'active', rateLimit: '100/min' },
                  { endpoint: '/api/sync', method: 'POST', status: 'active', rateLimit: '10/min' },
                ]}
                pagination={{ pageSize: 10 }}
              />
            </Card>
          </div>
        )}

        {/* Products Management Page */}
        {activeTab === 'products' && (
          <ProductSyncPreview />
        )}

        {/* Inventory Management Page */}
        {activeTab === 'inventory' && (
          <div>
            <Typography.Title level={2} style={{ marginBottom: '24px' }}>
              Inventory Management
            </Typography.Title>
            <Row gutter={[16, 16]}>
              <Col span={24}>
                <Card
                  title="Inventory Overview"
                  extra={
                    <Space>
                      <Button type="primary" icon={<CloudSyncOutlined />}>
                        Sync Inventory Levels
                      </Button>
                      <Button icon={<DatabaseOutlined />}>
                        Refresh
                      </Button>
                      <Button icon={<FileTextOutlined />}>
                        Export
                      </Button>
                    </Space>
                  }
                >
                  <Row gutter={16} style={{ marginBottom: '16px' }}>
                    <Col span={4}>
                      <Statistic title="Total Items" value={0} prefix={<DatabaseOutlined />} />
                    </Col>
                    <Col span={4}>
                      <Statistic title="In Stock" value={0} prefix={<LinkOutlined />} />
                    </Col>
                    <Col span={4}>
                      <Statistic title="Low Stock" value={0} prefix={<SettingOutlined />} />
                    </Col>
                    <Col span={4}>
                      <Statistic title="Out of Stock" value={0} prefix={<MonitorOutlined />} />
                    </Col>
                    <Col span={4}>
                      <Statistic title="Pending Sync" value={0} prefix={<SyncOutlined />} />
                    </Col>
                    <Col span={4}>
                      <Statistic title="Last Sync" value="—" prefix={<DashboardOutlined />} />
                    </Col>
                  </Row>
                  <Table
                    columns={[
                      { title: 'SKU', dataIndex: 'sku', key: 'sku' },
                      { title: 'Product Name', dataIndex: 'name', key: 'name' },
                      { title: 'NetSuite Qty', dataIndex: 'netsuite_quantity', key: 'netsuite_quantity' },
                      { title: 'Shopify Qty', dataIndex: 'shopify_quantity', key: 'shopify_quantity' },
                      { title: 'Available Qty', dataIndex: 'available_quantity', key: 'available_quantity', render: (qty: number) => <Tag color={qty > 10 ? 'green' : qty > 0 ? 'orange' : 'red'}>{qty}</Tag> },
                      { title: 'Reserved Qty', dataIndex: 'reserved_quantity', key: 'reserved_quantity' },
                      { title: 'Location', dataIndex: 'location', key: 'location' },
                      { title: 'Last Updated', dataIndex: 'last_updated', key: 'last_updated', render: (date: string) => date ? new Date(date).toLocaleString() : 'Never' },
                      { title: 'Sync Status', dataIndex: 'sync_status', key: 'sync_status', render: (status: string) => <Tag color={status === 'synced' ? 'green' : status === 'pending' ? 'orange' : 'red'}>{status}</Tag> },
                      {
                        title: 'Actions',
                        key: 'actions',
                        render: () => (
                          <Space>
                            <Button size="small">Adjust</Button>
                            <Button size="small" type="primary">Sync</Button>
                            <Button size="small">History</Button>
                          </Space>
                        ),
                      },
                    ]}
                    dataSource={[]}
                    locale={{ emptyText: 'No inventory data loaded yet. Click "Sync Inventory Levels" to load inventory.' }}
                    pagination={{ pageSize: 20 }}
                  />
                </Card>
              </Col>
            </Row>
            <Row gutter={[16, 16]} style={{ marginTop: '16px' }}>
              <Col span={12}>
                <Card title="Low Stock Alerts" size="small">
                  <Typography.Text type="secondary">
                    Items with inventory below threshold will appear here.
                  </Typography.Text>
                </Card>
              </Col>
              <Col span={12}>
                <Card title="Inventory Discrepancies" size="small">
                  <Typography.Text type="secondary">
                    Items with quantity mismatches between platforms will appear here.
                  </Typography.Text>
                </Card>
              </Col>
            </Row>
          </div>
        )}

        {/* Orders Management Page */}
        {activeTab === 'orders' && (
          <div>
            <Typography.Title level={2} style={{ marginBottom: '24px' }}>
              Orders Management
            </Typography.Title>
            <Row gutter={[16, 16]}>
              <Col span={24}>
                <Card
                  title="Orders Overview"
                  extra={
                    <Space>
                      <Button type="primary" icon={<CloudSyncOutlined />}>
                        Sync Orders
                      </Button>
                      <Button icon={<DatabaseOutlined />}>
                        Refresh
                      </Button>
                      <Button icon={<FileTextOutlined />}>
                        Export
                      </Button>
                    </Space>
                  }
                >
                  <Row gutter={16} style={{ marginBottom: '16px' }}>
                    <Col span={4}>
                      <Statistic title="Total Orders" value={0} prefix={<FileTextOutlined />} />
                    </Col>
                    <Col span={4}>
                      <Statistic title="Pending" value={0} prefix={<SyncOutlined />} />
                    </Col>
                    <Col span={4}>
                      <Statistic title="Processing" value={0} prefix={<SettingOutlined />} />
                    </Col>
                    <Col span={4}>
                      <Statistic title="Shipped" value={0} prefix={<LinkOutlined />} />
                    </Col>
                    <Col span={4}>
                      <Statistic title="Completed" value={0} prefix={<DashboardOutlined />} />
                    </Col>
                    <Col span={4}>
                      <Statistic title="Revenue" value="$0" prefix={<DatabaseOutlined />} />
                    </Col>
                  </Row>
                  <Table
                    columns={[
                      { title: 'Order ID', dataIndex: 'order_id', key: 'order_id' },
                      { title: 'Platform', dataIndex: 'platform', key: 'platform', render: (platform: string) => <Tag color={platform === 'netsuite' ? 'blue' : 'green'}>{platform}</Tag> },
                      { title: 'Customer', dataIndex: 'customer_name', key: 'customer_name' },
                      { title: 'Status', dataIndex: 'status', key: 'status', render: (status: string) => <Tag color={
                        status === 'completed' ? 'green' :
                        status === 'processing' ? 'blue' :
                        status === 'shipped' ? 'orange' :
                        status === 'pending' ? 'yellow' : 'default'
                      }>{status}</Tag> },
                      { title: 'Total', dataIndex: 'total', key: 'total', render: (total: number) => `$${total?.toFixed(2) || '0.00'}` },
                      { title: 'Items', dataIndex: 'item_count', key: 'item_count' },
                      { title: 'Order Date', dataIndex: 'order_date', key: 'order_date', render: (date: string) => new Date(date).toLocaleDateString() },
                      { title: 'Last Sync', dataIndex: 'last_sync', key: 'last_sync', render: (date: string) => date ? new Date(date).toLocaleString() : 'Never' },
                      { title: 'Sync Status', dataIndex: 'sync_status', key: 'sync_status', render: (status: string) => <Tag color={status === 'synced' ? 'green' : status === 'pending' ? 'orange' : 'red'}>{status}</Tag> },
                      {
                        title: 'Actions',
                        key: 'actions',
                        render: () => (
                          <Space>
                            <Button size="small">View</Button>
                            <Button size="small">Edit</Button>
                            <Button size="small" type="primary">Sync</Button>
                          </Space>
                        ),
                      },
                    ]}
                    dataSource={[]}
                    locale={{ emptyText: 'No orders loaded yet. Click "Sync Orders" to load orders from platforms.' }}
                    pagination={{ pageSize: 20 }}
                  />
                </Card>
              </Col>
            </Row>
            <Row gutter={[16, 16]} style={{ marginTop: '16px' }}>
              <Col span={8}>
                <Card title="Order Status Distribution" size="small">
                  <Typography.Text type="secondary">
                    Visual breakdown of order statuses will appear here.
                  </Typography.Text>
                </Card>
              </Col>
              <Col span={8}>
                <Card title="Recent Orders" size="small">
                  <Typography.Text type="secondary">
                    Latest orders from both platforms will appear here.
                  </Typography.Text>
                </Card>
              </Col>
              <Col span={8}>
                <Card title="Sync Issues" size="small">
                  <Typography.Text type="secondary">
                    Orders with sync problems will appear here.
                  </Typography.Text>
                </Card>
              </Col>
            </Row>
          </div>
        )}

        {/* Field Mapping Configuration Page */}
        {activeTab === 'field-mapping' && session && (
          <FieldMappingManager session={session} />
        )}

        {/* Product Mappings Page */}
        {activeTab === 'mappings' && (
          <div>
            <Typography.Title level={2} style={{ marginBottom: '24px' }}>
              Product Mappings
            </Typography.Title>
            <Row gutter={[16, 16]}>
              <Col span={24}>
                <Card
                  title="Product Mappings"
                  extra={
                    <Space>
                      <Button type="primary" icon={<LinkOutlined />}>
                        Create Mapping
                      </Button>
                      <Button icon={<CloudSyncOutlined />}>
                        Auto Map
                      </Button>
                      <Button icon={<DatabaseOutlined />}>
                        Refresh
                      </Button>
                    </Space>
                  }
                >
                  <Row gutter={16} style={{ marginBottom: '16px' }}>
                    <Col span={6}>
                      <Statistic title="Total Mappings" value={0} prefix={<LinkOutlined />} />
                    </Col>
                    <Col span={6}>
                      <Statistic title="Active Syncs" value={0} prefix={<CloudSyncOutlined />} />
                    </Col>
                    <Col span={6}>
                      <Statistic title="Pending Syncs" value={0} prefix={<SyncOutlined />} />
                    </Col>
                    <Col span={6}>
                      <Statistic title="Conflicts" value={0} prefix={<SettingOutlined />} />
                    </Col>
                  </Row>
                  <Table
                    columns={[
                      { title: 'NetSuite SKU', dataIndex: 'netsuite_sku', key: 'netsuite_sku' },
                      { title: 'NetSuite Name', dataIndex: 'netsuite_name', key: 'netsuite_name' },
                      { title: 'Shopify SKU', dataIndex: 'shopify_sku', key: 'shopify_sku' },
                      { title: 'Shopify Name', dataIndex: 'shopify_name', key: 'shopify_name' },
                      { title: 'Sync Direction', dataIndex: 'sync_direction', key: 'sync_direction', render: (direction: string) => <Tag color="blue">{direction.replace('_', ' ← ')}</Tag> },
                      { title: 'Sync Status', dataIndex: 'sync_status', key: 'sync_status', render: (status: string) => <Tag color={status === 'completed' ? 'green' : status === 'failed' ? 'red' : 'orange'}>{status}</Tag> },
                      { title: 'Last Sync', dataIndex: 'last_synced', key: 'last_synced', render: (date: string) => date ? new Date(date).toLocaleString() : 'Never' },
                      {
                        title: 'Actions',
                        key: 'actions',
                        render: () => (
                          <Space>
                            <Button size="small">Edit</Button>
                            <Button size="small" type="primary">Sync Now</Button>
                            <Button size="small" danger>Delete</Button>
                          </Space>
                        ),
                      },
                    ]}
                    dataSource={[]}
                    locale={{ emptyText: 'No product mappings created yet. Click "Create Mapping" to map NetSuite and Shopify products.' }}
                    pagination={{ pageSize: 15 }}
                  />
                </Card>
              </Col>
            </Row>
          </div>
        )}

        {/* Sync Scheduling Page */}
        {activeTab === 'sync-scheduling' && isAdmin && (
          <div>
            <Typography.Title level={2} style={{ marginBottom: '24px' }}>
              Sync Scheduling
            </Typography.Title>
            <Row gutter={[16, 16]}>
              <Col span={24}>
                <Card
                  title="Scheduled Syncs"
                  extra={
                    <Button type="primary" icon={<SettingOutlined />}>
                      Create Schedule
                    </Button>
                  }
                >
                  <Row gutter={16} style={{ marginBottom: '16px' }}>
                    <Col span={6}>
                      <Statistic title="Active Schedules" value={0} prefix={<SettingOutlined />} />
                    </Col>
                    <Col span={6}>
                      <Statistic title="Next Run" value="—" prefix={<DashboardOutlined />} />
                    </Col>
                    <Col span={6}>
                      <Statistic title="Today's Runs" value={0} prefix={<CloudSyncOutlined />} />
                    </Col>
                    <Col span={6}>
                      <Statistic title="Failed Runs" value={0} prefix={<MonitorOutlined />} />
                    </Col>
                  </Row>
                  <Table
                    columns={[
                      { title: 'Schedule Name', dataIndex: 'name', key: 'name' },
                      { title: 'Type', dataIndex: 'schedule_type', key: 'schedule_type', render: (type: string) => <Tag color="blue">{type}</Tag> },
                      { title: 'Frequency', dataIndex: 'frequency', key: 'frequency' },
                      { title: 'Direction', dataIndex: 'sync_direction', key: 'sync_direction', render: (direction: string) => <Tag color="green">{direction.replace('_', ' → ')}</Tag> },
                      { title: 'Status', dataIndex: 'is_active', key: 'is_active', render: (active: boolean) => <Tag color={active ? 'green' : 'red'}>{active ? 'Active' : 'Inactive'}</Tag> },
                      { title: 'Last Run', dataIndex: 'last_run', key: 'last_run', render: (date: string) => date ? new Date(date).toLocaleString() : 'Never' },
                      { title: 'Next Run', dataIndex: 'next_run', key: 'next_run', render: (date: string) => date ? new Date(date).toLocaleString() : '—' },
                      {
                        title: 'Actions',
                        key: 'actions',
                        render: () => (
                          <Space>
                            <Button size="small">Edit</Button>
                            <Button size="small" type="primary">Run Now</Button>
                            <Button size="small" danger>Delete</Button>
                          </Space>
                        ),
                      },
                    ]}
                    dataSource={[]}
                    locale={{ emptyText: 'No sync schedules configured. Click "Create Schedule" to set up automated syncs.' }}
                    pagination={{ pageSize: 10 }}
                  />
                </Card>
              </Col>
            </Row>
          </div>
        )}

        {/* Sync Profiles Management Page */}
        {activeTab === 'sync-profiles' && (
          <div>
            <Typography.Title level={2} style={{ marginBottom: '24px' }}>
              Sync Profiles Management
            </Typography.Title>
            <Row gutter={[16, 16]}>
              <Col span={24}>
                <Card
                  title="Sync Profiles"
                  extra={
                    <Button
                      type="primary"
                      icon={<SettingOutlined />}
                      onClick={() => {
                        setEditingProfile(null)
                        setProfileModalVisible(true)
                      }}
                    >
                      Create Profile
                    </Button>
                  }
                >
                  <Row gutter={16} style={{ marginBottom: '16px' }}>
                    <Col span={6}>
                      <Statistic title="Total Profiles" value={syncProfiles.length} prefix={<SettingOutlined />} />
                    </Col>
                    <Col span={6}>
                      <Statistic title="Active Profiles" value={syncProfiles.filter(p => p.isActive).length} prefix={<CloudSyncOutlined />} />
                    </Col>
                    <Col span={6}>
                      <Statistic title="Scheduled Syncs" value={syncProfiles.filter(p => p.schedule.enabled).length} prefix={<DashboardOutlined />} />
                    </Col>
                    <Col span={6}>
                      <Statistic title="Data Types" value={3} prefix={<DatabaseOutlined />} />
                    </Col>
                  </Row>
                  <Table
                    columns={[
                      { title: 'Profile Name', dataIndex: 'name', key: 'name' },
                      { title: 'Description', dataIndex: 'description', key: 'description' },
                      {
                        title: 'Data Types',
                        key: 'dataTypes',
                        render: (profile) => (
                          <Space>
                            {profile.dataTypes.products && <Tag color="blue">Products</Tag>}
                            {profile.dataTypes.inventory && <Tag color="green">Inventory</Tag>}
                            {profile.dataTypes.orders && <Tag color="orange">Orders</Tag>}
                          </Space>
                        ),
                      },
                      {
                        title: 'Sync Direction',
                        dataIndex: 'syncDirection',
                        key: 'syncDirection',
                        render: (direction: string) => {
                          const labels: Record<string, string> = {
                            'netsuite_to_shopify': 'NetSuite → Shopify',
                            'shopify_to_netsuite': 'Shopify → NetSuite',
                            'bidirectional': 'Bidirectional'
                          }
                          return <Tag color="purple">{labels[direction] || direction}</Tag>
                        },
                      },
                      {
                        title: 'Schedule',
                        key: 'schedule',
                        render: (profile) => (
                          profile.schedule.enabled ?
                            `${profile.schedule.interval} ${profile.schedule.unit}` :
                            'Manual'
                        ),
                      },
                      {
                        title: 'Status',
                        dataIndex: 'isActive',
                        key: 'isActive',
                        render: (active: boolean) => (
                          <Tag color={active ? 'green' : 'red'}>
                            {active ? 'Active' : 'Inactive'}
                          </Tag>
                        ),
                      },
                      {
                        title: 'Actions',
                        key: 'actions',
                        render: (profile) => (
                          <Space>
                            <Button
                              size="small"
                              onClick={() => {
                                setEditingProfile(profile)
                                setProfileModalVisible(true)
                              }}
                            >
                              Edit
                            </Button>
                            <Button
                              size="small"
                              type="primary"
                              onClick={() => handleRunSync(profile)}
                            >
                              Run Sync
                            </Button>
                            <Button
                              size="small"
                              danger
                              onClick={() => {
                                setSyncProfiles(profiles => profiles.filter(p => p.id !== profile.id))
                                message.success('Profile deleted successfully')
                              }}
                            >
                              Delete
                            </Button>
                          </Space>
                        ),
                      },
                    ]}
                    dataSource={syncProfiles}
                    locale={{ emptyText: 'No sync profiles created yet. Click "Create Profile" to get started.' }}
                    pagination={{ pageSize: 10 }}
                    rowKey="id"
                  />
                </Card>
              </Col>
            </Row>
          </div>
        )}

        {/* Profile Creation/Editing Modal */}
        <Modal
          title={editingProfile ? 'Edit Sync Profile' : 'Create New Sync Profile'}
          open={profileModalVisible}
          onCancel={() => {
            setProfileModalVisible(false)
            setEditingProfile(null)
          }}
          width={800}
          footer={[
            <Button key="cancel" onClick={() => {
              setProfileModalVisible(false)
              setEditingProfile(null)
            }}>
              Cancel
            </Button>,
            <Button key="save" type="primary" onClick={() => {
              message.success(editingProfile ? 'Profile updated successfully' : 'Profile created successfully')
              setProfileModalVisible(false)
              setEditingProfile(null)
            }}>
              {editingProfile ? 'Update Profile' : 'Create Profile'}
            </Button>,
          ]}
        >
          <Form layout="vertical">
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item label="Profile Name" required>
                  <Input
                    placeholder="Enter profile name"
                    defaultValue={editingProfile?.name || ''}
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="Status">
                  <Switch
                    checkedChildren="Active"
                    unCheckedChildren="Inactive"
                    defaultChecked={editingProfile?.isActive ?? true}
                  />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item label="Description">
              <Input.TextArea
                placeholder="Describe what this profile syncs"
                defaultValue={editingProfile?.description || ''}
                rows={3}
              />
            </Form.Item>

            <Typography.Title level={5} style={{ marginTop: '24px', marginBottom: '16px' }}>
              Data Types to Sync
            </Typography.Title>
            <Row gutter={16}>
              <Col span={8}>
                <Card size="small" hoverable>
                  <Checkbox
                    defaultChecked={editingProfile?.dataTypes.products ?? true}
                  >
                    <Typography.Text strong>Products</Typography.Text>
                    <br />
                    <Typography.Text type="secondary" style={{ fontSize: '12px' }}>
                      Catalog items, pricing, descriptions
                    </Typography.Text>
                  </Checkbox>
                </Card>
              </Col>
              <Col span={8}>
                <Card size="small" hoverable>
                  <Checkbox
                    defaultChecked={editingProfile?.dataTypes.inventory ?? true}
                  >
                    <Typography.Text strong>Inventory</Typography.Text>
                    <br />
                    <Typography.Text type="secondary" style={{ fontSize: '12px' }}>
                      Stock levels, locations, quantities
                    </Typography.Text>
                  </Checkbox>
                </Card>
              </Col>
              <Col span={8}>
                <Card size="small" hoverable>
                  <Checkbox
                    defaultChecked={editingProfile?.dataTypes.orders ?? true}
                  >
                    <Typography.Text strong>Orders</Typography.Text>
                    <br />
                    <Typography.Text type="secondary" style={{ fontSize: '12px' }}>
                      Sales orders, fulfillment, tracking
                    </Typography.Text>
                  </Checkbox>
                </Card>
              </Col>
            </Row>

            <Typography.Title level={5} style={{ marginTop: '24px', marginBottom: '16px' }}>
              Sync Configuration
            </Typography.Title>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item label="Sync Direction" required>
                  <Select
                    defaultValue={editingProfile?.syncDirection || 'bidirectional'}
                    style={{ width: '100%' }}
                  >
                    <Select.Option value="netsuite_to_shopify">NetSuite → Shopify</Select.Option>
                    <Select.Option value="shopify_to_netsuite">Shopify → NetSuite</Select.Option>
                    <Select.Option value="bidirectional">Bidirectional</Select.Option>
                  </Select>
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="Sync Schedule">
                  <Space>
                    <Switch
                      checkedChildren="Auto"
                      unCheckedChildren="Manual"
                      defaultChecked={editingProfile?.schedule.enabled ?? true}
                    />
                    <Input
                      type="number"
                      placeholder="30"
                      style={{ width: '80px' }}
                      defaultValue={editingProfile?.schedule.interval || 30}
                    />
                    <Select
                      defaultValue={editingProfile?.schedule.unit || 'minutes'}
                      style={{ width: '100px' }}
                    >
                      <Select.Option value="minutes">Minutes</Select.Option>
                      <Select.Option value="hours">Hours</Select.Option>
                      <Select.Option value="days">Days</Select.Option>
                    </Select>
                  </Space>
                </Form.Item>
              </Col>
            </Row>

            <Typography.Title level={5} style={{ marginTop: '24px', marginBottom: '16px' }}>
              Filters & Conditions
            </Typography.Title>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item label="Product Categories">
                  <Select
                    mode="multiple"
                    placeholder="Select categories to sync"
                    style={{ width: '100%' }}
                    defaultValue={editingProfile?.filters.productCategories || []}
                  >
                    <Select.Option value="electronics">Electronics</Select.Option>
                    <Select.Option value="clothing">Clothing</Select.Option>
                    <Select.Option value="books">Books</Select.Option>
                    <Select.Option value="home">Home & Garden</Select.Option>
                  </Select>
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="Order Statuses">
                  <Select
                    mode="multiple"
                    placeholder="Select order statuses to sync"
                    style={{ width: '100%' }}
                    defaultValue={editingProfile?.filters.orderStatuses || ['paid', 'fulfilled']}
                  >
                    <Select.Option value="pending">Pending</Select.Option>
                    <Select.Option value="paid">Paid</Select.Option>
                    <Select.Option value="processing">Processing</Select.Option>
                    <Select.Option value="shipped">Shipped</Select.Option>
                    <Select.Option value="fulfilled">Fulfilled</Select.Option>
                    <Select.Option value="cancelled">Cancelled</Select.Option>
                  </Select>
                </Form.Item>
              </Col>
            </Row>
          </Form>
        </Modal>

        {/* Sync History Page */}
        {activeTab === 'sync-history' && (
          <div>
            <Typography.Title level={2} style={{ marginBottom: '24px' }}>
              Sync History
            </Typography.Title>
            <Row gutter={[16, 16]}>
              <Col span={24}>
                <Card
                  title="Sync History"
                  extra={
                    <Space>
                      <Button icon={<DatabaseOutlined />} onClick={() => void loadSyncLogs()}>
                        Refresh
                      </Button>
                      <Button icon={<FileTextOutlined />}>
                        Export
                      </Button>
                    </Space>
                  }
                >
                  <Row gutter={16} style={{ marginBottom: '16px' }}>
                    <Col span={4}>
                      <Statistic title="Total Syncs" value={0} prefix={<CloudSyncOutlined />} />
                    </Col>
                    <Col span={4}>
                      <Statistic title="Successful" value={0} prefix={<DashboardOutlined />} />
                    </Col>
                    <Col span={4}>
                      <Statistic title="Failed" value={0} prefix={<MonitorOutlined />} />
                    </Col>
                    <Col span={4}>
                      <Statistic title="Partial" value={0} prefix={<SettingOutlined />} />
                    </Col>
                    <Col span={4}>
                      <Statistic title="Items Synced" value={0} prefix={<DatabaseOutlined />} />
                    </Col>
                    <Col span={4}>
                      <Statistic title="Avg Duration" value="—" prefix={<DashboardOutlined />} />
                    </Col>
                  </Row>
                  <Table
                    loading={syncLogsLoading}
                    columns={[
                      { title: 'Sync ID', dataIndex: 'id', key: 'id', width: 80 },
                      { title: 'Type', dataIndex: 'sync_type', key: 'sync_type', render: (type: string) => <Tag color="blue">{type}</Tag> },
                      { title: 'Direction', dataIndex: 'direction', key: 'direction', render: (direction: string) => <Tag color="green">{direction.replace('_', ' → ')}</Tag> },
                      { title: 'Status', dataIndex: 'status', key: 'status', render: (status: string) => <Tag color={status === 'completed' ? 'green' : status === 'failed' ? 'red' : status === 'running' ? 'blue' : 'orange'}>{status}</Tag> },
                      { title: 'Items Processed', dataIndex: 'items_processed', key: 'items_processed' },
                      { title: 'Items Succeeded', dataIndex: 'items_succeeded', key: 'items_succeeded' },
                      { title: 'Items Failed', dataIndex: 'items_failed', key: 'items_failed' },
                      { title: 'Duration', dataIndex: 'duration_seconds', key: 'duration_seconds', render: (seconds: number) => seconds ? `${Math.round(seconds)}s` : '—' },
                      { title: 'Started', dataIndex: 'started_at', key: 'started_at', render: (date: string) => new Date(date).toLocaleString() },
                      {
                        title: 'Actions',
                        key: 'actions',
                        render: () => (
                          <Space>
                            <Button size="small">Details</Button>
                            <Button size="small">Retry</Button>
                          </Space>
                        ),
                      },
                    ]}
                    dataSource={syncLogs}
                    locale={{ emptyText: 'No sync history available. Sync operations will appear here once executed.' }}
                    pagination={{ pageSize: 15 }}
                  />
                </Card>
              </Col>
            </Row>
          </div>
        )}

        {activeTab !== 'dashboard' && activeTab !== 'connections' && activeTab !== 'setup-wizard' && activeTab !== 'sync-profiles' && !activeTab.startsWith('admin') && activeTab !== 'products' && activeTab !== 'inventory' && activeTab !== 'orders' && activeTab !== 'mappings' && activeTab !== 'sync-scheduling' && activeTab !== 'sync-history' && (
          <Card>
            <Typography.Title level={4} style={{ marginBottom: '16px' }}>
              {activeTab.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
            </Typography.Title>
            <Typography.Text type="secondary">
              This section is under development. The {activeTab} functionality will be implemented in the next phase.
            </Typography.Text>
          </Card>
        )}
        </div>
      </div>
    </div>
  )
}

import { useNavigate } from 'react-router-dom'
import { Button, Card, Row, Col, Typography, Space, Statistic } from 'antd'
import {
  ThunderboltOutlined,
  CheckCircleOutlined,
  RocketOutlined,
  SafetyOutlined,
  CloudSyncOutlined,
  DollarOutlined,
  ApiOutlined,
  LineChartOutlined,
} from '@ant-design/icons'

const { Title, Paragraph, Text } = Typography

export default function Landing() {
  const navigate = useNavigate()

  const features = [
    {
      icon: <ThunderboltOutlined style={{ fontSize: '48px', color: '#1890ff' }} />,
      title: 'Lightning Fast Sync',
      description: 'Real-time synchronization between NetSuite and Shopify at quantum speed.',
    },
    {
      icon: <CloudSyncOutlined style={{ fontSize: '48px', color: '#52c41a' }} />,
      title: 'Multi-Currency Support',
      description: 'Handle 150+ currencies with automatic conversion and real-time rates.',
    },
    {
      icon: <SafetyOutlined style={{ fontSize: '48px', color: '#722ed1' }} />,
      title: 'Enterprise Security',
      description: 'Bank-level encryption, OAuth 2.0, and complete data ownership.',
    },
    {
      icon: <ApiOutlined style={{ fontSize: '48px', color: '#fa8c16' }} />,
      title: 'Custom Field Mapping',
      description: 'Map any field with 10+ transformation types and validation rules.',
    },
    {
      icon: <LineChartOutlined style={{ fontSize: '48px', color: '#eb2f96' }} />,
      title: 'Analytics Dashboard',
      description: 'Real-time KPIs, performance metrics, and comprehensive reporting.',
    },
    {
      icon: <RocketOutlined style={{ fontSize: '48px', color: '#13c2c2' }} />,
      title: 'Unlimited Stores',
      description: 'Manage unlimited Shopify stores without additional cost.',
    },
  ]

  const comparisonData = [
    { feature: 'Cost/Month', celigo: '$300-500', syncflow: '$25', winner: true },
    { feature: 'Multi-Currency', celigo: '❌', syncflow: '✅', winner: true },
    { feature: 'Refund Auto-Sync', celigo: '❌', syncflow: '✅', winner: true },
    { feature: 'Unlimited Stores', celigo: 'Limited', syncflow: '✅ Unlimited', winner: true },
    { feature: 'Custom Fields', celigo: 'Basic', syncflow: '✅ Advanced', winner: true },
    { feature: 'Data Ownership', celigo: 'Shared', syncflow: '✅ 100% Yours', winner: true },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#fff' }}>
      {/* Navigation */}
      <div
        style={{
          padding: '20px 50px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid #f0f0f0',
          position: 'sticky',
          top: 0,
          background: '#fff',
          zIndex: 1000,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <ThunderboltOutlined style={{ fontSize: '32px', color: '#1890ff' }} />
          <Title level={3} style={{ margin: 0, color: '#1890ff' }}>
            SyncFlow
          </Title>
        </div>
        <Space size="middle">
          <Button type="text" onClick={() => navigate('/auth/login')}>
            Sign In
          </Button>
          <Button type="primary" size="large" onClick={() => navigate('/auth/signup')}>
            Get Started Free
          </Button>
        </Space>
      </div>

      {/* Hero Section */}
      <div
        style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          padding: '100px 50px',
          textAlign: 'center',
          color: '#fff',
        }}
      >
        <ThunderboltOutlined style={{ fontSize: '80px', marginBottom: '20px' }} />
        <Title level={1} style={{ color: '#fff', fontSize: '56px', marginBottom: '20px' }}>
          NetSuite ↔ Shopify Integration
          <br />
          At Quantum Speed ⚡
        </Title>
        <Paragraph style={{ fontSize: '24px', color: '#fff', marginBottom: '40px', opacity: 0.9 }}>
          Enterprise iPaaS that EXCEEDS Celigo while saving $10,000+ annually
        </Paragraph>
        <Space size="large">
          <Button
            type="primary"
            size="large"
            style={{
              height: '60px',
              fontSize: '20px',
              padding: '0 50px',
              background: '#fff',
              color: '#667eea',
              border: 'none',
            }}
            onClick={() => navigate('/auth/signup')}
          >
            Start Free Trial
          </Button>
          <Button
            size="large"
            style={{
              height: '60px',
              fontSize: '20px',
              padding: '0 50px',
              background: 'transparent',
              color: '#fff',
              borderColor: '#fff',
            }}
            onClick={() => navigate('/auth/login')}
          >
            Watch Demo
          </Button>
        </Space>

        {/* Stats */}
        <Row gutter={[32, 32]} style={{ marginTop: '80px', maxWidth: '900px', margin: '80px auto 0' }}>
          <Col span={8}>
            <Statistic
              title={<span style={{ color: '#fff', fontSize: '18px' }}>Annual Savings</span>}
              value="$10,500+"
              valueStyle={{ color: '#fff', fontSize: '36px', fontWeight: 'bold' }}
            />
          </Col>
          <Col span={8}>
            <Statistic
              title={<span style={{ color: '#fff', fontSize: '18px' }}>Features</span>}
              value="7/7"
              suffix="Complete"
              valueStyle={{ color: '#fff', fontSize: '36px', fontWeight: 'bold' }}
            />
          </Col>
          <Col span={8}>
            <Statistic
              title={<span style={{ color: '#fff', fontSize: '18px' }}>vs Celigo</span>}
              value="10-0"
              suffix="Victory"
              valueStyle={{ color: '#fff', fontSize: '36px', fontWeight: 'bold' }}
            />
          </Col>
        </Row>
      </div>

      {/* Features Section */}
      <div style={{ padding: '100px 50px', maxWidth: '1200px', margin: '0 auto' }}>
        <Title level={2} style={{ textAlign: 'center', marginBottom: '60px', fontSize: '42px' }}>
          Everything You Need to Succeed
        </Title>
        <Row gutter={[48, 48]}>
          {features.map((feature, index) => (
            <Col xs={24} md={12} lg={8} key={index}>
              <Card
                hoverable
                style={{
                  textAlign: 'center',
                  height: '100%',
                  border: '1px solid #f0f0f0',
                  borderRadius: '12px',
                }}
              >
                <div style={{ marginBottom: '20px' }}>{feature.icon}</div>
                <Title level={4}>{feature.title}</Title>
                <Paragraph style={{ color: '#666' }}>{feature.description}</Paragraph>
              </Card>
            </Col>
          ))}
        </Row>
      </div>

      {/* Comparison Section */}
      <div
        style={{
          background: '#f9fafb',
          padding: '100px 50px',
        }}
      >
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
          <Title level={2} style={{ textAlign: 'center', marginBottom: '20px', fontSize: '42px' }}>
            Why Choose SyncFlow Over Celigo?
          </Title>
          <Paragraph style={{ textAlign: 'center', fontSize: '18px', color: '#666', marginBottom: '60px' }}>
            More features, better value, complete control
          </Paragraph>

          <Card style={{ borderRadius: '12px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #f0f0f0' }}>
                  <th style={{ padding: '20px', textAlign: 'left', fontSize: '18px' }}>Feature</th>
                  <th style={{ padding: '20px', textAlign: 'center', fontSize: '18px' }}>Celigo</th>
                  <th style={{ padding: '20px', textAlign: 'center', fontSize: '18px', color: '#1890ff' }}>
                    SyncFlow
                  </th>
                </tr>
              </thead>
              <tbody>
                {comparisonData.map((row, index) => (
                  <tr key={index} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '20px', fontWeight: 500 }}>{row.feature}</td>
                    <td style={{ padding: '20px', textAlign: 'center', color: '#999' }}>{row.celigo}</td>
                    <td
                      style={{
                        padding: '20px',
                        textAlign: 'center',
                        color: row.winner ? '#52c41a' : '#666',
                        fontWeight: row.winner ? 600 : 400,
                      }}
                    >
                      {row.syncflow}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <div style={{ textAlign: 'center', marginTop: '40px' }}>
            <Title level={3} style={{ color: '#52c41a' }}>
              🏆 Score: 10-0 Victory
            </Title>
          </div>
        </div>
      </div>

      {/* Pricing Section */}
      <div style={{ padding: '100px 50px', maxWidth: '1200px', margin: '0 auto' }}>
        <Title level={2} style={{ textAlign: 'center', marginBottom: '60px', fontSize: '42px' }}>
          Simple, Transparent Pricing
        </Title>
        <Row gutter={[32, 32]} justify="center">
          <Col xs={24} md={12} lg={8}>
            <Card
              style={{
                textAlign: 'center',
                borderRadius: '12px',
                border: '1px solid #f0f0f0',
              }}
            >
              <Title level={4}>Celigo</Title>
              <Title level={2} style={{ color: '#999' }}>
                $300-500
                <span style={{ fontSize: '16px', fontWeight: 'normal' }}>/month</span>
              </Title>
              <ul style={{ textAlign: 'left', padding: '20px', color: '#666' }}>
                <li>Limited stores</li>
                <li>Basic features</li>
                <li>Shared data</li>
                <li>No multi-currency</li>
                <li>No refund sync</li>
              </ul>
            </Card>
          </Col>
          <Col xs={24} md={12} lg={8}>
            <Card
              style={{
                textAlign: 'center',
                borderRadius: '12px',
                border: '3px solid #1890ff',
                transform: 'scale(1.05)',
                boxShadow: '0 10px 30px rgba(24,144,255,0.2)',
              }}
            >
              <div
                style={{
                  background: '#1890ff',
                  color: '#fff',
                  padding: '8px',
                  borderRadius: '20px',
                  marginBottom: '20px',
                }}
              >
                BEST VALUE
              </div>
              <Title level={4}>SyncFlow</Title>
              <Title level={2} style={{ color: '#1890ff' }}>
                $25
                <span style={{ fontSize: '16px', fontWeight: 'normal' }}>/month</span>
              </Title>
              <ul style={{ textAlign: 'left', padding: '20px' }}>
                <li>
                  <CheckCircleOutlined style={{ color: '#52c41a' }} /> Unlimited stores
                </li>
                <li>
                  <CheckCircleOutlined style={{ color: '#52c41a' }} /> All features
                </li>
                <li>
                  <CheckCircleOutlined style={{ color: '#52c41a' }} /> 100% data ownership
                </li>
                <li>
                  <CheckCircleOutlined style={{ color: '#52c41a' }} /> Multi-currency
                </li>
                <li>
                  <CheckCircleOutlined style={{ color: '#52c41a' }} /> Auto refund sync
                </li>
                <li>
                  <CheckCircleOutlined style={{ color: '#52c41a' }} /> Custom fields
                </li>
                <li>
                  <CheckCircleOutlined style={{ color: '#52c41a' }} /> Analytics dashboard
                </li>
              </ul>
              <Button
                type="primary"
                size="large"
                block
                style={{ height: '50px', fontSize: '18px', marginTop: '20px' }}
                onClick={() => navigate('/auth/signup')}
              >
                Start Free Trial
              </Button>
            </Card>
          </Col>
        </Row>
        <div style={{ textAlign: 'center', marginTop: '40px' }}>
          <Paragraph style={{ fontSize: '18px', color: '#666' }}>
            <DollarOutlined style={{ color: '#52c41a' }} /> Save <strong>$10,500+ per year</strong> compared to Celigo
          </Paragraph>
        </div>
      </div>

      {/* CTA Section */}
      <div
        style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          padding: '100px 50px',
          textAlign: 'center',
          color: '#fff',
        }}
      >
        <Title level={2} style={{ color: '#fff', fontSize: '42px', marginBottom: '20px' }}>
          Ready to Transform Your Business?
        </Title>
        <Paragraph style={{ fontSize: '20px', marginBottom: '40px', opacity: 0.9 }}>
          Join businesses saving thousands while getting better features
        </Paragraph>
        <Button
          type="primary"
          size="large"
          style={{
            height: '60px',
            fontSize: '20px',
            padding: '0 50px',
            background: '#fff',
            color: '#667eea',
            border: 'none',
          }}
          onClick={() => navigate('/auth/signup')}
        >
          Get Started Free - No Credit Card Required
        </Button>
      </div>

      {/* Footer */}
      <div
        style={{
          padding: '50px',
          background: '#001529',
          color: '#fff',
          textAlign: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '20px' }}>
          <ThunderboltOutlined style={{ fontSize: '24px', color: '#1890ff' }} />
          <Text style={{ fontSize: '20px', color: '#fff', fontWeight: 'bold' }}>SyncFlow</Text>
        </div>
        <Paragraph style={{ color: '#999' }}>
          © 2025 SyncFlow. Built with ❤️ for businesses who value data ownership and cost efficiency.
        </Paragraph>
        <Space size="large" style={{ marginTop: '20px' }}>
          <Button type="link" style={{ color: '#999' }} onClick={() => navigate('/auth/login')}>
            Sign In
          </Button>
          <Button type="link" style={{ color: '#999' }}>
            Documentation
          </Button>
          <Button type="link" style={{ color: '#999' }}>
            Support
          </Button>
          <Button type="link" style={{ color: '#999' }}>
            Privacy Policy
          </Button>
        </Space>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, Form, Input, Button, Alert, Typography, Result } from 'antd'
import { MailOutlined, ArrowLeftOutlined } from '@ant-design/icons'
import { useAuth } from '../contexts/AuthContext'

const { Title, Text } = Typography

export default function ForgotPassword() {
  const { resetPassword } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (values: { email: string }) => {
    setError(null)
    setSuccess(false)
    setLoading(true)

    try {
      const { error } = await resetPassword(values.email)
      
      if (error) {
        setError(error.message)
      } else {
        setSuccess(true)
      }
    } catch (err) {
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          padding: '20px',
        }}
      >
        <Card
          style={{
            width: '100%',
            maxWidth: '500px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }}
        >
          <Result
            status="success"
            title="Check Your Email"
            subTitle="We've sent you a password reset link. Please check your email and follow the instructions."
            extra={[
              <Link to="/auth/login" key="login">
                <Button type="primary">Back to Login</Button>
              </Link>,
            ]}
          />
        </Card>
      </div>
    )
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        padding: '20px',
      }}
    >
      <Card
        style={{
          width: '100%',
          maxWidth: '450px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        <Link to="/auth/login" style={{ display: 'inline-block', marginBottom: '16px' }}>
          <Button type="text" icon={<ArrowLeftOutlined />}>
            Back to Login
          </Button>
        </Link>

        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <Title level={2} style={{ marginBottom: '8px' }}>
            Forgot Password?
          </Title>
          <Text type="secondary">
            Enter your email and we'll send you a link to reset your password
          </Text>
        </div>

        {error && (
          <Alert
            message="Error"
            description={error}
            type="error"
            closable
            onClose={() => setError(null)}
            style={{ marginBottom: '24px' }}
          />
        )}

        <Form
          name="forgot-password"
          onFinish={handleSubmit}
          layout="vertical"
          requiredMark={false}
        >
          <Form.Item
            name="email"
            rules={[
              { required: true, message: 'Please enter your email' },
              { type: 'email', message: 'Please enter a valid email' },
            ]}
          >
            <Input
              prefix={<MailOutlined />}
              placeholder="Email address"
              size="large"
            />
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              block
              size="large"
              loading={loading}
              style={{ height: '48px' }}
            >
              Send Reset Link
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}

import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Card, Form, Input, Button, Alert, Typography, Divider, Checkbox } from 'antd'
import { UserOutlined, LockOutlined, GoogleOutlined, MailOutlined } from '@ant-design/icons'
import { useAuth } from '../contexts/AuthContext'

const { Title, Text } = Typography

export default function Signup() {
  const navigate = useNavigate()
  const { signUp, signInWithGoogle } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (values: { email: string; password: string }) => {
    setError(null)
    setSuccess(false)
    setLoading(true)

    try {
      const { error } = await signUp(values.email, values.password)
      
      if (error) {
        setError(error.message)
      } else {
        setSuccess(true)
        // Optionally redirect after a delay
        setTimeout(() => navigate('/auth/login'), 3000)
      }
    } catch (err) {
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    setError(null)
    setLoading(true)

    try {
      const { error } = await signInWithGoogle()
      
      if (error) {
        setError(error.message)
      }
      // User will be redirected to Google
    } catch (err) {
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
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
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <Title level={2} style={{ marginBottom: '8px' }}>
            Create Your SyncFlow Account
          </Title>
          <Text type="secondary">Start syncing in minutes</Text>
        </div>

        {error && (
          <Alert
            message="Signup Error"
            description={error}
            type="error"
            closable
            onClose={() => setError(null)}
            style={{ marginBottom: '24px' }}
          />
        )}

        {success && (
          <Alert
            message="Success!"
            description="Your account has been created. Please check your email to verify your account."
            type="success"
            style={{ marginBottom: '24px' }}
          />
        )}

        <Button
          type="default"
          block
          size="large"
          icon={<GoogleOutlined />}
          onClick={handleGoogleSignIn}
          loading={loading}
          style={{ marginBottom: '16px', height: '48px' }}
        >
          Sign up with Google
        </Button>

        <Divider>
          <Text type="secondary">Or sign up with email</Text>
        </Divider>

        <Form
          name="signup"
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

          <Form.Item
            name="password"
            rules={[
              { required: true, message: 'Please enter your password' },
              { min: 6, message: 'Password must be at least 6 characters' },
            ]}
            help="Password must be at least 6 characters"
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="Password"
              size="large"
            />
          </Form.Item>

          <Form.Item
            name="confirmPassword"
            dependencies={['password']}
            rules={[
              { required: true, message: 'Please confirm your password' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) {
                    return Promise.resolve()
                  }
                  return Promise.reject(new Error('Passwords do not match'))
                },
              }),
            ]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="Confirm password"
              size="large"
            />
          </Form.Item>

          <Form.Item
            name="terms"
            valuePropName="checked"
            rules={[
              {
                validator: (_, value) =>
                  value
                    ? Promise.resolve()
                    : Promise.reject(new Error('Please accept the terms and conditions')),
              },
            ]}
          >
            <Checkbox>
              I agree to the{' '}
              <a href="/terms" target="_blank">
                Terms and Conditions
              </a>
            </Checkbox>
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
              Create Account
            </Button>
          </Form.Item>
        </Form>

        <div style={{ textAlign: 'center', marginTop: '24px' }}>
          <Text type="secondary">
            Already have an account?{' '}
            <Link to="/auth/login">
              <Text strong>Sign in</Text>
            </Link>
          </Text>
        </div>
      </Card>
    </div>
  )
}

import React, { Component, ErrorInfo, ReactNode } from 'react'
import { Alert, Button, Card, Typography } from 'antd'
import { ReloadOutlined, BugOutlined } from '@ant-design/icons'

const { Title, Text, Paragraph } = Typography

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: ErrorInfo) => void
}

interface State {
  hasError: boolean
  error?: Error
  errorInfo?: ErrorInfo
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)

    this.setState({
      error,
      errorInfo
    })

    // Call optional error handler
    this.props.onError?.(error, errorInfo)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          padding: '20px',
          background: '#f5f5f5'
        }}>
          <Card
            style={{ maxWidth: '600px', width: '100%' }}
            actions={[
              <Button
                key="retry"
                type="primary"
                icon={<ReloadOutlined />}
                onClick={this.handleRetry}
              >
                Try Again
              </Button>,
              <Button
                key="report"
                icon={<BugOutlined />}
                onClick={() => {
                  // In a real app, this would send error to logging service
                  console.log('Error reported:', this.state.error, this.state.errorInfo)
                }}
              >
                Report Issue
              </Button>
            ]}
          >
            <Alert
              message={
                <Title level={4} style={{ margin: 0, color: '#cf1322' }}>
                  <BugOutlined style={{ marginRight: '8px' }} />
                  Something went wrong
                </Title>
              }
              description={
                <div>
                  <Paragraph>
                    An unexpected error occurred. This has been logged and our team has been notified.
                  </Paragraph>
                  <Paragraph type="secondary" style={{ fontSize: '12px', marginTop: '8px' }}>
                    Error: {this.state.error?.message || 'Unknown error'}
                  </Paragraph>
                  {process.env.NODE_ENV === 'development' && this.state.errorInfo && (
                    <details style={{ marginTop: '16px' }}>
                      <summary style={{ cursor: 'pointer', fontSize: '12px', color: '#666' }}>
                        Technical Details (Development Only)
                      </summary>
                      <pre style={{
                        fontSize: '11px',
                        background: '#f6f6f6',
                        padding: '8px',
                        borderRadius: '4px',
                        marginTop: '8px',
                        overflow: 'auto',
                        maxHeight: '200px'
                      }}>
                        {this.state.error?.stack}
                        {'\n\nComponent Stack:\n'}
                        {this.state.errorInfo.componentStack}
                      </pre>
                    </details>
                  )}
                </div>
              }
              type="error"
              showIcon
              style={{ marginBottom: '16px' }}
            />
          </Card>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
import React, { useState } from 'react';
import {
  Modal,
  Steps,
  Form,
  Input,
  Button,
  Alert,
  Space,
  Typography,
  Card,
  Spin,
  Result
} from 'antd';
import {
  CloudServerOutlined,
  SafetyOutlined,
  CheckCircleOutlined,
  LoadingOutlined,
  WarningOutlined
} from '@ant-design/icons';
import { supabase } from '../lib/supabase';

const { Title, Text, Paragraph } = Typography;
const { Step } = Steps;

interface NetSuiteOAuthWizardProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

type WizardStep = 0 | 1 | 2 | 3;
type ConnectionStatus = 'idle' | 'connecting' | 'authorizing' | 'success' | 'error';

export const NetSuiteOAuthWizard: React.FC<NetSuiteOAuthWizardProps> = ({
  open,
  onClose,
  onSuccess
}) => {
  const [currentStep, setCurrentStep] = useState<WizardStep>(0);
  const [accountId, setAccountId] = useState('');
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [form] = Form.useForm();

  const resetWizard = () => {
    setCurrentStep(0);
    setAccountId('');
    setStatus('idle');
    setError(null);
    form.resetFields();
  };

  const handleClose = () => {
    resetWizard();
    onClose();
  };

  const handleAccountIdSubmit = async (values: { accountId: string }) => {
    const trimmedAccountId = values.accountId.trim();
    setAccountId(trimmedAccountId);
    setError(null);
    setCurrentStep(1);
  };

  const handleConnect = async () => {
    try {
      setStatus('connecting');
      setError(null);
      setCurrentStep(2);

      // Get current user and refresh session if needed
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        throw new Error('Session error. Please refresh the page and try again.');
      }

      if (!session) {
        throw new Error('You must be logged in to connect NetSuite');
      }

      // Check if session is expired and try to refresh
      if (session.expires_at && new Date(session.expires_at * 1000) < new Date()) {
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError || !refreshData.session) {
          throw new Error('Session expired. Please log in again.');
        }
      }

      // Call OAuth start endpoint
      const functionsUrl = import.meta.env.VITE_FUNCTIONS_BASE_URL || 
                          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
      
      const response = await fetch(`${functionsUrl}/oauth-start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          platform: 'netsuite',
          accountId: accountId,
          redirectTo: `${window.location.origin}${window.location.pathname}`
        })
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Session expired. Please refresh the page and try again.');
        }
        let errorData;
        try {
          errorData = await response.json();
        } catch {
          errorData = { message: await response.text() };
        }
        if (errorData.message && errorData.message.includes('Missing authorization header')) {
          throw new Error('Session expired. Please refresh the page and try again.');
        }
        throw new Error(errorData.message || 'Failed to initiate NetSuite OAuth');
      }

      const { url } = await response.json();

      setStatus('authorizing');
      
      // Open OAuth URL in same window
      window.location.href = url;

    } catch (err) {
      console.error('OAuth start error:', err);
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Failed to start OAuth flow');
      setCurrentStep(3);
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <Card>
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
              <div>
                <Title level={4}>
                  <CloudServerOutlined /> Enter NetSuite Account Information
                </Title>
                <Paragraph type="secondary">
                  To connect your NetSuite account, you'll need your Account ID. You can find this in your NetSuite URL.
                </Paragraph>
              </div>

              <Alert
                message="Finding Your Account ID"
                description={
                  <div>
                    <p>Your NetSuite account ID appears in your NetSuite URL:</p>
                    <Text code>https://1234567.app.netsuite.com/...</Text>
                    <p style={{ marginTop: 8 }}>In this example, your Account ID is <Text strong>1234567</Text></p>
                  </div>
                }
                type="info"
                showIcon
              />

              <Form
                form={form}
                layout="vertical"
                onFinish={handleAccountIdSubmit}
              >
                <Form.Item
                  name="accountId"
                  label="NetSuite Account ID"
                  rules={[
                    { required: true, message: 'Please enter your NetSuite Account ID' },
                    {
                      pattern: /^[a-zA-Z0-9_-]+$/,
                      message: 'Account ID can only contain letters, numbers, hyphens, and underscores'
                    }
                  ]}
                >
                  <Input
                    size="large"
                    placeholder="e.g., 1234567 or TSTDRV1234567"
                    prefix={<CloudServerOutlined />}
                  />
                </Form.Item>

                <Form.Item>
                  <Button type="primary" htmlType="submit" size="large" block>
                    Continue
                  </Button>
                </Form.Item>
              </Form>
            </Space>
          </Card>
        );

      case 1:
        return (
          <Card>
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
              <div>
                <Title level={4}>
                  <SafetyOutlined /> Review Connection Details
                </Title>
                <Paragraph type="secondary">
                  Please review the information below before proceeding with authorization.
                </Paragraph>
              </div>

              <Card type="inner" title="Connection Information">
                <Space direction="vertical" style={{ width: '100%' }}>
                  <div>
                    <Text type="secondary">Account ID:</Text>
                    <br />
                    <Text strong style={{ fontSize: 16 }}>{accountId}</Text>
                  </div>
                  <div>
                    <Text type="secondary">NetSuite URL:</Text>
                    <br />
                    <Text code>https://system.netsuite.com</Text>
                  </div>
                </Space>
              </Card>

              <Alert
                message="What happens next?"
                description={
                  <ol style={{ paddingLeft: 20, margin: 0 }}>
                    <li>You'll be redirected to NetSuite's secure login page</li>
                    <li>Log in with your NetSuite credentials</li>
                    <li>Authorize this application to access your NetSuite data</li>
                    <li>You'll be redirected back to complete the connection</li>
                  </ol>
                }
                type="info"
                showIcon
              />

              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <Button onClick={() => setCurrentStep(0)}>
                  Back
                </Button>
                <Button type="primary" size="large" onClick={handleConnect}>
                  Connect to NetSuite
                </Button>
              </Space>
            </Space>
          </Card>
        );

      case 2:
        return (
          <Card>
            <Space direction="vertical" size="large" style={{ width: '100%' }} align="center">
              {status === 'connecting' && (
                <>
                  <Spin indicator={<LoadingOutlined style={{ fontSize: 48 }} spin />} />
                  <Title level={4}>Initializing Connection...</Title>
                  <Paragraph type="secondary">
                    Please wait while we prepare your NetSuite connection.
                  </Paragraph>
                </>
              )}

              {status === 'authorizing' && (
                <>
                  <Spin indicator={<LoadingOutlined style={{ fontSize: 48 }} spin />} />
                  <Title level={4}>Redirecting to NetSuite...</Title>
                  <Paragraph type="secondary">
                    You will be redirected to NetSuite's authorization page in a moment.
                  </Paragraph>
                </>
              )}
            </Space>
          </Card>
        );

      case 3:
        if (status === 'success') {
          return (
            <Result
              status="success"
              icon={<CheckCircleOutlined />}
              title="NetSuite Connected Successfully!"
              subTitle="Your NetSuite account has been successfully connected. You can now sync data between NetSuite and Shopify."
              extra={[
                <Button type="primary" key="done" onClick={() => {
                  handleClose();
                  onSuccess?.();
                }}>
                  Done
                </Button>
              ]}
            />
          );
        }

        return (
          <Result
            status="error"
            icon={<WarningOutlined />}
            title="Connection Failed"
            subTitle={error || 'An unexpected error occurred while connecting to NetSuite.'}
            extra={[
              <Button key="retry" onClick={() => {
                setCurrentStep(0);
                setStatus('idle');
                setError(null);
              }}>
                Try Again
              </Button>,
              <Button key="cancel" onClick={handleClose}>
                Cancel
              </Button>
            ]}
          />
        );

      default:
        return null;
    }
  };

  const steps = [
    {
      title: 'Account ID',
      icon: <CloudServerOutlined />
    },
    {
      title: 'Review',
      icon: <SafetyOutlined />
    },
    {
      title: 'Authorize',
      icon: <LoadingOutlined />
    },
    {
      title: 'Complete',
      icon: <CheckCircleOutlined />
    }
  ];

  return (
    <Modal
      open={open}
      onCancel={handleClose}
      footer={null}
      width={700}
      centered
      closable={status !== 'connecting' && status !== 'authorizing'}
      maskClosable={false}
    >
      <Space direction="vertical" size="large" style={{ width: '100%', padding: '20px 0' }}>
        <div style={{ textAlign: 'center' }}>
          <Title level={3}>Connect to NetSuite</Title>
        </div>

        <Steps current={currentStep} items={steps} />

        <div style={{ marginTop: 24 }}>
          {renderStepContent()}
        </div>
      </Space>
    </Modal>
  );
};

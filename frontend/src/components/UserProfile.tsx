import React, { useState, useEffect } from 'react'
import {
  Card,
  Form,
  Input,
  Button,
  Avatar,
  Upload,
  message,
  Row,
  Col,
  Divider,
  Typography,
  Space,
  Tag,
  Alert,
  Modal,
  List,
  Checkbox
} from 'antd'
import {
  UserOutlined,
  MailOutlined,
  PhoneOutlined,
  LockOutlined,
  CameraOutlined,
  SaveOutlined,
  HistoryOutlined,
  TeamOutlined,
  BellOutlined,
  SlackOutlined,
  MessageOutlined
} from '@ant-design/icons'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

const { Title, Text, Paragraph } = Typography

interface UserProfileProps {
  session: Session
}

interface UserProfileData {
  id: string
  user_id: string
  first_name: string | null
  last_name: string | null
  email: string
  role: string
  status: string
  avatar_url: string | null
  phone: string | null
  department: string | null
  job_title: string | null
  last_login_at: string | null
  created_at: string
  updated_at: string
}

const UserProfile: React.FC<UserProfileProps> = ({ session }) => {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [profile, setProfile] = useState<UserProfileData | null>(null)
  const [passwordModalVisible, setPasswordModalVisible] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const [notificationPreferences, setNotificationPreferences] = useState({
    email_notifications: true,
    slack_notifications: false,
    sms_notifications: false,
    quiet_hours_start: null,
    quiet_hours_end: null
  })

  const [form] = Form.useForm()
  const [passwordForm] = Form.useForm()
  const [notificationForm] = Form.useForm()

  useEffect(() => {
    void loadProfile()
    void loadNotificationPreferences()
  }, [session])

  const loadProfile = async () => {
    if (!session) return

    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*, email:user_id(email)')
        .eq('user_id', session.user.id)
        .single()

      if (error) throw error

      // Get email from auth.users
      const email = session.user.email || ''

      const profileData = {
        ...data,
        email
      } as UserProfileData

      setProfile(profileData)
      
      // Set form values
      form.setFieldsValue({
        firstName: profileData.first_name,
        lastName: profileData.last_name,
        email: profileData.email,
        phone: profileData.phone,
        department: profileData.department,
        jobTitle: profileData.job_title
      })
    } catch (error) {
      console.error('Error loading profile:', error)
      message.error('Failed to load profile')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveProfile = async (values: any) => {
    if (!session) return

    setSaving(true)
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({
          first_name: values.firstName,
          last_name: values.lastName,
          phone: values.phone,
          department: values.department,
          job_title: values.jobTitle
        })
        .eq('user_id', session.user.id)

      if (error) throw error

      message.success('Profile updated successfully')
      await loadProfile()
    } catch (error) {
      console.error('Error updating profile:', error)
      message.error('Failed to update profile')
    } finally {
      setSaving(false)
    }
  }

  const handleChangePassword = async (values: any) => {
    setChangingPassword(true)
    try {
      const { error } = await supabase.auth.updateUser({
        password: values.newPassword
      })

      if (error) throw error

      message.success('Password changed successfully')
      setPasswordModalVisible(false)
      passwordForm.resetFields()
    } catch (error) {
      console.error('Error changing password:', error)
      message.error('Failed to change password')
    } finally {
      setChangingPassword(false)
    }
  }

  const loadNotificationPreferences = async () => {
    if (!session) return

    try {
      const { data, error } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', session.user.id)
        .single()

      if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
        throw error
      }

      if (data) {
        setNotificationPreferences({
          email_notifications: data.email_notifications ?? true,
          slack_notifications: data.slack_notifications ?? false,
          sms_notifications: data.sms_notifications ?? false,
          quiet_hours_start: data.quiet_hours_start,
          quiet_hours_end: data.quiet_hours_end
        })

        notificationForm.setFieldsValue({
          emailNotifications: data.email_notifications ?? true,
          slackNotifications: data.slack_notifications ?? false,
          smsNotifications: data.sms_notifications ?? false,
          quietHoursStart: data.quiet_hours_start,
          quietHoursEnd: data.quiet_hours_end
        })
      } else {
        // Set defaults
        notificationForm.setFieldsValue({
          emailNotifications: true,
          slackNotifications: false,
          smsNotifications: false
        })
      }
    } catch (error) {
      console.error('Error loading notification preferences:', error)
    }
  }

  const handleSaveNotificationPreferences = async (values: any) => {
    if (!session) return

    try {
      const { error } = await supabase
        .from('notification_preferences')
        .upsert({
          user_id: session.user.id,
          email_notifications: values.emailNotifications,
          slack_notifications: values.slackNotifications,
          sms_notifications: values.smsNotifications,
          quiet_hours_start: values.quietHoursStart,
          quiet_hours_end: values.quietHoursEnd
        })

      if (error) throw error

      message.success('Notification preferences updated successfully')
      await loadNotificationPreferences()
    } catch (error) {
      console.error('Error saving notification preferences:', error)
      message.error('Failed to update notification preferences')
    }
  }

  const handleAvatarUpload = async (info: any) => {
    // Placeholder for avatar upload logic
    message.info('Avatar upload functionality will be implemented')
  }

  const getRoleBadgeColor = (role: string) => {
    const colors: Record<string, string> = {
      admin: 'red',
      manager: 'orange',
      user: 'blue',
      viewer: 'green'
    }
    return colors[role] || 'default'
  }

  const getStatusBadgeColor = (status: string) => {
    const colors: Record<string, string> = {
      active: 'green',
      inactive: 'default',
      suspended: 'red',
      pending: 'orange'
    }
    return colors[status] || 'default'
  }

  if (loading || !profile) {
    return (
      <Card loading={loading}>
        <div style={{ padding: '40px', textAlign: 'center' }}>
          <Text>Loading profile...</Text>
        </div>
      </Card>
    )
  }

  return (
    <div>
      <Title level={2} style={{ marginBottom: '24px' }}>My Profile</Title>

      <Row gutter={24}>
        {/* Left Column - Profile Info */}
        <Col xs={24} lg={8}>
          <Card>
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <Avatar
                size={120}
                src={profile.avatar_url}
                icon={!profile.avatar_url && <UserOutlined />}
                style={{ marginBottom: '16px', backgroundColor: '#1890ff' }}
              />
              <Upload
                showUploadList={false}
                beforeUpload={handleAvatarUpload}
                accept="image/*"
              >
                <Button icon={<CameraOutlined />} size="small">
                  Change Avatar
                </Button>
              </Upload>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <Text strong style={{ display: 'block', marginBottom: '8px' }}>
                {profile.first_name} {profile.last_name}
              </Text>
              <Text type="secondary" style={{ display: 'block', fontSize: '12px' }}>
                <MailOutlined /> {profile.email}
              </Text>
            </div>

            <Divider />

            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              <div>
                <Text type="secondary" style={{ fontSize: '12px' }}>Role</Text>
                <div>
                  <Tag color={getRoleBadgeColor(profile.role)}>
                    {profile.role.toUpperCase()}
                  </Tag>
                </div>
              </div>

              <div>
                <Text type="secondary" style={{ fontSize: '12px' }}>Status</Text>
                <div>
                  <Tag color={getStatusBadgeColor(profile.status)}>
                    {profile.status.toUpperCase()}
                  </Tag>
                </div>
              </div>

              <div>
                <Text type="secondary" style={{ fontSize: '12px' }}>Department</Text>
                <div>
                  <Text>{profile.department || 'Not specified'}</Text>
                </div>
              </div>

              <div>
                <Text type="secondary" style={{ fontSize: '12px' }}>Job Title</Text>
                <div>
                  <Text>{profile.job_title || 'Not specified'}</Text>
                </div>
              </div>

              <div>
                <Text type="secondary" style={{ fontSize: '12px' }}>Member Since</Text>
                <div>
                  <Text>{new Date(profile.created_at).toLocaleDateString()}</Text>
                </div>
              </div>

              <div>
                <Text type="secondary" style={{ fontSize: '12px' }}>Last Login</Text>
                <div>
                  <Text>
                    {profile.last_login_at 
                      ? new Date(profile.last_login_at).toLocaleString()
                      : 'Never'
                    }
                  </Text>
                </div>
              </div>
            </Space>
          </Card>

          {/* Security Card */}
          <Card title="Security" style={{ marginTop: '16px' }}>
            <Button
              block
              icon={<LockOutlined />}
              onClick={() => setPasswordModalVisible(true)}
            >
              Change Password
            </Button>
            <Alert
              message="Two-Factor Authentication"
              description="Enhance your account security by enabling 2FA"
              type="info"
              showIcon
              style={{ marginTop: '16px' }}
              action={
                <Button size="small" type="link">
                  Enable
                </Button>
              }
            />
          </Card>
        </Col>

        {/* Right Column - Edit Form */}
        <Col xs={24} lg={16}>
          <Card title="Edit Profile">
            <Form
              form={form}
              layout="vertical"
              onFinish={handleSaveProfile}
            >
              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item
                    label="First Name"
                    name="firstName"
                  >
                    <Input placeholder="John" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item
                    label="Last Name"
                    name="lastName"
                  >
                    <Input placeholder="Doe" />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item
                label="Email"
                name="email"
              >
                <Input
                  prefix={<MailOutlined />}
                  disabled
                  addonAfter={
                    <Text type="secondary" style={{ fontSize: '12px' }}>
                      Cannot be changed
                    </Text>
                  }
                />
              </Form.Item>

              <Form.Item
                label="Phone"
                name="phone"
              >
                <Input
                  prefix={<PhoneOutlined />}
                  placeholder="+1 234 567 8900"
                />
              </Form.Item>

              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item
                    label="Department"
                    name="department"
                  >
                    <Input
                      prefix={<TeamOutlined />}
                      placeholder="Engineering"
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item
                    label="Job Title"
                    name="jobTitle"
                  >
                    <Input placeholder="Software Engineer" />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item>
                <Space>
                  <Button
                    type="primary"
                    htmlType="submit"
                    icon={<SaveOutlined />}
                    loading={saving}
                  >
                    Save Changes
                  </Button>
                  <Button onClick={() => form.resetFields()}>
                    Reset
                  </Button>
                </Space>
              </Form.Item>
            </Form>
          </Card>

          {/* Notification Preferences Card */}
          <Card title="Notification Preferences" style={{ marginTop: '16px' }}>
            <Form
              form={notificationForm}
              layout="vertical"
              onFinish={handleSaveNotificationPreferences}
            >
              <Alert
                message="Sync Completion Notifications"
                description="Receive email notifications when your sync operations complete. You can customize which types of notifications you want to receive."
                type="info"
                showIcon
                style={{ marginBottom: '16px' }}
              />

              <Form.Item
                label="Email Notifications"
                name="emailNotifications"
                valuePropName="checked"
              >
                <Checkbox>
                  <Space>
                    <MailOutlined />
                    <span>Send email notifications for sync completion</span>
                  </Space>
                </Checkbox>
              </Form.Item>

              <Form.Item
                label="Slack Notifications"
                name="slackNotifications"
                valuePropName="checked"
              >
                <Checkbox disabled>
                  <Space>
                    <SlackOutlined />
                    <span>Send Slack notifications (Coming Soon)</span>
                  </Space>
                </Checkbox>
              </Form.Item>

              <Form.Item
                label="SMS Notifications"
                name="smsNotifications"
                valuePropName="checked"
              >
                <Checkbox disabled>
                  <Space>
                    <MessageOutlined />
                    <span>Send SMS notifications (Coming Soon)</span>
                  </Space>
                </Checkbox>
              </Form.Item>

              <Divider />

              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item
                    label="Quiet Hours Start"
                    name="quietHoursStart"
                    tooltip="Don't send notifications during these hours"
                  >
                    <Input
                      type="time"
                      placeholder="22:00"
                      disabled
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item
                    label="Quiet Hours End"
                    name="quietHoursEnd"
                    tooltip="Resume notifications after this time"
                  >
                    <Input
                      type="time"
                      placeholder="08:00"
                      disabled
                    />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item>
                <Space>
                  <Button
                    type="primary"
                    htmlType="submit"
                    icon={<SaveOutlined />}
                  >
                    Save Preferences
                  </Button>
                  <Button onClick={() => notificationForm.resetFields()}>
                    Reset
                  </Button>
                </Space>
              </Form.Item>
            </Form>
          </Card>

          {/* Activity Card */}
          <Card 
            title="Recent Activity" 
            style={{ marginTop: '16px' }}
            extra={<HistoryOutlined />}
          >
            <List
              dataSource={[]}
              locale={{
                emptyText: (
                  <div style={{ padding: '20px', textAlign: 'center' }}>
                    <HistoryOutlined style={{ fontSize: 32, color: '#bfbfbf', marginBottom: 8 }} />
                    <div>
                      <Text type="secondary">No recent activity</Text>
                    </div>
                    <div style={{ marginTop: 4 }}>
                      <Text type="secondary" style={{ fontSize: '12px' }}>
                        Your sync history and actions will appear here
                      </Text>
                    </div>
                  </div>
                )
              }}
            />
          </Card>
        </Col>
      </Row>

      {/* Change Password Modal */}
      <Modal
        title="Change Password"
        open={passwordModalVisible}
        onCancel={() => {
          setPasswordModalVisible(false)
          passwordForm.resetFields()
        }}
        footer={null}
      >
        <Form
          form={passwordForm}
          layout="vertical"
          onFinish={handleChangePassword}
        >
          <Alert
            message="Password Requirements"
            description={
              <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
                <li>At least 8 characters long</li>
                <li>Include uppercase and lowercase letters</li>
                <li>Include at least one number</li>
              </ul>
            }
            type="info"
            showIcon
            style={{ marginBottom: '16px' }}
          />

          <Form.Item
            label="New Password"
            name="newPassword"
            rules={[
              { required: true, message: 'Please enter new password' },
              { min: 8, message: 'Password must be at least 8 characters' }
            ]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="Enter new password"
            />
          </Form.Item>

          <Form.Item
            label="Confirm Password"
            name="confirmPassword"
            dependencies={['newPassword']}
            rules={[
              { required: true, message: 'Please confirm your password' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('newPassword') === value) {
                    return Promise.resolve()
                  }
                  return Promise.reject(new Error('Passwords do not match'))
                }
              })
            ]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="Confirm new password"
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, marginTop: '24px' }}>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => {
                setPasswordModalVisible(false)
                passwordForm.resetFields()
              }}>
                Cancel
              </Button>
              <Button
                type="primary"
                htmlType="submit"
                loading={changingPassword}
              >
                Change Password
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default UserProfile

import React, { useState, useEffect } from 'react'
import {
  Table,
  Button,
  Tag,
  Space,
  Modal,
  Form,
  Input,
  Select,
  message,
  Popconfirm,
  Card,
  Row,
  Col,
  Statistic,
  Typography,
  Avatar,
  Tooltip,
  Badge
} from 'antd'
import {
  UsergroupAddOutlined,
  EditOutlined,
  DeleteOutlined,
  SearchOutlined,
  ReloadOutlined,
  UserOutlined,
  MailOutlined,
  PhoneOutlined,
  TeamOutlined
} from '@ant-design/icons'
import type { Session } from '@supabase/supabase-js'

const { Title, Text } = Typography
const { Option } = Select

interface UserProfile {
  id: string
  user_id: string
  email: string
  first_name: string | null
  last_name: string | null
  role: 'admin' | 'manager' | 'user' | 'viewer'
  status: 'active' | 'inactive' | 'suspended' | 'pending'
  avatar_url: string | null
  phone: string | null
  department: string | null
  job_title: string | null
  last_login_at: string | null
  registered_at: string
  updated_at: string
}

interface UserManagementProps {
  session: Session
}

interface Pagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

const UserManagement: React.FC<UserManagementProps> = ({ session }) => {
  const [users, setUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 0
  })
  const [form] = Form.useForm()

  useEffect(() => {
    void loadUsers()
  }, [pagination.page, pagination.pageSize, searchTerm, roleFilter, statusFilter])

  const loadUsers = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        pageSize: pagination.pageSize.toString()
      })

      if (searchTerm) params.append('search', searchTerm)
      if (roleFilter) params.append('role', roleFilter)
      if (statusFilter) params.append('status', statusFilter)

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-users?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          }
        }
      )

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to fetch users')
      }

      const data = await response.json()
      setUsers(data.users)
      setPagination(prev => ({ ...prev, ...data.pagination }))
    } catch (error) {
      console.error('Error loading users:', error)
      message.error(error instanceof Error ? error.message : 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  const handleInviteUser = async (values: any) => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invite-user`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            email: values.email,
            firstName: values.firstName,
            lastName: values.lastName,
            role: values.role || 'user',
            department: values.department,
            jobTitle: values.jobTitle
          })
        }
      )

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to invite user')
      }

      message.success('User invited successfully! They will receive an email invitation.')
      setModalVisible(false)
      form.resetFields()
      void loadUsers()
    } catch (error) {
      console.error('Error inviting user:', error)
      message.error(error instanceof Error ? error.message : 'Failed to invite user')
    }
  }

  const handleUpdateUser = async (values: any) => {
    if (!editingUser) return

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-user`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            userId: editingUser.user_id,
            firstName: values.firstName,
            lastName: values.lastName,
            role: values.role,
            status: values.status,
            phone: values.phone,
            department: values.department,
            jobTitle: values.jobTitle
          })
        }
      )

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update user')
      }

      message.success('User updated successfully')
      setModalVisible(false)
      setEditingUser(null)
      form.resetFields()
      void loadUsers()
    } catch (error) {
      console.error('Error updating user:', error)
      message.error(error instanceof Error ? error.message : 'Failed to update user')
    }
  }

  const handleDeleteUser = async (userId: string) => {
    try {
      // For now, we'll just update the status to 'inactive'
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-user`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            userId,
            status: 'inactive'
          })
        }
      )

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete user')
      }

      message.success('User deactivated successfully')
      void loadUsers()
    } catch (error) {
      console.error('Error deleting user:', error)
      message.error(error instanceof Error ? error.message : 'Failed to delete user')
    }
  }

  const openEditModal = (user: UserProfile) => {
    setEditingUser(user)
    form.setFieldsValue({
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role,
      status: user.status,
      phone: user.phone,
      department: user.department,
      jobTitle: user.job_title
    })
    setModalVisible(true)
  }

  const openInviteModal = () => {
    setEditingUser(null)
    form.resetFields()
    setModalVisible(true)
  }

  const getRoleColor = (role: string) => {
    const colors: Record<string, string> = {
      admin: 'red',
      manager: 'orange',
      user: 'blue',
      viewer: 'green'
    }
    return colors[role] || 'default'
  }

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      active: 'green',
      inactive: 'default',
      suspended: 'red',
      pending: 'orange'
    }
    return colors[status] || 'default'
  }

  const getFullName = (user: UserProfile) => {
    if (user.first_name && user.last_name) {
      return `${user.first_name} ${user.last_name}`
    }
    return user.first_name || user.last_name || 'N/A'
  }

  const columns = [
    {
      title: 'User',
      key: 'user',
      render: (record: UserProfile) => (
        <Space>
          <Avatar
            size="large"
            src={record.avatar_url}
            icon={!record.avatar_url && <UserOutlined />}
            style={{ backgroundColor: '#1890ff' }}
          />
          <div>
            <div style={{ fontWeight: 500 }}>{getFullName(record)}</div>
            <Text type="secondary" style={{ fontSize: '12px' }}>
              <MailOutlined style={{ marginRight: 4 }} />
              {record.email}
            </Text>
          </div>
        </Space>
      ),
      width: '25%'
    },
    {
      title: 'Role',
      dataIndex: 'role',
      key: 'role',
      render: (role: string) => (
        <Tag color={getRoleColor(role)}>{role.toUpperCase()}</Tag>
      ),
      width: '12%'
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={getStatusColor(status)}>{status.toUpperCase()}</Tag>
      ),
      width: '12%'
    },
    {
      title: 'Department',
      dataIndex: 'department',
      key: 'department',
      render: (dept: string | null) => dept || '-',
      width: '15%'
    },
    {
      title: 'Job Title',
      dataIndex: 'job_title',
      key: 'job_title',
      render: (title: string | null) => title || '-',
      width: '15%'
    },
    {
      title: 'Last Login',
      dataIndex: 'last_login_at',
      key: 'last_login_at',
      render: (date: string | null) =>
        date ? new Date(date).toLocaleDateString() : 'Never',
      width: '12%'
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (record: UserProfile) => (
        <Space size="small">
          <Tooltip title="Edit User">
            <Button
              type="text"
              icon={<EditOutlined />}
              onClick={() => openEditModal(record)}
              size="small"
            />
          </Tooltip>
          <Popconfirm
            title="Are you sure you want to deactivate this user?"
            onConfirm={() => void handleDeleteUser(record.user_id)}
            okText="Yes"
            cancelText="No"
          >
            <Tooltip title="Deactivate User">
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                size="small"
                disabled={record.user_id === session.user.id}
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
      width: '10%'
    }
  ]

  // Calculate stats
  const stats = {
    total: pagination.total,
    active: users.filter(u => u.status === 'active').length,
    admins: users.filter(u => u.role === 'admin').length,
    pending: users.filter(u => u.status === 'pending').length
  }

  return (
    <div>
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Title level={2} style={{ margin: 0 }}>User Management</Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => void loadUsers()}>
            Refresh
          </Button>
          <Button
            type="primary"
            icon={<UsergroupAddOutlined />}
            onClick={openInviteModal}
          >
            Invite User
          </Button>
        </Space>
      </div>

      {/* Statistics Cards */}
      <Row gutter={16} style={{ marginBottom: '24px' }}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Total Users"
              value={stats.total}
              prefix={<TeamOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Active Users"
              value={stats.active}
              prefix={<UserOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Administrators"
              value={stats.admins}
              valueStyle={{ color: '#f5222d' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Pending Invites"
              value={stats.pending}
              valueStyle={{ color: '#fa8c16' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Filters */}
      <Card style={{ marginBottom: '16px' }}>
        <Space style={{ width: '100%' }} size="middle">
          <Input
            placeholder="Search users..."
            prefix={<SearchOutlined />}
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{ width: 300 }}
            allowClear
          />
          <Select
            placeholder="Filter by Role"
            value={roleFilter || undefined}
            onChange={value => setRoleFilter(value || '')}
            style={{ width: 150 }}
            allowClear
          >
            <Option value="admin">Admin</Option>
            <Option value="manager">Manager</Option>
            <Option value="user">User</Option>
            <Option value="viewer">Viewer</Option>
          </Select>
          <Select
            placeholder="Filter by Status"
            value={statusFilter || undefined}
            onChange={value => setStatusFilter(value || '')}
            style={{ width: 150 }}
            allowClear
          >
            <Option value="active">Active</Option>
            <Option value="inactive">Inactive</Option>
            <Option value="suspended">Suspended</Option>
            <Option value="pending">Pending</Option>
          </Select>
        </Space>
      </Card>

      {/* Users Table */}
      <Card>
        <Table
          columns={columns}
          dataSource={users}
          loading={loading}
          rowKey="id"
          pagination={{
            current: pagination.page,
            pageSize: pagination.pageSize,
            total: pagination.total,
            showSizeChanger: true,
            showTotal: (total) => `Total ${total} users`,
            onChange: (page, pageSize) => {
              setPagination(prev => ({ ...prev, page, pageSize }))
            }
          }}
        />
      </Card>

      {/* Add/Edit User Modal */}
      <Modal
        title={editingUser ? 'Edit User' : 'Invite New User'}
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false)
          setEditingUser(null)
          form.resetFields()
        }}
        footer={null}
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={editingUser ? handleUpdateUser : handleInviteUser}
        >
          <Form.Item
            label="Email"
            name="email"
            rules={[
              { required: true, message: 'Please enter email' },
              { type: 'email', message: 'Please enter a valid email' }
            ]}
          >
            <Input
              prefix={<MailOutlined />}
              placeholder="user@example.com"
              disabled={!!editingUser}
            />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="First Name"
                name="firstName"
              >
                <Input placeholder="John" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="Last Name"
                name="lastName"
              >
                <Input placeholder="Doe" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="Role"
                name="role"
                rules={[{ required: true, message: 'Please select a role' }]}
                initialValue="user"
              >
                <Select>
                  <Option value="admin">Admin</Option>
                  <Option value="manager">Manager</Option>
                  <Option value="user">User</Option>
                  <Option value="viewer">Viewer</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              {editingUser && (
                <Form.Item
                  label="Status"
                  name="status"
                  rules={[{ required: true, message: 'Please select a status' }]}
                >
                  <Select>
                    <Option value="active">Active</Option>
                    <Option value="inactive">Inactive</Option>
                    <Option value="suspended">Suspended</Option>
                    <Option value="pending">Pending</Option>
                  </Select>
                </Form.Item>
              )}
            </Col>
          </Row>

          <Form.Item
            label="Phone"
            name="phone"
          >
            <Input prefix={<PhoneOutlined />} placeholder="+1 234 567 8900" />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="Department"
                name="department"
              >
                <Input placeholder="Engineering" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="Job Title"
                name="jobTitle"
              >
                <Input placeholder="Software Engineer" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item style={{ marginBottom: 0, marginTop: '24px' }}>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => {
                setModalVisible(false)
                setEditingUser(null)
                form.resetFields()
              }}>
                Cancel
              </Button>
              <Button type="primary" htmlType="submit">
                {editingUser ? 'Update User' : 'Send Invitation'}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default UserManagement

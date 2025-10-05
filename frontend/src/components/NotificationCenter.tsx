import React, { useEffect, useState } from 'react'
import { Badge, Button, Card, Dropdown, List, Space, Tag, Typography, Avatar } from 'antd'
import {
  BellOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  InfoCircleOutlined,
  CloseOutlined,
  SettingOutlined
} from '@ant-design/icons'
import { useWebSocket } from '../contexts/WebSocketContext'

interface Notification {
  id: string
  type: 'success' | 'warning' | 'error' | 'info'
  title: string
  message: string
  timestamp: Date
  read: boolean
  actionUrl?: string
  metadata?: Record<string, any>
}

interface NotificationCenterProps {
  maxHeight?: number
}

const NotificationCenter: React.FC<NotificationCenterProps> = ({ maxHeight = 400 }) => {
  const { subscribe, emit } = useWebSocket()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [visible, setVisible] = useState(false)

  // Mock notifications for demo
  useEffect(() => {
    const mockNotifications: Notification[] = [
      {
        id: '1',
        type: 'success',
        title: 'Sync Completed',
        message: 'Product sync for Store A completed successfully',
        timestamp: new Date(Date.now() - 1000 * 60 * 5), // 5 minutes ago
        read: false,
        actionUrl: '/sync-history'
      },
      {
        id: '2',
        type: 'warning',
        title: 'Sync Warning',
        message: 'Inventory sync encountered 3 warnings',
        timestamp: new Date(Date.now() - 1000 * 60 * 15), // 15 minutes ago
        read: false,
        actionUrl: '/sync-history'
      },
      {
        id: '3',
        type: 'error',
        title: 'Sync Failed',
        message: 'Order sync failed due to API rate limit',
        timestamp: new Date(Date.now() - 1000 * 60 * 30), // 30 minutes ago
        read: true,
        actionUrl: '/sync-history'
      },
      {
        id: '4',
        type: 'info',
        title: 'New Feature Available',
        message: 'Bulk operations are now available in sync management',
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
        read: true
      }
    ]
    setNotifications(mockNotifications)
  }, [])

  // WebSocket subscription for real-time notifications
  useEffect(() => {
    const handleSyncComplete = (data: any) => {
      const newNotification: Notification = {
        id: Date.now().toString(),
        type: 'success',
        title: 'Sync Completed',
        message: `${data.syncType} sync completed successfully`,
        timestamp: new Date(),
        read: false,
        actionUrl: '/sync-history',
        metadata: data
      }
      setNotifications(prev => [newNotification, ...prev])
    }

    const handleSyncError = (data: any) => {
      const newNotification: Notification = {
        id: Date.now().toString(),
        type: 'error',
        title: 'Sync Failed',
        message: `${data.syncType} sync failed: ${data.error}`,
        timestamp: new Date(),
        read: false,
        actionUrl: '/sync-history',
        metadata: data
      }
      setNotifications(prev => [newNotification, ...prev])
    }

    subscribe('sync:complete', handleSyncComplete)
    subscribe('sync:error', handleSyncError)

    return () => {
      // Cleanup subscriptions would happen here
    }
  }, [subscribe])

  const unreadCount = notifications.filter(n => !n.read).length

  const getIcon = (type: Notification['type']) => {
    switch (type) {
      case 'success': return <CheckCircleOutlined style={{ color: '#52c41a' }} />
      case 'warning': return <ExclamationCircleOutlined style={{ color: '#faad14' }} />
      case 'error': return <ExclamationCircleOutlined style={{ color: '#f5222d' }} />
      case 'info': return <InfoCircleOutlined style={{ color: '#1890ff' }} />
    }
  }

  const markAsRead = (id: string) => {
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, read: true } : n)
    )
  }

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }

  const deleteNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
  }

  const formatTime = (date: Date) => {
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / (1000 * 60))
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))

    if (minutes < 1) return 'Just now'
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    return `${days}d ago`
  }

  const notificationMenu = (
    <Card
      style={{ width: 400, maxHeight, overflow: 'auto' }}
      title={
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <span>Notifications</span>
          <Space>
            {unreadCount > 0 && (
              <Button size="small" onClick={markAllAsRead}>
                Mark all read
              </Button>
            )}
            <Button size="small" icon={<SettingOutlined />}>
              Settings
            </Button>
          </Space>
        </Space>
      }
      size="small"
    >
      <List
        dataSource={notifications}
        renderItem={(item) => (
          <List.Item
            style={{
              padding: '12px',
              backgroundColor: item.read ? 'transparent' : '#f0f8ff',
              borderRadius: '4px',
              marginBottom: '4px'
            }}
            actions={[
              !item.read && (
                <Button
                  size="small"
                  type="text"
                  onClick={() => markAsRead(item.id)}
                  icon={<CheckCircleOutlined />}
                />
              ),
              <Button
                size="small"
                type="text"
                danger
                onClick={() => deleteNotification(item.id)}
                icon={<CloseOutlined />}
              />
            ].filter(Boolean)}
          >
            <List.Item.Meta
              avatar={<Avatar icon={getIcon(item.type)} size="small" />}
              title={
                <Space>
                  <Typography.Text strong={!item.read}>
                    {item.title}
                  </Typography.Text>
                  {!item.read && <Badge dot />}
                </Space>
              }
              description={
                <div>
                  <Typography.Text type="secondary" style={{ fontSize: '12px' }}>
                    {item.message}
                  </Typography.Text>
                  <br />
                  <Typography.Text type="secondary" style={{ fontSize: '11px' }}>
                    {formatTime(item.timestamp)}
                  </Typography.Text>
                </div>
              }
            />
          </List.Item>
        )}
        locale={{ emptyText: 'No notifications' }}
      />
    </Card>
  )

  return (
    <Dropdown
      overlay={notificationMenu}
      trigger={['click']}
      open={visible}
      onOpenChange={setVisible}
      placement="bottomRight"
    >
      <Button
        type="text"
        icon={
          <Badge count={unreadCount} size="small">
            <BellOutlined />
          </Badge>
        }
        size="large"
        style={{ color: 'inherit', border: 'none', boxShadow: 'none' }}
        aria-label={`Notifications ${unreadCount > 0 ? `(${unreadCount} unread)` : ''}`}
      />
    </Dropdown>
  )
}

export default NotificationCenter
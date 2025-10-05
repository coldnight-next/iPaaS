import React, { useState, useRef } from 'react'
import {
  Card,
  Button,
  Upload,
  Table,
  Space,
  Tag,
  Progress,
  Modal,
  Form,
  Select,
  Input,
  message,
  Typography,
  Alert
} from 'antd'
import {
  UploadOutlined,
  DownloadOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined
} from '@ant-design/icons'
import type { UploadFile, UploadProps } from 'antd/es/upload/interface'
import ProgressTracker, { ProgressItem } from './ProgressTracker'

interface BulkOperation {
  id: string
  type: 'import' | 'export' | 'sync' | 'delete'
  name: string
  description: string
  status: 'idle' | 'running' | 'completed' | 'failed'
  progress: ProgressItem[]
  createdAt: Date
  completedAt?: Date
}

interface BulkOperationsProps {
  onImport?: (file: File, options: any) => Promise<void>
  onExport?: (options: any) => Promise<void>
  onBulkSync?: (items: any[], options: any) => Promise<void>
  onBulkDelete?: (items: any[], options: any) => Promise<void>
}

const BulkOperations: React.FC<BulkOperationsProps> = ({
  onImport,
  onExport,
  onBulkSync,
  onBulkDelete
}) => {
  const [operations, setOperations] = useState<BulkOperation[]>([])
  const [isModalVisible, setIsModalVisible] = useState(false)
  const [modalType, setModalType] = useState<'import' | 'export' | 'sync' | 'delete'>('import')
  const [form] = Form.useForm()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const createOperation = (
    type: BulkOperation['type'],
    name: string,
    description: string
  ): string => {
    const id = `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const operation: BulkOperation = {
      id,
      type,
      name,
      description,
      status: 'idle',
      progress: [],
      createdAt: new Date()
    }

    setOperations(prev => [...prev, operation])
    return id
  }

  const updateOperationProgress = (operationId: string, progress: ProgressItem[]) => {
    setOperations(prev => prev.map(op =>
      op.id === operationId
        ? { ...op, progress, status: progress.some(p => p.status === 'failed') ? 'failed' : 'running' }
        : op
    ))
  }

  const completeOperation = (operationId: string, success: boolean = true) => {
    setOperations(prev => prev.map(op =>
      op.id === operationId
        ? {
            ...op,
            status: success ? 'completed' : 'failed',
            completedAt: new Date()
          }
        : op
    ))
  }

  const handleImport = async (values: any) => {
    if (!onImport || !values.file) {
      message.error('Import function not available or no file selected')
      return
    }

    const operationId = createOperation('import', `Import ${values.file.name}`, 'Importing data from file')

    try {
      // Simulate progress updates
      const mockProgress: ProgressItem[] = [
        {
          id: 'parse',
          name: 'Parsing file',
          status: 'running',
          progress: 0,
          message: 'Reading file contents...'
        }
      ]
      updateOperationProgress(operationId, mockProgress)

      // Update progress
      setTimeout(() => {
        mockProgress[0].progress = 50
        mockProgress[0].message = 'Validating data...'
        updateOperationProgress(operationId, [...mockProgress])
      }, 1000)

      await onImport(values.file, values)

      mockProgress[0].status = 'completed'
      mockProgress[0].progress = 100
      mockProgress[0].message = 'Import completed successfully'
      updateOperationProgress(operationId, [...mockProgress])

      completeOperation(operationId, true)
      message.success('Import completed successfully')
    } catch (error) {
      completeOperation(operationId, false)
      message.error('Import failed')
    }

    setIsModalVisible(false)
    form.resetFields()
  }

  const handleExport = async (values: any) => {
    if (!onExport) {
      message.error('Export function not available')
      return
    }

    const operationId = createOperation('export', 'Data Export', 'Exporting data to file')

    try {
      const mockProgress: ProgressItem[] = [
        {
          id: 'gather',
          name: 'Gathering data',
          status: 'running',
          progress: 0,
          message: 'Collecting records...'
        },
        {
          id: 'format',
          name: 'Formatting data',
          status: 'pending',
          progress: 0,
          message: 'Preparing export format...'
        },
        {
          id: 'download',
          name: 'Downloading file',
          status: 'pending',
          progress: 0,
          message: 'Generating download...'
        }
      ]
      updateOperationProgress(operationId, mockProgress)

      await onExport(values)

      mockProgress.forEach(p => {
        p.status = 'completed'
        p.progress = 100
      })
      updateOperationProgress(operationId, [...mockProgress])

      completeOperation(operationId, true)
      message.success('Export completed successfully')
    } catch (error) {
      completeOperation(operationId, false)
      message.error('Export failed')
    }

    setIsModalVisible(false)
    form.resetFields()
  }

  const handleBulkSync = async (values: any) => {
    if (!onBulkSync) {
      message.error('Bulk sync function not available')
      return
    }

    const operationId = createOperation('sync', 'Bulk Sync', `Syncing ${values.items?.length || 0} items`)

    try {
      await onBulkSync(values.items || [], values)
      completeOperation(operationId, true)
      message.success('Bulk sync completed successfully')
    } catch (error) {
      completeOperation(operationId, false)
      message.error('Bulk sync failed')
    }

    setIsModalVisible(false)
    form.resetFields()
  }

  const handleBulkDelete = async (values: any) => {
    if (!onBulkDelete) {
      message.error('Bulk delete function not available')
      return
    }

    const operationId = createOperation('delete', 'Bulk Delete', `Deleting ${values.items?.length || 0} items`)

    try {
      await onBulkDelete(values.items || [], values)
      completeOperation(operationId, true)
      message.success('Bulk delete completed successfully')
    } catch (error) {
      completeOperation(operationId, false)
      message.error('Bulk delete failed')
    }

    setIsModalVisible(false)
    form.resetFields()
  }

  const showModal = (type: BulkOperation['type']) => {
    setModalType(type)
    setIsModalVisible(true)
  }

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields()

      switch (modalType) {
        case 'import':
          await handleImport(values)
          break
        case 'export':
          await handleExport(values)
          break
        case 'sync':
          await handleBulkSync(values)
          break
        case 'delete':
          await handleBulkDelete(values)
          break
      }
    } catch (error) {
      // Validation error
    }
  }

  const getStatusTag = (status: BulkOperation['status']) => {
    const statusConfig = {
      idle: { color: 'default', text: 'Idle' },
      running: { color: 'processing', text: 'Running' },
      completed: { color: 'success', text: 'Completed' },
      failed: { color: 'error', text: 'Failed' }
    }
    const config = statusConfig[status]
    return <Tag color={config.color}>{config.text}</Tag>
  }

  const columns = [
    {
      title: 'Operation',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: BulkOperation) => (
        <div>
          <div style={{ fontWeight: 'bold' }}>{name}</div>
          <div style={{ fontSize: '12px', color: '#666' }}>{record.description}</div>
        </div>
      )
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      render: (type: string) => (
        <Tag color={
          type === 'import' ? 'blue' :
          type === 'export' ? 'green' :
          type === 'sync' ? 'orange' : 'red'
        }>
          {type.toUpperCase()}
        </Tag>
      )
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: BulkOperation['status']) => getStatusTag(status)
    },
    {
      title: 'Progress',
      dataIndex: 'progress',
      key: 'progress',
      render: (progress: ProgressItem[]) => {
        const overallProgress = progress.length > 0
          ? Math.round(progress.reduce((sum, item) => sum + item.progress, 0) / progress.length)
          : 0
        return <Progress percent={overallProgress} size="small" />
      }
    },
    {
      title: 'Created',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date: Date) => date.toLocaleString()
    }
  ]

  return (
    <div>
      <Card
        title="Bulk Operations"
        extra={
          <Space>
            <Button icon={<UploadOutlined />} onClick={() => showModal('import')}>
              Import
            </Button>
            <Button icon={<DownloadOutlined />} onClick={() => showModal('export')}>
              Export
            </Button>
            <Button icon={<PlayCircleOutlined />} onClick={() => showModal('sync')}>
              Bulk Sync
            </Button>
            <Button danger icon={<DeleteOutlined />} onClick={() => showModal('delete')}>
              Bulk Delete
            </Button>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={operations}
          rowKey="id"
          pagination={{ pageSize: 10 }}
          expandable={{
            expandedRowRender: (record) =>
              record.progress.length > 0 ? (
                <ProgressTracker
                  items={record.progress}
                  title="Operation Details"
                  showControls={record.status === 'running'}
                />
              ) : (
                <div style={{ padding: '16px', textAlign: 'center', color: '#999' }}>
                  No progress details available
                </div>
              )
          }}
        />
      </Card>

      <Modal
        title={`${modalType.charAt(0).toUpperCase() + modalType.slice(1)} Operation`}
        open={isModalVisible}
        onOk={handleModalOk}
        onCancel={() => {
          setIsModalVisible(false)
          form.resetFields()
        }}
        width={600}
      >
        <Form form={form} layout="vertical">
          {modalType === 'import' && (
            <>
              <Form.Item
                name="file"
                label="File to Import"
                rules={[{ required: true, message: 'Please select a file' }]}
              >
                <Upload
                  beforeUpload={() => false}
                  maxCount={1}
                  accept=".csv,.xlsx,.json"
                >
                  <Button icon={<UploadOutlined />}>Select File</Button>
                </Upload>
              </Form.Item>
              <Form.Item name="format" label="File Format">
                <Select placeholder="Auto-detect">
                  <Select.Option value="csv">CSV</Select.Option>
                  <Select.Option value="xlsx">Excel</Select.Option>
                  <Select.Option value="json">JSON</Select.Option>
                </Select>
              </Form.Item>
            </>
          )}

          {modalType === 'export' && (
            <>
              <Form.Item name="format" label="Export Format" initialValue="csv">
                <Select>
                  <Select.Option value="csv">CSV</Select.Option>
                  <Select.Option value="xlsx">Excel</Select.Option>
                  <Select.Option value="json">JSON</Select.Option>
                </Select>
              </Form.Item>
              <Form.Item name="filters" label="Filters">
                <Input placeholder="Optional filters..." />
              </Form.Item>
            </>
          )}

          {(modalType === 'sync' || modalType === 'delete') && (
            <>
              <Alert
                message="Bulk operations can take time to complete"
                description="Progress will be shown in the operations table below."
                type="info"
                showIcon
                style={{ marginBottom: '16px' }}
              />
              <Form.Item name="items" label="Items to Process">
                <Input.TextArea
                  placeholder="Enter item IDs or use filters..."
                  rows={4}
                />
              </Form.Item>
            </>
          )}
        </Form>
      </Modal>
    </div>
  )
}

export default BulkOperations
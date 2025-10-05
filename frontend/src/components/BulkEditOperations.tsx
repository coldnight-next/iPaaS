import React, { useState, useMemo } from 'react'
import {
  Card,
  Button,
  Table,
  Space,
  Select,
  Input,
  Form,
  Modal,
  Checkbox,
  Tag,
  message,
  Alert,
  Progress
} from 'antd'
import {
  EditOutlined,
  SaveOutlined,
  UndoOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined
} from '@ant-design/icons'

interface SyncConfiguration {
  id: string
  name: string
  type: 'sync' | 'webhook' | 'schedule'
  settings: Record<string, any>
  enabled: boolean
  lastModified: Date
}

interface BulkEditOperation {
  field: string
  oldValue: any
  newValue: any
  affectedItems: string[]
}

interface BulkEditOperationsProps {
  configurations: SyncConfiguration[]
  onBulkUpdate?: (updates: Array<{ id: string; changes: Record<string, any> }>) => Promise<void>
  onValidateChanges?: (changes: BulkEditOperation[]) => Promise<{ valid: boolean; errors: string[] }>
}

const BulkEditOperations: React.FC<BulkEditOperationsProps> = ({
  configurations,
  onBulkUpdate,
  onValidateChanges
}) => {
  const [selectedConfigs, setSelectedConfigs] = useState<string[]>([])
  const [isModalVisible, setIsModalVisible] = useState(false)
  const [editingField, setEditingField] = useState<string>('')
  const [pendingChanges, setPendingChanges] = useState<BulkEditOperation[]>([])
  const [isApplying, setIsApplying] = useState(false)
  const [form] = Form.useForm()

  // Group configurations by type for better organization
  const groupedConfigs = useMemo(() => {
    return configurations.reduce((acc, config) => {
      if (!acc[config.type]) {
        acc[config.type] = []
      }
      acc[config.type].push(config)
      return acc
    }, {} as Record<string, SyncConfiguration[]>)
  }, [configurations])

  const handleSelectConfig = (configId: string, checked: boolean) => {
    setSelectedConfigs(prev =>
      checked
        ? [...prev, configId]
        : prev.filter(id => id !== configId)
    )
  }

  const handleSelectAll = (type: string, checked: boolean) => {
    const typeConfigs = groupedConfigs[type] || []
    const typeConfigIds = typeConfigs.map(c => c.id)

    setSelectedConfigs(prev => {
      if (checked) {
        return [...new Set([...prev, ...typeConfigIds])]
      } else {
        return prev.filter(id => !typeConfigIds.includes(id))
      }
    })
  }

  const openBulkEditModal = (field: string) => {
    if (selectedConfigs.length === 0) {
      message.warning('Please select at least one configuration to edit')
      return
    }

    setEditingField(field)
    setIsModalVisible(true)

    // Pre-fill form with current values if they're the same
    const selectedItems = configurations.filter(c => selectedConfigs.includes(c.id))
    const firstValue = selectedItems[0]?.settings[field]

    const allSame = selectedItems.every(c => c.settings[field] === firstValue)
    if (allSame) {
      form.setFieldsValue({ [field]: firstValue })
    }
  }

  const handleBulkEdit = async (values: any) => {
    const newValue = values[editingField]
    const affectedItems = selectedConfigs

    // Create change record
    const change: BulkEditOperation = {
      field: editingField,
      oldValue: configurations.find(c => c.id === affectedItems[0])?.settings[editingField],
      newValue,
      affectedItems
    }

    // Validate changes if validator provided
    if (onValidateChanges) {
      const validation = await onValidateChanges([change])
      if (!validation.valid) {
        message.error(`Validation failed: ${validation.errors.join(', ')}`)
        return
      }
    }

    setPendingChanges(prev => [...prev, change])
    setIsModalVisible(false)
    form.resetFields()
    message.success(`Bulk edit prepared for ${affectedItems.length} configurations`)
  }

  const applyBulkChanges = async () => {
    if (pendingChanges.length === 0) {
      message.warning('No changes to apply')
      return
    }

    setIsApplying(true)

    try {
      // Group changes by configuration ID
      const updates = pendingChanges.reduce((acc, change) => {
        change.affectedItems.forEach(configId => {
          if (!acc[configId]) {
            acc[configId] = { id: configId, changes: {} }
          }
          acc[configId].changes[change.field] = change.newValue
        })
        return acc
      }, {} as Record<string, { id: string; changes: Record<string, any> }>)

      if (onBulkUpdate) {
        await onBulkUpdate(Object.values(updates))
      }

      setPendingChanges([])
      setSelectedConfigs([])
      message.success('Bulk changes applied successfully')
    } catch (error) {
      message.error('Failed to apply bulk changes')
    } finally {
      setIsApplying(false)
    }
  }

  const undoChange = (changeIndex: number) => {
    setPendingChanges(prev => prev.filter((_, index) => index !== changeIndex))
  }

  const getFieldDisplayName = (field: string) => {
    const fieldNames: Record<string, string> = {
      enabled: 'Enabled',
      retryCount: 'Retry Count',
      timeout: 'Timeout (ms)',
      batchSize: 'Batch Size',
      rateLimit: 'Rate Limit',
      webhookUrl: 'Webhook URL',
      schedule: 'Schedule'
    }
    return fieldNames[field] || field
  }

  const getFieldInputType = (field: string) => {
    const fieldTypes: Record<string, 'text' | 'number' | 'boolean' | 'select'> = {
      enabled: 'boolean',
      retryCount: 'number',
      timeout: 'number',
      batchSize: 'number',
      rateLimit: 'number',
      webhookUrl: 'text',
      schedule: 'text'
    }
    return fieldTypes[field] || 'text'
  }

  const renderFieldInput = (field: string) => {
    const inputType = getFieldInputType(field)

    switch (inputType) {
      case 'boolean':
        return <Checkbox>Enable</Checkbox>
      case 'number':
        return <Input type="number" placeholder={`Enter ${getFieldDisplayName(field).toLowerCase()}`} />
      case 'select':
        if (field === 'schedule') {
          return (
            <Select placeholder="Select schedule">
              <Select.Option value="*/5 * * * *">Every 5 minutes</Select.Option>
              <Select.Option value="0 */1 * * *">Every hour</Select.Option>
              <Select.Option value="0 0 * * *">Daily</Select.Option>
              <Select.Option value="0 0 * * 1">Weekly</Select.Option>
            </Select>
          )
        }
        return <Input placeholder={`Enter ${getFieldDisplayName(field).toLowerCase()}`} />
      default:
        return <Input placeholder={`Enter ${getFieldDisplayName(field).toLowerCase()}`} />
    }
  }

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: SyncConfiguration) => (
        <Space>
          <Checkbox
            checked={selectedConfigs.includes(record.id)}
            onChange={(e) => handleSelectConfig(record.id, e.target.checked)}
          />
          {name}
        </Space>
      )
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      render: (type: string) => (
        <Tag color={
          type === 'sync' ? 'blue' :
          type === 'webhook' ? 'green' :
          'orange'
        }>
          {type.toUpperCase()}
        </Tag>
      )
    },
    {
      title: 'Status',
      dataIndex: 'enabled',
      key: 'enabled',
      render: (enabled: boolean) => (
        <Tag color={enabled ? 'success' : 'default'}>
          {enabled ? 'Enabled' : 'Disabled'}
        </Tag>
      )
    },
    {
      title: 'Last Modified',
      dataIndex: 'lastModified',
      key: 'lastModified',
      render: (date: Date) => date.toLocaleDateString()
    }
  ]

  return (
    <div>
      <Card
        title="Bulk Edit Operations"
        extra={
          <Space>
            <Button
              type="primary"
              icon={<EditOutlined />}
              onClick={() => openBulkEditModal('enabled')}
              disabled={selectedConfigs.length === 0}
            >
              Bulk Edit ({selectedConfigs.length})
            </Button>
            {pendingChanges.length > 0 && (
              <Button
                type="primary"
                icon={<SaveOutlined />}
                onClick={applyBulkChanges}
                loading={isApplying}
              >
                Apply Changes ({pendingChanges.length})
              </Button>
            )}
          </Space>
        }
      >
        {/* Pending Changes Alert */}
        {pendingChanges.length > 0 && (
          <Alert
            message={`Pending Changes: ${pendingChanges.length} operations`}
            description={
              <div>
                {pendingChanges.map((change, index) => (
                  <div key={index} style={{ marginBottom: '4px' }}>
                    <strong>{getFieldDisplayName(change.field)}:</strong> {change.affectedItems.length} items
                    <Button
                      size="small"
                      type="text"
                      icon={<UndoOutlined />}
                      onClick={() => undoChange(index)}
                      style={{ marginLeft: '8px' }}
                    >
                      Undo
                    </Button>
                  </div>
                ))}
              </div>
            }
            type="info"
            showIcon
            style={{ marginBottom: '16px' }}
          />
        )}

        {/* Configuration Groups */}
        {Object.entries(groupedConfigs).map(([type, configs]) => (
          <div key={type} style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
              <Checkbox
                checked={configs.every(c => selectedConfigs.includes(c.id))}
                indeterminate={configs.some(c => selectedConfigs.includes(c.id)) && !configs.every(c => selectedConfigs.includes(c.id))}
                onChange={(e) => handleSelectAll(type, e.target.checked)}
                style={{ marginRight: '8px' }}
              />
              <h3 style={{ margin: 0, textTransform: 'capitalize' }}>{type} Configurations</h3>
              <Tag style={{ marginLeft: '8px' }}>{configs.length}</Tag>
            </div>

            <Table
              columns={columns}
              dataSource={configs}
              rowKey="id"
              pagination={false}
              size="small"
            />
          </div>
        ))}
      </Card>

      {/* Bulk Edit Modal */}
      <Modal
        title={`Bulk Edit: ${getFieldDisplayName(editingField)}`}
        open={isModalVisible}
        onOk={() => form.submit()}
        onCancel={() => {
          setIsModalVisible(false)
          form.resetFields()
        }}
        width={600}
      >
        <Alert
          message={`Editing ${selectedConfigs.length} configurations`}
          description="This change will be applied to all selected configurations."
          type="info"
          showIcon
          style={{ marginBottom: '16px' }}
        />

        <Form form={form} onFinish={handleBulkEdit} layout="vertical">
          <Form.Item
            name={editingField}
            label={getFieldDisplayName(editingField)}
            rules={[{ required: true, message: `Please enter ${getFieldDisplayName(editingField).toLowerCase()}` }]}
          >
            {renderFieldInput(editingField)}
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default BulkEditOperations
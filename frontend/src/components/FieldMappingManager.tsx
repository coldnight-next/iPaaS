import { useState, useEffect, useCallback } from 'react'
import {
  Card, Table, Button, Modal, Form, Input, Select, Switch, Tag, Space, message,
  Typography, Row, Col, Tabs, Divider, Alert, Tooltip, Popconfirm, Badge, Drawer
} from 'antd'
import {
  PlusOutlined, EditOutlined, DeleteOutlined, CopyOutlined, LinkOutlined,
  CodeOutlined, ThunderboltOutlined, TableOutlined, CheckCircleOutlined,
  WarningOutlined, SyncOutlined, SettingOutlined, DragOutlined
} from '@ant-design/icons'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import VisualFieldMapper from './VisualFieldMapper'

const { Title, Text, Paragraph } = Typography
const { TextArea } = Input
const { Option } = Select
const { TabPane } = Tabs

interface FieldMappingTemplate {
  id: string
  name: string
  description: string
  template_type: string
  is_active: boolean
  is_default: boolean
  category: string
  created_at: string
  updated_at: string
}

interface FieldMapping {
  id: string
  template_id: string
  source_platform: string
  target_platform: string
  source_field_path: string
  target_field_path: string
  field_label: string
  field_type: string
  is_required: boolean
  default_value?: string
  transformation_enabled: boolean
  transformation_type: string
  transformation_config: any
  sync_direction: string
  is_active: boolean
}

interface TransformationRule {
  id: string
  name: string
  description: string
  rule_type: string
  rule_config: any
  is_global: boolean
  usage_count: number
}

interface FieldMappingManagerProps {
  session: Session
}

export default function FieldMappingManager({ session }: FieldMappingManagerProps) {
  const [templates, setTemplates] = useState<FieldMappingTemplate[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<FieldMappingTemplate | null>(null)
  const [mappings, setMappings] = useState<FieldMapping[]>([])
  const [transformationRules, setTransformationRules] = useState<TransformationRule[]>([])
  const [loading, setLoading] = useState(false)
  const [templateModalVisible, setTemplateModalVisible] = useState(false)
  const [mappingModalVisible, setMappingModalVisible] = useState(false)
  const [transformationDrawerVisible, setTransformationDrawerVisible] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<FieldMappingTemplate | null>(null)
  const [editingMapping, setEditingMapping] = useState<FieldMapping | null>(null)
  const [form] = Form.useForm()
  const [mappingForm] = Form.useForm()

  // Load templates
  const loadTemplates = useCallback(async () => {
    if (!session) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('field_mapping_templates')
        .select('*')
        .or(`user_id.eq.${session.user.id},user_id.is.null`)
        .order('created_at', { ascending: false })

      if (error) throw error
      setTemplates(data || [])
      
      // Auto-select first template
      if (data && data.length > 0 && !selectedTemplate) {
        setSelectedTemplate(data[0])
      }
    } catch (error) {
      console.error('Error loading templates:', error)
      message.error('Failed to load mapping templates')
    } finally {
      setLoading(false)
    }
  }, [session, selectedTemplate])

  // Load mappings for selected template
  const loadMappings = useCallback(async (templateId: string) => {
    if (!session) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('field_mappings')
        .select('*')
        .eq('template_id', templateId)
        .order('priority', { ascending: true })

      if (error) throw error
      setMappings(data || [])
    } catch (error) {
      console.error('Error loading mappings:', error)
      message.error('Failed to load field mappings')
    } finally {
      setLoading(false)
    }
  }, [session])

  // Load transformation rules
  const loadTransformationRules = useCallback(async () => {
    if (!session) return
    try {
      const { data, error } = await supabase
        .from('field_transformation_rules')
        .select('*')
        .or(`user_id.eq.${session.user.id},is_global.eq.true`)
        .order('usage_count', { ascending: false })

      if (error) throw error
      setTransformationRules(data || [])
    } catch (error) {
      console.error('Error loading transformation rules:', error)
    }
  }, [session])

  useEffect(() => {
    loadTemplates()
    loadTransformationRules()
  }, [loadTemplates, loadTransformationRules])

  useEffect(() => {
    if (selectedTemplate) {
      loadMappings(selectedTemplate.id)
    }
  }, [selectedTemplate, loadMappings])

  const handleCreateTemplate = async (values: any) => {
    try {
      const { error } = await supabase
        .from('field_mapping_templates')
        .insert({
          user_id: session.user.id,
          ...values
        })

      if (error) throw error
      message.success('Template created successfully')
      setTemplateModalVisible(false)
      form.resetFields()
      loadTemplates()
    } catch (error) {
      console.error('Error creating template:', error)
      message.error('Failed to create template')
    }
  }

  const handleUpdateTemplate = async (values: any) => {
    if (!editingTemplate) return
    try {
      const { error } = await supabase
        .from('field_mapping_templates')
        .update(values)
        .eq('id', editingTemplate.id)

      if (error) throw error
      message.success('Template updated successfully')
      setTemplateModalVisible(false)
      setEditingTemplate(null)
      form.resetFields()
      loadTemplates()
    } catch (error) {
      console.error('Error updating template:', error)
      message.error('Failed to update template')
    }
  }

  const handleDeleteTemplate = async (templateId: string) => {
    try {
      const { error } = await supabase
        .from('field_mapping_templates')
        .delete()
        .eq('id', templateId)

      if (error) throw error
      message.success('Template deleted successfully')
      loadTemplates()
      if (selectedTemplate?.id === templateId) {
        setSelectedTemplate(null)
      }
    } catch (error) {
      console.error('Error deleting template:', error)
      message.error('Failed to delete template')
    }
  }

  const handleCreateMapping = async (values: any) => {
    if (!selectedTemplate) return
    try {
      const { error } = await supabase
        .from('field_mappings')
        .insert({
          user_id: session.user.id,
          template_id: selectedTemplate.id,
          ...values,
          transformation_config: values.transformation_enabled 
            ? JSON.stringify(values.transformation_config || {})
            : '{}'
        })

      if (error) throw error
      message.success('Field mapping created successfully')
      setMappingModalVisible(false)
      mappingForm.resetFields()
      loadMappings(selectedTemplate.id)
    } catch (error) {
      console.error('Error creating mapping:', error)
      message.error('Failed to create field mapping')
    }
  }

  const handleUpdateMapping = async (values: any) => {
    if (!editingMapping) return
    try {
      const { error } = await supabase
        .from('field_mappings')
        .update({
          ...values,
          transformation_config: values.transformation_enabled 
            ? JSON.stringify(values.transformation_config || {})
            : '{}'
        })
        .eq('id', editingMapping.id)

      if (error) throw error
      message.success('Field mapping updated successfully')
      setMappingModalVisible(false)
      setEditingMapping(null)
      mappingForm.resetFields()
      if (selectedTemplate) {
        loadMappings(selectedTemplate.id)
      }
    } catch (error) {
      console.error('Error updating mapping:', error)
      message.error('Failed to update field mapping')
    }
  }

  const handleDeleteMapping = async (mappingId: string) => {
    try {
      const { error } = await supabase
        .from('field_mappings')
        .delete()
        .eq('id', mappingId)

      if (error) throw error
      message.success('Field mapping deleted successfully')
      if (selectedTemplate) {
        loadMappings(selectedTemplate.id)
      }
    } catch (error) {
      console.error('Error deleting mapping:', error)
      message.error('Failed to delete field mapping')
    }
  }

  const handleDuplicateMapping = async (mapping: FieldMapping) => {
    try {
      const { id, ...mappingData } = mapping
      const { error } = await supabase
        .from('field_mappings')
        .insert({
          ...mappingData,
          field_label: `${mappingData.field_label} (Copy)`,
          user_id: session.user.id
        })

      if (error) throw error
      message.success('Field mapping duplicated successfully')
      if (selectedTemplate) {
        loadMappings(selectedTemplate.id)
      }
    } catch (error) {
      console.error('Error duplicating mapping:', error)
      message.error('Failed to duplicate field mapping')
    }
  }

  const templateColumns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: FieldMappingTemplate) => (
        <Space>
          <Text strong>{text}</Text>
          {record.is_default && <Tag color="blue">Default</Tag>}
          {!record.is_active && <Tag>Inactive</Tag>}
        </Space>
      )
    },
    {
      title: 'Type',
      dataIndex: 'template_type',
      key: 'template_type',
      render: (type: string) => <Tag color="cyan">{type}</Tag>
    },
    {
      title: 'Category',
      dataIndex: 'category',
      key: 'category'
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: FieldMappingTemplate) => (
        <Space size="small">
          <Button 
            type="link" 
            size="small" 
            icon={<EyeOutlined />}
            onClick={() => setSelectedTemplate(record)}
          >
            View
          </Button>
          <Button 
            type="link" 
            size="small" 
            icon={<EditOutlined />}
            onClick={() => {
              setEditingTemplate(record)
              form.setFieldsValue(record)
              setTemplateModalVisible(true)
            }}
          >
            Edit
          </Button>
          {!record.is_default && (
            <Popconfirm
              title="Are you sure you want to delete this template?"
              onConfirm={() => handleDeleteTemplate(record.id)}
              okText="Yes"
              cancelText="No"
            >
              <Button type="link" size="small" danger icon={<DeleteOutlined />}>
                Delete
              </Button>
            </Popconfirm>
          )}
        </Space>
      )
    }
  ]

  const mappingColumns = [
    {
      title: 'Field Label',
      dataIndex: 'field_label',
      key: 'field_label',
      render: (text: string, record: FieldMapping) => (
        <Space direction="vertical" size="small">
          <Text strong>{text}</Text>
          <Space size="small">
            {record.is_required && <Tag color="red">Required</Tag>}
            {record.transformation_enabled && (
              <Tag icon={<ThunderboltOutlined />} color="orange">
                Transform
              </Tag>
            )}
            {!record.is_active && <Tag>Inactive</Tag>}
          </Space>
        </Space>
      )
    },
    {
      title: 'Source → Target',
      key: 'mapping',
      render: (_: any, record: FieldMapping) => (
        <Space direction="vertical" size="small">
          <Text type="secondary">
            <Tag color="blue">{record.source_platform}</Tag>
            {record.source_field_path}
          </Text>
          <div>↓</div>
          <Text type="secondary">
            <Tag color="green">{record.target_platform}</Tag>
            {record.target_field_path}
          </Text>
        </Space>
      )
    },
    {
      title: 'Type',
      dataIndex: 'field_type',
      key: 'field_type',
      render: (type: string) => <Tag>{type}</Tag>
    },
    {
      title: 'Direction',
      dataIndex: 'sync_direction',
      key: 'sync_direction',
      render: (direction: string) => (
        <Tag color={direction === 'bidirectional' ? 'purple' : 'default'}>
          {direction === 'bidirectional' ? '⇄' : '→'} {direction}
        </Tag>
      )
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: FieldMapping) => (
        <Space size="small">
          <Button 
            type="link" 
            size="small" 
            icon={<EditOutlined />}
            onClick={() => {
              setEditingMapping(record)
              mappingForm.setFieldsValue(record)
              setMappingModalVisible(true)
            }}
          >
            Edit
          </Button>
          <Button 
            type="link" 
            size="small" 
            icon={<CopyOutlined />}
            onClick={() => handleDuplicateMapping(record)}
          >
            Duplicate
          </Button>
          <Popconfirm
            title="Are you sure you want to delete this mapping?"
            onConfirm={() => handleDeleteMapping(record.id)}
            okText="Yes"
            cancelText="No"
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              Delete
            </Button>
          </Popconfirm>
        </Space>
      )
    }
  ]

  return (
    <div>
      <Title level={2}>Field Mapping Manager</Title>
      <Paragraph>
        Create custom field mappings between NetSuite and Shopify with transformations and validation rules.
      </Paragraph>

      <Alert
        message="Enhanced Field Mapping"
        description="Configure field mappings using our traditional table interface or the new visual drag-and-drop designer. Apply transformations, set default values, and define validation rules."
        type="info"
        showIcon
        style={{ marginBottom: 24 }}
      />

      <Tabs defaultActiveKey="visual" type="card" style={{ marginBottom: 24 }}>
        <TabPane
          tab={
            <span>
              <DragOutlined />
              Visual Mapping
            </span>
          }
          key="visual"
        >
          {selectedTemplate ? (
            <VisualFieldMapper
              templateId={selectedTemplate.id}
              onMappingsChange={(mappings) => {
                // Handle mappings change from visual interface
                console.log('Visual mappings updated:', mappings)
              }}
            />
          ) : (
            <Card>
              <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                <DragOutlined style={{ fontSize: 48, color: '#d9d9d9' }} />
                <Title level={4} style={{ marginTop: 16 }}>Select a Template</Title>
                <Paragraph type="secondary">
                  Choose a mapping template from the sidebar to start visual mapping.
                </Paragraph>
              </div>
            </Card>
          )}
        </TabPane>

        <TabPane
          tab={
            <span>
              <TableOutlined />
              Table View
            </span>
          }
          key="table"
        >
          <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <Card
            title="Mapping Templates"
            extra={
              <Button
                type="primary"
                size="small"
                icon={<PlusOutlined />}
                onClick={() => {
                  setEditingTemplate(null)
                  form.resetFields()
                  setTemplateModalVisible(true)
                }}
              >
                New Template
              </Button>
            }
          >
            <Table
              dataSource={templates}
              columns={templateColumns.filter(col => col.key !== 'actions')}
              rowKey="id"
              size="small"
              pagination={{ pageSize: 5 }}
              loading={loading}
              onRow={(record) => ({
                onClick: () => setSelectedTemplate(record),
                style: { cursor: 'pointer', backgroundColor: selectedTemplate?.id === record.id ? '#e6f7ff' : undefined }
              })}
            />
          </Card>
        </Col>

        <Col xs={24} lg={16}>
          {selectedTemplate ? (
            <Card
              title={
                <Space>
                  <LinkOutlined />
                  <span>Field Mappings: {selectedTemplate.name}</span>
                  <Badge count={mappings.length} style={{ backgroundColor: '#52c41a' }} />
                </Space>
              }
              extra={
                <Space>
                  <Button
                    icon={<SettingOutlined />}
                    onClick={() => setTransformationDrawerVisible(true)}
                  >
                    Transformation Rules
                  </Button>
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => {
                      setEditingMapping(null)
                      mappingForm.resetFields()
                      setMappingModalVisible(true)
                    }}
                  >
                    Add Mapping
                  </Button>
                </Space>
              }
            >
              <Table
                dataSource={mappings}
                columns={mappingColumns}
                rowKey="id"
                loading={loading}
                pagination={{ pageSize: 10 }}
                locale={{ emptyText: 'No field mappings defined. Click "Add Mapping" to create one.' }}
              />
            </Card>
          ) : (
            <Card>
              <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                <TableOutlined style={{ fontSize: 48, color: '#d9d9d9' }} />
                <Title level={4} style={{ marginTop: 16 }}>No Template Selected</Title>
                <Paragraph type="secondary">
                  Select a mapping template from the list to view and manage its field mappings.
                </Paragraph>
              </div>
            </Card>
          )}
        </Col>
      </Row>
        </TabPane>
      </Tabs>

      {/* Template Modal */}
      <Modal
        title={editingTemplate ? 'Edit Template' : 'Create New Template'}
        visible={templateModalVisible}
        onCancel={() => {
          setTemplateModalVisible(false)
          setEditingTemplate(null)
          form.resetFields()
        }}
        onOk={() => form.submit()}
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={editingTemplate ? handleUpdateTemplate : handleCreateTemplate}
        >
          <Form.Item
            name="name"
            label="Template Name"
            rules={[{ required: true, message: 'Please enter template name' }]}
          >
            <Input placeholder="e.g., Product Mapping for Fashion" />
          </Form.Item>

          <Form.Item name="description" label="Description">
            <TextArea rows={3} placeholder="Describe this mapping template..." />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="template_type"
                label="Template Type"
                rules={[{ required: true }]}
              >
                <Select placeholder="Select type">
                  <Option value="product">Product</Option>
                  <Option value="inventory">Inventory</Option>
                  <Option value="order">Order</Option>
                  <Option value="customer">Customer</Option>
                  <Option value="custom">Custom</Option>
                </Select>
              </Form.Item>
            </Col>

            <Col span={12}>
              <Form.Item name="category" label="Category">
                <Input placeholder="e.g., Fashion, Electronics" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="is_active" label="Active" valuePropName="checked" initialValue={true}>
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      {/* Mapping Modal */}
      <Modal
        title={editingMapping ? 'Edit Field Mapping' : 'Create Field Mapping'}
        visible={mappingModalVisible}
        onCancel={() => {
          setMappingModalVisible(false)
          setEditingMapping(null)
          mappingForm.resetFields()
        }}
        onOk={() => mappingForm.submit()}
        width={800}
      >
        <Form
          form={mappingForm}
          layout="vertical"
          onFinish={editingMapping ? handleUpdateMapping : handleCreateMapping}
        >
          <Form.Item
            name="field_label"
            label="Field Label"
            rules={[{ required: true, message: 'Please enter field label' }]}
          >
            <Input placeholder="e.g., Product Title" />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="source_platform"
                label="Source Platform"
                rules={[{ required: true }]}
              >
                <Select placeholder="Select source">
                  <Option value="netsuite">NetSuite</Option>
                  <Option value="shopify">Shopify</Option>
                </Select>
              </Form.Item>

              <Form.Item
                name="source_field_path"
                label="Source Field Path"
                rules={[{ required: true }]}
                help="Use dot notation for nested fields, e.g., product.title"
              >
                <Input placeholder="e.g., itemid or product.title" />
              </Form.Item>
            </Col>

            <Col span={12}>
              <Form.Item
                name="target_platform"
                label="Target Platform"
                rules={[{ required: true }]}
              >
                <Select placeholder="Select target">
                  <Option value="netsuite">NetSuite</Option>
                  <Option value="shopify">Shopify</Option>
                </Select>
              </Form.Item>

              <Form.Item
                name="target_field_path"
                label="Target Field Path"
                rules={[{ required: true }]}
              >
                <Input placeholder="e.g., title or product.displayname" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="field_type" label="Field Type" rules={[{ required: true }]}>
                <Select placeholder="Select type">
                  <Option value="string">String</Option>
                  <Option value="number">Number</Option>
                  <Option value="boolean">Boolean</Option>
                  <Option value="date">Date</Option>
                  <Option value="array">Array</Option>
                  <Option value="object">Object</Option>
                </Select>
              </Form.Item>
            </Col>

            <Col span={8}>
              <Form.Item name="sync_direction" label="Sync Direction" initialValue="bidirectional">
                <Select>
                  <Option value="source_to_target">Source → Target</Option>
                  <Option value="bidirectional">Bidirectional</Option>
                </Select>
              </Form.Item>
            </Col>

            <Col span={8}>
              <Form.Item name="priority" label="Priority" initialValue={0}>
                <Input type="number" placeholder="0" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="is_required" label="Required Field" valuePropName="checked">
            <Switch />
          </Form.Item>

          <Form.Item name="default_value" label="Default Value">
            <Input placeholder="Value to use if source is empty" />
          </Form.Item>

          <Divider>Transformation</Divider>

          <Form.Item name="transformation_enabled" label="Enable Transformation" valuePropName="checked">
            <Switch />
          </Form.Item>

          <Form.Item
            noStyle
            shouldUpdate={(prevValues, currentValues) =>
              prevValues.transformation_enabled !== currentValues.transformation_enabled
            }
          >
            {({ getFieldValue }) =>
              getFieldValue('transformation_enabled') ? (
                <>
                  <Form.Item name="transformation_type" label="Transformation Type">
                    <Select placeholder="Select transformation type">
                      <Option value="none">None</Option>
                      <Option value="javascript">JavaScript</Option>
                      <Option value="template">Template</Option>
                      <Option value="lookup">Lookup Table</Option>
                      <Option value="formula">Formula</Option>
                    </Select>
                  </Form.Item>

                  <Form.Item
                    name={['transformation_config', 'code']}
                    label="Transformation Code"
                    help="JavaScript code that transforms the value. Use 'value' variable."
                  >
                    <TextArea 
                      rows={4} 
                      placeholder="e.g., return value ? value.toString().toUpperCase() : value;" 
                      style={{ fontFamily: 'monospace' }}
                    />
                  </Form.Item>
                </>
              ) : null
            }
          </Form.Item>

          <Form.Item name="is_active" label="Active" valuePropName="checked" initialValue={true}>
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      {/* Transformation Rules Drawer */}
      <Drawer
        title="Transformation Rules Library"
        placement="right"
        width={600}
        visible={transformationDrawerVisible}
        onClose={() => setTransformationDrawerVisible(false)}
      >
        <Paragraph>
          Reusable transformation rules that can be applied to field mappings.
        </Paragraph>
        <Table
          dataSource={transformationRules}
          columns={[
            {
              title: 'Rule Name',
              dataIndex: 'name',
              key: 'name',
              render: (text: string, record: TransformationRule) => (
                <Space direction="vertical" size="small">
                  <Text strong>{text}</Text>
                  {record.is_global && <Tag color="gold">Global</Tag>}
                </Space>
              )
            },
            {
              title: 'Type',
              dataIndex: 'rule_type',
              key: 'rule_type',
              render: (type: string) => <Tag color="purple">{type}</Tag>
            },
            {
              title: 'Usage',
              dataIndex: 'usage_count',
              key: 'usage_count',
              render: (count: number) => <Badge count={count} />
            }
          ]}
          rowKey="id"
          size="small"
          pagination={{ pageSize: 10 }}
        />
      </Drawer>
    </div>
  )
}

// Missing import
import { EyeOutlined } from '@ant-design/icons'

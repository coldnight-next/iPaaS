import { useState, useEffect, useCallback } from 'react'
import {
  Card, Table, Button, Modal, Form, Input, Select, Switch, Tag, Space, message,
  Typography, Row, Col, Tabs, Divider, Alert, Tooltip, Popconfirm, Badge, Drawer, Spin
} from 'antd'
import {
  PlusOutlined, EditOutlined, DeleteOutlined, CopyOutlined, LinkOutlined,
  CodeOutlined, ThunderboltOutlined, TableOutlined, CheckCircleOutlined,
  WarningOutlined, SyncOutlined, SettingOutlined, DragOutlined, EyeOutlined,
  SearchOutlined, DatabaseOutlined, ApiOutlined
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
  const [fieldSchemas, setFieldSchemas] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [templateModalVisible, setTemplateModalVisible] = useState(false)
  const [mappingModalVisible, setMappingModalVisible] = useState(false)
  const [transformationDrawerVisible, setTransformationDrawerVisible] = useState(false)
  const [schemaModalVisible, setSchemaModalVisible] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<FieldMappingTemplate | null>(null)
  const [editingMapping, setEditingMapping] = useState<FieldMapping | null>(null)
  const [editingSchema, setEditingSchema] = useState<any | null>(null)
  const [form] = Form.useForm()
  const [mappingForm] = Form.useForm()
  const [schemaForm] = Form.useForm()

  // Enhanced state for better UX
  const [activeTab, setActiveTab] = useState('templates')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedPlatform, setSelectedPlatform] = useState<'all' | 'netsuite' | 'shopify'>('all')
  const [selectedEntityType, setSelectedEntityType] = useState<string>('all')


  // Load templates - simplified for now
  const loadTemplates = useCallback(async () => {
    if (!session) return
    setLoading(true)
    try {
      // Use existing products table as a placeholder for now
      const { data, error } = await supabase
        .from('products')
        .select('id, name, platform, created_at, updated_at')
        .eq('user_id', session.user.id)
        .limit(10)

      if (error) throw error

      // Transform to template format
      const templateData = (data || []).map(item => ({
        id: item.id,
        name: `${item.platform} Template - ${item.name}`,
        description: `Template for ${item.platform} platform`,
        template_type: 'product',
        is_active: true,
        is_default: false,
        category: item.platform,
        created_at: item.created_at,
        updated_at: item.updated_at
      }))

      setTemplates(templateData)

      // Auto-select first template
      if (templateData && templateData.length > 0 && !selectedTemplate) {
        setSelectedTemplate(templateData[0])
      }
    } catch (error) {
      console.error('Error loading templates:', error)
      message.error('Failed to load mapping templates')
    } finally {
      setLoading(false)
    }
  }, [session, selectedTemplate])

  // Load mappings for selected template - simplified
  const loadMappings = useCallback(async (templateId: string) => {
    if (!session) return
    setLoading(true)
    try {
      // Use existing item_mappings table as a placeholder
      const { data, error } = await supabase
        .from('item_mappings')
        .select('*')
        .eq('user_id', session.user.id)
        .limit(10)

      if (error) throw error

      // Transform to mapping format
      const mappingData = (data || []).map(item => ({
        id: item.id,
        template_id: templateId,
        source_platform: 'netsuite',
        target_platform: 'shopify',
        source_field_path: item.netsuite_item_id,
        target_field_path: item.shopify_product_id || '',
        field_label: `Mapping ${item.id}`,
        field_type: 'string',
        is_required: false,
        transformation_enabled: item.sync_enabled,
        transformation_type: 'direct',
        transformation_config: {},
        sync_direction: item.sync_direction,
        is_active: item.sync_enabled
      }))

      setMappings(mappingData)
    } catch (error) {
      console.error('Error loading mappings:', error)
      message.error('Failed to load field mappings')
    } finally {
      setLoading(false)
    }
  }, [session])

  // Load transformation rules - simplified
  const loadTransformationRules = useCallback(async () => {
    if (!session) return
    try {
      // Mock transformation rules for now
      const mockRules = [
        {
          id: '1',
          name: 'Direct Mapping',
          description: 'Direct field mapping without transformation',
          rule_type: 'direct',
          rule_config: {},
          is_global: true,
          usage_count: 100
        },
        {
          id: '2',
          name: 'Currency Conversion',
          description: 'Convert currency values',
          rule_type: 'formula',
          rule_config: { formula: 'value * 1.1' },
          is_global: true,
          usage_count: 50
        }
      ]
      setTransformationRules(mockRules)
    } catch (error) {
      console.error('Error loading transformation rules:', error)
    }
  }, [session])

  // Load field schemas - simplified
  const loadFieldSchemas = useCallback(async () => {
    if (!session) return
    try {
      // Use existing products table to get some field info
      const { data, error } = await supabase
        .from('products')
        .select('platform, name')
        .eq('user_id', session.user.id)
        .limit(5)

      if (error) throw error

      // Mock field schemas
      const mockSchemas = [
        {
          id: '1',
          platform: 'netsuite',
          entity_type: 'product',
          field_name: 'name',
          field_type: 'string',
          is_required: true,
          description: 'Product name',
          is_active: true
        },
        {
          id: '2',
          platform: 'shopify',
          entity_type: 'product',
          field_name: 'title',
          field_type: 'string',
          is_required: true,
          description: 'Product title',
          is_active: true
        }
      ]
      setFieldSchemas(mockSchemas)
    } catch (error) {
      console.error('Error loading field schemas:', error)
    }
  }, [session])

  useEffect(() => {
    loadTemplates()
    loadTransformationRules()
    loadFieldSchemas()
  }, [loadTemplates, loadTransformationRules, loadFieldSchemas])

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

  // Filtered data
  const filteredTemplates = templates.filter(template => {
    const matchesSearch = searchTerm === '' ||
      template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      template.description?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesPlatform = selectedPlatform === 'all' ||
      template.category === selectedPlatform
    return matchesSearch && matchesPlatform
  })

  const filteredSchemas = fieldSchemas.filter(schema => {
    const matchesSearch = searchTerm === '' ||
      schema.field_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      schema.description?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesPlatform = selectedPlatform === 'all' || schema.platform === selectedPlatform
    const matchesEntity = selectedEntityType === 'all' || schema.entity_type === selectedEntityType
    return matchesSearch && matchesPlatform && matchesEntity
  })

  return (
    <div className="field-mapping-manager">
      <div className="mb-6">
        <Title level={2}>Field Mapping Manager</Title>
        <Paragraph className="text-gray-600">
          Create custom field mappings between NetSuite and Shopify with transformations and validation rules.
        </Paragraph>
      </div>

      <Alert
        message="Field Mapping System"
        description="This component is under development. Basic functionality will be available soon."
        type="info"
        showIcon
        className="mb-6"
      />

      <Card>
        {loading ? (
          <div className="text-center py-16">
            <Spin size="large" />
            <div className="mt-4">Loading field mapping system...</div>
          </div>
        ) : (
          <div className="text-center py-16">
            <TableOutlined className="text-6xl text-gray-300 mb-4" />
            <Title level={4}>Field Mapping Manager</Title>
            <Paragraph className="text-gray-500">
              The enhanced field mapping system is currently being developed.
              Basic template and mapping management will be available soon.
            </Paragraph>
            <div className="mt-4">
              <Text type="secondary">
                Loaded {templates.length} templates, {mappings.length} mappings, {fieldSchemas.length} schemas
              </Text>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}

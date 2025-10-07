import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Card, Button, Space, Typography, message, Modal, Input, Select, Tag,
  Row, Col, Tooltip, Alert, Spin, Divider
} from 'antd'
import {
  DndContext, DragOverlay, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors
} from '@dnd-kit/core'
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy
} from '@dnd-kit/sortable'
import {
  useSortable
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  ArrowRightOutlined, DatabaseOutlined, LinkOutlined, DisconnectOutlined,
  EditOutlined, DeleteOutlined, PlusOutlined, SaveOutlined, UndoOutlined,
  ThunderboltOutlined
} from '@ant-design/icons'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const { Title, Text } = Typography
const { Option } = Select

interface FieldSchema {
  id: string
  name: string
  type: string
  required: boolean
  description?: string
  sampleValue?: any
}

interface MappingConnection {
  id: string
  sourceField: FieldSchema
  targetField: FieldSchema
  transformation?: {
    type: 'direct' | 'formula' | 'lookup' | 'conditional'
    config?: any
  }
}

interface VisualFieldMapperProps {
  templateId?: string
  onMappingsChange?: (mappings: MappingConnection[]) => void
}

interface DraggableFieldProps {
  field: FieldSchema
  platform: 'source' | 'target'
  isConnected?: boolean
}

function DraggableField({ field, platform, isConnected }: DraggableFieldProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `${platform}-${field.id}` })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const getTypeColor = (type: string) => {
    switch (type.toLowerCase()) {
      case 'string': return 'blue'
      case 'number': return 'green'
      case 'boolean': return 'orange'
      case 'date': return 'purple'
      case 'array': return 'cyan'
      case 'object': return 'magenta'
      default: return 'default'
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`
        p-3 mb-2 border rounded-lg cursor-move transition-all duration-200
        ${isConnected ? 'border-green-400 bg-green-50' : 'border-gray-200 bg-white'}
        hover:border-blue-400 hover:shadow-md
        ${isDragging ? 'shadow-lg scale-105' : ''}
      `}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Text strong className="text-sm">{field.name}</Text>
            {field.required && <Tag color="red" size="small">Required</Tag>}
            {isConnected && <LinkOutlined className="text-green-500" />}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <Tag color={getTypeColor(field.type)} size="small">{field.type}</Tag>
            {field.description && (
              <Text type="secondary" className="text-xs truncate max-w-32">
                {field.description}
              </Text>
            )}
          </div>
          {field.sampleValue && (
            <Text type="secondary" className="text-xs block mt-1">
              Sample: {JSON.stringify(field.sampleValue).slice(0, 30)}...
            </Text>
          )}
        </div>
      </div>
    </div>
  )
}

export default function VisualFieldMapper({ templateId, onMappingsChange }: VisualFieldMapperProps) {
  const { session } = useAuth()
  const [sourceFields, setSourceFields] = useState<FieldSchema[]>([])
  const [targetFields, setTargetFields] = useState<FieldSchema[]>([])
  const [mappings, setMappings] = useState<MappingConnection[]>([])
  const [loading, setLoading] = useState(false)
  const [draggedField, setDraggedField] = useState<FieldSchema | null>(null)
  const [selectedMapping, setSelectedMapping] = useState<MappingConnection | null>(null)
  const [transformationModalVisible, setTransformationModalVisible] = useState(false)
  const [previewData, setPreviewData] = useState<any>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [autoSuggestions, setAutoSuggestions] = useState<MappingConnection[]>([])

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Load field schemas
  const loadFieldSchemas = useCallback(async () => {
    if (!session) return
    setLoading(true)

    try {
      // Load NetSuite schema
      const { data: netsuiteSchema } = await supabase
        .from('field_schemas')
        .select('*')
        .eq('platform', 'netsuite')
        .eq('entity_type', 'product')

      // Load Shopify schema
      const { data: shopifySchema } = await supabase
        .from('field_schemas')
        .select('*')
        .eq('platform', 'shopify')
        .eq('entity_type', 'product')

      const sourceFieldsData = (netsuiteSchema || []).map(s => ({
        id: s.id,
        name: s.field_name,
        type: s.field_type,
        required: s.is_required,
        description: s.description,
        sampleValue: s.sample_value
      }))

      const targetFieldsData = (shopifySchema || []).map(s => ({
        id: s.id,
        name: s.field_name,
        type: s.field_type,
        required: s.is_required,
        description: s.description,
        sampleValue: s.sample_value
      }))

      setSourceFields(sourceFieldsData)
      setTargetFields(targetFieldsData)

      // Load existing mappings if templateId provided
      if (templateId) {
        const { data: existingMappings } = await supabase
          .from('field_mappings')
          .select('*')
          .eq('template_id', templateId)

        // Convert to MappingConnection format using the loaded field data
        const connections: MappingConnection[] = (existingMappings || []).map(m => ({
          id: m.id,
          sourceField: sourceFieldsData.find(f => f.name === m.source_field_path)!,
          targetField: targetFieldsData.find(f => f.name === m.target_field_path)!,
          transformation: m.transformation_enabled ? {
            type: m.transformation_type as any,
            config: m.transformation_config
          } : undefined
        })).filter(m => m.sourceField && m.targetField)

        setMappings(connections)
      }
    } catch (error) {
      console.error('Error loading field schemas:', error)
      message.error('Failed to load field schemas')
    } finally {
      setLoading(false)
    }
  }, [session, templateId])

  useEffect(() => {
    loadFieldSchemas()
  }, [loadFieldSchemas])

  // Generate auto-suggestions based on field names and types
  const generateAutoSuggestions = useCallback(() => {
    const suggestions: MappingConnection[] = []

    sourceFields.forEach(sourceField => {
      targetFields.forEach(targetField => {
        // Exact name match
        if (sourceField.name.toLowerCase() === targetField.name.toLowerCase()) {
          suggestions.push({
            id: `auto-${sourceField.id}-${targetField.id}`,
            sourceField,
            targetField,
            transformation: { type: 'direct' }
          })
        }
        // Similar names (contains)
        else if (sourceField.name.toLowerCase().includes(targetField.name.toLowerCase()) ||
                 targetField.name.toLowerCase().includes(sourceField.name.toLowerCase())) {
          suggestions.push({
            id: `auto-${sourceField.id}-${targetField.id}`,
            sourceField,
            targetField,
            transformation: { type: 'direct' }
          })
        }
        // Same data type
        else if (sourceField.type === targetField.type) {
          suggestions.push({
            id: `auto-${sourceField.id}-${targetField.id}`,
            sourceField,
            targetField,
            transformation: { type: 'direct' }
          })
        }
      })
    })

    // Remove duplicates and existing mappings
    const uniqueSuggestions = suggestions.filter(suggestion => {
      return !mappings.some(mapping =>
        mapping.sourceField.id === suggestion.sourceField.id &&
        mapping.targetField.id === suggestion.targetField.id
      )
    })

    setAutoSuggestions(uniqueSuggestions.slice(0, 10)) // Limit to top 10 suggestions
  }, [sourceFields, targetFields, mappings])

  useEffect(() => {
    if (sourceFields.length > 0 && targetFields.length > 0) {
      generateAutoSuggestions()
    }
  }, [sourceFields, targetFields, generateAutoSuggestions])

  // Generate preview data for transformations
  const generatePreviewData = useCallback(async () => {
    if (mappings.length === 0) return

    try {
      // Create sample data based on source field types
      const sampleInput: any = {}
      sourceFields.forEach(field => {
        switch (field.type.toLowerCase()) {
          case 'string':
            sampleInput[field.name] = `Sample ${field.name}`
            break
          case 'number':
            sampleInput[field.name] = Math.floor(Math.random() * 1000) + 1
            break
          case 'boolean':
            sampleInput[field.name] = Math.random() > 0.5
            break
          case 'date':
            sampleInput[field.name] = new Date().toISOString()
            break
          default:
            sampleInput[field.name] = `Sample ${field.type}`
        }
      })

      setPreviewData(sampleInput)
    } catch (error) {
      console.error('Error generating preview data:', error)
    }
  }, [mappings, sourceFields])

  useEffect(() => {
    generatePreviewData()
  }, [generatePreviewData])

  // Handle drag start
  const handleDragStart = (event: any) => {
    const { active } = event
    const [platform, fieldId] = active.id.toString().split('-')
    const fields = platform === 'source' ? sourceFields : targetFields
    const field = fields.find(f => f.id === fieldId)
    setDraggedField(field || null)
  }

  // Handle drag over
  const handleDragOver = (event: any) => {
    const { active, over } = event
    if (!over) return

    const [activePlatform] = active.id.toString().split('-')
    const [overPlatform] = over.id.toString().split('-')

    // Only allow connections between different platforms
    if (activePlatform === overPlatform) return

    // Prevent dropping on the same platform
    if (activePlatform === overPlatform) return
  }

  // Handle drag end
  const handleDragEnd = (event: any) => {
    const { active, over } = event
    setDraggedField(null)

    if (!over) return

    const [activePlatform, activeFieldId] = active.id.toString().split('-')
    const [overPlatform, overFieldId] = over.id.toString().split('-')

    // Only create connections between different platforms
    if (activePlatform === overPlatform) return

    const sourceField = activePlatform === 'source'
      ? sourceFields.find(f => f.id === activeFieldId)
      : targetFields.find(f => f.id === activeFieldId)

    const targetField = overPlatform === 'target'
      ? targetFields.find(f => f.id === overFieldId)
      : sourceFields.find(f => f.id === overFieldId)

    if (!sourceField || !targetField) return

    // Check if connection already exists
    const existingConnection = mappings.find(m =>
      m.sourceField.id === sourceField.id && m.targetField.id === targetField.id
    )

    if (existingConnection) {
      message.warning('Connection already exists')
      return
    }

    // Create new connection
    const newConnection: MappingConnection = {
      id: `mapping-${Date.now()}`,
      sourceField,
      targetField,
      transformation: { type: 'direct' }
    }

    const newMappings = [...mappings, newConnection]
    setMappings(newMappings)
    onMappingsChange?.(newMappings)

    message.success(`Connected ${sourceField.name} → ${targetField.name}`)
  }

  // Remove mapping
  const removeMapping = (mappingId: string) => {
    const newMappings = mappings.filter(m => m.id !== mappingId)
    setMappings(newMappings)
    onMappingsChange?.(newMappings)
    message.success('Mapping removed')
  }

  // Apply auto-suggestion
  const applyAutoSuggestion = (suggestion: MappingConnection) => {
    const newMappings = [...mappings, suggestion]
    setMappings(newMappings)
    onMappingsChange?.(newMappings)
    message.success(`Auto-mapped ${suggestion.sourceField.name} → ${suggestion.targetField.name}`)
  }

  // Apply all auto-suggestions
  const applyAllAutoSuggestions = () => {
    const newMappings = [...mappings, ...autoSuggestions]
    setMappings(newMappings)
    onMappingsChange?.(newMappings)
    setAutoSuggestions([])
    message.success(`Applied ${autoSuggestions.length} auto-suggestions`)
  }

  // Edit transformation
  const editTransformation = (mapping: MappingConnection) => {
    setSelectedMapping(mapping)
    setTransformationModalVisible(true)
  }

  // Save transformation
  const saveTransformation = (transformation: any) => {
    if (!selectedMapping) return

    const updatedMappings = mappings.map(m =>
      m.id === selectedMapping.id
        ? { ...m, transformation }
        : m
    )

    setMappings(updatedMappings)
    onMappingsChange?.(updatedMappings)
    setTransformationModalVisible(false)
    setSelectedMapping(null)
    message.success('Transformation updated')
  }

  // Get connected field IDs for highlighting
  const getConnectedSourceIds = mappings.map(m => m.sourceField.id)
  const getConnectedTargetIds = mappings.map(m => m.targetField.id)

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Spin size="large" />
      </div>
    )
  }

  return (
    <div className="visual-field-mapper">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <Title level={4}>Visual Field Mapping</Title>
            <Text type="secondary">
              Drag fields from the source platform to connect them with target platform fields
            </Text>
          </div>
          <Button
            type="default"
            icon={<ThunderboltOutlined />}
            onClick={() => setShowPreview(!showPreview)}
          >
            {showPreview ? 'Hide Preview' : 'Show Preview'}
          </Button>
        </div>
      </div>

      <Alert
        message="How to Use"
        description="Drag fields from the left panel to the right panel to create mappings. Click the transformation icon to add data transformations. Use auto-suggestions for quick mapping."
        type="info"
        showIcon
        className="mb-6"
      />

      {/* Auto-Suggestions Panel */}
      {autoSuggestions.length > 0 && (
        <Card title="🤖 Auto-Suggestions" className="mb-6" size="small">
          <div className="flex items-center justify-between mb-3">
            <Text type="secondary">
              Found {autoSuggestions.length} potential field mappings based on names and types
            </Text>
            <Button
              type="primary"
              size="small"
              onClick={applyAllAutoSuggestions}
              icon={<ThunderboltOutlined />}
            >
              Apply All
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {autoSuggestions.slice(0, 6).map(suggestion => (
              <div key={suggestion.id} className="flex items-center justify-between p-2 border rounded bg-gray-50">
                <div className="flex items-center space-x-2">
                  <Tag color="blue" size="small">{suggestion.sourceField.name}</Tag>
                  <ArrowRightOutlined />
                  <Tag color="green" size="small">{suggestion.targetField.name}</Tag>
                </div>
                <Button
                  size="small"
                  type="link"
                  onClick={() => applyAutoSuggestion(suggestion)}
                >
                  Apply
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Preview Panel */}
      {showPreview && previewData && (
        <Card title="🔍 Live Preview" className="mb-6" size="small">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Title level={5}>Input Data</Title>
              <pre className="bg-gray-100 p-2 rounded text-xs overflow-auto max-h-32">
                {JSON.stringify(previewData, null, 2)}
              </pre>
            </div>
            <div>
              <Title level={5}>Transformed Output</Title>
              <pre className="bg-green-50 p-2 rounded text-xs overflow-auto max-h-32">
                {JSON.stringify(
                  mappings.reduce((acc, mapping) => {
                    const inputValue = previewData[mapping.sourceField.name]
                    acc[mapping.targetField.name] = inputValue // Simple direct mapping for preview
                    return acc
                  }, {} as any),
                  null,
                  2
                )}
              </pre>
            </div>
          </div>
        </Card>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <Row gutter={24}>
          {/* Source Fields Panel */}
          <Col span={11}>
            <Card
              title={
                <Space>
                  <DatabaseOutlined />
                  <span>Source: NetSuite</span>
                  <Tag color="blue">{sourceFields.length} fields</Tag>
                </Space>
              }
              className="h-full"
            >
              <div className="max-h-96 overflow-y-auto">
                <SortableContext items={sourceFields.map(f => `source-${f.id}`)} strategy={verticalListSortingStrategy}>
                  {sourceFields.map(field => (
                    <DraggableField
                      key={`source-${field.id}`}
                      field={field}
                      platform="source"
                      isConnected={getConnectedSourceIds.includes(field.id)}
                    />
                  ))}
                </SortableContext>
              </div>
            </Card>
          </Col>

          {/* Mapping Canvas */}
          <Col span={2} className="flex items-center justify-center">
            <div className="flex flex-col items-center space-y-4">
              <ArrowRightOutlined className="text-2xl text-gray-400" />
              <div className="text-center">
                <Text type="secondary" className="text-xs">DRAG TO CONNECT</Text>
              </div>
            </div>
          </Col>

          {/* Target Fields Panel */}
          <Col span={11}>
            <Card
              title={
                <Space>
                  <DatabaseOutlined />
                  <span>Target: Shopify</span>
                  <Tag color="green">{targetFields.length} fields</Tag>
                </Space>
              }
              className="h-full"
            >
              <div className="max-h-96 overflow-y-auto">
                <SortableContext items={targetFields.map(f => `target-${f.id}`)} strategy={verticalListSortingStrategy}>
                  {targetFields.map(field => (
                    <DraggableField
                      key={`target-${field.id}`}
                      field={field}
                      platform="target"
                      isConnected={getConnectedTargetIds.includes(field.id)}
                    />
                  ))}
                </SortableContext>
              </div>
            </Card>
          </Col>
        </Row>

        {/* Active Mappings */}
        {mappings.length > 0 && (
          <Card title="Active Mappings" className="mt-6">
            <div className="space-y-3">
              {mappings.map(mapping => (
                <div key={mapping.id} className="flex items-center justify-between p-3 border rounded-lg bg-gray-50">
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
                      <Tag color="blue">{mapping.sourceField.name}</Tag>
                      <ArrowRightOutlined />
                      <Tag color="green">{mapping.targetField.name}</Tag>
                    </div>
                    {mapping.transformation && (
                      <Tag color="orange" icon={<EditOutlined />}>
                        {mapping.transformation.type}
                      </Tag>
                    )}
                  </div>
                  <Space>
                    <Button
                      size="small"
                      icon={<EditOutlined />}
                      onClick={() => editTransformation(mapping)}
                    >
                      Transform
                    </Button>
                    <Button
                      size="small"
                      danger
                      icon={<DisconnectOutlined />}
                      onClick={() => removeMapping(mapping.id)}
                    >
                      Remove
                    </Button>
                  </Space>
                </div>
              ))}
            </div>
          </Card>
        )}

        <DragOverlay>
          {draggedField ? (
            <div className="p-3 border border-blue-400 rounded-lg bg-blue-50 shadow-lg transform rotate-3">
              <Text strong>{draggedField.name}</Text>
              <br />
              <Tag color="blue" size="small">{draggedField.type}</Tag>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Transformation Modal */}
      <Modal
        title="Field Transformation"
        open={transformationModalVisible}
        onCancel={() => setTransformationModalVisible(false)}
        footer={null}
        width={600}
      >
        {selectedMapping && (
          <TransformationEditor
            mapping={selectedMapping}
            onSave={saveTransformation}
            onCancel={() => setTransformationModalVisible(false)}
          />
        )}
      </Modal>
    </div>
  )
}

// Transformation Editor Component
interface TransformationEditorProps {
  mapping: MappingConnection
  onSave: (transformation: any) => void
  onCancel: () => void
}

function TransformationEditor({ mapping, onSave, onCancel }: TransformationEditorProps) {
  const [transformationType, setTransformationType] = useState(mapping.transformation?.type || 'direct')
  const [config, setConfig] = useState(mapping.transformation?.config || {})

  const handleSave = () => {
    onSave({
      type: transformationType,
      config
    })
  }

  return (
    <div className="space-y-4">
      <div>
        <Text strong>Mapping: </Text>
        <Tag color="blue">{mapping.sourceField.name}</Tag>
        <ArrowRightOutlined className="mx-2" />
        <Tag color="green">{mapping.targetField.name}</Tag>
      </div>

      <div>
        <Text strong className="block mb-2">Transformation Type</Text>
        <Select
          value={transformationType}
          onChange={setTransformationType}
          className="w-full"
        >
          <Option value="direct">Direct Mapping</Option>
          <Option value="formula">Formula</Option>
          <Option value="lookup">Lookup Table</Option>
          <Option value="conditional">Conditional</Option>
        </Select>
      </div>

      {transformationType === 'formula' && (
        <div>
          <Text strong className="block mb-2">Formula</Text>
          <Input
            placeholder="e.g., value * 1.1 + shipping"
            value={config.formula || ''}
            onChange={(e) => setConfig({ ...config, formula: e.target.value })}
          />
          <Text type="secondary" className="text-xs mt-1">
            Use 'value' variable to reference the source field value
          </Text>
        </div>
      )}

      {transformationType === 'lookup' && (
        <div>
          <Text strong className="block mb-2">Lookup Table</Text>
          <Select
            placeholder="Select lookup table"
            className="w-full"
            value={config.lookupTable}
            onChange={(value) => setConfig({ ...config, lookupTable: value })}
          >
            <Option value="currency_codes">Currency Codes</Option>
            <Option value="country_codes">Country Codes</Option>
            <Option value="custom">Custom Table</Option>
          </Select>
        </div>
      )}

      {transformationType === 'conditional' && (
        <div className="space-y-3">
          <Text strong className="block">Conditions</Text>
          <Input
            placeholder="e.g., value > 100"
            value={config.condition || ''}
            onChange={(e) => setConfig({ ...config, condition: e.target.value })}
          />
          <Input
            placeholder="Then value"
            value={config.thenValue || ''}
            onChange={(e) => setConfig({ ...config, thenValue: e.target.value })}
          />
          <Input
            placeholder="Else value"
            value={config.elseValue || ''}
            onChange={(e) => setConfig({ ...config, elseValue: e.target.value })}
          />
        </div>
      )}

      <div className="flex justify-end space-x-2 pt-4">
        <Button onClick={onCancel}>Cancel</Button>
        <Button type="primary" onClick={handleSave}>
          <SaveOutlined /> Save Transformation
        </Button>
      </div>
    </div>
  )
}
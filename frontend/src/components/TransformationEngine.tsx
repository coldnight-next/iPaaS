import React, { useState, useEffect } from 'react'
import {
  Card, Button, Select, Input, Form, Space, Typography, Alert, Tag,
  Row, Col, Modal, Table, message, Tooltip, Divider
} from 'antd'
import {
  CalculatorOutlined, DatabaseOutlined, BranchesOutlined,
  FunctionOutlined, PlayCircleOutlined, CheckCircleOutlined,
  ExclamationCircleOutlined, CodeOutlined
} from '@ant-design/icons'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const { Title, Text, Paragraph } = Typography
const { TextArea } = Input
const { Option } = Select

export interface TransformationRule {
  id: string
  name: string
  type: 'formula' | 'lookup' | 'conditional' | 'javascript'
  config: any
  description?: string
  isGlobal?: boolean
}

export interface TransformationContext {
  sourceValue: any
  targetField: string
  sourceField: string
  rowData?: any
  lookupTables?: Record<string, any[]>
}

export interface TransformationResult {
  success: boolean
  value: any
  error?: string
  metadata?: any
}

interface TransformationEngineProps {
  value?: any
  onChange?: (result: TransformationResult) => void
  context?: TransformationContext
  mode?: 'editor' | 'preview' | 'inline'
}

export default function TransformationEngine({
  value,
  onChange,
  context = {},
  mode = 'editor'
}: TransformationEngineProps) {
  const { session } = useAuth()
  const [transformationType, setTransformationType] = useState<'formula' | 'lookup' | 'conditional' | 'javascript'>('formula')
  const [config, setConfig] = useState<any>({})
  const [lookupTables, setLookupTables] = useState<any[]>([])
  const [transformationRules, setTransformationRules] = useState<TransformationRule[]>([])
  const [testValue, setTestValue] = useState('')
  const [testResult, setTestResult] = useState<TransformationResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [previewModalVisible, setPreviewModalVisible] = useState(false)

  // Load lookup tables and transformation rules
  useEffect(() => {
    loadLookupTables()
    loadTransformationRules()
  }, [session])

  const loadLookupTables = async () => {
    if (!session) return
    try {
      const { data, error } = await supabase
        .from('lookup_tables')
        .select('*')
        .or(`user_id.eq.${session.user.id},is_global.eq.true`)

      if (error) throw error
      setLookupTables(data || [])
    } catch (error) {
      console.error('Error loading lookup tables:', error)
    }
  }

  const loadTransformationRules = async () => {
    if (!session) return
    try {
      const { data, error } = await supabase
        .from('transformation_rules')
        .select('*')
        .or(`user_id.eq.${session.user.id},is_global.eq.true`)

      if (error) throw error
      setTransformationRules(data || [])
    } catch (error) {
      console.error('Error loading transformation rules:', error)
    }
  }

  // Formula Engine
  const evaluateFormula = (formula: string, variables: Record<string, any>): TransformationResult => {
    try {
      // Extract variables from context
      const { sourceValue, rowData = {} } = variables

      // Create safe evaluation context
      const safeContext = {
        value: sourceValue,
        ...rowData,
        Math,
        // Add common functions
        UPPER: (str: string) => str?.toString().toUpperCase() || '',
        LOWER: (str: string) => str?.toString().toLowerCase() || '',
        TRIM: (str: string) => str?.toString().trim() || '',
        CONCAT: (...args: any[]) => args.join(''),
        IF: (condition: any, trueVal: any, falseVal: any) => condition ? trueVal : falseVal,
        ROUND: (num: number, decimals: number = 0) => Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals),
        DATE: (dateStr: string) => new Date(dateStr),
        FORMAT_DATE: (date: any, format: string = 'YYYY-MM-DD') => {
          const d = new Date(date)
          if (format === 'YYYY-MM-DD') {
            return d.toISOString().split('T')[0]
          }
          return d.toISOString()
        }
      }

      // Replace variable references in formula
      let processedFormula = formula
      Object.keys(safeContext).forEach(key => {
        const regex = new RegExp(`\\b${key}\\b`, 'g')
        processedFormula = processedFormula.replace(regex, `safeContext.${key}`)
      })

      // Evaluate the formula
      const result = new Function('safeContext', `return ${processedFormula}`)(safeContext)

      return {
        success: true,
        value: result,
        metadata: { formula: processedFormula, variables: safeContext }
      }
    } catch (error) {
      return {
        success: false,
        value: null,
        error: error instanceof Error ? error.message : 'Formula evaluation failed'
      }
    }
  }

  // Lookup Engine
  const performLookup = (lookupConfig: any, searchValue: any): TransformationResult => {
    try {
      const { tableName, keyField, valueField, defaultValue } = lookupConfig

      const table = lookupTables.find(t => t.name === tableName)
      if (!table) {
        return {
          success: false,
          value: defaultValue || null,
          error: `Lookup table '${tableName}' not found`
        }
      }

      const match = table.data.find((row: any) => row[keyField] == searchValue)
      const result = match ? match[valueField] : (defaultValue || null)

      return {
        success: true,
        value: result,
        metadata: { tableName, keyField, valueField, found: !!match }
      }
    } catch (error) {
      return {
        success: false,
        value: null,
        error: error instanceof Error ? error.message : 'Lookup failed'
      }
    }
  }

  // Conditional Engine
  const evaluateCondition = (conditionConfig: any, variables: Record<string, any>): TransformationResult => {
    try {
      const { condition, thenValue, elseValue } = conditionConfig
      const { sourceValue, rowData = {} } = variables

      // Create evaluation context
      const evalContext = {
        value: sourceValue,
        ...rowData,
        // Add comparison operators
        EQ: (a: any, b: any) => a == b,
        NEQ: (a: any, b: any) => a != b,
        GT: (a: any, b: any) => a > b,
        LT: (a: any, b: any) => a < b,
        GTE: (a: any, b: any) => a >= b,
        LTE: (a: any, b: any) => a <= b,
        CONTAINS: (str: string, substr: string) => str?.toString().includes(substr),
        STARTS_WITH: (str: string, prefix: string) => str?.toString().startsWith(prefix),
        ENDS_WITH: (str: string, suffix: string) => str?.toString().endsWith(suffix),
        IS_NULL: (val: any) => val === null || val === undefined,
        IS_EMPTY: (val: any) => !val || val.toString().trim() === ''
      }

      // Evaluate condition
      const conditionResult = new Function('context', `return ${condition}`)(evalContext)

      // Return appropriate value
      const result = conditionResult ? thenValue : elseValue

      return {
        success: true,
        value: result,
        metadata: { condition, conditionResult, thenValue, elseValue }
      }
    } catch (error) {
      return {
        success: false,
        value: null,
        error: error instanceof Error ? error.message : 'Condition evaluation failed'
      }
    }
  }

  // JavaScript Engine
  const executeJavaScript = (code: string, variables: Record<string, any>): TransformationResult => {
    try {
      const { sourceValue, rowData = {} } = variables

      // Create execution context
      const executionContext = {
        value: sourceValue,
        ...rowData,
        console: { log: (...args: any[]) => console.log('[Transform JS]', ...args) }
      }

      // Execute the code
      const result = new Function('context', code)(executionContext)

      return {
        success: true,
        value: result,
        metadata: { code, executed: true }
      }
    } catch (error) {
      return {
        success: false,
        value: null,
        error: error instanceof Error ? error.message : 'JavaScript execution failed'
      }
    }
  }

  // Main transformation executor
  const executeTransformation = (
    type: string,
    config: any,
    context: TransformationContext
  ): TransformationResult => {
    const variables = {
      sourceValue: context.sourceValue,
      rowData: context.rowData || {}
    }

    switch (type) {
      case 'formula':
        return evaluateFormula(config.formula || '', variables)

      case 'lookup':
        return performLookup(config, context.sourceValue)

      case 'conditional':
        return evaluateCondition(config, variables)

      case 'javascript':
        return executeJavaScript(config.code || '', variables)

      default:
        return {
          success: false,
          value: context.sourceValue,
          error: `Unknown transformation type: ${type}`
        }
    }
  }

  // Test transformation
  const testTransformation = () => {
    if (!testValue.trim()) {
      message.warning('Please enter a test value')
      return
    }

    const testContext: TransformationContext = {
      sourceValue: testValue,
      targetField: 'test',
      sourceField: 'test',
      rowData: {},
      lookupTables: lookupTables.reduce((acc, table) => {
        acc[table.name] = table.data
        return acc
      }, {} as Record<string, any[]>)
    }

    const result = executeTransformation(transformationType, config, testContext)
    setTestResult(result)

    if (result.success) {
      message.success('Transformation executed successfully')
    } else {
      message.error(`Transformation failed: ${result.error}`)
    }
  }

  // Handle transformation change
  const handleTransformationChange = (type: string, newConfig: any) => {
    setTransformationType(type as any)
    setConfig(newConfig)

    // Auto-test if we have a test value
    if (testValue.trim()) {
      const testContext: TransformationContext = {
        sourceValue: testValue,
        targetField: 'test',
        sourceField: 'test',
        rowData: {}
      }
      const result = executeTransformation(type, newConfig, testContext)
      setTestResult(result)
    }

    // Notify parent
    if (onChange) {
      onChange({
        success: true,
        value: { type, config: newConfig },
        metadata: { transformationType: type, config: newConfig }
      })
    }
  }

  if (mode === 'inline') {
    return (
      <Space direction="vertical" style={{ width: '100%' }}>
        <Select
          value={transformationType}
          onChange={(value) => setTransformationType(value)}
          style={{ width: 150 }}
        >
          <Option value="formula">Formula</Option>
          <Option value="lookup">Lookup</Option>
          <Option value="conditional">Conditional</Option>
          <Option value="javascript">JavaScript</Option>
        </Select>

        {transformationType === 'formula' && (
          <Input
            placeholder="e.g., value * 1.1 + 5"
            value={config.formula || ''}
            onChange={(e) => handleTransformationChange('formula', { ...config, formula: e.target.value })}
          />
        )}

        {transformationType === 'lookup' && (
          <Space>
            <Select
              placeholder="Select table"
              value={config.tableName}
              onChange={(value) => handleTransformationChange('lookup', { ...config, tableName: value })}
              style={{ width: 150 }}
            >
              {lookupTables.map(table => (
                <Option key={table.id} value={table.name}>{table.name}</Option>
              ))}
            </Select>
            <Input
              placeholder="Key field"
              value={config.keyField || ''}
              onChange={(e) => handleTransformationChange('lookup', { ...config, keyField: e.target.value })}
              style={{ width: 100 }}
            />
            <Input
              placeholder="Value field"
              value={config.valueField || ''}
              onChange={(e) => handleTransformationChange('lookup', { ...config, valueField: e.target.value })}
              style={{ width: 100 }}
            />
          </Space>
        )}

        {transformationType === 'conditional' && (
          <Space>
            <Input
              placeholder="condition"
              value={config.condition || ''}
              onChange={(e) => handleTransformationChange('conditional', { ...config, condition: e.target.value })}
              style={{ width: 150 }}
            />
            <Input
              placeholder="then"
              value={config.thenValue || ''}
              onChange={(e) => handleTransformationChange('conditional', { ...config, thenValue: e.target.value })}
              style={{ width: 100 }}
            />
            <Input
              placeholder="else"
              value={config.elseValue || ''}
              onChange={(e) => handleTransformationChange('conditional', { ...config, elseValue: e.target.value })}
              style={{ width: 100 }}
            />
          </Space>
        )}

        {transformationType === 'javascript' && (
          <TextArea
            placeholder="return value ? value.toUpperCase() : ''"
            value={config.code || ''}
            onChange={(e) => handleTransformationChange('javascript', { ...config, code: e.target.value })}
            rows={2}
          />
        )}
      </Space>
    )
  }

  return (
    <div className="transformation-engine">
      <Card title="Advanced Transformation Engine" size="small">
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          {/* Transformation Type Selector */}
          <div>
            <Text strong>Transformation Type:</Text>
            <Select
              value={transformationType}
              onChange={(value) => setTransformationType(value)}
              style={{ width: 200, marginLeft: 8 }}
            >
              <Option value="formula">
                <Space>
                  <CalculatorOutlined />
                  Formula
                </Space>
              </Option>
              <Option value="lookup">
                <Space>
                  <DatabaseOutlined />
                  Lookup Table
                </Space>
              </Option>
              <Option value="conditional">
                <Space>
                  <BranchesOutlined />
                  Conditional
                </Space>
              </Option>
              <Option value="javascript">
                <Space>
                  <CodeOutlined />
                  JavaScript
                </Space>
              </Option>
            </Select>
          </div>

          {/* Transformation Configuration */}
          {transformationType === 'formula' && (
            <Card size="small" title="Formula Configuration">
              <Space direction="vertical" style={{ width: '100%' }}>
                <Alert
                  message="Formula Syntax"
                  description="Use 'value' for the source field value. Available functions: UPPER(), LOWER(), TRIM(), CONCAT(), ROUND(), IF(), DATE(), FORMAT_DATE()"
                  type="info"
                  showIcon
                />
                <TextArea
                  placeholder="e.g., UPPER(TRIM(value)) or value * 1.1 + ROUND(shipping, 2)"
                  value={config.formula || ''}
                  onChange={(e) => setConfig({ ...config, formula: e.target.value })}
                  rows={3}
                />
              </Space>
            </Card>
          )}

          {transformationType === 'lookup' && (
            <Card size="small" title="Lookup Configuration">
              <Row gutter={16}>
                <Col span={8}>
                  <Text strong>Lookup Table:</Text>
                  <Select
                    placeholder="Select table"
                    value={config.tableName}
                    onChange={(value) => setConfig({ ...config, tableName: value })}
                    style={{ width: '100%', marginTop: 8 }}
                  >
                    {lookupTables.map(table => (
                      <Option key={table.id} value={table.name}>{table.name}</Option>
                    ))}
                  </Select>
                </Col>
                <Col span={8}>
                  <Text strong>Key Field:</Text>
                  <Input
                    placeholder="field name"
                    value={config.keyField || ''}
                    onChange={(e) => setConfig({ ...config, keyField: e.target.value })}
                    style={{ marginTop: 8 }}
                  />
                </Col>
                <Col span={8}>
                  <Text strong>Value Field:</Text>
                  <Input
                    placeholder="field name"
                    value={config.valueField || ''}
                    onChange={(e) => setConfig({ ...config, valueField: e.target.value })}
                    style={{ marginTop: 8 }}
                  />
                </Col>
              </Row>
            </Card>
          )}

          {transformationType === 'conditional' && (
            <Card size="small" title="Conditional Configuration">
              <Space direction="vertical" style={{ width: '100%' }}>
                <Alert
                  message="Condition Syntax"
                  description="Use comparison functions: EQ(), NEQ(), GT(), LT(), CONTAINS(), IS_NULL(), etc."
                  type="info"
                  showIcon
                />
                <Row gutter={16}>
                  <Col span={24}>
                    <Text strong>Condition:</Text>
                    <Input
                      placeholder="e.g., GT(value, 100) or CONTAINS(value, 'test')"
                      value={config.condition || ''}
                      onChange={(e) => setConfig({ ...config, condition: e.target.value })}
                      style={{ marginTop: 8 }}
                    />
                  </Col>
                </Row>
                <Row gutter={16}>
                  <Col span={12}>
                    <Text strong>Then Value:</Text>
                    <Input
                      placeholder="value if true"
                      value={config.thenValue || ''}
                      onChange={(e) => setConfig({ ...config, thenValue: e.target.value })}
                      style={{ marginTop: 8 }}
                    />
                  </Col>
                  <Col span={12}>
                    <Text strong>Else Value:</Text>
                    <Input
                      placeholder="value if false"
                      value={config.elseValue || ''}
                      onChange={(e) => setConfig({ ...config, elseValue: e.target.value })}
                      style={{ marginTop: 8 }}
                    />
                  </Col>
                </Row>
              </Space>
            </Card>
          )}

          {transformationType === 'javascript' && (
            <Card size="small" title="JavaScript Configuration">
              <Space direction="vertical" style={{ width: '100%' }}>
                <Alert
                  message="JavaScript Code"
                  description="Write custom JavaScript code. Use 'context.value' for the source value and return the transformed result."
                  type="warning"
                  showIcon
                />
                <TextArea
                  placeholder={`// Example: Custom transformation
if (context.value) {
  return context.value.toString().toUpperCase();
}
return context.value;`}
                  value={config.code || ''}
                  onChange={(e) => setConfig({ ...config, code: e.target.value })}
                  rows={6}
                  style={{ fontFamily: 'monospace' }}
                />
              </Space>
            </Card>
          )}

          {/* Test Section */}
          <Card size="small" title="Test Transformation">
            <Space direction="vertical" style={{ width: '100%' }}>
              <Row gutter={16} align="middle">
                <Col span={18}>
                  <Text strong>Test Input:</Text>
                  <Input
                    placeholder="Enter test value"
                    value={testValue}
                    onChange={(e) => setTestValue(e.target.value)}
                    style={{ marginTop: 8 }}
                  />
                </Col>
                <Col span={6}>
                  <Button
                    type="primary"
                    icon={<PlayCircleOutlined />}
                    onClick={testTransformation}
                    loading={loading}
                    block
                  >
                    Test
                  </Button>
                </Col>
              </Row>

              {testResult && (
                <div>
                  <Divider />
                  <Text strong>Test Result:</Text>
                  <div style={{ marginTop: 8 }}>
                    {testResult.success ? (
                      <Space>
                        <CheckCircleOutlined style={{ color: '#52c41a' }} />
                        <Text>Success: </Text>
                        <Tag color="green">{JSON.stringify(testResult.value)}</Tag>
                      </Space>
                    ) : (
                      <Space>
                        <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />
                        <Text>Error: </Text>
                        <Tag color="red">{testResult.error}</Tag>
                      </Space>
                    )}
                  </div>
                </div>
              )}
            </Space>
          </Card>

          {/* Available Functions/Variables */}
          <Card size="small" title="Available Functions & Variables">
            <Tabs size="small">
              <TabPane tab="Variables" key="variables">
                <div style={{ fontFamily: 'monospace', fontSize: '12px' }}>
                  <div><strong>value</strong> - The source field value</div>
                  <div><strong>rowData</strong> - Complete row data object</div>
                </div>
              </TabPane>
              <TabPane tab="Functions" key="functions">
                <div style={{ fontFamily: 'monospace', fontSize: '12px' }}>
                  <div><strong>String:</strong> UPPER(), LOWER(), TRIM(), CONCAT()</div>
                  <div><strong>Math:</strong> ROUND(number, decimals)</div>
                  <div><strong>Logic:</strong> IF(condition, trueVal, falseVal)</div>
                  <div><strong>Date:</strong> DATE(string), FORMAT_DATE(date, format)</div>
                  <div><strong>Compare:</strong> EQ, NEQ, GT, LT, GTE, LTE</div>
                  <div><strong>Text:</strong> CONTAINS, STARTS_WITH, ENDS_WITH</div>
                  <div><strong>Null:</strong> IS_NULL, IS_EMPTY</div>
                </div>
              </TabPane>
            </Tabs>
          </Card>
        </Space>
      </Card>
    </div>
  )
}

// Export transformation executor for use in other components
export { executeTransformation }
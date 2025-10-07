/**
 * Test component for the Transformation Engine
 * Temporary component to verify functionality
 */

import React, { useState } from 'react';
import { Card, Button, Input, Typography, Space, Alert, Spin, Select, Tag } from 'antd';
import { transformationEngine } from '../lib/transformationEngine';
import { templateManager } from '../lib/transformationTemplates';
import { lookupTableManager } from '../lib/lookupTables';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

export default function TransformationEngineTest() {
  const [expression, setExpression] = useState('input.price * 1.1');
  const [inputData, setInputData] = useState('{"price": 100, "name": "Test Product"}');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [templates] = useState(() => templateManager.listTemplates());

  const runTest = async () => {
    setLoading(true);
    setError(null);

    try {
      let parsedInput;
      try {
        parsedInput = JSON.parse(inputData);
      } catch (e) {
        throw new Error('Invalid JSON input data');
      }

      const testResult = await transformationEngine.executeExpression(expression, {
        input: parsedInput
      });

      setResult(testResult);
    } catch (err: any) {
      setError(err.message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const runPresetTests = async () => {
    const tests = [
      {
        name: 'Simple Math',
        expression: 'input.price * 1.1',
        input: '{"price": 100}'
      },
      {
        name: 'String Manipulation',
        expression: 'upper(input.name) + " - " + toString(input.price)',
        input: '{"name": "widget", "price": 50}'
      },
      {
        name: 'Conditional Logic',
        expression: 'if(input.price > 100, "Expensive", "Cheap")',
        input: '{"price": 150}'
      },
      {
        name: 'Object Access',
        expression: 'get(input, "product.details.name", "Unknown")',
        input: '{"product": {"details": {"name": "Premium Widget"}}}'
      },
      {
        name: 'Array Operations',
        expression: 'length(input.tags)',
        input: '{"tags": ["electronics", "premium", "new"]}'
      }
    ];

    setLoading(true);
    const results: any[] = [];

    for (const test of tests) {
      try {
        const parsedInput = JSON.parse(test.input);
        const testResult = await transformationEngine.executeExpression(test.expression, {
          input: parsedInput
        });
        results.push({
          name: test.name,
          expression: test.expression,
          input: test.input,
          result: testResult
        });
      } catch (err: any) {
        results.push({
          name: test.name,
          expression: test.expression,
          input: test.input,
          result: { success: false, error: err.message }
        });
      }
    }

    setResult({ presetTests: results });
    setLoading(false);
  };

  const runTemplateTest = async () => {
    if (!selectedTemplate) {
      setError('Please select a template');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let parsedInput;
      try {
        parsedInput = JSON.parse(inputData);
      } catch (e) {
        throw new Error('Invalid JSON input data');
      }

      // Create a template instance
      const instance = templateManager.createInstance(selectedTemplate, {
        name: 'Test Instance',
        description: 'Temporary test instance'
      });

      // Execute the template
      const templateResult = await templateManager.executeInstance(instance.id, parsedInput);

      setResult({ templateTest: { instanceId: instance.id, result: templateResult } });
    } catch (err: any) {
      setError(err.message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <Title level={2}>🔧 Transformation Engine Test</Title>
      <Paragraph>
        Test the advanced transformation rule engine with JavaScript expressions.
        This engine supports safe evaluation with built-in functions for data transformation.
      </Paragraph>

      <Space direction="vertical" style={{ width: '100%' }} size="large">
        {/* Expression Input */}
        <Card title="Expression" size="small">
          <Space direction="vertical" style={{ width: '100%' }}>
            <Text strong>Enter a JavaScript expression:</Text>
            <TextArea
              value={expression}
              onChange={(e) => setExpression(e.target.value)}
              placeholder="e.g., input.price * 1.1"
              rows={3}
            />
            <Text type="secondary">
              Available: input (your data), built-in functions like upper(), lower(), round(), if(), get(), etc.
            </Text>
          </Space>
        </Card>

        {/* Input Data */}
        <Card title="Input Data (JSON)" size="small">
          <Space direction="vertical" style={{ width: '100%' }}>
            <Text strong>Enter JSON input data:</Text>
            <TextArea
              value={inputData}
              onChange={(e) => setInputData(e.target.value)}
              placeholder='{"price": 100, "name": "Test"}'
              rows={4}
            />
          </Space>
        </Card>

        {/* Action Buttons */}
        <Card size="small">
          <Space>
            <Button type="primary" onClick={runTest} loading={loading}>
              Run Expression
            </Button>
            <Button onClick={runPresetTests} loading={loading}>
              Run Preset Tests
            </Button>
          </Space>
        </Card>

        {/* Template Testing */}
        <Card title="Template Testing" size="small">
          <Space direction="vertical" style={{ width: '100%' }}>
            <div>
              <Text strong>Select a transformation template:</Text>
              <Select
                value={selectedTemplate}
                onChange={setSelectedTemplate}
                style={{ width: '100%', marginTop: '8px' }}
                placeholder="Choose a template..."
              >
                {templates.map(template => (
                  <Select.Option key={template.id} value={template.id}>
                    {template.name} - {template.description}
                  </Select.Option>
                ))}
              </Select>
            </div>
            <Button
              type="primary"
              onClick={runTemplateTest}
              loading={loading}
              disabled={!selectedTemplate}
            >
              Test Template
            </Button>
          </Space>
        </Card>

        {/* Lookup Table Testing */}
        <Card title="Lookup Table Testing" size="small">
          <Space direction="vertical" style={{ width: '100%' }}>
            <div>
              <Text strong>Available Lookup Tables:</Text>
              <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {lookupTableManager.listTables().map(table => (
                  <Tag key={table.id} color="blue">
                    {table.name} ({lookupTableManager.getTableStats(table.id)?.entryCount || 0} entries)
                  </Tag>
                ))}
              </div>
            </div>
            <div>
              <Text strong>Test lookup functions:</Text>
              <div style={{ marginTop: '8px' }}>
                <Text code>lookup('currency-codes', 'USD')</Text> - Get currency symbol<br/>
                <Text code>lookup('country-codes', 'US')</Text> - Get country name<br/>
                <Text code>convertUnit(10, 'lb', 'kg')</Text> - Convert units<br/>
                <Text code>convertCurrency(100, 'USD', 'EUR')</Text> - Convert currency
              </div>
            </div>
          </Space>
        </Card>

        {/* Results */}
        {error && (
          <Alert
            message="Error"
            description={error}
            type="error"
            showIcon
            closable
          />
        )}

        {result && !result.presetTests && (
          <Card title="Result" size="small">
            <Space direction="vertical" style={{ width: '100%' }}>
              <div>
                <Text strong>Success:</Text> <Text type={result.success ? 'success' : 'danger'}>{result.success ? 'Yes' : 'No'}</Text>
              </div>
              <div>
                <Text strong>Execution Time:</Text> <Text>{result.executionTime}ms</Text>
              </div>
              {result.error && (
                <div>
                  <Text strong>Error:</Text> <Text type="danger">{result.error}</Text>
                </div>
              )}
              <div>
                <Text strong>Output:</Text>
                <pre style={{
                  background: '#f5f5f5',
                  padding: '8px',
                  borderRadius: '4px',
                  marginTop: '8px',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word'
                }}>
                  {JSON.stringify(result.output, null, 2)}
                </pre>
              </div>
            </Space>
          </Card>
        )}

        {result && result.presetTests && (
          <Card title="Preset Test Results" size="small">
            <Space direction="vertical" style={{ width: '100%' }}>
              {result.presetTests.map((test: any, index: number) => (
                <Card key={index} size="small" style={{ marginBottom: '8px' }}>
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Text strong>{test.name}</Text>
                    <Text code>{test.expression}</Text>
                    <Text type="secondary">Input: {test.input}</Text>
                    <div>
                      <Text strong>Result:</Text>{' '}
                      <Text type={test.result.success ? 'success' : 'danger'}>
                        {test.result.success ? 'PASS' : 'FAIL'}
                      </Text>
                      {test.result.error && (
                        <Text type="danger"> - {test.result.error}</Text>
                      )}
                    </div>
                    {!test.result.error && (
                      <Text>Output: {JSON.stringify(test.result.output)}</Text>
                    )}
                  </Space>
                </Card>
              ))}
            </Space>
          </Card>
        )}

        {result && result.templateTest && (
          <Card title="Template Test Result" size="small">
            <Space direction="vertical" style={{ width: '100%' }}>
              <Text>Instance ID: <Text code>{result.templateTest.instanceId}</Text></Text>
              <Text strong>Transformation Results:</Text>
              <pre style={{
                background: '#f5f5f5',
                padding: '8px',
                borderRadius: '4px',
                marginTop: '8px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: '400px',
                overflow: 'auto'
              }}>
                {JSON.stringify(result.templateTest.result, null, 2)}
              </pre>
            </Space>
          </Card>
        )}

        {/* Built-in Functions Reference */}
        <Card title="📚 Built-in Functions Reference" size="small">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
            <div>
              <Text strong>String Functions:</Text>
              <ul style={{ marginTop: '8px' }}>
                <li><Text code>upper(str)</Text> - Convert to uppercase</li>
                <li><Text code>lower(str)</Text> - Convert to lowercase</li>
                <li><Text code>trim(str)</Text> - Remove whitespace</li>
                <li><Text code>substring(str, start, end)</Text> - Extract substring</li>
                <li><Text code>replace(str, search, replace)</Text> - Replace text</li>
              </ul>
            </div>

            <div>
              <Text strong>Math Functions:</Text>
              <ul style={{ marginTop: '8px' }}>
                <li><Text code>round(num, decimals)</Text> - Round number</li>
                <li><Text code>floor(num)</Text> - Floor number</li>
                <li><Text code>ceil(num)</Text> - Ceiling number</li>
                <li><Text code>min(...nums)</Text> - Minimum value</li>
                <li><Text code>max(...nums)</Text> - Maximum value</li>
              </ul>
            </div>

            <div>
              <Text strong>Array/Object Functions:</Text>
              <ul style={{ marginTop: '8px' }}>
                <li><Text code>length(arr)</Text> - Array length</li>
                <li><Text code>get(obj, path, default)</Text> - Get nested property</li>
                <li><Text code>map(arr, fn)</Text> - Transform array</li>
                <li><Text code>filter(arr, fn)</Text> - Filter array</li>
              </ul>
            </div>

            <div>
              <Text strong>Conditional Functions:</Text>
              <ul style={{ marginTop: '8px' }}>
                <li><Text code>if(condition, trueVal, falseVal)</Text> - Conditional</li>
                <li><Text code>coalesce(...values)</Text> - First non-null value</li>
                <li><Text code>isEmpty(value)</Text> - Check if empty</li>
              </ul>
            </div>
          </div>
        </Card>
      </Space>
    </div>
  );
}
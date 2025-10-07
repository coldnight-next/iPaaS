/**
 * Tests for the Transformation Rule Engine
 */

import { ExpressionEvaluator, TransformationRuleEngine, transformationEngine } from './transformationEngine';

describe('ExpressionEvaluator', () => {
  let evaluator: ExpressionEvaluator;

  beforeEach(() => {
    evaluator = new ExpressionEvaluator();
  });

  test('should evaluate simple expressions', async () => {
    const result = await evaluator.evaluate('1 + 2');
    expect(result.success).toBe(true);
    expect(result.output).toBe(3);
  });

  test('should evaluate expressions with input data', async () => {
    const result = await evaluator.evaluate('input.price * 1.1', { price: 100 });
    expect(result.success).toBe(true);
    expect(result.output).toBe(110);
  });

  test('should use built-in functions', async () => {
    const result = await evaluator.evaluate('upper("hello")');
    expect(result.success).toBe(true);
    expect(result.output).toBe('HELLO');
  });

  test('should handle string operations', async () => {
    const result = await evaluator.evaluate('trim("  hello world  ")');
    expect(result.success).toBe(true);
    expect(result.output).toBe('hello world');
  });

  test('should handle array operations', async () => {
    const result = await evaluator.evaluate('length([1, 2, 3, 4])');
    expect(result.success).toBe(true);
    expect(result.output).toBe(4);
  });

  test('should handle object operations', async () => {
    const result = await evaluator.evaluate('get(input, "user.name", "default")', { user: { name: 'John' } });
    expect(result.success).toBe(true);
    expect(result.output).toBe('John');
  });

  test('should handle conditional logic', async () => {
    const result = await evaluator.evaluate('if(input.price > 100, "expensive", "cheap")', { price: 150 });
    expect(result.success).toBe(true);
    expect(result.output).toBe('expensive');
  });

  test('should handle errors gracefully', async () => {
    const result = await evaluator.evaluate('invalidFunction()');
    expect(result.success).toBe(false);
    expect(result.error).toContain('evaluation failed');
  });

  test('should handle timeout', async () => {
    evaluator.setTimeout(1); // Very short timeout
    const result = await evaluator.evaluate('new Promise(resolve => setTimeout(resolve, 10))');
    expect(result.success).toBe(false);
    expect(result.error).toContain('timeout');
  });
});

describe('TransformationRuleEngine', () => {
  let engine: TransformationRuleEngine;

  beforeEach(() => {
    engine = new TransformationRuleEngine();
  });

  test('should register and execute rules', async () => {
    const rule = {
      id: 'test-rule',
      name: 'Test Rule',
      expression: 'input.value * 2',
      description: 'Double the input value'
    };

    engine.registerRule(rule);

    const result = await engine.executeRule('test-rule', { input: { value: 5 } });

    expect(result.success).toBe(true);
    expect(result.output).toBe(10);
  });

  test('should handle unregistered rules', async () => {
    const result = await engine.executeRule('non-existent-rule', { input: {} });

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  test('should execute one-off expressions', async () => {
    const result = await engine.executeExpression('input.a + input.b', { input: { a: 3, b: 4 } });

    expect(result.success).toBe(true);
    expect(result.output).toBe(7);
  });

  test('should validate expressions', async () => {
    const validResult = await engine.validateExpression('1 + 2');
    expect(validResult.valid).toBe(true);

    const invalidResult = await engine.validateExpression('invalid syntax +++');
    expect(invalidResult.valid).toBe(false);
  });

  test('should support custom functions', async () => {
    engine.addCustomFunction('customAdd', (a: number, b: number) => a + b);

    const result = await engine.executeExpression('customAdd(5, 3)');
    expect(result.success).toBe(true);
    expect(result.output).toBe(8);
  });
});

// Integration tests with real-world scenarios
describe('Real-world Transformation Scenarios', () => {
  test('should transform NetSuite product to Shopify format', async () => {
    const netsuiteProduct = {
      internalId: '12345',
      itemId: 'PROD-001',
      displayName: 'Premium Widget',
      salesDescription: 'A high-quality widget',
      basePrice: 99.99,
      currency: 'USD',
      isInactive: false,
      lastModifiedDate: '2024-01-15T10:30:00Z'
    };

    const expression = `
      {
        title: input.displayName,
        body_html: input.salesDescription,
        vendor: 'NetSuite',
        product_type: 'Widget',
        variants: [{
          sku: input.itemId,
          price: round(input.basePrice, 2),
          compare_at_price: null,
          inventory_quantity: 100
        }],
        status: if(input.isInactive, 'draft', 'active'),
        tags: ['netsuite', 'imported'],
        metafields: [{
          key: 'netsuite_id',
          value: input.internalId,
          type: 'single_line_text_field'
        }]
      }
    `;

    const result = await transformationEngine.executeExpression(expression, { input: netsuiteProduct });

    expect(result.success).toBe(true);
    expect(result.output.title).toBe('Premium Widget');
    expect(result.output.variants[0].price).toBe(99.99);
    expect(result.output.status).toBe('active');
  });

  test('should handle currency conversion', async () => {
    const expression = `
      {
        originalPrice: input.price,
        usdPrice: round(input.price * 0.85, 2), // EUR to USD conversion
        eurPrice: input.price,
        discountPercentage: 10,
        finalPrice: round(input.price * 0.85 * 0.9, 2)
      }
    `;

    const result = await transformationEngine.executeExpression(expression, { input: { price: 100 } });

    expect(result.success).toBe(true);
    expect(result.output.usdPrice).toBe(85);
    expect(result.output.finalPrice).toBe(76.5);
  });

  test('should handle complex conditional logic', async () => {
    const expression = `
      {
        category: switch(input.productType, {
          'electronics': 'Electronics',
          'clothing': 'Fashion',
          'books': 'Media'
        }, 'General'),
        priority: if(input.price > 1000, 'high',
                   if(input.price > 100, 'medium', 'low')),
        tags: input.tags.concat(
          if(input.price > 500, ['premium'], [])
        )
      }
    `;

    const result = await transformationEngine.executeExpression(expression, {
      input: {
        productType: 'electronics',
        price: 150,
        tags: ['new']
      }
    });

    expect(result.success).toBe(true);
    expect(result.output.category).toBe('Electronics');
    expect(result.output.priority).toBe('medium');
    expect(result.output.tags).toEqual(['new']);
  });
});
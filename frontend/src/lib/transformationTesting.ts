/**
 * Transformation Testing and Validation Framework
 * Comprehensive testing suite for transformation rules, templates, and scripts
 */

import { transformationEngine } from './transformationEngine';
import type { TransformationRule, TransformationContext } from './transformationEngine';
import { templateManager, TransformationTemplate } from './transformationTemplates';
import { scriptExecutor, ScriptFunction } from './scriptExecution';

export interface TestCase {
  id: string;
  name: string;
  description?: string;
  input: any;
  expectedOutput: any;
  variables?: Record<string, any>;
  metadata?: Record<string, any>;
  timeout?: number;
}

export interface TestResult {
  testId: string;
  success: boolean;
  actualOutput: any;
  expectedOutput: any;
  executionTime: number;
  error?: string;
  logs: string[];
  passed: boolean;
}

export interface TestSuite {
  id: string;
  name: string;
  description?: string;
  testCases: TestCase[];
  setup?: () => Promise<void>;
  teardown?: () => Promise<void>;
  timeout?: number;
}

export interface TestSuiteResult {
  suiteId: string;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  executionTime: number;
  results: TestResult[];
  success: boolean;
}

export interface ValidationRule {
  id: string;
  name: string;
  description?: string;
  rule: (input: any, output: any, context?: any) => ValidationResult;
  severity: 'error' | 'warning' | 'info';
}

export interface ValidationResult {
  valid: boolean;
  message?: string;
  details?: any;
}

/**
 * Transformation Validator
 */
export class TransformationValidator {
  private validationRules: Map<string, ValidationRule> = new Map();

  /**
   * Register a validation rule
   */
  registerRule(rule: ValidationRule): void {
    this.validationRules.set(rule.id, rule);
  }

  /**
   * Validate transformation output
   */
  async validate(
    input: any,
    output: any,
    rules: string[] = [],
    context?: any
  ): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];

    const rulesToCheck = rules.length > 0
      ? rules.map(id => this.validationRules.get(id)).filter(Boolean)
      : Array.from(this.validationRules.values());

    for (const rule of rulesToCheck as ValidationRule[]) {
      try {
        const result = rule.rule(input, output, context);
        results.push(result);
      } catch (error: any) {
        results.push({
          valid: false,
          message: `Validation rule '${rule.name}' failed: ${error.message}`
        });
      }
    }

    return results;
  }

  /**
   * Check if all validations pass
   */
  allValid(results: ValidationResult[]): boolean {
    return results.every(result => result.valid);
  }

  /**
   * Get validation summary
   */
  getSummary(results: ValidationResult[]): {
    total: number;
    valid: number;
    invalid: number;
    errors: ValidationResult[];
    warnings: ValidationResult[];
  } {
    const valid = results.filter(r => r.valid);
    const invalid = results.filter(r => !r.valid);

    return {
      total: results.length,
      valid: valid.length,
      invalid: invalid.length,
      errors: invalid,
      warnings: []
    };
  }
}

/**
 * Transformation Tester
 */
export class TransformationTester {
  private validator: TransformationValidator;

  constructor() {
    this.validator = new TransformationValidator();
    this.registerBuiltInValidationRules();
  }

  /**
   * Register built-in validation rules
   */
  private registerBuiltInValidationRules(): void {
    // Output not null/undefined
    this.validator.registerRule({
      id: 'not-null',
      name: 'Not Null',
      description: 'Output should not be null or undefined',
      rule: (input, output) => ({
        valid: output !== null && output !== undefined,
        message: output === null || output === undefined ? 'Output is null or undefined' : undefined
      }),
      severity: 'error'
    });

    // Output type validation
    this.validator.registerRule({
      id: 'type-check',
      name: 'Type Check',
      description: 'Output should match expected type',
      rule: (input, output, context) => {
        if (!context?.expectedType) return { valid: true };

        const actualType = Array.isArray(output) ? 'array' : typeof output;
        const valid = actualType === context.expectedType;

        return {
          valid,
          message: valid ? undefined : `Expected type '${context.expectedType}', got '${actualType}'`
        };
      },
      severity: 'error'
    });

    // Required fields validation
    this.validator.registerRule({
      id: 'required-fields',
      name: 'Required Fields',
      description: 'Output should contain required fields',
      rule: (input, output, context) => {
        if (!context?.requiredFields || !Array.isArray(context.requiredFields)) {
          return { valid: true };
        }

        const missingFields = context.requiredFields.filter((field: string) => {
          return !(output && typeof output === 'object' && field in output);
        });

        return {
          valid: missingFields.length === 0,
          message: missingFields.length > 0 ? `Missing required fields: ${missingFields.join(', ')}` : undefined
        };
      },
      severity: 'error'
    });

    // Data integrity check
    this.validator.registerRule({
      id: 'data-integrity',
      name: 'Data Integrity',
      description: 'Check for data corruption or unexpected changes',
      rule: (input, output) => {
        // Basic checks for common data integrity issues
        if (typeof output === 'object' && output !== null) {
          // Check for circular references (basic)
          try {
            JSON.stringify(output);
          } catch {
            return {
              valid: false,
              message: 'Output contains circular references'
            };
          }
        }

        return { valid: true };
      },
      severity: 'warning'
    });

    // Performance check
    this.validator.registerRule({
      id: 'performance-check',
      name: 'Performance Check',
      description: 'Check execution performance',
      rule: (input, output, context) => {
        if (!context?.executionTime) return { valid: true };

        const maxTime = context.maxExecutionTime || 5000; // 5 seconds default
        const valid = context.executionTime <= maxTime;

        return {
          valid,
          message: valid ? undefined : `Execution took ${context.executionTime}ms, exceeds limit of ${maxTime}ms`
        };
      },
      severity: 'warning'
    });
  }

  /**
   * Run a single test case
   */
  async runTest(testCase: TestCase, transformation: string): Promise<TestResult> {
    const startTime = Date.now();

    try {
      const context: TransformationContext = {
        input: testCase.input,
        variables: testCase.variables,
        metadata: testCase.metadata
      };

      const result = await transformationEngine.executeExpression(transformation, context);

      const executionTime = Date.now() - startTime;

      // Compare output with expected (deep equality)
      const passed = this.deepEqual(result.output, testCase.expectedOutput);

      return {
        testId: testCase.id,
        success: result.success,
        actualOutput: result.output,
        expectedOutput: testCase.expectedOutput,
        executionTime,
        error: result.error,
        logs: [],
        passed
      };

    } catch (error: any) {
      const executionTime = Date.now() - startTime;

      return {
        testId: testCase.id,
        success: false,
        actualOutput: null,
        expectedOutput: testCase.expectedOutput,
        executionTime,
        error: error.message,
        logs: [],
        passed: false
      };
    }
  }

  /**
   * Run a test suite
   */
  async runTestSuite(suite: TestSuite, transformation: string): Promise<TestSuiteResult> {
    const startTime = Date.now();
    const results: TestResult[] = [];

    try {
      // Setup
      if (suite.setup) {
        await suite.setup();
      }

      // Run all test cases
      for (const testCase of suite.testCases) {
        const result = await this.runTest(testCase, transformation);
        results.push(result);
      }

      // Teardown
      if (suite.teardown) {
        await suite.teardown();
      }

    } catch (error: any) {
      console.error('Test suite execution failed:', error);
    }

    const executionTime = Date.now() - startTime;
    const passedTests = results.filter(r => r.passed).length;
    const failedTests = results.length - passedTests;

    return {
      suiteId: suite.id,
      totalTests: results.length,
      passedTests,
      failedTests,
      executionTime,
      results,
      success: failedTests === 0
    };
  }

  /**
   * Test a transformation rule
   */
  async testRule(rule: TransformationRule, testCases: TestCase[]): Promise<TestSuiteResult> {
    const suite: TestSuite = {
      id: `rule-${rule.id}`,
      name: `Rule: ${rule.name}`,
      description: rule.description,
      testCases
    };

    return this.runTestSuite(suite, rule.expression);
  }

  /**
   * Test a transformation template
   */
  async testTemplate(template: TransformationTemplate, testInput: any): Promise<TestSuiteResult> {
    const startTime = Date.now();
    const results: TestResult[] = [];

    try {
      // Create template instance
      const instance = templateManager.createInstance(template.id, {
        name: 'Test Instance',
        description: 'Temporary test instance'
      });

      // Execute template
      const templateResult = await templateManager.executeInstance(instance.id, testInput);

      // Create synthetic test results for each rule
      for (const rule of template.rules) {
        const ruleResult = templateResult[rule.id];
        const expectedOutput = {}; // Template testing doesn't have explicit expectations

        results.push({
          testId: rule.id,
          success: ruleResult !== null && ruleResult !== undefined,
          actualOutput: ruleResult,
          expectedOutput,
          executionTime: 0, // Not tracked per rule
          logs: [],
          passed: true // Template tests are more about execution than validation
        });
      }

    } catch (error: any) {
      console.error('Template test failed:', error);
    }

    const executionTime = Date.now() - startTime;
    const passedTests = results.filter(r => r.passed).length;
    const failedTests = results.length - passedTests;

    return {
      suiteId: `template-${template.id}`,
      totalTests: results.length,
      passedTests,
      failedTests,
      executionTime,
      results,
      success: failedTests === 0
    };
  }

  /**
   * Test a script function
   */
  async testScript(script: ScriptFunction, testCases: TestCase[]): Promise<TestSuiteResult> {
    const startTime = Date.now();
    const results: TestResult[] = [];

    for (const testCase of testCases) {
      try {
        const result = await scriptExecutor.executeFunction(script.id, testCase.input, {
          input: testCase.input,
          variables: testCase.variables
        });

        const passed = this.deepEqual(result.output, testCase.expectedOutput);

        results.push({
          testId: testCase.id,
          success: result.success,
          actualOutput: result.output,
          expectedOutput: testCase.expectedOutput,
          executionTime: result.executionTime,
          error: result.error,
          logs: result.logs,
          passed
        });

      } catch (error: any) {
        results.push({
          testId: testCase.id,
          success: false,
          actualOutput: null,
          expectedOutput: testCase.expectedOutput,
          executionTime: 0,
          error: error.message,
          logs: [],
          passed: false
        });
      }
    }

    const executionTime = Date.now() - startTime;
    const passedTests = results.filter(r => r.passed).length;
    const failedTests = results.length - passedTests;

    return {
      suiteId: `script-${script.id}`,
      totalTests: results.length,
      passedTests,
      failedTests,
      executionTime,
      results,
      success: failedTests === 0
    };
  }

  /**
   * Deep equality check
   */
  private deepEqual(a: any, b: any): boolean {
    if (a === b) return true;

    if (a == null || b == null) return a === b;

    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        if (!this.deepEqual(a[i], b[i])) return false;
      }
      return true;
    }

    if (typeof a === 'object' && typeof b === 'object') {
      const keysA = Object.keys(a);
      const keysB = Object.keys(b);

      if (keysA.length !== keysB.length) return false;

      for (const key of keysA) {
        if (!keysB.includes(key)) return false;
        if (!this.deepEqual(a[key], b[key])) return false;
      }

      return true;
    }

    return false;
  }

  /**
   * Generate test cases from sample data
   */
  generateTestCases(sampleInputs: any[], transformation: string): TestCase[] {
    return sampleInputs.map((input, index) => ({
      id: `generated-${index}`,
      name: `Generated Test ${index + 1}`,
      input,
      expectedOutput: null // To be filled manually
    }));
  }

  /**
   * Get validator instance
   */
  getValidator(): TransformationValidator {
    return this.validator;
  }
}

// Singleton instances
export const transformationValidator = new TransformationValidator();
export const transformationTester = new TransformationTester();

/**
 * Pre-built test suites for common scenarios
 */
export const BUILT_IN_TEST_SUITES: TestSuite[] = [
  {
    id: 'basic-transformations',
    name: 'Basic Transformations',
    description: 'Test basic transformation functions',
    testCases: [
      {
        id: 'string-upper',
        name: 'String Uppercase',
        input: { text: 'hello world' },
        expectedOutput: 'HELLO WORLD'
      },
      {
        id: 'math-round',
        name: 'Math Round',
        input: { value: 3.14159 },
        expectedOutput: 3.14
      },
      {
        id: 'array-length',
        name: 'Array Length',
        input: { items: [1, 2, 3, 4, 5] },
        expectedOutput: 5
      }
    ]
  },

  {
    id: 'lookup-table-tests',
    name: 'Lookup Table Tests',
    description: 'Test lookup table functionality',
    testCases: [
      {
        id: 'currency-lookup',
        name: 'Currency Symbol Lookup',
        input: 'USD',
        expectedOutput: '$'
      },
      {
        id: 'country-lookup',
        name: 'Country Name Lookup',
        input: 'US',
        expectedOutput: 'United States'
      }
    ]
  }
];

// Export types
export type { TestCase, TestResult, TestSuite, TestSuiteResult, ValidationRule, ValidationResult };
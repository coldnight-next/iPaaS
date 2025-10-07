/**
 * Advanced Transformation Rule Engine
 * Supports safe JavaScript expression evaluation with built-in functions
 */

import { lookupTableManager } from './lookupTables';
import { scriptExecutor } from './scriptExecution';

export interface TransformationContext {
  input: any;
  variables?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface TransformationResult {
  success: boolean;
  output: any;
  error?: string;
  executionTime: number;
}

export interface TransformationRule {
  id: string;
  name: string;
  expression: string;
  description?: string;
  inputType?: string;
  outputType?: string;
  parameters?: Record<string, any>;
  timeout?: number;
  maxExecutionTime?: number;
}

/**
 * Built-in transformation functions library
 */
export const BUILT_IN_FUNCTIONS = {
  // String functions
  upper: (str: string) => str?.toUpperCase() || '',
  lower: (str: string) => str?.toLowerCase() || '',
  trim: (str: string) => str?.trim() || '',
  substring: (str: string, start: number, end?: number) => str?.substring(start, end) || '',
  replace: (str: string, search: string, replace: string) => str?.replace(new RegExp(search, 'g'), replace) || '',
  split: (str: string, separator: string) => str?.split(separator) || [],
  join: (arr: any[], separator: string = ',') => Array.isArray(arr) ? arr.join(separator) : '',

  // Math functions
  round: (num: number, decimals: number = 0) => Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals),
  floor: (num: number) => Math.floor(num),
  ceil: (num: number) => Math.ceil(num),
  abs: (num: number) => Math.abs(num),
  min: (...nums: number[]) => Math.min(...nums),
  max: (...nums: number[]) => Math.max(...nums),

  // Date functions
  now: () => new Date(),
  formatDate: (date: any, format: string = 'YYYY-MM-DD') => {
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().split('T')[0]; // Simple YYYY-MM-DD format
  },
  addDays: (date: any, days: number) => {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  },

  // Array functions
  map: (arr: any[], fn: Function) => Array.isArray(arr) ? arr.map(fn) : [],
  filter: (arr: any[], fn: Function) => Array.isArray(arr) ? arr.filter(fn) : [],
  find: (arr: any[], fn: Function) => Array.isArray(arr) ? arr.find(fn) : undefined,
  reduce: (arr: any[], fn: Function, initial: any) => Array.isArray(arr) ? arr.reduce(fn, initial) : initial,
  length: (arr: any[]) => Array.isArray(arr) ? arr.length : 0,

  // Object functions
  get: (obj: any, path: string, defaultValue: any = undefined) => {
    const keys = path.split('.');
    let result = obj;
    for (const key of keys) {
      result = result?.[key];
      if (result === undefined) return defaultValue;
    }
    return result;
  },
  set: (obj: any, path: string, value: any) => {
    const keys = path.split('.');
    const lastKey = keys.pop()!;
    let current = obj;

    for (const key of keys) {
      if (!current[key] || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key];
    }

    current[lastKey] = value;
    return obj;
  },

  // Type conversion functions
  toString: (value: any) => String(value),
  toNumber: (value: any) => {
    const num = Number(value);
    return isNaN(num) ? 0 : num;
  },
  toBoolean: (value: any) => Boolean(value),
  toDate: (value: any) => new Date(value),

  // Utility functions
  isEmpty: (value: any) => {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string') return value.trim() === '';
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'object') return Object.keys(value).length === 0;
    return false;
  },
  coalesce: (...values: any[]) => {
    for (const value of values) {
      if (value !== null && value !== undefined) return value;
    }
    return null;
  },

  // Conditional functions
  if: (condition: any, trueValue: any, falseValue: any) => condition ? trueValue : falseValue,
  switch: (value: any, cases: Record<string, any>, defaultValue: any = null) => {
    return cases[value] !== undefined ? cases[value] : defaultValue;
  },

  // Lookup table functions
  lookup: (tableId: string, key: any, defaultValue: any = null) => {
    const result = lookupTableManager.lookup(tableId, key);
    return result.found ? result.value : defaultValue;
  },
  lookupMultiple: (tableIds: string[], key: any, defaultValue: any = null) => {
    const result = lookupTableManager.lookupMultiple(tableIds, key);
    return result ? result.value : defaultValue;
  },

  // Currency conversion using lookup tables
  convertCurrency: (amount: number, fromCurrency: string, toCurrency: string, exchangeRates?: Record<string, number>) => {
    if (fromCurrency === toCurrency) return amount;

    // Use provided exchange rates or lookup from table
    const rates = exchangeRates || lookupTableManager.lookup('currency-exchange-rates', 'rates')?.data || {};

    const fromRate = rates[fromCurrency] || 1;
    const toRate = rates[toCurrency] || 1;

    return (amount / fromRate) * toRate;
  },

  // Unit conversion using lookup tables
  convertUnit: (value: number, fromUnit: string, toUnit: string, conversionTable?: string) => {
    if (fromUnit === toUnit) return value;

    const tableId = conversionTable || 'unit-conversions';
    const factor = lookupTableManager.lookup(tableId, `${fromUnit}_to_${toUnit}`)?.value;

    if (typeof factor === 'number') {
      return value * factor;
    }

    // Try reverse conversion
    const reverseFactor = lookupTableManager.lookup(tableId, `${toUnit}_to_${fromUnit}`)?.value;
    if (typeof reverseFactor === 'number') {
      return value / reverseFactor;
    }

    return value; // No conversion found
  },

  // Script execution functions
  executeScript: async (scriptId: string, args: Record<string, any> = {}) => {
    const result = await scriptExecutor.executeFunction(scriptId, args, { input: {} });
    if (result.success) {
      return result.output;
    } else {
      throw new Error(result.error || 'Script execution failed');
    }
  },

  runScript: async (code: string, args: Record<string, any> = {}) => {
    const result = await scriptExecutor.executeScript(code, args);
    if (result.success) {
      return result.output;
    } else {
      throw new Error(result.error || 'Script execution failed');
    }
  }
};

/**
 * Safe JavaScript expression evaluator
 */
export class ExpressionEvaluator {
  private context: Record<string, any>;
  private timeout: number;

  constructor(context: Record<string, any> = {}, timeout: number = 5000) {
    this.context = { ...BUILT_IN_FUNCTIONS, ...context };
    this.timeout = timeout;
  }

  /**
   * Evaluate a JavaScript expression safely
   */
  async evaluate(expression: string, input: any = {}): Promise<TransformationResult> {
    const startTime = Date.now();

    try {
      // Create a safe evaluation context
      const context = {
        ...this.context,
        input,
        $: input, // Alias for input
        _input: input, // Alternative alias
      };

      // Create the function body with return statement
      const functionBody = `
        "use strict";
        try {
          return (${expression});
        } catch (error) {
          throw new Error('Expression evaluation failed: ' + error.message);
        }
      `;

      // Create parameter names and values
      const paramNames = Object.keys(context);
      const paramValues = Object.values(context);

      // Create and execute the function
      const evaluator = new Function(...paramNames, functionBody);

      // Set timeout for execution
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Expression evaluation timeout')), this.timeout);
      });

      const evaluationPromise = evaluator(...paramValues);

      const result = await Promise.race([evaluationPromise, timeoutPromise]);

      const executionTime = Date.now() - startTime;

      return {
        success: true,
        output: result,
        executionTime
      };

    } catch (error: any) {
      const executionTime = Date.now() - startTime;

      return {
        success: false,
        output: null,
        error: error.message || 'Unknown evaluation error',
        executionTime
      };
    }
  }

  /**
   * Add custom functions to the context
   */
  addFunction(name: string, fn: Function): void {
    this.context[name] = fn;
  }

  /**
   * Remove a function from the context
   */
  removeFunction(name: string): void {
    delete this.context[name];
  }

  /**
   * Update the timeout
   */
  setTimeout(timeout: number): void {
    this.timeout = timeout;
  }
}

/**
 * Transformation Rule Engine
 */
export class TransformationRuleEngine {
  private evaluator: ExpressionEvaluator;
  private rules: Map<string, TransformationRule> = new Map();

  constructor() {
    this.evaluator = new ExpressionEvaluator();
  }

  /**
   * Register a transformation rule
   */
  registerRule(rule: TransformationRule): void {
    this.rules.set(rule.id, rule);
  }

  /**
   * Unregister a transformation rule
   */
  unregisterRule(ruleId: string): void {
    this.rules.delete(ruleId);
  }

  /**
   * Get a registered rule
   */
  getRule(ruleId: string): TransformationRule | undefined {
    return this.rules.get(ruleId);
  }

  /**
   * List all registered rules
   */
  listRules(): TransformationRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Execute a transformation rule
   */
  async executeRule(ruleId: string, context: TransformationContext): Promise<TransformationResult> {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      return {
        success: false,
        output: null,
        error: `Rule '${ruleId}' not found`,
        executionTime: 0
      };
    }

    // Set timeout if specified
    if (rule.timeout) {
      this.evaluator.setTimeout(rule.timeout);
    }

    // Create evaluation context
    const evalContext = {
      ...context.variables,
      ...rule.parameters,
      metadata: context.metadata
    };

    // Execute the expression
    return await this.evaluator.evaluate(rule.expression, context.input);
  }

  /**
   * Execute a one-off transformation expression
   */
  async executeExpression(expression: string, context: TransformationContext): Promise<TransformationResult> {
    const evalContext = {
      ...context.variables,
      metadata: context.metadata
    };

    return await this.evaluator.evaluate(expression, context.input);
  }

  /**
   * Validate a transformation expression
   */
  async validateExpression(expression: string): Promise<{ valid: boolean; error?: string }> {
    try {
      // Try to evaluate with dummy data to check syntax
      const result = await this.evaluator.evaluate(expression, { test: 'data' });
      return { valid: result.success, error: result.error };
    } catch (error: any) {
      return { valid: false, error: error.message };
    }
  }

  /**
   * Add a custom function to the evaluator
   */
  addCustomFunction(name: string, fn: Function): void {
    this.evaluator.addFunction(name, fn);
  }

  /**
   * Remove a custom function
   */
  removeCustomFunction(name: string): void {
    this.evaluator.removeFunction(name);
  }
}

// Singleton instance for global use
export const transformationEngine = new TransformationRuleEngine();

// Export types
export type { TransformationContext, TransformationResult, TransformationRule };
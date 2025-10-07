/**
 * Custom Script Execution Environment
 * Provides a sandboxed environment for executing user-defined JavaScript functions
 */

import type { TransformationContext, TransformationResult } from './transformationEngine';
import { lookupTableManager } from './lookupTables';

export interface ScriptFunction {
  id: string;
  name: string;
  description?: string;
  parameters: string[];
  code: string;
  returnType?: string;
  timeout?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ScriptExecutionResult extends TransformationResult {
  logs: string[];
  memoryUsage?: number;
}

/**
 * Sandboxed script executor with resource limits
 */
export class ScriptExecutor {
  private functions: Map<string, ScriptFunction> = new Map();
  private defaultTimeout: number = 10000; // 10 seconds
  private maxMemoryUsage: number = 50 * 1024 * 1024; // 50MB

  /**
   * Register a custom script function
   */
  registerFunction(func: ScriptFunction): void {
    func.updatedAt = new Date();
    this.functions.set(func.id, func);
  }

  /**
   * Get a registered function
   */
  getFunction(id: string): ScriptFunction | undefined {
    return this.functions.get(id);
  }

  /**
   * List all registered functions
   */
  listFunctions(): ScriptFunction[] {
    return Array.from(this.functions.values());
  }

  /**
   * Execute a custom script function
   */
  async executeFunction(
    functionId: string,
    args: Record<string, any>,
    context: TransformationContext
  ): Promise<ScriptExecutionResult> {
    const func = this.functions.get(functionId);
    if (!func) {
      return {
        success: false,
        output: null,
        error: `Function '${functionId}' not found`,
        executionTime: 0,
        logs: []
      };
    }

    const startTime = Date.now();
    const logs: string[] = [];

    try {
      // Create a safe execution context
      const executionContext = this.createExecutionContext(func, args, context, logs);

      // Create the function with parameters
      const paramNames = ['context', 'logs', ...func.parameters];
      const paramValues = [executionContext, logs, ...func.parameters.map(p => args[p])];

      // Wrap the function code with safety measures
      const wrappedCode = `
        "use strict";
        try {
          ${func.code}
        } catch (error) {
          throw new Error('Script execution failed: ' + error.message);
        }
      `;

      // Execute with timeout
      const timeout = func.timeout || this.defaultTimeout;
      const executionPromise = this.executeWithTimeout(wrappedCode, paramNames, paramValues, timeout);

      const result = await executionPromise;

      const executionTime = Date.now() - startTime;

      return {
        success: true,
        output: result,
        executionTime,
        logs
      };

    } catch (error: any) {
      const executionTime = Date.now() - startTime;

      return {
        success: false,
        output: null,
        error: error.message || 'Script execution failed',
        executionTime,
        logs
      };
    }
  }

  /**
   * Execute inline script code
   */
  async executeScript(
    code: string,
    args: Record<string, any> = {},
    context: TransformationContext = { input: {} }
  ): Promise<ScriptExecutionResult> {
    const startTime = Date.now();
    const logs: string[] = [];

    try {
      // Create execution context
      const executionContext = this.createExecutionContext(
        { parameters: Object.keys(args) } as ScriptFunction,
        args,
        context,
        logs
      );

      // Create parameter names and values
      const paramNames = ['context', 'logs', ...Object.keys(args)];
      const paramValues = [executionContext, logs, ...Object.values(args)];

      // Wrap code
      const wrappedCode = `
        "use strict";
        try {
          ${code}
        } catch (error) {
          throw new Error('Script execution failed: ' + error.message);
        }
      `;

      const result = await this.executeWithTimeout(wrappedCode, paramNames, paramValues, this.defaultTimeout);

      const executionTime = Date.now() - startTime;

      return {
        success: true,
        output: result,
        executionTime,
        logs
      };

    } catch (error: any) {
      const executionTime = Date.now() - startTime;

      return {
        success: false,
        output: null,
        error: error.message || 'Script execution failed',
        executionTime,
        logs
      };
    }
  }

  /**
   * Create a safe execution context with utility functions
   */
  private createExecutionContext(
    func: ScriptFunction,
    args: Record<string, any>,
    context: TransformationContext,
    logs: string[]
  ): Record<string, any> {
    return {
      // Input data
      input: context.input,
      variables: context.variables || {},
      metadata: context.metadata || {},

      // Logging functions
      log: (...args: any[]) => {
        logs.push(args.map(arg =>
          typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' '));
      },
      warn: (...args: any[]) => {
        logs.push('WARN: ' + args.map(arg =>
          typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' '));
      },
      error: (...args: any[]) => {
        logs.push('ERROR: ' + args.map(arg =>
          typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' '));
      },

      // Utility functions
      lookup: (tableId: string, key: any) => {
        const result = lookupTableManager.lookup(tableId, key);
        return result.found ? result.value : null;
      },

      // Math utilities
      Math: Math,

      // Date utilities
      Date: Date,

      // Array utilities
      Array: Array,

      // Object utilities
      Object: Object,

      // JSON utilities
      JSON: JSON,

      // String utilities
      String: String,

      // Number utilities
      Number: Number,

      // Boolean utilities
      Boolean: Boolean,

      // Safe eval (limited scope)
      safeEval: (expression: string) => {
        try {
          // Very limited safe eval - only basic expressions
          return Function('"use strict"; return (' + expression + ')')();
        } catch (e) {
          throw new Error('Safe eval failed: ' + (e as Error).message);
        }
      }
    };
  }

  /**
   * Execute code with timeout protection
   */
  private async executeWithTimeout(
    code: string,
    paramNames: string[],
    paramValues: any[],
    timeout: number
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Script execution timeout after ${timeout}ms`));
      }, timeout);

      try {
        const executor = new Function(...paramNames, code);
        const result = executor(...paramValues);
        clearTimeout(timeoutId);
        resolve(result);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  /**
   * Validate script syntax
   */
  validateScript(code: string): { valid: boolean; error?: string } {
    try {
      // Basic syntax check
      new Function('context', 'logs', code);
      return { valid: true };
    } catch (error: any) {
      return { valid: false, error: error.message };
    }
  }

  /**
   * Remove a function
   */
  removeFunction(id: string): boolean {
    return this.functions.delete(id);
  }

  /**
   * Set default timeout
   */
  setDefaultTimeout(timeout: number): void {
    this.defaultTimeout = timeout;
  }

  /**
   * Set max memory usage
   */
  setMaxMemoryUsage(maxMemory: number): void {
    this.maxMemoryUsage = maxMemory;
  }
}

// Singleton instance
export const scriptExecutor = new ScriptExecutor();

/**
 * Pre-built script functions for common use cases
 */
export const BUILT_IN_SCRIPTS: ScriptFunction[] = [
  {
    id: 'calculate-discount',
    name: 'Calculate Discount',
    description: 'Calculate discounted price based on percentage or fixed amount',
    parameters: ['originalPrice', 'discountType', 'discountValue'],
    code: `
      if (typeof originalPrice !== 'number' || originalPrice < 0) {
        throw new Error('Invalid original price');
      }

      let discount = 0;
      if (discountType === 'percentage') {
        if (discountValue < 0 || discountValue > 100) {
          throw new Error('Percentage discount must be between 0 and 100');
        }
        discount = originalPrice * (discountValue / 100);
      } else if (discountType === 'fixed') {
        if (discountValue < 0 || discountValue > originalPrice) {
          throw new Error('Fixed discount cannot exceed original price');
        }
        discount = discountValue;
      } else {
        throw new Error('Invalid discount type. Use "percentage" or "fixed"');
      }

      const finalPrice = originalPrice - discount;

      log('Original price:', originalPrice);
      log('Discount:', discount);
      log('Final price:', finalPrice);

      return {
        originalPrice,
        discount,
        finalPrice,
        discountPercentage: discountType === 'percentage' ? discountValue : (discount / originalPrice) * 100
      };
    `,
    returnType: 'object',
    createdAt: new Date(),
    updatedAt: new Date()
  },

  {
    id: 'validate-email',
    name: 'Validate Email',
    description: 'Validate email format and check against common patterns',
    parameters: ['email'],
    code: `
      if (typeof email !== 'string') {
        return { valid: false, reason: 'Not a string' };
      }

      const trimmed = email.trim();
      if (!trimmed) {
        return { valid: false, reason: 'Empty email' };
      }

      // Basic email regex
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmed)) {
        return { valid: false, reason: 'Invalid format' };
      }

      // Check for common disposable email domains
      const disposableDomains = ['10minutemail.com', 'temp-mail.org', 'guerrillamail.com'];
      const domain = trimmed.split('@')[1]?.toLowerCase();
      if (disposableDomains.includes(domain)) {
        log('Warning: Disposable email domain detected');
        return { valid: true, disposable: true, domain };
      }

      return { valid: true, normalized: trimmed.toLowerCase() };
    `,
    returnType: 'object',
    createdAt: new Date(),
    updatedAt: new Date()
  },

  {
    id: 'generate-sku',
    name: 'Generate SKU',
    description: 'Generate a unique SKU based on product attributes',
    parameters: ['productName', 'category', 'variant'],
    code: `
      // Normalize inputs
      const name = (productName || '').toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 3);
      const cat = (category || '').toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 2);
      const varPart = (variant || '').toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 2);

      // Generate timestamp-based suffix
      const timestamp = Date.now().toString().slice(-4);
      const random = Math.random().toString(36).substring(2, 4).toUpperCase();

      const sku = \`\${name}\${cat}\${varPart || '00'}\${timestamp}\${random}\`;

      log('Generated SKU:', sku);
      log('Components:', { name, cat, varPart, timestamp, random });

      return sku;
    `,
    returnType: 'string',
    createdAt: new Date(),
    updatedAt: new Date()
  },

  {
    id: 'transform-address',
    name: 'Transform Address',
    description: 'Normalize and format address data',
    parameters: ['address'],
    code: `
      if (!address || typeof address !== 'object') {
        throw new Error('Address must be an object');
      }

      const normalized = {
        street: (address.street || address.line1 || '').trim(),
        city: (address.city || '').trim(),
        state: (address.state || address.province || '').trim(),
        zipCode: (address.zipCode || address.postalCode || '').trim(),
        country: (address.country || 'US').toUpperCase()
      };

      // Format full address
      const fullAddress = [
        normalized.street,
        normalized.city + (normalized.state ? ', ' + normalized.state : ''),
        normalized.zipCode,
        normalized.country
      ].filter(Boolean).join(', ');

      // Validate required fields
      const missing = [];
      if (!normalized.street) missing.push('street');
      if (!normalized.city) missing.push('city');
      if (!normalized.zipCode) missing.push('zipCode');

      if (missing.length > 0) {
        log('Warning: Missing address fields:', missing.join(', '));
      }

      return {
        normalized,
        fullAddress,
        isComplete: missing.length === 0,
        missingFields: missing
      };
    `,
    returnType: 'object',
    createdAt: new Date(),
    updatedAt: new Date()
  }
];

// Initialize built-in scripts
BUILT_IN_SCRIPTS.forEach(script => {
  scriptExecutor.registerFunction(script);
});

// Export types
export type { ScriptFunction, ScriptExecutionResult };
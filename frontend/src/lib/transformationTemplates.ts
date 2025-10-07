/**
 * Transformation Templates and Reusable Transformations
 * Provides pre-built templates and reusable transformation logic
 */

import type { TransformationRule } from './transformationEngine';
import { transformationEngine } from './transformationEngine';

export interface TransformationTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  sourceType: string;
  targetType: string;
  rules: TransformationRule[];
  variables: Record<string, any>;
  metadata: {
    author?: string;
    version?: string;
    tags?: string[];
    complexity?: 'simple' | 'medium' | 'complex';
    useCase?: string;
  };
}

export interface TemplateInstance {
  id: string;
  templateId: string;
  name: string;
  description?: string;
  customVariables: Record<string, any>;
  customRules: TransformationRule[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Pre-built transformation templates for common scenarios
 */
export const BUILT_IN_TEMPLATES: TransformationTemplate[] = [
  // NetSuite to Shopify Product Template
  {
    id: 'netsuite-to-shopify-product',
    name: 'NetSuite to Shopify Product',
    description: 'Complete product transformation from NetSuite to Shopify format',
    category: 'ecommerce',
    sourceType: 'netsuite',
    targetType: 'shopify',
    rules: [
      {
        id: 'title-mapping',
        name: 'Product Title',
        expression: 'input.displayName || input.itemId',
        description: 'Map NetSuite display name to Shopify title'
      },
      {
        id: 'body-html-mapping',
        name: 'Product Description',
        expression: 'input.salesDescription || input.purchaseDescription || ""',
        description: 'Map NetSuite description to Shopify body HTML'
      },
      {
        id: 'vendor-mapping',
        name: 'Vendor',
        expression: '"NetSuite"',
        description: 'Set vendor to NetSuite'
      },
      {
        id: 'product-type-mapping',
        name: 'Product Type',
        expression: 'input.productType || "General"',
        description: 'Map product type with fallback'
      },
      {
        id: 'price-mapping',
        name: 'Base Price',
        expression: 'round(input.basePrice || input.price || 0, 2)',
        description: 'Round price to 2 decimal places'
      },
      {
        id: 'inventory-mapping',
        name: 'Inventory Quantity',
        expression: 'input.quantityAvailable || input.quantityOnHand || 0',
        description: 'Map available inventory quantity'
      },
      {
        id: 'status-mapping',
        name: 'Product Status',
        expression: 'if(input.isInactive === true, "draft", "active")',
        description: 'Map inactive status to draft, active to published'
      },
      {
        id: 'sku-mapping',
        name: 'SKU',
        expression: 'input.itemId || input.externalId || ""',
        description: 'Map item ID to SKU'
      },
      {
        id: 'tags-mapping',
        name: 'Tags',
        expression: '["netsuite", "imported"].concat(input.customFields?.map(f => f.value) || [])',
        description: 'Create tags array with NetSuite import marker'
      },
      {
        id: 'weight-mapping',
        name: 'Weight',
        expression: 'input.weight || null',
        description: 'Map weight if available'
      },
      {
        id: 'weight-unit-mapping',
        name: 'Weight Unit',
        expression: 'input.weightUnit || "lb"',
        description: 'Map weight unit with default'
      }
    ],
    variables: {},
    metadata: {
      author: 'System',
      version: '1.0',
      tags: ['netsuite', 'shopify', 'product', 'ecommerce'],
      complexity: 'medium',
      useCase: 'Standard NetSuite to Shopify product sync'
    }
  },

  // Shopify to NetSuite Product Template
  {
    id: 'shopify-to-netsuite-product',
    name: 'Shopify to NetSuite Product',
    description: 'Complete product transformation from Shopify to NetSuite format',
    category: 'ecommerce',
    sourceType: 'shopify',
    targetType: 'netsuite',
    rules: [
      {
        id: 'item-id-mapping',
        name: 'Item ID',
        expression: 'input.sku || input.id',
        description: 'Map Shopify SKU or ID to NetSuite item ID'
      },
      {
        id: 'display-name-mapping',
        name: 'Display Name',
        expression: 'input.title',
        description: 'Map Shopify title to NetSuite display name'
      },
      {
        id: 'sales-description-mapping',
        name: 'Sales Description',
        expression: 'input.body_html || ""',
        description: 'Map Shopify description to NetSuite sales description'
      },
      {
        id: 'base-price-mapping',
        name: 'Base Price',
        expression: 'toNumber(input.variants?.[0]?.price || input.price || 0)',
        description: 'Extract price from first variant or product'
      },
      {
        id: 'product-type-mapping',
        name: 'Product Type',
        expression: 'input.product_type || "General"',
        description: 'Map product type with fallback'
      },
      {
        id: 'vendor-mapping',
        name: 'Vendor',
        expression: 'input.vendor || ""',
        description: 'Map vendor information'
      },
      {
        id: 'is-inactive-mapping',
        name: 'Inactive Status',
        expression: 'input.status !== "active"',
        description: 'Map Shopify status to NetSuite inactive flag'
      },
      {
        id: 'weight-mapping',
        name: 'Weight',
        expression: 'toNumber(input.variants?.[0]?.weight || 0)',
        description: 'Extract weight from first variant'
      },
      {
        id: 'weight-unit-mapping',
        name: 'Weight Unit',
        expression: 'input.variants?.[0]?.weight_unit || "lb"',
        description: 'Extract weight unit from first variant'
      }
    ],
    variables: {},
    metadata: {
      author: 'System',
      version: '1.0',
      tags: ['shopify', 'netsuite', 'product', 'ecommerce'],
      complexity: 'medium',
      useCase: 'Standard Shopify to NetSuite product sync'
    }
  },

  // Currency Conversion Template
  {
    id: 'currency-conversion',
    name: 'Currency Conversion',
    description: 'Convert prices between different currencies',
    category: 'financial',
    sourceType: 'any',
    targetType: 'any',
    rules: [
      {
        id: 'usd-to-eur',
        name: 'USD to EUR',
        expression: 'round(input.price * 0.85, 2)',
        description: 'Convert USD to EUR at 0.85 rate'
      },
      {
        id: 'eur-to-usd',
        name: 'EUR to USD',
        expression: 'round(input.price * 1.18, 2)',
        description: 'Convert EUR to USD at 1.18 rate'
      },
      {
        id: 'gbp-to-usd',
        name: 'GBP to USD',
        expression: 'round(input.price * 1.27, 2)',
        description: 'Convert GBP to USD at 1.27 rate'
      },
      {
        id: 'dynamic-conversion',
        name: 'Dynamic Conversion',
        expression: 'round(input.price * variables.exchangeRate, 2)',
        description: 'Convert using dynamic exchange rate from variables'
      }
    ],
    variables: {
      exchangeRate: 1.0,
      targetCurrency: 'USD'
    },
    metadata: {
      author: 'System',
      version: '1.0',
      tags: ['currency', 'conversion', 'financial'],
      complexity: 'simple',
      useCase: 'Currency conversion for international pricing'
    }
  },

  // Data Quality Template
  {
    id: 'data-quality-validation',
    name: 'Data Quality Validation',
    description: 'Validate and clean data quality issues',
    category: 'data-quality',
    sourceType: 'any',
    targetType: 'any',
    rules: [
      {
        id: 'email-validation',
        name: 'Email Validation',
        expression: 'input.email && input.email.includes("@") ? input.email : null',
        description: 'Validate email format'
      },
      {
        id: 'phone-normalization',
        name: 'Phone Normalization',
        expression: 'input.phone ? input.phone.replace(/[^\\d+()-\\s]/g, "") : null',
        description: 'Clean phone number format'
      },
      {
        id: 'required-field-check',
        name: 'Required Field Check',
        expression: 'input.name && input.name.trim() ? input : null',
        description: 'Ensure required fields are present'
      },
      {
        id: 'duplicate-detection',
        name: 'Duplicate Detection',
        expression: 'variables.seenEmails?.has(input.email) ? { ...input, isDuplicate: true } : input',
        description: 'Mark duplicate records'
      }
    ],
    variables: {
      seenEmails: new Set()
    },
    metadata: {
      author: 'System',
      version: '1.0',
      tags: ['validation', 'quality', 'cleaning'],
      complexity: 'medium',
      useCase: 'Data quality validation and cleaning'
    }
  }
];

/**
 * Template Manager for handling transformation templates
 */
export class TransformationTemplateManager {
  private templates: Map<string, TransformationTemplate> = new Map();
  private instances: Map<string, TemplateInstance> = new Map();

  constructor() {
    // Load built-in templates
    BUILT_IN_TEMPLATES.forEach(template => {
      this.templates.set(template.id, template);
    });
  }

  /**
   * Register a custom template
   */
  registerTemplate(template: TransformationTemplate): void {
    this.templates.set(template.id, template);
  }

  /**
   * Get a template by ID
   */
  getTemplate(templateId: string): TransformationTemplate | undefined {
    return this.templates.get(templateId);
  }

  /**
   * List all available templates
   */
  listTemplates(category?: string): TransformationTemplate[] {
    const allTemplates = Array.from(this.templates.values());
    return category ? allTemplates.filter(t => t.category === category) : allTemplates;
  }

  /**
   * Create an instance of a template with customizations
   */
  createInstance(templateId: string, instanceConfig: {
    name: string;
    description?: string;
    customVariables?: Record<string, any>;
    customRules?: TransformationRule[];
  }): TemplateInstance {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template '${templateId}' not found`);
    }

    const instance: TemplateInstance = {
      id: `instance-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      templateId,
      name: instanceConfig.name,
      description: instanceConfig.description,
      customVariables: instanceConfig.customVariables || {},
      customRules: instanceConfig.customRules || [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.instances.set(instance.id, instance);
    return instance;
  }

  /**
   * Execute a template instance
   */
  async executeInstance(instanceId: string, input: any): Promise<any> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Instance '${instanceId}' not found`);
    }

    const template = this.templates.get(instance.templateId);
    if (!template) {
      throw new Error(`Template '${instance.templateId}' not found`);
    }

    // Merge template variables with instance variables
    const variables = {
      ...template.variables,
      ...instance.customVariables
    };

    // Combine template rules with custom rules
    const allRules = [...template.rules, ...instance.customRules];

    // Execute all rules and collect results
    const results: Record<string, any> = {};

    for (const rule of allRules) {
      try {
        const result = await transformationEngine.executeExpression(
          rule.expression,
          { input, variables }
        );

        if (result.success) {
          results[rule.id] = result.output;
        } else {
          console.warn(`Rule '${rule.name}' failed:`, result.error);
          results[rule.id] = null;
        }
      } catch (error) {
        console.error(`Error executing rule '${rule.name}':`, error);
        results[rule.id] = null;
      }
    }

    return results;
  }

  /**
   * Get template suggestions based on source/target types
   */
  getSuggestions(sourceType: string, targetType: string): TransformationTemplate[] {
    return Array.from(this.templates.values()).filter(template =>
      (template.sourceType === sourceType || template.sourceType === 'any') &&
      (template.targetType === targetType || template.targetType === 'any')
    );
  }

  /**
   * Export a template as JSON
   */
  exportTemplate(templateId: string): string {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template '${templateId}' not found`);
    }
    return JSON.stringify(template, null, 2);
  }

  /**
   * Import a template from JSON
   */
  importTemplate(templateJson: string): TransformationTemplate {
    try {
      const template = JSON.parse(templateJson) as TransformationTemplate;

      // Validate required fields
      if (!template.id || !template.name || !template.rules) {
        throw new Error('Invalid template format');
      }

      this.registerTemplate(template);
      return template;
    } catch (error) {
      throw new Error(`Failed to import template: ${error}`);
    }
  }

  /**
   * Clone a template with modifications
   */
  cloneTemplate(templateId: string, modifications: Partial<TransformationTemplate>): TransformationTemplate {
    const original = this.templates.get(templateId);
    if (!original) {
      throw new Error(`Template '${templateId}' not found`);
    }

    const cloned: TransformationTemplate = {
      ...original,
      ...modifications,
      id: modifications.id || `${templateId}-clone-${Date.now()}`,
      metadata: {
        ...original.metadata,
        ...modifications.metadata,
        version: '1.0'
      }
    };

    this.registerTemplate(cloned);
    return cloned;
  }
}

// Singleton instance
export const templateManager = new TransformationTemplateManager();

// Export types
export type { TransformationTemplate, TemplateInstance };
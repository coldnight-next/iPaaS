/**
 * Lookup Tables and Reference Data Management
 * Provides dynamic reference data for transformations
 */

export interface LookupTable {
  id: string;
  name: string;
  description?: string;
  tableType: 'static' | 'dynamic' | 'external';
  keyField: string;
  valueField: string;
  data: Record<string, any>;
  metadata: {
    source?: string;
    lastUpdated?: Date;
    version?: string;
    tags?: string[];
  };
}

export interface LookupResult {
  found: boolean;
  value: any;
  key: string;
  tableId: string;
}

/**
 * Lookup Table Manager
 */
export class LookupTableManager {
  private tables: Map<string, LookupTable> = new Map();

  /**
   * Register a lookup table
   */
  registerTable(table: LookupTable): void {
    this.tables.set(table.id, {
      ...table,
      metadata: {
        ...table.metadata,
        lastUpdated: new Date()
      }
    });
  }

  /**
   * Get a lookup table by ID
   */
  getTable(tableId: string): LookupTable | undefined {
    return this.tables.get(tableId);
  }

  /**
   * List all lookup tables
   */
  listTables(): LookupTable[] {
    return Array.from(this.tables.values());
  }

  /**
   * Lookup a value in a specific table
   */
  lookup(tableId: string, key: any): LookupResult {
    const table = this.tables.get(tableId);
    if (!table) {
      return {
        found: false,
        value: null,
        key: String(key),
        tableId
      };
    }

    const stringKey = String(key);
    const value = table.data[stringKey];

    return {
      found: value !== undefined,
      value: value || null,
      key: stringKey,
      tableId
    };
  }

  /**
   * Lookup a value across multiple tables (first match wins)
   */
  lookupMultiple(tableIds: string[], key: any): LookupResult | null {
    for (const tableId of tableIds) {
      const result = this.lookup(tableId, key);
      if (result.found) {
        return result;
      }
    }
    return null;
  }

  /**
   * Add or update data in a lookup table
   */
  updateTableData(tableId: string, key: string, value: any): boolean {
    const table = this.tables.get(tableId);
    if (!table) {
      return false;
    }

    table.data[key] = value;
    table.metadata.lastUpdated = new Date();
    return true;
  }

  /**
   * Bulk update table data
   */
  bulkUpdateTableData(tableId: string, updates: Record<string, any>): boolean {
    const table = this.tables.get(tableId);
    if (!table) {
      return false;
    }

    Object.assign(table.data, updates);
    table.metadata.lastUpdated = new Date();
    return true;
  }

  /**
   * Remove data from a lookup table
   */
  removeTableData(tableId: string, key: string): boolean {
    const table = this.tables.get(tableId);
    if (!table) {
      return false;
    }

    delete table.data[key];
    table.metadata.lastUpdated = new Date();
    return true;
  }

  /**
   * Clear all data from a lookup table
   */
  clearTableData(tableId: string): boolean {
    const table = this.tables.get(tableId);
    if (!table) {
      return false;
    }

    table.data = {};
    table.metadata.lastUpdated = new Date();
    return true;
  }

  /**
   * Delete a lookup table
   */
  deleteTable(tableId: string): boolean {
    return this.tables.delete(tableId);
  }

  /**
   * Export a table as JSON
   */
  exportTable(tableId: string): string | null {
    const table = this.tables.get(tableId);
    if (!table) {
      return null;
    }
    return JSON.stringify(table, null, 2);
  }

  /**
   * Import a table from JSON
   */
  importTable(tableJson: string): LookupTable {
    const table = JSON.parse(tableJson) as LookupTable;
    table.metadata.lastUpdated = new Date();
    this.registerTable(table);
    return table;
  }

  /**
   * Search tables by name or tags
   */
  searchTables(query: string): LookupTable[] {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.tables.values()).filter(table =>
      table.name.toLowerCase().includes(lowerQuery) ||
      table.description?.toLowerCase().includes(lowerQuery) ||
      table.metadata.tags?.some(tag => tag.toLowerCase().includes(lowerQuery))
    );
  }

  /**
   * Get table statistics
   */
  getTableStats(tableId: string): { entryCount: number; lastUpdated?: Date } | null {
    const table = this.tables.get(tableId);
    if (!table) {
      return null;
    }

    return {
      entryCount: Object.keys(table.data).length,
      lastUpdated: table.metadata.lastUpdated
    };
  }
}

// Singleton instance
export const lookupTableManager = new LookupTableManager();

/**
 * Pre-built lookup tables for common use cases
 */
export const BUILT_IN_LOOKUP_TABLES: LookupTable[] = [
  // Currency codes
  {
    id: 'currency-codes',
    name: 'Currency Codes',
    description: 'ISO currency codes and symbols',
    tableType: 'static',
    keyField: 'code',
    valueField: 'symbol',
    data: {
      'USD': '$',
      'EUR': '€',
      'GBP': '£',
      'JPY': '¥',
      'CAD': 'C$',
      'AUD': 'A$',
      'CHF': 'CHF',
      'CNY': '¥',
      'SEK': 'kr',
      'NZD': 'NZ$'
    },
    metadata: {
      source: 'ISO Standards',
      tags: ['currency', 'finance', 'international'],
      version: '1.0'
    }
  },

  // Country codes
  {
    id: 'country-codes',
    name: 'Country Codes',
    description: 'ISO country codes and names',
    tableType: 'static',
    keyField: 'code',
    valueField: 'name',
    data: {
      'US': 'United States',
      'CA': 'Canada',
      'GB': 'United Kingdom',
      'DE': 'Germany',
      'FR': 'France',
      'IT': 'Italy',
      'ES': 'Spain',
      'NL': 'Netherlands',
      'BE': 'Belgium',
      'CH': 'Switzerland',
      'AT': 'Austria',
      'SE': 'Sweden',
      'NO': 'Norway',
      'DK': 'Denmark',
      'FI': 'Finland',
      'AU': 'Australia',
      'NZ': 'New Zealand',
      'JP': 'Japan',
      'CN': 'China',
      'IN': 'India',
      'BR': 'Brazil',
      'MX': 'Mexico',
      'ZA': 'South Africa'
    },
    metadata: {
      source: 'ISO Standards',
      tags: ['country', 'geography', 'international'],
      version: '1.0'
    }
  },

  // Product categories
  {
    id: 'product-categories',
    name: 'Product Categories',
    description: 'Common product category mappings',
    tableType: 'static',
    keyField: 'netsuite_category',
    valueField: 'shopify_category',
    data: {
      'Electronics': 'Electronics & Gadgets',
      'Clothing': 'Apparel',
      'Books': 'Books & Media',
      'Home': 'Home & Garden',
      'Sports': 'Sports & Outdoors',
      'Beauty': 'Health & Beauty',
      'Toys': 'Toys & Games',
      'Automotive': 'Automotive',
      'Industrial': 'Industrial Supplies',
      'Office': 'Office Supplies'
    },
    metadata: {
      source: 'Common mappings',
      tags: ['products', 'categories', 'ecommerce'],
      version: '1.0'
    }
  },

  // Unit conversions
  {
    id: 'unit-conversions',
    name: 'Unit Conversions',
    description: 'Weight and dimension unit conversion factors',
    tableType: 'static',
    keyField: 'from_to',
    valueField: 'factor',
    data: {
      'lb_to_kg': 0.453592,
      'kg_to_lb': 2.20462,
      'oz_to_g': 28.3495,
      'g_to_oz': 0.035274,
      'in_to_cm': 2.54,
      'cm_to_in': 0.393701,
      'ft_to_m': 0.3048,
      'm_to_ft': 3.28084
    },
    metadata: {
      source: 'Standard conversion factors',
      tags: ['units', 'conversion', 'measurements'],
      version: '1.0'
    }
  },

  // Tax rates (example - would be dynamic in real implementation)
  {
    id: 'tax-rates',
    name: 'Tax Rates',
    description: 'Tax rates by region/state',
    tableType: 'dynamic',
    keyField: 'region',
    valueField: 'rate',
    data: {
      'CA': 0.0825,  // California 8.25%
      'NY': 0.04,    // New York 4%
      'TX': 0.0625,  // Texas 6.25%
      'FL': 0.06,    // Florida 6%
      'WA': 0.065,   // Washington 6.5%
      'default': 0.0
    },
    metadata: {
      source: 'Tax authority data',
      tags: ['tax', 'finance', 'regional'],
      version: '1.0'
    }
  }
];

// Initialize built-in tables
BUILT_IN_LOOKUP_TABLES.forEach(table => {
  lookupTableManager.registerTable(table);
});

// Export types
export type { LookupTable, LookupResult };
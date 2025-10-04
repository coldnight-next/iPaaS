import { decryptJson } from './encryption.ts'

export interface NetSuiteConfig {
  accountId: string
  accessToken: string
  restUrl?: string
}

export interface NetSuiteItem {
  internalId: string
  itemId: string
  displayName: string
  description?: string
  basePrice?: number
  itemType: string
  isInactive: boolean
  quantityAvailable?: number
  quantityOnHand?: number
  quantityOnOrder?: number
  quantityBackOrdered?: number
  vendor?: { internalId: string; name: string }
  subsidiary?: { internalId: string; name: string }
  taxSchedule?: { internalId: string }
  customFields?: Record<string, any>
  created: string
  lastModified: string
}

export interface NetSuiteInventoryItem extends NetSuiteItem {
  locations: Array<{
    locationId: string
    locationName: string
    quantityOnHand: number
    quantityAvailable: number
    quantityOnOrder: number
    quantityBackOrdered: number
  }>
}

export interface NetSuiteSalesOrder {
  internalId: string
  tranId: string
  tranDate: string
  entity: { internalId: string; name: string }
  status: string
  total: number
  subTotal: number
  tax: number
  shippingCost: number
  items: Array<{
    item: { internalId: string; name: string }
    quantity: number
    rate: number
    amount: number
  }>
  shippingAddress?: {
    addressee: string
    addr1: string
    addr2?: string
    city: string
    state: string
    zip: string
    country: string
  }
  billingAddress?: {
    addressee: string
    addr1: string
    addr2?: string
    city: string
    state: string
    zip: string
    country: string
  }
}

export class NetSuiteClient {
  private config: NetSuiteConfig
  private baseUrl: string

  constructor(config: NetSuiteConfig) {
    this.config = config
    this.baseUrl = config.restUrl || `https://${config.accountId}.suitetalk.api.netsuite.com/services/rest/record/v1`
  }

  static async fromConnection(connection: any): Promise<NetSuiteClient> {
    const credentials = connection.credentials as any
    if (!credentials?.encrypted) {
      throw new Error('NetSuite connection is missing encrypted credentials')
    }

    const decrypted = await decryptJson(credentials.encrypted)
    const accountId = connection.metadata?.account_id || decrypted.account_id

    if (!accountId || !decrypted.access_token) {
      throw new Error('NetSuite connection is missing required credentials')
    }

    return new NetSuiteClient({
      accountId,
      accessToken: decrypted.access_token
    })
  }

  private async request<T>(
    endpoint: string,
    options: {
      method?: string
      body?: any
      params?: Record<string, string>
    } = {}
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}/${endpoint}`)
    
    if (options.params) {
      Object.entries(options.params).forEach(([key, value]) => {
        url.searchParams.set(key, value)
      })
    }

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.config.accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Prefer': 'respond-async'
    }

    const response = await fetch(url.toString(), {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[NetSuite] API Error:', response.status, errorText)
      throw new Error(`NetSuite API error (${response.status}): ${errorText}`)
    }

    return await response.json()
  }

  // ========== ITEM/PRODUCT OPERATIONS ==========

  async getItem(itemId: string): Promise<NetSuiteItem> {
    return await this.request<NetSuiteItem>(`inventoryItem/${itemId}`)
  }

  async searchItems(params: {
    q?: string
    limit?: number
    offset?: number
    lastModifiedAfter?: string
  } = {}): Promise<{ items: NetSuiteItem[]; totalResults: number; hasMore: boolean }> {
    const searchParams: Record<string, string> = {
      limit: String(params.limit || 100),
      offset: String(params.offset || 0)
    }

    if (params.q) {
      searchParams.q = params.q
    }

    if (params.lastModifiedAfter) {
      searchParams.lastModifiedAfter = params.lastModifiedAfter
    }

    const response = await this.request<any>('inventoryItem', {
      params: searchParams
    })

    return {
      items: response.items || [],
      totalResults: response.totalResults || 0,
      hasMore: response.hasMore || false
    }
  }

  async createItem(item: Partial<NetSuiteItem>): Promise<NetSuiteItem> {
    return await this.request<NetSuiteItem>('inventoryItem', {
      method: 'POST',
      body: item
    })
  }

  async updateItem(itemId: string, updates: Partial<NetSuiteItem>): Promise<NetSuiteItem> {
    return await this.request<NetSuiteItem>(`inventoryItem/${itemId}`, {
      method: 'PATCH',
      body: updates
    })
  }

  // ========== INVENTORY OPERATIONS ==========

  async getInventoryLevels(itemId: string): Promise<NetSuiteInventoryItem> {
    return await this.request<NetSuiteInventoryItem>(`inventoryItem/${itemId}`, {
      params: { expandSubResources: 'true' }
    })
  }

  async updateInventoryLevel(
    itemId: string,
    locationId: string,
    quantity: number
  ): Promise<void> {
    await this.request(`inventoryAdjustment`, {
      method: 'POST',
      body: {
        item: { internalId: itemId },
        location: { internalId: locationId },
        adjustQtyBy: quantity
      }
    })
  }

  // ========== SALES ORDER OPERATIONS ==========

  async getSalesOrder(orderId: string): Promise<NetSuiteSalesOrder> {
    return await this.request<NetSuiteSalesOrder>(`salesOrder/${orderId}`)
  }

  async searchSalesOrders(params: {
    limit?: number
    offset?: number
    status?: string[]
    createdAfter?: string
  } = {}): Promise<{ orders: NetSuiteSalesOrder[]; totalResults: number; hasMore: boolean }> {
    const searchParams: Record<string, string> = {
      limit: String(params.limit || 100),
      offset: String(params.offset || 0)
    }

    if (params.status && params.status.length > 0) {
      searchParams.status = params.status.join(',')
    }

    if (params.createdAfter) {
      searchParams.createdAfter = params.createdAfter
    }

    const response = await this.request<any>('salesOrder', {
      params: searchParams
    })

    return {
      orders: response.items || [],
      totalResults: response.totalResults || 0,
      hasMore: response.hasMore || false
    }
  }

  async createSalesOrder(order: any): Promise<string> {
    const response = await this.request<NetSuiteSalesOrder>('salesOrder', {
      method: 'POST',
      body: order
    })
    return response.internalId
  }

  async updateSalesOrder(orderId: string, updates: Partial<NetSuiteSalesOrder>): Promise<NetSuiteSalesOrder> {
    return await this.request<NetSuiteSalesOrder>(`salesOrder/${orderId}`, {
      method: 'PATCH',
      body: updates
    })
  }

  // ========== CUSTOMER OPERATIONS ==========

  async getCustomer(customerId: string): Promise<any> {
    return await this.request(`customer/${customerId}`)
  }

  async createCustomer(customer: any): Promise<string> {
    const response = await this.request<any>('customer', {
      method: 'POST',
      body: customer
    })
    return response.internalId
  }

  async searchCustomers(params: { email?: string; name?: string }): Promise<any[]> {
    const searchParams: Record<string, string> = {}
    
    if (params.email) {
      searchParams.email = params.email
    }
    if (params.name) {
      searchParams.companyName = params.name
    }

    const response = await this.request<any>('customer', { params: searchParams })
    return response.items || []
  }
}

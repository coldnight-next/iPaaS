import { decryptJson } from './encryption.ts'

export interface ShopifyConfig {
  shopDomain: string
  accessToken: string
  apiVersion?: string
}

export interface ShopifyProduct {
  id: number
  title: string
  body_html?: string
  vendor?: string
  product_type?: string
  handle: string
  status: 'active' | 'draft' | 'archived'
  tags: string
  variants: ShopifyVariant[]
  images: ShopifyImage[]
  options: Array<{
    id: number
    name: string
    values: string[]
  }>
  created_at: string
  updated_at: string
  published_at?: string
}

export interface ShopifyVariant {
  id: number
  product_id: number
  title: string
  sku?: string
  price: string
  compare_at_price?: string
  inventory_quantity: number
  inventory_management?: string
  inventory_policy: string
  weight: number
  weight_unit: string
  fulfillment_service: string
  requires_shipping: boolean
  barcode?: string
  option1?: string
  option2?: string
  option3?: string
  created_at: string
  updated_at: string
}

export interface ShopifyImage {
  id: number
  product_id: number
  src: string
  alt?: string
  position: number
  width?: number
  height?: number
  created_at: string
  updated_at: string
}

export interface ShopifyInventoryLevel {
  inventory_item_id: number
  location_id: number
  available: number
  updated_at: string
}

export interface ShopifyOrder {
  id: number
  order_number: number
  name: string
  email: string
  created_at: string
  updated_at: string
  financial_status: string
  fulfillment_status?: string
  total_price: string
  subtotal_price: string
  total_tax: string
  total_shipping_price_set: {
    shop_money: {
      amount: string
      currency_code: string
    }
  }
  line_items: Array<{
    id: number
    product_id: number
    variant_id: number
    title: string
    quantity: number
    price: string
    sku?: string
    variant_title?: string
    fulfillment_status?: string
  }>
  shipping_address?: {
    first_name: string
    last_name: string
    address1: string
    address2?: string
    city: string
    province: string
    zip: string
    country: string
    phone?: string
  }
  billing_address?: {
    first_name: string
    last_name: string
    address1: string
    address2?: string
    city: string
    province: string
    zip: string
    country: string
    phone?: string
  }
  customer: {
    id: number
    email: string
    first_name: string
    last_name: string
  }
}

export class ShopifyClient {
  private config: ShopifyConfig
  private baseUrl: string
  private rateLimitRemaining = 40
  private rateLimitResetTime = Date.now()

  constructor(config: ShopifyConfig) {
    this.config = config
    const apiVersion = config.apiVersion || '2024-01'
    this.baseUrl = `https://${config.shopDomain}/admin/api/${apiVersion}`
  }

  static async fromConnection(connection: any): Promise<ShopifyClient> {
    const credentials = connection.credentials as any
    if (!credentials?.encrypted) {
      throw new Error('Shopify connection is missing encrypted credentials')
    }

    const decrypted = await decryptJson(credentials.encrypted)
    const shopDomain = connection.metadata?.shop_domain || decrypted.shop_domain

    if (!shopDomain || !decrypted.access_token) {
      throw new Error('Shopify connection is missing required credentials')
    }

    return new ShopifyClient({
      shopDomain,
      accessToken: decrypted.access_token
    })
  }

  private async handleRateLimit(): Promise<void> {
    if (this.rateLimitRemaining < 5) {
      const waitTime = Math.max(0, this.rateLimitResetTime - Date.now())
      if (waitTime > 0) {
        console.log(`[Shopify] Rate limit approaching, waiting ${waitTime}ms`)
        await new Promise(resolve => setTimeout(resolve, waitTime))
      }
    }
  }

  private updateRateLimitInfo(response: Response): void {
    const remaining = response.headers.get('X-Shopify-Shop-Api-Call-Limit')
    if (remaining) {
      const [used, total] = remaining.split('/').map(Number)
      this.rateLimitRemaining = total - used
      // Reset after 1 second
      this.rateLimitResetTime = Date.now() + 1000
    }
  }

  private async request<T>(
    endpoint: string,
    options: {
      method?: string
      body?: any
      params?: Record<string, string>
    } = {}
  ): Promise<T> {
    await this.handleRateLimit()

    const url = new URL(`${this.baseUrl}/${endpoint}`)
    
    if (options.params) {
      Object.entries(options.params).forEach(([key, value]) => {
        url.searchParams.set(key, value)
      })
    }

    const headers: Record<string, string> = {
      'X-Shopify-Access-Token': this.config.accessToken,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    }

    const response = await fetch(url.toString(), {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    })

    this.updateRateLimitInfo(response)

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[Shopify] API Error:', response.status, errorText)
      
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After')
        const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 2000
        console.log(`[Shopify] Rate limited, retrying after ${waitTime}ms`)
        await new Promise(resolve => setTimeout(resolve, waitTime))
        return this.request<T>(endpoint, options)
      }
      
      throw new Error(`Shopify API error (${response.status}): ${errorText}`)
    }

    return await response.json()
  }

  // ========== PRODUCT OPERATIONS ==========

  async getProduct(productId: number): Promise<ShopifyProduct> {
    const response = await this.request<{ product: ShopifyProduct }>(`products/${productId}.json`)
    return response.product
  }

  async getProducts(params: {
    limit?: number
    since_id?: number
    created_at_min?: string
    updated_at_min?: string
    status?: string
  } = {}): Promise<ShopifyProduct[]> {
    const searchParams: Record<string, string> = {
      limit: String(params.limit || 250)
    }

    if (params.since_id) {
      searchParams.since_id = String(params.since_id)
    }
    if (params.created_at_min) {
      searchParams.created_at_min = params.created_at_min
    }
    if (params.updated_at_min) {
      searchParams.updated_at_min = params.updated_at_min
    }
    if (params.status) {
      searchParams.status = params.status
    }

    const response = await this.request<{ products: ShopifyProduct[] }>('products.json', {
      params: searchParams
    })

    return response.products || []
  }

  async createProduct(product: Partial<ShopifyProduct>): Promise<ShopifyProduct> {
    const response = await this.request<{ product: ShopifyProduct }>('products.json', {
      method: 'POST',
      body: { product }
    })
    return response.product
  }

  async updateProduct(productId: number, updates: Partial<ShopifyProduct>): Promise<ShopifyProduct> {
    const response = await this.request<{ product: ShopifyProduct }>(`products/${productId}.json`, {
      method: 'PUT',
      body: { product: updates }
    })
    return response.product
  }

  async deleteProduct(productId: number): Promise<void> {
    await this.request(`products/${productId}.json`, {
      method: 'DELETE'
    })
  }

  // ========== VARIANT OPERATIONS ==========

  async getVariant(variantId: number): Promise<ShopifyVariant> {
    const response = await this.request<{ variant: ShopifyVariant }>(`variants/${variantId}.json`)
    return response.variant
  }

  async updateVariant(variantId: number, updates: Partial<ShopifyVariant>): Promise<ShopifyVariant> {
    const response = await this.request<{ variant: ShopifyVariant }>(`variants/${variantId}.json`, {
      method: 'PUT',
      body: { variant: updates }
    })
    return response.variant
  }

  // ========== INVENTORY OPERATIONS ==========

  async getInventoryLevels(params: {
    inventory_item_ids?: number[]
    location_ids?: number[]
    limit?: number
  } = {}): Promise<ShopifyInventoryLevel[]> {
    const searchParams: Record<string, string> = {
      limit: String(params.limit || 250)
    }

    if (params.inventory_item_ids && params.inventory_item_ids.length > 0) {
      searchParams.inventory_item_ids = params.inventory_item_ids.join(',')
    }
    if (params.location_ids && params.location_ids.length > 0) {
      searchParams.location_ids = params.location_ids.join(',')
    }

    const response = await this.request<{ inventory_levels: ShopifyInventoryLevel[] }>(
      'inventory_levels.json',
      { params: searchParams }
    )

    return response.inventory_levels || []
  }

  async setInventoryLevel(
    inventoryItemId: number,
    locationId: number,
    available: number
  ): Promise<ShopifyInventoryLevel> {
    const response = await this.request<{ inventory_level: ShopifyInventoryLevel }>(
      'inventory_levels/set.json',
      {
        method: 'POST',
        body: {
          inventory_item_id: inventoryItemId,
          location_id: locationId,
          available
        }
      }
    )
    return response.inventory_level
  }

  async adjustInventoryLevel(
    inventoryItemId: number,
    locationId: number,
    adjustmentDelta: number
  ): Promise<ShopifyInventoryLevel> {
    const response = await this.request<{ inventory_level: ShopifyInventoryLevel }>(
      'inventory_levels/adjust.json',
      {
        method: 'POST',
        body: {
          inventory_item_id: inventoryItemId,
          location_id: locationId,
          available_adjustment: adjustmentDelta
        }
      }
    )
    return response.inventory_level
  }

  async getLocations(): Promise<any[]> {
    const response = await this.request<{ locations: any[] }>('locations.json')
    return response.locations || []
  }

  // ========== ORDER OPERATIONS ==========

  async getOrder(orderId: number): Promise<ShopifyOrder> {
    const response = await this.request<{ order: ShopifyOrder }>(`orders/${orderId}.json`)
    return response.order
  }

  async getOrders(params: {
    limit?: number
    since_id?: number
    created_at_min?: string
    updated_at_min?: string
    status?: string
    financial_status?: string
    fulfillment_status?: string
  } = {}): Promise<ShopifyOrder[]> {
    const searchParams: Record<string, string> = {
      limit: String(params.limit || 250)
    }

    if (params.since_id) {
      searchParams.since_id = String(params.since_id)
    }
    if (params.created_at_min) {
      searchParams.created_at_min = params.created_at_min
    }
    if (params.updated_at_min) {
      searchParams.updated_at_min = params.updated_at_min
    }
    if (params.status) {
      searchParams.status = params.status
    }
    if (params.financial_status) {
      searchParams.financial_status = params.financial_status
    }
    if (params.fulfillment_status) {
      searchParams.fulfillment_status = params.fulfillment_status
    }

    const response = await this.request<{ orders: ShopifyOrder[] }>('orders.json', {
      params: searchParams
    })

    return response.orders || []
  }

  // ========== CUSTOMER OPERATIONS ==========

  async getCustomer(customerId: number): Promise<any> {
    const response = await this.request<{ customer: any }>(`customers/${customerId}.json`)
    return response.customer
  }

  async searchCustomers(query: string): Promise<any[]> {
    const response = await this.request<{ customers: any[] }>('customers/search.json', {
      params: { query }
    })
    return response.customers || []
  }

  async createCustomer(customer: any): Promise<any> {
    const response = await this.request<{ customer: any }>('customers.json', {
      method: 'POST',
      body: { customer }
    })
    return response.customer
  }
}

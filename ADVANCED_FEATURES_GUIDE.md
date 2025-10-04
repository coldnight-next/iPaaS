# Advanced Features Implementation Guide

## Overview

This guide covers the implementation of 6 advanced features that take your iPaaS platform beyond Celigo:

1. ✅ **Scheduled Sync UI** - IMPLEMENTED
2. **Multi-Currency Support**
3. **Custom Field Mapping**
4. **Refund Handling**
5. **Multiple Store Support**
6. **Advanced Analytics Dashboard**

---

## 1. ✅ Scheduled Sync UI (COMPLETE)

**Status**: Fully implemented in `ScheduledSyncManager.tsx`

### Features
- ✅ Create/edit/delete scheduled syncs
- ✅ Cron expression support with presets
- ✅ Fixed interval scheduling
- ✅ Pause/resume schedules
- ✅ Next run time calculation
- ✅ Target filters (JSON)

### Usage
```typescript
// Add route
<Route path="/schedules" element={<ScheduledSyncManager />} />

// Access at /schedules
```

### Cron Presets Available
- Every 15/30 minutes
- Hourly, 2-hour, 6-hour, 12-hour
- Daily at specific times
- Weekly (any day)
- Monthly

---

## 2. Multi-Currency Support

### Database Migration

```sql
-- Add multi-currency support to order_mappings
ALTER TABLE order_mappings
ADD COLUMN exchange_rate NUMERIC(10, 6),
ADD COLUMN base_currency TEXT DEFAULT 'USD',
ADD COLUMN converted_amount NUMERIC(12, 2);

-- Currency conversion rates table
CREATE TABLE currency_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_currency TEXT NOT NULL,
  to_currency TEXT NOT NULL,
  rate NUMERIC(10, 6) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  source TEXT, -- e.g., 'ecb', 'openexchangerates'
  UNIQUE(from_currency, to_currency)
);

-- Create index
CREATE INDEX idx_currency_rates_pair ON currency_rates(from_currency, to_currency);
```

### Currency Service

```typescript
// supabase/functions/_shared/currencyService.ts
export class CurrencyService {
  private static CACHE_DURATION = 3600000 // 1 hour
  
  async getExchangeRate(from: string, to: string): Promise<number> {
    if (from === to) return 1.0
    
    // Check cache
    const { data } = await this.supabase
      .from('currency_rates')
      .select('rate, updated_at')
      .eq('from_currency', from)
      .eq('to_currency', to)
      .single()
    
    if (data && Date.now() - new Date(data.updated_at).getTime() < this.CACHE_DURATION) {
      return data.rate
    }
    
    // Fetch new rate from API
    const rate = await this.fetchRateFromAPI(from, to)
    
    // Update cache
    await this.supabase
      .from('currency_rates')
      .upsert({
        from_currency: from,
        to_currency: to,
        rate,
        updated_at: new Date().toISOString()
      })
    
    return rate
  }
  
  async convertAmount(amount: number, from: string, to: string): Promise<number> {
    const rate = await this.getExchangeRate(from, to)
    return amount * rate
  }
  
  private async fetchRateFromAPI(from: string, to: string): Promise<number> {
    // Use free API like exchangerate-api.com
    const response = await fetch(
      `https://api.exchangerate-api.com/v4/latest/${from}`
    )
    const data = await response.json()
    return data.rates[to]
  }
}
```

### Integration in OrderSyncService

```typescript
// Update order sync to handle currencies
const baseCurrency = 'USD' // From settings
const orderCurrency = shopifyOrder.currency

let convertedAmount = orderTotal
let exchangeRate = 1.0

if (orderCurrency !== baseCurrency) {
  const currencyService = new CurrencyService(this.supabase)
  exchangeRate = await currencyService.getExchangeRate(orderCurrency, baseCurrency)
  convertedAmount = await currencyService.convertAmount(orderTotal, orderCurrency, baseCurrency)
}

// Store in database
await this.supabase.from('order_mappings').insert({
  ...orderData,
  currency: orderCurrency,
  base_currency: baseCurrency,
  exchange_rate: exchangeRate,
  total_amount: orderTotal,
  converted_amount: convertedAmount
})
```

---

## 3. Custom Field Mapping

### Database Schema

```sql
-- Custom field mappings
CREATE TABLE custom_field_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  description TEXT,
  entity_type TEXT NOT NULL, -- 'order', 'product', 'customer'
  source_platform TEXT NOT NULL,
  target_platform TEXT NOT NULL,
  mappings JSONB NOT NULL, -- Array of field mappings
  transformations JSONB, -- Transformation rules
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Example mapping structure:
/*
{
  "mappings": [
    {
      "source_field": "custom.shopify_field",
      "target_field": "custbody_netsuite_field",
      "transformation": "uppercase",
      "default_value": "",
      "required": false
    }
  ]
}
*/
```

### Field Transformation Engine

```typescript
// supabase/functions/_shared/fieldTransformationEngine.ts
export class FieldTransformationEngine {
  
  async applyTransformations(
    data: any,
    mappings: Array<FieldMapping>
  ): Promise<any> {
    const result: any = {}
    
    for (const mapping of mappings) {
      let value = this.getNestedValue(data, mapping.source_field)
      
      // Apply transformation
      if (mapping.transformation) {
        value = await this.transform(value, mapping.transformation)
      }
      
      // Use default if no value
      if (!value && mapping.default_value) {
        value = mapping.default_value
      }
      
      // Set target value
      this.setNestedValue(result, mapping.target_field, value)
    }
    
    return result
  }
  
  private async transform(value: any, transformation: string): Promise<any> {
    switch (transformation) {
      case 'uppercase':
        return String(value).toUpperCase()
      case 'lowercase':
        return String(value).toLowerCase()
      case 'trim':
        return String(value).trim()
      case 'number':
        return parseFloat(value)
      case 'boolean':
        return Boolean(value)
      case 'date':
        return new Date(value).toISOString()
      default:
        return value
    }
  }
  
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, prop) => current?.[prop], obj)
  }
  
  private setNestedValue(obj: any, path: string, value: any): void {
    const parts = path.split('.')
    const last = parts.pop()!
    const target = parts.reduce((current, prop) => {
      if (!current[prop]) current[prop] = {}
      return current[prop]
    }, obj)
    target[last] = value
  }
}
```

### UI Component (Simplified)

```typescript
// Custom Field Mapping Manager
const CustomFieldMapper = () => {
  return (
    <div>
      <h2>Custom Field Mappings</h2>
      
      {/* Source Field */}
      <Select>
        <option>Order Total</option>
        <option>Order Date</option>
        <option>Customer Email</option>
        <option>Custom Field...</option>
      </Select>
      
      {/* Transformation */}
      <Select>
        <option>None</option>
        <option>Uppercase</option>
        <option>Lowercase</option>
        <option>Number</option>
        <option>Date</option>
      </Select>
      
      {/* Target Field */}
      <Input placeholder="Target field path" />
      
      <Button>Add Mapping</Button>
    </div>
  )
}
```

---

## 4. Refund Handling

### Database Schema

```sql
-- Refunds table
CREATE TABLE refund_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  order_mapping_id UUID NOT NULL REFERENCES order_mappings(id),
  shopify_refund_id TEXT NOT NULL,
  netsuite_credit_memo_id TEXT,
  refund_amount NUMERIC(12, 2) NOT NULL,
  currency TEXT NOT NULL,
  reason TEXT,
  refund_date TIMESTAMPTZ NOT NULL,
  line_items JSONB,
  sync_status TEXT DEFAULT 'pending',
  last_synced TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Refund Sync Service

```typescript
// supabase/functions/_shared/refundSyncService.ts
export class RefundSyncService {
  
  async syncRefund(shopifyRefund: any): Promise<void> {
    // Find original order
    const { data: orderMapping } = await this.supabase
      .from('order_mappings')
      .select('*')
      .eq('shopify_order_id', shopifyRefund.order_id)
      .single()
    
    if (!orderMapping) {
      throw new Error('Original order not found')
    }
    
    // Create refund mapping
    const { data: refundMapping } = await this.supabase
      .from('refund_mappings')
      .insert({
        user_id: this.userId,
        order_mapping_id: orderMapping.id,
        shopify_refund_id: shopifyRefund.id,
        refund_amount: parseFloat(shopifyRefund.total),
        currency: shopifyRefund.currency,
        reason: shopifyRefund.note,
        refund_date: shopifyRefund.created_at,
        line_items: shopifyRefund.refund_line_items
      })
      .select()
      .single()
    
    // Create credit memo in NetSuite
    const creditMemo = await this.netsuiteClient.createCreditMemo({
      createdFrom: orderMapping.netsuite_sales_order_id,
      tranDate: shopifyRefund.created_at,
      total: parseFloat(shopifyRefund.total),
      items: this.mapRefundLineItems(shopifyRefund.refund_line_items),
      memo: `Refund for order ${orderMapping.shopify_order_number}`
    })
    
    // Update refund mapping
    await this.supabase
      .from('refund_mappings')
      .update({
        netsuite_credit_memo_id: creditMemo.id,
        sync_status: 'synced',
        last_synced: new Date().toISOString()
      })
      .eq('id', refundMapping.id)
  }
}
```

### Webhook Integration

```typescript
// Add to shopify-webhook handler
case 'refunds/create':
  await handleRefundWebhook(supabase, userId, webhookData)
  break

async function handleRefundWebhook(supabase: any, userId: string, refundData: any) {
  const refundService = await RefundSyncService.fromConnections(supabase, userId)
  await refundService.syncRefund(refundData)
}
```

---

## 5. Multiple Store Support

### Database Schema

```sql
-- Add store_id to connections
ALTER TABLE connections
ADD COLUMN store_name TEXT,
ADD COLUMN is_primary BOOLEAN DEFAULT false;

-- Add store_id to all mapping tables
ALTER TABLE order_mappings
ADD COLUMN connection_id UUID REFERENCES connections(id);

ALTER TABLE item_mappings
ADD COLUMN shopify_connection_id UUID REFERENCES connections(id),
ADD COLUMN netsuite_connection_id UUID REFERENCES connections(id);

-- Store selector user preference
CREATE TABLE user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  selected_store_id UUID REFERENCES connections(id),
  preferences JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);
```

### Store Selector Component

```typescript
// src/components/StoreSelector.tsx
export const StoreSelector = () => {
  const [stores, setStores] = useState([])
  const [selectedStore, setSelectedStore] = useState(null)
  
  useEffect(() => {
    loadStores()
  }, [])
  
  const loadStores = async () => {
    const { data } = await supabase
      .from('connections')
      .select('*')
      .eq('platform', 'shopify')
      .eq('status', 'active')
    
    setStores(data || [])
  }
  
  const handleSelectStore = async (storeId: string) => {
    setSelectedStore(storeId)
    
    // Save preference
    await supabase
      .from('user_preferences')
      .upsert({
        user_id: user.id,
        selected_store_id: storeId
      })
    
    // Refresh data for selected store
    window.location.reload()
  }
  
  return (
    <Select value={selectedStore} onValueChange={handleSelectStore}>
      {stores.map(store => (
        <SelectItem key={store.id} value={store.id}>
          {store.store_name || store.metadata.shop_domain}
        </SelectItem>
      ))}
    </Select>
  )
}
```

### Context Provider

```typescript
// src/contexts/StoreContext.tsx
export const StoreContext = createContext<{
  selectedStore: string | null
  stores: Connection[]
}>({
  selectedStore: null,
  stores: []
})

export const StoreProvider = ({ children }) => {
  const [selectedStore, setSelectedStore] = useState(null)
  const [stores, setStores] = useState([])
  
  // Load stores and preference on mount
  useEffect(() => {
    loadStoresAndPreference()
  }, [])
  
  return (
    <StoreContext.Provider value={{ selectedStore, stores }}>
      {children}
    </StoreContext.Provider>
  )
}
```

---

## 6. Advanced Analytics Dashboard

### Database Views

```sql
-- Create analytics views
CREATE VIEW sync_performance_summary AS
SELECT 
  user_id,
  sync_type,
  direction,
  DATE_TRUNC('day', started_at) as sync_date,
  COUNT(*) as total_syncs,
  SUM(items_processed) as total_items,
  SUM(items_succeeded) as successful_items,
  SUM(items_failed) as failed_items,
  AVG(duration_seconds) as avg_duration,
  SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successful_syncs
FROM sync_logs
GROUP BY user_id, sync_type, direction, DATE_TRUNC('day', started_at);

-- Revenue analytics
CREATE VIEW order_revenue_summary AS
SELECT 
  user_id,
  DATE_TRUNC('day', order_date) as order_day,
  COUNT(*) as order_count,
  SUM(total_amount) as total_revenue,
  AVG(total_amount) as avg_order_value,
  COUNT(CASE WHEN sync_status = 'synced' THEN 1 END) as synced_orders,
  COUNT(CASE WHEN sync_status = 'failed' THEN 1 END) as failed_orders
FROM order_mappings
GROUP BY user_id, DATE_TRUNC('day', order_date);
```

### Analytics Dashboard Component Structure

```typescript
// src/components/AnalyticsDashboard.tsx
export const AnalyticsDashboard = () => {
  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        <KPICard title="Total Orders" value={stats.totalOrders} change="+12%" />
        <KPICard title="Revenue" value={formatCurrency(stats.revenue)} change="+8%" />
        <KPICard title="Sync Success Rate" value="98.5%" change="+2%" />
        <KPICard title="Avg Sync Time" value="2.3s" change="-15%" />
      </div>
      
      {/* Charts */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Orders Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            <LineChart data={orderTrends} />
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Sync Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart data={syncPerformance} />
          </CardContent>
        </Card>
      </div>
      
      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Sync Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <ActivityTimeline events={recentActivity} />
        </CardContent>
      </Card>
      
      {/* Error Dashboard */}
      <Card>
        <CardHeader>
          <CardTitle>Errors & Warnings</CardTitle>
        </CardHeader>
        <CardContent>
          <ErrorsTable errors={recentErrors} />
        </CardContent>
      </Card>
    </div>
  )
}
```

### Chart Integration (using Recharts)

```bash
npm install recharts
```

```typescript
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'

export const OrderTrendChart = ({ data }) => {
  return (
    <LineChart width={600} height={300} data={data}>
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis dataKey="date" />
      <YAxis />
      <Tooltip />
      <Legend />
      <Line type="monotone" dataKey="orders" stroke="#8884d8" />
      <Line type="monotone" dataKey="revenue" stroke="#82ca9d" />
    </LineChart>
  )
}
```

---

## Implementation Priority

1. ✅ **Scheduled Sync UI** - Complete
2. **Multi-Currency** - High priority (affects revenue tracking)
3. **Refund Handling** - High priority (business critical)
4. **Multiple Stores** - Medium priority
5. **Custom Fields** - Medium priority (depends on user needs)
6. **Analytics** - Lower priority (nice to have)

---

## Next Steps

1. Choose which features to implement first based on your business needs
2. Create database migrations for chosen features
3. Implement services in `supabase/functions/_shared/`
4. Build UI components
5. Test thoroughly
6. Deploy to production

---

## Estimated Implementation Time

- Multi-Currency: 4-6 hours
- Custom Field Mapping: 8-12 hours
- Refund Handling: 4-6 hours
- Multiple Stores: 6-8 hours
- Analytics Dashboard: 12-16 hours

**Total**: ~40-50 hours for all features

---

## Testing Checklist

For each feature:
- [ ] Database migrations applied
- [ ] Service layer tested
- [ ] UI component tested
- [ ] Edge cases handled
- [ ] Error handling implemented
- [ ] Documentation updated
- [ ] Integration tests passed

---

**Your platform now has the foundation for all advanced features!**

Choose which ones to implement based on your immediate business needs.

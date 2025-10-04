# Order Sync API Quick Reference

## Endpoint

```
POST https://mkeillycpwenoeuzwjsm.supabase.co/functions/v1/sync-orders
```

## Headers

```http
Authorization: Bearer {your-jwt-token}
Content-Type: application/json
```

## Request Body

All fields are optional:

```typescript
{
  dateFrom?: string      // ISO 8601 date, e.g., "2024-01-01T00:00:00Z"
  dateTo?: string        // ISO 8601 date, e.g., "2024-12-31T23:59:59Z"
  orderStatus?: string[] // Array of statuses: ["open", "closed", "cancelled"]
  limit?: number         // Max orders to sync (default: 50)
}
```

## Response

### Success (200)

```typescript
{
  success: boolean
  syncLogId: string                           // UUID of sync log
  summary: {
    ordersProcessed: number
    ordersSucceeded: number
    ordersFailed: number
  }
  errors: Array<{
    orderId: string
    error: string
  }>
  warnings: string[]
}
```

### Error (4xx/5xx)

```typescript
{
  error: string
  details?: string
}
```

## Usage Examples

### JavaScript/TypeScript (Supabase Client)

```typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// Authenticate first
const { data: { session } } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'password'
})

// Trigger sync
const { data, error } = await supabase.functions.invoke('sync-orders', {
  body: {
    limit: 25,
    dateFrom: '2024-01-01T00:00:00Z'
  }
})

if (error) {
  console.error('Sync failed:', error)
} else {
  console.log('Sync result:', data)
}
```

### cURL

```bash
# Get access token
TOKEN=$(curl -s -X POST \
  https://mkeillycpwenoeuzwjsm.supabase.co/auth/v1/token \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password","grant_type":"password"}' \
  | jq -r '.access_token')

# Trigger sync
curl -X POST \
  https://mkeillycpwenoeuzwjsm.supabase.co/functions/v1/sync-orders \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "limit": 10,
    "dateFrom": "2024-01-01T00:00:00Z",
    "orderStatus": ["open"]
  }'
```

### Fetch API

```javascript
const response = await fetch(
  'https://mkeillycpwenoeuzwjsm.supabase.co/functions/v1/sync-orders',
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      limit: 20,
      dateFrom: '2024-01-01T00:00:00Z'
    })
  }
)

const result = await response.json()
```

### Axios

```javascript
import axios from 'axios'

const result = await axios.post(
  'https://mkeillycpwenoeuzwjsm.supabase.co/functions/v1/sync-orders',
  {
    limit: 15,
    dateFrom: '2024-01-01T00:00:00Z',
    orderStatus: ['open', 'closed']
  },
  {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  }
)

console.log(result.data)
```

## Common Use Cases

### Sync Last 24 Hours

```javascript
const yesterday = new Date()
yesterday.setDate(yesterday.getDate() - 1)

await supabase.functions.invoke('sync-orders', {
  body: {
    dateFrom: yesterday.toISOString(),
    limit: 100
  }
})
```

### Sync Specific Date Range

```javascript
await supabase.functions.invoke('sync-orders', {
  body: {
    dateFrom: '2024-01-01T00:00:00Z',
    dateTo: '2024-01-31T23:59:59Z',
    limit: 50
  }
})
```

### Sync Only Open Orders

```javascript
await supabase.functions.invoke('sync-orders', {
  body: {
    orderStatus: ['open'],
    limit: 100
  }
})
```

### Small Test Sync

```javascript
await supabase.functions.invoke('sync-orders', {
  body: {
    limit: 5  // Sync only 5 orders
  }
})
```

## Error Codes

| Status | Meaning | Action |
|--------|---------|--------|
| 200 | Success | Process results |
| 401 | Unauthorized | Check JWT token |
| 500 | Server Error | Check logs, retry |

## Rate Limits

- **Edge Function**: No hard limit, but 150s timeout
- **Shopify API**: ~2 requests/second (handled automatically)
- **NetSuite API**: Varies by account (handled with async requests)

## Best Practices

1. **Start Small**: Test with `limit: 5-10` first
2. **Date Ranges**: Use specific date ranges to avoid processing all orders
3. **Monitor Results**: Check `summary` in response for success rates
4. **Handle Errors**: Process `errors` array to identify issues
5. **Product Mappings**: Ensure item mappings exist before syncing
6. **Customer Data**: Verify customer information is complete

## Database Queries After Sync

### Check Sync Status

```sql
SELECT * FROM sync_logs 
WHERE id = 'your-sync-log-id';
```

### View Synced Orders

```sql
SELECT 
  shopify_order_number,
  netsuite_sales_order_id,
  sync_status,
  total_amount,
  last_synced
FROM order_mappings
WHERE user_id = 'your-user-id'
ORDER BY order_date DESC;
```

### Find Failed Orders

```sql
SELECT 
  om.shopify_order_number,
  om.error_message,
  osh.shopify_data
FROM order_mappings om
LEFT JOIN order_sync_history osh ON osh.order_mapping_id = om.id
WHERE om.sync_status = 'failed';
```

### Get Sync Statistics

```sql
SELECT 
  sync_status,
  COUNT(*) as count,
  SUM(total_amount) as total_value
FROM order_mappings
WHERE user_id = 'your-user-id'
GROUP BY sync_status;
```

## Webhooks (Coming Soon)

Future support for real-time sync via Shopify webhooks:

```javascript
// Future implementation
POST /functions/v1/shopify-order-webhook
X-Shopify-Topic: orders/create
X-Shopify-Hmac-SHA256: {signature}

// Will automatically trigger order sync
```

## Support

- **Documentation**: See `docs/ORDER_SYNC.md`
- **Test Script**: `tests/test-order-sync.ts`
- **Logs**: Check Supabase Dashboard → Edge Functions → Logs

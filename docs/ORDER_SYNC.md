# Order Sync - Shopify to NetSuite

## Overview

The Order Sync feature synchronizes orders from Shopify to NetSuite as Sales Orders. This is a core component of achieving Celigo iPaaS parity and enables automated order processing between the two platforms.

## Architecture

### Components

1. **OrderSyncService** (`supabase/functions/_shared/orderSyncService.ts`)
   - Core business logic for order synchronization
   - Handles customer matching/creation
   - Maps line items and pricing
   - Manages sync state and error handling

2. **sync-orders Edge Function** (`supabase/functions/sync-orders/index.ts`)
   - HTTP endpoint for triggering order syncs
   - Authentication and authorization
   - Request validation and response formatting

3. **Database Schema** (see migrations)
   - `order_mappings` - Links Shopify orders to NetSuite sales orders
   - `order_line_mappings` - Maps individual line items
   - `order_sync_history` - Detailed sync operation logs
   - `customer_mappings` - Links Shopify customers to NetSuite customers
   - `item_mappings` - Maps Shopify products to NetSuite items

4. **API Clients**
   - `ShopifyClient` - Handles Shopify REST API communication
   - `NetSuiteClient` - Handles NetSuite SuiteTalk REST API communication

## Data Flow

```
┌─────────────┐
│   Shopify   │
│   Orders    │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────────────┐
│      OrderSyncService.syncOrders()          │
│                                             │
│  1. Fetch orders from Shopify               │
│  2. For each order:                         │
│     a. Find/create customer mapping         │
│     b. Create NetSuite customer if needed   │
│     c. Create order mapping record          │
│     d. Map line items                       │
│     e. Build NetSuite sales order data      │
│     f. Create NetSuite sales order          │
│     g. Update mapping with NetSuite ID      │
│     h. Log sync operation                   │
└─────────────────────────────────────────────┘
       │
       ▼
┌─────────────┐
│   NetSuite  │
│Sales Orders │
└─────────────┘
```

## Features

### ✅ Implemented

- **Order Fetching**: Fetch Shopify orders with date range and status filters
- **Customer Matching**: Intelligent customer matching by Shopify ID and email
- **Customer Creation**: Automatically creates NetSuite customers if they don't exist
- **Line Item Mapping**: Maps Shopify line items to NetSuite items with SKU matching
- **Pricing & Tax**: Handles line item pricing, taxes, discounts, and shipping costs
- **Address Mapping**: Maps shipping and billing addresses to NetSuite format
- **Duplicate Prevention**: Checks for existing orders before syncing
- **Error Handling**: Graceful error handling with detailed logging
- **Sync History**: Comprehensive sync operation tracking and reporting
- **Status Tracking**: Tracks sync status (pending, synced, failed) for all entities

### 🚧 Planned Enhancements

- **Webhooks**: Real-time order sync via Shopify webhooks
- **Fulfillment Sync**: Sync fulfillments from NetSuite back to Shopify
- **Inventory Updates**: Sync inventory changes triggered by orders
- **Payment Tracking**: Enhanced payment method and transaction mapping
- **Refund Handling**: Process refunds and returns
- **Batch Processing**: Improved batch processing for high-volume syncing
- **Retry Logic**: Automatic retry for failed syncs with exponential backoff
- **Scheduling**: Scheduled periodic syncs

## API Usage

### Endpoint

```
POST https://[YOUR_PROJECT_REF].supabase.co/functions/v1/sync-orders
```

### Authentication

Requires a valid Supabase JWT token in the Authorization header:

```
Authorization: Bearer [YOUR_ACCESS_TOKEN]
```

### Request Body

```json
{
  "dateFrom": "2024-01-01T00:00:00Z",    // Optional: ISO 8601 date
  "dateTo": "2024-12-31T23:59:59Z",      // Optional: ISO 8601 date
  "orderStatus": ["open", "closed"],      // Optional: array of statuses
  "limit": 50                             // Optional: number of orders (default: 50)
}
```

### Response

Success (200):
```json
{
  "success": true,
  "syncLogId": "uuid-here",
  "summary": {
    "ordersProcessed": 25,
    "ordersSucceeded": 23,
    "ordersFailed": 2
  },
  "errors": [
    {
      "orderId": "1234567890",
      "error": "Product mapping not found for SKU: ABC123"
    }
  ],
  "warnings": []
}
```

Error (4xx/5xx):
```json
{
  "error": "Error message",
  "details": "Stack trace or additional details"
}
```

## Database Schema

### order_mappings

Links Shopify orders to NetSuite sales orders.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | User who owns this mapping |
| shopify_order_id | text | Shopify order ID |
| shopify_order_number | text | Shopify order number (e.g., #1001) |
| netsuite_sales_order_id | text | NetSuite sales order internal ID |
| order_date | timestamptz | Order date |
| total_amount | numeric | Total order amount |
| currency | text | Currency code |
| sync_status | text | 'pending', 'synced', 'failed' |
| last_synced | timestamptz | Last sync timestamp |
| error_message | text | Error message if failed |
| metadata | jsonb | Additional order metadata |

### order_line_mappings

Maps individual line items from Shopify to NetSuite.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| order_mapping_id | uuid | Parent order mapping |
| product_mapping_id | uuid | Link to item mapping |
| shopify_line_item_id | text | Shopify line item ID |
| sku | text | Product SKU |
| product_name | text | Product name |
| quantity | integer | Quantity ordered |
| unit_price | numeric | Price per unit |
| total_price | numeric | Total line amount |
| tax_amount | numeric | Tax amount |
| discount_amount | numeric | Discount amount |
| sync_status | text | 'pending', 'synced', 'failed' |

### order_sync_history

Detailed log of each sync operation.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| sync_log_id | uuid | Parent sync log |
| order_mapping_id | uuid | Associated order mapping |
| operation | text | 'create', 'update', 'delete' |
| status | text | 'success', 'failed' |
| shopify_data | jsonb | Raw Shopify order data |
| netsuite_data | jsonb | NetSuite order data sent |
| error_message | text | Error if failed |
| processing_time_ms | integer | Processing time |
| created_at | timestamptz | Timestamp |

## Testing

### Prerequisites

1. **Environment Variables**: Add to your `.env` file:
   ```
   TEST_USER_EMAIL=your-email@example.com
   TEST_USER_PASSWORD=your-password
   ```

2. **Platform Connections**: Ensure you have active Shopify and NetSuite connections in the database.

3. **Test Data**: Have at least a few test orders in your Shopify store.

### Running Tests

```bash
# Using Deno
deno run --allow-net --allow-env tests/test-order-sync.ts

# Or using Node with deno installed
npx deno run --allow-net --allow-env tests/test-order-sync.ts
```

### Manual Testing via cURL

```bash
# Get access token first
curl -X POST https://[YOUR_PROJECT_REF].supabase.co/auth/v1/token \
  -H "apikey: [YOUR_ANON_KEY]" \
  -H "Content-Type: application/json" \
  -d '{"email":"your-email","password":"your-password","grant_type":"password"}'

# Trigger order sync
curl -X POST https://[YOUR_PROJECT_REF].supabase.co/functions/v1/sync-orders \
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \
  -H "Content-Type: application/json" \
  -d '{"limit":10}'
```

## Error Handling

The service handles various error scenarios:

### Common Errors

1. **Missing Customer Information**
   - Error: "Order has no customer information"
   - Solution: Ensure Shopify orders have valid customer data

2. **No Product Mapping Found**
   - Warning: "No product mapping found for SKU: [SKU]"
   - Solution: Create item mappings before syncing orders

3. **Connection Issues**
   - Error: "Both Shopify and NetSuite connections are required"
   - Solution: Verify connections are active in the database

4. **API Rate Limits**
   - Shopify: Automatic rate limit handling with backoff
   - NetSuite: Async request handling via `Prefer: respond-async`

### Retry Strategy

Failed orders are logged but not automatically retried. To retry:

1. Query failed orders:
   ```sql
   SELECT * FROM order_mappings WHERE sync_status = 'failed';
   ```

2. Fix the underlying issue (e.g., create missing product mappings)

3. Update the order status to 'pending':
   ```sql
   UPDATE order_mappings 
   SET sync_status = 'pending', error_message = NULL 
   WHERE id = '[order_mapping_id]';
   ```

4. Re-run the sync

## Monitoring

### Sync Logs

Query sync history:

```sql
SELECT 
  sl.id,
  sl.sync_type,
  sl.status,
  sl.started_at,
  sl.completed_at,
  sl.order_count,
  sl.items_succeeded,
  sl.items_failed
FROM sync_logs sl
WHERE sl.user_id = '[user_id]'
ORDER BY sl.started_at DESC;
```

### Order Status

Check order sync status:

```sql
SELECT 
  om.shopify_order_number,
  om.sync_status,
  om.last_synced,
  om.total_amount,
  om.netsuite_sales_order_id
FROM order_mappings om
WHERE om.user_id = '[user_id]'
ORDER BY om.order_date DESC;
```

### Failed Orders

Identify failed orders for investigation:

```sql
SELECT 
  om.shopify_order_number,
  om.error_message,
  om.last_synced,
  osh.shopify_data,
  osh.netsuite_data
FROM order_mappings om
LEFT JOIN order_sync_history osh ON osh.order_mapping_id = om.id
WHERE om.sync_status = 'failed'
ORDER BY om.created_at DESC;
```

## Performance Considerations

- **Batch Size**: Default limit is 50 orders per sync. Adjust based on data size.
- **Rate Limits**: Both Shopify and NetSuite have rate limits. The clients handle this automatically.
- **Execution Time**: Edge functions have a 150-second timeout. For large syncs, consider:
  - Smaller batch sizes
  - Scheduled periodic syncs
  - Background job processing

## Security

- **Authentication**: All requests require valid JWT tokens
- **Authorization**: Users can only sync their own orders
- **Encryption**: API credentials are encrypted at rest
- **Row-Level Security**: Database enforces user isolation

## Troubleshooting

### Orders Not Syncing

1. Check connection status
2. Verify product mappings exist
3. Review sync logs for errors
4. Check Edge Function logs in Supabase Dashboard

### Duplicate Orders

The system prevents duplicates by checking `shopify_order_id` before creating mappings. If duplicates occur:

1. Check database constraints
2. Review sync history for the order
3. Manually reconcile in NetSuite

### Performance Issues

1. Reduce batch size (limit parameter)
2. Add indexes on frequently queried columns
3. Consider caching frequently accessed data
4. Use scheduled syncs during off-peak hours

## Next Steps

1. **Frontend Integration**: Build UI components for order sync management
2. **Webhooks**: Implement real-time sync via Shopify webhooks
3. **Fulfillment Sync**: Sync order fulfillments back to Shopify
4. **Advanced Filtering**: Add more sophisticated order filtering options
5. **Analytics**: Build dashboards for sync monitoring and reporting

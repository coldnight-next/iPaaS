# Sync Management System

## Overview

The Sync Management system provides persistent synchronization capabilities for the iPaaS platform. It enables users to:

1. **Save Search Patterns**: Store filter configurations for reuse across syncs
2. **Maintain Sync Lists**: Persistent list of items to keep synchronized
3. **Track Sync History**: Detailed logs of all sync operations
4. **Support Delta & Full Syncs**: Efficient incremental or complete synchronization

## Architecture

### Database Tables

#### 1. `saved_search_patterns`
Stores reusable filter configurations for product/item searches.

```sql
- id: uuid (primary key)
- user_id: uuid (foreign key to auth.users)
- name: text (user-friendly name)
- description: text (optional)
- direction: text (netsuite-to-shopify, shopify-to-netsuite, bidirectional)
- filter_config: jsonb (filter parameters)
- created_at: timestamptz
- updated_at: timestamptz
```

**Example filter_config:**
```json
{
  "status": ["active"],
  "priceMin": 10,
  "priceMax": 1000,
  "category": "Electronics",
  "updatedAfter": "2024-01-01T00:00:00Z"
}
```

#### 2. `sync_list`
Maintains items that should be kept in sync persistently.

```sql
- id: uuid (primary key)
- user_id: uuid (foreign key to auth.users)
- item_type: text (product, order, inventory)
- source_platform: text (netsuite, shopify)
- target_platform: text (shopify, netsuite)
- source_id: text (ID in source platform)
- target_id: text (ID in target platform, nullable)
- sync_mode: text (delta, full)
- is_active: boolean
- last_synced_at: timestamptz (nullable)
- last_sync_status: text (success, failed, pending, nullable)
- error_message: text (nullable)
- filter_config: jsonb (nullable - from saved pattern)
- metadata: jsonb (additional context)
- created_at: timestamptz
- updated_at: timestamptz
```

**Sync Modes:**
- **delta**: Only syncs if the item has changed since last sync
- **full**: Always syncs the item, regardless of changes

#### 3. `sync_history`
Tracks all sync operations with detailed metadata.

```sql
- id: uuid (primary key)
- user_id: uuid (foreign key to auth.users, nullable for system syncs)
- sync_type: text (manual, delta, full, scheduled)
- status: text (completed, failed, partial_success)
- items_processed: integer
- items_created: integer
- items_updated: integer
- items_failed: integer
- duration_ms: integer
- metadata: jsonb (detailed sync information)
- created_at: timestamptz
```

### Row Level Security (RLS)

All tables have RLS enabled with policies ensuring users can only:
- View their own data
- Insert their own data
- Update their own data
- Delete their own data

System-level operations (like scheduled syncs) use service role keys to bypass RLS.

## Frontend Components

### SyncManagement.tsx

Main React component with three tabs:

1. **Saved Patterns Tab**
   - View all saved search patterns
   - Apply pattern to load filters
   - Save current filters as pattern
   - Delete patterns

2. **Sync List Tab**
   - View all items in sync list
   - Toggle sync mode (delta/full)
   - Manually trigger sync for specific items
   - Remove items from sync list
   - Filter by status and type

3. **History Tab**
   - View recent sync operations
   - Filter by sync type and status
   - See detailed metrics (processed, created, updated, failed)
   - View timestamps and duration

### ProductSyncPreview.tsx Integration

The "Add to Sync List" button allows users to:
- Add products from preview directly to sync list
- Automatically set sync mode to delta
- Store filter configuration used for discovery
- Include metadata (name, SKU, price)

## Backend Edge Functions

### 1. delta-sync

**Endpoint:** `/functions/v1/delta-sync`

**Purpose:** Synchronize only items that have changed since last sync.

**Request:**
```json
{
  "syncListIds": ["uuid1", "uuid2"],  // Optional: specific items
  "itemType": "product"                // Optional: filter by type
}
```

**Response:**
```json
{
  "syncHistoryId": "uuid",
  "status": "completed",
  "itemsProcessed": 10,
  "itemsCreated": 3,
  "itemsUpdated": 5,
  "itemsFailed": 2,
  "duration": 5234,
  "errors": [
    {
      "itemId": "uuid",
      "error": "Error message"
    }
  ]
}
```

**Logic:**
1. Fetch active sync list items (filtered if specified)
2. For each item:
   - Compare `last_synced_at` with source item's `lastModified`
   - If changed or never synced:
     - Create new item in target (if no target_id)
     - Update existing item (if target_id exists)
   - Update sync list with result
3. Create sync history record

### 2. scheduled-sync

**Endpoint:** `/functions/v1/scheduled-sync`

**Purpose:** Automated sync triggered by cron jobs or schedulers.

**Authentication:** Service role key (bypasses user authentication)

**Request:**
```json
{}  // No body required
```

**Response:**
```json
{
  "totalUsers": 5,
  "totalItems": 50,
  "itemsProcessed": 48,
  "itemsSucceeded": 45,
  "itemsFailed": 3,
  "duration": 15234,
  "userResults": [
    {
      "userId": "uuid",
      "itemsProcessed": 10,
      "itemsSucceeded": 9,
      "itemsFailed": 1,
      "errors": ["item1: Network timeout"]
    }
  ]
}
```

**Logic:**
1. Fetch all active sync list items across all users
2. Group by user
3. For each user:
   - Call delta-sync function with user's items
   - Aggregate results
4. Create system-level sync history record
5. Return aggregated results

## Usage Examples

### Frontend: Save a Search Pattern

```typescript
const savePattern = async () => {
  const { data, error } = await supabase
    .from('saved_search_patterns')
    .insert({
      name: 'Active Electronics',
      description: 'All active electronic products',
      direction: 'netsuite-to-shopify',
      filter_config: {
        status: ['active'],
        category: 'Electronics',
        priceMin: 10
      }
    })
    .select()
    .single()
  
  if (error) console.error('Error saving pattern:', error)
  else console.log('Pattern saved:', data)
}
```

### Frontend: Add Item to Sync List

```typescript
const addToSyncList = async (product: Product) => {
  const { data, error } = await supabase
    .from('sync_list')
    .insert({
      item_type: 'product',
      source_platform: 'netsuite',
      target_platform: 'shopify',
      source_id: product.id,
      sync_mode: 'delta',
      is_active: true,
      metadata: {
        name: product.name,
        sku: product.sku
      }
    })
    .select()
    .single()
  
  if (error) console.error('Error adding to sync list:', error)
  else console.log('Added to sync list:', data)
}
```

### Frontend: Trigger Manual Sync

```typescript
const triggerSync = async (itemIds: string[]) => {
  const response = await fetch('/functions/v1/delta-sync', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ syncListIds: itemIds })
  })
  
  const result = await response.json()
  console.log('Sync result:', result)
}
```

### Backend: Setup Cron Job

To setup automatic scheduled syncs, configure a cron job or use Supabase Edge Functions with pg_cron:

```sql
-- Example: Run scheduled sync every hour
SELECT cron.schedule(
  'scheduled-sync',
  '0 * * * *',  -- Every hour
  $$
  SELECT net.http_post(
    url := 'https://your-project.supabase.co/functions/v1/scheduled-sync',
    headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  )
  $$
);
```

## Best Practices

1. **Use Delta Sync for Efficiency**
   - Set items to delta mode for automatic change detection
   - Reduces API calls and processing time
   - Ideal for frequently synced items

2. **Use Full Sync Sparingly**
   - Only for items that need guaranteed consistency
   - Use for critical data or troubleshooting
   - Consider scheduling full syncs during off-peak hours

3. **Monitor Sync History**
   - Regularly check for failed syncs
   - Investigate patterns in failures
   - Use metadata for debugging

4. **Manage Sync Lists**
   - Remove inactive or obsolete items
   - Group similar items using saved patterns
   - Keep sync lists organized by type/category

5. **Error Handling**
   - Failed syncs don't stop the batch
   - Errors are logged with context
   - Items can be retried individually

## Troubleshooting

### Sync List Item Not Syncing

1. Check `is_active` is `true`
2. Verify connections are active
3. Check `last_sync_status` and `error_message`
4. Ensure source item exists in source platform

### Delta Sync Not Detecting Changes

1. Verify source platform returns `lastModified` or `updated_at`
2. Check `last_synced_at` is being updated correctly
3. Consider using full sync mode temporarily
4. Check system timezone consistency

### Scheduled Sync Not Running

1. Verify cron job is configured
2. Check service role key is valid
3. Review function logs for errors
4. Ensure database policies allow system access

## Future Enhancements

1. **Conflict Resolution**
   - Bidirectional sync with conflict detection
   - Custom resolution strategies

2. **Selective Field Sync**
   - Choose which fields to sync per item
   - Field-level change detection

3. **Batch Prioritization**
   - Priority queues for critical items
   - Throttling for rate limit management

4. **Advanced Scheduling**
   - Per-item schedules
   - Business hours only syncs
   - Retry policies

5. **Webhooks Integration**
   - Trigger syncs on platform events
   - Real-time synchronization

## Support

For issues or questions:
- Check sync_history for detailed error logs
- Review RLS policies if permission errors occur
- Ensure API credentials are valid
- Contact support with sync_history_id for specific issues

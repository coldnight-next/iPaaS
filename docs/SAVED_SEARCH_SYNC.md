# NetSuite Saved Search Sync List

## Overview

This feature implements Celigo-like saved search functionality, allowing you to create reusable search patterns that automatically populate your sync list with matching products from NetSuite.

## Key Features

### 1. **Two Pattern Types**

#### Filter-Based Patterns
- Store filter criteria from the Product Sync Preview
- Search by SKU, name, price range, inventory, etc.
- Automatically queries all NetSuite item types (inventory, non-inventory, assembly, kit, service)

#### NetSuite Saved Search Patterns
- Reference existing NetSuite saved searches by ID
- Leverage your existing NetSuite reporting infrastructure
- Supports custom search IDs (e.g., `customsearch_my_items` or numeric IDs)

### 2. **Sync List Population**

The sync list now persists properly and supports two population methods:

#### Manual Population
- Click **"Populate"** to add items from the pattern to your existing sync list
- Existing items are updated, new items are added
- Your current sync list remains intact

#### Replace All
- Click **"Replace All"** to clear your entire sync list and populate fresh
- Useful for complete refreshes based on new criteria
- Requires confirmation before executing

### 3. **Auto-Population (Coming Soon)**
- Set patterns to automatically refresh on a schedule
- Frequencies: Hourly, Daily, Weekly
- Keeps your sync list up-to-date with NetSuite data

## How to Use

### Creating a Saved Search Pattern

1. **Navigate to Sync Automation → Saved Patterns**
2. Click **"Create New Pattern"**
3. Fill in the form:
   - **Pattern Name**: Descriptive name (e.g., "Active Electronics")
   - **Description**: Optional notes about the pattern
   - **NetSuite Saved Search ID**: (Optional) Enter your NetSuite saved search ID
   - **Sync Direction**: Choose NetSuite → Shopify, Shopify → NetSuite, or Bidirectional
   - **Auto-populate**: Enable for scheduled refreshes (future feature)
   - **Population Frequency**: Choose refresh schedule if auto-populate is enabled

### Using Filter-Based Patterns

1. Go to **Product Sync Preview**
2. Configure your filters (SKU, price range, inventory, dates, etc.)
3. Click **"Fetch Products"** to preview results
4. Return to **Sync Automation → Saved Patterns**
5. Create a new pattern (filters are automatically captured)
6. Click **"Populate"** to add matching items to sync list

### Using NetSuite Saved Search Patterns

1. Create a saved search in NetSuite with your desired criteria
2. Note the saved search ID (visible in NetSuite URL or search settings)
3. In iPaaS, go to **Sync Automation → Saved Patterns**
4. Create a new pattern and enter the NetSuite saved search ID
5. Click **"Populate"** to fetch items from NetSuite and add to sync list

### Adding Individual Products to Sync List

From the **Product Sync Preview** page:
1. Fetch products using your filters
2. Click **"Add to Sync List"** button next to any product
3. The product is immediately added to your persistent sync list

## Database Schema

### `saved_search_patterns` Table
```sql
- id: UUID (primary key)
- user_id: UUID (references auth.users)
- name: TEXT (required)
- description: TEXT
- filters: JSONB (filter criteria)
- sync_direction: TEXT (netsuite-to-shopify | shopify-to-netsuite | bidirectional)
- netsuite_saved_search_id: TEXT (optional NetSuite search ID)
- shopify_collection_id: TEXT (optional Shopify collection ID)
- auto_populate: BOOLEAN (enable automatic refresh)
- population_frequency: TEXT (manual | hourly | daily | weekly)
- last_populated_at: TIMESTAMPTZ (timestamp of last population)
- is_active: BOOLEAN
- created_at: TIMESTAMPTZ
- updated_at: TIMESTAMPTZ
```

### `sync_list` Table
```sql
- id: UUID (primary key)
- user_id: UUID (references auth.users)
- netsuite_item_id: TEXT (NetSuite internal ID)
- shopify_product_id: TEXT (Shopify product ID)
- sku: TEXT (required, unique per user)
- product_name: TEXT (required)
- sync_direction: TEXT (netsuite-to-shopify | shopify-to-netsuite | bidirectional)
- sync_mode: TEXT (delta | full)
- last_synced_at: TIMESTAMPTZ
- last_sync_status: TEXT (success | failed | pending)
- last_sync_error: TEXT
- sync_count: INTEGER
- is_active: BOOLEAN
- metadata: JSONB (additional product info)
- created_at: TIMESTAMPTZ
- updated_at: TIMESTAMPTZ
```

## API Endpoints

### `populate-sync-list`
Populates the sync list from a saved search pattern.

**Endpoint:** `POST /functions/v1/populate-sync-list`

**Request Body:**
```json
{
  "patternId": "uuid-of-saved-pattern",
  "syncDirection": "netsuite-to-shopify",  // Optional override
  "clearExisting": false  // Set to true for "Replace All"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Sync list populated successfully",
  "stats": {
    "total": 150,
    "inserted": 120,
    "updated": 30,
    "failed": 0
  }
}
```

**Features:**
- Automatic OAuth token refresh if expired
- Queries NetSuite saved searches or uses filter criteria
- Upserts items (updates existing, inserts new)
- Tracks population timestamp on pattern

## NetSuite Saved Search Requirements

For best results, your NetSuite saved search should return these columns:
- **Internal ID** (`id` or `internalId`)
- **Item ID/SKU** (`itemid` or `sku`)
- **Display Name** (`displayname` or `name`)
- **Base Price** (`baseprice` or `price`)
- **Quantity Available** (`quantityavailable` or `quantity`)

The system will adapt to whatever fields are returned, but these provide the best sync experience.

## Benefits Over Manual Item Selection

### Like Celigo's Approach:
1. **Reusable Patterns**: Create once, use many times
2. **Bulk Operations**: Populate hundreds of items instantly
3. **Dynamic Updates**: Refresh sync list as NetSuite data changes
4. **NetSuite Integration**: Leverage existing saved searches
5. **Consistent Criteria**: Ensure same items are selected each time

### Improvements Over Basic Sync:
1. **Persistent Sync List**: Items remain until manually removed
2. **Delta Sync Support**: Sync only changed items (efficient)
3. **History Tracking**: See when and how items were synced
4. **Flexible Scheduling**: Auto-refresh on your schedule (coming soon)

## Workflow Example

### Scenario: Sync All Active Electronics

1. **In NetSuite:**
   - Create saved search: "Active Electronics Items"
   - Set criteria: Item Type = Inventory, Category = Electronics, Inactive = False
   - Note search ID: `customsearch_123`

2. **In iPaaS:**
   - Navigate to Sync Automation → Saved Patterns
   - Create new pattern:
     - Name: "Active Electronics"
     - NetSuite Saved Search ID: `customsearch_123`
     - Sync Direction: NetSuite → Shopify
   - Click "Populate"

3. **Result:**
   - All matching items added to sync list
   - Navigate to Sync List tab to see items
   - Click "Sync Now" on individual items or bulk sync

4. **Ongoing:**
   - As you add/remove electronics in NetSuite
   - Click "Populate" again to refresh sync list
   - Or enable auto-populate for automatic updates

## Troubleshooting

### Items Not Persisting
✅ **Fixed!** The schema mismatch has been resolved. Items now properly persist in the sync_list table.

### NetSuite Saved Search Not Found
- Verify the saved search ID is correct
- Ensure the search is not marked as "Private" in NetSuite
- Check that your NetSuite connection has access to the search

### Token Expired Errors
The system now automatically refreshes expired tokens. If issues persist:
- Reconnect your NetSuite connection from Settings → Connections
- Check that your OAuth credentials are still valid

### No Items Returned
- Verify the saved search has results in NetSuite
- Check filter criteria if using filter-based patterns
- Review edge function logs in Supabase for detailed errors

## Future Enhancements

1. **Scheduled Auto-Population**: Automatic background refresh of sync lists
2. **Shopify Collection Support**: Similar functionality for Shopify collections
3. **Pattern Templates**: Pre-built patterns for common use cases
4. **Conflict Resolution**: Handle items that exist in multiple patterns
5. **Sync Queue**: Batch processing of large sync lists
6. **Analytics Dashboard**: Track sync performance and history

## Migration Notes

If you have existing sync list items that aren't persisting:
1. The database schema has been updated to fix the mismatch
2. Re-add items using the "Add to Sync List" button
3. Or use "Populate" from a saved pattern to bulk-add items
4. Old items with incorrect schema will need to be manually cleaned up

## Support

For issues or questions:
- Check the edge function logs in Supabase Dashboard
- Review the `sync_history` table for sync execution details
- Verify NetSuite and Shopify connections are active
- Ensure OAuth tokens haven't expired

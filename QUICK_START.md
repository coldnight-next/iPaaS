# 🚀 Quick Start Guide - iPaaS Platform

## Get Started in 5 Minutes

### Prerequisites
- ✅ Shopify store with admin access
- ✅ NetSuite account with API access
- ✅ Your iPaaS platform deployed on Supabase

---

## Step 1: Add Routes to Your App (2 minutes)

```typescript
// src/App.tsx or your router file
import OrderSyncDashboard from '@/components/OrderSyncDashboard'
import ProductMappingManager from '@/components/ProductMappingManager'

// Add these routes:
<Route path="/orders/sync" element={<OrderSyncDashboard />} />
<Route path="/products/mappings" element={<ProductMappingManager />} />
```

---

## Step 2: Connect Your Platforms (Already Done?)

If not already connected:

1. **Shopify**: Go to your connections page, add Shopify credentials
2. **NetSuite**: Add NetSuite OAuth connection

---

## Step 3: Map Your Products (3 minutes)

1. Navigate to `/products/mappings`
2. Click **"Auto-Match by SKU"** button
3. Manually map any remaining unmapped products
4. Done! ✅

---

## Step 4: Sync Your First Orders (1 minute)

1. Navigate to `/orders/sync`
2. Set **Limit** to `5` (for testing)
3. Click **"Start Sync"**
4. Watch the results appear! 🎉

---

## Step 5: Set Up Webhooks (Optional - 2 minutes)

For real-time syncing:

1. Go to Shopify Admin → Settings → Notifications → Webhooks
2. Add webhook: `https://mkeillycpwenoeuzwjsm.supabase.co/functions/v1/shopify-webhook`
3. Subscribe to topics:
   - `orders/create`
   - `orders/updated`
   - `products/create`
   - `products/update`

---

## Common Operations

### Sync Orders

```typescript
// Via UI: Go to /orders/sync and click "Start Sync"

// Via API:
const { data } = await supabase.functions.invoke('sync-orders', {
  body: { limit: 50 }
})
```

### Sync Inventory

```typescript
const { data } = await supabase.functions.invoke('sync-inventory', {
  body: { 
    threshold: 5,    // Only update if difference > 5
    fullSync: false  // Incremental sync
  }
})
```

### Sync Fulfillments

```typescript
const { data } = await supabase.functions.invoke('sync-fulfillments', {
  body: { 
    direction: 'netsuite_to_shopify'  // NetSuite → Shopify
  }
})
```

---

## Monitoring Your Syncs

### Via UI
- Orders: `/orders/sync` → "Sync History" tab
- Errors: Check the red badges and error messages

### Via Database
```sql
-- Recent syncs
SELECT * FROM sync_logs 
WHERE user_id = 'your-id'
ORDER BY started_at DESC 
LIMIT 10;

-- Failed syncs
SELECT * FROM sync_logs 
WHERE status = 'failed';
```

---

## Troubleshooting

### Orders not syncing?
1. ✅ Check if products are mapped
2. ✅ Verify Shopify/NetSuite connections are active
3. ✅ Review error messages in sync results

### Inventory not updating?
1. ✅ Check item mappings exist
2. ✅ Verify threshold settings
3. ✅ Check Shopify location configuration

---

## API Endpoints

All deployed and ready to use:

```bash
# Order Sync
POST https://mkeillycpwenoeuzwjsm.supabase.co/functions/v1/sync-orders

# Inventory Sync
POST https://mkeillycpwenoeuzwjsm.supabase.co/functions/v1/sync-inventory

# Fulfillment Sync
POST https://mkeillycpwenoeuzwjsm.supabase.co/functions/v1/sync-fulfillments

# Webhooks
POST https://mkeillycpwenoeuzwjsm.supabase.co/functions/v1/shopify-webhook
```

---

## What's Included

✅ **Order Sync** - Shopify → NetSuite  
✅ **Product Mapping** - Auto-match by SKU  
✅ **Inventory Sync** - NetSuite → Shopify  
✅ **Fulfillment Sync** - Bidirectional  
✅ **Real-time Webhooks** - Automatic processing  
✅ **Error Handling** - Comprehensive logging  
✅ **UI Dashboards** - Ready to use  

---

## Next Steps

1. ✅ Sync your first 5-10 orders
2. ✅ Verify they appear correctly in NetSuite
3. ✅ Set up product mappings
4. ✅ Enable webhooks for real-time sync
5. ✅ Schedule regular inventory syncs

---

## Need Help?

- **Full Documentation**: `CELIGO_PARITY_COMPLETE.md`
- **API Reference**: `docs/ORDER_SYNC_API_REFERENCE.md`
- **Order Sync Details**: `docs/ORDER_SYNC.md`
- **UI Components**: `UI_COMPONENTS_IMPLEMENTATION.md`

---

**🎉 You're ready to go! Start syncing your data now.**

**Status**: ✅ **PRODUCTION READY**

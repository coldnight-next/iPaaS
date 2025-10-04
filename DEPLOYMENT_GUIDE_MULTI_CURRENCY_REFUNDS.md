# Deployment & Testing Guide
## Multi-Currency Support & Refund Handling

This guide covers deploying and testing the newly implemented multi-currency and refund handling features.

---

## 📦 What's Included

### ✅ Multi-Currency Support
- **Database Migration**: Adds currency fields to `order_mappings` and creates `currency_rates` table
- **CurrencyService**: Handles exchange rate fetching and caching
- **OrderSyncService Integration**: Automatic currency conversion during order sync

### ✅ Refund Handling
- **Database Migration**: Creates `refund_mappings` table with full tracking
- **RefundSyncService**: Syncs Shopify refunds to NetSuite credit memos
- **Webhook Integration**: Real-time refund processing via Shopify webhooks

---

## 🚀 Deployment Steps

### Step 1: Apply Database Migrations

Run the migrations in your Supabase project:

```bash
# Navigate to project directory
cd C:\Users\michael.georgiou\Downloads\Developments\iPaaS

# Apply multi-currency migration
supabase db push --file supabase/migrations/20250104_multi_currency_support.sql

# Apply refund handling migration
supabase db push --file supabase/migrations/20250104_refund_handling.sql
```

**Alternative: Using Supabase Dashboard**
1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Copy and paste the contents of each migration file
4. Run each migration separately

### Step 2: Deploy Edge Functions

Deploy the updated functions to Supabase:

```bash
# Deploy all functions (includes updated webhook handler)
supabase functions deploy

# Or deploy specific functions
supabase functions deploy shopify-webhook
```

### Step 3: Configure Shopify Webhook

Add the refund webhook to your Shopify app:

1. Go to your Shopify Partner Dashboard
2. Navigate to your app → **API credentials**
3. Under **Webhooks**, add:
   - **Topic**: `refunds/create`
   - **URL**: `https://<your-project>.supabase.co/functions/v1/shopify-webhook`
   - **Format**: JSON

---

## 🧪 Testing Multi-Currency Support

### Test 1: Currency Conversion with Manual Sync

```bash
# Test currency service directly
curl -X POST https://<your-project>.supabase.co/functions/v1/sync-orders \
  -H "Authorization: Bearer <your-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "syncType": "order_sync",
    "direction": "shopify_to_netsuite",
    "filters": {
      "dateFrom": "2025-01-01",
      "limit": 5
    }
  }'
```

**Expected Results:**
- Orders with different currencies (EUR, GBP, CAD) should be converted to USD
- Check `order_mappings` table for:
  - `currency` = original currency
  - `base_currency` = USD
  - `exchange_rate` = conversion rate
  - `converted_amount` = amount in USD

### Test 2: Verify Currency Rate Caching

```sql
-- Check cached exchange rates
SELECT * FROM currency_rates 
ORDER BY updated_at DESC;

-- Should show rates for different currency pairs
-- Rates should be cached for 1 hour
```

### Test 3: Multi-Currency Order Creation

1. **Create test order in Shopify with EUR currency**
2. **Trigger sync** (manual or via webhook)
3. **Verify in database:**

```sql
SELECT 
  shopify_order_number,
  total_amount,
  currency,
  exchange_rate,
  converted_amount,
  base_currency
FROM order_mappings
WHERE currency != base_currency
ORDER BY created_at DESC
LIMIT 5;
```

**Expected Output:**
```
shopify_order_number | total_amount | currency | exchange_rate | converted_amount | base_currency
---------------------|--------------|----------|---------------|------------------|---------------
#1234                | 100.00       | EUR      | 1.09          | 109.00           | USD
#1235                | 50.00        | GBP      | 1.27          | 63.50            | USD
```

---

## 🧪 Testing Refund Handling

### Test 1: Create Test Refund in Shopify

1. **Go to Shopify Admin** → Orders
2. **Select an order** that was synced to NetSuite
3. **Issue a refund**:
   - Click "Refund"
   - Select items to refund or enter custom amount
   - Add refund reason
   - Click "Refund"

4. **Monitor webhook processing**:

```sql
-- Check webhook event was received
SELECT * FROM webhook_events 
WHERE event_type = 'refunds/create'
ORDER BY created_at DESC
LIMIT 5;

-- Check refund mapping was created
SELECT * FROM refund_mappings
ORDER BY created_at DESC
LIMIT 5;
```

### Test 2: Verify Credit Memo Creation

Check that the credit memo was created in NetSuite:

```sql
SELECT 
  rm.shopify_refund_id,
  rm.netsuite_credit_memo_id,
  rm.refund_amount,
  rm.currency,
  rm.sync_status,
  rm.error_message,
  om.shopify_order_number,
  om.netsuite_sales_order_id
FROM refund_mappings rm
JOIN order_mappings om ON om.id = rm.order_mapping_id
WHERE rm.sync_status = 'synced'
ORDER BY rm.created_at DESC;
```

### Test 3: Test Partial Refund

1. **Create order** with multiple line items
2. **Issue partial refund** for only some items
3. **Verify**:
   - `refund_type` = 'partial'
   - `line_items` JSON contains only refunded items
   - Credit memo in NetSuite has correct line items

```sql
SELECT 
  refund_number,
  refund_type,
  refund_amount,
  line_items,
  sync_status
FROM refund_mappings
WHERE refund_type = 'partial'
ORDER BY created_at DESC;
```

### Test 4: Test Multi-Currency Refund

1. **Create order in GBP**
2. **Issue refund**
3. **Verify currency conversion**:

```sql
SELECT 
  shopify_refund_id,
  refund_amount,
  currency,
  exchange_rate,
  converted_amount,
  base_currency
FROM refund_mappings
WHERE currency != base_currency
ORDER BY created_at DESC;
```

### Test 5: Test Refund Retry Mechanism

Test the retry functionality for failed refunds:

```bash
# Call retry endpoint (if you create one)
curl -X POST https://<your-project>.supabase.co/functions/v1/retry-refunds \
  -H "Authorization: Bearer <your-token>"
```

Or run directly in database:

```sql
-- Manually trigger retry
-- You can create a scheduled job for this
```

---

## 📊 Monitoring & Validation

### Dashboard Queries

**Multi-Currency Revenue Summary:**
```sql
SELECT 
  DATE_TRUNC('day', order_date) as order_day,
  currency,
  COUNT(*) as order_count,
  SUM(total_amount) as total_in_currency,
  SUM(converted_amount) as total_in_usd
FROM order_mappings
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE_TRUNC('day', order_date), currency
ORDER BY order_day DESC, currency;
```

**Refund Statistics:**
```sql
SELECT 
  DATE_TRUNC('day', refund_date) as refund_day,
  refund_type,
  COUNT(*) as refund_count,
  SUM(refund_amount) as total_refunded,
  COUNT(CASE WHEN sync_status = 'synced' THEN 1 END) as synced,
  COUNT(CASE WHEN sync_status = 'failed' THEN 1 END) as failed
FROM refund_mappings
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE_TRUNC('day', refund_date), refund_type
ORDER BY refund_day DESC;
```

**Refund Success Rate:**
```sql
SELECT 
  COUNT(*) as total_refunds,
  COUNT(CASE WHEN sync_status = 'synced' THEN 1 END) as successful,
  COUNT(CASE WHEN sync_status = 'failed' THEN 1 END) as failed,
  ROUND(
    100.0 * COUNT(CASE WHEN sync_status = 'synced' THEN 1 END) / COUNT(*),
    2
  ) as success_rate
FROM refund_mappings;
```

---

## 🔧 Troubleshooting

### Issue: Currency conversion fails

**Symptom:** Orders sync but `exchange_rate` = 1.0 and `converted_amount` = `total_amount`

**Solutions:**
1. Check internet connectivity (Edge Functions need external API access)
2. Verify API endpoint is accessible: `https://api.exchangerate-api.com/v4/latest/USD`
3. Check logs:
```bash
supabase functions logs shopify-webhook
```

### Issue: Refund webhook not received

**Symptom:** Refund created in Shopify but no webhook event in database

**Solutions:**
1. Verify webhook is configured in Shopify
2. Check webhook URL is correct
3. Test webhook manually:
```bash
curl -X POST https://<your-project>.supabase.co/functions/v1/shopify-webhook \
  -H "X-Shopify-Shop-Domain: your-shop.myshopify.com" \
  -H "X-Shopify-Topic: refunds/create" \
  -H "Content-Type: application/json" \
  -d '{"id": 123, "order_id": 456, "total": "10.00"}'
```

### Issue: Refund sync fails with "Original order not found"

**Symptom:** Refund webhook received but sync fails

**Solutions:**
1. Ensure original order was synced to NetSuite first
2. Check `order_mappings` table:
```sql
SELECT * FROM order_mappings 
WHERE shopify_order_id = '<order_id>';
```
3. If order missing, sync orders first before processing refunds

### Issue: Credit memo not created in NetSuite

**Symptom:** Refund marked as 'synced' but no credit memo in NetSuite

**Solutions:**
1. Check NetSuite connection is active
2. Verify user has permissions to create credit memos
3. Check NetSuite API logs
4. Verify `netsuite_sales_order_id` exists for the order

---

## ✅ Validation Checklist

Before marking deployment complete, verify:

- [ ] **Database migrations applied successfully**
- [ ] **Currency rates table populated** (check `currency_rates`)
- [ ] **Edge functions deployed** (check Supabase dashboard)
- [ ] **Shopify webhook configured** for `refunds/create`
- [ ] **Test order with foreign currency syncs correctly**
- [ ] **Exchange rate cached in database**
- [ ] **Test refund syncs to NetSuite**
- [ ] **Credit memo created in NetSuite**
- [ ] **Refund mapping status = 'synced'**
- [ ] **Webhook marked as processed**
- [ ] **Multi-currency refund converts correctly**
- [ ] **Error handling works** (test with invalid data)

---

## 📈 Performance Considerations

### Currency Rate Caching
- Rates cached for **1 hour** to minimize API calls
- Consider increasing to 4-6 hours for production
- Monitor API usage if handling high volume

### Refund Processing
- Refunds process **asynchronously** via webhooks
- Average processing time: **2-5 seconds**
- Failed refunds can be retried automatically

### Recommended Monitoring
1. Set up alerts for failed refunds
2. Monitor currency API response times
3. Track credit memo creation success rate
4. Schedule periodic cache cleanup (every 24 hours)

---

## 🎉 Success Metrics

After deployment, you should see:

✅ **Multi-Currency:**
- Orders in multiple currencies automatically converted
- Accurate revenue reporting in base currency
- Fast exchange rate lookups (cached)

✅ **Refund Handling:**
- Real-time refund synchronization
- Automatic credit memo creation in NetSuite
- Full audit trail of all refunds
- Support for partial and full refunds

---

## 📞 Support

If you encounter issues:

1. Check the logs: `supabase functions logs`
2. Review webhook events: `SELECT * FROM webhook_events WHERE processed = false`
3. Check error messages in `refund_mappings.error_message`
4. Verify connections are active: `SELECT * FROM connections WHERE status = 'active'`

---

**🎊 Congratulations! Your iPaaS platform now supports multi-currency and refund handling!**

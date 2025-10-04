# 🚀 Manual Deployment Guide

## Deploy All 3 Features in 10 Minutes

Follow these steps to deploy multi-currency, refund handling, and multiple store support.

---

## Step 1: Deploy Database Migrations (5 minutes)

### Option A: Using Supabase Dashboard (Recommended)

1. **Open your Supabase project dashboard**
   - Go to https://app.supabase.com
   - Select your project

2. **Navigate to SQL Editor**
   - Click "SQL Editor" in the left sidebar

3. **Run Multi-Currency Migration**
   - Click "New query"
   - Open: `supabase/migrations/20250104_multi_currency_support.sql`
   - Copy entire contents
   - Paste into SQL Editor
   - Click "Run" (or press Ctrl+Enter)
   - ✅ Should see "Success. No rows returned"

4. **Run Refund Handling Migration**
   - Click "New query"
   - Open: `supabase/migrations/20250104_refund_handling.sql`
   - Copy entire contents
   - Paste into SQL Editor
   - Click "Run"
   - ✅ Should see "Success. No rows returned"

5. **Run Multiple Store Support Migration**
   - Click "New query"
   - Open: `supabase/migrations/20250104_multiple_store_support.sql`
   - Copy entire contents
   - Paste into SQL Editor
   - Click "Run"
   - ✅ Should see "Success. No rows returned"

### Option B: Using Supabase CLI

```bash
cd C:\Users\michael.georgiou\Downloads\Developments\iPaaS

# Link to your project (if not already)
# supabase link --project-ref your-project-ref

# Apply migrations
supabase db push supabase/migrations/20250104_multi_currency_support.sql
supabase db push supabase/migrations/20250104_refund_handling.sql
supabase db push supabase/migrations/20250104_multiple_store_support.sql
```

### Verify Migrations

Run this in SQL Editor to verify:

```sql
-- Check new tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('currency_rates', 'refund_mappings', 'user_preferences');

-- Should return 3 rows
```

---

## Step 2: Deploy Edge Functions (2 minutes)

### Option A: Using Supabase Dashboard

1. Go to "Edge Functions" in dashboard
2. Find `shopify-webhook` function
3. Click "Deploy"
4. Select the updated code
5. Deploy

### Option B: Using Supabase CLI

```bash
cd C:\Users\michael.georgiou\Downloads\Developments\iPaaS

# Deploy updated webhook function
supabase functions deploy shopify-webhook
```

### Verify Function

```bash
# Test the function is deployed
supabase functions list

# Should show shopify-webhook with recent deployment time
```

---

## Step 3: Configure Shopify Webhook (1 minute)

Add refund webhook in Shopify:

1. Go to Shopify Partner Dashboard
2. Select your app
3. Go to "API credentials" → "Webhooks"
4. Click "Add webhook"
5. Set:
   - **Topic**: `refunds/create`
   - **URL**: `https://YOUR_PROJECT.supabase.co/functions/v1/shopify-webhook`
   - **Format**: JSON
6. Save

---

## Step 4: Update Frontend Code (2 minutes)

### 4.1 Wrap App with StoreProvider

Find your `src/App.tsx` or main app file and update:

```typescript
// Add import
import { StoreProvider } from './contexts/StoreContext';

// Wrap your app
function App() {
  return (
    <AuthProvider>
      <StoreProvider>  {/* ADD THIS */}
        {/* Your existing app code */}
        <Router>
          <Routes>
            {/* routes */}
          </Routes>
        </Router>
      </StoreProvider>  {/* ADD THIS */}
    </AuthProvider>
  );
}
```

### 4.2 Add Store Selector to Navigation

In your navigation/header component:

```typescript
// Add import
import { StoreSelectorCompact } from '@/components/StoreSelector';

// Add to your nav
<nav>
  {/* Your existing nav items */}
  <StoreSelectorCompact />  {/* ADD THIS */}
</nav>
```

### 4.3 Add Stores Route

In your router configuration:

```typescript
// Add import
import { Stores } from '@/pages/Stores';

// Add route
<Routes>
  {/* Your existing routes */}
  <Route path="/stores" element={<Stores />} />  {/* ADD THIS */}
</Routes>
```

---

## Step 5: Test Everything (OPTIONAL - 5 minutes)

### Test Multi-Currency

1. Go to Supabase Dashboard → SQL Editor
2. Run:
```sql
-- Insert a test currency rate
INSERT INTO currency_rates (from_currency, to_currency, rate)
VALUES ('EUR', 'USD', 1.09);

-- Verify
SELECT * FROM currency_rates;
```

### Test Refund Handling

1. Run in SQL Editor:
```sql
-- Check refund_mappings table exists
SELECT * FROM refund_mappings LIMIT 1;
```

### Test Multiple Stores

1. Run in SQL Editor:
```sql
-- Check store statistics view
SELECT * FROM store_statistics;

-- Check user preferences table
SELECT * FROM user_preferences;
```

---

## ✅ Verification Checklist

After deployment, verify:

- [ ] `currency_rates` table exists
- [ ] `refund_mappings` table exists
- [ ] `user_preferences` table exists
- [ ] `store_statistics` view exists
- [ ] `shopify-webhook` function deployed
- [ ] Shopify refund webhook configured
- [ ] StoreProvider wraps your app
- [ ] Store selector appears in nav (if multiple stores)
- [ ] /stores route accessible

---

## 🎉 You're Done!

Your platform now has:
- ✅ Multi-Currency Support
- ✅ Refund Handling
- ✅ Multiple Store Support

### Next: Test with Real Data

1. Create a test order in Shopify (EUR or GBP)
2. Sync the order → Should see currency conversion
3. Issue a refund → Should create credit memo in NetSuite
4. Connect a second store → Should see store selector

---

## 🐛 Troubleshooting

### Migration Errors

If you get errors running migrations:

1. **"relation already exists"**: Table already created, safe to ignore
2. **"column already exists"**: Column already added, safe to ignore
3. **Permission denied**: Make sure you're using service role key

### Function Deployment Errors

1. **"Function not found"**: Make sure you're in the correct directory
2. **"Invalid credentials"**: Run `supabase login` first

### Need Help?

1. Check Supabase logs: Dashboard → Logs
2. Check function logs: Dashboard → Edge Functions → shopify-webhook → Logs
3. Run SQL queries from testing sections above

---

## 📚 What's Next?

Now that features are deployed, you can:

1. **Start Using**: Accept multi-currency orders, process refunds
2. **Add More Stores**: Connect additional Shopify stores
3. **Implement Next Features**: Custom Field Mapping, Analytics Dashboard

See `FEATURES_COMPLETE_SUMMARY.md` for full feature list!

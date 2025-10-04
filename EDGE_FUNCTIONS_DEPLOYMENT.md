# 🚀 Edge Functions Deployment Guide

## Issue: NetSuite/Shopify Connect Buttons Not Working

When you click "Connect NetSuite" or "Connect Shopify", the app tries to call Supabase Edge Functions that need to be deployed.

---

## ✅ **Quick Solution**

### **Option 1: Install Supabase CLI and Deploy** (Recommended)

#### 1. Install Supabase CLI

**Windows (PowerShell):**
```powershell
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
```

**Or via npm:**
```bash
npm install -g supabase
```

#### 2. Login to Supabase
```bash
supabase login
```

#### 3. Link to Your Project
```bash
cd C:\Users\michael.georgiou\Downloads\Developments\iPaaS
supabase link --project-ref YOUR_PROJECT_REF
```

**To get your project ref:**
- Go to https://app.supabase.com
- Select your project
- Go to Settings → General
- Copy the "Reference ID"

#### 4. Deploy Edge Functions
```bash
supabase functions deploy oauth-start
supabase functions deploy oauth-callback
supabase functions deploy shopify-webhook
supabase functions deploy sync-orders
supabase functions deploy sync-inventory
supabase functions deploy sync-fulfillments
supabase functions deploy sync
```

#### 5. Set Environment Variables

Go to https://app.supabase.com → Your Project → Edge Functions → Manage secrets

Add these secrets:
```
SHOPIFY_APP_KEY=your_shopify_client_id
SHOPIFY_APP_SECRET=your_shopify_client_secret
SHOPIFY_APP_SCOPES=read_products,write_products,read_orders,write_orders,read_inventory,write_inventory

NETSUITE_CLIENT_ID=your_netsuite_client_id
NETSUITE_CLIENT_SECRET=your_netsuite_client_secret
NETSUITE_ACCOUNT_ID=your_netsuite_account_id

EXCHANGERATE_API_KEY=your_exchangerate_api_key (optional)
```

---

### **Option 2: Manual Upload via Supabase Dashboard**

1. Go to https://app.supabase.com
2. Select your project
3. Go to "Edge Functions"
4. Click "Deploy a new function"
5. Upload each function folder:
   - `supabase/functions/oauth-start`
   - `supabase/functions/oauth-callback`
   - `supabase/functions/shopify-webhook`
   - etc.

---

## 🔧 **What Each Function Does**

| Function | Purpose |
|----------|---------|
| `oauth-start` | Initiates OAuth flow for Shopify/NetSuite |
| `oauth-callback` | Handles OAuth redirect after authorization |
| `shopify-webhook` | Receives real-time webhooks from Shopify |
| `sync-orders` | Synchronizes orders between platforms |
| `sync-inventory` | Synchronizes inventory levels |
| `sync-fulfillments` | Synchronizes fulfillment status |
| `sync` | Main sync orchestrator |

---

## 🔑 **Getting OAuth Credentials**

### **For Shopify:**
1. Go to https://partners.shopify.com
2. Create a new app
3. Get Client ID and Client Secret
4. Set redirect URL: `https://YOUR_PROJECT.supabase.co/functions/v1/oauth-callback`

### **For NetSuite:**
1. Log into NetSuite
2. Go to Setup → Integration → Manage Integrations → New
3. Enable OAuth 2.0
4. Get Client ID and Client Secret
5. Set redirect URL: `https://YOUR_PROJECT.supabase.co/functions/v1/oauth-callback`

---

## ⚡ **Quick Test Without OAuth (Development)**

If you want to test the platform without setting up OAuth immediately, you can:

1. **Manually create connection records** in Supabase:
```sql
INSERT INTO connections (user_id, platform, status, credentials, metadata)
VALUES (
  'your_user_id',
  'netsuite',
  'connected',
  '{"access_token": "dummy_token"}'::jsonb,
  '{"account_id": "your_account"}'::jsonb
);
```

2. **Or modify the Dashboard** to show a "Manual Configuration" option temporarily

---

## 🎯 **Next Steps**

1. **Deploy edge functions** (Option 1 above)
2. **Set environment variables** with your OAuth credentials
3. **Test connections** in your app
4. **Monitor logs** in Supabase Dashboard → Edge Functions → Logs

---

## 📞 **Need Help?**

If you encounter issues:
1. Check Edge Function logs in Supabase Dashboard
2. Verify environment variables are set
3. Confirm your Supabase project URL is correct in `.env`

---

**Once deployed, your Connect buttons will work perfectly!** ⚡

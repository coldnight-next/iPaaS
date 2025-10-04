# OAuth Setup Guide for SyncFlow

This guide will walk you through setting up OAuth authentication for both NetSuite and Shopify in your SyncFlow iPaaS platform.

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [NetSuite OAuth Setup](#netsuite-oauth-setup)
4. [Shopify OAuth Setup](#shopify-oauth-setup)
5. [Configuring Supabase Edge Functions](#configuring-supabase-edge-functions)
6. [Testing the OAuth Flow](#testing-the-oauth-flow)
7. [Troubleshooting](#troubleshooting)

---

## Overview

SyncFlow supports two authentication methods:

- **Manual Setup**: Enter API credentials directly (ideal for testing)
- **OAuth Flow**: Production-ready OAuth 2.0 authentication (recommended for production)

This guide focuses on setting up the OAuth flow, which provides better security and user experience.

---

## Prerequisites

Before you begin, ensure you have:

- ✅ Access to your NetSuite account (admin privileges)
- ✅ Access to your Shopify store (admin privileges or App developer access)
- ✅ Supabase project linked and CLI installed
- ✅ Your Supabase project URL and anon key
- ✅ Your deployed frontend URL (e.g., https://ipaas.netlify.app)

---

## NetSuite OAuth Setup

### Step 1: Create an Integration Record

1. **Log into NetSuite** as an administrator
2. Navigate to: **Setup → Integration → Manage Integrations → New**
3. Fill in the integration details:
   - **Name**: `SyncFlow iPaaS Integration`
   - **Description**: `OAuth integration for SyncFlow platform`
   - **State**: Select **Enabled**
   - **Concurrency Limit**: Leave blank or set to a reasonable number (e.g., 10)

4. Under **Authentication**:
   - Check **Token-Based Authentication** ✅
   - Check **OAuth 2.0** ✅
   - Uncheck **User Credentials** ❌

5. Under **OAuth 2.0 Settings**:
   - **Redirect URI**: `https://<YOUR_SUPABASE_PROJECT_REF>.supabase.co/functions/v1/oauth-callback`
     - Example: `https://mkeillycpwenoeuzwjsm.supabase.co/functions/v1/oauth-callback`
   - **Scope**: Select the permissions needed (or leave default)
     - Recommended: RESTlets, REST Web Services, SOAP Web Services

6. Click **Save**

7. **⚠️ IMPORTANT**: After saving, you'll see the **Consumer Key/Client ID** and **Consumer Secret/Client Secret**
   - **Copy these immediately** - they won't be shown again!
   - Store them securely

### Step 2: Note Your Account ID

1. In NetSuite, go to: **Setup → Company → Company Information**
2. Find the **Account ID** field
3. Copy this value (e.g., `1234567` or `TSTDRV1234567`)

### Step 3: Configure Permissions (Optional but Recommended)

1. Navigate to: **Setup → Users/Roles → Manage Roles**
2. Create a new role: **SyncFlow Integration Role**
3. Grant necessary permissions:
   - **Lists → Products → Full**
   - **Lists → Inventory → Full**
   - **Transactions → Sales Orders → Full**
   - **Setup → REST Web Services → Full**

---

## Shopify OAuth Setup

### Step 1: Create a Custom App (If Testing)

**For Development/Testing:**

1. Log into your Shopify admin panel
2. Go to: **Apps → App development → Create an app**
3. Name it: `SyncFlow iPaaS`
4. Click **Create app**

5. Under **Configuration → Admin API integration**:
   - Click **Configure**
   - Select the required scopes:
     - `read_products`
     - `write_products`
     - `read_inventory`
     - `write_inventory`
     - `read_orders`
     - `write_orders`
     - `read_fulfillments`
     - `write_fulfillments`

6. Click **Save**
7. Under **API credentials**:
   - Copy the **API key** (Client ID)
   - Copy the **API secret key** (Client Secret)
   - Click **Install app** to generate an **Admin API access token**
   - Copy the access token (starts with `shpat_`)

### Step 2: Create a Public App (For Production)

**For Production (OAuth Flow):**

1. Go to: https://partners.shopify.com/
2. Sign up for a Shopify Partner account (if you don't have one)
3. In Partners Dashboard, click **Apps → Create app**
4. Choose **Public app**
5. Name: `SyncFlow iPaaS`
6. App URL: `https://ipaas.netlify.app`
7. Redirect URL: `https://<YOUR_SUPABASE_PROJECT_REF>.supabase.co/functions/v1/oauth-callback`

8. Configure API scopes (same as above)

9. Copy credentials:
   - **Client ID** (API Key)
   - **Client Secret** (API Secret Key)

---

## Configuring Supabase Edge Functions

Now that you have your OAuth credentials, you need to configure them in Supabase.

### Method 1: Using Supabase CLI (Recommended)

Open your terminal in the iPaaS project directory:

```powershell
# Set NetSuite credentials
npx supabase secrets set NETSUITE_CLIENT_ID="your_netsuite_consumer_key"
npx supabase secrets set NETSUITE_CLIENT_SECRET="your_netsuite_consumer_secret"
npx supabase secrets set NETSUITE_SCOPES="restlets,rest_webservices"

# Set Shopify credentials
npx supabase secrets set SHOPIFY_APP_KEY="your_shopify_api_key"
npx supabase secrets set SHOPIFY_APP_SECRET="your_shopify_api_secret"
npx supabase secrets set SHOPIFY_APP_SCOPES="read_products,write_products,read_inventory,write_inventory,read_orders,write_orders,read_fulfillments,write_fulfillments"

# Set the callback/redirect URL for OAuth
npx supabase secrets set OAUTH_FUNCTION_BASE_URL="https://<YOUR_SUPABASE_PROJECT_REF>.supabase.co/functions/v1"

# Optional: Set frontend URL for redirects after OAuth
npx supabase secrets set FRONTEND_URL="https://ipaas.netlify.app"
```

Replace placeholders with your actual values:
- `your_netsuite_consumer_key` → NetSuite Consumer Key/Client ID
- `your_netsuite_consumer_secret` → NetSuite Consumer Secret/Client Secret
- `your_shopify_api_key` → Shopify API Key/Client ID
- `your_shopify_api_secret` → Shopify API Secret/Client Secret
- `<YOUR_SUPABASE_PROJECT_REF>` → Your Supabase project reference (e.g., `mkeillycpwenoeuzwjsm`)

### Method 2: Using Supabase Dashboard

1. Go to: https://supabase.com/dashboard/project/<YOUR_PROJECT_REF>
2. Navigate to: **Edge Functions → Manage secrets**
3. Add each secret manually:
   - Click **Add new secret**
   - Enter the **Name** and **Value**
   - Click **Save**

Add these secrets:
- `NETSUITE_CLIENT_ID`
- `NETSUITE_CLIENT_SECRET`
- `NETSUITE_SCOPES`
- `SHOPIFY_APP_KEY`
- `SHOPIFY_APP_SECRET`
- `SHOPIFY_APP_SCOPES`
- `OAUTH_FUNCTION_BASE_URL`
- `FRONTEND_URL`

### Verify Secrets

```powershell
npx supabase secrets list
```

You should see all your secrets listed (values will be hidden).

---

## Testing the OAuth Flow

### Test NetSuite OAuth

1. Go to your SyncFlow dashboard: https://ipaas.netlify.app/dashboard
2. Navigate to **Platform Connections**
3. Enter your **NetSuite Account ID** (e.g., `1234567`)
4. Click **Connect NetSuite**
5. You should be redirected to NetSuite's authorization page
6. Log in and **Authorize** the app
7. You'll be redirected back to SyncFlow with a success message

### Test Shopify OAuth

1. In SyncFlow dashboard, go to **Platform Connections**
2. Enter your Shopify domain (e.g., `your-store.myshopify.com`)
3. Click **Connect Shopify**
4. You should be redirected to Shopify's authorization page
5. Review permissions and click **Install app**
6. You'll be redirected back to SyncFlow with a success message

### Verify Connections

1. Check the **Connected platforms** table
2. Both NetSuite and Shopify should show status: **connected** ✅
3. You should see the shop domain and account ID

---

## Troubleshooting

### Common Issues

#### 1. "NETSUITE_CLIENT_ID must be configured on the server"

**Solution**: You haven't set the Supabase secrets yet. Follow [Configuring Supabase Edge Functions](#configuring-supabase-edge-functions)

#### 2. "Redirect URI mismatch" (NetSuite)

**Solution**: 
- Verify the Redirect URI in NetSuite Integration record matches exactly:
  - `https://<YOUR_SUPABASE_PROJECT_REF>.supabase.co/functions/v1/oauth-callback`
- Make sure there are no trailing slashes or extra characters

#### 3. "App not authorized" (Shopify)

**Solution**:
- For Custom Apps: Make sure you clicked **Install app** in the Shopify admin
- For Public Apps: Verify the app is approved and published in Partner Dashboard

#### 4. "Invalid state parameter"

**Solution**: 
- This usually means the OAuth state doesn't match
- Clear browser cookies and try again
- Check that your database connection is working properly

#### 5. Edge function returns 500 error

**Solution**:
- Check edge function logs:
  ```powershell
  npx supabase functions list
  npx supabase logs functions/oauth-start
  npx supabase logs functions/oauth-callback
  ```
- Verify all environment secrets are set correctly
- Make sure edge functions are deployed:
  ```powershell
  npx supabase functions deploy oauth-start
  npx supabase functions deploy oauth-callback
  ```

### Debugging Tips

1. **Check browser console** for JavaScript errors
2. **Check Network tab** to see the actual request/response
3. **Check Supabase logs**:
   ```powershell
   npx supabase logs functions/oauth-start --follow
   ```
4. **Verify database tables**: Check that connections table exists and has proper schema

---

## Next Steps

After setting up OAuth:

1. ✅ Test synchronization:
   - Go to **Sync Management** in the dashboard
   - Click **Run Sync Now**
   - Monitor the sync logs

2. ✅ Configure field mappings:
   - Navigate to **Field Mapping**
   - Set up product, inventory, and order field mappings

3. ✅ Set up sync schedules:
   - Go to **Sync Profiles**
   - Configure automatic sync intervals

4. ✅ Monitor your integration:
   - Check **Monitoring** for real-time stats
   - Review **Logs** for sync history

---

## Need Help?

If you encounter issues not covered in this guide:

1. Check the main README.md for general setup
2. Review the Edge Functions Deployment Guide
3. Check Supabase documentation: https://supabase.com/docs
4. Check NetSuite SuiteCloud documentation
5. Check Shopify API documentation

---

## Summary Checklist

- [ ] NetSuite Integration Record created
- [ ] NetSuite OAuth 2.0 enabled with correct Redirect URI
- [ ] NetSuite Consumer Key and Secret copied
- [ ] NetSuite Account ID noted
- [ ] Shopify App created (Custom or Public)
- [ ] Shopify API scopes configured
- [ ] Shopify API Key and Secret copied
- [ ] All Supabase secrets configured
- [ ] Edge functions deployed
- [ ] NetSuite OAuth flow tested successfully
- [ ] Shopify OAuth flow tested successfully
- [ ] Connections showing as "connected" in dashboard

---

**You're all set! 🎉** Your SyncFlow platform is now configured with secure OAuth authentication for both NetSuite and Shopify.

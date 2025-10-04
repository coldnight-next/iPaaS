# Quick Start: Manual Credential Setup

This guide will help you quickly set up SyncFlow using manual credential entry for immediate testing.

## What's New? 🎉

You now have **two ways** to connect your platforms:

1. **Manual Setup** (⚡ Fast - 5 minutes) - Perfect for testing
2. **OAuth Flow** (🔒 Secure - 30-60 minutes) - Best for production

## Manual Setup (Quick Testing)

### Step 1: Access Manual Setup

1. Go to https://ipaas.netlify.app/dashboard
2. Click **Manual Setup** in the sidebar (🔒 icon)

### Step 2: Connect NetSuite

**What you need:**
- NetSuite Account ID
- Consumer Key (from Integration Record)
- Consumer Secret (from Integration Record)
- Token ID (from Access Tokens)
- Token Secret (from Access Tokens)

**How to get these:**

1. **Account ID**: 
   - NetSuite → Setup → Company → Company Information
   - Copy the "Account ID" field

2. **Consumer Key & Secret**:
   - NetSuite → Setup → Integration → Manage Integrations → New
   - Name: "SyncFlow Test"
   - Enable: "Token-Based Authentication"
   - Save and copy the Consumer Key and Secret

3. **Token ID & Secret**:
   - NetSuite → Setup → Users/Roles → Access Tokens → New
   - Select your integration
   - Select a user with proper permissions
   - Save and copy Token ID and Secret

**In SyncFlow:**
1. Go to Manual Setup → NetSuite tab
2. Fill in all fields
3. Click "Save NetSuite Credentials"
4. Done! ✅

### Step 3: Connect Shopify

**What you need:**
- Shop Domain (e.g., `your-store.myshopify.com`)
- API Key (Client ID)
- API Secret Key (Client Secret)
- Admin API Access Token (starts with `shpat_`)

**How to get these:**

1. **Create Custom App**:
   - Shopify Admin → Apps → App development → Create an app
   - Name: "SyncFlow Test"
   - Click "Create app"

2. **Configure API Scopes**:
   - Configuration → Admin API integration → Configure
   - Select scopes:
     - `read_products`, `write_products`
     - `read_inventory`, `write_inventory`
     - `read_orders`, `write_orders`
     - `read_fulfillments`, `write_fulfillments`
   - Save

3. **Get Credentials**:
   - API credentials → Copy API key
   - Copy API secret key
   - Click "Install app"
   - Copy the Admin API access token

**In SyncFlow:**
1. Go to Manual Setup → Shopify tab
2. Enter your shop domain
3. Fill in API Key, Secret, and Access Token
4. Click "Save Shopify Credentials"
5. Done! ✅

### Step 4: Verify Connections

1. Go to **Platform Connections** in the sidebar
2. You should see both platforms with status: **connected** ✅
3. Ready to sync!

## Testing Sync

### Option 1: Quick Sync Test

1. Go to **Sync Management**
2. Click **Run Sync Now**
3. Monitor the progress and check logs

### Option 2: Configure Sync Profile

1. Go to **Sync Profiles**
2. Edit the "Default Profile"
3. Configure what data to sync
4. Set sync schedule
5. Save and test

## What's Happening Behind the Scenes?

When you use manual setup:
- ✅ Credentials are **encrypted** and stored in Supabase
- ✅ Connection status is set to **"connected"** immediately
- ✅ No OAuth flow needed
- ✅ Perfect for development and testing
- ⚠️ Less secure than OAuth (only use with test accounts)

## Switching to OAuth Later

Once you're ready for production:

1. Read the full [OAuth Setup Guide](./OAUTH_SETUP_GUIDE.md)
2. Set up OAuth apps in NetSuite and Shopify
3. Configure Supabase secrets
4. Use the OAuth flow in **Platform Connections**
5. Your manual connections will be replaced

## Troubleshooting

### "Failed to save credentials"

**Check:**
- Are you logged in to SyncFlow?
- Is your Supabase connection working?
- Check browser console for errors

### "Connection saved but not showing in table"

**Solution:**
- Refresh the page
- Go to Platform Connections and click "Refresh"

### "Sync not working"

**Check:**
- Are credentials correct?
- Do the NetSuite tokens have proper permissions?
- Does the Shopify app have required scopes?

## Security Note ⚠️

**Manual setup is perfect for:**
- ✅ Development and testing
- ✅ Quick demos
- ✅ Sandbox accounts

**NOT recommended for:**
- ❌ Production environments
- ❌ Accounts with sensitive data
- ❌ Shared/multi-user systems

For production, use the [OAuth Setup Guide](./OAUTH_SETUP_GUIDE.md).

## Next Steps

1. ✅ Test manual connections
2. ✅ Run initial sync
3. ✅ Configure field mappings
4. ✅ Set up sync schedules
5. 📚 Read OAuth guide for production setup

---

## Need Help?

- **Manual Setup Issues**: Check this guide
- **OAuth Setup**: See [OAUTH_SETUP_GUIDE.md](./OAUTH_SETUP_GUIDE.md)
- **General Setup**: See [README.md](../README.md)
- **Edge Functions**: See [EDGE_FUNCTIONS_GUIDE.md](./EDGE_FUNCTIONS_GUIDE.md)

---

**Happy Syncing! 🚀**

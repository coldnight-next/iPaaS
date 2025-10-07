# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is **SyncFlow**, an enterprise-grade Integration Platform as a Service (iPaaS) for NetSuite ↔ Shopify synchronization. The platform provides bidirectional sync for orders, inventory, fulfillments, products, and customers, with advanced features like multi-currency support, refund handling, custom field mapping, and multi-store management.

**Tech Stack:**
- **Frontend**: React 18 + TypeScript + Vite 7 + Ant Design 5.x
- **Backend**: Supabase (PostgreSQL + Edge Functions with Deno)
- **Authentication**: Supabase Auth + OAuth 2.0 for NetSuite
- **APIs**: Shopify Admin API, NetSuite SuiteTalk (SOAP/REST)

## Development Commands

### Frontend Development
```bash
cd frontend
npm run dev           # Start development server (Vite)
npm run build         # Production build
npm run build:check   # Type-check before building
npm run lint          # Run ESLint
npm run preview       # Preview production build
npm run analyze       # Analyze bundle size
```

### Supabase Edge Functions
```bash
# Deploy individual functions
supabase functions deploy <function-name>

# Deploy all functions
supabase functions deploy shopify-webhook
supabase functions deploy sync-orders
supabase functions deploy sync-inventory
supabase functions deploy sync-fulfillments
supabase functions deploy scheduled-sync
supabase functions deploy oauth-callback

# Test functions locally
supabase functions serve

# View function logs
supabase functions logs <function-name>
```

### Database Migrations
```bash
# Apply migrations
supabase db push

# Apply specific migration
supabase db push --file supabase/migrations/<migration-file>.sql

# Reset database (development only)
supabase db reset
```

### Testing
```bash
# Run tests
cd frontend && npm test

# Run specific test file
npm test -- <test-file-name>
```

## Architecture

### Frontend Structure (`frontend/src/`)
- **`pages/`** - Top-level page components (Dashboard, Login, Settings, Landing)
- **`components/`** - Reusable UI components (30+ specialized components)
  - `SyncManagement.tsx` - Main sync orchestration interface
  - `FieldMappingManager.tsx` - Visual field mapping UI
  - `MonitoringDashboard.tsx` - System health and KPIs
  - `OrderSyncManagement.tsx` - Order-specific sync controls
  - `InventorySyncManagement.tsx` - Inventory sync management
  - `ProductSyncPreview.tsx` - Preview product mappings before sync
  - `VisualFieldMapper.tsx` - Drag-and-drop field mapping interface
  - `RateLimitMonitor.tsx` - API rate limit visualization
  - `NetSuiteOAuthWizard.tsx` - OAuth connection flow
- **`contexts/`** - React contexts for global state
  - `AuthContext.tsx` - User authentication state
  - `StoreContext.tsx` - Multi-store selection and management
- **`hooks/`** - Custom React hooks
- **`lib/`** - Utility libraries and Supabase client setup
- **`types/`** - TypeScript type definitions
- **`utils/`** - Helper functions

### Backend Structure (`supabase/`)
- **`functions/_shared/`** - Shared services used across edge functions
  - `orderSyncService.ts` - Order synchronization logic
  - `inventorySyncService.ts` - Inventory sync logic
  - `fulfillmentSyncService.ts` - Fulfillment tracking
  - `currencyService.ts` - Multi-currency conversion
  - `refundSyncService.ts` - Automatic refund handling
  - `fieldMappingService.ts` - Custom field transformations
  - `monitoringService.ts` - System monitoring and metrics
  - `netsuiteClient.ts` - NetSuite API client (OAuth 2.0)
  - `shopifyClient.ts` - Shopify Admin API client
  - `supabaseClient.ts` - Database client wrapper
- **`functions/`** - Individual edge functions (Deno runtime)
  - `shopify-webhook/` - Webhook receiver for real-time events
  - `sync-orders/` - Order sync orchestration
  - `sync-inventory/` - Inventory sync orchestration
  - `sync-fulfillments/` - Fulfillment sync orchestration
  - `scheduled-sync/` - Cron-based scheduled syncs
  - `oauth-callback/` - NetSuite OAuth handler
  - `populate-sync-list/` - Bulk sync queue population
  - `delta-sync/` - Incremental change sync
- **`migrations/`** - Database schema migrations (23 migrations)
  - Core schema: `20250919115826_create_ipaas_schema.sql`
  - Field mapping: `20250921000000_field_mapping_system.sql`
  - Multi-currency: `20250104170200_multi_currency_support.sql`
  - Refunds: `20250104170400_refund_handling.sql`
  - Multi-store: `20250104170300_multiple_store_support.sql`
  - Monitoring: `20250921000001_monitoring_system.sql`

### Key Database Tables
- **`connections`** - Platform credentials (NetSuite, Shopify)
- **`products`** - Product catalog from both platforms
- **`item_mappings`** - Product mappings between NetSuite ↔ Shopify
- **`order_mappings`** - Order sync tracking with currency conversion
- **`refund_mappings`** - Refund sync tracking and credit memos
- **`currency_rates`** - Exchange rate cache (1-hour TTL)
- **`field_mappings`** - Custom field transformation rules
- **`sync_logs`** - Detailed sync operation history
- **`monitoring_metrics`** - Performance metrics and KPIs
- **`user_preferences`** - Multi-store preferences per user

## Important Patterns

### Multi-Store Architecture
The platform supports unlimited Shopify stores per user. Use `StoreContext` to access the selected store:

```typescript
import { useStore } from '@/contexts/StoreContext';

const { selectedStore, selectedStoreId, stores, selectStore } = useStore();
```

All database queries must be scoped by `user_id` and `store_id` (where applicable) due to Row Level Security (RLS).

### Sync Service Pattern
Sync services in `_shared/` follow this pattern:
1. Fetch data from source platform (Shopify/NetSuite)
2. Apply field mappings and transformations
3. Convert currencies if needed (multi-currency orders)
4. Create/update records in destination platform
5. Log sync operation to `sync_logs` table
6. Update metrics in `monitoring_metrics` table

Example sync flow:
```typescript
const syncService = new OrderSyncService(supabase, shopifyClient, netsuiteClient, userId);
const result = await syncService.syncOrders({
  userId,
  syncLogId,
  dateFrom: new Date('2025-01-01'),
  limit: 100
});
```

### Field Mapping & Transformations
Custom field mappings support 10+ transformation types:
- `uppercase`, `lowercase`, `trim`
- `date` (format conversion)
- `number` (parse/format)
- `concat` (merge fields)
- `split` (extract substrings)
- `regex` (pattern matching)
- `lookup` (value mapping)

Defined in `field_mappings` table and executed by `FieldMappingService`.

### OAuth Flow for NetSuite
NetSuite uses OAuth 2.0 (TBA - Token-Based Authentication):
1. User initiates in `NetSuiteOAuthWizard.tsx`
2. Redirects to `oauth-start` function
3. NetSuite auth redirect → `oauth-callback` function
4. Stores tokens in `connections` table (encrypted)
5. `tokenRefresh.ts` handles automatic token renewal

### Currency Conversion
Multi-currency orders are automatically converted:
1. Order received in EUR/GBP/etc.
2. `CurrencyService.getExchangeRate()` checks cache
3. If stale (>1 hour), fetches from external API
4. Converts to base currency (USD default)
5. Stores `exchange_rate` and `converted_amount` in `order_mappings`

### Webhook Processing
Shopify webhooks are received by `shopify-webhook` function:
- Order creation → triggers `sync-orders`
- Order update → updates existing mapping
- Fulfillment event → triggers `sync-fulfillments`
- Refund creation → triggers `refundSyncService`
- HMAC signature verification for security

### Rate Limiting Intelligence
The platform includes rate limit monitoring:
- Tracks API call quotas for NetSuite and Shopify
- Visual alerts in `RateLimitMonitor.tsx` when approaching limits
- Automatic throttling when limits are near
- Stored in `monitoring_metrics` table

## React + Ant Design Patterns

### Component Styling
- Uses Ant Design 5.x with custom theme
- Tailwind CSS for utility classes
- Dark mode support via theme toggle
- Responsive design for all screen sizes

### Form Handling
Ant Design forms with controlled components:
```typescript
import { Form } from 'antd';

const [form] = Form.useForm();

<Form form={form} onFinish={handleSubmit}>
  <Form.Item name="field" rules={[{ required: true }]}>
    <Input />
  </Form.Item>
</Form>
```

### Data Tables
Use Ant Design `Table` component with:
- Server-side pagination
- Column filters and sorting
- Row selection for bulk operations
- Export to CSV functionality

### Error Handling
- `ErrorBoundary.tsx` wraps all page components
- Toast notifications via Ant Design `message` API
- Detailed error logs in `sync_logs` table

## Security Considerations

### Row Level Security (RLS)
All tables have RLS policies enforcing:
- Users can only access their own data
- Service role bypasses RLS for edge functions
- OAuth tokens are encrypted at rest

### API Credentials
- Never commit `.env` files
- Use Supabase Vault for sensitive credentials
- Encrypt NetSuite/Shopify tokens in database

### Webhook Verification
- HMAC signature validation for Shopify webhooks
- Reject unsigned or invalid requests

## Known Issues & Workarounds

### React 18.x Compatibility
The project uses React 18.x (not 19.x) due to Ant Design 5.x compatibility. Do not upgrade to React 19 until Ant Design officially supports it.

### Vite 7.x + Netlify
Node.js 20+ required for Netlify deployments due to Vite 7.x requirements.

### NetSuite API Limits
- REST API: 100 requests/minute
- SuiteTalk (SOAP): 1000 requests/hour
- Monitor via `RateLimitMonitor` component

### Shopify API Limits
- Admin API: 2 requests/second (bucket-based)
- GraphQL: 1000 points/second
- Use bulk operations for large syncs

## Testing & Debugging

### Local Development
1. Start Supabase locally: `supabase start`
2. Start frontend: `cd frontend && npm run dev`
3. Access at `http://localhost:5173`

### Debug Edge Functions
```bash
# View real-time logs
supabase functions logs <function-name> --follow

# Test locally with curl
curl -X POST http://localhost:54321/functions/v1/sync-orders \
  -H "Authorization: Bearer <anon-key>" \
  -d '{"userId": "..."}'
```

### SQL Debugging
Use Supabase SQL Editor to:
- Query `sync_logs` for failed operations
- Check `monitoring_metrics` for performance issues
- Verify `currency_rates` cache status
- Review `refund_mappings` for credit memo errors

## Documentation

Refer to these files for detailed information:
- `README.md` - Project overview and feature list
- `DEPLOY_NOW.md` - Deployment instructions
- `ADVANCED_FEATURES_GUIDE.md` - Deep dive into advanced features
- `QUICK_REFERENCE.md` - Common SQL queries and tasks
- `FINAL_IMPLEMENTATION_COMPLETE.md` - Complete feature checklist

## Byterover MCP Tools

This project is configured to use Byterover MCP knowledge tools:
- **`byterover-store-knowledge`** - Store learned patterns after completing tasks
- **`byterover-retrieve-knowledge`** - Retrieve context before starting new tasks

Use these tools to maintain continuity across Claude Code sessions.

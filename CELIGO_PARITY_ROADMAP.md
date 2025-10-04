# Celigo Parity Implementation Roadmap

## 🎯 Goal
Build 5 core features to achieve full Celigo functionality parity:
1. Order Sync
2. Real-time Webhooks  
3. Scheduled Syncs
4. Advanced Inventory
5. Customer Sync

## 📅 Timeline: 8-10 Weeks

---

## Phase 1: Order Sync (Weeks 1-2)

### Overview
Synchronize Shopify orders to NetSuite sales orders with complete order details, customer matching, and payment tracking.

### Database Changes Needed
```sql
-- Orders table (already exists in schema)
-- Need to add:
ALTER TABLE sync_logs ADD COLUMN order_count INTEGER DEFAULT 0;
ALTER TABLE sync_logs ADD COLUMN order_sync_details JSONB DEFAULT '{}';

-- Add orders tracking table
CREATE TABLE IF NOT EXISTS order_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users ON DELETE CASCADE,
  shopify_order_id TEXT NOT NULL,
  netsuite_sales_order_id TEXT,
  shopify_order_number TEXT,
  netsuite_order_number TEXT,
  sync_status TEXT CHECK (sync_status IN ('pending', 'synced', 'failed', 'partial')),
  last_synced TIMESTAMP WITH TIME ZONE,
  error_details JSONB,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, shopify_order_id)
);

CREATE INDEX idx_order_mappings_user ON order_mappings(user_id);
CREATE INDEX idx_order_mappings_shopify ON order_mappings(shopify_order_id);
CREATE INDEX idx_order_mappings_status ON order_mappings(sync_status);
```

### Backend Implementation

#### 1. OrderSyncService (supabase/functions/_shared/orderSyncService.ts)
```typescript
Features:
- Fetch Shopify orders with pagination
- Match/create NetSuite customers
- Create NetSuite sales orders
- Map line items with product references
- Calculate taxes and shipping
- Track payment status
- Handle refunds and cancellations
```

#### 2. API Client Updates
```typescript
// ShopifyClient additions:
- getOrders(params: { status?, created_at_min?, limit? })
- getOrder(orderId: string)
- getOrderTransactions(orderId: string)

// NetSuiteClient additions:
- createSalesOrder(orderData: SalesOrderInput)
- updateSalesOrder(orderId: string, updates)
- getSalesOrder(orderId: string)
- createCustomer(customerData: CustomerInput)
- searchCustomer(email: string)
```

### Files to Create
1. `supabase/functions/_shared/orderSyncService.ts` - Main order sync logic
2. `supabase/migrations/20250103000002_order_sync_tables.sql` - Database schema
3. `frontend/src/components/OrderSyncDashboard.tsx` - Order sync UI
4. `frontend/src/components/OrderMappingList.tsx` - View order mappings

### Testing Checklist
- [ ] Sync new Shopify orders to NetSuite
- [ ] Match existing customers by email
- [ ] Create new customers if not found
- [ ] Map all line items correctly
- [ ] Calculate taxes accurately
- [ ] Handle shipping costs
- [ ] Track payment status
- [ ] Handle order cancellations
- [ ] Process refunds correctly

---

## Phase 2: Real-time Webhooks (Weeks 3-4)

### Overview
Implement webhook handlers for instant updates from Shopify (and eventually NetSuite) to trigger automatic syncs.

### Database Changes
```sql
-- Already have webhook_events table, add indexes
CREATE INDEX idx_webhook_events_event_type ON webhook_events(event_type);
CREATE INDEX idx_webhook_events_created ON webhook_events(created_at);

-- Add webhook subscriptions table
CREATE TABLE webhook_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users ON DELETE CASCADE,
  platform TEXT CHECK (platform IN ('shopify', 'netsuite')),
  event_type TEXT NOT NULL,
  webhook_url TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  last_triggered TIMESTAMP WITH TIME ZONE,
  trigger_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'
);
```

### Backend Implementation

#### 1. Webhook Handler Function (supabase/functions/webhook-handler/index.ts)
```typescript
Features:
- Verify webhook signatures (HMAC for Shopify)
- Parse webhook payloads
- Queue events for processing
- Trigger appropriate sync services
- Handle retry logic
- Dead letter queue for failed webhooks
```

#### 2. Webhook Registration (supabase/functions/webhook-register/index.ts)
```typescript
Features:
- Register webhooks with Shopify API
- Configure webhook topics
- Verify webhook URLs
- Manage webhook lifecycle
```

#### 3. Supported Webhook Events
```typescript
Shopify:
- products/create, products/update, products/delete
- orders/create, orders/updated, orders/cancelled
- inventory_levels/update
- customers/create, customers/update

NetSuite (if available):
- Item created/updated
- Sales order created/updated
- Inventory adjusted
```

### Files to Create
1. `supabase/functions/webhook-handler/index.ts` - Main webhook handler
2. `supabase/functions/webhook-register/index.ts` - Webhook registration
3. `supabase/functions/_shared/webhookProcessor.ts` - Process webhook events
4. `frontend/src/components/WebhookManager.tsx` - Webhook management UI
5. `supabase/migrations/20250103000003_webhook_subscriptions.sql` - Schema

### Testing Checklist
- [ ] Register webhooks with Shopify
- [ ] Receive and verify webhook signatures
- [ ] Process product update webhooks
- [ ] Process order creation webhooks
- [ ] Process inventory webhooks
- [ ] Handle webhook failures gracefully
- [ ] Retry failed webhook processing
- [ ] Deregister webhooks on disconnect

---

## Phase 3: Scheduled Syncs (Weeks 5-6)

### Overview
Implement cron-based scheduling system with UI for managing automatic syncs.

### Backend Implementation

#### 1. Sync Scheduler Function (supabase/functions/sync-scheduler/index.ts)
```typescript
Features:
- Cron expression parser
- Schedule validation
- Time zone support
- Next run calculation
- Automatic sync triggering
- Schedule conflict detection
```

#### 2. Schedule Management
```typescript
// Use existing sync_schedules table
Functions:
- createSchedule(params)
- updateSchedule(id, params)
- deleteSchedule(id)
- getActiveSchedules()
- calculateNextRun(cronExpression, lastRun)
```

#### 3. Cron Configuration
```typescript
Supported patterns:
- "0 */6 * * *" - Every 6 hours
- "0 2 * * *" - Daily at 2 AM
- "0 0 * * 0" - Weekly on Sunday
- "0 0 1 * *" - Monthly on 1st
```

### Files to Create
1. `supabase/functions/sync-scheduler/index.ts` - Main scheduler
2. `supabase/functions/_shared/cronParser.ts` - Cron expression parser
3. `frontend/src/components/ScheduleManager.tsx` - Schedule management UI
4. `frontend/src/components/CronEditor.tsx` - Visual cron editor
5. `.github/workflows/scheduled-sync.yml` - GitHub Actions trigger (optional)

### Testing Checklist
- [ ] Create schedule with cron expression
- [ ] Validate cron expressions
- [ ] Calculate next run times correctly
- [ ] Trigger syncs at scheduled times
- [ ] Handle schedule overlaps
- [ ] Support multiple schedules per user
- [ ] Pause/resume schedules
- [ ] Time zone conversion

---

## Phase 4: Advanced Inventory Sync (Week 7)

### Overview
Multi-location inventory synchronization with location mapping and stock reconciliation.

### Database Changes
```sql
CREATE TABLE inventory_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users ON DELETE CASCADE,
  netsuite_location_id TEXT,
  netsuite_location_name TEXT,
  shopify_location_id TEXT,
  shopify_location_name TEXT,
  is_active BOOLEAN DEFAULT true,
  sync_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, netsuite_location_id, shopify_location_id)
);

CREATE TABLE inventory_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_log_id UUID REFERENCES sync_logs ON DELETE CASCADE,
  product_id UUID REFERENCES products ON DELETE SET NULL,
  location_mapping_id UUID REFERENCES inventory_locations,
  netsuite_qty INTEGER,
  shopify_qty INTEGER,
  adjusted_qty INTEGER,
  adjustment_reason TEXT,
  sync_direction TEXT,
  status TEXT CHECK (status IN ('success', 'failed', 'skipped')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Backend Implementation

#### 1. InventorySyncService (supabase/functions/_shared/inventorySyncService.ts)
```typescript
Features:
- Fetch inventory levels from both platforms
- Map locations between platforms
- Calculate inventory adjustments
- Handle negative stock
- Set safety stock thresholds
- Low stock alerts
```

### Files to Create
1. `supabase/functions/_shared/inventorySyncService.ts` - Inventory sync logic
2. `supabase/migrations/20250103000004_inventory_locations.sql` - Schema
3. `frontend/src/components/InventoryLocationMapper.tsx` - Location mapping UI
4. `frontend/src/components/InventoryDashboard.tsx` - Inventory overview

### Testing Checklist
- [ ] Map NetSuite locations to Shopify
- [ ] Sync inventory levels accurately
- [ ] Handle multi-location inventory
- [ ] Set low stock thresholds
- [ ] Trigger low stock alerts
- [ ] Reconcile inventory discrepancies
- [ ] Support safety stock levels

---

## Phase 5: Customer Sync (Week 8)

### Overview
Synchronize customer data between Shopify and NetSuite with duplicate detection.

### Database Changes
```sql
CREATE TABLE customer_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users ON DELETE CASCADE,
  shopify_customer_id TEXT NOT NULL,
  netsuite_customer_id TEXT,
  email TEXT,
  sync_status TEXT CHECK (sync_status IN ('synced', 'pending', 'failed')),
  last_synced TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, shopify_customer_id)
);

CREATE INDEX idx_customer_mappings_email ON customer_mappings(email);
CREATE INDEX idx_customer_mappings_status ON customer_mappings(sync_status);
```

### Backend Implementation

#### 1. CustomerSyncService (supabase/functions/_shared/customerSyncService.ts)
```typescript
Features:
- Fetch Shopify customers
- Search NetSuite for existing customers (by email)
- Create new NetSuite customers
- Update existing customers
- Sync addresses (billing, shipping)
- Handle customer tags
- Merge duplicate detection
```

### Files to Create
1. `supabase/functions/_shared/customerSyncService.ts` - Customer sync logic
2. `supabase/migrations/20250103000005_customer_mappings.sql` - Schema
3. `frontend/src/components/CustomerSyncDashboard.tsx` - Customer sync UI

### Testing Checklist
- [ ] Sync Shopify customers to NetSuite
- [ ] Match existing customers by email
- [ ] Create new customers when needed
- [ ] Sync billing addresses
- [ ] Sync shipping addresses
- [ ] Handle duplicate customers
- [ ] Update customer information

---

## Phase 6: Testing & Polish (Weeks 9-10)

### Integration Testing
- [ ] End-to-end order sync flow
- [ ] Webhook-triggered syncs
- [ ] Scheduled sync execution
- [ ] Multi-location inventory
- [ ] Customer sync with orders

### Performance Testing
- [ ] Handle 1000+ products
- [ ] Process 100+ orders per sync
- [ ] Multiple concurrent syncs
- [ ] Large webhook payloads

### UI Polish
- [ ] Comprehensive dashboard
- [ ] Real-time progress indicators
- [ ] Error notifications
- [ ] Success confirmations
- [ ] Loading states

### Documentation
- [ ] API documentation
- [ ] Setup guides
- [ ] Troubleshooting guide
- [ ] Best practices
- [ ] Migration guide from Celigo

---

## 📊 Progress Tracking

### Week 1-2: Order Sync
- [ ] Database schema
- [ ] OrderSyncService
- [ ] API client updates
- [ ] UI components
- [ ] Testing

### Week 3-4: Webhooks
- [ ] Webhook handler
- [ ] Event processor
- [ ] Registration system
- [ ] UI management
- [ ] Testing

### Week 5-6: Scheduled Syncs
- [ ] Cron parser
- [ ] Scheduler function
- [ ] Schedule management
- [ ] UI components
- [ ] Testing

### Week 7: Inventory
- [ ] Location mapping
- [ ] InventorySyncService
- [ ] UI components
- [ ] Testing

### Week 8: Customers
- [ ] CustomerSyncService
- [ ] Duplicate detection
- [ ] UI components
- [ ] Testing

### Week 9-10: Polish
- [ ] Integration tests
- [ ] Performance optimization
- [ ] Documentation
- [ ] Bug fixes

---

## 🚀 Quick Start Order

Recommended implementation order:
1. **Start with Order Sync** - Most business-critical
2. **Add Webhooks** - Enables real-time updates
3. **Implement Scheduling** - Automation layer
4. **Complete Inventory** - Operational efficiency
5. **Add Customers** - Data completeness

---

## 💡 Key Architecture Decisions

### 1. **Service Layer Pattern**
All sync logic in dedicated service classes for reusability and testing.

### 2. **Event-Driven Architecture**
Webhooks trigger events → Event processor → Sync services

### 3. **Queue-Based Processing**
Use webhook_events table as a queue for reliable processing.

### 4. **Idempotent Operations**
All sync operations should be safely retriable.

### 5. **Comprehensive Logging**
Every sync operation logged with full details for debugging.

---

## 📈 Success Metrics

### Performance
- Order sync: < 5 seconds per order
- Webhook processing: < 2 seconds
- Scheduled sync: 99%+ reliability
- Inventory sync: < 1 minute for 1000 items

### Reliability
- 99.9% uptime
- < 1% error rate
- 100% webhook delivery (with retries)
- Zero data loss

### User Experience
- < 3 clicks to set up sync
- Real-time progress feedback
- Clear error messages
- Self-service troubleshooting

---

## 🎉 Completion Criteria

You'll have full Celigo parity when:
- ✅ Orders sync automatically from Shopify to NetSuite
- ✅ Webhooks trigger instant updates
- ✅ Schedules run syncs automatically
- ✅ Multi-location inventory syncs accurately
- ✅ Customers sync with duplicate detection
- ✅ All features have comprehensive UI
- ✅ Full test coverage
- ✅ Complete documentation

This will make your iPaaS a **production-ready Celigo alternative** at a fraction of the cost! 🚀

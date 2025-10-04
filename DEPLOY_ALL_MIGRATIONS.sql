-- ============================================================
-- ALL-IN-ONE DEPLOYMENT SCRIPT
-- iPaaS Platform - Complete Feature Set
-- ============================================================
-- This file contains all 4 migrations in order
-- Run this entire file in Supabase SQL Editor
-- ============================================================

-- ============================================================
-- MIGRATION 1: MULTI-CURRENCY SUPPORT
-- ============================================================

-- Add currency fields to order_mappings table
ALTER TABLE order_mappings
ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD',
ADD COLUMN IF NOT EXISTS base_currency TEXT DEFAULT 'USD',
ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(10, 6) DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS converted_amount NUMERIC(12, 2);

-- Create currency_rates table for caching exchange rates
CREATE TABLE IF NOT EXISTS currency_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_currency TEXT NOT NULL,
  to_currency TEXT NOT NULL,
  rate NUMERIC(10, 6) NOT NULL,
  source TEXT DEFAULT 'exchangerate-api',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_currency_pair UNIQUE(from_currency, to_currency)
);

CREATE INDEX IF NOT EXISTS idx_currency_rates_pair 
ON currency_rates(from_currency, to_currency);

CREATE INDEX IF NOT EXISTS idx_currency_rates_updated 
ON currency_rates(updated_at DESC);

-- Update existing orders with default values
UPDATE order_mappings
SET 
  currency = COALESCE(currency, 'USD'),
  base_currency = COALESCE(base_currency, 'USD'),
  exchange_rate = COALESCE(exchange_rate, 1.0),
  converted_amount = COALESCE(converted_amount, total_amount)
WHERE currency IS NULL OR base_currency IS NULL;

-- ============================================================
-- MIGRATION 2: REFUND HANDLING
-- ============================================================

CREATE TABLE IF NOT EXISTS refund_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  order_mapping_id UUID NOT NULL REFERENCES order_mappings(id) ON DELETE CASCADE,
  shopify_refund_id TEXT NOT NULL,
  refund_number TEXT,
  netsuite_credit_memo_id TEXT,
  netsuite_credit_memo_number TEXT,
  refund_amount NUMERIC(12, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  exchange_rate NUMERIC(10, 6) DEFAULT 1.0,
  converted_amount NUMERIC(12, 2),
  reason TEXT,
  refund_type TEXT,
  restocking_fee NUMERIC(12, 2) DEFAULT 0,
  line_items JSONB,
  refund_date TIMESTAMPTZ NOT NULL,
  processed_at TIMESTAMPTZ,
  sync_status TEXT DEFAULT 'pending',
  last_synced TIMESTAMPTZ,
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_shopify_refund UNIQUE(user_id, shopify_refund_id)
);

CREATE INDEX IF NOT EXISTS idx_refund_mappings_user_id ON refund_mappings(user_id);
CREATE INDEX IF NOT EXISTS idx_refund_mappings_order_mapping ON refund_mappings(order_mapping_id);
CREATE INDEX IF NOT EXISTS idx_refund_mappings_sync_status ON refund_mappings(sync_status);

ALTER TABLE refund_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY refund_mappings_select_policy ON refund_mappings
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY refund_mappings_insert_policy ON refund_mappings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY refund_mappings_update_policy ON refund_mappings
  FOR UPDATE USING (auth.uid() = user_id);

-- ============================================================
-- MIGRATION 3: MULTIPLE STORE SUPPORT
-- ============================================================

ALTER TABLE connections
ADD COLUMN IF NOT EXISTS store_name TEXT,
ADD COLUMN IF NOT EXISTS is_primary BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS store_metadata JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_connections_primary 
ON connections(user_id, is_primary) 
WHERE is_primary = true;

ALTER TABLE order_mappings
ADD COLUMN IF NOT EXISTS connection_id UUID REFERENCES connections(id);

ALTER TABLE item_mappings
ADD COLUMN IF NOT EXISTS shopify_connection_id UUID REFERENCES connections(id),
ADD COLUMN IF NOT EXISTS netsuite_connection_id UUID REFERENCES connections(id);

CREATE INDEX IF NOT EXISTS idx_order_mappings_connection ON order_mappings(connection_id);
CREATE INDEX IF NOT EXISTS idx_item_mappings_shopify_connection ON item_mappings(shopify_connection_id);

CREATE TABLE IF NOT EXISTS user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  selected_store_id UUID REFERENCES connections(id),
  preferences JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_user_preferences UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_preferences_select_policy ON user_preferences
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY user_preferences_insert_policy ON user_preferences
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY user_preferences_update_policy ON user_preferences
  FOR UPDATE USING (auth.uid() = user_id);

-- Migrate existing data
UPDATE order_mappings om
SET connection_id = c.id
FROM connections c
WHERE om.user_id = c.user_id
  AND c.platform = 'shopify'
  AND om.connection_id IS NULL;

UPDATE connections c
SET is_primary = true
WHERE platform = 'shopify'
  AND is_primary = false
  AND NOT EXISTS (
    SELECT 1 FROM connections c2
    WHERE c2.user_id = c.user_id
      AND c2.platform = 'shopify'
      AND c2.id != c.id
  );

UPDATE connections
SET store_name = COALESCE(
  store_name,
  metadata->>'shop_name',
  metadata->>'shop_domain',
  'Store ' || SUBSTRING(id::text, 1, 8)
)
WHERE platform = 'shopify' AND store_name IS NULL;

-- Store statistics view
CREATE OR REPLACE VIEW store_statistics AS
SELECT 
  c.id as connection_id,
  c.user_id,
  c.store_name,
  c.is_primary,
  COUNT(DISTINCT om.id) as total_orders,
  SUM(om.total_amount) as total_revenue,
  SUM(om.converted_amount) as total_revenue_base_currency,
  COUNT(DISTINCT om.id) FILTER (WHERE om.sync_status = 'synced') as synced_orders,
  COUNT(DISTINCT om.id) FILTER (WHERE om.sync_status = 'failed') as failed_orders,
  COUNT(DISTINCT im.id) as product_mappings,
  MAX(om.order_date) as last_order_date,
  c.created_at as store_connected_at
FROM connections c
LEFT JOIN order_mappings om ON om.connection_id = c.id
LEFT JOIN item_mappings im ON im.shopify_connection_id = c.id
WHERE c.platform = 'shopify'
GROUP BY c.id, c.user_id, c.store_name, c.is_primary, c.created_at;

-- Helper functions
CREATE OR REPLACE FUNCTION set_primary_store(p_user_id UUID, p_connection_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE connections SET is_primary = false
  WHERE user_id = p_user_id AND platform = 'shopify';
  
  UPDATE connections SET is_primary = true
  WHERE id = p_connection_id AND user_id = p_user_id AND platform = 'shopify';
  
  INSERT INTO user_preferences (user_id, selected_store_id)
  VALUES (p_user_id, p_connection_id)
  ON CONFLICT (user_id)
  DO UPDATE SET selected_store_id = EXCLUDED.selected_store_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- MIGRATION 4: CUSTOM FIELD MAPPING
-- ============================================================

CREATE TABLE IF NOT EXISTS custom_field_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  description TEXT,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('order', 'product', 'customer', 'fulfillment')),
  source_platform TEXT NOT NULL CHECK (source_platform IN ('shopify', 'netsuite')),
  target_platform TEXT NOT NULL CHECK (target_platform IN ('shopify', 'netsuite')),
  mappings JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT true,
  is_bidirectional BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_used TIMESTAMPTZ,
  CONSTRAINT unique_mapping_name UNIQUE(user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_custom_field_mappings_user ON custom_field_mappings(user_id);
CREATE INDEX IF NOT EXISTS idx_custom_field_mappings_entity ON custom_field_mappings(entity_type);
CREATE INDEX IF NOT EXISTS idx_custom_field_mappings_active ON custom_field_mappings(is_active) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS field_mapping_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mapping_id UUID NOT NULL REFERENCES custom_field_mappings(id) ON DELETE CASCADE,
  entity_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  direction TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'partial', 'failed')),
  fields_mapped INTEGER DEFAULT 0,
  fields_failed INTEGER DEFAULT 0,
  input_data JSONB,
  output_data JSONB,
  errors JSONB,
  processing_time_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_field_mapping_logs_mapping ON field_mapping_logs(mapping_id);
CREATE INDEX IF NOT EXISTS idx_field_mapping_logs_status ON field_mapping_logs(status);

ALTER TABLE custom_field_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_mapping_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY custom_field_mappings_select_policy ON custom_field_mappings
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY custom_field_mappings_insert_policy ON custom_field_mappings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY custom_field_mappings_update_policy ON custom_field_mappings
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY field_mapping_logs_select_policy ON field_mapping_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM custom_field_mappings
      WHERE custom_field_mappings.id = field_mapping_logs.mapping_id
      AND custom_field_mappings.user_id = auth.uid()
    )
  );

-- Field mapping statistics view
CREATE OR REPLACE VIEW field_mapping_statistics AS
SELECT 
  cfm.id as mapping_id,
  cfm.user_id,
  cfm.name,
  cfm.entity_type,
  cfm.is_active,
  COUNT(fml.id) as total_executions,
  COUNT(fml.id) FILTER (WHERE fml.status = 'success') as successful_executions,
  COUNT(fml.id) FILTER (WHERE fml.status = 'failed') as failed_executions,
  SUM(fml.fields_mapped) as total_fields_mapped,
  AVG(fml.processing_time_ms) as avg_processing_time_ms,
  MAX(fml.created_at) as last_execution,
  cfm.created_at as mapping_created_at
FROM custom_field_mappings cfm
LEFT JOIN field_mapping_logs fml ON fml.mapping_id = cfm.id
GROUP BY cfm.id, cfm.user_id, cfm.name, cfm.entity_type, cfm.is_active, cfm.created_at;

-- ============================================================
-- DEPLOYMENT COMPLETE!
-- ============================================================
-- All 4 migrations have been applied successfully.
-- Your iPaaS platform now has:
-- ✅ Multi-Currency Support
-- ✅ Refund Handling
-- ✅ Multiple Store Support
-- ✅ Custom Field Mapping
-- ============================================================

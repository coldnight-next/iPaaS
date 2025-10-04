-- Multiple Store Support Migration
-- This migration enables support for multiple Shopify stores per user

-- Add store metadata to connections table
ALTER TABLE connections
ADD COLUMN IF NOT EXISTS store_name TEXT,
ADD COLUMN IF NOT EXISTS is_primary BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS store_metadata JSONB DEFAULT '{}'::jsonb;

-- Create index for primary stores
CREATE INDEX IF NOT EXISTS idx_connections_primary 
ON connections(user_id, is_primary) 
WHERE is_primary = true;

-- Add connection_id to order_mappings to track which store the order came from
ALTER TABLE order_mappings
ADD COLUMN IF NOT EXISTS connection_id UUID REFERENCES connections(id);

-- Add connection_id to item_mappings
ALTER TABLE item_mappings
ADD COLUMN IF NOT EXISTS shopify_connection_id UUID REFERENCES connections(id),
ADD COLUMN IF NOT EXISTS netsuite_connection_id UUID REFERENCES connections(id);

-- Add connection_id to fulfillment_mappings (if exists)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'fulfillment_mappings') THEN
    ALTER TABLE fulfillment_mappings
    ADD COLUMN IF NOT EXISTS connection_id UUID REFERENCES connections(id);
  END IF;
END $$;

-- Create indexes for connection_id lookups
CREATE INDEX IF NOT EXISTS idx_order_mappings_connection 
ON order_mappings(connection_id);

CREATE INDEX IF NOT EXISTS idx_item_mappings_shopify_connection 
ON item_mappings(shopify_connection_id);

CREATE INDEX IF NOT EXISTS idx_item_mappings_netsuite_connection 
ON item_mappings(netsuite_connection_id);

-- Create user_preferences table for storing selected store and other preferences
CREATE TABLE IF NOT EXISTS user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  selected_store_id UUID REFERENCES connections(id),
  preferences JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_user_preferences UNIQUE(user_id)
);

-- Create index for user preferences lookup
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id 
ON user_preferences(user_id);

-- Add trigger to update updated_at
CREATE OR REPLACE FUNCTION update_user_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_user_preferences_updated_at
  BEFORE UPDATE ON user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_user_preferences_updated_at();

-- Enable RLS on user_preferences
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

-- RLS policies for user_preferences
CREATE POLICY user_preferences_select_policy ON user_preferences
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY user_preferences_insert_policy ON user_preferences
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY user_preferences_update_policy ON user_preferences
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY user_preferences_delete_policy ON user_preferences
  FOR DELETE
  USING (auth.uid() = user_id);

-- Add comments for documentation
COMMENT ON COLUMN connections.store_name IS 'Human-readable name for the store (e.g., "Main Store", "EU Store")';
COMMENT ON COLUMN connections.is_primary IS 'Whether this is the primary/default store for the user';
COMMENT ON COLUMN connections.store_metadata IS 'Additional store-specific metadata (domain, location, etc.)';

COMMENT ON COLUMN order_mappings.connection_id IS 'Reference to the Shopify connection/store this order belongs to';
COMMENT ON COLUMN item_mappings.shopify_connection_id IS 'Reference to the Shopify store for this product mapping';
COMMENT ON COLUMN item_mappings.netsuite_connection_id IS 'Reference to the NetSuite connection for this product mapping';

COMMENT ON TABLE user_preferences IS 'Stores user preferences including selected store and other settings';
COMMENT ON COLUMN user_preferences.selected_store_id IS 'Currently selected/active store for the user';
COMMENT ON COLUMN user_preferences.preferences IS 'Other user preferences in JSONB format';

-- Migrate existing data: Set connection_id for existing orders
-- This finds the Shopify connection for each user and assigns it to their orders
UPDATE order_mappings om
SET connection_id = c.id
FROM connections c
WHERE om.user_id = c.user_id
  AND c.platform = 'shopify'
  AND om.connection_id IS NULL;

-- Migrate existing data: Set is_primary for users with only one Shopify store
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

-- Set store_name from metadata if not already set
UPDATE connections
SET store_name = COALESCE(
  store_name,
  metadata->>'shop_name',
  metadata->>'shop_domain',
  'Store ' || SUBSTRING(id::text, 1, 8)
)
WHERE platform = 'shopify'
  AND store_name IS NULL;

-- Create a view for store statistics
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

COMMENT ON VIEW store_statistics IS 'Aggregated statistics per store for dashboard display';

-- Function to get or create user preferences
CREATE OR REPLACE FUNCTION get_or_create_user_preferences(p_user_id UUID)
RETURNS UUID AS $$
DECLARE
  v_preferences_id UUID;
  v_primary_store_id UUID;
BEGIN
  -- Try to get existing preferences
  SELECT id INTO v_preferences_id
  FROM user_preferences
  WHERE user_id = p_user_id;
  
  -- If not exists, create with primary store as default
  IF v_preferences_id IS NULL THEN
    -- Find primary store
    SELECT id INTO v_primary_store_id
    FROM connections
    WHERE user_id = p_user_id
      AND platform = 'shopify'
      AND is_primary = true
    LIMIT 1;
    
    -- If no primary store, get any Shopify store
    IF v_primary_store_id IS NULL THEN
      SELECT id INTO v_primary_store_id
      FROM connections
      WHERE user_id = p_user_id
        AND platform = 'shopify'
      LIMIT 1;
    END IF;
    
    -- Create preferences
    INSERT INTO user_preferences (user_id, selected_store_id)
    VALUES (p_user_id, v_primary_store_id)
    RETURNING id INTO v_preferences_id;
  END IF;
  
  RETURN v_preferences_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_or_create_user_preferences IS 'Gets or creates user preferences with default selected store';

-- Function to set primary store (ensures only one primary per user)
CREATE OR REPLACE FUNCTION set_primary_store(p_user_id UUID, p_connection_id UUID)
RETURNS VOID AS $$
BEGIN
  -- First, unset all primary flags for this user
  UPDATE connections
  SET is_primary = false
  WHERE user_id = p_user_id
    AND platform = 'shopify';
  
  -- Then set the specified store as primary
  UPDATE connections
  SET is_primary = true
  WHERE id = p_connection_id
    AND user_id = p_user_id
    AND platform = 'shopify';
  
  -- Update user preferences to select this store
  INSERT INTO user_preferences (user_id, selected_store_id)
  VALUES (p_user_id, p_connection_id)
  ON CONFLICT (user_id)
  DO UPDATE SET selected_store_id = EXCLUDED.selected_store_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION set_primary_store IS 'Sets a store as primary and updates user preferences';

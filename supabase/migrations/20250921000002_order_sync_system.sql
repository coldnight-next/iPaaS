-- Order Sync System Migration
-- This migration creates tables for order synchronization between Shopify and NetSuite

-- Add order tracking columns to sync_logs
ALTER TABLE sync_logs ADD COLUMN IF NOT EXISTS order_count INTEGER DEFAULT 0;
ALTER TABLE sync_logs ADD COLUMN IF NOT EXISTS order_sync_details JSONB DEFAULT '{}';

-- Order mappings table - tracks Shopify orders synced to NetSuite
CREATE TABLE IF NOT EXISTS order_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users ON DELETE CASCADE,
  shopify_order_id TEXT NOT NULL,
  netsuite_sales_order_id TEXT,
  shopify_order_number TEXT,
  netsuite_order_number TEXT,
  order_date TIMESTAMP WITH TIME ZONE,
  total_amount DECIMAL(10,2),
  currency TEXT DEFAULT 'USD',
  sync_status TEXT DEFAULT 'pending' CHECK (sync_status IN ('pending', 'synced', 'failed', 'partial', 'cancelled')),
  sync_direction TEXT DEFAULT 'shopify_to_netsuite',
  last_synced TIMESTAMP WITH TIME ZONE,
  error_details JSONB,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, shopify_order_id)
);

-- Order line items mapping - tracks individual line items
CREATE TABLE IF NOT EXISTS order_line_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_mapping_id UUID REFERENCES order_mappings(id) ON DELETE CASCADE,
  shopify_line_item_id TEXT NOT NULL,
  netsuite_line_id TEXT,
  product_mapping_id UUID REFERENCES item_mappings(id) ON DELETE SET NULL,
  sku TEXT,
  product_name TEXT,
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(10,2),
  total_price DECIMAL(10,2),
  tax_amount DECIMAL(10,2),
  discount_amount DECIMAL(10,2),
  sync_status TEXT DEFAULT 'pending' CHECK (sync_status IN ('pending', 'synced', 'failed')),
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Customer mappings table - tracks Shopify customers synced to NetSuite
CREATE TABLE IF NOT EXISTS customer_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users ON DELETE CASCADE,
  shopify_customer_id TEXT NOT NULL,
  netsuite_customer_id TEXT,
  email TEXT,
  first_name TEXT,
  last_name TEXT,
  company TEXT,
  phone TEXT,
  sync_status TEXT DEFAULT 'pending' CHECK (sync_status IN ('synced', 'pending', 'failed')),
  last_synced TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, shopify_customer_id)
);

-- Order sync history - detailed log of order sync operations
CREATE TABLE IF NOT EXISTS order_sync_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_log_id UUID REFERENCES sync_logs(id) ON DELETE CASCADE,
  order_mapping_id UUID REFERENCES order_mappings(id) ON DELETE CASCADE,
  operation TEXT CHECK (operation IN ('create', 'update', 'cancel', 'refund')),
  status TEXT CHECK (status IN ('success', 'failed', 'warning')),
  shopify_data JSONB,
  netsuite_data JSONB,
  error_message TEXT,
  warnings TEXT[],
  processing_time_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_order_mappings_user ON order_mappings(user_id);
CREATE INDEX IF NOT EXISTS idx_order_mappings_shopify ON order_mappings(shopify_order_id);
CREATE INDEX IF NOT EXISTS idx_order_mappings_netsuite ON order_mappings(netsuite_sales_order_id);
CREATE INDEX IF NOT EXISTS idx_order_mappings_status ON order_mappings(sync_status);
CREATE INDEX IF NOT EXISTS idx_order_mappings_date ON order_mappings(order_date);

CREATE INDEX IF NOT EXISTS idx_order_line_mappings_order ON order_line_mappings(order_mapping_id);
CREATE INDEX IF NOT EXISTS idx_order_line_mappings_sku ON order_line_mappings(sku);
CREATE INDEX IF NOT EXISTS idx_order_line_mappings_status ON order_line_mappings(sync_status);

CREATE INDEX IF NOT EXISTS idx_customer_mappings_user ON customer_mappings(user_id);
CREATE INDEX IF NOT EXISTS idx_customer_mappings_email ON customer_mappings(email);
CREATE INDEX IF NOT EXISTS idx_customer_mappings_shopify ON customer_mappings(shopify_customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_mappings_netsuite ON customer_mappings(netsuite_customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_mappings_status ON customer_mappings(sync_status);

CREATE INDEX IF NOT EXISTS idx_order_sync_history_sync_log ON order_sync_history(sync_log_id);
CREATE INDEX IF NOT EXISTS idx_order_sync_history_order ON order_sync_history(order_mapping_id);
CREATE INDEX IF NOT EXISTS idx_order_sync_history_status ON order_sync_history(status);

-- Row Level Security
ALTER TABLE order_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_line_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_sync_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies for order_mappings
CREATE POLICY "Users can view their own order mappings" ON order_mappings
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own order mappings" ON order_mappings
  FOR ALL USING (auth.uid() = user_id);

-- RLS Policies for order_line_mappings
CREATE POLICY "Users can view their order line mappings" ON order_line_mappings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM order_mappings om
      WHERE om.id = order_line_mappings.order_mapping_id
      AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage their order line mappings" ON order_line_mappings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM order_mappings om
      WHERE om.id = order_line_mappings.order_mapping_id
      AND om.user_id = auth.uid()
    )
  );

-- RLS Policies for customer_mappings
CREATE POLICY "Users can view their own customer mappings" ON customer_mappings
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own customer mappings" ON customer_mappings
  FOR ALL USING (auth.uid() = user_id);

-- RLS Policies for order_sync_history
CREATE POLICY "Users can view their order sync history" ON order_sync_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM sync_logs sl
      WHERE sl.id = order_sync_history.sync_log_id
      AND sl.user_id = auth.uid()
    )
  );

-- Triggers for updated_at
CREATE TRIGGER update_order_mappings_updated_at
  BEFORE UPDATE ON order_mappings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_customer_mappings_updated_at
  BEFORE UPDATE ON customer_mappings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to get order sync statistics
CREATE OR REPLACE FUNCTION get_order_sync_stats(p_user_id UUID, p_days INTEGER DEFAULT 30)
RETURNS JSONB AS $$
DECLARE
  stats JSONB;
BEGIN
  SELECT jsonb_build_object(
    'total_orders', COUNT(*),
    'synced_orders', COUNT(*) FILTER (WHERE sync_status = 'synced'),
    'pending_orders', COUNT(*) FILTER (WHERE sync_status = 'pending'),
    'failed_orders', COUNT(*) FILTER (WHERE sync_status = 'failed'),
    'total_revenue', COALESCE(SUM(total_amount) FILTER (WHERE sync_status = 'synced'), 0),
    'avg_order_value', COALESCE(AVG(total_amount) FILTER (WHERE sync_status = 'synced'), 0),
    'success_rate', 
      CASE 
        WHEN COUNT(*) > 0 THEN 
          ROUND((COUNT(*) FILTER (WHERE sync_status = 'synced')::DECIMAL / COUNT(*)) * 100, 2)
        ELSE 0 
      END
  ) INTO stats
  FROM order_mappings
  WHERE user_id = p_user_id
  AND created_at >= NOW() - (p_days || ' days')::INTERVAL;
  
  RETURN stats;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to find or create customer mapping
CREATE OR REPLACE FUNCTION find_or_create_customer_mapping(
  p_user_id UUID,
  p_shopify_customer_id TEXT,
  p_email TEXT,
  p_first_name TEXT DEFAULT NULL,
  p_last_name TEXT DEFAULT NULL,
  p_company TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_mapping_id UUID;
BEGIN
  -- Try to find existing mapping by Shopify ID
  SELECT id INTO v_mapping_id
  FROM customer_mappings
  WHERE user_id = p_user_id
  AND shopify_customer_id = p_shopify_customer_id;
  
  -- If not found, try to find by email
  IF v_mapping_id IS NULL AND p_email IS NOT NULL THEN
    SELECT id INTO v_mapping_id
    FROM customer_mappings
    WHERE user_id = p_user_id
    AND email = p_email;
  END IF;
  
  -- If still not found, create new mapping
  IF v_mapping_id IS NULL THEN
    INSERT INTO customer_mappings (
      user_id,
      shopify_customer_id,
      email,
      first_name,
      last_name,
      company,
      sync_status
    ) VALUES (
      p_user_id,
      p_shopify_customer_id,
      p_email,
      p_first_name,
      p_last_name,
      p_company,
      'pending'
    )
    RETURNING id INTO v_mapping_id;
  ELSE
    -- Update existing mapping if needed
    UPDATE customer_mappings
    SET 
      email = COALESCE(p_email, email),
      first_name = COALESCE(p_first_name, first_name),
      last_name = COALESCE(p_last_name, last_name),
      company = COALESCE(p_company, company),
      updated_at = NOW()
    WHERE id = v_mapping_id;
  END IF;
  
  RETURN v_mapping_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comments for documentation
COMMENT ON TABLE order_mappings IS 'Tracks Shopify orders synced to NetSuite sales orders';
COMMENT ON TABLE order_line_mappings IS 'Individual line items for each order';
COMMENT ON TABLE customer_mappings IS 'Maps Shopify customers to NetSuite customers';
COMMENT ON TABLE order_sync_history IS 'Detailed history of all order sync operations';
COMMENT ON FUNCTION get_order_sync_stats IS 'Returns order sync statistics for a user';
COMMENT ON FUNCTION find_or_create_customer_mapping IS 'Finds existing customer mapping or creates a new one';

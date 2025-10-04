-- Refund Handling Migration
-- This migration creates the refund_mappings table for tracking refunds and credit memos

CREATE TABLE IF NOT EXISTS refund_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  order_mapping_id UUID NOT NULL REFERENCES order_mappings(id) ON DELETE CASCADE,
  
  -- Shopify refund data
  shopify_refund_id TEXT NOT NULL,
  refund_number TEXT,
  
  -- NetSuite credit memo data
  netsuite_credit_memo_id TEXT,
  netsuite_credit_memo_number TEXT,
  
  -- Refund details
  refund_amount NUMERIC(12, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  exchange_rate NUMERIC(10, 6) DEFAULT 1.0,
  converted_amount NUMERIC(12, 2),
  
  -- Refund reason and metadata
  reason TEXT,
  refund_type TEXT, -- 'full', 'partial', 'restocking'
  restocking_fee NUMERIC(12, 2) DEFAULT 0,
  
  -- Line items refunded (JSONB for flexibility)
  line_items JSONB,
  
  -- Timestamps
  refund_date TIMESTAMPTZ NOT NULL,
  processed_at TIMESTAMPTZ,
  
  -- Sync status
  sync_status TEXT DEFAULT 'pending', -- 'pending', 'synced', 'failed'
  last_synced TIMESTAMPTZ,
  error_message TEXT,
  
  -- Metadata
  metadata JSONB,
  
  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure unique refund per Shopify refund
  CONSTRAINT unique_shopify_refund UNIQUE(user_id, shopify_refund_id)
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_refund_mappings_user_id 
ON refund_mappings(user_id);

CREATE INDEX IF NOT EXISTS idx_refund_mappings_order_mapping 
ON refund_mappings(order_mapping_id);

CREATE INDEX IF NOT EXISTS idx_refund_mappings_shopify_refund 
ON refund_mappings(shopify_refund_id);

CREATE INDEX IF NOT EXISTS idx_refund_mappings_netsuite_credit_memo 
ON refund_mappings(netsuite_credit_memo_id);

CREATE INDEX IF NOT EXISTS idx_refund_mappings_sync_status 
ON refund_mappings(sync_status);

CREATE INDEX IF NOT EXISTS idx_refund_mappings_refund_date 
ON refund_mappings(refund_date DESC);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_refund_mappings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_refund_mappings_updated_at
  BEFORE UPDATE ON refund_mappings
  FOR EACH ROW
  EXECUTE FUNCTION update_refund_mappings_updated_at();

-- Add comments for documentation
COMMENT ON TABLE refund_mappings IS 'Tracks refunds from Shopify and corresponding NetSuite credit memos';
COMMENT ON COLUMN refund_mappings.shopify_refund_id IS 'Unique refund ID from Shopify';
COMMENT ON COLUMN refund_mappings.netsuite_credit_memo_id IS 'Internal ID of the credit memo in NetSuite';
COMMENT ON COLUMN refund_mappings.refund_amount IS 'Total refund amount in original currency';
COMMENT ON COLUMN refund_mappings.currency IS 'Currency of the refund';
COMMENT ON COLUMN refund_mappings.converted_amount IS 'Refund amount converted to base currency';
COMMENT ON COLUMN refund_mappings.line_items IS 'JSON array of refunded line items with quantities and amounts';
COMMENT ON COLUMN refund_mappings.sync_status IS 'Status of sync to NetSuite (pending, synced, failed)';

-- Create a view for refund summary statistics
CREATE OR REPLACE VIEW refund_summary AS
SELECT 
  rm.user_id,
  COUNT(*) as total_refunds,
  SUM(rm.refund_amount) as total_refund_amount,
  SUM(rm.converted_amount) as total_refund_amount_base,
  COUNT(CASE WHEN rm.sync_status = 'synced' THEN 1 END) as synced_refunds,
  COUNT(CASE WHEN rm.sync_status = 'failed' THEN 1 END) as failed_refunds,
  COUNT(CASE WHEN rm.sync_status = 'pending' THEN 1 END) as pending_refunds,
  DATE_TRUNC('day', rm.refund_date) as refund_day
FROM refund_mappings rm
GROUP BY rm.user_id, DATE_TRUNC('day', rm.refund_date);

COMMENT ON VIEW refund_summary IS 'Aggregated refund statistics by user and day';

-- Create RLS (Row Level Security) policies
ALTER TABLE refund_mappings ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own refunds
CREATE POLICY refund_mappings_select_policy ON refund_mappings
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can only insert their own refunds
CREATE POLICY refund_mappings_insert_policy ON refund_mappings
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can only update their own refunds
CREATE POLICY refund_mappings_update_policy ON refund_mappings
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Policy: Users can only delete their own refunds
CREATE POLICY refund_mappings_delete_policy ON refund_mappings
  FOR DELETE
  USING (auth.uid() = user_id);

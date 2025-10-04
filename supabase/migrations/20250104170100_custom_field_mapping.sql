-- Custom Field Mapping Migration
-- Enables mapping custom fields between Shopify and NetSuite with transformations

-- Custom field mappings table
CREATE TABLE IF NOT EXISTS custom_field_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  
  -- Basic info
  name TEXT NOT NULL,
  description TEXT,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('order', 'product', 'customer', 'fulfillment')),
  
  -- Source and target platforms
  source_platform TEXT NOT NULL CHECK (source_platform IN ('shopify', 'netsuite')),
  target_platform TEXT NOT NULL CHECK (target_platform IN ('shopify', 'netsuite')),
  
  -- Field mappings (array of mapping rules)
  mappings JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  -- Status and settings
  is_active BOOLEAN DEFAULT true,
  is_bidirectional BOOLEAN DEFAULT false,
  
  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_used TIMESTAMPTZ,
  
  -- Ensure unique name per user
  CONSTRAINT unique_mapping_name UNIQUE(user_id, name)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_custom_field_mappings_user 
ON custom_field_mappings(user_id);

CREATE INDEX IF NOT EXISTS idx_custom_field_mappings_entity 
ON custom_field_mappings(entity_type);

CREATE INDEX IF NOT EXISTS idx_custom_field_mappings_active 
ON custom_field_mappings(is_active) 
WHERE is_active = true;

-- Mapping usage log table
CREATE TABLE IF NOT EXISTS field_mapping_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mapping_id UUID NOT NULL REFERENCES custom_field_mappings(id) ON DELETE CASCADE,
  
  -- Execution details
  entity_id TEXT NOT NULL, -- ID of the order/product/etc
  entity_type TEXT NOT NULL,
  direction TEXT NOT NULL, -- 'source_to_target' or 'target_to_source'
  
  -- Results
  status TEXT NOT NULL CHECK (status IN ('success', 'partial', 'failed')),
  fields_mapped INTEGER DEFAULT 0,
  fields_failed INTEGER DEFAULT 0,
  
  -- Data
  input_data JSONB,
  output_data JSONB,
  errors JSONB,
  
  -- Timing
  processing_time_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for logs
CREATE INDEX IF NOT EXISTS idx_field_mapping_logs_mapping 
ON field_mapping_logs(mapping_id);

CREATE INDEX IF NOT EXISTS idx_field_mapping_logs_entity 
ON field_mapping_logs(entity_id);

CREATE INDEX IF NOT EXISTS idx_field_mapping_logs_status 
ON field_mapping_logs(status);

CREATE INDEX IF NOT EXISTS idx_field_mapping_logs_created 
ON field_mapping_logs(created_at DESC);

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_custom_field_mappings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_custom_field_mappings_updated_at
  BEFORE UPDATE ON custom_field_mappings
  FOR EACH ROW
  EXECUTE FUNCTION update_custom_field_mappings_updated_at();

-- RLS Policies
ALTER TABLE custom_field_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_mapping_logs ENABLE ROW LEVEL SECURITY;

-- Custom field mappings policies
CREATE POLICY custom_field_mappings_select_policy ON custom_field_mappings
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY custom_field_mappings_insert_policy ON custom_field_mappings
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY custom_field_mappings_update_policy ON custom_field_mappings
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY custom_field_mappings_delete_policy ON custom_field_mappings
  FOR DELETE
  USING (auth.uid() = user_id);

-- Field mapping logs policies (can view logs for own mappings)
CREATE POLICY field_mapping_logs_select_policy ON field_mapping_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM custom_field_mappings
      WHERE custom_field_mappings.id = field_mapping_logs.mapping_id
      AND custom_field_mappings.user_id = auth.uid()
    )
  );

CREATE POLICY field_mapping_logs_insert_policy ON field_mapping_logs
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM custom_field_mappings
      WHERE custom_field_mappings.id = field_mapping_logs.mapping_id
      AND custom_field_mappings.user_id = auth.uid()
    )
  );

-- View for mapping statistics
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

COMMENT ON VIEW field_mapping_statistics IS 'Statistics for custom field mappings usage';

-- Comments
COMMENT ON TABLE custom_field_mappings IS 'Stores custom field mapping configurations between platforms';
COMMENT ON COLUMN custom_field_mappings.mappings IS 'JSON array of field mapping rules with transformations';
COMMENT ON COLUMN custom_field_mappings.entity_type IS 'Type of entity to map (order, product, customer, fulfillment)';
COMMENT ON COLUMN custom_field_mappings.is_bidirectional IS 'Whether mapping works in both directions';

COMMENT ON TABLE field_mapping_logs IS 'Execution logs for custom field mappings';
COMMENT ON COLUMN field_mapping_logs.processing_time_ms IS 'Time taken to process the mapping in milliseconds';

-- Example mapping structure (as documentation):
/*
Example mappings JSONB structure:

[
  {
    "source_field": "metafields.custom.priority",
    "target_field": "custbody_priority",
    "transformation": "uppercase",
    "default_value": "NORMAL",
    "required": false,
    "validation": "regex:^(LOW|NORMAL|HIGH|URGENT)$"
  },
  {
    "source_field": "tags",
    "target_field": "custbody_tags",
    "transformation": "join_array",
    "join_delimiter": ",",
    "required": false
  },
  {
    "source_field": "note",
    "target_field": "memo",
    "transformation": "trim",
    "max_length": 4000,
    "required": false
  }
]

Available transformations:
- uppercase, lowercase, trim
- number, boolean, date
- join_array, split_string
- substring, replace
- custom (with JavaScript function)
*/

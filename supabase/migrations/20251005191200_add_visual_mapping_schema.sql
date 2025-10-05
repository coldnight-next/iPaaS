-- Add visual field mapping schema

-- Field schemas table for visual mapping
create table field_schemas (
  id uuid primary key default gen_random_uuid(),
  platform text check (platform in ('netsuite', 'shopify')),
  entity_type text default 'product',
  field_name text not null,
  field_type text check (field_type in ('string', 'number', 'boolean', 'date', 'array', 'object')),
  is_required boolean default false,
  description text,
  sample_value jsonb,
  category text,
  display_order integer default 0,
  is_active boolean default true,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  unique(platform, entity_type, field_name)
);

-- Visual mapping connections table
create table visual_mappings (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references field_mapping_templates(id) on delete cascade,
  user_id uuid references auth.users(id),
  source_field_id uuid references field_schemas(id),
  target_field_id uuid references field_schemas(id),
  connection_type text default 'direct' check (connection_type in ('direct', 'formula', 'lookup', 'conditional')),
  transformation_config jsonb default '{}',
  is_active boolean default true,
  display_position jsonb default '{"x": 0, "y": 0}',
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  unique(template_id, source_field_id, target_field_id)
);

-- Lookup tables for reference data
create table lookup_tables (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  table_type text check (table_type in ('static', 'dynamic', 'custom')),
  data jsonb default '[]',
  is_global boolean default false,
  user_id uuid references auth.users(id),
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Transformation rules library
create table transformation_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  rule_type text check (rule_type in ('formula', 'lookup', 'conditional', 'javascript')),
  rule_config jsonb not null,
  is_global boolean default false,
  user_id uuid references auth.users(id),
  usage_count integer default 0,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Create indexes
create index idx_field_schemas_platform_entity on field_schemas(platform, entity_type);
create index idx_field_schemas_active on field_schemas(is_active);
create index idx_visual_mappings_template on visual_mappings(template_id);
create index idx_visual_mappings_user on visual_mappings(user_id);
create index idx_lookup_tables_global on lookup_tables(is_global);
create index idx_lookup_tables_user on lookup_tables(user_id);
create index idx_transformation_rules_global on transformation_rules(is_global);
create index idx_transformation_rules_user on transformation_rules(user_id);

-- Row Level Security
alter table field_schemas enable row level security;
alter table visual_mappings enable row level security;
alter table lookup_tables enable row level security;
alter table transformation_rules enable row level security;

-- RLS policies for field_schemas (global)
create policy "Allow all operations on field_schemas" on field_schemas for all using (true);

-- RLS policies for visual_mappings
create policy "Users can view their own visual mappings" on visual_mappings for select using (auth.uid() = user_id);
create policy "Users can manage their own visual mappings" on visual_mappings for all using (auth.uid() = user_id);

-- RLS policies for lookup_tables
create policy "Users can view global and their own lookup tables" on lookup_tables for select using (is_global or auth.uid() = user_id);
create policy "Users can manage their own lookup tables" on lookup_tables for all using (auth.uid() = user_id);

-- RLS policies for transformation_rules
create policy "Users can view global and their own transformation rules" on transformation_rules for select using (is_global or auth.uid() = user_id);
create policy "Users can manage their own transformation rules" on transformation_rules for all using (auth.uid() = user_id);

-- Triggers for updated_at
create trigger update_field_schemas_updated_at
  before update on field_schemas
  for each row execute function update_updated_at_column();

create trigger update_visual_mappings_updated_at
  before update on visual_mappings
  for each row execute function update_updated_at_column();

create trigger update_lookup_tables_updated_at
  before update on lookup_tables
  for each row execute function update_updated_at_column();

create trigger update_transformation_rules_updated_at
  before update on transformation_rules
  for each row execute function update_updated_at_column();

-- Insert default NetSuite product field schema
insert into field_schemas (platform, entity_type, field_name, field_type, is_required, description, sample_value, category, display_order) values
  ('netsuite', 'product', 'itemid', 'string', true, 'Unique item identifier', 'PROD-001', 'Basic', 1),
  ('netsuite', 'product', 'displayname', 'string', true, 'Display name for the item', 'Premium Widget', 'Basic', 2),
  ('netsuite', 'product', 'salesdescription', 'string', false, 'Sales description', 'High-quality premium widget', 'Basic', 3),
  ('netsuite', 'product', 'baseprice', 'number', false, 'Base price', 29.99, 'Pricing', 4),
  ('netsuite', 'product', 'quantityavailable', 'number', false, 'Available quantity', 150, 'Inventory', 5),
  ('netsuite', 'product', 'vendor', 'object', false, 'Vendor information', '{"name": "Acme Corp"}', 'Supplier', 6),
  ('netsuite', 'product', 'manufacturer', 'string', false, 'Manufacturer name', 'Widget Corp', 'Supplier', 7),
  ('netsuite', 'product', 'weight', 'number', false, 'Item weight', 2.5, 'Physical', 8),
  ('netsuite', 'product', 'weightunit', 'string', false, 'Weight unit', 'lb', 'Physical', 9),
  ('netsuite', 'product', 'upccode', 'string', false, 'UPC barcode', '123456789012', 'Identification', 10);

-- Insert default Shopify product field schema
insert into field_schemas (platform, entity_type, field_name, field_type, is_required, description, sample_value, category, display_order) values
  ('shopify', 'product', 'title', 'string', true, 'Product title', 'Premium Widget', 'Basic', 1),
  ('shopify', 'product', 'body_html', 'string', false, 'Product description HTML', '<p>High-quality premium widget</p>', 'Basic', 2),
  ('shopify', 'product', 'vendor', 'string', false, 'Vendor name', 'Widget Corp', 'Basic', 3),
  ('shopify', 'product', 'product_type', 'string', false, 'Product type/category', 'Widgets', 'Basic', 4),
  ('shopify', 'product', 'tags', 'array', false, 'Product tags', '["premium", "widget"]', 'Basic', 5),
  ('shopify', 'product', 'variants', 'array', false, 'Product variants', '[{"sku": "PROD-001", "price": "29.99"}]', 'Variants', 6),
  ('shopify', 'product', 'images', 'array', false, 'Product images', '[{"src": "https://example.com/image.jpg"}]', 'Media', 7),
  ('shopify', 'product', 'status', 'string', false, 'Product status', 'active', 'Status', 8),
  ('shopify', 'product', 'published_at', 'date', false, 'Published date', '2024-01-01T00:00:00Z', 'Status', 9),
  ('shopify', 'product', 'created_at', 'date', false, 'Created date', '2024-01-01T00:00:00Z', 'System', 10);

-- Insert default lookup tables
insert into lookup_tables (name, description, table_type, data, is_global) values
  ('Currency Codes', 'ISO currency codes mapping', 'static', '[
    {"code": "USD", "name": "US Dollar", "symbol": "$"},
    {"code": "EUR", "name": "Euro", "symbol": "€"},
    {"code": "GBP", "name": "British Pound", "symbol": "£"},
    {"code": "JPY", "name": "Japanese Yen", "symbol": "¥"}
  ]', true),
  ('Country Codes', 'ISO country codes mapping', 'static', '[
    {"code": "US", "name": "United States"},
    {"code": "CA", "name": "Canada"},
    {"code": "GB", "name": "United Kingdom"},
    {"code": "DE", "name": "Germany"}
  ]', true);

-- Insert default transformation rules
insert into transformation_rules (name, description, rule_type, rule_config, is_global) values
  ('Uppercase Text', 'Convert text to uppercase', 'javascript', '{"code": "return value ? value.toString().toUpperCase() : value"}', true),
  ('Currency Formatter', 'Format number as currency', 'javascript', '{"code": "return value ? ''$'' + parseFloat(value).toFixed(2) : value"}', true),
  ('Date Formatter', 'Format date to YYYY-MM-DD', 'javascript', '{"code": "return value ? new Date(value).toISOString().split(''T'')[0] : value"}', true),
  ('Trim Whitespace', 'Remove leading/trailing whitespace', 'javascript', '{"code": "return value ? value.toString().trim() : value"}', true);
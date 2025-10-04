-- Field Mapping System Migration
-- This migration creates tables for the custom field mapping feature

-- Field mapping templates table
create table field_mapping_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  name text not null,
  description text,
  template_type text check (template_type in ('product', 'inventory', 'order', 'customer', 'custom')),
  is_active boolean default true,
  is_default boolean default false,
  category text, -- e.g., 'Fashion', 'Electronics', 'General'
  metadata jsonb default '{}',
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Field mappings table - stores individual field mappings
create table field_mappings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  template_id uuid references field_mapping_templates(id) on delete cascade,
  source_platform text check (source_platform in ('netsuite', 'shopify')),
  target_platform text check (target_platform in ('netsuite', 'shopify')),
  source_field_path text not null, -- JSON path notation for nested fields
  target_field_path text not null,
  field_label text, -- Human-readable label
  field_type text check (field_type in ('string', 'number', 'boolean', 'date', 'array', 'object')),
  is_required boolean default false,
  default_value text,
  validation_rules jsonb default '{}', -- JSON schema or custom validation rules
  transformation_enabled boolean default false,
  transformation_type text check (transformation_type in ('none', 'javascript', 'template', 'lookup', 'formula')),
  transformation_config jsonb default '{}',
  sync_direction text default 'bidirectional' check (sync_direction in ('source_to_target', 'bidirectional')),
  priority integer default 0, -- Order of execution
  is_active boolean default true,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Transformation rules table - stores reusable transformation logic
create table field_transformation_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  name text not null,
  description text,
  rule_type text check (rule_type in ('javascript', 'template', 'lookup', 'formula', 'regex')),
  rule_config jsonb not null, -- Stores the actual transformation logic
  input_schema jsonb, -- Expected input format
  output_schema jsonb, -- Expected output format
  test_cases jsonb default '[]', -- Array of test input/output pairs
  is_global boolean default false, -- Available to all users if true (admin only)
  is_active boolean default true,
  usage_count integer default 0, -- Track how many mappings use this rule
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  unique(user_id, name)
);

-- Lookup tables for value mappings
create table field_lookup_tables (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  name text not null,
  description text,
  lookup_type text check (lookup_type in ('simple', 'multi_key', 'range')),
  source_platform text check (source_platform in ('netsuite', 'shopify')),
  target_platform text check (target_platform in ('netsuite', 'shopify')),
  mappings jsonb not null, -- Key-value pairs or complex mapping objects
  default_value text, -- Value to use if no mapping found
  is_active boolean default true,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  unique(user_id, name)
);

-- Field mapping execution log - tracks transformation executions
create table field_mapping_executions (
  id uuid primary key default gen_random_uuid(),
  sync_log_id uuid references sync_logs(id) on delete cascade,
  field_mapping_id uuid references field_mappings(id) on delete set null,
  source_value jsonb,
  transformed_value jsonb,
  target_value jsonb,
  transformation_duration_ms integer,
  status text check (status in ('success', 'failed', 'skipped', 'warning')),
  error_message text,
  warnings text[],
  created_at timestamp with time zone default now()
);

-- Mapping validation errors table
create table field_mapping_validation_errors (
  id uuid primary key default gen_random_uuid(),
  field_mapping_id uuid references field_mappings(id) on delete cascade,
  sync_log_id uuid references sync_logs(id) on delete cascade,
  error_type text check (error_type in ('missing_required', 'type_mismatch', 'validation_failed', 'transformation_error')),
  field_path text,
  expected_value text,
  actual_value text,
  error_message text,
  severity text check (severity in ('error', 'warning', 'info')),
  resolved boolean default false,
  resolved_at timestamp with time zone,
  created_at timestamp with time zone default now()
);

-- Create indexes for performance
create index idx_field_mapping_templates_user on field_mapping_templates(user_id);
create index idx_field_mapping_templates_type on field_mapping_templates(template_type);
create index idx_field_mapping_templates_active on field_mapping_templates(is_active);
create index idx_field_mappings_user on field_mappings(user_id);
create index idx_field_mappings_template on field_mappings(template_id);
create index idx_field_mappings_platforms on field_mappings(source_platform, target_platform);
create index idx_field_mappings_active on field_mappings(is_active);
create index idx_transformation_rules_user on field_transformation_rules(user_id);
create index idx_transformation_rules_type on field_transformation_rules(rule_type);
create index idx_transformation_rules_global on field_transformation_rules(is_global);
create index idx_lookup_tables_user on field_lookup_tables(user_id);
create index idx_lookup_tables_platforms on field_lookup_tables(source_platform, target_platform);
create index idx_mapping_executions_sync on field_mapping_executions(sync_log_id);
create index idx_mapping_executions_mapping on field_mapping_executions(field_mapping_id);
create index idx_mapping_executions_status on field_mapping_executions(status);
create index idx_validation_errors_mapping on field_mapping_validation_errors(field_mapping_id);
create index idx_validation_errors_sync on field_mapping_validation_errors(sync_log_id);
create index idx_validation_errors_resolved on field_mapping_validation_errors(resolved);

-- Row Level Security
alter table field_mapping_templates enable row level security;
alter table field_mappings enable row level security;
alter table field_transformation_rules enable row level security;
alter table field_lookup_tables enable row level security;
alter table field_mapping_executions enable row level security;
alter table field_mapping_validation_errors enable row level security;

-- RLS Policies
create policy "Users can view their own mapping templates" on field_mapping_templates
  for select using (auth.uid() = user_id);

create policy "Users can manage their own mapping templates" on field_mapping_templates
  for all using (auth.uid() = user_id);

create policy "Users can view their own field mappings" on field_mappings
  for select using (auth.uid() = user_id);

create policy "Users can manage their own field mappings" on field_mappings
  for all using (auth.uid() = user_id);

create policy "Users can view their transformation rules and global ones" on field_transformation_rules
  for select using (auth.uid() = user_id or is_global = true);

create policy "Users can manage their own transformation rules" on field_transformation_rules
  for all using (auth.uid() = user_id);

create policy "Users can view their own lookup tables" on field_lookup_tables
  for select using (auth.uid() = user_id);

create policy "Users can manage their own lookup tables" on field_lookup_tables
  for all using (auth.uid() = user_id);

create policy "Users can view their mapping executions" on field_mapping_executions
  for select using (
    exists (
      select 1 from sync_logs sl
      where sl.id = field_mapping_executions.sync_log_id
      and sl.user_id = auth.uid()
    )
  );

create policy "Users can view their validation errors" on field_mapping_validation_errors
  for select using (
    exists (
      select 1 from field_mappings fm
      where fm.id = field_mapping_validation_errors.field_mapping_id
      and fm.user_id = auth.uid()
    )
  );

-- Triggers
create trigger update_field_mapping_templates_updated_at
  before update on field_mapping_templates
  for each row execute function update_updated_at_column();

create trigger update_field_mappings_updated_at
  before update on field_mappings
  for each row execute function update_updated_at_column();

create trigger update_transformation_rules_updated_at
  before update on field_transformation_rules
  for each row execute function update_updated_at_column();

create trigger update_lookup_tables_updated_at
  before update on field_lookup_tables
  for each row execute function update_updated_at_column();

-- Function to validate field mapping configuration
create or replace function validate_field_mapping(mapping_id uuid)
returns jsonb as $$
declare
  mapping record;
  validation_result jsonb;
  errors text[] := '{}';
  warnings text[] := '{}';
begin
  select * into mapping from field_mappings where id = mapping_id;
  
  if not found then
    return jsonb_build_object('valid', false, 'errors', array['Mapping not found']);
  end if;
  
  -- Check if source and target fields are specified
  if mapping.source_field_path is null or mapping.source_field_path = '' then
    errors := array_append(errors, 'Source field path is required');
  end if;
  
  if mapping.target_field_path is null or mapping.target_field_path = '' then
    errors := array_append(errors, 'Target field path is required');
  end if;
  
  -- Check transformation configuration
  if mapping.transformation_enabled and mapping.transformation_config is null then
    errors := array_append(errors, 'Transformation config required when transformation is enabled');
  end if;
  
  -- Warn if mapping to same platform
  if mapping.source_platform = mapping.target_platform then
    warnings := array_append(warnings, 'Source and target platforms are the same');
  end if;
  
  return jsonb_build_object(
    'valid', array_length(errors, 1) is null or array_length(errors, 1) = 0,
    'errors', errors,
    'warnings', warnings
  );
end;
$$ language plpgsql;

-- Insert default field mapping templates
insert into field_mapping_templates (user_id, name, description, template_type, is_default, category) values
  (null, 'Default Product Mapping', 'Standard product field mapping between NetSuite and Shopify', 'product', true, 'General'),
  (null, 'Default Inventory Mapping', 'Standard inventory field mapping', 'inventory', true, 'General'),
  (null, 'Default Order Mapping', 'Standard order field mapping', 'order', true, 'General');

-- Insert common transformation rules
insert into field_transformation_rules (user_id, name, description, rule_type, rule_config, is_global) values
  (null, 'Uppercase Transform', 'Convert text to uppercase', 'javascript', '{"code": "return value ? value.toString().toUpperCase() : value;"}', true),
  (null, 'Lowercase Transform', 'Convert text to lowercase', 'javascript', '{"code": "return value ? value.toString().toLowerCase() : value;"}', true),
  (null, 'Trim Whitespace', 'Remove leading and trailing whitespace', 'javascript', '{"code": "return typeof value === ''string'' ? value.trim() : value;"}', true),
  (null, 'Parse Number', 'Convert string to number', 'javascript', '{"code": "return parseFloat(value) || 0;"}', true),
  (null, 'Format Currency', 'Format number as currency', 'javascript', '{"code": "return typeof value === ''number'' ? value.toFixed(2) : value;"}', true),
  (null, 'Date to ISO String', 'Convert date to ISO 8601 string', 'javascript', '{"code": "return value ? new Date(value).toISOString() : null;"}', true),
  (null, 'Boolean to String', 'Convert boolean to Yes/No string', 'javascript', '{"code": "return value ? ''Yes'' : ''No'';"}', true),
  (null, 'Array Join', 'Join array elements with comma', 'javascript', '{"code": "return Array.isArray(value) ? value.join('','') : value;"}', true);

-- Insert sample lookup tables
insert into field_lookup_tables (user_id, name, description, lookup_type, source_platform, target_platform, mappings) values
  (null, 'Product Status Mapping', 'Map NetSuite item status to Shopify product status', 'simple', 'netsuite', 'shopify', 
   '{"Active": "active", "Inactive": "draft", "Discontinued": "archived"}'::jsonb),
  (null, 'Inventory Policy Mapping', 'Map inventory tracking policies', 'simple', 'netsuite', 'shopify',
   '{"Track": "continue", "DoNotTrack": "deny"}'::jsonb);

-- Add comment documentation
comment on table field_mapping_templates is 'Stores reusable field mapping templates for different data types';
comment on table field_mappings is 'Individual field mappings between source and target platforms';
comment on table field_transformation_rules is 'Reusable transformation logic for field value conversions';
comment on table field_lookup_tables is 'Value lookup tables for mapping platform-specific values';
comment on table field_mapping_executions is 'Execution log for field transformations during sync';
comment on table field_mapping_validation_errors is 'Validation errors encountered during field mapping';

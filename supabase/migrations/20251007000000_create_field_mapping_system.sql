-- Field Mapping System Migration
-- Creates comprehensive field mapping functionality for NetSuite ↔ Shopify integration

-- Enable necessary extensions
create extension if not exists "uuid-ossp" with schema public;

-- Field schemas table - defines available fields for each platform/entity
create table field_schemas (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users on delete cascade,
    platform text not null check (platform in ('netsuite', 'shopify')),
    entity_type text not null, -- e.g., 'product', 'customer', 'order'
    field_name text not null,
    field_type text not null check (field_type in ('string', 'number', 'boolean', 'date', 'array', 'object')),
    is_required boolean default false,
    is_readonly boolean default false,
    description text,
    sample_value jsonb,
    validation_rules jsonb default '{}',
    metadata jsonb default '{}',
    is_active boolean default true,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now(),
    unique(user_id, platform, entity_type, field_name)
);

-- Field mapping templates table - reusable mapping configurations
create table field_mapping_templates (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users on delete cascade,
    name text not null,
    description text,
    template_type text not null check (template_type in ('product', 'inventory', 'order', 'customer', 'custom')),
    source_platform text not null check (source_platform in ('netsuite', 'shopify')),
    target_platform text not null check (target_platform in ('netsuite', 'shopify')),
    category text,
    is_default boolean default false,
    is_active boolean default true,
    is_public boolean default false, -- can be used by other users
    tags text[] default '{}',
    metadata jsonb default '{}',
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now(),
    unique(user_id, name)
);

-- Field mappings table - individual field mappings within templates
create table field_mappings (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users on delete cascade,
    template_id uuid references field_mapping_templates on delete cascade,
    source_platform text not null check (source_platform in ('netsuite', 'shopify')),
    target_platform text not null check (target_platform in ('netsuite', 'shopify')),
    source_field_path text not null,
    target_field_path text not null,
    field_label text not null,
    field_type text not null check (field_type in ('string', 'number', 'boolean', 'date', 'array', 'object')),
    is_required boolean default false,
    default_value text,
    priority integer default 0,
    sync_direction text default 'bidirectional' check (sync_direction in ('source_to_target', 'target_to_source', 'bidirectional')),
    transformation_enabled boolean default false,
    transformation_type text check (transformation_type in ('none', 'javascript', 'template', 'lookup', 'formula', 'conditional')),
    transformation_config jsonb default '{}',
    validation_enabled boolean default false,
    validation_rules jsonb default '[]',
    is_active boolean default true,
    metadata jsonb default '{}',
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

-- Field transformation rules table - reusable transformation functions
create table field_transformation_rules (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users on delete cascade,
    name text not null,
    description text,
    rule_type text not null check (rule_type in ('javascript', 'template', 'lookup', 'formula', 'conditional')),
    rule_config jsonb not null,
    input_type text check (input_type in ('string', 'number', 'boolean', 'date', 'array', 'object')),
    output_type text check (output_type in ('string', 'number', 'boolean', 'date', 'array', 'object')),
    is_global boolean default false, -- available to all users
    usage_count integer default 0,
    is_active boolean default true,
    tags text[] default '{}',
    metadata jsonb default '{}',
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now(),
    unique(user_id, name)
);

-- Field mapping validation rules table
create table field_validation_rules (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users on delete cascade,
    name text not null,
    description text,
    rule_type text not null check (rule_type in ('required', 'format', 'range', 'regex', 'custom')),
    rule_config jsonb not null,
    error_message text,
    severity text default 'error' check (severity in ('error', 'warning', 'info')),
    is_global boolean default false,
    usage_count integer default 0,
    is_active boolean default true,
    metadata jsonb default '{}',
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now(),
    unique(user_id, name)
);

-- Field mapping test cases table - for testing transformations
create table field_mapping_test_cases (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users on delete cascade,
    mapping_id uuid references field_mappings on delete cascade,
    test_name text not null,
    input_value jsonb not null,
    expected_output jsonb,
    actual_output jsonb,
    test_status text default 'pending' check (test_status in ('pending', 'running', 'passed', 'failed')),
    error_message text,
    execution_time_ms integer,
    is_active boolean default true,
    metadata jsonb default '{}',
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

-- Indexes for performance
create index idx_field_schemas_user_platform on field_schemas(user_id, platform);
create index idx_field_schemas_entity on field_schemas(platform, entity_type);
create index idx_field_schemas_active on field_schemas(is_active);

create index idx_field_mapping_templates_user on field_mapping_templates(user_id);
create index idx_field_mapping_templates_type on field_mapping_templates(template_type);
create index idx_field_mapping_templates_active on field_mapping_templates(is_active);

create index idx_field_mappings_template on field_mappings(template_id);
create index idx_field_mappings_user on field_mappings(user_id);
create index idx_field_mappings_platforms on field_mappings(source_platform, target_platform);
create index idx_field_mappings_active on field_mappings(is_active);

create index idx_field_transformation_rules_user on field_transformation_rules(user_id);
create index idx_field_transformation_rules_type on field_transformation_rules(rule_type);
create index idx_field_transformation_rules_global on field_transformation_rules(is_global);
create index idx_field_transformation_rules_active on field_transformation_rules(is_active);

create index idx_field_validation_rules_user on field_validation_rules(user_id);
create index idx_field_validation_rules_type on field_validation_rules(rule_type);
create index idx_field_validation_rules_global on field_validation_rules(is_global);

create index idx_field_mapping_test_cases_mapping on field_mapping_test_cases(mapping_id);
create index idx_field_mapping_test_cases_status on field_mapping_test_cases(test_status);

-- Row Level Security
alter table field_schemas enable row level security;
alter table field_mapping_templates enable row level security;
alter table field_mappings enable row level security;
alter table field_transformation_rules enable row level security;
alter table field_validation_rules enable row level security;
alter table field_mapping_test_cases enable row level security;

-- RLS Policies for field_schemas
create policy "Users can view their own field schemas" on field_schemas
    for select using (auth.uid() = user_id);

create policy "Users can manage their own field schemas" on field_schemas
    for all using (auth.uid() = user_id);

-- RLS Policies for field_mapping_templates
create policy "Users can view their own and public templates" on field_mapping_templates
    for select using (auth.uid() = user_id or is_public = true);

create policy "Users can manage their own templates" on field_mapping_templates
    for all using (auth.uid() = user_id);

-- RLS Policies for field_mappings
create policy "Users can view mappings from accessible templates" on field_mappings
    for select using (
        exists (
            select 1 from field_mapping_templates fmt
            where fmt.id = field_mappings.template_id
            and (fmt.user_id = auth.uid() or fmt.is_public = true)
        )
    );

create policy "Users can manage mappings in their templates" on field_mappings
    for all using (
        exists (
            select 1 from field_mapping_templates fmt
            where fmt.id = field_mappings.template_id
            and fmt.user_id = auth.uid()
        )
    );

-- RLS Policies for field_transformation_rules
create policy "Users can view their own and global rules" on field_transformation_rules
    for select using (auth.uid() = user_id or is_global = true);

create policy "Users can manage their own rules" on field_transformation_rules
    for all using (auth.uid() = user_id);

-- RLS Policies for field_validation_rules
create policy "Users can view their own and global rules" on field_validation_rules
    for select using (auth.uid() = user_id or is_global = true);

create policy "Users can manage their own rules" on field_validation_rules
    for all using (auth.uid() = user_id);

-- RLS Policies for field_mapping_test_cases
create policy "Users can view test cases for accessible mappings" on field_mapping_test_cases
    for select using (
        exists (
            select 1 from field_mappings fm
            join field_mapping_templates fmt on fm.template_id = fmt.id
            where fm.id = field_mapping_test_cases.mapping_id
            and (fmt.user_id = auth.uid() or fmt.is_public = true)
        )
    );

create policy "Users can manage test cases for their mappings" on field_mapping_test_cases
    for all using (
        exists (
            select 1 from field_mappings fm
            join field_mapping_templates fmt on fm.template_id = fmt.id
            where fm.id = field_mapping_test_cases.mapping_id
            and fmt.user_id = auth.uid()
        )
    );

-- Triggers for updated_at
create trigger update_field_schemas_updated_at
    before update on field_schemas
    for each row execute function update_updated_at_column();

create trigger update_field_mapping_templates_updated_at
    before update on field_mapping_templates
    for each row execute function update_updated_at_column();

create trigger update_field_mappings_updated_at
    before update on field_mappings
    for each row execute function update_updated_at_column();

create trigger update_field_transformation_rules_updated_at
    before update on field_transformation_rules
    for each row execute function update_updated_at_column();

create trigger update_field_validation_rules_updated_at
    before update on field_validation_rules
    for each row execute function update_updated_at_column();

-- Insert default field schemas for NetSuite and Shopify products
insert into field_schemas (user_id, platform, entity_type, field_name, field_type, is_required, description, sample_value) values
-- NetSuite Product Fields
(null, 'netsuite', 'product', 'itemid', 'string', true, 'Unique item identifier', '"SAMPLE-001"'),
(null, 'netsuite', 'product', 'displayname', 'string', true, 'Display name for the item', '"Sample Product"'),
(null, 'netsuite', 'product', 'salesdescription', 'string', false, 'Sales description', '"High-quality sample product"'),
(null, 'netsuite', 'product', 'type', 'string', true, 'Item type', '"inventoryitem"'),
(null, 'netsuite', 'product', 'baseprice', 'number', false, 'Base price', 29.99),
(null, 'netsuite', 'product', 'taxschedule', 'string', false, 'Tax schedule reference', '"Standard Rate"'),
(null, 'netsuite', 'product', 'weight', 'number', false, 'Item weight', 1.5),
(null, 'netsuite', 'product', 'weightunit', 'string', false, 'Weight unit', '"lb"'),
(null, 'netsuite', 'product', 'custitem_product_type', 'string', false, 'Product type', '"physical"'),
(null, 'netsuite', 'product', 'custitem_tags', 'array', false, 'Product tags', '["electronics", "gadgets"]'),

-- Shopify Product Fields
(null, 'shopify', 'product', 'title', 'string', true, 'Product title', '"Sample Product"'),
(null, 'shopify', 'product', 'handle', 'string', true, 'URL handle', '"sample-product"'),
(null, 'shopify', 'product', 'body_html', 'string', false, 'Product description in HTML', '"<p>High-quality sample product</p>"'),
(null, 'shopify', 'product', 'vendor', 'string', false, 'Product vendor', '"Sample Vendor"'),
(null, 'shopify', 'product', 'product_type', 'string', false, 'Product type', '"Electronics"'),
(null, 'shopify', 'product', 'tags', 'array', false, 'Product tags', '["electronics", "gadgets"]'),
(null, 'shopify', 'product', 'variants', 'array', false, 'Product variants', '[{"price": "29.99", "sku": "SAMPLE-001"}]'),
(null, 'shopify', 'product', 'images', 'array', false, 'Product images', '[{"src": "https://example.com/image.jpg"}]'),
(null, 'shopify', 'product', 'status', 'string', false, 'Product status', '"active"'),
(null, 'shopify', 'product', 'published_at', 'date', false, 'Published date', '"2024-01-01T00:00:00Z"');

-- Insert default transformation rules
insert into field_transformation_rules (user_id, name, description, rule_type, rule_config, input_type, output_type, is_global) values
(null, 'Uppercase Text', 'Converts text to uppercase', 'javascript', '{"code": "return value ? value.toString().toUpperCase() : value;"}', 'string', 'string', true),
(null, 'Lowercase Text', 'Converts text to lowercase', 'javascript', '{"code": "return value ? value.toString().toLowerCase() : value;"}', 'string', 'string', true),
(null, 'Trim Whitespace', 'Removes leading and trailing whitespace', 'javascript', '{"code": "return value ? value.toString().trim() : value;"}', 'string', 'string', true),
(null, 'Format Currency', 'Formats number as currency string', 'javascript', '{"code": "return value ? '$' + parseFloat(value).toFixed(2) : value;"}', 'number', 'string', true),
(null, 'Parse JSON', 'Parses JSON string to object', 'javascript', '{"code": "try { return JSON.parse(value); } catch { return value; }"}', 'string', 'object', true),
(null, 'Stringify JSON', 'Converts object to JSON string', 'javascript', '{"code": "return value ? JSON.stringify(value) : value;"}', 'object', 'string', true);

-- Insert default validation rules
insert into field_validation_rules (user_id, name, description, rule_type, rule_config, error_message, is_global) values
(null, 'Required Field', 'Ensures field is not empty', 'required', '{}', 'This field is required', true),
(null, 'Email Format', 'Validates email format', 'regex', '{"pattern": "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$"}', 'Please enter a valid email address', true),
(null, 'Positive Number', 'Ensures number is positive', 'range', '{"min": 0}', 'Value must be positive', true),
(null, 'URL Format', 'Validates URL format', 'regex', '{"pattern": "^https?://.+"}', 'Please enter a valid URL', true),
(null, 'Max Length', 'Limits string length', 'range', '{"max": 255}', 'Text is too long (max 255 characters)', true);

-- Insert default field mapping templates
insert into field_mapping_templates (user_id, name, description, template_type, source_platform, target_platform, category, is_default, is_public) values
(null, 'NetSuite to Shopify Product', 'Standard mapping from NetSuite inventory items to Shopify products', 'product', 'netsuite', 'shopify', 'ecommerce', true, true),
(null, 'Shopify to NetSuite Product', 'Standard mapping from Shopify products to NetSuite inventory items', 'product', 'shopify', 'netsuite', 'ecommerce', true, true);

-- Insert default field mappings for the templates
insert into field_mappings (user_id, template_id, source_platform, target_platform, source_field_path, target_field_path, field_label, field_type, is_required, sync_direction, transformation_enabled, transformation_type, transformation_config) values
-- NetSuite to Shopify mappings
((select id from field_mapping_templates where name = 'NetSuite to Shopify Product' limit 1), 'netsuite', 'shopify', 'displayname', 'title', 'Product Title', 'string', true, 'source_to_target', false, 'none', '{}'),
((select id from field_mapping_templates where name = 'NetSuite to Shopify Product' limit 1), 'netsuite', 'shopify', 'salesdescription', 'body_html', 'Product Description', 'string', false, 'source_to_target', false, 'none', '{}'),
((select id from field_mapping_templates where name = 'NetSuite to Shopify Product' limit 1), 'netsuite', 'shopify', 'baseprice', 'variants[0].price', 'Product Price', 'number', false, 'source_to_target', false, 'none', '{}'),
((select id from field_mapping_templates where name = 'NetSuite to Shopify Product' limit 1), 'netsuite', 'shopify', 'itemid', 'variants[0].sku', 'Product SKU', 'string', true, 'source_to_target', false, 'none', '{}'),
((select id from field_mapping_templates where name = 'NetSuite to Shopify Product' limit 1), 'netsuite', 'shopify', 'custitem_product_type', 'product_type', 'Product Type', 'string', false, 'source_to_target', false, 'none', '{}'),
((select id from field_mapping_templates where name = 'NetSuite to Shopify Product' limit 1), 'netsuite', 'shopify', 'custitem_tags', 'tags', 'Product Tags', 'array', false, 'source_to_target', false, 'none', '{}'),

-- Shopify to NetSuite mappings
((select id from field_mapping_templates where name = 'Shopify to NetSuite Product' limit 1), 'shopify', 'netsuite', 'title', 'displayname', 'Product Title', 'string', true, 'source_to_target', false, 'none', '{}'),
((select id from field_mapping_templates where name = 'Shopify to NetSuite Product' limit 1), 'shopify', 'netsuite', 'body_html', 'salesdescription', 'Product Description', 'string', false, 'source_to_target', false, 'none', '{}'),
((select id from field_mapping_templates where name = 'Shopify to NetSuite Product' limit 1), 'shopify', 'netsuite', 'variants[0].price', 'baseprice', 'Product Price', 'number', false, 'source_to_target', false, 'none', '{}'),
((select id from field_mapping_templates where name = 'Shopify to NetSuite Product' limit 1), 'shopify', 'netsuite', 'variants[0].sku', 'itemid', 'Product SKU', 'string', true, 'source_to_target', false, 'none', '{}'),
((select id from field_mapping_templates where name = 'Shopify to NetSuite Product' limit 1), 'shopify', 'netsuite', 'product_type', 'custitem_product_type', 'Product Type', 'string', false, 'source_to_target', false, 'none', '{}'),
((select id from field_mapping_templates where name = 'Shopify to NetSuite Product' limit 1), 'shopify', 'netsuite', 'tags', 'custitem_tags', 'Product Tags', 'array', false, 'source_to_target', false, 'none', '{}');

-- Function to increment usage count for transformation rules
create or replace function increment_transformation_rule_usage(rule_id uuid)
returns void as $$
begin
    update field_transformation_rules
    set usage_count = usage_count + 1
    where id = rule_id;
end;
$$ language plpgsql;

-- Function to increment usage count for validation rules
create or replace function increment_validation_rule_usage(rule_id uuid)
returns void as $$
begin
    update field_validation_rules
    set usage_count = usage_count + 1
    where id = rule_id;
end;
$$ language plpgsql;

-- Function to validate field mapping
create or replace function validate_field_mapping(mapping_id uuid)
returns table (
    is_valid boolean,
    validation_errors jsonb,
    validation_warnings jsonb
) as $$
declare
    mapping_record record;
    validation_result jsonb := '[]';
    warning_result jsonb := '[]';
begin
    -- Get mapping details
    select * into mapping_record
    from field_mappings
    where id = mapping_id;

    if not found then
        return query select false, '[{"error": "Mapping not found"}]'::jsonb, '[]'::jsonb;
        return;
    end if;

    -- Basic validation checks
    if mapping_record.source_field_path = '' or mapping_record.target_field_path = '' then
        validation_result := validation_result || '[{"error": "Source and target field paths are required"}]'::jsonb;
    end if;

    if mapping_record.transformation_enabled and mapping_record.transformation_type = 'none' then
        validation_result := validation_result || '[{"error": "Transformation type must be specified when transformation is enabled"}]'::jsonb;
    end if;

    -- Check for circular references (simplified check)
    if mapping_record.source_platform = mapping_record.target_platform and
       mapping_record.source_field_path = mapping_record.target_field_path then
        warning_result := warning_result || '[{"warning": "Source and target field paths are identical"}]'::jsonb;
    end if;

    return query select
        (jsonb_array_length(validation_result) = 0),
        validation_result,
        warning_result;
end;
$$ language plpgsql;

-- Function to execute field transformation
create or replace function execute_field_transformation(
    transformation_type text,
    transformation_config jsonb,
    input_value anyelement
) returns anyelement as $$
declare
    result anyelement := input_value;
begin
    case transformation_type
        when 'javascript' then
            -- For JavaScript transformations, we'd need a JavaScript runtime
            -- This is a placeholder - actual implementation would require pg_js or similar
            result := input_value;
        when 'template' then
            -- Template-based transformations
            result := input_value;
        when 'lookup' then
            -- Lookup table transformations
            result := input_value;
        when 'formula' then
            -- Formula-based transformations
            result := input_value;
        when 'conditional' then
            -- Conditional transformations
            result := input_value;
        else
            result := input_value;
    end case;

    return result;
end;
$$ language plpgsql;

-- Function to get field schema by platform and entity
create or replace function get_field_schema(
    p_platform text,
    p_entity_type text,
    p_user_id uuid default null
) returns table (
    field_name text,
    field_type text,
    is_required boolean,
    description text,
    sample_value jsonb
) as $$
begin
    return query
    select
        fs.field_name,
        fs.field_type,
        fs.is_required,
        fs.description,
        fs.sample_value
    from field_schemas fs
    where fs.platform = p_platform
      and fs.entity_type = p_entity_type
      and fs.is_active = true
      and (fs.user_id = p_user_id or fs.user_id is null)
    order by fs.field_name;
end;
$$ language plpgsql;

-- Comments for documentation
comment on table field_schemas is 'Defines available fields for each platform and entity type';
comment on table field_mapping_templates is 'Reusable templates for field mappings between platforms';
comment on table field_mappings is 'Individual field mappings within templates';
comment on table field_transformation_rules is 'Reusable transformation functions for field mappings';
comment on table field_validation_rules is 'Validation rules for field mappings';
comment on table field_mapping_test_cases is 'Test cases for validating field mapping transformations';

-- Grant necessary permissions (adjust as needed for your application)
-- These would typically be set based on your application's authentication system
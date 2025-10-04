-- Enable necessary extensions
create extension if not exists "uuid-ossp" with schema public;

-- Connections table
create table connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  platform text check (platform in ('netsuite', 'shopify')),
  credentials jsonb,
  metadata jsonb default '{}',
  status text default 'disconnected',
  last_sync timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Enhanced products table for storing detailed product information
create table products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  platform text check (platform in ('netsuite', 'shopify')),
  platform_product_id text not null,
  sku text,
  name text,
  description text,
  product_type text,
  vendor text,
  tags text[],
  images jsonb default '[]',
  variants jsonb default '[]',
  inventory_quantity integer default 0,
  price decimal(10,2),
  compare_at_price decimal(10,2),
  cost decimal(10,2),
  weight decimal(8,2),
  weight_unit text,
  dimensions jsonb default '{}',
  attributes jsonb default '{}',
  is_active boolean default true,
  last_platform_sync timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  unique(user_id, platform, platform_product_id)
);

-- Item mappings table (enhanced)
create table item_mappings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  netsuite_product_id uuid references products(id) on delete cascade,
  shopify_product_id uuid references products(id) on delete cascade,
  mapping_type text default 'manual' check (mapping_type in ('manual', 'auto', 'rule_based')),
  sync_direction text default 'bidirectional' check (sync_direction in ('netsuite_to_shopify', 'shopify_to_netsuite', 'bidirectional')),
  sync_enabled boolean default true,
  sync_status text default 'pending' check (sync_status in ('pending', 'syncing', 'completed', 'failed', 'conflicted')),
  last_synced timestamp with time zone,
  sync_frequency text default 'manual' check (sync_frequency in ('manual', 'hourly', 'daily', 'weekly', 'realtime')),
  next_sync_scheduled timestamp with time zone,
  conflict_resolution text default 'manual' check (conflict_resolution in ('manual', 'netsuite_wins', 'shopify_wins', 'newest_wins')),
  mapping_rules jsonb default '{}',
  metadata jsonb default '{}',
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Price tiers table
create table price_tiers (
  id uuid primary key default gen_random_uuid(),
  item_mapping_id uuid references item_mappings on delete cascade,
  tier_name text,
  netsuite_price_level text,
  shopify_catalog_id text,
  currency text default 'USD',
  base_price decimal(10,2),
  tier_prices jsonb default '{}',
  sync_enabled boolean default true,
  last_updated timestamp with time zone default now(),
  created_at timestamp with time zone default now()
);

-- Enhanced sync logs table
create table sync_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  item_mapping_id uuid references item_mappings on delete cascade,
  sync_type text default 'manual' check (sync_type in ('manual', 'scheduled', 'webhook', 'bulk')),
  direction text check (direction in ('netsuite_to_shopify', 'shopify_to_netsuite', 'bidirectional')),
  status text default 'pending' check (status in ('pending', 'running', 'completed', 'failed', 'partial_success')),
  items_processed integer default 0,
  items_succeeded integer default 0,
  items_failed integer default 0,
  items_skipped integer default 0,
  error_details jsonb default '[]',
  warnings jsonb default '[]',
  started_at timestamp with time zone default now(),
  completed_at timestamp with time zone,
  duration_seconds integer,
  triggered_by text default 'system',
  retry_count integer default 0,
  max_retries integer default 3,
  created_at timestamp with time zone default now()
);

-- Sync schedules table for automated syncs
create table sync_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  name text not null,
  description text,
  schedule_type text check (schedule_type in ('interval', 'cron', 'webhook')),
  cron_expression text,
  interval_minutes integer,
  is_active boolean default true,
  last_run timestamp with time zone,
  next_run timestamp with time zone,
  sync_direction text check (sync_direction in ('netsuite_to_shopify', 'shopify_to_netsuite', 'bidirectional')),
  target_filters jsonb default '{}',
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Sync configurations table
create table sync_configurations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  config_key text not null,
  config_value jsonb,
  description text,
  is_active boolean default true,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  unique(user_id, config_key)
);

-- Product sync history table
create table product_sync_history (
  id uuid primary key default gen_random_uuid(),
  sync_log_id uuid references sync_logs on delete cascade,
  product_id uuid references products(id) on delete cascade,
  platform text check (platform in ('netsuite', 'shopify')),
  operation text check (operation in ('create', 'update', 'delete', 'skip')),
  status text check (status in ('success', 'failed', 'warning')),
  before_data jsonb,
  after_data jsonb,
  error_message text,
  warnings text[],
  created_at timestamp with time zone default now()
);

-- Webhook events table
create table webhook_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  source text check (source in ('netsuite', 'shopify')),
  event_type text,
  platform_event_id text,
  payload jsonb,
  processed boolean default false,
  processed_at timestamp with time zone,
  processing_attempts integer default 0,
  last_error text,
  created_at timestamp with time zone default now()
);

-- Create indexes for better performance
create index idx_connections_user_platform on connections(user_id, platform);
create index idx_connections_status on connections(status);
create index idx_products_user_platform on products(user_id, platform);
create index idx_products_platform_id on products(platform_product_id);
create index idx_products_sku on products(sku);
create index idx_item_mappings_user on item_mappings(user_id);
create index idx_item_mappings_netsuite on item_mappings(netsuite_product_id);
create index idx_item_mappings_shopify on item_mappings(shopify_product_id);
create index idx_item_mappings_status on item_mappings(sync_status);
create index idx_item_mappings_next_sync on item_mappings(next_sync_scheduled);
create index idx_price_tiers_mapping on price_tiers(item_mapping_id);
create index idx_price_tiers_enabled on price_tiers(sync_enabled);
create index idx_sync_logs_user on sync_logs(user_id);
create index idx_sync_logs_mapping on sync_logs(item_mapping_id);
create index idx_sync_logs_status on sync_logs(status);
create index idx_sync_logs_started on sync_logs(started_at);
create index idx_sync_schedules_user on sync_schedules(user_id);
create index idx_sync_schedules_active on sync_schedules(is_active);
create index idx_sync_schedules_next_run on sync_schedules(next_run);
create index idx_sync_configurations_user on sync_configurations(user_id);
create index idx_product_sync_history_sync on product_sync_history(sync_log_id);
create index idx_product_sync_history_product on product_sync_history(product_id);
create index idx_webhook_events_user on webhook_events(user_id);
create index idx_webhook_events_source on webhook_events(source);
create index idx_webhook_events_processed on webhook_events(processed);
create index idx_webhook_events_created on webhook_events(created_at);

-- Row Level Security policies
alter table connections enable row level security;
alter table products enable row level security;
alter table item_mappings enable row level security;
alter table price_tiers enable row level security;
alter table sync_logs enable row level security;
alter table sync_schedules enable row level security;
alter table sync_configurations enable row level security;
alter table product_sync_history enable row level security;
alter table webhook_events enable row level security;

-- RLS policies for connections
create policy "Users can view their own connections" on connections
  for select using (auth.uid() = user_id);

create policy "Users can insert their own connections" on connections
  for insert with check (auth.uid() = user_id);

create policy "Users can update their own connections" on connections
  for update using (auth.uid() = user_id);

create policy "Users can delete their own connections" on connections
  for delete using (auth.uid() = user_id);

-- RLS policies for products
create policy "Users can view their own products" on products
  for select using (auth.uid() = user_id);

create policy "Users can manage their own products" on products
  for all using (auth.uid() = user_id);

-- RLS policies for item mappings
create policy "Users can view their item mappings" on item_mappings
  for select using (auth.uid() = user_id);

create policy "Users can manage their item mappings" on item_mappings
  for all using (auth.uid() = user_id);

-- RLS policies for price tiers
create policy "Users can view their price tiers" on price_tiers
  for select using (
    exists (
      select 1 from item_mappings im
      where im.id = price_tiers.item_mapping_id
      and im.user_id = auth.uid()
    )
  );

create policy "Users can manage their price tiers" on price_tiers
  for all using (
    exists (
      select 1 from item_mappings im
      where im.id = price_tiers.item_mapping_id
      and im.user_id = auth.uid()
    )
  );

-- RLS policies for sync logs
create policy "Users can view their sync logs" on sync_logs
  for select using (auth.uid() = user_id);

create policy "Users can manage their sync logs" on sync_logs
  for all using (auth.uid() = user_id);

-- RLS policies for sync schedules
create policy "Users can view their sync schedules" on sync_schedules
  for select using (auth.uid() = user_id);

create policy "Users can manage their sync schedules" on sync_schedules
  for all using (auth.uid() = user_id);

-- RLS policies for sync configurations
create policy "Users can view their sync configurations" on sync_configurations
  for select using (auth.uid() = user_id);

create policy "Users can manage their sync configurations" on sync_configurations
  for all using (auth.uid() = user_id);

-- RLS policies for product sync history
create policy "Users can view their product sync history" on product_sync_history
  for select using (
    exists (
      select 1 from sync_logs sl
      where sl.id = product_sync_history.sync_log_id
      and sl.user_id = auth.uid()
    )
  );

-- RLS policies for webhook events
create policy "Users can view their webhook events" on webhook_events
  for select using (auth.uid() = user_id);

create policy "Users can manage their webhook events" on webhook_events
  for all using (auth.uid() = user_id);

-- Functions for updating timestamps
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Triggers for updated_at
create trigger update_connections_updated_at
  before update on connections
  for each row execute function update_updated_at_column();

create trigger update_products_updated_at
  before update on products
  for each row execute function update_updated_at_column();

create trigger update_item_mappings_updated_at
  before update on item_mappings
  for each row execute function update_updated_at_column();

create trigger update_sync_schedules_updated_at
  before update on sync_schedules
  for each row execute function update_updated_at_column();

create trigger update_sync_configurations_updated_at
  before update on sync_configurations
  for each row execute function update_updated_at_column();

-- Function to calculate next sync time
create or replace function calculate_next_sync_time(schedule_type text, cron_expr text, interval_mins integer, last_run timestamp with time zone)
returns timestamp with time zone as $$
begin
  if schedule_type = 'interval' and interval_mins is not null then
    return coalesce(last_run, now()) + interval '1 minute' * interval_mins;
  elsif schedule_type = 'cron' and cron_expr is not null then
    -- For now, return next hour. In production, you'd use a proper cron parser
    return coalesce(last_run, now()) + interval '1 hour';
  else
    return null;
  end if;
end;
$$ language plpgsql;

-- Insert default sync configurations
insert into sync_configurations (user_id, config_key, config_value, description) values
  (null, 'global_sync_settings', '{"max_concurrent_syncs": 5, "default_retry_count": 3, "sync_timeout_seconds": 300}', 'Global synchronization settings'),
  (null, 'netsuite_settings', '{"api_version": "2023.2", "page_size": 1000, "rate_limit_delay": 1000}', 'NetSuite API configuration'),
  (null, 'shopify_settings', '{"api_version": "2024-01", "rate_limit_delay": 500, "max_request_retries": 3}', 'Shopify API configuration');

-- Note: The null user_id configurations are global defaults that can be overridden per user

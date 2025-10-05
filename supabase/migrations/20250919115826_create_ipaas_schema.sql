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

-- Sync list table for managing items to sync
create table sync_list (
   id uuid primary key default gen_random_uuid(),
   user_id uuid references auth.users on delete cascade,
   netsuite_item_id text,
   shopify_product_id text,
   sku text,
   product_name text not null,
   sync_direction text default 'bidirectional' check (sync_direction in ('netsuite_to_shopify', 'shopify_to_netsuite', 'bidirectional')),
   sync_mode text default 'delta' check (sync_mode in ('delta', 'full')),
   last_synced_at timestamp with time zone,
   last_sync_status text check (last_sync_status in ('success', 'failed', 'pending', 'running')),
   sync_count integer default 0,
   is_active boolean default true,
   priority integer default 1,
   metadata jsonb default '{}',
   created_at timestamp with time zone default now(),
   updated_at timestamp with time zone default now(),
   unique(user_id, netsuite_item_id, shopify_product_id)
);

-- Saved search patterns table
create table saved_search_patterns (
   id uuid primary key default gen_random_uuid(),
   user_id uuid references auth.users on delete cascade,
   name text not null,
   description text,
   netsuite_saved_search_id text,
   sync_direction text default 'bidirectional' check (sync_direction in ('netsuite-to-shopify', 'shopify-to-netsuite', 'bidirectional')),
   filters jsonb default '{}',
   auto_populate boolean default false,
   population_frequency text default 'manual' check (population_frequency in ('manual', 'hourly', 'daily', 'weekly')),
   last_populated_at timestamp with time zone,
   is_active boolean default true,
   metadata jsonb default '{}',
   created_at timestamp with time zone default now(),
   updated_at timestamp with time zone default now(),
   unique(user_id, name)
);

-- Indexes for sync_list
create index idx_sync_list_user on sync_list(user_id);
create index idx_sync_list_active on sync_list(is_active);
create index idx_sync_list_priority on sync_list(priority desc);
create index idx_sync_list_last_sync on sync_list(last_synced_at desc);
create index idx_sync_list_sku on sync_list(sku);

-- Indexes for saved_search_patterns
create index idx_saved_patterns_user on saved_search_patterns(user_id);
create index idx_saved_patterns_active on saved_search_patterns(is_active);
create index idx_saved_patterns_name on saved_search_patterns(name);

-- Row Level Security policies for sync_list
alter table sync_list enable row level security;

create policy "Users can view their own sync list" on sync_list
   for select using (auth.uid() = user_id);

create policy "Users can manage their own sync list" on sync_list
   for all using (auth.uid() = user_id);

-- Row Level Security policies for saved_search_patterns
alter table saved_search_patterns enable row level security;

create policy "Users can view their saved patterns" on saved_search_patterns
   for select using (auth.uid() = user_id);

create policy "Users can manage their saved patterns" on saved_search_patterns
   for all using (auth.uid() = user_id);

-- Insert default sync configurations
insert into sync_configurations (user_id, config_key, config_value, description) values
   (null, 'global_sync_settings', '{"max_concurrent_syncs": 5, "default_retry_count": 3, "sync_timeout_seconds": 300}', 'Global synchronization settings'),
   (null, 'netsuite_settings', '{"api_version": "2023.2", "page_size": 1000, "rate_limit_delay": 1000}', 'NetSuite API configuration'),
   (null, 'shopify_settings', '{"api_version": "2024-01", "rate_limit_delay": 500, "max_request_retries": 3}', 'Shopify API configuration');

-- Sync queue table for managing queued sync operations
create table sync_queue (
   id uuid primary key default gen_random_uuid(),
   user_id uuid references auth.users on delete cascade,
   sync_type text default 'manual' check (sync_type in ('manual', 'scheduled', 'webhook', 'bulk')),
   direction text default 'bidirectional' check (direction in ('netsuite_to_shopify', 'shopify_to_netsuite', 'bidirectional')),
   status text default 'queued' check (status in ('queued', 'processing', 'paused', 'completed', 'failed')),
   priority integer default 1,
   estimated_items integer default 0,
   processed_items integer default 0,
   failed_items integer default 0,
   progress_percentage decimal(5,2) default 0,
   current_operation text,
   estimated_completion timestamp with time zone,
   started_at timestamp with time zone,
   queued_at timestamp with time zone default now(),
   completed_at timestamp with time zone,
   error_message text,
   metadata jsonb default '{}',
   created_at timestamp with time zone default now(),
   updated_at timestamp with time zone default now()
);

-- System alerts table for monitoring and notifications
create table system_alerts (
   id uuid primary key default gen_random_uuid(),
   user_id uuid references auth.users on delete cascade,
   alert_type text not null check (alert_type in ('sync_failure', 'api_rate_limit', 'connection_error', 'performance_degradation', 'system_error')),
   severity text default 'medium' check (severity in ('critical', 'high', 'medium', 'low', 'info')),
   title text not null,
   message text not null,
   source text, -- e.g., 'netsuite', 'shopify', 'sync_engine'
   is_acknowledged boolean default false,
   acknowledged_at timestamp with time zone,
   acknowledged_by uuid references auth.users,
   is_resolved boolean default false,
   resolved_at timestamp with time zone,
   resolved_by uuid references auth.users,
   metadata jsonb default '{}',
   created_at timestamp with time zone default now(),
   updated_at timestamp with time zone default now()
);

-- Sync performance stats table for metrics and analytics
create table sync_performance_stats (
   id uuid primary key default gen_random_uuid(),
   user_id uuid references auth.users on delete cascade,
   time_period text not null check (time_period in ('hour', 'day', 'week', 'month')),
   period_start timestamp with time zone not null,
   period_end timestamp with time zone not null,
   total_syncs integer default 0,
   successful_syncs integer default 0,
   failed_syncs integer default 0,
   total_items integer default 0,
   successful_items integer default 0,
   failed_items integer default 0,
   avg_duration_seconds decimal(10,2) default 0,
   avg_items_per_second decimal(10,2) default 0,
   error_rate_percentage decimal(5,2) default 0,
   peak_concurrent_syncs integer default 0,
   total_api_calls integer default 0,
   api_rate_limit_hits integer default 0,
   metadata jsonb default '{}',
   created_at timestamp with time zone default now(),
   unique(user_id, time_period, period_start)
);

-- Active sync sessions table for real-time monitoring
create table active_sync_sessions (
   id uuid primary key default gen_random_uuid(),
   user_id uuid references auth.users on delete cascade,
   sync_log_id uuid references sync_logs on delete cascade,
   sync_type text default 'manual',
   direction text default 'bidirectional',
   status text default 'running' check (status in ('running', 'paused', 'completed', 'failed')),
   total_items integer default 0,
   processed_items integer default 0,
   current_item_sku text,
   items_per_second decimal(10,2) default 0,
   elapsed_seconds integer default 0,
   estimated_remaining_seconds integer,
   started_at timestamp with time zone default now(),
   last_updated timestamp with time zone default now(),
   metadata jsonb default '{}',
   created_at timestamp with time zone default now()
);

-- Indexes for monitoring tables
create index idx_sync_queue_user on sync_queue(user_id);
create index idx_sync_queue_status on sync_queue(status);
create index idx_sync_queue_priority on sync_queue(priority desc);
create index idx_sync_queue_queued_at on sync_queue(queued_at desc);

create index idx_system_alerts_user on system_alerts(user_id);
create index idx_system_alerts_severity on system_alerts(severity);
create index idx_system_alerts_resolved on system_alerts(is_resolved);
create index idx_system_alerts_created on system_alerts(created_at desc);

create index idx_sync_performance_stats_user on sync_performance_stats(user_id);
create index idx_sync_performance_stats_period on sync_performance_stats(time_period, period_start desc);

create index idx_active_sync_sessions_user on active_sync_sessions(user_id);
create index idx_active_sync_sessions_status on active_sync_sessions(status);
create index idx_active_sync_sessions_started on active_sync_sessions(started_at desc);

-- Row Level Security policies for monitoring tables
alter table sync_queue enable row level security;
alter table system_alerts enable row level security;
alter table sync_performance_stats enable row level security;
alter table active_sync_sessions enable row level security;

-- RLS policies for sync_queue
create policy "Users can view their own sync queue" on sync_queue
   for select using (auth.uid() = user_id);

create policy "Users can manage their own sync queue" on sync_queue
   for all using (auth.uid() = user_id);

-- RLS policies for system_alerts
create policy "Users can view their own alerts" on system_alerts
   for select using (auth.uid() = user_id);

create policy "Users can manage their own alerts" on system_alerts
   for all using (auth.uid() = user_id);

-- RLS policies for sync_performance_stats
create policy "Users can view their own performance stats" on sync_performance_stats
   for select using (auth.uid() = user_id);

create policy "Users can manage their own performance stats" on sync_performance_stats
   for all using (auth.uid() = user_id);

-- RLS policies for active_sync_sessions
create policy "Users can view their own active sessions" on active_sync_sessions
   for select using (auth.uid() = user_id);

create policy "Users can manage their own active sessions" on active_sync_sessions
   for all using (auth.uid() = user_id);

-- Triggers for updated_at on monitoring tables
create trigger update_sync_queue_updated_at
   before update on sync_queue
   for each row execute function update_updated_at_column();

create trigger update_system_alerts_updated_at
   before update on system_alerts
   for each row execute function update_updated_at_column();

create trigger update_active_sync_sessions_updated_at
   before update on active_sync_sessions
   for each row execute function update_updated_at_column();

-- Function to create performance stats
create or replace function create_performance_stats(
   p_user_id uuid,
   p_period_start timestamp with time zone,
   p_period_end timestamp with time zone,
   p_time_period text
) returns void as $$
declare
   stats_record record;
begin
   -- Calculate stats from sync_logs for the period
   select
      count(*) as total_syncs,
      count(case when status = 'completed' then 1 end) as successful_syncs,
      count(case when status = 'failed' then 1 end) as failed_syncs,
      coalesce(sum(items_processed), 0) as total_items,
      coalesce(sum(items_succeeded), 0) as successful_items,
      coalesce(sum(items_failed), 0) as failed_items,
      coalesce(avg(duration_seconds), 0) as avg_duration_seconds,
      case when sum(duration_seconds) > 0 then sum(items_processed) / sum(duration_seconds) else 0 end as avg_items_per_second,
      case when count(*) > 0 then (count(case when status = 'failed' then 1 end)::decimal / count(*)::decimal) * 100 else 0 end as error_rate_percentage
   into stats_record
   from sync_logs
   where user_id = p_user_id
     and started_at >= p_period_start
     and started_at < p_period_end;

   -- Insert or update performance stats
   insert into sync_performance_stats (
      user_id, time_period, period_start, period_end,
      total_syncs, successful_syncs, failed_syncs,
      total_items, successful_items, failed_items,
      avg_duration_seconds, avg_items_per_second, error_rate_percentage
   ) values (
      p_user_id, p_time_period, p_period_start, p_period_end,
      stats_record.total_syncs, stats_record.successful_syncs, stats_record.failed_syncs,
      stats_record.total_items, stats_record.successful_items, stats_record.failed_items,
      stats_record.avg_duration_seconds, stats_record.avg_items_per_second, stats_record.error_rate_percentage
   )
   on conflict (user_id, time_period, period_start)
   do update set
      total_syncs = excluded.total_syncs,
      successful_syncs = excluded.successful_syncs,
      failed_syncs = excluded.failed_syncs,
      total_items = excluded.total_items,
      successful_items = excluded.successful_items,
      failed_items = excluded.failed_items,
      avg_duration_seconds = excluded.avg_duration_seconds,
      avg_items_per_second = excluded.avg_items_per_second,
      error_rate_percentage = excluded.error_rate_percentage,
      updated_at = now();
end;
$$ language plpgsql;

-- Note: The null user_id configurations are global defaults that can be overridden per user

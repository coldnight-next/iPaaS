-- Real-Time Monitoring System Migration
-- This migration creates tables for the monitoring dashboard feature

-- System metrics table - stores performance and health metrics
create table system_metrics (
  id uuid primary key default gen_random_uuid(),
  metric_type text check (metric_type in ('sync_performance', 'api_calls', 'error_rate', 'queue_size', 'system_health', 'resource_usage')),
  metric_name text not null,
  metric_value decimal(12,4),
  metric_unit text, -- e.g., 'ms', 'count', 'percent', 'MB'
  platform text check (platform in ('netsuite', 'shopify', 'system')),
  user_id uuid references auth.users on delete cascade,
  tags jsonb default '{}', -- Additional context tags
  timestamp timestamp with time zone default now(),
  created_at timestamp with time zone default now()
);

-- Real-time sync queue table - tracks active and pending sync operations
create table sync_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  sync_type text check (sync_type in ('product', 'inventory', 'order', 'customer', 'full')),
  direction text check (direction in ('netsuite_to_shopify', 'shopify_to_netsuite', 'bidirectional')),
  status text check (status in ('queued', 'processing', 'paused', 'completed', 'failed', 'cancelled')),
  priority integer default 5, -- 1 (highest) to 10 (lowest)
  estimated_items integer default 0,
  processed_items integer default 0,
  failed_items integer default 0,
  progress_percentage decimal(5,2) default 0,
  current_operation text, -- e.g., "Processing product SKU-12345"
  estimated_completion timestamp with time zone,
  started_at timestamp with time zone,
  queued_at timestamp with time zone default now(),
  completed_at timestamp with time zone,
  error_message text,
  metadata jsonb default '{}',
  created_by text default 'system',
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- System alerts table - stores alerts and notifications
create table system_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  alert_type text check (alert_type in ('sync_failure', 'api_error', 'rate_limit', 'validation_error', 'system_health', 'performance_degradation', 'warning', 'info')),
  severity text check (severity in ('critical', 'high', 'medium', 'low', 'info')),
  title text not null,
  message text not null,
  source text, -- Where the alert originated (e.g., 'netsuite', 'shopify', 'system')
  related_entity_type text, -- e.g., 'sync_log', 'product', 'order'
  related_entity_id uuid,
  alert_data jsonb default '{}', -- Additional context data
  is_acknowledged boolean default false,
  acknowledged_at timestamp with time zone,
  acknowledged_by uuid references auth.users,
  is_resolved boolean default false,
  resolved_at timestamp with time zone,
  resolution_notes text,
  notification_sent boolean default false,
  notification_channels text[], -- e.g., ['email', 'slack', 'sms']
  created_at timestamp with time zone default now(),
  expires_at timestamp with time zone
);

-- API rate limit tracking table
create table api_rate_limits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  platform text check (platform in ('netsuite', 'shopify')),
  endpoint text,
  requests_made integer default 0,
  requests_limit integer not null,
  limit_window_start timestamp with time zone not null,
  limit_window_end timestamp with time zone not null,
  throttle_delay_ms integer default 0,
  is_throttled boolean default false,
  last_request_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Sync performance statistics (aggregated metrics)
create table sync_performance_stats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  sync_type text check (sync_type in ('product', 'inventory', 'order', 'customer', 'full')),
  platform text check (platform in ('netsuite', 'shopify', 'bidirectional')),
  time_period text check (time_period in ('hour', 'day', 'week', 'month')),
  period_start timestamp with time zone not null,
  period_end timestamp with time zone not null,
  total_syncs integer default 0,
  successful_syncs integer default 0,
  failed_syncs integer default 0,
  total_items integer default 0,
  successful_items integer default 0,
  failed_items integer default 0,
  avg_duration_seconds decimal(10,2),
  min_duration_seconds decimal(10,2),
  max_duration_seconds decimal(10,2),
  avg_items_per_second decimal(10,4),
  error_rate_percentage decimal(5,2),
  created_at timestamp with time zone default now()
);

-- Active sync sessions table - tracks current real-time sync progress
create table active_sync_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  sync_log_id uuid references sync_logs(id) on delete cascade,
  session_token text unique not null,
  sync_type text not null,
  direction text not null,
  status text check (status in ('initializing', 'fetching', 'processing', 'writing', 'finalizing', 'completed', 'failed')),
  total_items integer default 0,
  processed_items integer default 0,
  current_item_index integer default 0,
  current_item_sku text,
  items_per_second decimal(8,2),
  elapsed_seconds integer default 0,
  estimated_remaining_seconds integer,
  last_heartbeat timestamp with time zone default now(),
  metadata jsonb default '{}',
  started_at timestamp with time zone default now(),
  completed_at timestamp with time zone
);

-- Dashboard widget configurations - user customizable dashboard
create table dashboard_widgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  widget_type text check (widget_type in ('sync_status', 'performance_chart', 'error_log', 'queue_monitor', 'api_usage', 'alert_feed', 'stats_card', 'recent_activity')),
  title text not null,
  position_x integer default 0,
  position_y integer default 0,
  width integer default 4,
  height integer default 3,
  config jsonb default '{}', -- Widget-specific configuration
  is_visible boolean default true,
  refresh_interval_seconds integer default 30,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Notification preferences table
create table notification_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade unique,
  email_notifications boolean default true,
  slack_notifications boolean default false,
  slack_webhook_url text,
  sms_notifications boolean default false,
  sms_phone_number text,
  alert_types jsonb default '["critical", "high"]'::jsonb, -- Which alert types to notify about
  quiet_hours_start time,
  quiet_hours_end time,
  timezone text default 'UTC',
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Create indexes for performance
create index idx_system_metrics_type on system_metrics(metric_type);
create index idx_system_metrics_timestamp on system_metrics(timestamp desc);
create index idx_system_metrics_user on system_metrics(user_id);
create index idx_system_metrics_platform on system_metrics(platform);
create index idx_sync_queue_user on sync_queue(user_id);
create index idx_sync_queue_status on sync_queue(status);
create index idx_sync_queue_priority on sync_queue(priority);
create index idx_sync_queue_queued on sync_queue(queued_at);
create index idx_system_alerts_user on system_alerts(user_id);
create index idx_system_alerts_severity on system_alerts(severity);
create index idx_system_alerts_type on system_alerts(alert_type);
create index idx_system_alerts_acknowledged on system_alerts(is_acknowledged);
create index idx_system_alerts_resolved on system_alerts(is_resolved);
create index idx_system_alerts_created on system_alerts(created_at desc);
create index idx_api_rate_limits_user_platform on api_rate_limits(user_id, platform);
create index idx_api_rate_limits_window on api_rate_limits(limit_window_end);
create index idx_sync_performance_user on sync_performance_stats(user_id);
create index idx_sync_performance_period on sync_performance_stats(period_start, period_end);
create index idx_active_sessions_user on active_sync_sessions(user_id);
create index idx_active_sessions_status on active_sync_sessions(status);
create index idx_active_sessions_heartbeat on active_sync_sessions(last_heartbeat);
create index idx_dashboard_widgets_user on dashboard_widgets(user_id);
create index idx_notification_prefs_user on notification_preferences(user_id);

-- Row Level Security
alter table system_metrics enable row level security;
alter table sync_queue enable row level security;
alter table system_alerts enable row level security;
alter table api_rate_limits enable row level security;
alter table sync_performance_stats enable row level security;
alter table active_sync_sessions enable row level security;
alter table dashboard_widgets enable row level security;
alter table notification_preferences enable row level security;

-- RLS Policies
create policy "Users can view their own system metrics" on system_metrics
  for select using (auth.uid() = user_id or user_id is null);

create policy "System can insert metrics" on system_metrics
  for insert with check (true);

create policy "Users can view their own sync queue" on sync_queue
  for select using (auth.uid() = user_id);

create policy "Users can manage their own sync queue" on sync_queue
  for all using (auth.uid() = user_id);

create policy "Users can view their own alerts" on system_alerts
  for select using (auth.uid() = user_id);

create policy "Users can manage their own alerts" on system_alerts
  for all using (auth.uid() = user_id);

create policy "Users can view their own rate limits" on api_rate_limits
  for select using (auth.uid() = user_id);

create policy "System can manage rate limits" on api_rate_limits
  for all using (true);

create policy "Users can view their own performance stats" on sync_performance_stats
  for select using (auth.uid() = user_id or user_id is null);

create policy "Users can view their active sync sessions" on active_sync_sessions
  for select using (auth.uid() = user_id);

create policy "System can manage sync sessions" on active_sync_sessions
  for all using (auth.uid() = user_id);

create policy "Users can view their own dashboard widgets" on dashboard_widgets
  for select using (auth.uid() = user_id);

create policy "Users can manage their own dashboard widgets" on dashboard_widgets
  for all using (auth.uid() = user_id);

create policy "Users can view their notification preferences" on notification_preferences
  for select using (auth.uid() = user_id);

create policy "Users can manage their notification preferences" on notification_preferences
  for all using (auth.uid() = user_id);

-- Triggers
create trigger update_sync_queue_updated_at
  before update on sync_queue
  for each row execute function update_updated_at_column();

create trigger update_api_rate_limits_updated_at
  before update on api_rate_limits
  for each row execute function update_updated_at_column();

create trigger update_dashboard_widgets_updated_at
  before update on dashboard_widgets
  for each row execute function update_updated_at_column();

create trigger update_notification_preferences_updated_at
  before update on notification_preferences
  for each row execute function update_updated_at_column();

-- Function to calculate sync progress percentage
create or replace function calculate_sync_progress(processed integer, total integer)
returns decimal(5,2) as $$
begin
  if total = 0 or total is null then
    return 0;
  end if;
  return round((processed::decimal / total::decimal) * 100, 2);
end;
$$ language plpgsql immutable;

-- Function to update sync queue progress
create or replace function update_sync_queue_progress()
returns trigger as $$
begin
  new.progress_percentage := calculate_sync_progress(new.processed_items, new.estimated_items);
  
  -- Calculate estimated completion
  if new.status = 'processing' and new.processed_items > 0 and new.started_at is not null then
    declare
      elapsed_seconds integer;
      items_per_second decimal;
      remaining_items integer;
      remaining_seconds integer;
    begin
      elapsed_seconds := extract(epoch from (now() - new.started_at));
      if elapsed_seconds > 0 then
        items_per_second := new.processed_items::decimal / elapsed_seconds;
        if items_per_second > 0 then
          remaining_items := new.estimated_items - new.processed_items;
          remaining_seconds := ceiling(remaining_items / items_per_second);
          new.estimated_completion := now() + (remaining_seconds || ' seconds')::interval;
        end if;
      end if;
    end;
  end if;
  
  return new;
end;
$$ language plpgsql;

create trigger calculate_sync_queue_progress
  before insert or update on sync_queue
  for each row execute function update_sync_queue_progress();

-- Function to clean up old metrics (older than 90 days)
create or replace function cleanup_old_metrics()
returns void as $$
begin
  delete from system_metrics where created_at < now() - interval '90 days';
  delete from system_alerts where is_resolved = true and created_at < now() - interval '30 days';
  delete from active_sync_sessions where completed_at < now() - interval '7 days';
end;
$$ language plpgsql;

-- Function to aggregate sync performance statistics
create or replace function aggregate_sync_performance(
  p_user_id uuid,
  p_period_start timestamp with time zone,
  p_period_end timestamp with time zone,
  p_time_period text
)
returns void as $$
begin
  insert into sync_performance_stats (
    user_id, sync_type, platform, time_period, period_start, period_end,
    total_syncs, successful_syncs, failed_syncs,
    total_items, successful_items, failed_items,
    avg_duration_seconds, min_duration_seconds, max_duration_seconds,
    avg_items_per_second, error_rate_percentage
  )
  select
    p_user_id,
    'full' as sync_type,
    'bidirectional' as platform,
    p_time_period,
    p_period_start,
    p_period_end,
    count(*) as total_syncs,
    count(*) filter (where status = 'completed') as successful_syncs,
    count(*) filter (where status = 'failed') as failed_syncs,
    sum(items_processed) as total_items,
    sum(items_succeeded) as successful_items,
    sum(items_failed) as failed_items,
    avg(duration_seconds) as avg_duration_seconds,
    min(duration_seconds) as min_duration_seconds,
    max(duration_seconds) as max_duration_seconds,
    avg(case when duration_seconds > 0 then items_processed::decimal / duration_seconds else 0 end) as avg_items_per_second,
    case 
      when sum(items_processed) > 0 
      then round((sum(items_failed)::decimal / sum(items_processed)::decimal) * 100, 2)
      else 0
    end as error_rate_percentage
  from sync_logs
  where user_id = p_user_id
    and started_at >= p_period_start
    and started_at < p_period_end
    and status in ('completed', 'failed');
end;
$$ language plpgsql;

-- Function to create alert
create or replace function create_alert(
  p_user_id uuid,
  p_alert_type text,
  p_severity text,
  p_title text,
  p_message text,
  p_source text default null,
  p_related_entity_type text default null,
  p_related_entity_id uuid default null,
  p_alert_data jsonb default '{}'::jsonb
)
returns uuid as $$
declare
  alert_id uuid;
begin
  insert into system_alerts (
    user_id, alert_type, severity, title, message, source,
    related_entity_type, related_entity_id, alert_data
  ) values (
    p_user_id, p_alert_type, p_severity, p_title, p_message, p_source,
    p_related_entity_type, p_related_entity_id, p_alert_data
  ) returning id into alert_id;
  
  return alert_id;
end;
$$ language plpgsql;

-- Insert default dashboard widgets for new users
create or replace function create_default_dashboard_widgets(p_user_id uuid)
returns void as $$
begin
  insert into dashboard_widgets (user_id, widget_type, title, position_x, position_y, width, height) values
    (p_user_id, 'sync_status', 'Live Sync Status', 0, 0, 6, 2),
    (p_user_id, 'stats_card', 'Sync Statistics', 6, 0, 3, 2),
    (p_user_id, 'queue_monitor', 'Sync Queue', 9, 0, 3, 2),
    (p_user_id, 'performance_chart', 'Performance Trends', 0, 2, 6, 3),
    (p_user_id, 'error_log', 'Recent Errors', 6, 2, 6, 3),
    (p_user_id, 'alert_feed', 'System Alerts', 0, 5, 12, 2);
end;
$$ language plpgsql;

-- Insert default notification preferences for new users
create or replace function create_default_notification_preferences(p_user_id uuid)
returns void as $$
begin
  insert into notification_preferences (user_id, email_notifications, alert_types)
  values (p_user_id, true, '["critical", "high"]'::jsonb)
  on conflict (user_id) do nothing;
end;
$$ language plpgsql;

-- Add comment documentation
comment on table system_metrics is 'Stores real-time performance and health metrics for monitoring';
comment on table sync_queue is 'Tracks active and pending sync operations in real-time';
comment on table system_alerts is 'System alerts and notifications for users';
comment on table api_rate_limits is 'Tracks API rate limit usage per platform';
comment on table sync_performance_stats is 'Aggregated performance statistics for reporting';
comment on table active_sync_sessions is 'Real-time sync session tracking with heartbeat';
comment on table dashboard_widgets is 'User-customizable dashboard widget configurations';
comment on table notification_preferences is 'User notification preferences and settings';

-- Monitoring and Alerting System Migration
-- Adds comprehensive monitoring, metrics collection, and alerting capabilities

-- System metrics table for performance monitoring
create table system_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  sync_log_id uuid references sync_logs on delete cascade,
  metric_type text check (metric_type in ('performance', 'error', 'api_usage', 'system_health')),
  metric_name text not null,
  value decimal(10,2) not null,
  unit text not null,
  metadata jsonb default '{}',
  timestamp timestamp with time zone default now()
);

-- Alert rules table for configurable alerting
create table alert_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  name text not null,
  description text,
  metric_name text not null,
  condition text check (condition in ('greater_than', 'less_than', 'equals', 'not_equals')),
  threshold decimal(10,2) not null,
  severity text check (severity in ('low', 'medium', 'high', 'critical')) default 'medium',
  enabled boolean default true,
  notification_channels text[] default array['email'],
  cooldown_minutes integer default 60,
  last_triggered timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Alerts table for triggered alerts
create table alerts (
  id uuid primary key default gen_random_uuid(),
  alert_rule_id uuid references alert_rules on delete cascade,
  user_id uuid references auth.users on delete cascade,
  message text not null,
  severity text check (severity in ('low', 'medium', 'high', 'critical')) default 'medium',
  status text check (status in ('active', 'acknowledged', 'resolved')) default 'active',
  triggered_at timestamp with time zone default now(),
  resolved_at timestamp with time zone,
  metadata jsonb default '{}'
);

-- Notification logs table for tracking sent notifications
create table notification_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  type text check (type in ('email', 'slack', 'webhook')),
  recipient text not null,
  subject text,
  message text not null,
  metadata jsonb default '{}',
  status text check (status in ('sent', 'failed')) default 'sent',
  sent_at timestamp with time zone default now(),
  error_message text
);

-- Search history table for enhanced product search
create table search_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  query text not null,
  filters jsonb default '{}',
  result_count integer default 0,
  timestamp timestamp with time zone default now()
);

-- Field mappings table for custom field transformations
create table field_mappings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  source_platform text check (source_platform in ('netsuite', 'shopify')),
  target_platform text check (target_platform in ('netsuite', 'shopify')),
  source_field text not null,
  target_field text not null,
  transformation_type text check (transformation_type in ('direct', 'uppercase', 'lowercase', 'trim', 'date_format', 'number_format', 'lookup', 'javascript')),
  transformation_config jsonb default '{}',
  is_active boolean default true,
  priority integer default 0,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Create indexes for performance
create index idx_system_metrics_user_timestamp on system_metrics(user_id, timestamp);
create index idx_system_metrics_type_name on system_metrics(metric_type, metric_name);
create index idx_alert_rules_user_enabled on alert_rules(user_id, enabled);
create index idx_alerts_user_status on alerts(user_id, status);
create index idx_alerts_rule_triggered on alerts(alert_rule_id, triggered_at);
create index idx_notification_logs_user_type on notification_logs(user_id, type);
create index idx_search_history_user_timestamp on search_history(user_id, timestamp desc);
create index idx_field_mappings_user_platforms on field_mappings(user_id, source_platform, target_platform);
create index idx_field_mappings_active_priority on field_mappings(is_active, priority desc);

-- Row Level Security policies
alter table system_metrics enable row level security;
alter table alert_rules enable row level security;
alter table alerts enable row level security;
alter table notification_logs enable row level security;
alter table search_history enable row level security;
alter table field_mappings enable row level security;

-- RLS policies for system_metrics
create policy "Users can view their own metrics" on system_metrics
  for select using (auth.uid() = user_id);

create policy "Users can insert their own metrics" on system_metrics
  for insert with check (auth.uid() = user_id);

-- RLS policies for alert_rules
create policy "Users can manage their alert rules" on alert_rules
  for all using (auth.uid() = user_id);

-- RLS policies for alerts
create policy "Users can manage their alerts" on alerts
  for all using (auth.uid() = user_id);

-- RLS policies for notification_logs
create policy "Users can view their notification logs" on notification_logs
  for select using (auth.uid() = user_id);

create policy "Users can insert notification logs" on notification_logs
  for insert with check (auth.uid() = user_id);

-- RLS policies for search_history
create policy "Users can manage their search history" on search_history
  for all using (auth.uid() = user_id);

-- RLS policies for field_mappings
create policy "Users can manage their field mappings" on field_mappings
  for all using (auth.uid() = user_id);

-- Functions for updating timestamps
create or replace function update_alert_rules_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_alert_rules_updated_at
  before update on alert_rules
  for each row execute function update_alert_rules_updated_at();

create or replace function update_field_mappings_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_field_mappings_updated_at
  before update on field_mappings
  for each row execute function update_field_mappings_updated_at();

-- Insert default alert rules for common scenarios
insert into alert_rules (user_id, name, description, metric_name, condition, threshold, severity, notification_channels, cooldown_minutes) values
(null, 'High Sync Error Rate', 'Alert when sync success rate drops below 80%', 'sync_success_rate', 'less_than', 80, 'high', array['email'], 30),
(null, 'Slow Sync Performance', 'Alert when sync duration exceeds 5 minutes', 'sync_duration_seconds', 'greater_than', 300, 'medium', array['email'], 60),
(null, 'API Rate Limit Approaching', 'Alert when API calls exceed safe threshold', 'api_calls_made', 'greater_than', 1000, 'medium', array['email'], 15),
(null, 'System Health Check', 'Alert when system health metrics indicate issues', 'sync_errors_count', 'greater_than', 5, 'critical', array['email', 'slack'], 10);

-- Insert sample field mappings for common transformations
insert into field_mappings (user_id, source_platform, target_platform, source_field, target_field, transformation_type, priority) values
(null, 'netsuite', 'shopify', 'displayName', 'title', 'direct', 10),
(null, 'netsuite', 'shopify', 'description', 'body_html', 'direct', 9),
(null, 'netsuite', 'shopify', 'itemId', 'sku', 'direct', 8),
(null, 'netsuite', 'shopify', 'basePrice', 'price', 'number_format', 7),
(null, 'shopify', 'netsuite', 'title', 'displayName', 'direct', 10),
(null, 'shopify', 'netsuite', 'body_html', 'description', 'direct', 9),
(null, 'shopify', 'netsuite', 'sku', 'itemId', 'direct', 8),
(null, 'shopify', 'netsuite', 'price', 'basePrice', 'number_format', 7);

-- Note: null user_id entries are global defaults that can be overridden per user
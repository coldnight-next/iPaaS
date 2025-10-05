-- Add performance monitoring tables

-- Performance metrics table
create table performance_metrics (
  id uuid primary key default gen_random_uuid(),
  function_name text not null,
  execution_time_ms integer not null,
  memory_usage_mb decimal(8,2),
  status text check (status in ('success', 'error', 'timeout')),
  timestamp timestamp with time zone default now(),
  metadata jsonb default '{}',
  created_at timestamp with time zone default now()
);

-- Alert rules table
create table alert_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  condition jsonb not null,
  severity text check (severity in ('low', 'medium', 'high', 'critical')) default 'medium',
  enabled boolean default true,
  cooldown_minutes integer default 60,
  last_triggered timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Alerts table (enhanced)
create table alerts (
  id uuid primary key default gen_random_uuid(),
  alert_rule_id uuid references alert_rules(id),
  user_id uuid references auth.users(id),
  message text not null,
  severity text check (severity in ('low', 'medium', 'high', 'critical')) default 'medium',
  status text check (status in ('active', 'acknowledged', 'resolved')) default 'active',
  triggered_at timestamp with time zone default now(),
  acknowledged_at timestamp with time zone,
  resolved_at timestamp with time zone,
  metadata jsonb default '{}',
  created_at timestamp with time zone default now()
);

-- Rate limit states table (for persistence)
create table rate_limit_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  platform text check (platform in ('netsuite', 'shopify')),
  requests_this_minute integer default 0,
  requests_this_hour integer default 0,
  last_request_time timestamp with time zone default now(),
  current_backoff_seconds integer default 0,
  is_throttled boolean default false,
  throttle_until timestamp with time zone,
  consecutive_errors integer default 0,
  last_error_time timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  unique(user_id, platform)
);

-- Create indexes
create index idx_performance_metrics_function_name on performance_metrics(function_name);
create index idx_performance_metrics_timestamp on performance_metrics(timestamp);
create index idx_performance_metrics_status on performance_metrics(status);
create index idx_alert_rules_enabled on alert_rules(enabled);
create index idx_alerts_user_id on alerts(user_id);
create index idx_alerts_status on alerts(status);
create index idx_alerts_triggered_at on alerts(triggered_at);
create index idx_rate_limit_states_user_platform on rate_limit_states(user_id, platform);

-- Row Level Security
alter table performance_metrics enable row level security;
alter table alert_rules enable row level security;
alter table alerts enable row level security;
alter table rate_limit_states enable row level security;

-- RLS policies for performance_metrics (global metrics, no user isolation needed)
create policy "Allow all operations on performance_metrics" on performance_metrics for all using (true);

-- RLS policies for alert_rules (global rules)
create policy "Allow all operations on alert_rules" on alert_rules for all using (true);

-- RLS policies for alerts
create policy "Users can view their own alerts" on alerts for select using (auth.uid() = user_id);
create policy "System can create alerts" on alerts for insert with check (true);
create policy "Users can update their own alerts" on alerts for update using (auth.uid() = user_id);

-- RLS policies for rate_limit_states
create policy "Users can view their own rate limit states" on rate_limit_states for select using (auth.uid() = user_id);
create policy "Users can manage their own rate limit states" on rate_limit_states for all using (auth.uid() = user_id);

-- Triggers for updated_at
create trigger update_alert_rules_updated_at
  before update on alert_rules
  for each row execute function update_updated_at_column();

create trigger update_rate_limit_states_updated_at
  before update on rate_limit_states
  for each row execute function update_updated_at_column();

-- Insert default alert rules
insert into alert_rules (name, condition, severity, cooldown_minutes) values
  ('High Function Execution Time', '{"metric": "execution_time", "operator": ">", "threshold": 30000}', 'high', 30),
  ('Critical Function Execution Time', '{"metric": "execution_time", "operator": ">", "threshold": 60000}', 'critical', 15),
  ('High Error Rate', '{"metric": "error_rate", "operator": ">", "threshold": 0.1}', 'high', 60),
  ('Memory Usage Alert', '{"metric": "memory_usage", "operator": ">", "threshold": 100}', 'medium', 120);
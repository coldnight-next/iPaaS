-- API Rate Limit Intelligence Migration
-- Adds intelligent rate limiting, adaptive throttling, and API usage tracking

-- Rate limit states table for tracking API usage per user/platform
create table rate_limit_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
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

-- API usage logs table for detailed tracking
create table api_usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  platform text check (platform in ('netsuite', 'shopify')),
  operation text not null,
  status_code integer,
  response_time_ms integer,
  success boolean default true,
  rate_limit_hit boolean default false,
  retry_count integer default 0,
  error_message text,
  request_size_bytes integer,
  response_size_bytes integer,
  timestamp timestamp with time zone default now()
);

-- Rate limit configurations table (extends sync_configurations)
-- This allows per-user rate limit overrides

-- Create indexes for performance
create index idx_rate_limit_states_user_platform on rate_limit_states(user_id, platform);
create index idx_rate_limit_states_throttled on rate_limit_states(is_throttled) where is_throttled = true;
create index idx_api_usage_logs_user_timestamp on api_usage_logs(user_id, timestamp desc);
create index idx_api_usage_logs_platform_operation on api_usage_logs(platform, operation);
create index idx_api_usage_logs_rate_limit_hit on api_usage_logs(rate_limit_hit) where rate_limit_hit = true;

-- Row Level Security policies
alter table rate_limit_states enable row level security;
alter table api_usage_logs enable row level security;

-- RLS policies for rate_limit_states
create policy "Users can manage their rate limit states" on rate_limit_states
  for all using (auth.uid() = user_id);

-- RLS policies for api_usage_logs
create policy "Users can view their API usage logs" on api_usage_logs
  for select using (auth.uid() = user_id);

create policy "Users can insert their API usage logs" on api_usage_logs
  for insert with check (auth.uid() = user_id);

-- Function to update rate limit state timestamps
create or replace function update_rate_limit_states_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_rate_limit_states_updated_at
  before update on rate_limit_states
  for each row execute function update_rate_limit_states_updated_at();

-- Function to automatically clean up old API usage logs (keep last 30 days)
create or replace function cleanup_old_api_logs()
returns void as $$
begin
  delete from api_usage_logs
  where timestamp < now() - interval '30 days';
end;
$$ language plpgsql;

-- Insert default rate limit configurations
insert into sync_configurations (config_key, config_value, description) values
('netsuite_rate_limit_config', '{
  "maxRequestsPerMinute": 100,
  "maxRequestsPerHour": 5000,
  "burstLimit": 10,
  "backoffMultiplier": 2.0,
  "maxBackoffSeconds": 300
}', 'NetSuite API rate limiting configuration'),
('shopify_rate_limit_config', '{
  "maxRequestsPerMinute": 40,
  "maxRequestsPerHour": 2000,
  "burstLimit": 4,
  "backoffMultiplier": 1.5,
  "maxBackoffSeconds": 600
}', 'Shopify API rate limiting configuration');

-- Create a view for rate limit monitoring
create view rate_limit_monitoring as
select
  rls.user_id,
  rls.platform,
  rls.requests_this_minute,
  rls.requests_this_hour,
  rls.is_throttled,
  rls.throttle_until,
  rls.consecutive_errors,
  sc.config_value as rate_limit_config,
  case
    when rls.is_throttled and rls.throttle_until > now() then
      extract(epoch from (rls.throttle_until - now()))
    else 0
  end as seconds_until_unthrottled
from rate_limit_states rls
left join sync_configurations sc on sc.config_key = rls.platform || '_rate_limit_config';

-- Grant access to the view
grant select on rate_limit_monitoring to authenticated;

-- Create a function to get current rate limit status
create or replace function get_rate_limit_status(p_user_id uuid, p_platform text)
returns json as $$
declare
  result json;
begin
  select json_build_object(
    'requestsThisMinute', rls.requests_this_minute,
    'requestsThisHour', rls.requests_this_hour,
    'isThrottled', rls.is_throttled,
    'throttleUntil', rls.throttle_until,
    'consecutiveErrors', rls.consecutive_errors,
    'config', sc.config_value,
    'secondsUntilUnthrottled', case
      when rls.is_throttled and rls.throttle_until > now() then
        extract(epoch from (rls.throttle_until - now()))
      else 0
    end
  ) into result
  from rate_limit_states rls
  left join sync_configurations sc on sc.config_key = rls.platform || '_rate_limit_config'
  where rls.user_id = p_user_id and rls.platform = p_platform;

  return coalesce(result, json_build_object(
    'requestsThisMinute', 0,
    'requestsThisHour', 0,
    'isThrottled', false,
    'consecutiveErrors', 0,
    'secondsUntilUnthrottled', 0
  ));
end;
$$ language plpgsql security definer;

-- Create a function to reset rate limit state (admin function)
create or replace function reset_rate_limit_state(p_user_id uuid, p_platform text)
returns boolean as $$
begin
  update rate_limit_states
  set
    requests_this_minute = 0,
    requests_this_hour = 0,
    is_throttled = false,
    throttle_until = null,
    current_backoff_seconds = 0,
    consecutive_errors = 0,
    last_error_time = null,
    updated_at = now()
  where user_id = p_user_id and platform = p_platform;

  return found;
end;
$$ language plpgsql security definer;

-- Create alert rules for rate limit violations
insert into alert_rules (name, description, metric_name, condition, threshold, severity, notification_channels, cooldown_minutes) values
('Rate Limit Approaching', 'Alert when API usage approaches rate limits', 'api_calls_made', 'greater_than', 80, 'medium', array['email'], 15),
('Rate Limit Exceeded', 'Critical alert when rate limits are exceeded', 'rate_limit_violations', 'greater_than', 0, 'high', array['email', 'slack'], 5),
('High Error Rate', 'Alert when API error rate is too high', 'api_error_rate', 'greater_than', 20, 'high', array['email'], 30);

-- Note: null user_id entries are global defaults that can be overridden per user
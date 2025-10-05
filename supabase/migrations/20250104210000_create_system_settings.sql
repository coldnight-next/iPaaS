-- Create system_settings table for application configuration
CREATE TABLE IF NOT EXISTS public.system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT NOT NULL UNIQUE,
  setting_value JSONB NOT NULL,
  setting_type TEXT NOT NULL CHECK (setting_type IN ('string', 'number', 'boolean', 'json', 'array')),
  category TEXT NOT NULL DEFAULT 'general' CHECK (category IN ('general', 'api', 'sync', 'security', 'notifications', 'advanced')),
  display_name TEXT NOT NULL,
  description TEXT,
  is_public BOOLEAN NOT NULL DEFAULT false,
  is_editable BOOLEAN NOT NULL DEFAULT true,
  default_value JSONB,
  validation_rules JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id)
);

-- Create index for faster lookups
CREATE INDEX idx_system_settings_key ON public.system_settings(setting_key);
CREATE INDEX idx_system_settings_category ON public.system_settings(category);
CREATE INDEX idx_system_settings_public ON public.system_settings(is_public);

-- Enable Row Level Security
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Anyone can read public settings
CREATE POLICY "Anyone can view public settings"
  ON public.system_settings
  FOR SELECT
  USING (is_public = true);

-- Authenticated users can view all settings
CREATE POLICY "Authenticated users can view all settings"
  ON public.system_settings
  FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can insert settings
CREATE POLICY "Admins can insert settings"
  ON public.system_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_id = auth.uid()
      AND role = 'admin'
    )
  );

-- Only admins can update editable settings
CREATE POLICY "Admins can update editable settings"
  ON public.system_settings
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_id = auth.uid()
      AND role = 'admin'
    )
    AND is_editable = true
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_id = auth.uid()
      AND role = 'admin'
    )
    AND is_editable = true
  );

-- Only admins can delete settings
CREATE POLICY "Admins can delete settings"
  ON public.system_settings
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_id = auth.uid()
      AND role = 'admin'
    )
  );

-- Trigger to update updated_at timestamp
CREATE TRIGGER update_system_settings_updated_at
  BEFORE UPDATE ON public.system_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Insert default system settings
INSERT INTO public.system_settings (setting_key, setting_value, setting_type, category, display_name, description, is_public, is_editable, default_value) VALUES
  -- API Settings
  ('shopify_api_version', '"2024-01"', 'string', 'api', 'Shopify API Version', 'The Shopify API version to use for requests', false, true, '"2024-01"'),
  ('netsuite_api_version', '"2023.2"', 'string', 'api', 'NetSuite API Version', 'The NetSuite API version to use for requests', false, true, '"2023.2"'),
  ('api_request_timeout', '30000', 'number', 'api', 'API Request Timeout (ms)', 'Maximum time to wait for API responses in milliseconds', false, true, '30000'),
  ('api_retry_attempts', '3', 'number', 'api', 'API Retry Attempts', 'Number of times to retry failed API requests', false, true, '3'),
  ('api_retry_delay', '1000', 'number', 'api', 'API Retry Delay (ms)', 'Delay between retry attempts in milliseconds', false, true, '1000'),

  -- Sync Settings
  ('default_sync_interval', '30', 'number', 'sync', 'Default Sync Interval (minutes)', 'Default time between automatic syncs', false, true, '30'),
  ('max_concurrent_syncs', '5', 'number', 'sync', 'Max Concurrent Syncs', 'Maximum number of simultaneous sync operations', false, true, '5'),
  ('sync_batch_size', '100', 'number', 'sync', 'Sync Batch Size', 'Number of items to process in each sync batch', false, true, '100'),
  ('sync_timeout_seconds', '300', 'number', 'sync', 'Sync Timeout (seconds)', 'Maximum time allowed for a sync operation', false, true, '300'),
  ('enable_auto_sync', 'true', 'boolean', 'sync', 'Enable Auto Sync', 'Automatically sync data on schedule', false, true, 'true'),

  -- Security Settings
  ('session_timeout_minutes', '60', 'number', 'security', 'Session Timeout (minutes)', 'Time before user session expires', false, true, '60'),
  ('password_min_length', '8', 'number', 'security', 'Minimum Password Length', 'Minimum number of characters for passwords', false, true, '8'),
  ('require_password_complexity', 'true', 'boolean', 'security', 'Require Password Complexity', 'Require uppercase, lowercase, and numbers', false, true, 'true'),
  ('enable_2fa', 'false', 'boolean', 'security', 'Enable Two-Factor Authentication', 'Require 2FA for user accounts', false, true, 'false'),
  ('allowed_ip_addresses', '[]', 'array', 'security', 'Allowed IP Addresses', 'Whitelist of IP addresses (empty = allow all)', false, true, '[]'),

  -- Notification Settings
  ('enable_email_notifications', 'true', 'boolean', 'notifications', 'Enable Email Notifications', 'Send email notifications for events', false, true, 'true'),
  ('notify_on_sync_complete', 'true', 'boolean', 'notifications', 'Notify on Sync Complete', 'Send notification when sync completes', false, true, 'true'),
  ('notify_on_sync_failure', 'true', 'boolean', 'notifications', 'Notify on Sync Failure', 'Send notification when sync fails', false, true, 'true'),
  ('notification_email', '""', 'string', 'notifications', 'Notification Email', 'Email address for system notifications', false, true, '""'),

  -- General Settings
  ('system_name', '"NetSuite Shopify iPaaS"', 'string', 'general', 'System Name', 'Display name for the application', true, true, '"NetSuite Shopify iPaaS"'),
  ('maintenance_mode', 'false', 'boolean', 'general', 'Maintenance Mode', 'Disable user access for maintenance', false, true, 'false'),
  ('enable_debug_logging', 'false', 'boolean', 'general', 'Enable Debug Logging', 'Log detailed debug information', false, true, 'false'),
  ('timezone', '"UTC"', 'string', 'general', 'System Timezone', 'Default timezone for the application', false, true, '"UTC"'),

  -- Advanced Settings
  ('enable_webhooks', 'true', 'boolean', 'advanced', 'Enable Webhooks', 'Allow webhook integrations', false, true, 'true'),
  ('webhook_retry_attempts', '3', 'number', 'advanced', 'Webhook Retry Attempts', 'Number of retry attempts for failed webhooks', false, true, '3'),
  ('cache_ttl_seconds', '300', 'number', 'advanced', 'Cache TTL (seconds)', 'Time to live for cached data', false, true, '300'),
  ('log_retention_days', '90', 'number', 'advanced', 'Log Retention (days)', 'Days to keep sync logs before deletion', false, true, '90')
ON CONFLICT (setting_key) DO NOTHING;

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_settings TO authenticated;

COMMENT ON TABLE public.system_settings IS 'Application-wide configuration settings';

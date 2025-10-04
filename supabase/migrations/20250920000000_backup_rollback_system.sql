-- Backup and Rollback System Migration
-- Provides comprehensive change tracking, snapshots, and point-in-time restoration

-- ========================================
-- PRODUCT SNAPSHOTS TABLE
-- Stores full product state before any modification
-- ========================================
create table product_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  product_id uuid references products(id) on delete cascade not null,
  platform text check (platform in ('netsuite', 'shopify')) not null,
  
  -- Snapshot metadata
  snapshot_type text check (snapshot_type in ('pre_sync', 'post_sync', 'manual', 'scheduled')) not null,
  sync_log_id uuid references sync_logs(id) on delete set null,
  restore_point_id uuid,
  
  -- Complete product state at time of snapshot
  snapshot_data jsonb not null, -- Full product data
  
  -- Checksums for integrity verification
  data_checksum text not null,
  
  -- Versioning
  version integer not null default 1,
  previous_snapshot_id uuid references product_snapshots(id) on delete set null,
  
  -- Timestamps
  created_at timestamp with time zone default now() not null,
  expires_at timestamp with time zone, -- For retention policy
  
  -- Metadata
  metadata jsonb default '{}',
  notes text
);

-- ========================================
-- CHANGE LOG TABLE
-- Tracks all field-level changes for audit trail
-- ========================================
create table change_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  
  -- Entity information
  entity_type text check (entity_type in ('product', 'inventory', 'order', 'customer')) not null,
  entity_id uuid not null, -- ID of the affected entity (product, etc.)
  platform text check (platform in ('netsuite', 'shopify')) not null,
  
  -- Change details
  operation text check (operation in ('create', 'update', 'delete', 'sync')) not null,
  sync_log_id uuid references sync_logs(id) on delete set null,
  
  -- Field-level changes
  field_name text not null,
  old_value jsonb,
  new_value jsonb,
  value_diff jsonb, -- Computed diff for complex objects
  
  -- Change metadata
  change_source text check (change_source in ('sync', 'manual', 'api', 'webhook', 'scheduled')) not null,
  triggered_by text, -- User email or system identifier
  
  -- Snapshot reference
  before_snapshot_id uuid references product_snapshots(id) on delete set null,
  after_snapshot_id uuid references product_snapshots(id) on delete set null,
  
  -- Timestamps
  changed_at timestamp with time zone default now() not null,
  
  -- Additional metadata
  metadata jsonb default '{}'
);

-- ========================================
-- RESTORE POINTS TABLE
-- Named checkpoints for easy restoration
-- ========================================
create table restore_points (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  
  -- Restore point metadata
  name text not null,
  description text,
  point_type text check (point_type in ('automatic', 'manual', 'pre_sync', 'post_sync', 'scheduled')) not null,
  
  -- Associated sync operation
  sync_log_id uuid references sync_logs(id) on delete set null,
  
  -- Snapshot counts
  total_snapshots integer default 0,
  products_count integer default 0,
  inventory_count integer default 0,
  orders_count integer default 0,
  
  -- Status
  status text check (status in ('active', 'expired', 'archived', 'restored')) default 'active',
  
  -- Restore information
  restored_at timestamp with time zone,
  restored_by uuid references auth.users on delete set null,
  restore_result jsonb,
  
  -- Timestamps
  created_at timestamp with time zone default now() not null,
  expires_at timestamp with time zone,
  
  -- Metadata
  metadata jsonb default '{}',
  tags text[]
);

-- ========================================
-- ROLLBACK OPERATIONS TABLE
-- Tracks rollback executions
-- ========================================
create table rollback_operations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  
  -- Rollback details
  restore_point_id uuid references restore_points(id) on delete set null,
  target_timestamp timestamp with time zone not null,
  
  -- Scope
  entity_type text check (entity_type in ('product', 'inventory', 'order', 'all')) not null,
  entity_ids uuid[], -- Specific entities to rollback (null = all)
  platforms text[] check (platforms <@ array['netsuite', 'shopify']),
  
  -- Execution details
  status text check (status in ('pending', 'running', 'completed', 'failed', 'cancelled')) default 'pending',
  dry_run boolean default false,
  
  -- Results
  items_to_restore integer default 0,
  items_restored integer default 0,
  items_failed integer default 0,
  
  -- Errors and warnings
  errors jsonb default '[]',
  warnings jsonb default '[]',
  
  -- Validation
  validation_passed boolean,
  validation_errors jsonb default '[]',
  
  -- Timestamps
  started_at timestamp with time zone default now() not null,
  completed_at timestamp with time zone,
  
  -- Metadata
  metadata jsonb default '{}'
);

-- ========================================
-- SNAPSHOT RETENTION POLICIES TABLE
-- Configurable retention rules
-- ========================================
create table snapshot_retention_policies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  
  -- Policy details
  policy_name text not null,
  description text,
  is_active boolean default true,
  
  -- Retention rules
  retention_days integer not null default 14,
  min_snapshots_to_keep integer default 10, -- Always keep minimum snapshots
  snapshot_types text[], -- Which types to apply to
  
  -- Archive settings
  archive_before_delete boolean default false,
  archive_location text,
  
  -- Compression
  compress_old_snapshots boolean default true,
  compression_after_days integer default 7,
  
  -- Priority
  priority integer default 0, -- Higher priority policies evaluated first
  
  -- Timestamps
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  last_executed_at timestamp with time zone,
  
  -- Statistics
  total_snapshots_deleted integer default 0,
  total_space_freed_mb numeric(10,2) default 0
);

-- ========================================
-- INCREMENTAL CHANGE TRACKING
-- For efficient delta detection
-- ========================================
create table incremental_changes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  
  -- Entity tracking
  entity_type text not null,
  entity_id uuid not null,
  platform text not null,
  
  -- Change detection
  last_checked_at timestamp with time zone not null,
  last_modified_at timestamp with time zone not null,
  change_detected boolean default false,
  
  -- Hash for quick comparison
  current_hash text not null,
  previous_hash text,
  
  -- Change summary
  changed_fields text[],
  change_magnitude text check (change_magnitude in ('minor', 'moderate', 'major')),
  
  -- Timestamps
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  
  -- Unique constraint
  unique(user_id, entity_type, entity_id, platform)
);

-- ========================================
-- INDEXES FOR PERFORMANCE
-- ========================================

-- Product snapshots indexes
create index idx_product_snapshots_user on product_snapshots(user_id);
create index idx_product_snapshots_product on product_snapshots(product_id);
create index idx_product_snapshots_platform on product_snapshots(platform);
create index idx_product_snapshots_type on product_snapshots(snapshot_type);
create index idx_product_snapshots_created on product_snapshots(created_at desc);
create index idx_product_snapshots_expires on product_snapshots(expires_at) where expires_at is not null;
create index idx_product_snapshots_restore_point on product_snapshots(restore_point_id) where restore_point_id is not null;
create index idx_product_snapshots_sync on product_snapshots(sync_log_id) where sync_log_id is not null;

-- Change log indexes
create index idx_change_log_user on change_log(user_id);
create index idx_change_log_entity on change_log(entity_type, entity_id);
create index idx_change_log_platform on change_log(platform);
create index idx_change_log_changed_at on change_log(changed_at desc);
create index idx_change_log_operation on change_log(operation);
create index idx_change_log_sync on change_log(sync_log_id) where sync_log_id is not null;
create index idx_change_log_field on change_log(entity_type, field_name);

-- Restore points indexes
create index idx_restore_points_user on restore_points(user_id);
create index idx_restore_points_created on restore_points(created_at desc);
create index idx_restore_points_status on restore_points(status);
create index idx_restore_points_type on restore_points(point_type);
create index idx_restore_points_expires on restore_points(expires_at) where expires_at is not null;

-- Rollback operations indexes
create index idx_rollback_operations_user on rollback_operations(user_id);
create index idx_rollback_operations_status on rollback_operations(status);
create index idx_rollback_operations_restore_point on rollback_operations(restore_point_id);
create index idx_rollback_operations_started on rollback_operations(started_at desc);

-- Incremental changes indexes
create index idx_incremental_changes_user_entity on incremental_changes(user_id, entity_type, entity_id);
create index idx_incremental_changes_platform on incremental_changes(platform);
create index idx_incremental_changes_detected on incremental_changes(change_detected) where change_detected = true;
create index idx_incremental_changes_last_checked on incremental_changes(last_checked_at);

-- ========================================
-- ROW LEVEL SECURITY
-- ========================================

alter table product_snapshots enable row level security;
alter table change_log enable row level security;
alter table restore_points enable row level security;
alter table rollback_operations enable row level security;
alter table snapshot_retention_policies enable row level security;
alter table incremental_changes enable row level security;

-- Product snapshots policies
create policy "Users can view their own snapshots" on product_snapshots
  for select using (auth.uid() = user_id);

create policy "Users can create their own snapshots" on product_snapshots
  for insert with check (auth.uid() = user_id);

create policy "Users can delete their own snapshots" on product_snapshots
  for delete using (auth.uid() = user_id);

-- Change log policies
create policy "Users can view their own change logs" on change_log
  for select using (auth.uid() = user_id);

create policy "Users can create change logs" on change_log
  for insert with check (auth.uid() = user_id);

-- Restore points policies
create policy "Users can view their own restore points" on restore_points
  for select using (auth.uid() = user_id);

create policy "Users can manage their own restore points" on restore_points
  for all using (auth.uid() = user_id);

-- Rollback operations policies
create policy "Users can view their own rollback operations" on rollback_operations
  for select using (auth.uid() = user_id);

create policy "Users can manage their own rollback operations" on rollback_operations
  for all using (auth.uid() = user_id);

-- Retention policies
create policy "Users can view retention policies" on snapshot_retention_policies
  for select using (auth.uid() = user_id or user_id is null);

create policy "Users can manage their own retention policies" on snapshot_retention_policies
  for all using (auth.uid() = user_id);

-- Incremental changes policies
create policy "Users can view their own incremental changes" on incremental_changes
  for select using (auth.uid() = user_id);

create policy "Users can manage their own incremental changes" on incremental_changes
  for all using (auth.uid() = user_id);

-- ========================================
-- TRIGGERS
-- ========================================

-- Trigger to update updated_at timestamp
create trigger update_snapshot_retention_policies_updated_at
  before update on snapshot_retention_policies
  for each row execute function update_updated_at_column();

create trigger update_incremental_changes_updated_at
  before update on incremental_changes
  for each row execute function update_updated_at_column();

-- Auto-set expiration dates on snapshots
create or replace function set_snapshot_expiration()
returns trigger as $$
begin
  if new.expires_at is null then
    -- Get retention policy or default to 14 days
    new.expires_at := new.created_at + interval '14 days';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger set_product_snapshot_expiration
  before insert on product_snapshots
  for each row execute function set_snapshot_expiration();

-- ========================================
-- HELPER FUNCTIONS
-- ========================================

-- Function to create a restore point with all current snapshots
create or replace function create_restore_point(
  p_user_id uuid,
  p_name text,
  p_description text default null,
  p_point_type text default 'manual'
)
returns uuid as $$
declare
  v_restore_point_id uuid;
  v_product_count integer;
begin
  -- Create restore point
  insert into restore_points (user_id, name, description, point_type)
  values (p_user_id, p_name, p_description, p_point_type)
  returning id into v_restore_point_id;
  
  -- Count products
  select count(*) into v_product_count
  from products
  where user_id = p_user_id;
  
  -- Update restore point with counts
  update restore_points
  set 
    products_count = v_product_count,
    total_snapshots = v_product_count
  where id = v_restore_point_id;
  
  return v_restore_point_id;
end;
$$ language plpgsql;

-- Function to get changes between two timestamps
create or replace function get_changes_between(
  p_user_id uuid,
  p_start_time timestamp with time zone,
  p_end_time timestamp with time zone,
  p_entity_type text default null
)
returns table (
  entity_type text,
  entity_id uuid,
  platform text,
  operation text,
  field_name text,
  old_value jsonb,
  new_value jsonb,
  changed_at timestamp with time zone
) as $$
begin
  return query
  select 
    cl.entity_type,
    cl.entity_id,
    cl.platform,
    cl.operation,
    cl.field_name,
    cl.old_value,
    cl.new_value,
    cl.changed_at
  from change_log cl
  where 
    cl.user_id = p_user_id
    and cl.changed_at between p_start_time and p_end_time
    and (p_entity_type is null or cl.entity_type = p_entity_type)
  order by cl.changed_at desc;
end;
$$ language plpgsql;

-- Function to calculate data checksum
create or replace function calculate_checksum(data jsonb)
returns text as $$
begin
  return md5(data::text);
end;
$$ language plpgsql immutable;

-- ========================================
-- DEFAULT RETENTION POLICY
-- ========================================

insert into snapshot_retention_policies (
  user_id,
  policy_name,
  description,
  retention_days,
  min_snapshots_to_keep,
  is_active
) values (
  null, -- Global policy
  'Default 14-day Retention',
  'Default retention policy keeping snapshots for 14 days with minimum 10 snapshots',
  14,
  10,
  true
);

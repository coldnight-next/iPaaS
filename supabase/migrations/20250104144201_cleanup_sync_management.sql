-- Clean up existing objects to allow recreation
-- This is safe because we're just rebuilding the structure

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own search patterns" ON public.saved_search_patterns;
DROP POLICY IF EXISTS "Users can create their own search patterns" ON public.saved_search_patterns;
DROP POLICY IF EXISTS "Users can update their own search patterns" ON public.saved_search_patterns;
DROP POLICY IF EXISTS "Users can delete their own search patterns" ON public.saved_search_patterns;

DROP POLICY IF EXISTS "Users can view their own sync list" ON public.sync_list;
DROP POLICY IF EXISTS "Users can create their own sync list items" ON public.sync_list;
DROP POLICY IF EXISTS "Users can update their own sync list items" ON public.sync_list;
DROP POLICY IF EXISTS "Users can delete their own sync list items" ON public.sync_list;

DROP POLICY IF EXISTS "Users can view their own sync history" ON public.sync_history;
DROP POLICY IF EXISTS "Users can create their own sync history" ON public.sync_history;

-- Drop triggers
DROP TRIGGER IF EXISTS update_saved_search_patterns_updated_at ON public.saved_search_patterns;
DROP TRIGGER IF EXISTS update_sync_list_updated_at ON public.sync_list;

-- Drop indexes (they will be recreated)
DROP INDEX IF EXISTS idx_saved_search_patterns_user_id;
DROP INDEX IF EXISTS idx_sync_list_user_id;
DROP INDEX IF EXISTS idx_sync_list_sku;
DROP INDEX IF EXISTS idx_sync_list_active;
DROP INDEX IF EXISTS idx_sync_history_user_id;
DROP INDEX IF EXISTS idx_sync_history_sync_list_id;
DROP INDEX IF EXISTS idx_sync_history_started_at;

-- Note: We keep the tables themselves as they may already have data
-- Tables will be created by the next migration if they don't exist

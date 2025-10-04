-- Create table for saved search patterns
CREATE TABLE IF NOT EXISTS public.saved_search_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    filters JSONB NOT NULL DEFAULT '{}',
    sync_direction TEXT NOT NULL CHECK (sync_direction IN ('netsuite-to-shopify', 'shopify-to-netsuite', 'bidirectional')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, name)
);

-- Create table for sync list (persistent items to keep in sync)
CREATE TABLE IF NOT EXISTS public.sync_list (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    netsuite_item_id TEXT,
    shopify_product_id TEXT,
    sku TEXT NOT NULL,
    product_name TEXT NOT NULL,
    sync_direction TEXT NOT NULL CHECK (sync_direction IN ('netsuite-to-shopify', 'shopify-to-netsuite', 'bidirectional')),
    sync_mode TEXT NOT NULL DEFAULT 'delta' CHECK (sync_mode IN ('delta', 'full')),
    last_synced_at TIMESTAMPTZ,
    last_sync_status TEXT CHECK (last_sync_status IN ('success', 'failed', 'pending')),
    last_sync_error TEXT,
    sync_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, sku)
);

-- Create table for sync history
CREATE TABLE IF NOT EXISTS public.sync_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    sync_list_id UUID REFERENCES public.sync_list(id) ON DELETE CASCADE,
    search_pattern_id UUID REFERENCES public.saved_search_patterns(id) ON DELETE SET NULL,
    sync_type TEXT NOT NULL CHECK (sync_type IN ('manual', 'scheduled', 'delta', 'full')),
    sync_direction TEXT NOT NULL,
    items_synced INTEGER DEFAULT 0,
    items_created INTEGER DEFAULT 0,
    items_updated INTEGER DEFAULT 0,
    items_failed INTEGER DEFAULT 0,
    status TEXT NOT NULL CHECK (status IN ('success', 'partial', 'failed')),
    error_log JSONB DEFAULT '[]',
    started_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ,
    duration_seconds INTEGER,
    metadata JSONB DEFAULT '{}'
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_saved_search_patterns_user_id ON public.saved_search_patterns(user_id);
CREATE INDEX IF NOT EXISTS idx_sync_list_user_id ON public.sync_list(user_id);
CREATE INDEX IF NOT EXISTS idx_sync_list_sku ON public.sync_list(sku);
CREATE INDEX IF NOT EXISTS idx_sync_list_active ON public.sync_list(is_active);
CREATE INDEX IF NOT EXISTS idx_sync_history_user_id ON public.sync_history(user_id);
CREATE INDEX IF NOT EXISTS idx_sync_history_sync_list_id ON public.sync_history(sync_list_id);
CREATE INDEX IF NOT EXISTS idx_sync_history_started_at ON public.sync_history(started_at DESC);

-- Enable RLS
ALTER TABLE public.saved_search_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_history ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for saved_search_patterns
CREATE POLICY "Users can view their own search patterns"
    ON public.saved_search_patterns FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own search patterns"
    ON public.saved_search_patterns FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own search patterns"
    ON public.saved_search_patterns FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own search patterns"
    ON public.saved_search_patterns FOR DELETE
    USING (auth.uid() = user_id);

-- Create RLS policies for sync_list
CREATE POLICY "Users can view their own sync list"
    ON public.sync_list FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own sync list items"
    ON public.sync_list FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own sync list items"
    ON public.sync_list FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own sync list items"
    ON public.sync_list FOR DELETE
    USING (auth.uid() = user_id);

-- Create RLS policies for sync_history
CREATE POLICY "Users can view their own sync history"
    ON public.sync_history FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own sync history"
    ON public.sync_history FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers
CREATE TRIGGER update_saved_search_patterns_updated_at BEFORE UPDATE ON public.saved_search_patterns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sync_list_updated_at BEFORE UPDATE ON public.sync_list
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

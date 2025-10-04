-- Add NetSuite saved search support to saved_search_patterns table
ALTER TABLE public.saved_search_patterns 
ADD COLUMN IF NOT EXISTS netsuite_saved_search_id TEXT,
ADD COLUMN IF NOT EXISTS shopify_collection_id TEXT,
ADD COLUMN IF NOT EXISTS auto_populate BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS last_populated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS population_frequency TEXT CHECK (population_frequency IN ('manual', 'hourly', 'daily', 'weekly'));

-- Create index for saved searches
CREATE INDEX IF NOT EXISTS idx_saved_search_patterns_netsuite_search 
  ON public.saved_search_patterns(netsuite_saved_search_id) 
  WHERE netsuite_saved_search_id IS NOT NULL;

-- Add comment to explain the feature
COMMENT ON COLUMN public.saved_search_patterns.netsuite_saved_search_id IS 'NetSuite saved search ID to automatically fetch and populate sync list items';
COMMENT ON COLUMN public.saved_search_patterns.auto_populate IS 'Whether to automatically populate sync_list from this saved search';
COMMENT ON COLUMN public.saved_search_patterns.population_frequency IS 'How often to refresh the sync list from the saved search';

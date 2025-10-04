-- Drop existing policies if they exist to recreate them
DROP POLICY IF EXISTS "Users can view their own search patterns" ON public.saved_search_patterns;
DROP POLICY IF EXISTS "Users can create their own search patterns" ON public.saved_search_patterns;
DROP POLICY IF EXISTS "Users can update their own search patterns" ON public.saved_search_patterns;
DROP POLICY IF EXISTS "Users can delete their own search patterns" ON public.saved_search_patterns;

-- Recreate RLS policies for saved_search_patterns
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

-- Verify RLS is enabled
ALTER TABLE public.saved_search_patterns ENABLE ROW LEVEL SECURITY;

-- Fix OAuth callback RLS issue
-- Add service role policy to allow OAuth callbacks to access connections table

create policy "Service role can access connections for OAuth" on connections
  for all using (auth.role() = 'service_role');
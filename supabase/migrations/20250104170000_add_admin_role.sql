-- Add admin role to georgioum@gmail.com user
-- This updates the user_metadata in the auth.users table

UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data || '{"role": "admin"}'::jsonb
WHERE email = 'georgioum@gmail.com';

-- Verify the update
SELECT id, email, raw_user_meta_data->>'role' as role
FROM auth.users
WHERE email = 'georgioum@gmail.com';

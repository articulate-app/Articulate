-- Check if there are any issues with the column names in the trigger function
-- This script will:
-- 1. Check the column names in the auth.users table
-- 2. Check the column names in the public.users table
-- 3. Check if the trigger function is using the correct column names

-- 1. Check the column names in the auth.users table
SELECT 
  column_name, 
  data_type, 
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'auth' 
AND table_name = 'users'
ORDER BY ordinal_position;

-- 2. Check the column names in the public.users table
SELECT 
  column_name, 
  data_type, 
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
AND table_name = 'users'
ORDER BY ordinal_position;

-- 3. Check if the trigger function is using the correct column names
SELECT 
  prosrc AS function_definition
FROM pg_proc
WHERE proname = 'link_auth_user_to_public'
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

-- 4. Check if there are any foreign key constraints between auth.users and public.users
SELECT
  tc.constraint_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
AND tc.table_schema = 'public'
AND tc.table_name = 'users'
AND ccu.table_schema = 'auth'
AND ccu.table_name = 'users';

-- 5. Check if there are any issues with the data types
SELECT
  a.column_name AS auth_column,
  a.data_type AS auth_data_type,
  p.column_name AS public_column,
  p.data_type AS public_data_type
FROM information_schema.columns a
JOIN information_schema.columns p
  ON a.column_name = p.column_name
WHERE a.table_schema = 'auth'
AND a.table_name = 'users'
AND p.table_schema = 'public'
AND p.table_name = 'users'
AND a.data_type != p.data_type; 
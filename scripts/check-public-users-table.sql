-- Check the structure of the public.users table and compare it with auth.users
-- This script will:
-- 1. Check the structure of the public.users table
-- 2. Check the structure of the auth.users table
-- 3. Compare the relevant columns

-- 1. Check the structure of the public.users table
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
AND table_name = 'users'
ORDER BY ordinal_position;

-- 2. Check the structure of the auth.users table
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'auth' 
AND table_name = 'users'
ORDER BY ordinal_position;

-- 3. Check if there are any constraints on the public.users table
SELECT
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
LEFT JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.table_schema = 'public'
AND tc.table_name = 'users';

-- 4. Check if there are any indexes on the public.users table
SELECT
  i.relname AS index_name,
  a.attname AS column_name
FROM pg_class t,
  pg_class i,
  pg_index ix,
  pg_attribute a
WHERE t.oid = ix.indrelid
  AND i.oid = ix.indexrelid
  AND a.attrelid = t.oid
  AND a.attnum = ANY(ix.indkey)
  AND t.relkind = 'r'
  AND t.relname = 'users'
  AND t.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

-- 5. Check if there are any triggers on the public.users table
SELECT
  trigger_name,
  event_manipulation,
  action_statement,
  action_timing
FROM information_schema.triggers
WHERE event_object_schema = 'public'
AND event_object_table = 'users'; 
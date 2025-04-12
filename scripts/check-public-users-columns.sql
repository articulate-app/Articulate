-- Check the column names in the public.users table
-- This script will:
-- 1. Check the column names in the public.users table
-- 2. Check if the auth_user_id column exists
-- 3. Check if there are any issues with the column names

-- 1. Check the column names in the public.users table
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
AND table_name = 'users'
ORDER BY ordinal_position;

-- 2. Check if the auth_user_id column exists
SELECT EXISTS (
  SELECT 1
  FROM information_schema.columns
  WHERE table_schema = 'public'
  AND table_name = 'users'
  AND column_name = 'auth_user_id'
) AS auth_user_id_exists;

-- 3. Check if there are any issues with the column names
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'users'
AND column_name IN ('auth_user_id', 'email', 'created_at', 'updated_at');

-- 4. Check if there are any constraints on the auth_user_id column
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
AND tc.table_name = 'users'
AND kcu.column_name = 'auth_user_id';

-- 5. Check if there are any indexes on the auth_user_id column
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
  AND t.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  AND a.attname = 'auth_user_id'; 
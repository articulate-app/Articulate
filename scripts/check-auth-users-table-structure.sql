-- Check the structure of the auth.users table
-- This script will:
-- 1. Check the columns in the auth.users table
-- 2. Check the data types of the columns
-- 3. Check the constraints on the columns
-- 4. Check if the id column exists and is properly configured

-- 1. Check the columns in the auth.users table
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'auth'
AND table_name = 'users'
ORDER BY ordinal_position;

-- 2. Check the data types of the columns
SELECT
  column_name,
  data_type,
  character_maximum_length,
  numeric_precision,
  numeric_scale
FROM information_schema.columns
WHERE table_schema = 'auth'
AND table_name = 'users'
ORDER BY ordinal_position;

-- 3. Check the constraints on the columns
SELECT
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
LEFT JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.table_schema = 'auth'
AND tc.table_name = 'users';

-- 4. Check if the id column exists and is properly configured
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'auth'
AND table_name = 'users'
AND column_name = 'id';

-- 5. Check if there are any indexes on the id column
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
  AND a.attname = 'id';

-- 6. Check if there are any primary key constraints on the id column
SELECT
  tc.constraint_name,
  kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
WHERE tc.constraint_type = 'PRIMARY KEY'
  AND tc.table_schema = 'auth'
  AND tc.table_name = 'users'
  AND kcu.column_name = 'id'; 
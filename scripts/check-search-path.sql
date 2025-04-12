-- Check the search path of the trigger function and the current search path
-- This script will:
-- 1. Check the search path of the trigger function
-- 2. Check the current search path
-- 3. Check if there are any issues with the search path

-- 1. Check the search path of the trigger function
SELECT
  proname AS function_name,
  proconfig AS search_path
FROM pg_proc
WHERE proname = 'link_auth_user_to_public'
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

-- 2. Check the current search path
SHOW search_path;

-- 3. Check if there are any issues with the search path
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  pg_get_userbyid(c.relowner) AS owner
FROM pg_class c
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE c.relname = 'users'
AND n.nspname IN ('public', 'auth');

-- 4. Check if the trigger function is using the correct search path
SELECT
  prosrc AS function_definition
FROM pg_proc
WHERE proname = 'link_auth_user_to_public'
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

-- 5. Check if the trigger function is using the correct schema for the public.users table
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  pg_get_userbyid(c.relowner) AS owner
FROM pg_class c
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE c.relname = 'users'
AND n.nspname = 'public';

-- 6. Check if the trigger function is using the correct schema for the auth.users table
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  pg_get_userbyid(c.relowner) AS owner
FROM pg_class c
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE c.relname = 'users'
AND n.nspname = 'auth'; 
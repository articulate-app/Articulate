-- Check if there are any issues with the trigger function's execution in a transaction
-- This script will:
-- 1. Check if the trigger function is using transaction control
-- 2. Check if the trigger function is using savepoints
-- 3. Check if the trigger function is using exception handling
-- 4. Check if the trigger function is using RAISE NOTICE

-- 1. Check if the trigger function is using transaction control
SELECT
  p.proname AS function_name,
  n.nspname AS schema_name,
  p.prosrc AS function_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'link_auth_user_to_public'
AND n.nspname = 'public'
AND (p.prosrc LIKE '%BEGIN%' OR p.prosrc LIKE '%COMMIT%' OR p.prosrc LIKE '%ROLLBACK%');

-- 2. Check if the trigger function is using savepoints
SELECT
  p.proname AS function_name,
  n.nspname AS schema_name,
  p.prosrc AS function_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'link_auth_user_to_public'
AND n.nspname = 'public'
AND p.prosrc LIKE '%SAVEPOINT%';

-- 3. Check if the trigger function is using exception handling
SELECT
  p.proname AS function_name,
  n.nspname AS schema_name,
  p.prosrc AS function_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'link_auth_user_to_public'
AND n.nspname = 'public'
AND p.prosrc LIKE '%EXCEPTION%';

-- 4. Check if the trigger function is using RAISE NOTICE
SELECT
  p.proname AS function_name,
  n.nspname AS schema_name,
  p.prosrc AS function_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'link_auth_user_to_public'
AND n.nspname = 'public'
AND p.prosrc LIKE '%RAISE NOTICE%';

-- 5. Check if the trigger function is using WHEN OTHERS
SELECT
  p.proname AS function_name,
  n.nspname AS schema_name,
  p.prosrc AS function_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'link_auth_user_to_public'
AND n.nspname = 'public'
AND p.prosrc LIKE '%WHEN OTHERS%';

-- 6. Check if the trigger function is using SQLERRM
SELECT
  p.proname AS function_name,
  n.nspname AS schema_name,
  p.prosrc AS function_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'link_auth_user_to_public'
AND n.nspname = 'public'
AND p.prosrc LIKE '%SQLERRM%';

-- 7. Check if the trigger function is using GET STACKED DIAGNOSTICS
SELECT
  p.proname AS function_name,
  n.nspname AS schema_name,
  p.prosrc AS function_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'link_auth_user_to_public'
AND n.nspname = 'public'
AND p.prosrc LIKE '%GET STACKED DIAGNOSTICS%';

-- 8. Check if the trigger function is using RAISE EXCEPTION
SELECT
  p.proname AS function_name,
  n.nspname AS schema_name,
  p.prosrc AS function_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'link_auth_user_to_public'
AND n.nspname = 'public'
AND p.prosrc LIKE '%RAISE EXCEPTION%'; 
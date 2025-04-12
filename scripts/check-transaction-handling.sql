-- Check if there are any issues with the trigger function's transaction handling
-- This script will:
-- 1. Check if the trigger function is using transaction handling
-- 2. Check if the trigger function is using exception handling
-- 3. Check if the trigger function is using RAISE NOTICE

-- 1. Check if the trigger function is using transaction handling
SELECT
  prosrc AS function_definition
FROM pg_proc
WHERE proname = 'link_auth_user_to_public'
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

-- 2. Check if the trigger function is using exception handling
SELECT
  prosrc AS function_definition
FROM pg_proc
WHERE proname = 'link_auth_user_to_public'
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
AND prosrc LIKE '%EXCEPTION%';

-- 3. Check if the trigger function is using RAISE NOTICE
SELECT
  prosrc AS function_definition
FROM pg_proc
WHERE proname = 'link_auth_user_to_public'
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
AND prosrc LIKE '%RAISE NOTICE%';

-- 4. Check if the trigger function is using BEGIN/END blocks
SELECT
  prosrc AS function_definition
FROM pg_proc
WHERE proname = 'link_auth_user_to_public'
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
AND prosrc LIKE '%BEGIN%END%';

-- 5. Check if the trigger function is using COMMIT or ROLLBACK
SELECT
  prosrc AS function_definition
FROM pg_proc
WHERE proname = 'link_auth_user_to_public'
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
AND (prosrc LIKE '%COMMIT%' OR prosrc LIKE '%ROLLBACK%');

-- 6. Check if the trigger function is using SAVEPOINT
SELECT
  prosrc AS function_definition
FROM pg_proc
WHERE proname = 'link_auth_user_to_public'
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
AND prosrc LIKE '%SAVEPOINT%'; 
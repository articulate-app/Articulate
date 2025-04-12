-- Check if there are any issues with the trigger function's error handling
-- This script will:
-- 1. Check if the trigger function is using error handling
-- 2. Check if the trigger function is using RAISE NOTICE for errors
-- 3. Check if the trigger function is using SQLERRM

-- 1. Check if the trigger function is using error handling
SELECT
  prosrc AS function_definition
FROM pg_proc
WHERE proname = 'link_auth_user_to_public'
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
AND prosrc LIKE '%EXCEPTION%';

-- 2. Check if the trigger function is using RAISE NOTICE for errors
SELECT
  prosrc AS function_definition
FROM pg_proc
WHERE proname = 'link_auth_user_to_public'
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
AND prosrc LIKE '%RAISE NOTICE%Error%';

-- 3. Check if the trigger function is using SQLERRM
SELECT
  prosrc AS function_definition
FROM pg_proc
WHERE proname = 'link_auth_user_to_public'
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
AND prosrc LIKE '%SQLERRM%';

-- 4. Check if the trigger function is using WHEN OTHERS
SELECT
  prosrc AS function_definition
FROM pg_proc
WHERE proname = 'link_auth_user_to_public'
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
AND prosrc LIKE '%WHEN OTHERS%';

-- 5. Check if the trigger function is using GET STACKED DIAGNOSTICS
SELECT
  prosrc AS function_definition
FROM pg_proc
WHERE proname = 'link_auth_user_to_public'
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
AND prosrc LIKE '%GET STACKED DIAGNOSTICS%';

-- 6. Check if the trigger function is using RAISE EXCEPTION
SELECT
  prosrc AS function_definition
FROM pg_proc
WHERE proname = 'link_auth_user_to_public'
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
AND prosrc LIKE '%RAISE EXCEPTION%'; 
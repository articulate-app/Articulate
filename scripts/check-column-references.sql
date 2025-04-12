-- Check if there are any issues with the trigger function's column references
-- This script will:
-- 1. Check the column references in the trigger function
-- 2. Check if the trigger function is using the correct column names
-- 3. Check if the trigger function is using the correct data types

-- 1. Check the column references in the trigger function
SELECT
  prosrc AS function_definition
FROM pg_proc
WHERE proname = 'link_auth_user_to_public'
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

-- 2. Check if the trigger function is using the correct column names
SELECT
  prosrc AS function_definition
FROM pg_proc
WHERE proname = 'link_auth_user_to_public'
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
AND (prosrc LIKE '%auth_user_id%' OR prosrc LIKE '%email%' OR prosrc LIKE '%created_at%' OR prosrc LIKE '%updated_at%');

-- 3. Check if the trigger function is using the correct data types
SELECT
  prosrc AS function_definition
FROM pg_proc
WHERE proname = 'link_auth_user_to_public'
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
AND (prosrc LIKE '%UUID%' OR prosrc LIKE '%TEXT%' OR prosrc LIKE '%TIMESTAMP%');

-- 4. Check if the trigger function is using NEW.id
SELECT
  prosrc AS function_definition
FROM pg_proc
WHERE proname = 'link_auth_user_to_public'
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
AND prosrc LIKE '%NEW.id%';

-- 5. Check if the trigger function is using NEW.email
SELECT
  prosrc AS function_definition
FROM pg_proc
WHERE proname = 'link_auth_user_to_public'
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
AND prosrc LIKE '%NEW.email%';

-- 6. Check if the trigger function is using NEW.created_at
SELECT
  prosrc AS function_definition
FROM pg_proc
WHERE proname = 'link_auth_user_to_public'
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
AND prosrc LIKE '%NEW.created_at%';

-- 7. Check if the trigger function is using NEW.updated_at
SELECT
  prosrc AS function_definition
FROM pg_proc
WHERE proname = 'link_auth_user_to_public'
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
AND prosrc LIKE '%NEW.updated_at%'; 
-- Check if there are any issues with the trigger function's definition
-- This script will:
-- 1. Check the definition of the trigger function
-- 2. Check if the trigger function is using the correct schema
-- 3. Check if the trigger function is using the correct table names
-- 4. Check if the trigger function is using the correct column names

-- 1. Check the definition of the trigger function
SELECT
  p.proname AS function_name,
  n.nspname AS schema_name,
  p.prosrc AS function_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'link_auth_user_to_public'
AND n.nspname = 'public';

-- 2. Check if the trigger function is using the correct schema
SELECT
  p.proname AS function_name,
  n.nspname AS schema_name,
  p.prosrc AS function_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'link_auth_user_to_public'
AND n.nspname = 'public'
AND p.prosrc LIKE '%auth.users%';

-- 3. Check if the trigger function is using the correct table names
SELECT
  p.proname AS function_name,
  n.nspname AS schema_name,
  p.prosrc AS function_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'link_auth_user_to_public'
AND n.nspname = 'public'
AND p.prosrc LIKE '%public.users%';

-- 4. Check if the trigger function is using the correct column names
SELECT
  p.proname AS function_name,
  n.nspname AS schema_name,
  p.prosrc AS function_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'link_auth_user_to_public'
AND n.nspname = 'public'
AND p.prosrc LIKE '%auth_user_id%';

-- 5. Check if the trigger function is using NEW.id
SELECT
  p.proname AS function_name,
  n.nspname AS schema_name,
  p.prosrc AS function_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'link_auth_user_to_public'
AND n.nspname = 'public'
AND p.prosrc LIKE '%NEW.id%';

-- 6. Check if the trigger function is using NEW.email
SELECT
  p.proname AS function_name,
  n.nspname AS schema_name,
  p.prosrc AS function_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'link_auth_user_to_public'
AND n.nspname = 'public'
AND p.prosrc LIKE '%NEW.email%';

-- 7. Check if the trigger function is using SECURITY DEFINER
SELECT
  p.proname AS function_name,
  n.nspname AS schema_name,
  p.prosecdef AS is_security_definer,
  p.prosrc AS function_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'link_auth_user_to_public'
AND n.nspname = 'public';

-- 8. Check if the trigger function is using SET search_path
SELECT
  p.proname AS function_name,
  n.nspname AS schema_name,
  p.prosrc AS function_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'link_auth_user_to_public'
AND n.nspname = 'public'
AND p.prosrc LIKE '%SET search_path%'; 
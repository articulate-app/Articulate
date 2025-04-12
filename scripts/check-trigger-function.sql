-- Check the trigger function and its permissions
-- This script will:
-- 1. Check the function definition
-- 2. Check the function permissions
-- 3. Check the function owner
-- 4. Check if the function is properly set up as a trigger

-- 1. Check the function definition
SELECT 
  proname AS function_name,
  prosrc AS function_definition,
  proargnames AS argument_names,
  proargtypes AS argument_types,
  proargmodes AS argument_modes,
  prorettype AS return_type,
  prosecdef AS security_definer,
  proconfig AS configuration
FROM pg_proc
WHERE proname = 'link_auth_user_to_public'
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

-- 2. Check the function permissions
SELECT
  grantee,
  privilege_type
FROM information_schema.role_table_grants
WHERE table_name = 'link_auth_user_to_public'
AND table_schema = 'public';

-- 3. Check the function owner
SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_userbyid(p.proowner) AS owner
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'link_auth_user_to_public'
AND n.nspname = 'public';

-- 4. Check if the function is properly set up as a trigger
SELECT
  t.tgname AS trigger_name,
  n.nspname AS table_schema,
  c.relname AS table_name,
  pg_get_triggerdef(t.oid) AS trigger_definition
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE t.tgname = 'after_signup_trigger'
AND n.nspname = 'auth'
AND c.relname = 'users';

-- 5. Check if there are any errors in the function
DO $$
DECLARE
  test_email TEXT;
  test_id UUID;
BEGIN
  -- Generate a unique email
  test_email := 'test.user.' || extract(epoch from now()) || '@example.com';
  test_id := gen_random_uuid();
  
  -- Log the test
  RAISE NOTICE 'Testing trigger function with email: %', test_email;
  
  -- Try to execute the function directly
  BEGIN
    PERFORM public.link_auth_user_to_public();
    RAISE NOTICE 'Function executed successfully';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Function execution failed: %', SQLERRM;
  END;
END $$; 
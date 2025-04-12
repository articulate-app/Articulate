-- Diagnostic script to troubleshoot trigger issues
-- This script will:
-- 1. Check the structure of the public.users table
-- 2. Check if the trigger is properly set up
-- 3. Create a test user and monitor the process
-- 4. Check for any errors in the process

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

-- 2. Check if the trigger is properly set up
SELECT 
  trigger_name, 
  event_manipulation, 
  action_statement,
  action_timing
FROM information_schema.triggers
WHERE event_object_table = 'users' 
AND event_object_schema = 'auth';

-- 3. Check the function definition
SELECT 
  prosrc
FROM pg_proc
WHERE proname = 'link_auth_user_to_public';

-- 4. Create a test user and monitor the process
DO $$
DECLARE
  test_email TEXT;
  test_id UUID;
  auth_user_exists BOOLEAN;
  public_user_exists BOOLEAN;
  trigger_log_exists BOOLEAN;
BEGIN
  -- Generate a unique email
  test_email := 'test.user.' || extract(epoch from now()) || '@example.com';
  test_id := gen_random_uuid();
  
  -- Log the test
  RAISE NOTICE 'Testing trigger with email: %', test_email;
  
  -- Insert a test user into auth.users
  INSERT INTO auth.users (
    id,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    role
  ) VALUES (
    test_id,
    test_email,
    crypt('password123', gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"test":true}',
    false,
    'authenticated'
  );
  
  -- Check if user exists in auth.users
  SELECT EXISTS (
    SELECT 1 FROM auth.users WHERE id = test_id
  ) INTO auth_user_exists;
  
  RAISE NOTICE 'User in auth.users: %', 
    CASE WHEN auth_user_exists THEN 'Found' ELSE 'Not found' END;
  
  -- Check if user exists in public.users
  SELECT EXISTS (
    SELECT 1 FROM public.users WHERE auth_user_id = test_id
  ) INTO public_user_exists;
  
  RAISE NOTICE 'User in public.users: %', 
    CASE WHEN public_user_exists THEN 'Found' ELSE 'Not found' END;
  
  -- If the user exists in auth.users but not in public.users, try to insert manually
  IF auth_user_exists AND NOT public_user_exists THEN
    RAISE NOTICE 'Attempting to insert user manually into public.users';
    
    BEGIN
      INSERT INTO public.users (
        auth_user_id,
        email,
        created_at,
        updated_at,
        synced_at,
        is_deleted,
        active
      ) VALUES (
        test_id,
        test_email,
        NOW(),
        NOW(),
        NOW(),
        FALSE,
        TRUE
      );
      
      RAISE NOTICE 'Manual insert successful';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Manual insert failed: %', SQLERRM;
    END;
  END IF;
  
  -- Check if the user now exists in public.users
  SELECT EXISTS (
    SELECT 1 FROM public.users WHERE auth_user_id = test_id
  ) INTO public_user_exists;
  
  RAISE NOTICE 'User in public.users after manual insert: %', 
    CASE WHEN public_user_exists THEN 'Found' ELSE 'Not found' END;
  
  -- Clean up - delete the test user
  DELETE FROM auth.users WHERE id = test_id;
  DELETE FROM public.users WHERE auth_user_id = test_id;
  
  RAISE NOTICE 'Test completed and cleaned up';
END $$; 
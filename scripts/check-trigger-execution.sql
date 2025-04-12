-- Check if there are any issues with the trigger function's execution
-- This script will:
-- 1. Check if the trigger is properly set up
-- 2. Check if the trigger is firing
-- 3. Check if the trigger function is being called
-- 4. Check if the trigger function is completing successfully

-- 1. Check if the trigger is properly set up
SELECT
  trigger_name,
  event_manipulation,
  event_object_schema,
  event_object_table,
  action_statement,
  action_timing
FROM information_schema.triggers
WHERE trigger_name = 'after_signup_trigger'
AND event_object_schema = 'auth'
AND event_object_table = 'users';

-- 2. Check if the trigger is firing
-- This requires creating a test user and checking if the trigger fires
DO $$
DECLARE
  test_email TEXT := 'test_' || floor(random() * 1000000)::TEXT || '@example.com';
  test_id UUID := gen_random_uuid();
  user_exists BOOLEAN;
BEGIN
  -- Create a test user in auth.users
  INSERT INTO auth.users (
    id,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    role
  ) VALUES (
    test_id,
    test_email,
    crypt('password123', gen_salt('bf')),
    now(),
    now(),
    now(),
    'authenticated'
  );
  
  -- Check if the user exists in auth.users
  SELECT EXISTS (
    SELECT 1 FROM auth.users WHERE id = test_id
  ) INTO user_exists;
  
  RAISE NOTICE 'User exists in auth.users: %', user_exists;
  
  -- Check if the user exists in public.users
  SELECT EXISTS (
    SELECT 1 FROM public.users WHERE auth_user_id = test_id
  ) INTO user_exists;
  
  RAISE NOTICE 'User exists in public.users: %', user_exists;
  
  -- Clean up
  DELETE FROM auth.users WHERE id = test_id;
  DELETE FROM public.users WHERE auth_user_id = test_id;
END $$;

-- 3. Check if the trigger function is being called
-- This requires enabling statement logging
-- Note: This may not be available in all environments
-- SET log_statement = 'all';
-- SET log_min_duration_statement = 0;

-- 4. Check if the trigger function is completing successfully
-- This requires creating a test user and checking if the trigger function completes
DO $$
DECLARE
  test_email TEXT := 'test_' || floor(random() * 1000000)::TEXT || '@example.com';
  test_id UUID := gen_random_uuid();
  user_exists BOOLEAN;
BEGIN
  -- Create a test user in auth.users
  BEGIN
    INSERT INTO auth.users (
      id,
      email,
      encrypted_password,
      email_confirmed_at,
      created_at,
      updated_at,
      role
    ) VALUES (
      test_id,
      test_email,
      crypt('password123', gen_salt('bf')),
      now(),
      now(),
      now(),
      'authenticated'
    );
    
    RAISE NOTICE 'User created in auth.users';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Error creating user in auth.users: %', SQLERRM;
  END;
  
  -- Check if the user exists in auth.users
  SELECT EXISTS (
    SELECT 1 FROM auth.users WHERE id = test_id
  ) INTO user_exists;
  
  RAISE NOTICE 'User exists in auth.users: %', user_exists;
  
  -- Check if the user exists in public.users
  SELECT EXISTS (
    SELECT 1 FROM public.users WHERE auth_user_id = test_id
  ) INTO user_exists;
  
  RAISE NOTICE 'User exists in public.users: %', user_exists;
  
  -- Clean up
  DELETE FROM auth.users WHERE id = test_id;
  DELETE FROM public.users WHERE auth_user_id = test_id;
END $$; 
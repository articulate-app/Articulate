-- Test the trigger function
-- This script will:
-- 1. Create a test user in auth.users
-- 2. Check if the user was added to public.users
-- 3. Check the trigger logs
-- 4. Clean up by deleting the test user

-- Generate a unique email for testing
DO $$
DECLARE
  test_email TEXT;
  test_id UUID;
  auth_user_exists BOOLEAN;
  public_user_exists BOOLEAN;
  log_record RECORD;
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
  
  -- Check trigger logs
  RAISE NOTICE 'Trigger logs:';
  FOR log_record IN (
    SELECT * FROM public.trigger_log 
    WHERE user_id = test_id 
    ORDER BY created_at DESC
  ) LOOP
    RAISE NOTICE '  %: %', log_record.event_type, log_record.details;
  END LOOP;
  
  -- Clean up - delete the test user
  DELETE FROM auth.users WHERE id = test_id;
  DELETE FROM public.users WHERE auth_user_id = test_id;
  
  RAISE NOTICE 'Test completed and cleaned up';
END $$; 
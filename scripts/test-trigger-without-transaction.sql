-- Test the trigger function without a transaction
-- This script will:
-- 1. Create a test user in auth.users
-- 2. Check if the user was added to public.users
-- 3. Delete the test user to clean up

-- 1. Create a test user in auth.users
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
  
  -- If the user exists in public.users, show the details
  IF user_exists THEN
    RAISE NOTICE 'User details in public.users:';
    FOR r IN SELECT * FROM public.users WHERE auth_user_id = test_id LOOP
      RAISE NOTICE '  auth_user_id: %, email: %, created_at: %', r.auth_user_id, r.email, r.created_at;
    END LOOP;
  END IF;
  
  -- Clean up
  DELETE FROM auth.users WHERE id = test_id;
  DELETE FROM public.users WHERE auth_user_id = test_id;
END $$;

-- 2. Check if the user was added to public.users
SELECT
  au.id AS auth_user_id,
  au.email AS auth_email,
  pu.auth_user_id AS public_auth_user_id,
  pu.email AS public_email,
  pu.created_at AS public_created_at
FROM auth.users au
LEFT JOIN public.users pu ON au.id = pu.auth_user_id
WHERE au.email LIKE 'test_%@example.com'
ORDER BY au.created_at DESC
LIMIT 5; 
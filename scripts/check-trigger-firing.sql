-- Check if the trigger is actually firing
-- This script will:
-- 1. Create a test user in auth.users
-- 2. Check if the trigger fired
-- 3. Check if the user was added to public.users
-- 4. Clean up the test user

DO $$
DECLARE
  test_email TEXT;
  test_id UUID;
  auth_user_exists BOOLEAN;
  public_user_exists BOOLEAN;
  trigger_fired BOOLEAN;
BEGIN
  -- Generate a unique email and UUID
  test_email := 'test.user.' || extract(epoch from now()) || '@example.com';
  test_id := gen_random_uuid();
  
  -- Log the test
  RAISE NOTICE 'Testing trigger with email: % and ID: %', test_email, test_id;
  
  -- 1. Create a test user in auth.users
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
    RAISE NOTICE 'Successfully created test user in auth.users';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Error creating test user in auth.users: %', SQLERRM;
    RETURN;
  END;
  
  -- 2. Check if the trigger fired
  -- We can't directly check if the trigger fired, but we can check if the user was added to public.users
  SELECT EXISTS (
    SELECT 1 FROM public.users WHERE auth_user_id = test_id
  ) INTO public_user_exists;
  
  IF public_user_exists THEN
    RAISE NOTICE 'User was successfully added to public.users by the trigger';
    trigger_fired := TRUE;
  ELSE
    RAISE NOTICE 'User was NOT added to public.users by the trigger';
    trigger_fired := FALSE;
  END IF;
  
  -- 3. If the trigger didn't fire, try to manually insert the user into public.users
  IF NOT trigger_fired THEN
    BEGIN
      INSERT INTO public.users (
        auth_user_id,
        email,
        created_at,
        updated_at
      ) VALUES (
        test_id,
        test_email,
        now(),
        now()
      );
      RAISE NOTICE 'Successfully manually inserted user into public.users';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Error manually inserting user into public.users: %', SQLERRM;
    END;
  END IF;
  
  -- 4. Clean up the test user
  BEGIN
    -- Delete from public.users first (if it exists)
    DELETE FROM public.users WHERE auth_user_id = test_id;
    
    -- Then delete from auth.users
    DELETE FROM auth.users WHERE id = test_id;
    
    RAISE NOTICE 'Successfully cleaned up test user';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Error cleaning up test user: %', SQLERRM;
  END;
END $$; 
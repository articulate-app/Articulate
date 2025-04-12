-- Detailed test script for the trigger function
-- This script will:
-- 1. Create a test user in auth.users
-- 2. Check if the user was added to public.users
-- 3. If not, try to manually insert the user into public.users
-- 4. Check for any errors in the process
-- 5. Clean up by deleting the test user

DO $$
DECLARE
  test_email TEXT;
  test_id UUID;
  auth_user_exists BOOLEAN;
  public_user_exists BOOLEAN;
  manual_insert_success BOOLEAN;
BEGIN
  -- Generate a unique email and UUID
  test_email := 'test.user.' || extract(epoch from now()) || '@example.com';
  test_id := gen_random_uuid();
  
  -- Log the test
  RAISE NOTICE 'Starting test with email: % and ID: %', test_email, test_id;
  
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
  
  -- 2. Check if the user was added to public.users
  SELECT EXISTS (
    SELECT 1 FROM public.users WHERE auth_user_id = test_id
  ) INTO public_user_exists;
  
  IF public_user_exists THEN
    RAISE NOTICE 'User was successfully added to public.users by the trigger';
  ELSE
    RAISE NOTICE 'User was NOT added to public.users by the trigger';
    
    -- 3. Try to manually insert the user into public.users
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
      manual_insert_success := TRUE;
      RAISE NOTICE 'Successfully manually inserted user into public.users';
    EXCEPTION WHEN OTHERS THEN
      manual_insert_success := FALSE;
      RAISE NOTICE 'Error manually inserting user into public.users: %', SQLERRM;
    END;
    
    -- If manual insert failed, check the structure of the public.users table
    IF NOT manual_insert_success THEN
      RAISE NOTICE 'Checking the structure of the public.users table:';
      FOR r IN (
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users'
        ORDER BY ordinal_position
      ) LOOP
        RAISE NOTICE 'Column: %, Type: %, Nullable: %', r.column_name, r.data_type, r.is_nullable;
      END LOOP;
    END IF;
  END IF;
  
  -- 4. Check for any errors in the process
  SELECT EXISTS (
    SELECT 1 FROM auth.users WHERE id = test_id
  ) INTO auth_user_exists;
  
  IF auth_user_exists THEN
    RAISE NOTICE 'User exists in auth.users';
  ELSE
    RAISE NOTICE 'User does NOT exist in auth.users';
  END IF;
  
  -- 5. Clean up by deleting the test user
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
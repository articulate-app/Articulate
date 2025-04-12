-- Final fix script for the trigger function
-- This script will:
-- 1. Drop the existing trigger and function
-- 2. Create a new function with SECURITY DEFINER and proper error handling
-- 3. Create the trigger
-- 4. Grant necessary permissions
-- 5. Test the trigger with a sample user

-- 1. Drop the existing trigger and function
DROP TRIGGER IF EXISTS after_signup_trigger ON auth.users;
DROP FUNCTION IF EXISTS public.link_auth_user_to_public();

-- 2. Create a new function with SECURITY DEFINER and proper error handling
CREATE OR REPLACE FUNCTION public.link_auth_user_to_public()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public, auth
LANGUAGE plpgsql
AS $$
DECLARE
  user_exists BOOLEAN;
BEGIN
  -- Log the attempt
  RAISE NOTICE 'Trigger function called for user: %', NEW.email;
  
  -- Check if the user already exists in public.users
  SELECT EXISTS (
    SELECT 1 FROM public.users WHERE auth_user_id = NEW.id
  ) INTO user_exists;
  
  -- If the user doesn't exist, insert it into public.users
  IF NOT user_exists THEN
    BEGIN
      -- Log the attempt to insert
      RAISE NOTICE 'Attempting to insert user into public.users: %', NEW.email;
      
      -- Insert the user into public.users
      INSERT INTO public.users (
        auth_user_id,
        email,
        created_at,
        updated_at
      ) VALUES (
        NEW.id,
        NEW.email,
        NEW.created_at,
        NEW.updated_at
      );
      
      -- Log success
      RAISE NOTICE 'Successfully created user in public.users: %', NEW.email;
    EXCEPTION WHEN OTHERS THEN
      -- Log error but don't fail the transaction
      RAISE NOTICE 'Error creating user in public.users: %', SQLERRM;
      RAISE NOTICE 'User ID: %, Email: %', NEW.id, NEW.email;
    END;
  ELSE
    -- Log that the user already exists
    RAISE NOTICE 'User already exists in public.users: %', NEW.email;
  END IF;
  
  RETURN NEW;
END;
$$;

-- 3. Create the trigger
CREATE TRIGGER after_signup_trigger
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.link_auth_user_to_public();

-- 4. Grant necessary permissions
GRANT USAGE ON SCHEMA public TO postgres, service_role;
GRANT ALL ON public.users TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.link_auth_user_to_public() TO postgres, service_role;

-- 5. Verify the trigger creation
SELECT
  trigger_name,
  event_manipulation,
  action_statement,
  action_timing
FROM information_schema.triggers
WHERE event_object_schema = 'auth'
AND event_object_table = 'users'
AND trigger_name = 'after_signup_trigger';

-- 6. Test the trigger with a sample user
DO $$
DECLARE
  test_email TEXT;
  test_id UUID;
  auth_user_exists BOOLEAN;
  public_user_exists BOOLEAN;
BEGIN
  -- Generate a unique email and UUID
  test_email := 'test.user.' || extract(epoch from now()) || '@example.com';
  test_id := gen_random_uuid();
  
  -- Log the test
  RAISE NOTICE 'Testing trigger with email: % and ID: %', test_email, test_id;
  
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
    RAISE NOTICE 'Successfully created test user in auth.users';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Error creating test user in auth.users: %', SQLERRM;
    RETURN;
  END;
  
  -- Check if the user was added to public.users
  SELECT EXISTS (
    SELECT 1 FROM public.users WHERE auth_user_id = test_id
  ) INTO public_user_exists;
  
  IF public_user_exists THEN
    RAISE NOTICE 'User was successfully added to public.users by the trigger';
  ELSE
    RAISE NOTICE 'User was NOT added to public.users by the trigger';
    
    -- Try to manually insert the user into public.users
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
  
  -- Clean up by deleting the test user
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
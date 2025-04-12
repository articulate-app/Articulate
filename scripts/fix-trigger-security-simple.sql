-- Fix trigger function with proper security settings
-- This script will:
-- 1. Drop the existing trigger and function
-- 2. Recreate the function with SECURITY DEFINER and proper search_path
-- 3. Create the trigger
-- 4. Grant necessary permissions

-- Drop existing trigger and function
DROP TRIGGER IF EXISTS after_signup_trigger ON auth.users;
DROP FUNCTION IF EXISTS public.link_auth_user_to_public() CASCADE;

-- Recreate the function with SECURITY DEFINER and proper search_path
CREATE OR REPLACE FUNCTION public.link_auth_user_to_public()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert new user into public.users if it doesn't exist
  INSERT INTO public.users (
    auth_user_id,
    email,
    created_at,
    updated_at,
    synced_at,
    is_deleted,
    active
  ) VALUES (
    NEW.id,
    NEW.email,
    NOW(),
    NOW(),
    NOW(),
    FALSE,
    TRUE
  )
  ON CONFLICT (auth_user_id) DO NOTHING;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Just return NEW to allow the transaction to continue
    RETURN NEW;
END;
$$;

-- Create the trigger
CREATE TRIGGER after_signup_trigger
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.link_auth_user_to_public();

-- Grant permissions
GRANT USAGE ON SCHEMA public TO postgres;
GRANT ALL ON public.users TO postgres;
GRANT EXECUTE ON FUNCTION public.link_auth_user_to_public() TO postgres;

GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON public.users TO service_role;
GRANT EXECUTE ON FUNCTION public.link_auth_user_to_public() TO service_role;

-- Make sure the function is owned by postgres
ALTER FUNCTION public.link_auth_user_to_public() OWNER TO postgres;

-- Verify the trigger was created
SELECT 
  trigger_name, 
  event_manipulation, 
  action_statement
FROM information_schema.triggers
WHERE event_object_table = 'users' 
AND event_object_schema = 'auth'; 
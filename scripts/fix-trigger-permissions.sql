-- Check ownership of the trigger function
SELECT 
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_userbyid(p.proowner) as owner
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'link_auth_user_to_public'
AND n.nspname = 'public';

-- Get the current function definition
SELECT pg_get_functiondef(oid) as function_definition
FROM pg_proc
WHERE proname = 'link_auth_user_to_public'
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

-- Drop the existing trigger and function
DROP TRIGGER IF EXISTS after_signup_trigger ON auth.users;
DROP FUNCTION IF EXISTS public.link_auth_user_to_public() CASCADE;

-- Recreate the function with SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.link_auth_user_to_public()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_email TEXT;
  v_created_at TIMESTAMPTZ;
  v_updated_at TIMESTAMPTZ;
  v_synced_at TIMESTAMPTZ;
  v_is_deleted BOOLEAN;
  v_active BOOLEAN;
BEGIN
  -- Log the attempt
  INSERT INTO public.trigger_log (user_id, event_type, details)
  VALUES (NEW.id, 'user_created', jsonb_build_object('email', NEW.email));
  
  -- Check if user already exists in public.users
  SELECT id INTO v_user_id
  FROM public.users
  WHERE auth_user_id = NEW.id;
  
  IF v_user_id IS NULL THEN
    -- Set default values
    v_created_at := NOW();
    v_updated_at := NOW();
    v_synced_at := NOW();
    v_is_deleted := FALSE;
    v_active := TRUE;
    
    -- Insert new user into public.users
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
      v_created_at,
      v_updated_at,
      v_synced_at,
      v_is_deleted,
      v_active
    );
    
    -- Log successful insert
    INSERT INTO public.trigger_log (user_id, event_type, details)
    VALUES (NEW.id, 'user_inserted', jsonb_build_object('email', NEW.email));
  END IF;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error
    INSERT INTO public.trigger_log (user_id, event_type, details)
    VALUES (NEW.id, 'user_creation_error', jsonb_build_object(
      'error', SQLERRM,
      'email', NEW.email
    ));
    
    RETURN NEW;
END;
$$;

-- Create the trigger
CREATE TRIGGER after_signup_trigger
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.link_auth_user_to_public();

-- Grant permissions
-- Grant permissions to the trigger function
GRANT USAGE ON SCHEMA public TO postgres;
GRANT ALL ON public.users TO postgres;
GRANT ALL ON public.trigger_log TO postgres;

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION public.link_auth_user_to_public() TO postgres;

-- Grant permissions to the service_role
GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON public.users TO service_role;
GRANT ALL ON public.trigger_log TO service_role;

-- Grant execute permission on the function to service_role
GRANT EXECUTE ON FUNCTION public.link_auth_user_to_public() TO service_role;

-- Make sure the function is owned by postgres
ALTER FUNCTION public.link_auth_user_to_public() OWNER TO postgres;

-- Verify the trigger was created
SELECT 
  trigger_name, 
  event_manipulation, 
  action_statement
FROM information_schema.triggers
WHERE event_object_schema = 'auth'
AND event_object_table = 'users'
ORDER BY trigger_name; 
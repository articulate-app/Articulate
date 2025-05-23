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
BEGIN
  -- Log the attempt
  INSERT INTO public.trigger_log (user_id, event_type, details)
  VALUES (NEW.id, 'user_created', jsonb_build_object('email', NEW.email));
  
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
  
  -- Log successful insert
  INSERT INTO public.trigger_log (user_id, event_type, details)
  VALUES (NEW.id, 'user_inserted', jsonb_build_object('email', NEW.email));
  
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
GRANT USAGE ON SCHEMA public TO postgres;
GRANT ALL ON public.users TO postgres;
GRANT ALL ON public.trigger_log TO postgres;
GRANT EXECUTE ON FUNCTION public.link_auth_user_to_public() TO postgres;

GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON public.users TO service_role;
GRANT ALL ON public.trigger_log TO service_role;
GRANT EXECUTE ON FUNCTION public.link_auth_user_to_public() TO service_role;

-- Make sure the function is owned by postgres
ALTER FUNCTION public.link_auth_user_to_public() OWNER TO postgres; 
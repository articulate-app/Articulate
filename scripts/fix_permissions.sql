-- Fix permissions for the trigger function
-- Grant necessary permissions to the postgres role (which runs the trigger)
GRANT USAGE ON SCHEMA public TO postgres;
GRANT ALL ON public.users TO postgres;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO postgres;

-- Grant necessary permissions to service_role (used by Supabase admin operations)
GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON public.users TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Grant necessary permissions to authenticated users
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON public.users TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Grant necessary permissions to anon users
GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT ON public.users TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;

-- Grant necessary permissions to the auth schema
GRANT USAGE ON SCHEMA auth TO postgres;
GRANT USAGE ON SCHEMA auth TO service_role;
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT USAGE ON SCHEMA auth TO anon;

-- Make sure the trigger function has the right permissions
ALTER FUNCTION link_auth_user_to_public() OWNER TO postgres;

-- Recreate the trigger with proper configuration
DROP TRIGGER IF EXISTS after_signup_trigger ON auth.users;
CREATE TRIGGER after_signup_trigger
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION link_auth_user_to_public(); 
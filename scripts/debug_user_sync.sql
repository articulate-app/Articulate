-- Debug script for user synchronization between auth and public tables

-- 1. First, let's check if the trigger exists and its configuration
SELECT 
    tgname as trigger_name,
    proname as function_name,
    n.nspname as schema_name,
    t.tgtype as trigger_type,
    CASE 
        WHEN t.tgenabled = 'O' THEN 'ENABLED'
        WHEN t.tgenabled = 'D' THEN 'DISABLED'
        ELSE 'OTHER'
    END as trigger_status
FROM pg_trigger t
JOIN pg_proc p ON t.tgfoid = p.oid
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE tgname = 'after_signup_trigger';

-- 2. Check the structure of the public.users table
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
AND table_name = 'users'
ORDER BY ordinal_position;

-- 3. Check current permissions
SELECT grantee, privilege_type 
FROM information_schema.role_table_grants 
WHERE table_schema = 'public' 
AND table_name = 'users';

-- 4. Create an improved version of the trigger function with better error handling
CREATE OR REPLACE FUNCTION link_auth_user_to_public()
RETURNS TRIGGER AS $$
DECLARE
    v_error_message text;
    v_error_detail text;
    v_error_hint text;
BEGIN
    -- Log the attempt
    RAISE NOTICE 'Attempting to create public user record for auth user: %', NEW.id;
    
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
    
    RAISE NOTICE 'Successfully created/updated public user record';
    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        -- Get detailed error information
        GET STACKED DIAGNOSTICS
            v_error_message = MESSAGE_TEXT,
            v_error_detail = PG_EXCEPTION_DETAIL,
            v_error_hint = PG_EXCEPTION_HINT;
            
        -- Log the error with all available details
        RAISE NOTICE 'Error during insert into public.users:';
        RAISE NOTICE 'Error message: %', v_error_message;
        RAISE NOTICE 'Error detail: %', v_error_detail;
        RAISE NOTICE 'Error hint: %', v_error_hint;
        RAISE NOTICE 'SQL State: %', SQLSTATE;
        RAISE NOTICE 'Context: %', pg_exception_context();
        
        -- Still return NEW to allow the auth user creation to succeed
        RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Set up proper permissions
-- First, revoke all existing permissions to start clean
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA public FROM PUBLIC;

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

-- 6. Recreate the trigger with proper configuration
DROP TRIGGER IF EXISTS after_signup_trigger ON auth.users;
CREATE TRIGGER after_signup_trigger
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION link_auth_user_to_public();

-- 7. Verify the trigger is properly attached
SELECT 
    tgname as trigger_name,
    proname as function_name,
    n.nspname as schema_name,
    t.tgtype as trigger_type,
    CASE 
        WHEN t.tgenabled = 'O' THEN 'ENABLED'
        WHEN t.tgenabled = 'D' THEN 'DISABLED'
        ELSE 'OTHER'
    END as trigger_status
FROM pg_trigger t
JOIN pg_proc p ON t.tgfoid = p.oid
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE tgname = 'after_signup_trigger'; 
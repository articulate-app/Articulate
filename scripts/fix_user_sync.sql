-- Comprehensive fix for user synchronization between auth and public tables

-- 1. Check if the public.users table exists and create it if it doesn't
DO $$
BEGIN
    -- Check if the table exists
    IF NOT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
    ) THEN
        -- Create the table
        CREATE TABLE public.users (
            id SERIAL PRIMARY KEY,
            auth_user_id UUID UNIQUE NOT NULL,
            email TEXT NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            is_deleted BOOLEAN DEFAULT FALSE,
            active BOOLEAN DEFAULT TRUE
        );
        
        RAISE NOTICE 'Created public.users table';
    ELSE
        RAISE NOTICE 'public.users table already exists';
    END IF;
END $$;

-- 2. Create an improved version of the trigger function with better error handling
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

-- 3. Set up proper permissions
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

-- Grant necessary permissions to the auth schema
GRANT USAGE ON SCHEMA auth TO postgres;
GRANT USAGE ON SCHEMA auth TO service_role;
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT USAGE ON SCHEMA auth TO anon;

-- Make sure the trigger function has the right permissions
ALTER FUNCTION link_auth_user_to_public() OWNER TO postgres;

-- 4. Recreate the trigger with proper configuration
DROP TRIGGER IF EXISTS after_signup_trigger ON auth.users;
CREATE TRIGGER after_signup_trigger
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION link_auth_user_to_public();

-- 5. Test the trigger function directly
DO $$
DECLARE
    v_auth_user_id uuid;
    v_email text;
    v_result text;
BEGIN
    -- Create a test auth user record
    v_auth_user_id := gen_random_uuid();
    v_email := 'test_' || to_char(now(), 'YYYYMMDDHH24MISS') || '@example.com';
    
    -- Log the test
    RAISE NOTICE 'Testing trigger function with auth_user_id: % and email: %', v_auth_user_id, v_email;
    
    -- Call the trigger function directly
    BEGIN
        -- Insert into public.users
        INSERT INTO public.users (
            auth_user_id,
            email,
            created_at,
            updated_at,
            synced_at,
            is_deleted,
            active
        ) VALUES (
            v_auth_user_id,
            v_email,
            NOW(),
            NOW(),
            NOW(),
            FALSE,
            TRUE
        );
        
        v_result := 'Success';
    EXCEPTION
        WHEN OTHERS THEN
            v_result := 'Error: ' || SQLERRM;
    END;
    
    -- Report the result
    RAISE NOTICE 'Test result: %', v_result;
    
    -- Clean up
    DELETE FROM public.users WHERE auth_user_id = v_auth_user_id;
END $$; 
-- Create an improved version of the trigger function with better error handling
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

-- Recreate the trigger with proper configuration
DROP TRIGGER IF EXISTS after_signup_trigger ON auth.users;
CREATE TRIGGER after_signup_trigger
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION link_auth_user_to_public(); 
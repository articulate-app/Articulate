-- Test the trigger function directly
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
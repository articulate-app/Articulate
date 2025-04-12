-- Check if the public.users table exists and create it if it doesn't
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
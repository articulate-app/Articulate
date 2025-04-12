-- Check the structure of the public.users table
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
AND table_name = 'users'
ORDER BY ordinal_position;

-- Check if auth_user_id is a primary key
SELECT
    tc.constraint_name,
    tc.constraint_type,
    kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
WHERE tc.table_schema = 'public'
    AND tc.table_name = 'users'
    AND tc.constraint_type = 'PRIMARY KEY';

-- Check if the trigger exists
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

-- Check permissions
SELECT grantee, privilege_type 
FROM information_schema.role_table_grants 
WHERE table_schema = 'public' 
AND table_name = 'users'; 
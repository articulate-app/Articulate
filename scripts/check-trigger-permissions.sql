-- Check the permissions of the trigger function and the public.users table
-- This script will:
-- 1. Check the permissions of the trigger function
-- 2. Check the permissions of the public.users table
-- 3. Check the permissions of the service_role
-- 4. Check the permissions of the postgres role

-- 1. Check the permissions of the trigger function
SELECT
  grantee,
  privilege_type
FROM information_schema.role_routine_grants
WHERE routine_name = 'link_auth_user_to_public'
AND routine_schema = 'public';

-- 2. Check the permissions of the public.users table
SELECT
  grantee,
  privilege_type
FROM information_schema.role_table_grants
WHERE table_name = 'users'
AND table_schema = 'public';

-- 3. Check the permissions of the service_role
SELECT
  r.rolname,
  r.rolsuper,
  r.rolinherit,
  r.rolcreaterole,
  r.rolcreatedb,
  r.rolcanlogin,
  r.rolreplication,
  r.rolbypassrls,
  r.rolconnlimit,
  r.rolvaliduntil
FROM pg_roles r
WHERE r.rolname = 'service_role';

-- 4. Check the permissions of the postgres role
SELECT
  r.rolname,
  r.rolsuper,
  r.rolinherit,
  r.rolcreaterole,
  r.rolcreatedb,
  r.rolcanlogin,
  r.rolreplication,
  r.rolbypassrls,
  r.rolconnlimit,
  r.rolvaliduntil
FROM pg_roles r
WHERE r.rolname = 'postgres';

-- 5. Check if the trigger function is owned by postgres
SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_userbyid(p.proowner) AS owner
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'link_auth_user_to_public'
AND n.nspname = 'public';

-- 6. Check if the public.users table is owned by postgres
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  pg_get_userbyid(c.relowner) AS owner
FROM pg_class c
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE c.relname = 'users'
AND n.nspname = 'public';

-- 7. Check if the service_role has the necessary permissions to execute the trigger function
SELECT
  has_function_privilege('service_role', 'public.link_auth_user_to_public()', 'EXECUTE') AS has_execute_privilege;

-- 8. Check if the service_role has the necessary permissions to insert into the public.users table
SELECT
  has_table_privilege('service_role', 'public.users', 'INSERT') AS has_insert_privilege;

-- Check if there are any issues with the trigger function's permissions
-- This script will:
-- 1. Check the owner of the trigger function
-- 2. Check the permissions on the trigger function
-- 3. Check the permissions on the public.users table
-- 4. Check the permissions on the auth.users table

-- 1. Check the owner of the trigger function
SELECT
  p.proname AS function_name,
  n.nspname AS schema_name,
  pg_get_userbyid(p.proowner) AS function_owner
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'link_auth_user_to_public'
AND n.nspname = 'public';

-- 2. Check the permissions on the trigger function
SELECT
  grantee,
  privilege_type
FROM information_schema.role_table_grants
WHERE table_name = 'link_auth_user_to_public'
AND table_schema = 'public';

-- 3. Check the permissions on the public.users table
SELECT
  grantee,
  privilege_type
FROM information_schema.role_table_grants
WHERE table_name = 'users'
AND table_schema = 'public';

-- 4. Check the permissions on the auth.users table
SELECT
  grantee,
  privilege_type
FROM information_schema.role_table_grants
WHERE table_name = 'users'
AND table_schema = 'auth';

-- 5. Check if the trigger function has SECURITY DEFINER
SELECT
  p.proname AS function_name,
  n.nspname AS schema_name,
  p.prosecdef AS is_security_definer
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'link_auth_user_to_public'
AND n.nspname = 'public';

-- 6. Check the search_path of the trigger function
SELECT
  p.proname AS function_name,
  n.nspname AS schema_name,
  p.proargnames AS argument_names,
  p.proargmodes AS argument_modes,
  p.proargtypes AS argument_types,
  p.prosrc AS function_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'link_auth_user_to_public'
AND n.nspname = 'public'; 
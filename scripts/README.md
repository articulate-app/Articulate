# Fixing the Trigger Function

This directory contains scripts to fix the trigger function that links users from `auth.users` to `public.users`.

## The Problem

When creating a new user in Supabase Auth, the trigger function `public.link_auth_user_to_public()` is supposed to automatically create a corresponding record in the `public.users` table. However, the trigger function is failing with a permission error:

```
permission denied for schema public (SQLSTATE 42501)
```

This happens because the trigger function doesn't have the necessary permissions to insert into the `public.users` table.

## The Solution

The solution is to:

1. Drop the existing trigger and function
2. Recreate the function with `SECURITY DEFINER` attribute
3. Grant the necessary permissions to the function
4. Make sure the function is owned by the `postgres` user

## How to Fix

### Option 1: Using the SQL Editor in Supabase Dashboard (Recommended)

1. Go to the Supabase Dashboard
2. Navigate to the SQL Editor
3. Copy the contents of `fix-trigger-security-simple.sql`
4. Run the SQL script
5. To test if the fix worked, copy the contents of `test-trigger-simple.sql` and run it

### Option 2: Using the Shell Script

1. Make sure your `.env` or `.env.local` file contains the `DATABASE_URL` environment variable
2. Run the shell script:

```bash
./scripts/run-fix-trigger-security.sh
```

### Option 3: Manual Fix

If you prefer to fix it manually, follow these steps:

1. Drop the existing trigger and function:
   ```sql
   DROP TRIGGER IF EXISTS after_signup_trigger ON auth.users;
   DROP FUNCTION IF EXISTS public.link_auth_user_to_public() CASCADE;
   ```

2. Recreate the function with `SECURITY DEFINER`:
   ```sql
   CREATE OR REPLACE FUNCTION public.link_auth_user_to_public()
   RETURNS TRIGGER
   LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path = public
   AS $$
   BEGIN
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
     
     RETURN NEW;
   EXCEPTION
     WHEN OTHERS THEN
       -- Just return NEW to allow the transaction to continue
       RETURN NEW;
   END;
   $$;
   ```

3. Create the trigger:
   ```sql
   CREATE TRIGGER after_signup_trigger
   AFTER INSERT ON auth.users
   FOR EACH ROW
   EXECUTE FUNCTION public.link_auth_user_to_public();
   ```

4. Grant permissions:
   ```sql
   GRANT USAGE ON SCHEMA public TO postgres;
   GRANT ALL ON public.users TO postgres;
   GRANT EXECUTE ON FUNCTION public.link_auth_user_to_public() TO postgres;

   GRANT USAGE ON SCHEMA public TO service_role;
   GRANT ALL ON public.users TO service_role;
   GRANT EXECUTE ON FUNCTION public.link_auth_user_to_public() TO service_role;
   ```

5. Make sure the function is owned by `postgres`:
   ```sql
   ALTER FUNCTION public.link_auth_user_to_public() OWNER TO postgres;
   ```

## Testing the Fix

After applying the fix, you can test if the trigger is working correctly by running the `test-trigger-simple.sql` script in the Supabase SQL Editor.

## Understanding SECURITY DEFINER

The `SECURITY DEFINER` attribute is crucial for this fix. It makes the function run with the privileges of the owner (in this case, `postgres`) rather than the privileges of the user calling the function. This allows the function to access tables in the `public` schema even if the calling user doesn't have permission to access them directly.

It's important to note that when using `SECURITY DEFINER`, you should always set the `search_path` to avoid potential security issues. In this case, we set it to `public` to ensure that all table references in the function are explicitly qualified with the schema name. 
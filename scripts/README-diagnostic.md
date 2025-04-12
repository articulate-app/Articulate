# Diagnostic Scripts for Trigger Function

This directory contains several SQL scripts to help diagnose and fix issues with the trigger function that links `auth.users` to `public.users`.

## Scripts Overview

### 1. `check-public-users-table.sql`
This script checks the structure of the `public.users` table and compares it with the `auth.users` table. It will show:
- Column names, data types, and nullability for both tables
- Constraints on the `public.users` table
- Indexes on the `public.users` table
- Triggers on the `public.users` table

### 2. `check-trigger-function.sql`
This script checks the trigger function and its permissions. It will show:
- The function definition
- The function permissions
- The function owner
- If the function is properly set up as a trigger
- If there are any errors in the function

### 3. `check-column-names.sql`
This script checks if there are any issues with the column names in the trigger function. It will show:
- Column names in the `auth.users` table
- Column names in the `public.users` table
- If the trigger function is using the correct column names
- If there are any foreign key constraints between `auth.users` and `public.users`
- If there are any issues with the data types

### 4. `test-trigger-detailed.sql`
This script provides a detailed test of the trigger function. It will:
- Create a test user in `auth.users`
- Check if the user was added to `public.users`
- If not, try to manually insert the user into `public.users`
- Check for any errors in the process
- Clean up by deleting the test user

### 5. `fix-trigger-detailed.sql`
This script provides a detailed fix for the trigger function. It will:
- Drop the existing trigger and function
- Create a new function with `SECURITY DEFINER` and proper error handling
- Create the trigger
- Grant necessary permissions
- Verify the trigger creation
- Test the trigger with a sample user

## How to Use

1. Run the diagnostic scripts in the Supabase SQL Editor to identify the issue:
   - `check-public-users-table.sql`
   - `check-trigger-function.sql`
   - `check-column-names.sql`

2. If the issue is identified, run the fix script:
   - `fix-trigger-detailed.sql`

3. Test the fix with the test script:
   - `test-trigger-detailed.sql`

## Common Issues

1. **Column Name Mismatch**: The column names in the trigger function might not match the actual column names in the tables.
2. **Data Type Mismatch**: The data types in the trigger function might not match the actual data types in the tables.
3. **Permission Issues**: The function might not have the necessary permissions to insert into the `public.users` table.
4. **Search Path Issues**: The function might not have the correct search path set.
5. **Transaction Issues**: The function might be failing silently due to transaction issues.

## Troubleshooting

If the trigger function is still not working after running the fix script, try the following:

1. Check the logs for any error messages.
2. Verify that the `public.users` table has the correct structure.
3. Verify that the `auth.users` table has the correct structure.
4. Verify that the trigger function has the correct permissions.
5. Verify that the trigger function is using the correct column names and data types. 
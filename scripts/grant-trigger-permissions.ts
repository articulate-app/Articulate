import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function grantTriggerPermissions() {
  try {
    console.log('Granting permissions to trigger function...');
    
    // Grant permissions to the trigger function
    await pool.query(`
      -- Grant permissions to the trigger function
      GRANT USAGE ON SCHEMA public TO postgres;
      GRANT ALL ON public.users TO postgres;
      GRANT ALL ON public.trigger_log TO postgres;
      
      -- Make sure the trigger function has the right permissions
      ALTER FUNCTION public.link_auth_user_to_public() SECURITY DEFINER;
      
      -- Grant execute permission on the function
      GRANT EXECUTE ON FUNCTION public.link_auth_user_to_public() TO postgres;
      
      -- Grant permissions to the service_role
      GRANT USAGE ON SCHEMA public TO service_role;
      GRANT ALL ON public.users TO service_role;
      GRANT ALL ON public.trigger_log TO service_role;
      
      -- Grant execute permission on the function to service_role
      GRANT EXECUTE ON FUNCTION public.link_auth_user_to_public() TO service_role;
    `);
    
    console.log('Permissions granted successfully');
    
    // Verify the permissions
    console.log('\nVerifying permissions...');
    const permissionsResult = await pool.query(`
      SELECT 
        grantee, 
        table_schema, 
        table_name, 
        privilege_type
      FROM information_schema.role_table_grants
      WHERE table_schema = 'public'
      AND table_name IN ('users', 'trigger_log')
      AND grantee IN ('postgres', 'service_role')
      ORDER BY grantee, table_name, privilege_type;
    `);
    
    console.log('\nTable permissions:');
    console.table(permissionsResult.rows);
    
    // Check function permissions
    const functionPermissionsResult = await pool.query(`
      SELECT 
        grantee, 
        routine_schema, 
        routine_name, 
        privilege_type
      FROM information_schema.role_routine_grants
      WHERE routine_schema = 'public'
      AND routine_name = 'link_auth_user_to_public'
      AND grantee IN ('postgres', 'service_role')
      ORDER BY grantee, privilege_type;
    `);
    
    console.log('\nFunction permissions:');
    console.table(functionPermissionsResult.rows);
    
  } catch (error) {
    console.error('Error granting permissions:', error);
  } finally {
    await pool.end();
  }
}

grantTriggerPermissions(); 
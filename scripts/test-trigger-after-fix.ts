import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { Pool } from 'pg';

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

// Supabase configuration
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// PostgreSQL configuration
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function testTrigger() {
  console.log('Testing trigger function after fix...');
  
  // Generate a unique email for testing
  const uniqueEmail = `test.user.${Date.now()}@example.com`;
  const uniqueId = `test-${Date.now()}`;
  
  try {
    // Create a user using Supabase admin API
    console.log(`Attempting to create user with email: ${uniqueEmail}`);
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    
    // Create user with minimal required fields
    const { data: userData, error: userError } = await supabase.auth.admin.createUser({
      email: uniqueEmail,
      password: 'password123',
      email_confirm: true,
      user_metadata: { test: true },
    });
    
    if (userError) {
      console.error('Error creating user:', userError);
      return;
    }
    
    console.log('User created successfully:', userData.user.id);
    
    // Check if user exists in auth.users
    const { rows: authUsers } = await pool.query(
      'SELECT * FROM auth.users WHERE id = $1',
      [userData.user.id]
    );
    
    console.log('User in auth.users:', authUsers.length > 0 ? 'Found' : 'Not found');
    if (authUsers.length > 0) {
      console.log('User details:', authUsers[0]);
    }
    
    // Check if user exists in public.users
    const { rows: publicUsers } = await pool.query(
      'SELECT * FROM public.users WHERE auth_user_id = $1',
      [userData.user.id]
    );
    
    console.log('User in public.users:', publicUsers.length > 0 ? 'Found' : 'Not found');
    if (publicUsers.length > 0) {
      console.log('User details:', publicUsers[0]);
    }
    
    // Check trigger logs
    const { rows: triggerLogs } = await pool.query(
      'SELECT * FROM public.trigger_log WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5',
      [userData.user.id]
    );
    
    console.log('Trigger logs:', triggerLogs);
    
    // Clean up - delete the test user
    console.log('Cleaning up - deleting test user...');
    const { error: deleteError } = await supabase.auth.admin.deleteUser(userData.user.id);
    
    if (deleteError) {
      console.error('Error deleting user:', deleteError);
    } else {
      console.log('User deleted successfully');
    }
    
    // Delete from public.users if it exists
    if (publicUsers.length > 0) {
      await pool.query(
        'DELETE FROM public.users WHERE auth_user_id = $1',
        [userData.user.id]
      );
      console.log('User deleted from public.users');
    }
    
  } catch (error) {
    console.error('Error testing trigger:', error);
  } finally {
    // Close the pool
    await pool.end();
  }
}

// Run the test
testTrigger().catch(console.error); 
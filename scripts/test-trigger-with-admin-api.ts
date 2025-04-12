import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { Pool } from 'pg';

// Load environment variables
dotenv.config();

// Create Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Create PostgreSQL pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function testTrigger() {
  try {
    // Generate a unique email for testing
    const testEmail = `test_${Math.floor(Math.random() * 1000000)}@example.com`;
    console.log('Test email:', testEmail);

    // 1. Create a test user using the Supabase admin API
    const { data: userData, error: createError } = await supabase.auth.admin.createUser({
      email: testEmail,
      password: 'password123',
      email_confirm: true
    });

    if (createError) {
      throw new Error(`Error creating user: ${createError.message}`);
    }

    if (!userData.user) {
      throw new Error('No user data returned');
    }

    const userId = userData.user.id;
    console.log('Created user with ID:', userId);

    // 2. Wait a moment for the trigger to execute
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 3. Check if the user exists in auth.users
    const { data: authUser, error: authError } = await supabase
      .from('auth.users')
      .select('*')
      .eq('id', userId)
      .single();

    if (authError) {
      throw new Error(`Error checking auth.users: ${authError.message}`);
    }

    console.log('User exists in auth.users:', !!authUser);

    // 4. Check if the user exists in public.users
    const { data: publicUser, error: publicError } = await supabase
      .from('users')
      .select('*')
      .eq('auth_user_id', userId)
      .single();

    if (publicError && publicError.code !== 'PGRST116') { // Ignore "no rows returned" error
      throw new Error(`Error checking public.users: ${publicError.message}`);
    }

    console.log('User exists in public.users:', !!publicUser);

    if (publicUser) {
      console.log('User details in public.users:', publicUser);
    }

    // 5. Check the latest trigger execution
    const client = await pool.connect();
    try {
      const result = await client.query(`
        SELECT
          au.id AS auth_user_id,
          au.email AS auth_email,
          pu.auth_user_id AS public_auth_user_id,
          pu.email AS public_email,
          pu.created_at AS public_created_at
        FROM auth.users au
        LEFT JOIN public.users pu ON au.id = pu.auth_user_id
        WHERE au.id = $1
      `, [userId]);

      console.log('Query result:', result.rows[0]);
    } finally {
      client.release();
    }

    // 6. Clean up by deleting the test user
    const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);

    if (deleteError) {
      throw new Error(`Error deleting user: ${deleteError.message}`);
    }

    console.log('Test user deleted successfully');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

// Run the test
testTrigger(); 
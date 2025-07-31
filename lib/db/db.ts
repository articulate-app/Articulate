import { Pool } from 'pg';
import { getDbConfig } from './supabase';

// Create a new pool instance with lazy-loaded config
let pool: Pool | null = null;

const getPool = () => {
  if (!pool) {
    pool = new Pool(getDbConfig());
  }
  return pool;
};

// Test the database connection
export async function testConnection() {
  try {
    const client = await getPool().connect();
    client.release();
    return true;
  } catch (error) {
    console.error('Database connection error:', error);
    return false;
  }
}

// Generic query function
export async function query(text: string, params?: any[]) {
  try {
    const result = await getPool().query(text, params);
    return result;
  } catch (error) {
    throw error;
  }
}

// Close the pool when the application shuts down
process.on('SIGINT', () => {
  if (pool) {
    pool.end().then(() => {
      process.exit(0);
    });
  }
}); 
import { Pool } from 'pg';
import { dbConfig } from './supabase';

// Create a new pool instance
const pool = new Pool(dbConfig);

// Test the database connection
export async function testConnection() {
  try {
    const client = await pool.connect();
    console.log('Successfully connected to the database');
    client.release();
    return true;
  } catch (error) {
    console.error('Error connecting to the database:', error);
    return false;
  }
}

// Generic query function
export async function query(text: string, params?: any[]) {
  try {
    const result = await pool.query(text, params);
    return result;
  } catch (error) {
    console.error('Error executing query:', error);
    throw error;
  }
}

// Close the pool when the application shuts down
process.on('SIGINT', () => {
  pool.end().then(() => {
    console.log('Pool has ended');
    process.exit(0);
  });
}); 
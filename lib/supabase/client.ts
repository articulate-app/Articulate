import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'

// Check if required environment variables are present
const requiredEnvVars = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
}

// Validate environment variables
Object.entries(requiredEnvVars).forEach(([key, value]) => {
  if (!value) {
    console.error(`Missing required environment variable: ${key}`)
  }
})

// Create a singleton instance of the Supabase client
let supabaseClient: ReturnType<typeof createSupabaseClient<Database>> | null = null

export function createClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// Export a function to check the connection
export async function checkConnection() {
  try {
    const client = createClient()
    const { data, error } = await client.from('tasks').select('id').limit(1)
    
    if (error) {
      throw error
    }
    
    return true
  } catch (error) {
    console.error('Database connection check failed:', error)
    return false
  }
} 
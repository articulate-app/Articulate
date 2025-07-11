import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { Database } from '../../../lib/types/database'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const createClient = () => {
  return createSupabaseClient<Database>(supabaseUrl, supabaseAnonKey)
} 
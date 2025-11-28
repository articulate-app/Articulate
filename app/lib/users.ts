import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"

export interface User {
  id: string
  full_name: string
}

export async function getUsers(): Promise<User[]> {
  try {
    const supabase = createClientComponentClient()
    
    const { data, error } = await supabase
      .from('view_users_i_can_see')
      .select('id, full_name')
      .order('full_name')

    if (error) {
      console.error('Error fetching users:', error)
      throw error
    }

    return data || []
  } catch (error) {
    console.error('Error in getUsers:', error)
    throw error
  }
} 
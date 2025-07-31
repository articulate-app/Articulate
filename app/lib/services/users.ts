import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"

interface User {
  id: string
  full_name: string
}

async function getUsers(): Promise<User[]> {
  try {
    const supabase = createClientComponentClient()
    
    const { data, error } = await supabase
      .from('users')
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

/**
 * Fetch users assigned to a project via project_watchers.
 * @param projectId The project ID
 * @returns Array of { value, label } for dropdowns
 */
export async function getUsersForProject(projectId: string): Promise<{ value: string; label: string }[]> {
  const supabase = createClientComponentClient()
  const { data, error } = await supabase
    .from('project_watchers')
    .select('user_id, users (id, full_name)')
    .eq('project_id', projectId)
  if (error) throw error
  return (data || [])
    .map((row: any) => row.users)
    .filter(Boolean)
    .map((user: any) => ({ value: user.id, label: user.full_name }))
}

/**
 * Fetch allowed content types, languages, and production types for a user from the costs table.
 * @param userId The user ID
 * @returns { contentTypeIds: string[], languageIds: string[], productionTypeIds: string[] }
 */
export async function getUserCapabilities(userId: string): Promise<{
  contentTypeIds: string[];
  languageIds: string[];
  productionTypeIds: string[];
}> {
  const supabase = createClientComponentClient()
  const { data, error } = await supabase
    .from('costs')
    .select('*')
    .eq('user_id', userId)
  if (error) throw error
  const contentTypeIds = Array.from(new Set((data || []).map((row: any) => String(row.content_type_id)).filter(Boolean)))
  const languageIds = Array.from(new Set((data || []).map((row: any) => String(row.language_id)).filter(Boolean)))
  const productionTypeIds = Array.from(new Set((data || []).map((row: any) => String(row.production_type_id)).filter(Boolean)))
  return { contentTypeIds, languageIds, productionTypeIds }
}

export type { User }
export { getUsers } 
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

const supabase = createClientComponentClient()

// Type definitions
export interface MinimalUser {
  id: number
  full_name: string | null
  email: string | null
  photo: string | null
  brand: string | null
}

export interface UserProfile {
  user_id: number
  full_name: string | null
  photo: string | null
  brand: string | null
  phone: string | null
  start_date: string | null
  end_date: string | null
  send_invoices: boolean | null
  send_content: boolean | null
  send_inspiration: boolean | null
  send_reports: boolean | null
  active: boolean | null
  created_at: string
  updated_at: string
  auth_user_id: string
  auth_email: string
}

export interface UserProject {
  user_id: number
  project_id: number
  project_name: string
  project_color: string | null
  project_status: string | null
  start_date: string | null
  due_date: string | null
}

export interface UserTeam {
  user_id: number
  team_id: number
  team_title: string
  team_full_name: string
  role_id: number
}

export interface UserTask {
  id: number
  title: string
  project_id: number
  project_name: string | null
  project_color: string | null
  delivery_date: string | null
  publication_date: string | null
  project_status_id: number | null
  project_status_name: string | null
  is_overdue: boolean | null
  is_publication_overdue: boolean | null
  assigned_to_id: number | null
  assigned_to_name: string | null
  updated_at: string
}

export interface UserCost {
  id: number
  user_id: number | null
  content_type_id: number | null
  production_type_id: number | null
  language_id: number | null
  valid_from: string | null
  price_novat: string | null
  price_withvat: string | null
  notes: string | null
}

/**
 * Get paginated list of users
 */
export async function getUsersPage(
  cursor: number = 0,
  limit: number = 50,
  search?: string
) {
  let query = supabase
    .from('v_users_minimal_i_can_see')
    .select('id, full_name, email, photo, brand')
    .order('full_name', { ascending: true })
    .range(cursor, cursor + limit - 1)

  if (search && search.trim()) {
    query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`)
  }

  const { data, error } = await query

  return { data: data as MinimalUser[] | null, error }
}

/**
 * Create a new user with team assignment
 */
export async function createUserWithTeam(
  fullName: string,
  email: string,
  teamId: number
) {
  const { data, error } = await supabase.rpc('fn_create_user_with_team', {
    p_full_name: fullName,
    p_email: email,
    p_team_id: teamId,
  })

  return { data, error }
}

/**
 * Get user profile
 */
export async function getUserProfile(userId: number) {
  const { data, error } = await supabase
    .from('v_user_profile_i_can_see')
    .select('*')
    .eq('user_id', userId)
    .single()

  return { data: data as UserProfile | null, error }
}

/**
 * Get projects a user is watching
 */
export async function getUserProjects(userId: number) {
  const { data, error } = await supabase
    .from('v_user_projects_i_can_see')
    .select('*')
    .eq('user_id', userId)
    .order('project_name')

  return { data: data as UserProject[] | null, error }
}

/**
 * Get teams a user belongs to
 */
export async function getUserTeams(userId: number) {
  const { data, error } = await supabase
    .from('v_user_teams_i_can_see')
    .select('*')
    .eq('user_id', userId)
    .order('team_title')

  return { data: data as UserTeam[] | null, error }
}

/**
 * Get tasks assigned to a user
 */
export async function getUserTasks(userId: number) {
  const { data, error } = await supabase
    .from('v_user_tasks_i_can_see')
    .select('*')
    .eq('assigned_to_id', userId)
    .order('updated_at', { ascending: false })
    .limit(50)

  return { data: data as UserTask[] | null, error }
}

/**
 * Get user costs/skills
 */
export async function getUserCosts(userId: number) {
  const { data, error } = await supabase
    .from('v_user_costs_i_can_see')
    .select('*')
    .eq('user_id', userId)
    .order('valid_from', { ascending: false })

  return { data: data as UserCost[] | null, error }
}

/**
 * Update user communication preferences
 */
export async function updateUserPreferences(
  userId: number,
  preferences: {
    send_invoices?: boolean
    send_content?: boolean
    send_inspiration?: boolean
    send_reports?: boolean
  }
) {
  const { data, error } = await supabase
    .from('users')
    .update(preferences)
    .eq('id', userId)
    .select()
    .single()

  return { data, error }
}

/**
 * Update user profile (name, email, etc.)
 */
export async function updateUserProfile(
  userId: number,
  updates: {
    full_name?: string
    auth_email?: string
    phone?: string
    brand?: string
  }
) {
  const { data, error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', userId)
    .select()
    .single()

  return { data, error }
}

/**
 * Soft delete a user
 */
export async function softDeleteUser(userId: number) {
  const { data, error } = await supabase.rpc('fn_soft_delete_user', {
    p_user_id: userId,
  })

  return { data, error }
}

/**
 * Get or create a thread for user communication
 */
export async function getOrCreateUserThread(userId: number) {
  const { data, error } = await supabase.rpc('fn_get_or_create_user_thread', {
    p_user_id: userId,
  })

  return { data, error }
}

/**
 * Create a new named thread for user communication
 */
export async function createUserThread(userId: number, title: string) {
  const { data, error } = await supabase.rpc('fn_create_user_thread', {
    p_user_id: userId,
    p_title: title || 'Chat',
  })

  return { data, error }
}

/**
 * List all DM threads with a specific user
 */
export async function listUserDmThreadsWithUser(userId: number) {
  const { data, error } = await supabase.rpc('fn_list_user_dm_threads_with_user', {
    p_user_id: userId,
  })

  return { data: data as any[] | null, error }
}

/**
 * Delete a thread
 */
export async function deleteThread(threadId: number) {
  const { data, error } = await supabase.rpc('fn_delete_thread', {
    p_thread_id: threadId,
  })

  return { data, error }
}

/**
 * Search DM mentions with a user
 */
export async function searchUserDmMentions(
  userId: number,
  query: string,
  limit: number = 50,
  offset: number = 0
) {
  const { data, error } = await supabase.rpc('fn_search_user_dm_mentions_with_user', {
    p_user_id: userId,
    p_query: query,
    p_limit: limit,
    p_offset: offset,
  })

  return { data: data as any[] | null, error }
}

/**
 * Get users for a specific project (project watchers)
 * Returns users in the format { value: string, label: string }
 */
export async function getUsersForProject(projectId: string | number): Promise<{ value: string; label: string }[]> {
  try {
    const { data, error } = await supabase
      .from('v_project_watchers_with_user')
      .select('user_id, full_name')
      .eq('project_id', projectId)
      .order('full_name')

    if (error) {
      console.error('Error fetching users for project:', error)
      return []
    }

    return (data || [])
      .filter((user: any) => user.user_id && user.full_name)
      .map((user: any) => ({
        value: String(user.user_id),
        label: user.full_name || 'Unnamed User',
      }))
  } catch (error) {
    console.error('Error in getUsersForProject:', error)
    return []
  }
}

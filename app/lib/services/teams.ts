import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

const supabase = createClientComponentClient()

// Type definitions
export interface TeamProfile {
  team_id: number
  title: string
  full_name: string
  description: string | null
  logo: string | null
  billing_business_name: string | null
  billing_vat_number: string | null
  billing_address_line1: string | null
  billing_address_line2: string | null
  billing_city: string | null
  billing_postcode: string | null
  billing_region: string | null
  billing_country_code: string | null
  invoice_provider_name: string | null
  created_at: string
  updated_at: string
  active: boolean | null
  member_count: number
  project_count: number
}

export interface TeamMember {
  user_id: number
  team_id: number
  role_id: number
  team_title: string
  team_full_name: string
  role_title: string
  role_description: string | null
  has_access_app: boolean
  full_name?: string
  email?: string
  photo?: string
}

export interface TeamProject {
  project_id: number
  name: string
  color: string | null
  status: string | null
  start_date: string | null
  due_date: string | null
}

export interface TeamActivity {
  id: number
  project_id: number
  team_id: number
  user_id: number
  action: string
  details: string | null
  task_id: number | null
  type: string | null
  task_log_signature: string | null
  is_deleted: boolean | null
  timestamp: string
  synced_at: string | null
  project_name: string
  project_color: string | null
}

export interface Role {
  id: number
  title: string
  description: string | null
  has_access_app: boolean
}

/**
 * Get team profile with member and project counts
 */
export async function getTeamProfile(teamId: number) {
  const { data, error } = await supabase
    .from('v_team_profile')
    .select('*')
    .eq('team_id', teamId)
    .single()

  return { data: data as TeamProfile | null, error }
}

/**
 * Update team basic info
 */
export async function updateTeam(
  teamId: number,
  patch: {
    title?: string
    full_name?: string
    description?: string
    logo?: string
    active?: boolean
  }
) {
  const { data, error } = await supabase
    .from('teams')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', teamId)
    .select()
    .single()

  return { data, error }
}

/**
 * Update team billing info
 */
export async function updateTeamBilling(
  teamId: number,
  billing: {
    billing_business_name?: string
    billing_vat_number?: string
    billing_address_line1?: string
    billing_address_line2?: string
    billing_city?: string
    billing_postcode?: string
    billing_region?: string
    billing_country_code?: string
    invoice_provider_name?: string
  }
) {
  const { data, error } = await supabase
    .from('teams')
    .update({ ...billing, updated_at: new Date().toISOString() })
    .eq('id', teamId)
    .select()
    .single()

  return { data, error }
}

/**
 * Get team members with their roles
 */
export async function getTeamMembers(teamId: number) {
  const { data, error } = await supabase
    .from('v_user_teams_i_can_see')
    .select('*')
    .eq('team_id', teamId)
    .order('user_id')

  return { data: data as TeamMember[] | null, error }
}

/**
 * Get team members with full user details
 */
export async function getTeamMembersWithDetails(teamId: number) {
  const membersResult = await getTeamMembers(teamId)
  if (membersResult.error || !membersResult.data) {
    return membersResult
  }

  const userIds = membersResult.data.map(m => m.user_id)
  
  if (userIds.length === 0) {
    return { data: [], error: null }
  }

  const { data: users, error: usersError } = await supabase
    .from('v_users_minimal_i_can_see')
    .select('id, full_name, email, photo')
    .in('id', userIds)

  if (usersError) {
    return { data: null, error: usersError }
  }

  const userMap = new Map(users?.map(u => [u.id, u]) || [])
  
  const enrichedMembers = membersResult.data.map(member => ({
    ...member,
    full_name: userMap.get(member.user_id)?.full_name || null,
    email: userMap.get(member.user_id)?.email || null,
    photo: userMap.get(member.user_id)?.photo || null,
  }))

  return { data: enrichedMembers, error: null }
}

/**
 * Add user to team with role
 */
export async function addUserToTeam(
  userId: number,
  teamId: number,
  roleId: number
) {
  const { data, error } = await supabase.rpc('fn_add_user_to_team', {
    p_user_id: userId,
    p_team_id: teamId,
    p_role_id: roleId,
  })

  return { data, error }
}

/**
 * Remove user from team
 */
export async function removeUserFromTeam(userId: number, teamId: number) {
  const { data, error } = await supabase.rpc('fn_remove_user_from_team', {
    p_user_id: userId,
    p_team_id: teamId,
  })

  return { data, error }
}

/**
 * Get team projects
 */
export async function getTeamProjects(teamId: number) {
  const { data, error } = await supabase
    .from('v_team_projects')
    .select('project_id, name, color, status, start_date, due_date')
    .eq('team_id', teamId)
    .order('updated_at', { ascending: false })

  return { data: data as TeamProject[] | null, error }
}

/**
 * Add project to team
 */
export async function addProjectToTeam(teamId: number, projectId: number) {
  const { data, error } = await supabase.rpc('fn_add_project_to_team', {
    p_team_id: teamId,
    p_project_id: projectId,
  })

  return { data, error }
}

/**
 * Remove project from team
 */
export async function removeProjectFromTeam(teamId: number, projectId: number) {
  const { data, error } = await supabase.rpc('fn_remove_project_from_team', {
    p_team_id: teamId,
    p_project_id: projectId,
  })

  return { data, error }
}

/**
 * Get team activity
 */
export async function getTeamActivity(
  teamId: number,
  limit: number = 50,
  offset: number = 0
) {
  const { data, error } = await supabase.rpc('fn_list_team_activity', {
    p_team_id: teamId,
    p_limit: limit,
    p_offset: offset,
  })

  return { data: data as TeamActivity[] | null, error }
}

/**
 * Get or create team chat thread
 */
export async function getOrCreateTeamThread(teamId: number) {
  const { data, error } = await supabase.rpc('fn_get_or_create_team_thread', {
    p_team_id: teamId,
  })

  return { data, error }
}

/**
 * Get all available roles
 */
export async function getRoles() {
  const { data, error } = await supabase
    .from('roles')
    .select('*')
    .order('title')

  return { data: data as Role[] | null, error }
}

/**
 * Get available users (for adding to team)
 */
export async function getAvailableUsers(search?: string) {
  let query = supabase
    .from('v_users_minimal_i_can_see')
    .select('id, full_name, email, photo')
    .order('full_name')

  if (search && search.trim()) {
    query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`)
  }

  const { data, error } = await query

  return { data, error }
}

/**
 * Get available projects (for adding to team)
 */
export async function getAvailableProjects(search?: string) {
  let query = supabase
    .from('v_projects_minimal')
    .select('id, name, color')
    .eq('is_deleted', false)
    .order('name')

  if (search && search.trim()) {
    query = query.ilike('name', `%${search}%`)
  }

  const { data, error } = await query

  return { data, error }
}


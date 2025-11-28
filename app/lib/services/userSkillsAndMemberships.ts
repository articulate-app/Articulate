import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

const supabase = createClientComponentClient()

// Type definitions
export interface UserContentSkill {
  id: number
  user_id: number
  content_type_id: number | null
  content_type_title: string | null
  production_type_id: number | null
  production_type_title: string | null
  language_id: number | null
  language_code: string | null
  language_name: string | null
  valid_from: string | null
  price_novat: string | null
  price_withvat: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface UserTeamWithRole {
  user_id: number
  team_id: number
  role_id: number
  team_title: string
  team_full_name: string
  role_title: string
  role_description: string | null
  has_access_app: boolean
}

export interface ContentType {
  id: number
  title: string
  is_deleted: boolean | null
  seo_required: boolean
}

export interface ProductionType {
  id: number
  title: string
  is_deleted: boolean | null
}

export interface Language {
  id: number
  code: string
  long_name: string | null
  is_deleted: boolean | null
}

export interface Role {
  id: number
  title: string
  description: string | null
  has_access_app: boolean
}

/**
 * Get user content skills
 */
export async function getUserContentSkills(userId: number) {
  const { data, error } = await supabase
    .from('v_user_content_skills')
    .select('*')
    .eq('user_id', userId)
    .order('valid_from', { ascending: false })

  return { data: data as UserContentSkill[] | null, error }
}

/**
 * Add a content skill to a user
 */
export async function addUserContentSkill(params: {
  userId: number
  contentTypeId: number
  productionTypeId: number
  languageId: number
  validFrom: string
  priceNoVat: number
  priceWithVat: number
  notes?: string
}) {
  const { data, error } = await supabase.rpc('fn_add_user_content_skill', {
    p_user_id: params.userId,
    p_content_type_id: params.contentTypeId,
    p_production_type_id: params.productionTypeId,
    p_language_id: params.languageId,
    p_valid_from: params.validFrom,
    p_price_novat: params.priceNoVat,
    p_price_withvat: params.priceWithVat,
    p_notes: params.notes || null,
  })

  return { data, error }
}

/**
 * Update a user's content skill
 */
export async function updateUserContentSkill(params: {
  costId: number
  contentTypeId: number
  productionTypeId: number
  languageId: number
  validFrom: string
  priceNoVat: number
  priceWithVat: number
  notes: string | null
}) {
  const { data, error } = await supabase.rpc('fn_update_user_content_skill', {
    p_cost_id: params.costId,
    p_content_type_id: params.contentTypeId,
    p_production_type_id: params.productionTypeId,
    p_language_id: params.languageId,
    p_valid_from: params.validFrom,
    p_price_novat: params.priceNoVat,
    p_price_withvat: params.priceWithVat,
    p_notes: params.notes,
  })

  return { data, error }
}

/**
 * Delete (soft) a user content skill
 */
export async function deleteUserContentSkill(costId: number) {
  const { data, error } = await supabase.rpc('fn_soft_delete_user_content_skill', {
    p_cost_id: costId,
  })

  return { data, error }
}

/**
 * Get user teams with role information
 */
export async function getUserTeamsWithRoles(userId: number) {
  const { data, error } = await supabase
    .from('v_user_teams_i_can_see')
    .select('*')
    .eq('user_id', userId)
    .order('team_title')

  return { data: data as UserTeamWithRole[] | null, error }
}

/**
 * Add user to a team with a role
 */
export async function addUserToTeam(userId: number, teamId: number, roleId: number) {
  const { data, error } = await supabase.rpc('fn_add_user_to_team', {
    p_user_id: userId,
    p_team_id: teamId,
    p_role_id: roleId,
  })

  return { data, error }
}

/**
 * Remove user from a team
 */
export async function removeUserFromTeam(userId: number, teamId: number) {
  const { data, error } = await supabase.rpc('fn_remove_user_from_team', {
    p_user_id: userId,
    p_team_id: teamId,
  })

  return { data, error }
}

/**
 * Add user to a project as watcher
 */
export async function addUserToProject(userId: number, projectId: number) {
  const { data, error } = await supabase.rpc('fn_add_user_to_project', {
    p_user_id: userId,
    p_project_id: projectId,
  })

  return { data, error }
}

/**
 * Remove user from a project
 */
export async function removeUserFromProject(userId: number, projectId: number) {
  const { data, error } = await supabase.rpc('fn_remove_user_from_project', {
    p_user_id: userId,
    p_project_id: projectId,
  })

  return { data, error }
}

/**
 * Get all content types
 */
export async function getContentTypes() {
  const { data, error } = await supabase
    .from('content_types')
    .select('id, title, is_deleted, seo_required')
    .eq('is_deleted', false)
    .order('title')

  return { data: data as ContentType[] | null, error }
}

/**
 * Get all production types
 */
export async function getProductionTypes() {
  const { data, error } = await supabase
    .from('production_types')
    .select('id, title, is_deleted')
    .eq('is_deleted', false)
    .order('title')

  return { data: data as ProductionType[] | null, error }
}

/**
 * Get all languages
 */
export async function getLanguages() {
  const { data, error } = await supabase
    .from('languages')
    .select('id, code, long_name, is_deleted')
    .eq('is_deleted', false)
    .order('long_name')

  return { data: data as Language[] | null, error }
}

/**
 * Get all roles
 */
export async function getRoles() {
  const { data, error } = await supabase
    .from('roles')
    .select('id, title, description, has_access_app')
    .order('title')

  return { data: data as Role[] | null, error }
}

/**
 * Get minimal projects list
 */
export async function getMinimalProjects() {
  const { data, error } = await supabase
    .from('projects')
    .select('id, name, color, active')
    .eq('active', true)
    .order('name')

  return { data, error }
}


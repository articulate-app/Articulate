import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

const supabase = createClientComponentClient()

// Type definitions
export interface ProjectStatusWithTemplate {
  id: number
  project_id: number
  name: string
  type: string | null
  order_priority: number | null
  color: string
  description: string | null
  is_deleted: boolean | null
  is_closed: boolean | null
  is_publication_closed: boolean | null
  template_id: number | null
  template_name: string | null
  template_type: string | null
  template_color: string | null
  template_description: string | null
  template_is_closed: boolean | null
  template_is_publication_closed: boolean | null
}

export interface StatusTemplate {
  id: number
  name: string
  type: string | null
  order_priority: number | null
  color: string
  description: string | null
  is_deleted: boolean | null
  is_closed: boolean | null
  is_publication_closed: boolean | null
}

/**
 * Get all active project statuses for a project
 */
export async function getProjectStatuses(projectId: number) {
  const { data, error } = await supabase.rpc('fn_list_project_statuses', {
    p_project_id: projectId,
  })

  return { data: data as ProjectStatusWithTemplate[] | null, error }
}

/**
 * Get available status templates that haven't been used by this project yet
 */
export async function getAvailableStatusTemplates(projectId: number) {
  const { data, error } = await supabase.rpc('fn_list_available_status_templates', {
    p_project_id: projectId,
  })

  return { data: data as StatusTemplate[] | null, error }
}

/**
 * Add a project status from a system template
 */
export async function addStatusFromTemplate(projectId: number, templateId: number) {
  const { data, error } = await supabase.rpc('fn_add_project_status_from_template', {
    p_project_id: projectId,
    p_template_id: templateId,
  })

  return { data, error }
}

/**
 * Create a custom project status (not from a template)
 */
export async function createCustomStatus(args: {
  projectId: number
  name: string
  color: string
  description?: string | null
  isClosed?: boolean
  isPublicationClosed?: boolean
  type?: string | null
}) {
  const { data, error } = await supabase.rpc('fn_create_custom_project_status', {
    p_project_id: args.projectId,
    p_name: args.name,
    p_color: args.color,
    p_description: args.description ?? null,
    p_is_closed: args.isClosed ?? false,
    p_is_publication_closed: args.isPublicationClosed ?? false,
    p_type: args.type ?? null,
  })

  return { data, error }
}

/**
 * Update an existing project status
 */
export async function updateStatus(args: {
  statusId: number
  name: string
  color: string
  description: string | null
  isClosed: boolean
  isPublicationClosed: boolean
}) {
  const { data, error } = await supabase.rpc('fn_update_project_status', {
    p_status_id: args.statusId,
    p_name: args.name,
    p_color: args.color,
    p_description: args.description,
    p_is_closed: args.isClosed,
    p_is_publication_closed: args.isPublicationClosed,
  })

  return { data, error }
}

/**
 * Reorder project statuses by providing the new order of status IDs
 */
export async function reorderStatuses(projectId: number, statusIds: number[]) {
  const { data, error } = await supabase.rpc('fn_reorder_project_statuses', {
    p_project_id: projectId,
    p_status_ids: statusIds,
  })

  return { data, error }
}

/**
 * Soft delete (archive) a project status
 */
export async function softDeleteStatus(statusId: number) {
  const { data, error } = await supabase.rpc('fn_soft_delete_project_status', {
    p_status_id: statusId,
  })

  return { data, error }
}


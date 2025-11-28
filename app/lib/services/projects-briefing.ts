import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

const supabase = createClientComponentClient()

// Type definitions
export interface ProjectOverview {
  project_id: number
  name: string
  description: string | null
  goal: string | null
  target_audience: string | null
  editorial_line: string | null
  color: string | null
  start_date: string | null
  end_date: string | null
  project_url: string | null
  created_at: string
  team_id: number | null
  team_name: string | null
  creation_mode: string | null
  ai_autorun_days_before: number | null
}

export interface ProjectBillingProfile {
  project_id: number
  business_name: string | null
  vat_number: string | null
  address_line1: string | null
  address_line2: string | null
  city: string | null
  postcode: string | null
  region: string | null
  country_code: string | null
  invoice_provider_name: string | null
  currency_code: string | null
  vat_rate: string | number | null
  invoice_due_days: number | null
  team_id: number | null
  billing_frequency: string | null
}

export interface ProjectActivity {
  id: number
  project_id: number
  user_id: number
  action: string
  details: string | null
  task_id: number | null
  type: string | null
  is_deleted: boolean | null
  timestamp: string
}

export interface ProjectComment {
  id: number
  project_id: number
  user_id: number
  comment: string
  is_deleted: boolean | null
  created_at: string
  updated_at: string
}

export interface ProjectFile {
  id: number
  project_id: number
  file_name: string
  file_type: string
  file_size: number
  file_url: string
  storage_path: string | null
  uploaded_by: number
  uploaded_by_name: string | null
  is_deleted: boolean | null
  created_at: string
  updated_at: string
}

// Overview functions
export async function getProjectOverview(projectId: number) {
  const { data, error } = await supabase
    .from('v_project_overview')
    .select('*')
    .eq('project_id', projectId)
    .single()

  if (error) {
    console.error('Error fetching project overview:', error)
    return { data: null, error }
  }

  if (!data) {
    return { data: null, error: new Error('Project not found') }
  }

  return {
    data: {
      project_id: data.project_id,
      name: data.name,
      description: data.description,
      goal: data.goal,
      target_audience: data.target_audience,
      editorial_line: data.editorial_line,
      color: data.color,
      start_date: data.start_date,
      end_date: data.end_date,
      project_url: data.project_url,
      created_at: data.created_at,
      team_id: data.team_id,
      team_name: data.team_name,
      creation_mode: data.creation_mode,
      ai_autorun_days_before: data.ai_autorun_days_before,
    } as ProjectOverview,
    error: null,
  }
}

export async function updateProjectOverview(
  projectId: number,
  patch: Partial<{
    name: string
    description: string | null
    goal: string | null
    target_audience: string | null
    editorial_line: string | null
    color: string | null
    start_date: string | null
    due_date: string | null
    project_url: string | null
    team_id: number | null
    creation_mode: string | null
    ai_autorun_days_before: number | null
  }>
) {
  const { data, error } = await supabase
    .from('projects')
    .update(patch)
    .eq('id', projectId)
    .select()
    .single()

  return { data, error }
}

// Billing functions
export async function getProjectBilling(projectId: number) {
  const { data, error } = await supabase
    .from('v_project_billing_profile')
    .select('*')
    .eq('project_id', projectId)
    .single()

  return { data, error }
}

export async function updateProjectBilling(
  projectId: number,
  patch: Partial<{
    currency_code: string | null
    vat_rate: number | null
    invoice_due_days: number | null
    billing_frequency: string | null
    billing_type_id: number | null
    billing_business_name: string | null
    billing_vat_number: string | null
    billing_address_line1: string | null
    billing_address_line2: string | null
    billing_city: string | null
    billing_postcode: string | null
    billing_region: string | null
    billing_country_code: string | null
    invoice_provider_name: string | null
  }>
) {
  const { data, error } = await supabase
    .from('projects')
    .update(patch)
    .eq('id', projectId)
    .select()
    .single()

  return { data, error }
}

// Activity functions
export async function listActivity(
  projectId: number,
  limit = 50,
  offset = 0
) {
  const { data, error } = await supabase.rpc('fn_list_project_activity', {
    p_project_id: projectId,
    p_limit: limit,
    p_offset: offset,
  })

  return { data, error }
}

// Comment functions
export async function listComments(
  projectId: number,
  limit = 50,
  offset = 0
) {
  const { data, error } = await supabase.rpc('fn_list_project_comments', {
    p_project_id: projectId,
    p_limit: limit,
    p_offset: offset,
  })

  return { data, error }
}

export async function addComment(
  projectId: number,
  userId: number,
  comment: string
) {
  const { data, error } = await supabase.rpc('fn_add_project_comment', {
    p_project_id: projectId,
    p_user_id: userId,
    p_comment: comment,
  })

  return { data, error }
}

export async function deleteComment(commentId: number) {
  const { data, error } = await supabase
    .from('project_comments')
    .update({ is_deleted: true })
    .eq('id', commentId)
    .select()
    .single()

  return { data, error }
}

// File functions
export async function listFiles(
  projectId: number,
  limit = 50,
  offset = 0
) {
  const { data, error } = await supabase
    .from('project_files')
    .select(`
      *,
      uploaded_by_user:users!project_files_uploaded_by_fkey (full_name)
    `)
    .eq('project_id', projectId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    return { data: null, error }
  }

  const mappedData = (data || []).map((file: any) => ({
    id: file.id,
    project_id: file.project_id,
    file_name: file.file_name,
    file_type: file.file_type,
    file_size: file.file_size,
    file_url: file.file_url,
    storage_path: file.storage_path,
    uploaded_by: file.uploaded_by,
    uploaded_by_name: file.uploaded_by_user?.full_name || null,
    is_deleted: file.is_deleted,
    created_at: file.created_at,
    updated_at: file.updated_at,
  }))

  return { data: mappedData, error: null }
}

export async function uploadProjectFile(projectId: number, file: File) {
  const ext = file.name.split('.').pop()
  const uuid = crypto.randomUUID()
  const storagePath = `${projectId}/${uuid}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`

  const { data: upl, error: uplErr } = await supabase.storage
    .from('project-files')
    .upload(storagePath, file, {
      upsert: false,
      contentType: file.type,
    })

  if (uplErr) throw uplErr

  const { data: signed } = await supabase.storage
    .from('project-files')
    .createSignedUrl(storagePath, 60 * 60 * 24 * 7)

  const { data: ins, error: insErr } = await supabase
    .from('project_files')
    .insert({
      project_id: projectId,
      file_name: file.name,
      file_type: file.type || ext,
      file_size: file.size,
      file_url: signed?.signedUrl ?? storagePath,
      storage_path: storagePath,
    })
    .select()
    .single()

  if (insErr) throw insErr

  return ins
}

export async function deleteProjectFile(fileRowId: number) {
  const { data, error } = await supabase
    .from('project_files')
    .update({ is_deleted: true })
    .eq('id', fileRowId)
    .select()
    .single()

  return { data, error }
}

export async function getFileUrl(storagePath: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage
      .from('project-files')
      .createSignedUrl(storagePath, 60 * 60 * 24 * 7) // 7 days expiry

    if (error) {
      console.error('Error creating signed URL:', error)
      return null
    }

    return data?.signedUrl || null
  } catch (err) {
    console.error('Error in getFileUrl:', err)
    return null
  }
}

// Watcher types and functions
export interface ProjectWatcher {
  watcher_id: number
  project_id: number
  user_id: number
  full_name: string | null
  email: string | null
  photo: string | null
  created_at: string
  updated_at: string
  is_deleted: boolean | null
}

export async function getProjectWatchers(projectId: number) {
  const { data, error } = await supabase
    .from('v_project_watchers_with_user')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })

  return { data: data as ProjectWatcher[] | null, error }
}

export async function addProjectWatcher(projectId: number, userId: number) {
  const { data, error } = await supabase.rpc('fn_add_project_watcher', {
    p_project_id: projectId,
    p_user_id: userId,
  })

  return { data, error }
}

export async function removeProjectWatcher(watcherId: number) {
  const { data, error } = await supabase.rpc('fn_remove_project_watcher', {
    p_watcher_id: watcherId,
  })

  return { data, error }
}

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { getSupabaseBrowser } from "../../../lib/supabase-browser"
import type { GlobalSearchDocument } from "../global-search-types"
import type { ProjectCard } from "../types/index"

function toTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

const PROJECT_DIRECTORY_MAX_PAGE = 500

/** Map a `projects` row to the Projects directory search document. */
export function projectRowToDirectorySearchDocument(
  row: Record<string, unknown> | null | undefined,
): GlobalSearchDocument | null {
  if (!row) return null
  const id = toFiniteNumber(row.id)
  if (id == null) return null
  const title = toTrimmedString(row.name) ?? "Untitled"
  const createdAt = toTrimmedString(row.created_at)
  const updatedAt = toTrimmedString(row.updated_at)
  const logo = toTrimmedString(row.logo)
  const color = toTrimmedString(row.color)
  const createdBy = toFiniteNumber(row.created_by)
  return {
    entity_type: "project",
    entity_id: String(id),
    title,
    subtitle: null,
    preview: null,
    created_at: createdAt,
    score: null,
    url: null,
    project_id: id,
    task_id: null,
    thread_id: null,
    display_payload: {
      title,
      logo: logo ?? undefined,
      color: color ?? undefined,
      left: {
        type: "project",
        logo: logo ?? undefined,
        color: color ?? undefined,
        label: title,
      },
      meta: [
        { label: "created_at", value: createdAt ?? undefined },
        { label: "updated_at", value: updatedAt ?? undefined },
        { label: "created_by", value: createdBy != null ? String(createdBy) : undefined },
      ],
    },
    raw: {
      id,
      project_id: id,
      name: title,
      logo,
      color,
      created_by: createdBy,
      created_at: createdAt,
      updated_at: updatedAt,
    },
  }
}

/** Projects directory page via `list_project_directory_v1`. */
export async function fetchProjectDirectoryPage(args: {
  offset: number
  limit: number
}): Promise<GlobalSearchDocument[]> {
  const offset = Math.max(0, Math.trunc(args.offset))
  const limit = Math.max(1, Math.min(Math.trunc(args.limit) || 1, PROJECT_DIRECTORY_MAX_PAGE))
  const supabase = getSupabaseBrowser()
  const { data, error } = await supabase.rpc("list_project_directory_v1", {
    p_limit: limit,
    p_offset: offset,
  })
  if (error) throw error
  return (Array.isArray(data) ? data : [])
    .map((row) => projectRowToDirectorySearchDocument(row as Record<string, unknown>))
    .filter(Boolean) as GlobalSearchDocument[]
}

/**
 * Fetch all active projects with team (project_watchers) and last activity (latest delivery_date from tasks)
 */
export async function getProjectCards(): Promise<ProjectCard[]> {
  const supabase = createClientComponentClient()

  // Fetch only active projects
  const { data: projects, error: projectsError } = await supabase
    .from("projects")
    .select("id, name, active")
    .eq("active", true)
    .order("name")
  if (projectsError) throw projectsError

  // Fetch watchers for all projects
  const { data: watchers, error: watchersError } = await supabase
    .from("project_watchers")
    .select("project_id, users (id, full_name)")
  if (watchersError) throw watchersError

  // Fetch last activity (max delivery_date) for all projects
  const { data: activities, error: activitiesError } = await supabase
    .from("tasks")
    .select("project_id_int, delivery_date")
  if (activitiesError) throw activitiesError

  // Map project id to team
  const teamMap: Record<number, { id: string; full_name: string }[]> = {}
  for (const w of watchers || []) {
    if (!w.project_id || !w.users) continue
    if (!teamMap[w.project_id]) teamMap[w.project_id] = []
    const user = Array.isArray(w.users) ? w.users[0] : w.users
    if (user && typeof user.id === 'string' && typeof user.full_name === 'string') {
      teamMap[w.project_id].push({ id: user.id, full_name: user.full_name })
    }
  }

  // Map project id to last activity
  const activityMap: Record<number, string> = {}
  for (const a of activities || []) {
    if (!a.project_id_int || !a.delivery_date) continue
    if (!activityMap[a.project_id_int] || a.delivery_date > activityMap[a.project_id_int]) {
      activityMap[a.project_id_int] = a.delivery_date
    }
  }

  // Build ProjectCard array
  return (projects || []).map((p: any) => ({
    id: p.id,
    name: p.name,
    team: teamMap[p.id] || [],
    lastActivity: activityMap[p.id] || null,
  }))
}

/**
 * Fetch full project details, resolving FKs and related data.
 */
export async function getProjectDetails(projectId: number) {
  const supabase = createClientComponentClient()

  // Fetch main project fields and resolve FKs
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select(`
      *,
      billing_type:billing_types (id, title),
      team_id:teams (id, title),
      project_languages:project_languages (language_id, languages (id, code)),
      project_sectors:project_sectors (sector_id, sectors (id, title))
    `)
    .eq("id", projectId)
    .single()
  if (projectError) throw projectError

  // Fetch team (project_watchers → users)
  const { data: watchers, error: watchersError } = await supabase
    .from("project_watchers")
    .select("user_id, users (id, full_name)")
    .eq("project_id", projectId)
  if (watchersError) throw watchersError
  const team = (watchers || []).map(w => w.users).filter(Boolean)

  // Fetch project_statuses for this project
  const { data: statuses, error: statusesError } = await supabase
    .from("project_statuses")
    .select("id, name")
    .eq("project_id", projectId)
  if (statusesError) throw statusesError

  // Fetch threads where project_id = projectId
  const { data: threadsProject, error: threadsProjectError } = await supabase
    .from("threads")
    .select("id, title, created_at")
    .eq("project_id", projectId)
  if (threadsProjectError) throw threadsProjectError

  // Fetch tasks for this project
  const { data: tasks, error: tasksError } = await supabase
    .from("tasks")
    .select("id")
    .eq("project_id_int", projectId)
  if (tasksError) throw tasksError
  const taskIds = (tasks || []).map(t => t.id)

  // Fetch threads where task_id in taskIds
  let threadsTasks: any[] = []
  if (taskIds.length > 0) {
    const { data: threadsTasksData, error: threadsTasksError } = await supabase
      .from("threads")
      .select("id, task_id, title, created_at")
      .in("task_id", taskIds)
    if (threadsTasksError) throw threadsTasksError
    threadsTasks = threadsTasksData || []
  }

  // Flatten languages and sectors
  const languages = (project.project_languages || []).map((pl: any) => pl.languages).filter(Boolean)
  const sectors = (project.project_sectors || []).map((ps: any) => ps.sectors).filter(Boolean)

  return {
    id: project.id,
    name: project.name,
    client_id: project.client_id,
    content_manager: project.content_manager,
    billing_type: project.billing_type,
    team_id: project.team_id,
    description: project.description,
    created_at: project.created_at,
    goals: project.goals,
    targets: project.targets,
    deliverables: project.deliverables,
    editorial_line: project.editorial_line,
    topics: project.topics,
    languages,
    project_url: project.project_url,
    sectors,
    team,
    project_statuses: statuses || [],
    threads_project: threadsProject || [],
    threads_tasks: threadsTasks || []
  }
}

/**
 * Generate a URL-friendly slug from a string
 */
function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove non-word chars except spaces and hyphens
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
    .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
}

/**
 * Create a new project with minimal required fields
 */
export async function createProject(name: string, teamId: number) {
  const supabase = createClientComponentClient()

  const trimmedName = name.trim()
  const slug = generateSlug(trimmedName)

  const { data, error } = await supabase
    .from("projects")
    .insert({
      name: trimmedName,
      slug: slug || 'project', // Fallback if slug generation results in empty string
      team_id: teamId,
      billing_team_id: teamId,
      active: true,
    })
    .select("id, name")
    .single()

  return { data, error }
}

/**
 * Create a new project and a new team in one atomic RPC.
 */
export async function createProjectWithTeam(projectName: string, teamName: string) {
  const supabase = createClientComponentClient()

  const trimmedProjectName = projectName.trim()
  const trimmedTeamName = teamName.trim()
  const projectSlug = generateSlug(trimmedProjectName) || 'project'

  const { data, error } = await supabase.rpc('create_project_with_team', {
    p_project_name: trimmedProjectName,
    p_project_slug: projectSlug,
    p_team_name: trimmedTeamName,
  })

  return { data, error }
}

/**
 * Duplicate an existing project
 */
export async function duplicateProject(projectId: number, newName?: string) {
  const supabase = createClientComponentClient()

  // Fetch the original project
  const { data: originalProject, error: fetchError } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .single()

  if (fetchError) return { data: null, error: fetchError }

  // Create new project with duplicated data
  const { id, created_at, updated_at, ...projectData } = originalProject
  const { data: newProject, error: createError } = await supabase
    .from("projects")
    .insert({
      ...projectData,
      name: newName || `${originalProject.name} (Copy)`,
    })
    .select("id, name")
    .single()

  return { data: newProject, error: createError }
}

/**
 * Soft delete a project (set active to false)
 */
export async function deleteProject(projectId: number) {
  const supabase = createClientComponentClient()

  const { data, error } = await supabase
    .from("projects")
    .update({ active: false })
    .eq("id", projectId)
    .select()
    .single()

  return { data, error }
} 
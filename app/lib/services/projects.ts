import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import type { ProjectCard } from "../types/index"

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
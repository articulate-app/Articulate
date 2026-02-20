import { supabase } from "../supabase"

export type PlanMode = "manual" | "human_loop" | "autopilot"
export type FrequencyUnit = "week" | "month"
export type ChannelsMode = "project_default" | "explicit"
export type TaskSuggestionStatus = "pending" | "approved" | "rejected" | "dismissed"

export type LookupRow = { id: number; title?: string; name?: string; code?: string }

export type PlanningLookups = {
  contentTypes: { id: number; title: string }[]
  productionTypes: { id: number; title: string }[]
  languages: { id: number; code: string }[]
  briefingTypes: { id: number; title: string }[]
  channels: { id: number; name: string }[]
}

export type ProjectTaskPlanRow = {
  id: number
  project_id: number
  is_active: boolean | null
  is_deleted: boolean | null
  content_type_id: number | null
  production_type_id: number | null
  language_id: number | null
  briefing_type_id: number | null
  frequency_count: number
  frequency_unit: FrequencyUnit
  channels_mode: ChannelsMode
  channel_ids: number[] | null
  created_at?: string
  updated_at?: string
}

export type ProjectTaskPlanUpsert = Omit<
  ProjectTaskPlanRow,
  "id" | "created_at" | "updated_at" | "is_deleted"
> & {
  is_active: boolean
  channel_ids: number[] | null
}

export type TaskSuggestionRow = {
  id: number
  project_id: number
  status: TaskSuggestionStatus
  is_deleted: boolean | null
  source_key?: string | null
  proposed_title: string | null
  proposed_briefing: string | null
  ai_title?: string | null
  ai_briefing?: string | null
  ai_content_type_id?: number | null
  planned_for_date: string | null
  content_type_id: number | null
  production_type_id: number | null
  language_id: number | null
  channel_ids: number[] | null
  created_at?: string
}

export type TaskRowForPlanning = {
  id: number
  source_key: string | null
  title: string | null
  briefing: string | null
  content_type_id: number | null
  publication_date: string | null
  delivery_date: string | null
}

export type PlanningHorizonMode = "days" | "due_date"

export type ProjectTaskPlanPreviewRow = {
  plan_id: number
  planned_for_date: string | null
  content_type_id: number | null
  production_type_id: number | null
  language_id: number | null
  briefing_type_id: number | null
  channel_ids: number[] | null
  source_key: string | null
}

export type ProjectPlanningMemoryRow = {
  project_id: number
  stats: Record<string, unknown>
  avoid_terms: string[]
  boost_terms: string[]
  recent_approved_examples: string[]
  recent_upcoming_examples: string[]
  recent_dismissed_examples: string[]
  updated_at: string
}

export async function getProjectPlanMode(projectId: number) {
  const { data, error } = await supabase
    .from("projects")
    .select("plan_mode")
    .eq("id", projectId)
    .maybeSingle()

  return { data: (data?.plan_mode as PlanMode | null) ?? null, error }
}

export async function updateProjectPlanMode(projectId: number, planMode: PlanMode) {
  const { data, error } = await supabase
    .from("projects")
    .update({ plan_mode: planMode })
    .eq("id", projectId)
    .select("plan_mode")
    .maybeSingle()

  return { data: (data?.plan_mode as PlanMode | null) ?? null, error }
}

export async function listProjectTaskPlans(projectId: number) {
  const { data, error } = await supabase
    .from("project_task_plans")
    .select("*")
    .eq("project_id", projectId)
    .eq("is_deleted", false)
    .order("id", { ascending: false })

  return { data: (data as ProjectTaskPlanRow[] | null) ?? null, error }
}

export async function createProjectTaskPlan(payload: ProjectTaskPlanUpsert) {
  const { data, error } = await supabase
    .from("project_task_plans")
    .insert(payload)
    .select("*")
    .single()

  return { data: (data as ProjectTaskPlanRow | null) ?? null, error }
}

export async function updateProjectTaskPlan(planId: number, payload: Partial<ProjectTaskPlanUpsert>) {
  const { data, error } = await supabase
    .from("project_task_plans")
    .update(payload)
    .eq("id", planId)
    .select("*")
    .single()

  return { data: (data as ProjectTaskPlanRow | null) ?? null, error }
}

export async function softDeleteProjectTaskPlan(planId: number) {
  const { data, error } = await supabase
    .from("project_task_plans")
    .update({ is_deleted: true })
    .eq("id", planId)
    .select("id")
    .maybeSingle()

  return { data, error }
}

export async function listPendingTaskSuggestions(projectId: number) {
  const { data, error } = await supabase
    .from("task_suggestions")
    .select("*")
    .eq("project_id", projectId)
    .eq("status", "pending")
    .eq("is_deleted", false)
    .order("id", { ascending: false })

  return { data: (data as TaskSuggestionRow[] | null) ?? null, error }
}

export async function listTaskSuggestionsBySourceKeys(args: { projectId: number; sourceKeys: string[] }) {
  const cleaned = Array.from(new Set(args.sourceKeys.filter((k) => typeof k === "string" && k.trim().length > 0)))
  if (cleaned.length === 0) return { data: [] as TaskSuggestionRow[], error: null as any }

  const { data, error } = await supabase
    .from("task_suggestions")
    .select(
      "id,project_id,status,is_deleted,source_key,planned_for_date,proposed_title,proposed_briefing,content_type_id,production_type_id,language_id,channel_ids,ai_title,ai_briefing,ai_content_type_id,created_at",
    )
    .eq("project_id", args.projectId)
    .eq("is_deleted", false)
    .in("source_key", cleaned)
    .in("status", ["pending", "approved", "dismissed", "rejected"])
    .order("id", { ascending: false })

  return { data: (data as TaskSuggestionRow[] | null) ?? null, error }
}

export async function listPendingTaskSuggestionsBySourceKeys(args: { projectId: number; sourceKeys: string[] }) {
  const cleaned = Array.from(new Set(args.sourceKeys.filter((k) => typeof k === "string" && k.trim().length > 0)))
  if (cleaned.length === 0) return { data: [] as TaskSuggestionRow[], error: null as any }

  const { data, error } = await supabase
    .from("task_suggestions")
    .select(
      "id,project_id,status,is_deleted,source_key,planned_for_date,proposed_title,proposed_briefing,content_type_id,production_type_id,language_id,channel_ids,ai_title,ai_briefing,ai_content_type_id,created_at",
    )
    .eq("project_id", args.projectId)
    .eq("is_deleted", false)
    .eq("status", "pending")
    .in("source_key", cleaned)
    .order("id", { ascending: false })

  return { data: (data as TaskSuggestionRow[] | null) ?? null, error }
}

export async function listTasksBySourceKeys(args: { projectId: number; sourceKeys: string[] }) {
  const cleaned = Array.from(new Set(args.sourceKeys.filter((k) => typeof k === "string" && k.trim().length > 0)))
  if (cleaned.length === 0) return { data: [] as TaskRowForPlanning[], error: null as any }

  const { data, error } = await supabase
    .from("tasks")
    .select("id,source_key,title,briefing,content_type_id,publication_date,delivery_date")
    .eq("project_id_int", args.projectId)
    .in("source_key", cleaned)
    .order("id", { ascending: false })

  return { data: (data as TaskRowForPlanning[] | null) ?? null, error }
}

export async function updateTaskSuggestionStatus(
  suggestionId: number,
  status: Exclude<TaskSuggestionStatus, "pending">,
) {
  const { data, error } = await supabase
    .from("task_suggestions")
    .update({ status })
    .eq("id", suggestionId)
    .select("id,status")
    .single()

  return { data, error }
}

export async function updateTaskSuggestionDraft(
  suggestionId: number,
  patch: {
    proposed_title?: string | null
    proposed_briefing?: string | null
    content_type_id?: number | null
  },
) {
  const { data, error } = await supabase
    .from("task_suggestions")
    .update(patch)
    .eq("id", suggestionId)
    .select("id,proposed_title,proposed_briefing,content_type_id")
    .single()

  return { data, error }
}

export async function setTaskSuggestionStatus(suggestionId: number, status: TaskSuggestionStatus) {
  const { data, error } = await supabase.rpc("set_task_suggestion_status", {
    p_suggestion_id: suggestionId,
    p_status: status,
  })

  return { data: (data as unknown) ?? null, error }
}

export async function approveTaskSuggestion(args: { suggestionId: number; approvedBy: number }) {
  const { data, error } = await supabase.rpc("approve_task_suggestion", {
    p_suggestion_id: args.suggestionId,
    p_approved_by: args.approvedBy,
  })

  return { data: (data as unknown) ?? null, error }
}

export async function getProjectTaskPlanPreview(args: {
  projectId: number
  horizonMode: PlanningHorizonMode
  horizonDays: number | null
}) {
  const { data, error } = await supabase.rpc("get_project_task_plan_preview", {
    p_project_id: args.projectId,
    p_horizon_mode: args.horizonMode,
    p_horizon_days: args.horizonDays,
  })

  return { data: (data as ProjectTaskPlanPreviewRow[] | null) ?? null, error }
}

export async function runTaskPlanner(args: {
  projectId: number
  horizonMode: PlanningHorizonMode
  horizonDays: number | null
  createdBy: number | null
}) {
  const { data, error } = await supabase.rpc("run_task_planner", {
    p_project_id: args.projectId,
    p_horizon_mode: args.horizonMode,
    p_horizon_days: args.horizonDays,
    p_created_by: args.createdBy,
  })

  return { data: (data as unknown) ?? null, error }
}

export async function runAiTaskPlannerRun(args: {
  projectId: number
  horizonMode: PlanningHorizonMode
  horizonDays: number | null
  createdBy: number | null
}) {
  const { data, error } = await supabase.functions.invoke("ai-task-planner-run", {
    body: {
      project_id: args.projectId,
      horizon_mode: args.horizonMode,
      horizon_days: args.horizonDays,
      created_by: args.createdBy,
    },
  })

  return { data: (data as unknown) ?? null, error }
}

export async function getProjectPlanningMemory(projectId: number) {
  const { data, error } = await supabase
    .from("project_planning_memory")
    .select(
      "project_id,stats,avoid_terms,boost_terms,recent_approved_examples,recent_dismissed_examples,recent_upcoming_examples,updated_at",
    )
    .eq("project_id", projectId)
    .maybeSingle()

  return { data: (data as ProjectPlanningMemoryRow | null) ?? null, error }
}

export type TaskPlannerRunRow = {
  id?: number
  project_id?: number
  created_at?: string
  started_at?: string | null
  finished_at?: string | null
  status?: string | null
  horizon_mode?: PlanningHorizonMode | string | null
  horizon_days?: number | null
  output_summary?: Record<string, unknown> | null
  rejected_by_validator?: boolean | null
  error?: string | null
  error_message?: string | null
}

export async function listTaskPlannerRuns(projectId: number) {
  const { data, error } = await supabase
    .from("task_planner_runs")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(20)

  return { data: (data as TaskPlannerRunRow[] | null) ?? null, error }
}

export async function getTaskPlannerRunById(runId: number) {
  const { data, error } = await supabase
    .from("task_planner_runs")
    .select("*")
    .eq("id", runId)
    .maybeSingle()

  return { data: (data as TaskPlannerRunRow | null) ?? null, error }
}

export async function refreshProjectPlanningMemory(projectId: number) {
  const { data, error } = await supabase.rpc("refresh_project_planning_memory", {
    p_project_id: projectId,
  })

  return { data: (data as unknown) ?? null, error }
}

export async function getPlanningLookups(): Promise<{
  data: PlanningLookups | null
  error: any
}> {
  const [
    contentTypesRes,
    productionTypesRes,
    languagesRes,
    briefingTypesRes,
    channelsRes,
  ] = await Promise.all([
    supabase.from("content_types").select("id,title").eq("is_deleted", false).order("title"),
    supabase
      .from("production_types")
      .select("id,title")
      .eq("is_deleted", false)
      .order("title"),
    supabase.from("languages").select("id,code").eq("is_deleted", false).order("code"),
    supabase.from("briefing_types").select("id,title").eq("is_deleted", false).order("title"),
    supabase.from("channels").select("id,name").eq("is_deleted", false).order("name"),
  ])

  const error =
    contentTypesRes.error ||
    productionTypesRes.error ||
    languagesRes.error ||
    briefingTypesRes.error ||
    channelsRes.error

  if (error) return { data: null, error }

  return {
    data: {
      contentTypes: (contentTypesRes.data as any[])?.map((r) => ({ id: r.id, title: r.title })) ?? [],
      productionTypes: (productionTypesRes.data as any[])?.map((r) => ({ id: r.id, title: r.title })) ?? [],
      languages: (languagesRes.data as any[])?.map((r) => ({ id: r.id, code: r.code })) ?? [],
      briefingTypes: (briefingTypesRes.data as any[])?.map((r) => ({ id: r.id, title: r.title })) ?? [],
      channels: (channelsRes.data as any[])?.map((r) => ({ id: r.id, name: r.name })) ?? [],
    },
    error: null,
  }
}



"use client"

import { getSupabaseBrowser } from "../../../lib/supabase-browser"
import {
  getTeamAiUsageTimezone,
  resolveDefaultTeamTimezone,
} from "./team-ai-usage"

export const PROJECT_AI_USAGE_QUERY_KEY = "project-ai-usage-timeseries"
export const PROJECT_AI_USAGE_TIMEZONE_QUERY_KEY = "project-ai-usage-timezone"

export type ProjectAiUsageSummary = {
  accounted_tokens: number
  prompt_tokens: number
  completion_tokens: number
  cached_prompt_tokens: number
  estimated_tokens: number
  call_count: number
  estimated_call_count: number
  user_count: number
}

export type ProjectAiUsageSeriesPoint = {
  bucket_start: string
  accounted_tokens: number
  prompt_tokens: number
  completion_tokens: number
  cached_prompt_tokens: number
  estimated_tokens: number
  call_count: number
}

export type ProjectAiUsageByModel = {
  provider: string
  model: string
  accounted_tokens: number
  call_count: number
}

export type ProjectAiUsageByStage = {
  stage: string
  accounted_tokens: number
  call_count: number
}

export type ProjectAiUsageByUser = {
  user_id: number
  accounted_tokens: number
  call_count: number
}

export type ProjectAiUsageResponse = {
  project_id: number
  timezone: string
  date_from: string
  date_to: string
  summary: ProjectAiUsageSummary
  series: ProjectAiUsageSeriesPoint[]
  by_model: ProjectAiUsageByModel[]
  by_stage: ProjectAiUsageByStage[]
  by_user: ProjectAiUsageByUser[]
}

export type FetchProjectAiUsageTimeseriesArgs = {
  projectId: number
  dateFrom: string
  dateTo: string
  timezone: string
}

function asNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function parseSummary(raw: unknown): ProjectAiUsageSummary {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  return {
    accounted_tokens: asNumber(record.accounted_tokens),
    prompt_tokens: asNumber(record.prompt_tokens),
    completion_tokens: asNumber(record.completion_tokens),
    cached_prompt_tokens: asNumber(record.cached_prompt_tokens),
    estimated_tokens: asNumber(record.estimated_tokens),
    call_count: asNumber(record.call_count),
    estimated_call_count: asNumber(record.estimated_call_count),
    user_count: asNumber(record.user_count),
  }
}

function parseSeries(raw: unknown): ProjectAiUsageSeriesPoint[] {
  if (!Array.isArray(raw)) return []
  return raw.map((row) => {
    const record = row && typeof row === "object" ? (row as Record<string, unknown>) : {}
    return {
      bucket_start: asString(record.bucket_start),
      accounted_tokens: asNumber(record.accounted_tokens),
      prompt_tokens: asNumber(record.prompt_tokens),
      completion_tokens: asNumber(record.completion_tokens),
      cached_prompt_tokens: asNumber(record.cached_prompt_tokens),
      estimated_tokens: asNumber(record.estimated_tokens),
      call_count: asNumber(record.call_count),
    }
  })
}

function parseByModel(raw: unknown): ProjectAiUsageByModel[] {
  if (!Array.isArray(raw)) return []
  return raw.map((row) => {
    const record = row && typeof row === "object" ? (row as Record<string, unknown>) : {}
    return {
      provider: asString(record.provider),
      model: asString(record.model),
      accounted_tokens: asNumber(record.accounted_tokens),
      call_count: asNumber(record.call_count),
    }
  })
}

function parseByStage(raw: unknown): ProjectAiUsageByStage[] {
  if (!Array.isArray(raw)) return []
  return raw.map((row) => {
    const record = row && typeof row === "object" ? (row as Record<string, unknown>) : {}
    return {
      stage: asString(record.stage),
      accounted_tokens: asNumber(record.accounted_tokens),
      call_count: asNumber(record.call_count),
    }
  })
}

function parseByUser(raw: unknown): ProjectAiUsageByUser[] {
  if (!Array.isArray(raw)) return []
  return raw.map((row) => {
    const record = row && typeof row === "object" ? (row as Record<string, unknown>) : {}
    return {
      user_id: asNumber(record.user_id),
      accounted_tokens: asNumber(record.accounted_tokens),
      call_count: asNumber(record.call_count),
    }
  })
}

export function parseProjectAiUsageResponse(raw: unknown): ProjectAiUsageResponse {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  return {
    project_id: asNumber(record.project_id),
    timezone: asString(record.timezone) || "UTC",
    date_from: asString(record.date_from),
    date_to: asString(record.date_to),
    summary: parseSummary(record.summary),
    series: parseSeries(record.series),
    by_model: parseByModel(record.by_model),
    by_stage: parseByStage(record.by_stage),
    by_user: parseByUser(record.by_user),
  }
}

/** Resolve team timezone for a project, else browser timezone, else UTC. */
export async function getProjectAiUsageTimezone(projectId: number): Promise<string> {
  try {
    const supabase = getSupabaseBrowser()
    const { data, error } = await supabase
      .from("v_project_overview")
      .select("team_id")
      .eq("project_id", projectId)
      .maybeSingle()
    if (error) throw error
    const teamId = typeof data?.team_id === "number" ? data.team_id : Number(data?.team_id)
    if (Number.isFinite(teamId) && teamId > 0) {
      return getTeamAiUsageTimezone(teamId)
    }
  } catch (error) {
    console.warn("Failed to resolve project team timezone", error)
  }
  return resolveDefaultTeamTimezone() || "UTC"
}

export async function fetchProjectAiUsageTimeseries(
  args: FetchProjectAiUsageTimeseriesArgs,
): Promise<ProjectAiUsageResponse> {
  const supabase = getSupabaseBrowser()
  const { data, error } = await supabase.rpc("ai_get_project_token_usage_timeseries", {
    p_project_id: args.projectId,
    p_date_from: args.dateFrom,
    p_date_to: args.dateTo,
    p_timezone: args.timezone,
  })

  if (error) {
    throw new Error(error.message || "Failed to load project AI usage")
  }

  return parseProjectAiUsageResponse(data)
}

"use client"

import { getSupabaseBrowser } from "../../../lib/supabase-browser"

export const TEAM_AI_USAGE_QUERY_KEY = "team-ai-usage-timeseries"
export const TEAM_AI_USAGE_TIMEZONE_QUERY_KEY = "team-ai-usage-timezone"
export const USER_AI_USAGE_QUERY_KEY = "user-ai-usage-timeseries"
export const TEAM_AI_USAGE_GRANULARITY = "day" as const

export type TeamAiUsageSummary = {
  prompt_tokens: number
  completion_tokens: number
  cached_prompt_tokens: number
  total_tokens: number
  call_count: number
  limit_tokens: number | null
  remaining_tokens: number | null
  percent_used: number | null
  period_start: string | null
  resets_at: string | null
}

export type TeamAiUsageSeriesPoint = {
  bucket_start: string
  prompt_tokens: number
  completion_tokens: number
  cached_prompt_tokens: number
  total_tokens: number
  call_count: number
}

export type TeamAiUsageByModel = {
  provider: string
  model: string
  total_tokens: number
  call_count: number
}

export type TeamAiUsageByStage = {
  stage: string
  total_tokens: number
  call_count: number
}

export type TeamAiUsageTopUser = {
  user_id: number
  user_name: string | null
  total_tokens: number
  call_count: number
}

export type TeamAiUsageResponse = {
  team_id: number
  timezone: string
  date_from: string
  date_to: string
  summary: TeamAiUsageSummary
  series: TeamAiUsageSeriesPoint[]
  by_model: TeamAiUsageByModel[]
  by_stage: TeamAiUsageByStage[]
  top_users: TeamAiUsageTopUser[]
}

export type UserAiUsageByProject = {
  project_id: number | null
  project_title: string
  total_tokens: number
  call_count: number
}

export type UserAiUsageResponse = {
  user_id: number
  team_id: number
  can_manage: boolean
  timezone: string
  date_from: string
  date_to: string
  summary: TeamAiUsageSummary
  series: TeamAiUsageSeriesPoint[]
  by_model: TeamAiUsageByModel[]
  by_project: UserAiUsageByProject[]
}

export type FetchUserAiUsageTimeseriesArgs = {
  userId: number
  teamId: number
  dateFrom: string
  dateTo: string
  timezone: string
  granularity?: typeof TEAM_AI_USAGE_GRANULARITY
}

export type FetchTeamAiUsageTimeseriesArgs = {
  teamId: number
  dateFrom: string
  dateTo: string
  timezone: string
  granularity?: typeof TEAM_AI_USAGE_GRANULARITY
}

function asNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

function asNullableNumber(value: unknown): number | null {
  if (value == null) return null
  const n = typeof value === "number" ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null
}

function parseSummary(raw: unknown): TeamAiUsageSummary {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  return {
    prompt_tokens: asNumber(record.prompt_tokens),
    completion_tokens: asNumber(record.completion_tokens),
    cached_prompt_tokens: asNumber(record.cached_prompt_tokens),
    total_tokens: asNumber(record.total_tokens),
    call_count: asNumber(record.call_count),
    limit_tokens: asNullableNumber(record.limit_tokens),
    remaining_tokens: asNullableNumber(record.remaining_tokens),
    percent_used: asNullableNumber(record.percent_used),
    period_start: asNullableString(record.period_start),
    resets_at: asNullableString(record.resets_at),
  }
}

function parseSeries(raw: unknown): TeamAiUsageSeriesPoint[] {
  if (!Array.isArray(raw)) return []
  return raw.map((row) => {
    const record = row && typeof row === "object" ? (row as Record<string, unknown>) : {}
    return {
      bucket_start: asString(record.bucket_start),
      prompt_tokens: asNumber(record.prompt_tokens),
      completion_tokens: asNumber(record.completion_tokens),
      cached_prompt_tokens: asNumber(record.cached_prompt_tokens),
      total_tokens: asNumber(record.total_tokens),
      call_count: asNumber(record.call_count),
    }
  })
}

function parseByModel(raw: unknown): TeamAiUsageByModel[] {
  if (!Array.isArray(raw)) return []
  return raw.map((row) => {
    const record = row && typeof row === "object" ? (row as Record<string, unknown>) : {}
    return {
      provider: asString(record.provider),
      model: asString(record.model),
      total_tokens: asNumber(record.total_tokens),
      call_count: asNumber(record.call_count),
    }
  })
}

function parseByStage(raw: unknown): TeamAiUsageByStage[] {
  if (!Array.isArray(raw)) return []
  return raw.map((row) => {
    const record = row && typeof row === "object" ? (row as Record<string, unknown>) : {}
    return {
      stage: asString(record.stage),
      total_tokens: asNumber(record.total_tokens),
      call_count: asNumber(record.call_count),
    }
  })
}

function parseTopUsers(raw: unknown): TeamAiUsageTopUser[] {
  if (!Array.isArray(raw)) return []
  return raw.map((row) => {
    const record = row && typeof row === "object" ? (row as Record<string, unknown>) : {}
    return {
      user_id: asNumber(record.user_id),
      user_name: asNullableString(record.user_name),
      total_tokens: asNumber(record.total_tokens),
      call_count: asNumber(record.call_count),
    }
  })
}

export function parseTeamAiUsageResponse(raw: unknown): TeamAiUsageResponse {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  return {
    team_id: asNumber(record.team_id),
    timezone: asString(record.timezone) || "UTC",
    date_from: asString(record.date_from),
    date_to: asString(record.date_to),
    summary: parseSummary(record.summary),
    series: parseSeries(record.series),
    by_model: parseByModel(record.by_model),
    by_stage: parseByStage(record.by_stage),
    top_users: parseTopUsers(record.top_users),
  }
}

/** Calendar date (YYYY-MM-DD) for "now" in the given IANA timezone. */
export function getDateStringInTimezone(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date)
  } catch {
    return date.toISOString().slice(0, 10)
  }
}

/** Add calendar days to a YYYY-MM-DD string without local timezone drift. */
export function addDaysToDateString(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split("-").map((part) => Number(part))
  if (!year || !month || !day) return dateStr
  const utc = new Date(Date.UTC(year, month - 1, day))
  utc.setUTCDate(utc.getUTCDate() + days)
  return utc.toISOString().slice(0, 10)
}

export function eachDateStringInclusive(dateFrom: string, dateTo: string): string[] {
  if (!dateFrom || !dateTo || dateFrom > dateTo) return []
  const dates: string[] = []
  let cursor = dateFrom
  while (cursor <= dateTo) {
    dates.push(cursor)
    cursor = addDaysToDateString(cursor, 1)
  }
  return dates
}

export function bucketStartToDateString(bucketStart: string, timeZone: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(bucketStart)) return bucketStart
  const parsed = new Date(bucketStart)
  if (Number.isNaN(parsed.getTime())) return bucketStart.slice(0, 10)
  return getDateStringInTimezone(parsed, timeZone)
}

export function formatBucketAxisLabel(bucketStart: string, timeZone: string): string {
  const dateStr = bucketStartToDateString(bucketStart, timeZone)
  const [year, month, day] = dateStr.split("-").map((part) => Number(part))
  if (!year || !month || !day) return dateStr
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      month: "short",
      day: "numeric",
    }).format(new Date(Date.UTC(year, month - 1, day, 12)))
  } catch {
    return dateStr
  }
}

export function formatBucketTooltipLabel(bucketStart: string, timeZone: string): string {
  const dateStr = bucketStartToDateString(bucketStart, timeZone)
  const [year, month, day] = dateStr.split("-").map((part) => Number(part))
  if (!year || !month || !day) return dateStr
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(Date.UTC(year, month - 1, day, 12)))
  } catch {
    return dateStr
  }
}

export function formatUsageResetDateTime(
  resetsAt: string | null | undefined,
  timezone: string | null | undefined,
): string | null {
  if (!resetsAt) return null
  const date = new Date(resetsAt)
  if (Number.isNaN(date.getTime())) return null
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: timezone ?? undefined,
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date)
  } catch {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date)
  }
}

export function formatAiUsageStageLabel(stage: string): string {
  const normalized = stage.trim().toLowerCase()
  const labels: Record<string, string> = {
    routing: "Routing",
    assistant_stream: "Assistant stream",
    "assistant-stream": "Assistant stream",
    thread_title: "Thread title",
    "thread-title": "Thread title",
    build_worker: "Build worker",
    "build-worker": "Build worker",
  }
  if (labels[normalized]) return labels[normalized]
  return stage
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

export function fillTeamAiUsageSeries(
  series: TeamAiUsageSeriesPoint[],
  dateFrom: string,
  dateTo: string,
  timeZone: string,
): TeamAiUsageSeriesPoint[] {
  const byDate = new Map<string, TeamAiUsageSeriesPoint>()
  for (const point of series) {
    const key = bucketStartToDateString(point.bucket_start, timeZone)
    byDate.set(key, { ...point, bucket_start: key })
  }

  return eachDateStringInclusive(dateFrom, dateTo).map((date) => {
    const existing = byDate.get(date)
    if (existing) return existing
    return {
      bucket_start: date,
      prompt_tokens: 0,
      completion_tokens: 0,
      cached_prompt_tokens: 0,
      total_tokens: 0,
      call_count: 0,
    }
  })
}

export function resolveDefaultTeamTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  } catch {
    return "UTC"
  }
}

export async function getTeamAiUsageTimezone(teamId: number): Promise<string> {
  try {
    const { data, error } = await getSupabaseBrowser().rpc("ai_list_token_limit_policies", {
      p_team_id: teamId,
    })
    if (error) throw error
    const record = data && typeof data === "object" ? (data as Record<string, unknown>) : {}
    const policies = Array.isArray(record.policies) ? record.policies : []
    const teamPolicy = policies.find((row) => {
      if (!row || typeof row !== "object") return false
      const policy = row as Record<string, unknown>
      return policy.user_id == null && policy.enabled !== false
    }) as Record<string, unknown> | undefined
    const timezone = typeof teamPolicy?.timezone === "string" ? teamPolicy.timezone.trim() : ""
    return timezone || resolveDefaultTeamTimezone()
  } catch (error) {
    console.warn("Failed to resolve team AI usage timezone", error)
    return resolveDefaultTeamTimezone()
  }
}

export async function fetchTeamAiUsageTimeseries(
  args: FetchTeamAiUsageTimeseriesArgs,
): Promise<TeamAiUsageResponse> {
  const supabase = getSupabaseBrowser()
  const { data, error } = await supabase.rpc("ai_get_team_token_usage_timeseries", {
    p_team_id: args.teamId,
    p_date_from: args.dateFrom,
    p_date_to: args.dateTo,
    p_timezone: args.timezone,
    p_granularity: args.granularity ?? TEAM_AI_USAGE_GRANULARITY,
  })

  if (error) {
    throw new Error(error.message || "Failed to load team AI usage")
  }

  return parseTeamAiUsageResponse(data)
}

function parseByProject(raw: unknown): UserAiUsageByProject[] {
  if (!Array.isArray(raw)) return []
  return raw.map((row) => {
    const record = row && typeof row === "object" ? (row as Record<string, unknown>) : {}
    return {
      project_id: asNullableNumber(record.project_id),
      project_title: asString(record.project_title) || "No project",
      total_tokens: asNumber(record.total_tokens),
      call_count: asNumber(record.call_count),
    }
  })
}

export function parseUserAiUsageResponse(raw: unknown): UserAiUsageResponse {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  return {
    user_id: asNumber(record.user_id),
    team_id: asNumber(record.team_id),
    can_manage: record.can_manage === true,
    timezone: asString(record.timezone) || "UTC",
    date_from: asString(record.date_from),
    date_to: asString(record.date_to),
    summary: parseSummary(record.summary),
    series: parseSeries(record.series),
    by_model: parseByModel(record.by_model),
    by_project: parseByProject(record.by_project),
  }
}

export type UserAiUsageByTeam = {
  team_id: number
  team_title: string
  total_tokens: number
  call_count: number
  limit_tokens: number | null
  remaining_tokens: number | null
  percent_used: number | null
}

export type MyAiUsageSummary = TeamAiUsageSummary & {
  today_tokens: number
  strictest_team_id: number | null
}

export type MyAiUsageResponse = {
  user_id: number
  timezone: string
  date_from: string
  date_to: string
  summary: MyAiUsageSummary
  series: TeamAiUsageSeriesPoint[]
  by_model: TeamAiUsageByModel[]
  by_project: UserAiUsageByProject[]
  by_team: UserAiUsageByTeam[]
}

export type MyDailyAiUsage = {
  user_id: number
  used_tokens: number
  limit_tokens: number | null
  remaining_tokens: number | null
  percent_used: number | null
  warning_percent: number
  warning: boolean
  maxed_out: boolean
  timezone: string
  resets_at: string | null
  strictest_team_id: number | null
}

export const MY_AI_USAGE_QUERY_KEY = "my-ai-usage-timeseries"
export const MY_DAILY_AI_USAGE_QUERY_KEY = "my-daily-ai-usage"

export type FetchMyAiUsageTimeseriesArgs = {
  dateFrom: string
  dateTo: string
  timezone: string
  granularity?: typeof TEAM_AI_USAGE_GRANULARITY
}

function parseMySummary(raw: unknown): MyAiUsageSummary {
  const base = parseSummary(raw)
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  return {
    ...base,
    today_tokens: asNumber(record.today_tokens),
    strictest_team_id: asNullableNumber(record.strictest_team_id),
  }
}

function parseByTeam(raw: unknown): UserAiUsageByTeam[] {
  if (!Array.isArray(raw)) return []
  return raw.map((row) => {
    const record = row && typeof row === "object" ? (row as Record<string, unknown>) : {}
    return {
      team_id: asNumber(record.team_id),
      team_title: asString(record.team_title) || `Team ${asNumber(record.team_id)}`,
      total_tokens: asNumber(record.total_tokens),
      call_count: asNumber(record.call_count),
      limit_tokens: asNullableNumber(record.limit_tokens),
      remaining_tokens: asNullableNumber(record.remaining_tokens),
      percent_used: asNullableNumber(record.percent_used),
    }
  })
}

export function parseMyAiUsageResponse(raw: unknown): MyAiUsageResponse {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  return {
    user_id: asNumber(record.user_id),
    timezone: asString(record.timezone) || "UTC",
    date_from: asString(record.date_from),
    date_to: asString(record.date_to),
    summary: parseMySummary(record.summary),
    series: parseSeries(record.series),
    by_model: parseByModel(record.by_model),
    by_project: parseByProject(record.by_project),
    by_team: parseByTeam(record.by_team),
  }
}

export function parseMyDailyAiUsage(raw: unknown): MyDailyAiUsage {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  return {
    user_id: asNumber(record.user_id),
    used_tokens: asNumber(record.used_tokens),
    limit_tokens: asNullableNumber(record.limit_tokens),
    remaining_tokens: asNullableNumber(record.remaining_tokens),
    percent_used: asNullableNumber(record.percent_used),
    warning_percent: asNumber(record.warning_percent) || 80,
    warning: record.warning === true,
    maxed_out: record.maxed_out === true,
    timezone: asString(record.timezone) || "UTC",
    resets_at: asNullableString(record.resets_at),
    strictest_team_id: asNullableNumber(record.strictest_team_id),
  }
}

export async function fetchMyAiUsageTimeseries(
  args: FetchMyAiUsageTimeseriesArgs,
): Promise<MyAiUsageResponse> {
  const supabase = getSupabaseBrowser()
  const { data, error } = await supabase.rpc("ai_get_my_token_usage_timeseries", {
    p_date_from: args.dateFrom,
    p_date_to: args.dateTo,
    p_timezone: args.timezone,
    p_granularity: args.granularity ?? TEAM_AI_USAGE_GRANULARITY,
  })

  if (error) {
    throw new Error(error.message || "Failed to load your AI usage")
  }

  return parseMyAiUsageResponse(data)
}

export async function fetchMyDailyAiUsage(timezone?: string): Promise<MyDailyAiUsage> {
  const supabase = getSupabaseBrowser()
  const { data, error } = await supabase.rpc("ai_get_my_daily_token_usage", {
    p_timezone: timezone || resolveDefaultTeamTimezone(),
  })

  if (error) {
    throw new Error(error.message || "Failed to load daily AI usage")
  }

  return parseMyDailyAiUsage(data)
}

export async function fetchUserAiUsageTimeseries(
  args: FetchUserAiUsageTimeseriesArgs,
): Promise<UserAiUsageResponse> {
  const supabase = getSupabaseBrowser()
  const { data, error } = await supabase.rpc("ai_get_user_token_usage_timeseries", {
    p_user_id: args.userId,
    p_team_id: args.teamId,
    p_date_from: args.dateFrom,
    p_date_to: args.dateTo,
    p_timezone: args.timezone,
    p_granularity: args.granularity ?? TEAM_AI_USAGE_GRANULARITY,
  })

  if (error) {
    throw new Error(error.message || "Failed to load user AI usage")
  }

  return parseUserAiUsageResponse(data)
}

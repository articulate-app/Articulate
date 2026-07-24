"use client"

import { getSupabaseBrowser } from "../../../lib/supabase-browser"

export type SetAiTokenLimitArgs = {
  teamId: number
  userId: number | null
  dailyTokenLimit: number | null
  warningPercent: number
  timezone: string
  enabled?: boolean
}

export type AiTokenLimitPolicy = {
  id: number
  team_id: number
  user_id: number | null
  user_name: string | null
  daily_token_limit: number
  warning_percent: number
  timezone: string
  enabled: boolean
  updated_at: string | null
}

export type AiTokenLimitPoliciesResponse = {
  team_id: number
  can_manage: boolean
  policies: AiTokenLimitPolicy[]
}

export async function setAiTokenLimit(args: SetAiTokenLimitArgs) {
  const supabase = getSupabaseBrowser()
  const { data, error } = await supabase.rpc("ai_set_token_limit", {
    p_team_id: args.teamId,
    p_user_id: args.userId,
    p_daily_token_limit: args.dailyTokenLimit,
    p_warning_percent: args.warningPercent,
    p_timezone: args.timezone,
    p_enabled: args.enabled ?? true,
  })
  return { data, error }
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

function parsePolicy(raw: unknown): AiTokenLimitPolicy | null {
  if (!raw || typeof raw !== "object") return null
  const record = raw as Record<string, unknown>
  const id = asNumber(record.id)
  const teamId = asNumber(record.team_id)
  if (!id || !teamId) return null
  return {
    id,
    team_id: teamId,
    user_id: asNullableNumber(record.user_id),
    user_name: asNullableString(record.user_name),
    daily_token_limit: asNumber(record.daily_token_limit),
    warning_percent: asNumber(record.warning_percent) || 80,
    timezone: asString(record.timezone) || "UTC",
    enabled: record.enabled !== false,
    updated_at: asNullableString(record.updated_at),
  }
}

export function parseAiTokenLimitPoliciesResponse(raw: unknown): AiTokenLimitPoliciesResponse {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  const policies = Array.isArray(record.policies)
    ? record.policies.map(parsePolicy).filter((row): row is AiTokenLimitPolicy => !!row)
    : []
  return {
    team_id: asNumber(record.team_id),
    can_manage: record.can_manage === true,
    policies,
  }
}

export async function listAiTokenLimitPolicies(teamId: number): Promise<AiTokenLimitPoliciesResponse> {
  const supabase = getSupabaseBrowser()
  const { data, error } = await supabase.rpc("ai_list_token_limit_policies", {
    p_team_id: teamId,
  })
  if (error) {
    throw new Error(error.message || "Failed to load AI token limits")
  }
  return parseAiTokenLimitPoliciesResponse(data)
}

/** True if the actor is a global Admin (role 3) or Client admin (7) on any team. */
export async function canCurrentUserManageAiLimits(publicUserId: number): Promise<boolean> {
  const supabase = getSupabaseBrowser()
  const { data, error } = await supabase
    .from("teams_users")
    .select("role_id")
    .eq("user_id", publicUserId)
    .in("role_id", [3, 7])
    .limit(1)
  if (error) return false
  return Array.isArray(data) && data.length > 0
}

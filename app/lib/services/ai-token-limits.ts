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

export async function canCurrentUserManageAiLimits(publicUserId: number): Promise<boolean> {
  const supabase = getSupabaseBrowser()
  const { data, error } = await supabase
    .from("teams_users")
    .select("role_id")
    .eq("user_id", publicUserId)
    .eq("role_id", 3)
    .limit(1)
  if (error) return false
  return Array.isArray(data) && data.length > 0
}

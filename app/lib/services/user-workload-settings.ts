import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"

const supabase = createClientComponentClient()

export const DEFAULT_DAILY_CAPACITY_HOURS = 8

export type ActiveUserWorkloadSetting = {
  id: number
  user_id: number
  start_date: string
  end_date: string | null
  daily_capacity_hours: number
}

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Load the currently active workload setting for a user.
 *
 * Active means: start_date <= today AND (end_date IS NULL OR end_date >= today),
 * taking the most recent start_date. Returns null when no active row exists.
 */
export async function getActiveUserWorkloadSetting(
  userId: number,
): Promise<ActiveUserWorkloadSetting | null> {
  const today = todayDateString()

  const { data, error } = await supabase
    .from("user_workload_settings")
    .select("id,user_id,start_date,end_date,daily_capacity_hours")
    .eq("user_id", userId)
    .lte("start_date", today)
    .or(`end_date.is.null,end_date.gte.${today}`)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error

  return (data as ActiveUserWorkloadSetting | null) ?? null
}

/**
 * Update the active workload setting's daily capacity, or insert a new active
 * row starting today when none exists. Always checks for an active row first so
 * we never create duplicate active rows.
 */
export async function upsertCurrentDailyCapacity(
  userId: number,
  dailyCapacityHours: number,
): Promise<void> {
  const existing = await getActiveUserWorkloadSetting(userId)

  if (existing) {
    const { error } = await supabase
      .from("user_workload_settings")
      .update({
        daily_capacity_hours: dailyCapacityHours,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)

    if (error) throw error
    return
  }

  const { error } = await supabase.from("user_workload_settings").insert({
    user_id: userId,
    start_date: todayDateString(),
    end_date: null,
    daily_capacity_hours: dailyCapacityHours,
  })

  if (error) throw error
}

/**
 * Validate a user-entered capacity string. Allows decimals (e.g. "7.5").
 * Returns the parsed number when valid, otherwise null.
 */
export function parseDailyCapacityInput(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === "") return null
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return parsed
}

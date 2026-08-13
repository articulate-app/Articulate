/**
 * One-time scheduled publishing helpers (external/native vs internal cron).
 */

export type PublishMode = "now" | "scheduled"
export type ScheduleStrategy = "external" | "internal"

/** Default: do not auto-publish schedules older than this many hours. */
export const DEFAULT_SCHEDULE_STALE_HOURS = 24

export function parsePublishMode(value: unknown): PublishMode {
  return String(value ?? "").trim().toLowerCase() === "scheduled" ? "scheduled" : "now"
}

export function parseScheduleStrategy(value: unknown): ScheduleStrategy | null {
  const raw = String(value ?? "").trim().toLowerCase()
  if (raw === "external" || raw === "internal") return raw
  return null
}

/**
 * Parse a scheduled instant. Accepts ISO / RFC3339 strings.
 * Returns UTC Date or null when unusable.
 */
export function parseScheduledAt(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value
  if (typeof value !== "string" || !value.trim()) return null
  const parsed = new Date(value.trim())
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

export function normalizeIanaTimezone(value: unknown, fallback = "UTC"): string {
  const raw = typeof value === "string" ? value.trim() : ""
  if (!raw) return fallback
  try {
    // Throws RangeError for invalid IANA zones in modern runtimes.
    Intl.DateTimeFormat("en-US", { timeZone: raw }).format(new Date())
    return raw
  } catch {
    return fallback
  }
}

export function formatScheduledAtForDisplay(
  scheduledAt: string | Date | null | undefined,
  timeZone?: string | null,
): string {
  if (!scheduledAt) return ""
  const date = typeof scheduledAt === "string" ? new Date(scheduledAt) : scheduledAt
  if (Number.isNaN(date.getTime())) return ""
  const zone = normalizeIanaTimezone(timeZone, "UTC")
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date)
  } catch {
    return date.toISOString()
  }
}

export function isScheduleDue(scheduledAt: string | Date | null | undefined, now = new Date()): boolean {
  if (!scheduledAt) return false
  const date = typeof scheduledAt === "string" ? new Date(scheduledAt) : scheduledAt
  if (Number.isNaN(date.getTime())) return false
  return date.getTime() <= now.getTime()
}

export function isScheduleStale(
  scheduledAt: string | Date | null | undefined,
  staleHours = DEFAULT_SCHEDULE_STALE_HOURS,
  now = new Date(),
): boolean {
  if (!scheduledAt) return false
  const date = typeof scheduledAt === "string" ? new Date(scheduledAt) : scheduledAt
  if (Number.isNaN(date.getTime())) return false
  const thresholdMs = Math.max(1, staleHours) * 60 * 60 * 1000
  return date.getTime() <= now.getTime() - thresholdMs
}

export function buildScheduleContextBlock(args: {
  scheduledAtIso: string
  timezone: string
  displayLocal?: string | null
}): string {
  const local = args.displayLocal?.trim() || formatScheduledAtForDisplay(args.scheduledAtIso, args.timezone)
  return [
    "Scheduled publication request:",
    `- Instant (UTC): ${args.scheduledAtIso}`,
    `- Timezone: ${args.timezone}`,
    `- Local display: ${local}`,
  ].join("\n")
}

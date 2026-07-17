import type { AiChatTokenUsageScope, AiChatUsageSnapshot } from "./ai-chat-v2-types"

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function toBoolean(value: unknown): boolean {
  return value === true
}

export function parseAiChatTokenUsageScope(raw: unknown): AiChatTokenUsageScope | null {
  if (!raw || typeof raw !== "object") return null
  const record = raw as Record<string, unknown>
  const usedTokens = toFiniteNumber(record.used_tokens)
  if (usedTokens == null) return null
  return {
    used_tokens: usedTokens,
    reserved_tokens: toFiniteNumber(record.reserved_tokens) ?? 0,
    projected_tokens: toFiniteNumber(record.projected_tokens) ?? usedTokens,
    limit_tokens: toFiniteNumber(record.limit_tokens),
    remaining_tokens: toFiniteNumber(record.remaining_tokens),
    percent_used: toFiniteNumber(record.percent_used),
    projected_percent: toFiniteNumber(record.projected_percent),
    warning_percent: toFiniteNumber(record.warning_percent),
    warning: toBoolean(record.warning),
    projected_warning: toBoolean(record.projected_warning),
    maxed_out: toBoolean(record.maxed_out),
    projected_maxed_out: toBoolean(record.projected_maxed_out),
    resets_at: typeof record.resets_at === "string" ? record.resets_at : null,
    timezone: typeof record.timezone === "string" ? record.timezone : null,
  }
}

export function parseAiChatUsageSnapshot(raw: unknown): AiChatUsageSnapshot | null {
  if (!raw || typeof raw !== "object") return null
  const record = raw as Record<string, unknown>
  const user = parseAiChatTokenUsageScope(record.user)
  const team = parseAiChatTokenUsageScope(record.team)
  if (!user || !team) return null
  return { user, team }
}

export function usageNeedsPostTerminalRefetch(usage: AiChatUsageSnapshot | null | undefined): boolean {
  if (!usage) return false
  return usage.user.reserved_tokens > 0 || usage.team.reserved_tokens > 0
}

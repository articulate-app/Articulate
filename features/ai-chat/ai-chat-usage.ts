import type { AiChatTokenUsageScope, AiChatUsageSnapshot } from "../../app/lib/ai/ai-chat-v2-types"
import { parseAiChatUsageSnapshot } from "../../app/lib/ai/ai-chat-usage-parse"

export const AI_CHAT_THREAD_USAGE_QUERY_KEY = "ai-chat-thread-usage"

export const TOKEN_LIMIT_EXCEEDED_CODES = new Set([
  "user_token_limit_exceeded",
  "team_token_limit_exceeded",
])

export const TOKEN_LIMIT_WOULD_EXCEED_CODES = new Set([
  "user_token_limit_would_be_exceeded",
  "team_token_limit_would_be_exceeded",
])

const KNOWN_RUN_FAILURE_MESSAGES: Record<string, string> = {
  user_token_limit_exceeded: "You have reached your daily AI token limit.",
  team_token_limit_exceeded: "Your team has reached its daily AI token limit.",
  user_token_limit_would_be_exceeded: "This request would exceed your remaining daily AI token allowance.",
  team_token_limit_would_be_exceeded:
    "This request would exceed the team's remaining daily AI token allowance.",
  component_edit_plan_invalid: "The AI could not produce a safe edit plan. No changes were saved.",
  component_busy: "This component is being updated. Retry in a moment.",
  component_save_timeout: "Saving took too long and no overwrite was confirmed.",
  component_revision_conflict:
    "The component was edited while the AI preview was open. Reload the live version or compare with the preview.",
  deadline_exceeded: "The AI request timed out before it could finish.",
  external_source_unavailable:
    "The source could not be read. Upload the file, paste the relevant text, or provide a public URL. No changes were saved.",
  token_accounting_unavailable:
    "Token usage could not be verified right now. Please try again in a moment.",
  orchestrated_build_start_failed:
    "The full build could not be started. No build progress is available for this request.",
  provider_timeout: "The AI provider timed out. You can retry when ready.",
}

export type RunFailurePrimaryAction = "retry" | "reconcile"

export function resolveRunFailurePrimaryAction(
  code: string | null | undefined,
): RunFailurePrimaryAction | null {
  const normalized = code?.trim() ?? ""
  if (!normalized) return null
  if (normalized === "component_busy") return "retry"
  if (normalized === "component_save_timeout" || normalized === "deadline_exceeded") {
    return "reconcile"
  }
  if (normalized === "component_revision_conflict") return null
  return null
}

export function shouldOfferRunFailureRetry(code: string | null | undefined): boolean {
  const normalized = code?.trim() ?? ""
  return (
    normalized === "component_busy"
    || normalized === "component_save_timeout"
    || normalized === "deadline_exceeded"
  )
}

export function shouldOfferRunFailureReconcile(code: string | null | undefined): boolean {
  const normalized = code?.trim() ?? ""
  return normalized === "component_save_timeout" || normalized === "deadline_exceeded"
}

export function formatCompactTokenCount(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}k`
  return String(Math.round(value))
}

export function formatExactTokenCount(value: number): string {
  return new Intl.NumberFormat().format(Math.round(value))
}

export type AiChatUsageScopeKey = "user" | "team"

export function pickStricterUsageScope(
  usage: AiChatUsageSnapshot | null | undefined,
): { key: AiChatUsageScopeKey; scope: AiChatTokenUsageScope } | null {
  if (!usage) return null
  const candidates: Array<{ key: AiChatUsageScopeKey; scope: AiChatTokenUsageScope }> = [
    { key: "user", scope: usage.user },
    { key: "team", scope: usage.team },
  ]
  const withLimit = candidates.filter((entry) => entry.scope.limit_tokens != null)
  if (withLimit.length === 0) {
    return candidates[0] ?? null
  }
  return withLimit.reduce((strictest, current) => {
    const strictPct = strictest.scope.percent_used ?? 0
    const currentPct = current.scope.percent_used ?? 0
    return currentPct > strictPct ? current : strictest
  })
}

export function hasConfiguredTokenLimit(scope: AiChatTokenUsageScope): boolean {
  return scope.limit_tokens != null && scope.limit_tokens > 0
}

export function isUsageSendBlocked(usage: AiChatUsageSnapshot | null | undefined): boolean {
  if (!usage) return false
  return usage.user.maxed_out || usage.team.maxed_out
}

export function isTokenLimitExceededCode(code: string | null | undefined): boolean {
  if (!code) return false
  return TOKEN_LIMIT_EXCEEDED_CODES.has(code)
}

export function isTokenLimitWouldExceedCode(code: string | null | undefined): boolean {
  if (!code) return false
  return TOKEN_LIMIT_WOULD_EXCEED_CODES.has(code)
}

export function resolveRunFailureMessage(args: {
  code?: string | null
  backendMessage?: string | null
}): string {
  const code = args.code?.trim() ?? ""
  if (code && KNOWN_RUN_FAILURE_MESSAGES[code]) {
    return KNOWN_RUN_FAILURE_MESSAGES[code]
  }
  const backendMessage = args.backendMessage?.trim()
  if (backendMessage) return backendMessage
  if (code) return `The AI request could not be completed (${code}).`
  return "The AI request could not be completed."
}

export function formatUsageResetTime(
  resetsAt: string | null | undefined,
  timezone: string | null | undefined,
): string | null {
  if (!resetsAt) return null
  const date = new Date(resetsAt)
  if (Number.isNaN(date.getTime())) return null
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
      timeZone: timezone ?? undefined,
    }).format(date)
  } catch {
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }).format(date)
  }
}

export function buildUsageWarningCopy(scope: AiChatTokenUsageScope): string | null {
  if (!hasConfiguredTokenLimit(scope)) return null
  const percent = scope.projected_warning
    ? scope.projected_percent ?? scope.percent_used
    : scope.percent_used
  if (percent == null) return null
  if (!scope.warning && !scope.projected_warning) return null
  const rounded = Math.round(percent)
  return `You have used ${rounded}% of today's AI allowance.`
}

export { usageNeedsPostTerminalRefetch } from "../../app/lib/ai/ai-chat-usage-parse"

export function parseAiChatErrorPayload(raw: unknown): {
  code: string | null
  message: string | null
  retryable: boolean
  usage: AiChatUsageSnapshot | null
} {
  if (!raw) {
    return { code: null, message: null, retryable: false, usage: null }
  }
  let record: Record<string, unknown>
  if (typeof raw === "string") {
    try {
      record = JSON.parse(raw) as Record<string, unknown>
    } catch {
      return { code: null, message: raw.trim() || null, retryable: false, usage: null }
    }
  } else if (typeof raw === "object") {
    record = raw as Record<string, unknown>
  } else {
    return { code: null, message: null, retryable: false, usage: null }
  }
  const nestedError =
    record.error && typeof record.error === "object" ? (record.error as Record<string, unknown>) : null
  const code =
    (typeof record.code === "string" ? record.code : null)
    ?? (nestedError && typeof nestedError.code === "string" ? nestedError.code : null)
  const message =
    (typeof record.message === "string" ? record.message : null)
    ?? (nestedError && typeof nestedError.message === "string" ? nestedError.message : null)
  const retryable = record.retryable === true || nestedError?.retryable === true
  const usage = parseAiChatUsageSnapshot(record.usage)
  return { code, message, retryable, usage }
}

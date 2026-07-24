import {
  isTokenLimitExceededCode,
  isTokenLimitWouldExceedCode,
  resolveRunFailureMessage,
} from "./ai-chat-usage"

const BUILD_UNIT_FAILURE_MESSAGES: Record<string, string> = {
  component_revision_conflict:
    "This task had a newer edit, so the generated change was not saved.",
  provider_timeout: "The AI provider timed out while working on this task.",
  user_token_limit_exceeded: "You have reached your daily AI token limit.",
  team_token_limit_exceeded: "Your team has reached its daily AI token limit.",
  user_token_limit_would_be_exceeded:
    "This task would exceed your remaining daily AI token allowance.",
  team_token_limit_would_be_exceeded:
    "This task would exceed the team's remaining daily AI token allowance.",
}

/** Concise user-facing copy for build/unit failures. Never surfaces lease or provider raw dumps. */
export function resolveOrchestratedBuildErrorMessage(args: {
  code?: string | null
  backendMessage?: string | null
}): string {
  const code = args.code?.trim() ?? ""
  if (code && BUILD_UNIT_FAILURE_MESSAGES[code]) {
    return BUILD_UNIT_FAILURE_MESSAGES[code]
  }
  if (isTokenLimitExceededCode(code) || isTokenLimitWouldExceedCode(code)) {
    return resolveRunFailureMessage({ code, backendMessage: args.backendMessage })
  }
  if (code === "component_revision_conflict") {
    return BUILD_UNIT_FAILURE_MESSAGES.component_revision_conflict
  }
  const backendMessage = args.backendMessage?.trim()
  if (backendMessage && !looksLikeInternalErrorDump(backendMessage)) {
    return backendMessage
  }
  if (code) return `This task could not be completed (${code}).`
  return "This task could not be completed."
}

function looksLikeInternalErrorDump(message: string): boolean {
  return (
    /lease[_-]?token/i.test(message)
    || /reservation[_-]?id/i.test(message)
    || /stack trace/i.test(message)
    || /openai|anthropic|provider_request/i.test(message)
  )
}

export type WorkUnitFailureItem = {
  /** Stable key: `${buildId}:${unitId ?? "build"}:${logicalErrorCode}`. */
  key: string
  code: string | null
  message: string
  title: string | null
  source: "unit" | "item" | "build" | "repair"
}

const GENERIC_BUILD_FAILURE_CODES = new Set([
  "orchestrated_build_failed",
  "build_failed",
  "work_unit_failed",
  "failed",
])

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function toTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null
}

function normalizeFailureCode(code: string | null | undefined, message: string | null | undefined): string {
  const trimmedCode = code?.trim() || ""
  if (trimmedCode) return trimmedCode.toLowerCase()
  const trimmedMessage = message?.trim() || ""
  if (!trimmedMessage) return "unknown"
  // Collapse identical free-text failures without a code into one bucket.
  return `msg:${trimmedMessage.toLowerCase().slice(0, 160)}`
}

export function workUnitFailureKey(args: {
  buildId: string
  unitId?: string | null
  logicalErrorCode: string
}): string {
  return `${args.buildId}:${args.unitId ?? "build"}:${args.logicalErrorCode}`
}

/**
 * Deduplicate durable build failures by `build_id + unit_id + logical failure code`.
 * Prefer worker-specific item errors over generic unit/build failure codes.
 * Returns at most one primary failure per logical code for the unit.
 *
 * Groups repair_finished (failed) + work_unit.failed + build.failed that share a logical code.
 */
export function dedupeWorkUnitFailures(args: {
  buildId: string
  unitId?: string | null
  unitErrorCode?: string | null
  unitErrorMessage?: string | null
  itemFailures?: Array<{
    component_id?: string | null
    title?: string | null
    error?: string | null
    error_code?: string | null
    code?: string | null
  }> | null
  buildErrorCode?: string | null
  buildErrorMessage?: string | null
  repairErrorCode?: string | null
  repairErrorMessage?: string | null
}): WorkUnitFailureItem[] {
  const byCode = new Map<string, WorkUnitFailureItem>()
  const unitKey = args.unitId ?? "build"

  const upsert = (item: WorkUnitFailureItem, preferOverGeneric: boolean) => {
    const existing = byCode.get(item.key)
    if (!existing) {
      byCode.set(item.key, item)
      return
    }
    const existingIsGeneric =
      existing.source !== "item"
      && (!existing.code || GENERIC_BUILD_FAILURE_CODES.has(existing.code.toLowerCase()))
    const incomingIsSpecific =
      item.source === "item"
      || (item.code != null && !GENERIC_BUILD_FAILURE_CODES.has(item.code.toLowerCase()))
    if (preferOverGeneric && existingIsGeneric && incomingIsSpecific) {
      byCode.set(item.key, item)
      return
    }
    // Prefer item/repair detail over generic unit/build when codes already match.
    const sourceRank = (source: WorkUnitFailureItem["source"]) => {
      if (source === "item") return 3
      if (source === "repair") return 2
      if (source === "unit") return 1
      return 0
    }
    if (sourceRank(item.source) > sourceRank(existing.source)) {
      byCode.set(item.key, item)
    }
  }

  for (const item of args.itemFailures ?? []) {
    const code = item.error_code ?? item.code ?? null
    const message = resolveOrchestratedBuildErrorMessage({
      code,
      backendMessage: item.error,
    })
    const logical = normalizeFailureCode(code, item.error ?? message)
    upsert(
      {
        key: workUnitFailureKey({
          buildId: args.buildId,
          unitId: unitKey,
          logicalErrorCode: logical,
        }),
        code: code?.trim() || null,
        message,
        title: item.title?.trim() || null,
        source: "item",
      },
      true,
    )
  }

  if (args.repairErrorCode || args.repairErrorMessage) {
    const message = resolveOrchestratedBuildErrorMessage({
      code: args.repairErrorCode,
      backendMessage: args.repairErrorMessage,
    })
    const logical = normalizeFailureCode(args.repairErrorCode, args.repairErrorMessage ?? message)
    upsert(
      {
        key: workUnitFailureKey({
          buildId: args.buildId,
          unitId: unitKey,
          logicalErrorCode: logical,
        }),
        code: args.repairErrorCode?.trim() || null,
        message,
        title: null,
        source: "repair",
      },
      true,
    )
  }

  if (args.unitErrorCode || args.unitErrorMessage) {
    const message = resolveOrchestratedBuildErrorMessage({
      code: args.unitErrorCode,
      backendMessage: args.unitErrorMessage,
    })
    const logical = normalizeFailureCode(args.unitErrorCode, args.unitErrorMessage ?? message)
    upsert(
      {
        key: workUnitFailureKey({
          buildId: args.buildId,
          unitId: unitKey,
          logicalErrorCode: logical,
        }),
        code: args.unitErrorCode?.trim() || null,
        message,
        title: null,
        source: "unit",
      },
      false,
    )
  }

  if (byCode.size === 0 && (args.buildErrorCode || args.buildErrorMessage)) {
    const message = resolveOrchestratedBuildErrorMessage({
      code: args.buildErrorCode,
      backendMessage: args.buildErrorMessage,
    })
    const logical = normalizeFailureCode(args.buildErrorCode, args.buildErrorMessage ?? message)
    upsert(
      {
        key: workUnitFailureKey({
          buildId: args.buildId,
          unitId: unitKey,
          logicalErrorCode: logical,
        }),
        code: args.buildErrorCode?.trim() || null,
        message,
        title: null,
        source: "build",
      },
      false,
    )
  }

  // When specific item/repair failures exist, drop generic unit/build cards with the same unit key.
  const values = Array.from(byCode.values())
  const hasSpecific = values.some(
    (row) =>
      row.source === "item"
      || row.source === "repair"
      || (row.code != null && !GENERIC_BUILD_FAILURE_CODES.has(row.code.toLowerCase())),
  )
  if (hasSpecific) {
    return values.filter((row) => {
      if (row.source === "item" || row.source === "repair") return true
      if (row.code && !GENERIC_BUILD_FAILURE_CODES.has(row.code.toLowerCase())) return true
      return false
    })
  }

  return values
}

export type AggregatedValidationIssue = {
  code: string
  count: number
  message: string
  componentTitles: string[]
}

const VALIDATION_ISSUE_COPY: Record<string, (count: number) => string> = {
  required_component_omitted: (count) =>
    `${count} required component${count === 1 ? " was" : "s were"} omitted`,
  required_components_omitted: (count) =>
    `${count} required component${count === 1 ? " was" : "s were"} omitted`,
  already_inactive_redundant_deactivation: (count) =>
    `${count} already-inactive component${count === 1 ? " was" : "s were"} redundantly marked for deactivation`,
  redundant_inactive_deactivation: (count) =>
    `${count} already-inactive component${count === 1 ? " was" : "s were"} redundantly marked for deactivation`,
  inactive_component_redundant_deactivation: (count) =>
    `${count} already-inactive component${count === 1 ? " was" : "s were"} redundantly marked for deactivation`,
}

function humanizeIssueCode(code: string): string {
  return code.replace(/_/g, " ")
}

/**
 * Aggregate validation issue rows by code with exact counts and named components.
 * UI shows the first five titles plus an “N more” expander.
 */
export function aggregateValidationIssues(issues: unknown): AggregatedValidationIssue[] {
  if (!Array.isArray(issues) || issues.length === 0) return []

  const byCode = new Map<string, { titles: string[]; count: number; messages: string[] }>()

  const bump = (code: string, title: string | null, message: string | null, count = 1) => {
    const bucket = byCode.get(code) ?? { titles: [], count: 0, messages: [] }
    bucket.count += count
    if (title && !bucket.titles.some((existing) => existing.toLowerCase() === title.toLowerCase())) {
      bucket.titles.push(title)
    }
    if (message) bucket.messages.push(message)
    byCode.set(code, bucket)
  }

  for (const row of issues) {
    if (typeof row === "string" && row.trim()) {
      bump(`msg:${row.trim().toLowerCase().slice(0, 80)}`, null, row.trim(), 1)
      continue
    }
    const record = asRecord(row)
    if (!record) continue
    const code =
      toTrimmedString(record.code)
      ?? toTrimmedString(record.issue_code)
      ?? toTrimmedString(record.error_code)
      ?? "unknown"
    const title =
      toTrimmedString(record.component_title)
      ?? toTrimmedString(record.title)
      ?? toTrimmedString(record.name)
      ?? toTrimmedString(record.component_name)
    const message =
      toTrimmedString(record.message)
      ?? toTrimmedString(record.issue)
      ?? toTrimmedString(record.error)
      ?? toTrimmedString(record.reason)
    const explicitCount =
      typeof record.count === "number" && Number.isFinite(record.count)
        ? Math.max(1, Math.floor(record.count))
        : 1
    bump(code, title, message, explicitCount)
  }

  const out: AggregatedValidationIssue[] = []
  for (const [code, bucket] of byCode) {
    const count = Math.max(bucket.count, bucket.titles.length, 1)
    const copyFn = VALIDATION_ISSUE_COPY[code]
    const message = copyFn
      ? copyFn(count)
      : code.startsWith("msg:")
        ? (bucket.messages[0] ?? "Validation issue")
        : `${count} ${humanizeIssueCode(code)}`
    out.push({
      code,
      count,
      message,
      componentTitles: bucket.titles,
    })
  }
  return out
}

import type { ToastActionElement } from "@/components/ui/toast"

export type PlannerResultCode =
  | "SUCCESS"
  | "NO_SLOTS"
  | "NO_UPDATES"
  | "VALIDATOR_ALL_REJECTED"
  | "PLAN_MODE_MANUAL"
  | "ALREADY_RUNNING"
  | "ERROR"

export type PlannerActivityAction =
  | "planner_run_completed"
  | "planner_run_noop"
  | "planner_run_skipped"
  | "planner_run_error"

export type PlannerRunResult = {
  ok: boolean
  result_code: PlannerResultCode | (string & {}) | null
  run_id?: number | string | null
  updated?: number | null
  rejected_by_validator?: boolean | null
  error?: string | null
  error_message?: string | null
  message?: string | null
  // edge function may include extra fields; keep them around for detail rendering
  [k: string]: unknown
}

export type PlannerToastPayload = {
  variant?: "default" | "destructive"
  title: string
  description?: string
  action?: ToastActionElement
}

export function safeJsonParseDetails(detailsText: string): unknown | null {
  try {
    return JSON.parse(detailsText)
  } catch {
    return null
  }
}

function shortErrorText(err: unknown): string {
  if (!err) return "Unknown error"
  if (typeof err === "string") return err.slice(0, 160)
  if (typeof err === "object") {
    const msg =
      typeof (err as any).message === "string"
        ? (err as any).message
        : typeof (err as any).error_message === "string"
          ? (err as any).error_message
          : typeof (err as any).error === "string"
            ? (err as any).error
            : null
    if (msg) return msg.slice(0, 160)
  }
  return String(err).slice(0, 160)
}

export function plannerToastFor(result: PlannerRunResult, opts?: { action?: ToastActionElement }): PlannerToastPayload {
  const updated = typeof result.updated === "number" && Number.isFinite(result.updated) ? result.updated : null
  const code = result.result_code ?? (result.ok ? "SUCCESS" : "ERROR")

  // Hard failure path
  if (!result.ok || code === "ERROR") {
    const err = result.error_message ?? result.error ?? result.message
    return {
      variant: "destructive",
      title: "Planner failed",
      description: `Planner failed: ${shortErrorText(err)}`,
      action: opts?.action,
    }
  }

  switch (code) {
    case "SUCCESS": {
      if (updated != null && updated > 0) {
        return {
          title: `Generated ${updated} suggestion${updated === 1 ? "" : "s"}`,
          description: "Suggestions appear in the Tasks planner.",
          action: opts?.action,
        }
      }
      return {
        title: "Planner ran successfully",
        description: "Nothing new to suggest.",
        action: opts?.action,
      }
    }
    case "NO_SLOTS":
      return {
        title: "Nothing to plan",
        description: "No planning slots found for this horizon.",
        action: opts?.action,
      }
    case "VALIDATOR_ALL_REJECTED":
      return {
        title: "No new ideas",
        description: "Suggestions were too similar to existing content.",
        action: opts?.action,
      }
    case "NO_UPDATES":
      return {
        title: "Nothing new to suggest",
        description: "Suggestions appear in the Tasks planner.",
        action: opts?.action,
      }
    case "ALREADY_RUNNING":
      return {
        title: "Planner already running",
        description: "A planner run is already in progress for this project.",
        action: opts?.action,
      }
    case "PLAN_MODE_MANUAL":
      return {
        title: "Planner disabled",
        description: "Enable plan mode to generate suggestions.",
        action: opts?.action,
      }
    default:
      return {
        title: "Planner ran",
        description: "Suggestions appear in the Tasks planner.",
        action: opts?.action,
      }
  }
}

export function isPlannerActivity(activity: { type?: string | null; action?: string | null }): boolean {
  const t = activity.type ?? null
  const a = activity.action ?? null
  if (t === "planner") return true
  if (typeof a === "string" && a.startsWith("planner_")) return true
  return false
}

export function plannerActivityTitleFor(args: {
  action: string | null
  details: unknown | null
  rawDetailsText: string | null
}): string {
  const action = args.action ?? "planner"
  const obj = (args.details && typeof args.details === "object" ? (args.details as any) : null) as any
  const code = typeof obj?.result_code === "string" ? obj.result_code : null
  const updated = typeof obj?.updated === "number" ? obj.updated : null

  if (action === "planner_run_error" || code === "ERROR") return "Planner failed"
  if (code === "ALREADY_RUNNING") return "Planner already running"
  if (code === "NO_SLOTS") return "No planning slots"
  if (code === "VALIDATOR_ALL_REJECTED") return "No new ideas"
  if (code === "NO_UPDATES") return "Nothing new to suggest"
  if (code === "SUCCESS" && updated != null && updated > 0) {
    return `Generated ${updated} suggestion${updated === 1 ? "" : "s"}`
  }
  if (action === "planner_run_skipped") return "Planner skipped"
  if (action === "planner_run_noop") return "Planner: no changes"
  if (action === "planner_run_completed") return "Planner completed"
  return "Planner event"
}



import type { PublicationErrorCode, PublicationRunStatus } from "./types.ts"
import { POST_PUBLISH_STATUSES, TERMINAL_PUBLICATION_STATUSES } from "./types.ts"

const ALLOWED_TRANSITIONS: Record<PublicationRunStatus, PublicationRunStatus[]> = {
  // Waiting for internal cron or parked after successful external native schedule.
  scheduled: ["queued", "starting", "running", "needs_user", "cancelled", "failed"],
  queued: ["starting", "cancelled", "failed", "scheduled"],
  starting: ["running", "needs_user", "failed", "cancelled", "scheduled"],
  running: [
    "needs_user",
    "awaiting_publish_confirmation",
    "publishing",
    "verifying",
    "published",
    "scheduled",
    "failed",
    "cancelled",
    "uncertain",
  ],
  // Human intervention is not failure; allow repeated handoffs and resume.
  needs_user: ["running", "starting", "awaiting_publish_confirmation", "scheduled", "cancelled", "failed"],
  awaiting_publish_confirmation: ["publishing", "scheduled", "needs_user", "cancelled", "failed"],
  publishing: ["verifying", "published", "scheduled", "uncertain", "failed", "cancelled"],
  verifying: ["published", "scheduled", "uncertain", "failed"],
  published: [],
  failed: [],
  cancelled: [],
  uncertain: [],
}
export function isTerminalPublicationStatus(status: PublicationRunStatus): boolean {
  return TERMINAL_PUBLICATION_STATUSES.includes(status)
}

export function isPostPublishStatus(status: PublicationRunStatus): boolean {
  return POST_PUBLISH_STATUSES.includes(status)
}

export function canTransitionPublicationStatus(
  from: PublicationRunStatus,
  to: PublicationRunStatus,
): boolean {
  if (from === to) return true
  return (ALLOWED_TRANSITIONS[from] ?? []).includes(to)
}

export function assertTransition(
  from: PublicationRunStatus,
  to: PublicationRunStatus,
): void {
  if (!canTransitionPublicationStatus(from, to)) {
    throw new Error(`Invalid publication status transition: ${from} → ${to}`)
  }
}

/**
 * After the final publish action may have executed, never auto-retry publish.
 * Only success or uncertain are allowed as post-publish outcomes from publishing/verifying.
 */
export function resolvePostPublishOutcome(args: {
  currentStatus: PublicationRunStatus
  phase: "published" | "uncertain" | "failed" | string
  errorCode?: PublicationErrorCode | string | null
}): { status: PublicationRunStatus; errorCode: PublicationErrorCode | null; allowRetryPublish: boolean } {
  const { currentStatus, phase } = args

  if (phase === "published") {
    return { status: "published", errorCode: null, allowRetryPublish: false }
  }
  if (phase === "uncertain") {
    return { status: "uncertain", errorCode: "uncertain", allowRetryPublish: false }
  }

  // If we already entered publishing/verifying, a failed verification must not
  // invite automatic republish — surface uncertain when the action may have run.
  if (currentStatus === "publishing" || currentStatus === "verifying") {
    if (phase === "failed" && args.errorCode === "verification_failed") {
      return { status: "uncertain", errorCode: "uncertain", allowRetryPublish: false }
    }
    if (phase === "failed") {
      return {
        status: "failed",
        errorCode: (args.errorCode as PublicationErrorCode) ?? "publication_failed",
        allowRetryPublish: false,
      }
    }
  }

  return {
    status: "failed",
    errorCode: (args.errorCode as PublicationErrorCode) ?? "agent_failed",
    allowRetryPublish: !isPostPublishStatus(currentStatus) && currentStatus !== "publishing",
  }
}

export function mapAgentPhaseToStatus(
  phase: string,
  currentStatus: PublicationRunStatus,
): PublicationRunStatus {
  switch (phase) {
    case "needs_user":
      return "needs_user"
    case "awaiting_publish_confirmation":
      return "awaiting_publish_confirmation"
    case "scheduled":
      return "scheduled"
    case "published":
      return "published"
    case "uncertain":
      return "uncertain"
    case "failed":
      return currentStatus === "publishing" || currentStatus === "verifying" ? "failed" : "failed"
    default:
      return currentStatus === "queued" || currentStatus === "starting" ? "running" : currentStatus
  }
}

export function userFacingErrorMessage(code: PublicationErrorCode | string | null | undefined, fallback?: string | null): string {
  switch (code) {
    case "authentication_required":
      return "The website requires sign-in. Take control of the browser to continue."
    case "permission_denied":
      return "You do not have permission to publish on this website."
    case "website_unreachable":
      return "The destination website could not be reached."
    case "agent_failed":
      return "The publishing agent failed before completing the task."
    case "upload_failed":
      return "A required file could not be uploaded to the publishing browser."
    case "publication_failed":
      return "Publication failed on the destination website."
    case "verification_failed":
      return "Publication could not be verified. Inspect the browser before trying again."
    case "session_expired":
      return "The remote browser session expired. Reconnect the destination and try again."
    case "cancelled":
      return "Publication was cancelled."
    case "uncertain":
      return "Publication may have succeeded, but it could not be verified. Do not publish again until you inspect the destination."
    case "provider_not_configured":
      return "Browser publishing is not configured for this environment."
    case "cloud_browser_unavailable":
      return (
        fallback?.trim() ||
        "Cloud browser unavailable. The local browser is unavailable and the Cloud browser currently has no credits or is not configured."
      )
    case "local_bridge_unavailable":
      return (
        fallback?.trim() ||
        "Local browser is unavailable. Start the Articulate Browser Bridge, or use Cloud browser."
      )
    default:
      return fallback?.trim() || "Publication failed."
  }
}

/** Detect Browser Use credit / billing / missing-config failures from provider errors. */
export function isCloudBrowserUnavailableError(error: unknown): boolean {
  if (!error) return false
  const status =
    typeof (error as { status?: unknown }).status === "number"
      ? (error as { status: number }).status
      : undefined
  const code = String((error as { code?: unknown }).code ?? "").toLowerCase()
  const message = String((error as { message?: unknown }).message ?? "").toLowerCase()
  if (code === "provider_not_configured" || code === "cloud_browser_unavailable") return true
  if (status === 402) return true
  if (status === 403 && /credit|billing|payment|quota|plan|upgrade/i.test(message)) return true
  return /no credits?|insufficient credits?|out of credits?|payment required|billing|quota exceeded|free plan|upgrade your plan|api key.*(missing|invalid|not configured)/i.test(
    message,
  )
}

export function cloudBrowserUnavailableMessage(options?: {
  localTried?: boolean
  detail?: string | null
}): string {
  if (options?.localTried) {
    return "The local browser is unavailable and the Cloud browser currently has no credits or is not configured."
  }
  const detail = options?.detail?.trim()
  if (detail && !detail.startsWith("{") && detail.length < 220) {
    return `Cloud browser unavailable. ${detail}`
  }
  return "Cloud browser unavailable. Check Browser Use credits and configuration, or use the local browser."
}

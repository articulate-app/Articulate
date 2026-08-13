export type PublishingDestinationStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "needs_login"
  | "error"

export type PublicationRunStatus =
  | "scheduled"
  | "queued"
  | "starting"
  | "running"
  | "needs_user"
  | "awaiting_publish_confirmation"
  | "publishing"
  | "verifying"
  | "published"
  | "failed"
  | "cancelled"
  | "uncertain"

export type PublicationErrorCode =
  | "authentication_required"
  | "permission_denied"
  | "website_unreachable"
  | "agent_failed"
  | "upload_failed"
  | "publication_failed"
  | "verification_failed"
  | "session_expired"
  | "cancelled"
  | "uncertain"
  | "provider_not_configured"
  | "cloud_browser_unavailable"
  | "local_bridge_unavailable"
  | "invalid_request"
  | "not_found"
  | "forbidden"

export type PublishingMedia = {
  id?: string
  type: "image" | "video" | "pdf" | "file"
  name?: string
  url?: string
  localPath?: string
  mimeType?: string
  purpose?: string
  attachmentId?: string
}

export type PublishingArtifact = {
  id: string
  type: string
  title?: string
  content?: string
  excerpt?: string
  slug?: string
  seo?: {
    title?: string
    description?: string
  }
  media?: PublishingMedia[]
  metadata?: Record<string, unknown>
}

export type AgentPublicationPhase =
  | "needs_user"
  | "awaiting_publish_confirmation"
  | "scheduled"
  | "published"
  | "failed"
  | "uncertain"

export type AgentPublicationResult = {
  phase: AgentPublicationPhase
  message?: string
  external_url?: string | null
  external_id?: string | null
  /** Editor/collection URL reached during preparation, when known. */
  entry_url?: string | null
  /** Suggested/used schedule strategy when publish_mode=scheduled. */
  schedule_strategy?: "external" | "internal" | null
  error_code?: PublicationErrorCode | string | null
  activity?: string[]
}

export type PublicationActivityEvent = {
  id: string
  label: string
  at: string
}

export const TERMINAL_PUBLICATION_STATUSES: PublicationRunStatus[] = [
  "published",
  "failed",
  "cancelled",
  "uncertain",
]

export const POST_PUBLISH_STATUSES: PublicationRunStatus[] = ["published", "uncertain"]

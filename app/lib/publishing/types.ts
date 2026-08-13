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

export type PublishMode = "now" | "scheduled"
export type ScheduleStrategy = "external" | "internal"

export type PublishingDestinationEntryPoints = {
  article?: string | null
  newsletter?: string | null
  social_post?: string | null
  landing_page?: string | null
  other?: string | null
}

export type PublishingDestinationMemory = {
  entry_points?: PublishingDestinationEntryPoints
  guidance?: string
  last_successful_entry_url?: string
  last_successful_publication_url?: string
  last_learned_content_type?: string
  updated_at?: string
}

export type PublishingDestination = {
  id: string
  project_id: number | null
  name: string
  start_url: string
  provider: string
  status: PublishingDestinationStatus
  created_by?: number | null
  created_at?: string | null
  updated_at?: string | null
  last_connected_at?: string | null
  last_verified_at?: string | null
  has_profile?: boolean
  memory?: PublishingDestinationMemory
  metadata?: {
    last_error?: string | null
    connect_message?: string | null
    connect_live_view_url?: string | null
    /** Durable Browser Use residential proxy region (ISO-3166 alpha-2), or null to disable. */
    browser_region?: string | null
    proxy_country_code?: string | null
  }
}

export type PublicationActivityEvent = {
  id: string
  label: string
  at: string
}

export type PublicationRun = {
  id: string
  project_id: number | null
  artifact_id: string | null
  source_type?: "artifact" | "inline"
  source_snapshot?: Record<string, unknown> | null
  destination_id: string
  started_by?: number | null
  provider: string
  status: PublicationRunStatus
  publish_mode?: PublishMode | string | null
  scheduled_at?: string | null
  schedule_timezone?: string | null
  schedule_strategy?: ScheduleStrategy | string | null
  scheduled_external_at?: string | null
  execution_started_at?: string | null
  scheduled_at_display?: string | null
  provider_run_id?: string | null
  provider_session_id?: string | null
  provider_workspace_id?: string | null
  live_view_url?: string | null
  external_url?: string | null
  external_id?: string | null
  started_at?: string | null
  completed_at?: string | null
  published_at?: string | null
  error_code?: string | null
  error_message?: string | null
  activity: PublicationActivityEvent[]
  result?: Record<string, unknown>
  metadata?: {
    user_has_control?: boolean
    phase_message?: string | null
    destination_name?: string | null
    artifact_title?: string | null
    final_publish_attempted?: boolean
    awaiting_destination_auth?: boolean
    user_question?: {
      kind?: string | null
      message?: string | null
      asked_at?: string | null
      auto_answered?: boolean
      auto_answer?: string | null
    } | null
    ai_thread_id?: string | null
    preferred_start_url?: string | null
    start_url_source?: string | null
    pending_schedule_strategy?: ScheduleStrategy | string | null
    stale_schedule?: boolean
    local_browser?: boolean
    local_agent_task?: string | null
    bridge_session_id?: string | null
    browser_provider_resolved?: string | null
    browser_provider_reason?: string | null
    schedule_wording?: "destination" | "articulate" | string | null
    local_confirm_pending?: boolean
    local_confirm_task?: string | null
  }
  created_at?: string | null
  updated_at?: string | null
}

export function publicationStatusLabel(status: PublicationRunStatus | string): string {
  switch (status) {
    case "scheduled":
      return "Scheduled"
    case "queued":
    case "starting":
      return "Starting…"
    case "running":
      return "Publishing…"
    case "needs_user":
      return "Needs attention"
    case "awaiting_publish_confirmation":
      return "Ready for confirmation"
    case "publishing":
      return "Publishing…"
    case "verifying":
      return "Publishing…"
    case "published":
      return "Published"
    case "failed":
      return "Failed"
    case "cancelled":
      return "Cancelled"
    case "uncertain":
      return "Uncertain"
    default:
      return status
  }
}

/** True when the run can still progress via a provider sync poll. */
export function shouldPollPublicationSync(run: {
  status?: string | null
  provider?: string | null
  provider_run_id?: string | null
  metadata?: {
    awaiting_destination_auth?: boolean | null
    local_browser?: boolean | null
  } | null
}): boolean {
  if (!run.status || !isActivePublicationStatus(run.status)) return false
  if (run.metadata?.awaiting_destination_auth) return false
  // Local Bridge runs are advanced by the client driver, not Cloud sync polling.
  if (run.provider === "browser_use_local" || run.metadata?.local_browser) return false
  // Without a provider run id there is nothing actionable to poll — sync once reconciles zombies.
  return Boolean(run.provider_run_id)
}

export function scheduleWordingLabel(run: {
  schedule_strategy?: string | null
  metadata?: {
    schedule_wording?: string | null
    destination_name?: string | null
  } | null
}): string {
  const wording = String(run.metadata?.schedule_wording ?? "").toLowerCase()
  const strategy = String(run.schedule_strategy ?? "").toLowerCase()
  const dest = run.metadata?.destination_name?.trim()
  if (wording === "destination" || strategy === "external") {
    return dest ? `Scheduled in ${dest}` : "Scheduled in destination"
  }
  if (wording === "articulate" || strategy === "internal") {
    return "Scheduled by Articulate"
  }
  return "Scheduled"
}

export function isActivePublicationStatus(status: PublicationRunStatus | string): boolean {
  return !["published", "failed", "cancelled", "uncertain"].includes(status)
}

export function isScheduledPublicationStatus(status: PublicationRunStatus | string): boolean {
  return status === "scheduled"
}

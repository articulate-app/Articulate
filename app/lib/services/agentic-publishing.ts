"use client"

import { getSupabaseBrowser } from "../../../lib/supabase-browser"
import { invokeEdgeFunctionFetch } from "../edge-functions"
import type { PublicationRun, PublishingDestination } from "../publishing/types"

type EdgeError = { code?: string; message?: string }

function edgeUrl() {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!base) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured")
  return `${base.replace(/\/$/, "")}/functions/v1/agentic-publishing`
}

async function invokePublishingAction<T>(body: Record<string, unknown>): Promise<T> {
  const supabase = getSupabaseBrowser()
  const response = await invokeEdgeFunctionFetch({
    supabase,
    url: edgeUrl(),
    init: {
      method: "POST",
      body: JSON.stringify(body),
    },
    headers: {
      "Content-Type": "application/json",
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    },
    debugLabel: `agentic-publishing:${String(body.action ?? "unknown")}`,
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload?.ok === false || payload?.error) {
    const error = (payload?.error ?? {}) as EdgeError
    throw new Error(error.message || `Publishing request failed (${response.status})`)
  }
  return payload as T
}

export async function listPublishingDestinations(args: {
  projectId?: number | null
  ownerScope?: boolean
}): Promise<PublishingDestination[]> {
  const data = await invokePublishingAction<{ destinations: PublishingDestination[] }>({
    action: "list_destinations",
    ...(args.projectId != null
      ? { project_id: args.projectId }
      : { owner_scope: true }),
  })
  return data.destinations ?? []
}

export async function createPublishingDestination(args: {
  projectId?: number | null
  name: string
  startUrl: string
}): Promise<PublishingDestination> {
  const data = await invokePublishingAction<{ destination: PublishingDestination }>({
    action: "create_destination",
    ...(args.projectId != null
      ? { project_id: args.projectId }
      : { owner_scope: true }),
    name: args.name,
    start_url: args.startUrl,
  })
  return data.destination
}

export async function configurePublishingDestination(args: {
  projectId?: number | null
  projectName?: string | null
  destinationId?: string | null
  name?: string | null
  serviceOrPlatform?: string | null
  startUrl?: string | null
  purpose?: string | null
  contentType?: string | null
  guidance?: string | null
  connect?: boolean
}): Promise<{
  destination: PublishingDestination
  created?: boolean
  reused_existing?: boolean
  connecting?: boolean
  needs_authentication?: boolean
  live_view_url?: string | null
  message?: string | null
}> {
  return invokePublishingAction({
    action: "configure_destination",
    ...(args.projectId != null ? { project_id: args.projectId } : {}),
    ...(args.projectName ? { project_name: args.projectName } : {}),
    ...(args.destinationId ? { destination_id: args.destinationId } : {}),
    ...(args.name ? { name: args.name } : {}),
    ...(args.serviceOrPlatform ? { service_or_platform: args.serviceOrPlatform } : {}),
    ...(args.startUrl ? { start_url: args.startUrl } : {}),
    ...(args.purpose ? { purpose: args.purpose } : {}),
    ...(args.contentType ? { content_type: args.contentType } : {}),
    ...(args.guidance != null ? { guidance: args.guidance } : {}),
    connect: args.connect !== false,
  })
}

export async function updatePublishingDestination(args: {
  destinationId: string
  name?: string
  startUrl?: string
  guidance?: string | null
  entryPoints?: {
    article?: string | null
    newsletter?: string | null
    social_post?: string | null
    landing_page?: string | null
    other?: string | null
  } | null
}): Promise<PublishingDestination> {
  const data = await invokePublishingAction<{ destination: PublishingDestination }>({
    action: "update_destination",
    destination_id: args.destinationId,
    ...(args.name != null ? { name: args.name } : {}),
    ...(args.startUrl != null ? { start_url: args.startUrl } : {}),
    ...(args.guidance !== undefined || args.entryPoints !== undefined
      ? {
          memory: {
            ...(args.guidance !== undefined ? { guidance: args.guidance } : {}),
            ...(args.entryPoints !== undefined ? { entry_points: args.entryPoints } : {}),
          },
        }
      : {}),
  })
  return data.destination
}

export async function removePublishingDestinationProfile(
  destinationId: string,
): Promise<PublishingDestination> {
  const data = await invokePublishingAction<{ destination: PublishingDestination }>({
    action: "remove_destination_profile",
    destination_id: destinationId,
  })
  return data.destination
}

export async function deletePublishingDestination(destinationId: string): Promise<void> {
  await invokePublishingAction({
    action: "delete_destination",
    destination_id: destinationId,
  })
}

export async function openStandaloneBrowser(args?: {
  startUrl?: string | null
  profileId?: string | null
  browserViewport?: { width: number; height: number } | null
  /** When true, skip Desktop even if available (force Cloud). */
  forceCloud?: boolean
  desktopAvailable?: boolean
}): Promise<{
  browser_id: string
  live_view_url: string | null
  start_url: string
  status?: string | null
  provider?: string | null
  browser_label?: string | null
  desktop_browser?: { required?: boolean; start_url?: string | null } | null
  /** @deprecated Local bridge is disconnected. */
  local_browser?: { required?: boolean; start_url?: string | null } | null
}> {
  const desktop =
    args?.desktopAvailable === undefined && !args?.forceCloud
      ? await desktopAvailabilityPayload()
      : {
          desktop_available: args?.desktopAvailable === true,
        }
  return invokePublishingAction({
    action: "open_browser",
    start_url: args?.startUrl ?? null,
    profile_id: args?.profileId ?? null,
    browser_viewport: args?.browserViewport ?? null,
    ...desktop,
    ...(args?.forceCloud ? { force_cloud: true } : {}),
  })
}

/** Stop active Browser Use browsers to free the free-plan 3-session limit. */
export async function cleanupBrowsers(): Promise<{
  active_before: number
  stopped_browser_ids: string[]
  cancelled_runs: number
}> {
  return invokePublishingAction({
    action: "cleanup_browsers",
  })
}

export async function alignBrowserViewport(args: {
  browserId?: string | null
  publicationRunId?: string | null
  browserViewport: { width: number; height: number }
}): Promise<{
  browser_id: string | null
  live_view_url: string | null
  resized: boolean
}> {
  return invokePublishingAction({
    action: "align_browser",
    browser_id: args.browserId ?? null,
    run_id: args.publicationRunId ?? null,
    browser_viewport: args.browserViewport,
  })
}

export type BrowserHistoryEntry = {
  id: number
  url: string
  title: string
}

export type BrowserControlResult = {
  active?: boolean
  browser_id: string | null
  url: string
  title: string
  can_go_back: boolean
  can_go_forward: boolean
  history: BrowserHistoryEntry[]
}

export async function controlBrowser(args: {
  browserId?: string | null
  publicationRunId?: string | null
  command: "status" | "navigate" | "back" | "forward" | "reload" | "history_entry"
  url?: string | null
  historyEntryId?: number | null
}): Promise<BrowserControlResult> {
  return invokePublishingAction({
    action: "control_browser",
    browser_id: args.browserId ?? null,
    run_id: args.publicationRunId ?? null,
    command: args.command,
    url: args.url ?? null,
    history_entry_id: args.historyEntryId ?? null,
  })
}

export async function completePublishingDestinationConnect(
  destinationId: string,
  args?: { publicationRunId?: string | null; userConfirmed?: boolean },
): Promise<{
  authenticated: boolean
  pending?: boolean
  message: string
  live_view_url: string | null
  connect_session_id?: string | null
  destination: PublishingDestination
  run?: PublicationRun | null
  resumed_publication?: boolean
}> {
  return invokePublishingAction({
    action: "complete_destination_connect",
    destination_id: destinationId,
    publication_run_id: args?.publicationRunId ?? null,
    user_confirmed: args?.userConfirmed === true,
  })
}

export type StartPublicationResult = {
  run: PublicationRun
  needs_authentication?: boolean
  live_view_url?: string | null
  connect_session_id?: string | null
  message?: string | null
  provider?: string | null
  browser_label?: "Desktop" | "Cloud" | "Local" | string | null
  desktop_browser?: {
    required?: boolean
    start_url?: string | null
    task?: string | null
    profile_id?: string | null
  } | null
  execution?: {
    type?: "desktop_browser" | string
    operation?: "prepare_publication" | "continue_publication" | "confirm_publication" | string
    status?: string | null
  } | null
  /** @deprecated Local Bridge disconnected — historical responses only. */
  local_browser?: {
    required?: boolean
    start_url?: string | null
    task?: string | null
    prepare_task?: string | null
    profile_id?: string | null
    bridge_session_id?: string | null
  } | null
  local_confirm?: {
    required?: boolean
    task?: string | null
  } | null
  diagnostics?: {
    new_browser_session?: boolean
    reused_connect_session?: boolean
    profile_loaded?: boolean
    profile_id_suffix?: string | null
    browser_region?: string | null
    proxy_country_code?: string | null
    pane_width?: number | null
    pane_height?: number | null
    requested_screen_width?: number | null
    requested_screen_height?: number | null
    record?: boolean
    timing_ms?: {
      run_create?: number | null
      browser_ready?: number | null
    }
  }
}

async function desktopAvailabilityPayload(): Promise<Record<string, unknown>> {
  try {
    const { getDesktopClientRuntimeContext } = await import("../articulate-desktop")
    const runtime = await getDesktopClientRuntimeContext()
    return {
      ...runtime,
      // Legacy fields always false — Local Bridge is disconnected from runtime.
      local_bridge_available: false,
      local_chrome_available: false,
    }
  } catch {
    return {
      client_runtime: "web",
      desktop_available: false,
      native_browser_available: false,
      desktop_browser_control: false,
      local_bridge_available: false,
      local_chrome_available: false,
    }
  }
}

export async function connectPublishingDestination(
  destinationId: string,
  args?: { browserViewport?: { width: number; height: number } | null },
): Promise<{
  destination: PublishingDestination
  live_view_url: string | null
  connect_session_id?: string | null
  connect_run_id?: string | null
}> {
  const desktop = await desktopAvailabilityPayload()
  return invokePublishingAction({
    action: "connect_destination",
    destination_id: destinationId,
    browser_viewport: args?.browserViewport ?? null,
    ...desktop,
  })
}

export async function startArtifactPublication(args: {
  artifactId: string
  destinationId: string
  browserViewport?: { width: number; height: number } | null
  /** Force Cloud even when Desktop is available. */
  forceCloud?: boolean
}): Promise<StartPublicationResult> {
  const desktop = await desktopAvailabilityPayload()
  return invokePublishingAction<StartPublicationResult>({
    action: "start_publication",
    artifact_id: args.artifactId,
    destination_id: args.destinationId,
    browser_viewport: args.browserViewport ?? null,
    ...desktop,
    ...(args.forceCloud ? { force_cloud: true } : {}),
  })
}

export async function startPublication(args: {
  artifactId?: string | null
  destinationId: string
  browserViewport?: { width: number; height: number } | null
  content?: {
    type?: string | null
    title?: string | null
    body?: string | null
    content?: string | null
    excerpt?: string | null
    seo?: { title?: string | null; description?: string | null } | null
    media?: Array<Record<string, unknown>> | null
  } | null
  publishMode?: "now" | "scheduled"
  scheduledAt?: string | null
  timezone?: string | null
  scheduleStrategy?: "external" | "internal" | null
  forceCloud?: boolean
}): Promise<StartPublicationResult> {
  const desktop = await desktopAvailabilityPayload()
  return invokePublishingAction<StartPublicationResult>({
    action: "start_publication",
    destination_id: args.destinationId,
    browser_viewport: args.browserViewport ?? null,
    ...desktop,
    ...(args.forceCloud ? { force_cloud: true } : {}),
    ...(args.artifactId ? { artifact_id: args.artifactId } : {}),
    ...(args.content ? { content: args.content } : {}),
    ...(args.publishMode ? { publish_mode: args.publishMode } : {}),
    ...(args.scheduledAt ? { scheduled_at: args.scheduledAt } : {}),
    ...(args.timezone ? { timezone: args.timezone } : {}),
    ...(args.scheduleStrategy ? { schedule_strategy: args.scheduleStrategy } : {}),
  })
}

export async function listScheduledPublications(args?: {
  projectId?: number | null
}): Promise<PublicationRun[]> {
  const data = await invokePublishingAction<{ runs: PublicationRun[] }>({
    action: "list_publications",
    scheduled_only: true,
    mine_only: true,
    ...(args?.projectId != null ? { project_id: args.projectId } : {}),
  })
  return data.runs ?? []
}

export async function listProjectPublications(args: {
  projectId: number
}): Promise<PublicationRun[]> {
  const data = await invokePublishingAction<{ runs: PublicationRun[] }>({
    action: "list_publications",
    project_id: args.projectId,
    mine_only: true,
  })
  return data.runs ?? []
}

export async function reschedulePublication(args: {
  runId: string
  scheduledAt: string
  timezone?: string | null
}): Promise<PublicationRun> {
  const data = await invokePublishingAction<{ run: PublicationRun }>({
    action: "reschedule_publication",
    run_id: args.runId,
    scheduled_at: args.scheduledAt,
    timezone: args.timezone ?? null,
  })
  return data.run
}

export async function publishScheduledNow(runId: string): Promise<PublicationRun> {
  const data = await invokePublishingAction<{ run: PublicationRun }>({
    action: "publish_scheduled_now",
    run_id: runId,
  })
  return data.run
}

export async function syncPublicationRun(runId: string): Promise<PublicationRun> {
  const data = await invokePublishingAction<{ run: PublicationRun }>({
    action: "sync_publication",
    run_id: runId,
  })
  return data.run
}

export async function getPublicationRun(runId: string): Promise<PublicationRun> {
  const data = await invokePublishingAction<{ run: PublicationRun }>({
    action: "get_publication",
    run_id: runId,
  })
  return data.run
}

export async function listArtifactPublications(artifactId: string): Promise<PublicationRun[]> {
  const data = await invokePublishingAction<{ runs: PublicationRun[] }>({
    action: "list_publications",
    artifact_id: artifactId,
  })
  return data.runs ?? []
}

export async function takePublicationControl(runId: string, message?: string): Promise<PublicationRun> {
  const data = await invokePublishingAction<{ run: PublicationRun }>({
    action: "take_control",
    run_id: runId,
    message,
  })
  return data.run
}

export async function continuePublicationAfterUser(runId: string, message?: string): Promise<PublicationRun> {
  const data = await invokePublishingAction<{ run: PublicationRun }>({
    action: "continue_after_user",
    run_id: runId,
    message,
  })
  return data.run
}

export async function confirmPublication(runId: string): Promise<
  PublicationRun & {
    local_confirm?: { required?: boolean; task?: string | null } | null
  }
> {
  const data = await invokePublishingAction<{
    run: PublicationRun
    local_confirm?: { required?: boolean; task?: string | null } | null
  }>({
    action: "confirm_publication",
    run_id: runId,
  })
  return {
    ...data.run,
    local_confirm: data.local_confirm ?? null,
  }
}

export async function cancelPublication(runId: string): Promise<PublicationRun> {
  const data = await invokePublishingAction<{ run: PublicationRun }>({
    action: "cancel_publication",
    run_id: runId,
  })
  return data.run
}

/** Articulate AI publication reasoning step — not a second browser agent. */
export async function requestPublicationReasonStep(input: {
  task: string
  state: {
    url: string
    title?: string
    note?: string
    text?: string
    elements?: Array<Record<string, unknown>>
  }
  history?: Array<{ thought?: string; action?: unknown; result?: string }>
  step?: number
  entryUrl?: string | null
  allowFinalPublish?: boolean
}): Promise<{
  thought?: string
  status: "continue" | "needs_user" | "done" | "failed"
  action: unknown
  actions: unknown[]
  message?: string
  publication_phase?: string | null
  external_url?: string | null
  external_id?: string | null
  schedule_strategy?: "external" | "internal" | null
}> {
  return invokePublishingAction({
    action: "publication_reason_step",
    task: input.task,
    state: input.state,
    history: input.history ?? [],
    step: input.step,
    entry_url: input.entryUrl ?? null,
    allow_final_publish: input.allowFinalPublish === true,
  })
}

/** Report a state transition from the native Electron browser executor. */
export async function reportDesktopPublication(args: {
  runId: string
  desktopBrowserId: string
  status: PublicationRun["status"]
  phaseMessage?: string | null
  activityLabel?: string | null
  awaitingDestinationAuth?: boolean
  userHasControl?: boolean
  executionOperation?: "prepare_publication" | "continue_publication" | "confirm_publication" | string
  agentStatus?: string | null
  thought?: string | null
  errorCode?: string | null
  errorMessage?: string | null
  externalUrl?: string | null
  externalId?: string | null
  scheduleStrategy?: "external" | "internal" | null
  destinationConnected?: boolean
}): Promise<PublicationRun> {
  const data = await invokePublishingAction<{ run: PublicationRun }>({
    action: "report_desktop_publication",
    run_id: args.runId,
    desktop_browser_id: args.desktopBrowserId,
    status: args.status,
    ...(args.phaseMessage ? { phase_message: args.phaseMessage } : {}),
    ...(args.activityLabel ? { activity_label: args.activityLabel } : {}),
    ...(args.awaitingDestinationAuth === true ? { awaiting_destination_auth: true } : {}),
    ...(args.userHasControl === true ? { user_has_control: true } : {}),
    ...(args.executionOperation ? { execution_operation: args.executionOperation } : {}),
    ...(args.agentStatus ? { agent_status: args.agentStatus } : {}),
    ...(args.thought ? { thought: args.thought } : {}),
    ...(args.errorCode ? { error_code: args.errorCode } : {}),
    ...(args.errorMessage ? { error_message: args.errorMessage } : {}),
    ...(args.externalUrl ? { external_url: args.externalUrl } : {}),
    ...(args.externalId ? { external_id: args.externalId } : {}),
    ...(args.scheduleStrategy ? { schedule_strategy: args.scheduleStrategy } : {}),
    ...(args.destinationConnected === true ? { destination_connected: true } : {}),
  })
  return data.run
}

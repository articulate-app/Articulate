/**
 * Generic Agentic Publishing (MVP)
 *
 * Browser Use Cloud API V4 via REST (Deno fetch). Not Cursor MCP. Not V3.
 *
 * Secrets (edge-only; never expose to the client):
 *   BROWSER_USE_API_KEY   — already set in project secrets; Deno.env.get only
 *   BROWSER_USE_BASE_URL  — optional, default https://api.browser-use.com/api/v4
 *   BROWSER_USE_MODEL     — optional, default minimax-m3 (free-plan compatible)
 *
 * Actions (POST JSON { action, ... }):
 *   list_destinations | create_destination | update_destination |
 *   configure_destination | open_browser |
 *   connect_destination | complete_destination_connect | verify_destination |
 *   remove_destination_profile | delete_destination | start_publication |
 *   sync_publication | get_publication |
 *   list_publications | take_control | continue_after_user | confirm_publication |
 *   cancel_publication | dispatch_scheduled_publications | reschedule_publication |
 *   publish_scheduled_now | report_local_publication | act_browser |
 *   publication_reason_step | update_publication_progress
 * Browser Use Agent /runs is removed. Articulate AI owns navigation via Browser Tools.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import {
  createBrowserProvider,
  BrowserAgentError,
  resolveBrowserProvider,
  isLocalBrowserProvider,
  isDesktopBrowserProvider,
  isBrowserControllerCommand,
} from "../_shared/browser-agent/index.ts"
import type { BrowserControllerResult } from "../_shared/browser-agent/controller.ts"
import {
  callArticulateReasonStep,
  type ArticulateBrowserAction,
} from "../_shared/publishing/articulate-reason-step.ts"
import type {
  BrowserAgentProvider,
  BrowserAgentProviderName,
  LocalBridgeStatusInput,
} from "../_shared/browser-agent/index.ts"
import {
  appendActivity,
  buildProvisionalGuidance,
  findExistingDestinationCandidate,
  inferDestinationDisplayName,
  normalizeDestinationStartUrl,
  buildConfirmPublicationTask,
  buildConfirmScheduleTask,
  buildConnectNavigateTask,
  buildContinueAfterConnectTask,
  buildContinueAfterUserTask,
  buildCancelExternalScheduleTask,
  buildExecuteInternalScheduledPublicationTask,
  buildPreparePublicationTask,
  buildPrepareScheduledPublicationTask,
  buildResumePublicationAfterAuthTask,
  DEFAULT_SCHEDULE_STALE_HOURS,
  formatScheduledAtForDisplay,
  learnDestinationMemoryFromRun,
  mapInlineContentToPublishingArtifact,
  canTransitionPublicationStatus,
  mapAgentPhaseToStatus,
  mapArtifactToPublishingArtifact,
  mergeDestinationMemoryPatch,
  normalizeIanaTimezone,
  parseDestinationMemory,
  parsePublishMode,
  parseScheduleStrategy,
  parseScheduledAt,
  publicDestinationMemory,
  resolveAutoAnswerFromDestinationMemory,
  resolvePublicationStartUrl,
  resolvePostPublishOutcome,
  userFacingErrorMessage,
  isCloudBrowserUnavailableError,
  cloudBrowserUnavailableMessage,
} from "../_shared/publishing/index.ts"
import type {
  PublicationActivityEvent,
  PublicationErrorCode,
  PublicationRunStatus,
  PublishingDestinationStatus,
} from "../_shared/publishing/index.ts"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const BROWSER_USE_API_KEY = Deno.env.get("BROWSER_USE_API_KEY") ?? ""
const BROWSER_USE_BASE_URL = Deno.env.get("BROWSER_USE_BASE_URL") ?? undefined
const BROWSER_USE_MODEL = Deno.env.get("BROWSER_USE_MODEL") ?? undefined

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  })
}

function uuidOrNull(value: unknown) {
  const text = String(value ?? "").trim()
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : null
}

function positiveInt(value: unknown) {
  const n = Number(value)
  return Number.isInteger(n) && n > 0 ? n : null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function parseBrowserViewport(value: unknown): { width: number; height: number } | null {
  const record = asRecord(value)
  if (!record) return null
  const width = Number(record.width ?? record.screenWidth ?? record.screen_width)
  const height = Number(record.height ?? record.screenHeight ?? record.screen_height)
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) return null
  return {
    width: Math.min(6144, Math.max(320, Math.round(width))),
    height: Math.min(3456, Math.max(320, Math.round(height))),
  }
}

/**
 * Stable desktop remote screen for new Cloud browser sessions.
 * Must stay in sync with app/lib/publishing/browser-viewport.ts
 * (BROWSER_USE_SCREEN_WIDTH / BROWSER_USE_SCREEN_HEIGHT).
 * Pane UI size must never drive this — viewer Fit/Fill is client-only.
 */
const BROWSER_USE_SCREEN_WIDTH = 1440
const BROWSER_USE_SCREEN_HEIGHT = 900

function defaultBrowserUseScreen(): { width: number; height: number } {
  return {
    width: BROWSER_USE_SCREEN_WIDTH,
    height: BROWSER_USE_SCREEN_HEIGHT,
  }
}

/**
 * Resolve remote screen for NEW browser provision.
 * Always uses the stable desktop default — never the Articulate pane size.
 * (parseBrowserViewport remains for metadata/diagnostics only.)
 */
function resolveBrowserViewport(_value: unknown): { width: number; height: number } {
  return defaultBrowserUseScreen()
}

/** Documented default when no destination/workspace preference exists (Browser Use V4 default). */
const DEFAULT_PROXY_COUNTRY_CODE = "us"

function parseProxyCountryCode(raw: unknown): string | null | undefined {
  if (raw === null) return null
  if (typeof raw !== "string") return undefined
  const code = raw.trim().toLowerCase()
  if (!code) return undefined
  if (code === "null" || code === "none" || code === "off" || code === "disabled") return null
  if (/^[a-z]{2}$/.test(code)) return code
  return undefined
}

/**
 * Per-destination Browser Use residential proxy region.
 * Prefer durable `metadata.browser_region`, then `proxy_country_code`.
 * Returns `null` to disable proxy (QA/internal). Defaults to US — never silently force PT.
 */
function resolveProxyCountryCode(...sources: unknown[]): string | null {
  for (const source of sources) {
    if (typeof source === "string" || source === null) {
      const parsed = parseProxyCountryCode(source)
      if (parsed !== undefined) return parsed
      continue
    }
    const record = asRecord(source)
    if (!record) continue
    const raw =
      record.browser_region ??
      record.browserRegion ??
      record.proxy_country_code ??
      record.proxyCountryCode
    const parsed = parseProxyCountryCode(raw)
    if (parsed !== undefined) return parsed
  }
  return DEFAULT_PROXY_COUNTRY_CODE
}

function profileIdSuffix(profileId: string | null | undefined): string | null {
  const id = asString(profileId)
  return id ? id.slice(-8) : null
}

function isConcurrentSessionLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "")
  return /concurrent sessions? reached|too many concurrent|free plan limit:\s*3 concurrent/i.test(
    message,
  )
}

/** Free-plan accounts allow only a few live browsers — stop active ones, then retry once. */
async function stopActiveBrowsersForCapacity(
  provider: BrowserAgentProvider,
): Promise<{ stopped: string[]; activeBefore: number }> {
  const active = await provider.listActiveBrowsers()
  const stopped: string[] = []
  for (const browser of active) {
    try {
      await provider.stopBrowser(browser.id)
      stopped.push(browser.id)
    } catch {
      // best-effort
    }
  }
  logPub("browser_capacity_freed", {
    active_before: active.length,
    stopped_count: stopped.length,
    stopped_browser_ids: stopped,
  })
  return { stopped, activeBefore: active.length }
}

async function createBrowserWithCapacity(
  provider: BrowserAgentProvider,
  input: Parameters<BrowserAgentProvider["createBrowser"]>[0],
) {
  try {
    return await provider.createBrowser(input)
  } catch (error) {
    if (!isConcurrentSessionLimitError(error)) throw error
    await stopActiveBrowsersForCapacity(provider)
    return await provider.createBrowser(input)
  }
}

async function openCloudBrowserForPublication(
  provider: BrowserAgentProvider,
  input: {
    profileId?: string | null
    startUrl: string
    screen?: { width: number; height: number } | null
    proxyCountryCode?: string | null
    timeoutMinutes?: number
  },
): Promise<{
  browserId: string
  liveViewUrl: string | null
  snapshot: BrowserControllerResult | null
  status: string
}> {
  const browser = await createBrowserWithCapacity(provider, {
    profileId: input.profileId,
    timeoutMinutes: input.timeoutMinutes ?? 90,
    proxyCountryCode: input.proxyCountryCode,
    startUrl: input.startUrl,
    screen: input.screen,
  })
  const aligned = await alignLiveViewToPane(provider, {
    liveViewUrl: browser.liveViewUrl,
    browserId: browser.id,
    screen: input.screen,
  })
  const browserId = aligned.browserId ?? browser.id
  let snapshot: BrowserControllerResult | null = null
  if (typeof provider.actOnBrowser === "function") {
    snapshot = await provider.actOnBrowser(browserId, { command: "snapshot" })
  }
  return {
    browserId,
    liveViewUrl: aligned.liveViewUrl ?? browser.liveViewUrl ?? null,
    snapshot,
    status: browser.status,
  }
}

function actionToControllerInput(action: ArticulateBrowserAction): {
  command: Parameters<NonNullable<BrowserAgentProvider["actOnBrowser"]>>[1]["command"]
  url?: string | null
  text?: string | null
  index?: number | null
  ms?: number | null
  deltaY?: number | null
} {
  if (action.type === "navigate") return { command: "navigate", url: action.url }
  if (action.type === "click") return { command: "click", index: action.index }
  if (action.type === "type") return { command: "type", index: action.index, text: action.text }
  if (action.type === "scroll") {
    return { command: "scroll", deltaY: action.direction === "up" ? -Math.abs(action.amount ?? 600) : Math.abs(action.amount ?? 600) }
  }
  if (action.type === "wait") return { command: "wait", ms: action.ms ?? 400 }
  if (action.type === "back") return { command: "back" }
  if (action.type === "forward") return { command: "forward" }
  return { command: "reload" }
}

async function snapshotPublicationBrowser(
  provider: BrowserAgentProvider,
  browserId: string | null,
): Promise<BrowserControllerResult | null> {
  if (!browserId || typeof provider.actOnBrowser !== "function") return null
  return provider.actOnBrowser(browserId, { command: "snapshot" })
}

async function runArticulatePublishLoop(
  service: ReturnType<typeof serviceClient>,
  provider: BrowserAgentProvider,
  runRow: Record<string, unknown>,
  input: {
    task: string
    entryUrl?: string | null
    allowFinalPublish: boolean
    maxSteps?: number
  },
): Promise<Record<string, unknown>> {
  const runId = String(runRow.id)
  const browserId = asString(runRow.provider_browser_id)
  if (!browserId || typeof provider.actOnBrowser !== "function") {
    return updateRun(service, runId, {
      status: "failed",
      error_code: "browser_unavailable",
      error_message: "Publication browser session is missing.",
      completed_at: new Date().toISOString(),
    })
  }
  const history: Array<{ thought?: string; action?: ArticulateBrowserAction; result?: string }> = []
  let current = runRow
  const maxSteps = Math.min(Math.max(input.maxSteps ?? 16, 1), 24)
  for (let step = 1; step <= maxSteps; step += 1) {
    const snapshot = await provider.actOnBrowser(browserId, { command: "snapshot" })
    if (snapshot.auth_required && !input.allowFinalPublish) {
      return applyPublicationProgress(service, current, {
        phase: "needs_user",
        message: "Sign in directly in this browser. Articulate does not receive or store your login credentials.",
        currentUrl: snapshot.url,
      })
    }
    const reasoned = await callArticulateReasonStep(
      {
        task: input.task,
        url: snapshot.url,
        title: snapshot.title,
        elements: snapshot.elements,
        text: snapshot.text,
        history,
        step,
        entryUrl: input.entryUrl,
        allowFinalPublish: input.allowFinalPublish,
      },
      { apiKey: Deno.env.get("OPENAI_API_KEY"), model: "gpt-4.1-mini" },
    )
    if (reasoned.status === "needs_user") {
      return applyPublicationProgress(service, current, {
        phase: "needs_user",
        message: reasoned.message || "Take control of the browser to continue.",
        currentUrl: snapshot.url,
      })
    }
    if (reasoned.status === "failed") {
      return applyPublicationProgress(service, current, {
        phase: input.allowFinalPublish ? "uncertain" : "failed",
        message: reasoned.message || "Publication browser step failed.",
        currentUrl: snapshot.url,
      })
    }
    if (reasoned.status === "done") {
      return applyPublicationProgress(service, current, {
        phase: reasoned.publication_phase ?? (input.allowFinalPublish ? "uncertain" : "awaiting_publish_confirmation"),
        message: reasoned.message,
        externalUrl: reasoned.external_url,
        externalId: reasoned.external_id,
        scheduleStrategy: reasoned.schedule_strategy,
        currentUrl: snapshot.url,
      })
    }
    for (const action of reasoned.actions) {
      const acted = await provider.actOnBrowser(browserId, actionToControllerInput(action))
      history.push({
        thought: reasoned.thought,
        action,
        result: acted.ok ? acted.url : acted.error ?? "failed",
      })
      if (acted.auth_required) {
        current = await applyPublicationProgress(service, current, {
          phase: "needs_user",
          message: "Sign in directly in this browser. Articulate does not receive or store your login credentials.",
          currentUrl: acted.url,
        })
        return current
      }
    }
  }
  return applyPublicationProgress(service, current, {
    phase: input.allowFinalPublish ? "uncertain" : "awaiting_publish_confirmation",
    message: "Stopped after the browser step budget. Review the live browser.",
  })
}

function isMissingProfileError(error: unknown): boolean {
  const message = String((error as Error)?.message ?? error ?? "")
  return /profile not found|unknown profile|invalid profile|profile.*(missing|deleted|does not exist)/i.test(
    message,
  )
}

async function ensureDestinationProfileId(
  service: ReturnType<typeof serviceClient>,
  provider: BrowserAgentProvider,
  destination: Record<string, unknown>,
  actorUserId: number,
): Promise<string> {
  const destinationId = String(destination.id)
  let profileId = asString(destination.provider_profile_id)

  // Local Bridge must not invent provider_profile_id values that would corrupt
  // Browser Use Cloud profiles. Prefer existing Cloud id as a durable local key;
  // otherwise use a destination-scoped local key that is never written back as Cloud.
  if (isLocalBrowserProvider(provider.name)) {
    return profileId ?? `local_${destinationId.replace(/-/g, "").slice(0, 24)}`
  }

  if (profileId) return profileId
  const projectId = positiveInt(destination.project_id)
  const profile = await provider.createProfile({
    name: projectId
      ? `project-${projectId}-${destinationId.slice(0, 8)}`
      : `user-${actorUserId}-${destinationId.slice(0, 8)}`,
    userId: projectId
      ? `project:${projectId}:destination:${destinationId}`
      : `user:${actorUserId}:destination:${destinationId}`,
  })
  profileId = profile.id
  await updateDestination(service, destinationId, {
    provider_profile_id: profileId,
    status: String(destination.status) === "connected" ? "disconnected" : destination.status,
  })
  logPub("profile_created", { destination_id: destinationId, provider_profile_id: profileId })
  return profileId
}

async function recreateDestinationProfileId(
  service: ReturnType<typeof serviceClient>,
  provider: BrowserAgentProvider,
  destination: Record<string, unknown>,
  actorUserId: number,
  staleProfileId: string | null,
): Promise<string> {
  const destinationId = String(destination.id)
  if (staleProfileId && typeof provider.deleteProfile === "function") {
    try {
      await provider.deleteProfile(staleProfileId)
    } catch {
      // ignore — already missing remotely
    }
  }
  await updateDestination(service, destinationId, {
    provider_profile_id: null,
    status: "disconnected",
  })
  const fresh = await loadDestination(service, destinationId)
  return ensureDestinationProfileId(service, provider, fresh, actorUserId)
}

function normalizeUrl(value: unknown): string | null {
  const text = asString(value)
  if (!text) return null
  try {
    const url = new URL(text.includes("://") ? text : `https://${text}`)
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    return url.toString()
  } catch {
    return null
  }
}

function isCloudConfigured(): boolean {
  return Boolean(BROWSER_USE_API_KEY.trim())
}

function parseDesktopAvailability(body: Record<string, unknown>): boolean {
  // Desktop execution is only available when the renderer/preload handshake
  // confirms that this client can both host and control the native browser.
  // Never infer it from a user-authored instruction or a destination record.
  return (
    String(body.client_runtime ?? "").toLowerCase() === "desktop" &&
    (body.desktop_available === true || body.desktopAvailable === true) &&
    body.native_browser_available === true &&
    body.desktop_browser_control === true
  )
}

/** @deprecated Local bridge status is ignored for resolution; kept for request parsing. */
function parseLocalBridgeStatus(body: Record<string, unknown>): LocalBridgeStatusInput {
  const nested = asRecord(body.local_bridge) ?? asRecord(body.localBridge) ?? {}
  return {
    available: false,
    chromeAvailable: false,
    version: asString(body.local_bridge_version ?? nested.version),
    forceCloud:
      body.force_cloud === true ||
      nested.forceCloud === true ||
      String(body.browser_execution_mode ?? body.execution_mode ?? "").toLowerCase() === "cloud",
    forceLocal: false,
  }
}

function getProvider(providerName: BrowserAgentProviderName | string | null = "browser_use"): BrowserAgentProvider {
  const name = String(providerName ?? "browser_use").trim() || "browser_use"
  // Legacy local-bridge rows: do not instantiate LocalBridgeProvider for new control.
  // Historical cloud ops still use browser_use.
  if (isLocalBrowserProvider(name)) {
    throw new Error(
      "Local Browser Bridge is deprecated. Re-open this publication with Desktop or Cloud.",
    )
  }
  return createBrowserProvider({
    provider: "browser_use",
    apiKey: BROWSER_USE_API_KEY,
    baseUrl: BROWSER_USE_BASE_URL,
    defaultModel: BROWSER_USE_MODEL,
  })
}

function getProviderForRun(run: Record<string, unknown>): BrowserAgentProvider {
  if (isDesktopBrowserProvider(run.provider)) {
    throw new BrowserAgentError(
      "provider_client_driven",
      "This publication is executed by the connected Articulate Desktop client.",
      { provider: "articulate_desktop" },
    )
  }
  return getProvider(asString(run.provider) ?? "browser_use")
}

function cloudUnavailableResponse(options?: { localTried?: boolean; detail?: string | null; status?: number }) {
  const message = cloudBrowserUnavailableMessage({
    localTried: options?.localTried,
    detail: options?.detail,
  })
  return json(
    {
      ok: false,
      error: {
        code: "cloud_browser_unavailable",
        message,
      },
    },
    options?.status ?? 503,
  )
}

/** Safe operational diagnostics only — never secrets, cookies, or credentials. */
function sanitizeLogText(message: string | null | undefined): string {
  return String(message ?? "")
    .replace(/bu_[a-zA-Z0-9_-]+/g, "[redacted]")
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]")
    .replace(/X-Browser-Use-API-Key[^\n]*/gi, "X-Browser-Use-API-Key: [redacted]")
    .slice(0, 300)
}

function logPub(event: string, fields: Record<string, unknown> = {}) {
  console.log(
    JSON.stringify({
      scope: "agentic-publishing",
      event,
      at: new Date().toISOString(),
      ...fields,
    }),
  )
}

/**
 * One-shot after browser.ready: ensure CDP metrics match the provisioned desktop screen.
 * Never call this from client ResizeObserver / pane resizes.
 */
async function alignLiveViewToPane(
  provider: BrowserAgentProvider,
  args: {
    liveViewUrl?: string | null
    browserId?: string | null
    agentSessionId?: string | null
    screen?: { width: number; height: number } | null
  },
): Promise<{ liveViewUrl: string | null; browserId: string | null }> {
  const screen = parseBrowserViewport(args.screen)
  let liveViewUrl = asString(args.liveViewUrl)
  let browserId = asString(args.browserId)
  if (!screen) return { liveViewUrl, browserId }
  try {
    const aligned = await provider.alignBrowserViewport({
      screen,
      browserId,
      agentSessionId: args.agentSessionId,
    })
    if (aligned.browserId) browserId = aligned.browserId
    if (aligned.liveViewUrl) liveViewUrl = aligned.liveViewUrl
    logPub("browser_viewport_aligned", {
      browser_id: browserId,
      agent_session_id: asString(args.agentSessionId),
      resized: aligned.resized,
      requested_screen_width: screen.width,
      requested_screen_height: screen.height,
    })
  } catch (error) {
    logPub("browser_viewport_align_failed", {
      browser_id: browserId,
      agent_session_id: asString(args.agentSessionId),
      message: sanitizeLogText(error instanceof Error ? error.message : String(error)),
    })
  }
  return { liveViewUrl, browserId }
}

function publicDestination(row: Record<string, unknown>) {
  const metadata = asRecord(row.metadata) ?? {}
  const browserRegion = resolveProxyCountryCode(metadata)
  // Never expose cookies / session tokens / CDP / full profile ids.
  const safeMeta = {
    last_error: metadata.last_error ?? null,
    connect_message: metadata.connect_message ?? null,
    connect_live_view_url: metadata.connect_live_view_url ?? null,
    browser_region: browserRegion,
    proxy_country_code: browserRegion,
  }
  return {
    id: row.id,
    project_id: row.project_id,
    name: row.name,
    start_url: row.start_url,
    provider: row.provider,
    status: row.status,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_connected_at: row.last_connected_at,
    last_verified_at: row.last_verified_at,
    has_profile: Boolean(asString(row.provider_profile_id)),
    memory: publicDestinationMemory(row.memory),
    metadata: safeMeta,
  }
}

async function applyPublicationProgress(
  service: ReturnType<typeof serviceClient>,
  runRow: Record<string, unknown>,
  input: {
    phase: string
    message?: string | null
    externalUrl?: string | null
    externalId?: string | null
    entryUrl?: string | null
    scheduleStrategy?: "external" | "internal" | null
    currentUrl?: string | null
  },
): Promise<Record<string, unknown>> {
  const runId = String(runRow.id)
  const currentStatus = String(runRow.status) as PublicationRunStatus
  const metadata = { ...(asRecord(runRow.metadata) ?? {}) }
  const nextStatus = mapAgentPhaseToStatus(input.phase, currentStatus)
  if (input.currentUrl) metadata.last_browser_url = input.currentUrl
  if (input.message) metadata.phase_message = input.message
  if (input.entryUrl) metadata.last_entry_url = input.entryUrl
  metadata.browser_control = "articulate_ai"
  const activity = appendActivity(
    Array.isArray(runRow.activity) ? (runRow.activity as PublicationActivityEvent[]) : [],
    input.phase === "needs_user"
      ? "Waiting for user"
      : input.phase === "awaiting_publish_confirmation"
        ? "Waiting for confirmation"
        : input.phase === "published"
          ? "Published"
          : input.phase === "scheduled"
            ? "Scheduled"
            : input.phase === "uncertain"
              ? "Publication uncertain"
              : "Updating publication",
  )
  const patch: Record<string, unknown> = {
    metadata,
    activity,
    error_message: input.message ?? null,
  }
  if (canTransitionPublicationStatus(currentStatus, nextStatus)) {
    patch.status = nextStatus
  }
  if (input.externalUrl) patch.external_url = input.externalUrl
  if (input.externalId) patch.external_id = input.externalId
  if (input.scheduleStrategy) patch.schedule_strategy = input.scheduleStrategy
  if (nextStatus === "needs_user") {
    metadata.user_has_control = true
    metadata.user_question = {
      kind: /sign in|log in|password|captcha|2fa/i.test(String(input.message ?? ""))
        ? "authentication"
        : "clarification",
      message: input.message ?? "Take control of the browser to continue.",
      asked_at: new Date().toISOString(),
    }
    patch.error_code = "authentication_required"
  }
  if (nextStatus === "awaiting_publish_confirmation") {
    metadata.user_question = null
    patch.error_code = null
    patch.error_message = null
  }
  if (nextStatus === "published" || nextStatus === "scheduled") {
    patch.error_code = null
    patch.completed_at = nextStatus === "published" ? new Date().toISOString() : null
    if (nextStatus === "scheduled") patch.live_view_url = null
  }
  if (nextStatus === "uncertain" || nextStatus === "failed") {
    const outcome = resolvePostPublishOutcome({
      currentStatus,
      phase: nextStatus,
      errorCode: nextStatus === "uncertain" ? "uncertain" : "publication_failed",
    })
    patch.status = outcome.status
    patch.error_code = outcome.errorCode
    patch.completed_at = new Date().toISOString()
  }
  const updated = await updateRun(service, runId, patch)
  try {
    if (input.entryUrl || input.externalUrl) {
      const destination = await loadDestination(service, String(runRow.destination_id))
      const sourceSnapshot = asRecord(runRow.source_snapshot) ?? {}
      await maybeLearnDestinationMemory(service, destination, {
        contentType: asString(sourceSnapshot.type) ?? asString(metadata.content_type),
        entryUrl: input.entryUrl ?? input.currentUrl,
        publicationUrl: nextStatus === "published" ? input.externalUrl : null,
      })
    }
  } catch {
    // learning is best-effort
  }
  return updated
}

function destinationTaskContext(destination: Record<string, unknown>, contentType?: string | null) {
  const memory = parseDestinationMemory(destination.memory)
  const resolved = resolvePublicationStartUrl({
    memory,
    contentType,
    defaultStartUrl: String(destination.start_url ?? ""),
  })
  return {
    name: String(destination.name),
    startUrl: resolved.startUrl,
    defaultStartUrl: String(destination.start_url ?? ""),
    memory,
    preferredEntryUrl: resolved.startUrl,
    contentType: contentType ?? null,
    startSource: resolved.source,
  }
}

async function maybeLearnDestinationMemory(
  service: ReturnType<typeof serviceClient>,
  destination: Record<string, unknown>,
  args: {
    contentType?: unknown
    entryUrl?: string | null
    publicationUrl?: string | null
  },
) {
  const learned = learnDestinationMemoryFromRun({
    currentMemory: destination.memory,
    contentType: args.contentType,
    entryUrl: args.entryUrl,
    publicationUrl: args.publicationUrl,
    defaultStartUrl: asString(destination.start_url),
  })
  if (!learned) return
  await updateDestination(service, String(destination.id), { memory: learned })
  logPub("destination_memory_learned", {
    destination_id: destination.id,
    content_type: args.contentType ?? null,
    has_entry_url: Boolean(learned.entry_points),
    has_publication_url: Boolean(learned.last_successful_publication_url),
  })
}

function scheduleStaleHours(): number {
  const raw = Number(Deno.env.get("SCHEDULE_STALE_HOURS") ?? DEFAULT_SCHEDULE_STALE_HOURS)
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_SCHEDULE_STALE_HOURS
}

function publicRun(row: Record<string, unknown>) {
  const metadata = asRecord(row.metadata) ?? {}
  const scheduledAt = asString(row.scheduled_at)
  const scheduleTimezone = asString(row.schedule_timezone)
  return {
    id: row.id,
    project_id: row.project_id,
    artifact_id: row.artifact_id,
    source_type: row.source_type ?? (row.artifact_id ? "artifact" : "inline"),
    source_snapshot: asRecord(row.source_snapshot) ?? null,
    destination_id: row.destination_id,
    started_by: row.started_by,
    provider: row.provider,
    execution_location:
      asString(row.execution_location) ??
      (isDesktopBrowserProvider(row.provider) ? "client" : "server"),
    status: row.status,
    publish_mode: row.publish_mode ?? "now",
    scheduled_at: scheduledAt,
    schedule_timezone: scheduleTimezone,
    schedule_strategy: row.schedule_strategy ?? null,
    scheduled_external_at: row.scheduled_external_at ?? null,
    execution_started_at: row.execution_started_at ?? null,
    scheduled_at_display: scheduledAt
      ? formatScheduledAtForDisplay(scheduledAt, scheduleTimezone)
      : null,
    provider_run_id: row.provider_run_id ?? null,
    provider_session_id: row.provider_session_id ?? null,
    provider_workspace_id: row.provider_workspace_id ?? null,
    live_view_url: row.live_view_url,
    external_url: row.external_url,
    external_id: row.external_id,
    started_at: row.started_at,
    completed_at: row.completed_at,
    published_at: row.published_at ?? null,
    error_code: row.error_code,
    error_message: row.error_message,
    activity: Array.isArray(row.activity) ? row.activity : [],
    result: asRecord(row.result) ?? {},
    metadata: {
      user_has_control: Boolean(metadata.user_has_control),
      phase_message: asString(metadata.phase_message),
      destination_name: asString(metadata.destination_name),
      artifact_title: asString(metadata.artifact_title),
      final_publish_attempted: Boolean(metadata.final_publish_attempted),
      awaiting_destination_auth: Boolean(metadata.awaiting_destination_auth),
      user_question: asRecord(metadata.user_question),
      ai_thread_id: asString(metadata.ai_thread_id),
      preferred_start_url: asString(metadata.preferred_start_url),
      start_url_source: asString(metadata.start_url_source),
      pending_schedule_strategy: parseScheduleStrategy(metadata.pending_schedule_strategy),
      stale_schedule: Boolean(metadata.stale_schedule),
      desktop_browser: Boolean(metadata.desktop_browser),
      desktop_browser_id: asString(metadata.desktop_browser_id),
      desktop_agent_task: asString(metadata.desktop_agent_task),
      desktop_confirm_task: asString(metadata.desktop_confirm_task),
      client_execution: asRecord(metadata.client_execution),
    },
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

function activityFromLabels(labels: string[] | undefined, existing: PublicationActivityEvent[]): PublicationActivityEvent[] {
  let next = existing
  for (const label of labels ?? []) {
    next = appendActivity(next, label)
  }
  return next
}

async function requireUser(req: Request) {
  const authorization = req.headers.get("Authorization")
  if (!authorization) throw Object.assign(new Error("Missing Authorization"), { status: 401, code: "unauthorized" })
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await userClient.auth.getUser()
  if (error || !data?.user) throw Object.assign(new Error("Unauthorized"), { status: 401, code: "unauthorized" })
  return { userClient, user: data.user, authorization }
}

function serviceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function assertCanEditProject(userClient: ReturnType<typeof createClient>, projectId: number) {
  const { data, error } = await userClient.rpc("fn_can_edit_project_check", {
    p_project_id: projectId,
  })
  if (error) throw Object.assign(new Error(error.message), { status: 403, code: "forbidden" })
  if (!data) throw Object.assign(new Error("Forbidden"), { status: 403, code: "forbidden" })
}

async function resolveActorUserId(
  userClient: ReturnType<typeof createClient>,
  authUserId: string,
): Promise<number> {
  const { data, error } = await userClient
    .from("users")
    .select("id")
    .eq("auth_user_id", authUserId)
    .maybeSingle()
  const id = positiveInt(data?.id)
  if (error || !id) {
    throw Object.assign(new Error("Unable to resolve user"), { status: 403, code: "forbidden" })
  }
  return id
}

async function assertCanAccessDestination(
  userClient: ReturnType<typeof createClient>,
  destination: Record<string, unknown>,
  actorUserId: number,
) {
  const projectId = positiveInt(destination.project_id)
  if (projectId) {
    await assertCanEditProject(userClient, projectId)
    return
  }
  if (positiveInt(destination.created_by) === actorUserId) return
  throw Object.assign(new Error("Forbidden"), { status: 403, code: "forbidden" })
}

async function assertCanAccessRun(
  userClient: ReturnType<typeof createClient>,
  run: Record<string, unknown>,
  actorUserId: number,
) {
  const projectId = positiveInt(run.project_id)
  if (projectId) {
    await assertCanEditProject(userClient, projectId)
    return
  }
  if (positiveInt(run.started_by) === actorUserId) return
  throw Object.assign(new Error("Forbidden"), { status: 403, code: "forbidden" })
}

/** Optional project from artifact/task. Never requires project/task attachment. */
async function resolveOptionalProjectIdForArtifact(
  userClient: ReturnType<typeof createClient>,
  service: ReturnType<typeof serviceClient>,
  artifact: Record<string, unknown>,
): Promise<number | null> {
  const direct = positiveInt(artifact.project_id)
  if (direct) {
    await assertCanEditProject(userClient, direct)
    return direct
  }
  const taskId = positiveInt(artifact.task_id)
  if (!taskId) return null
  // tasks use project_id_int (not project_id). Selecting a missing column makes PostgREST error
  // and previously caused us to treat task-owned Dimas artifacts as "no project".
  const { data, error } = await service
    .from("tasks")
    .select("id,project_id_int")
    .eq("id", taskId)
    .maybeSingle()
  if (error) {
    logPub("artifact_project_resolve_failed", {
      task_id: taskId,
      message: sanitizeLogText(error.message),
    })
    return null
  }
  const projectId = positiveInt(data?.project_id_int)
  if (!projectId) return null
  await assertCanEditProject(userClient, projectId)
  return projectId
}

async function loadDestination(service: ReturnType<typeof serviceClient>, destinationId: string) {
  const { data, error } = await service.from("publishing_destinations").select("*").eq("id", destinationId).maybeSingle()
  if (error || !data) throw Object.assign(new Error("Destination not found"), { status: 404, code: "not_found" })
  return data as Record<string, unknown>
}

async function loadRun(service: ReturnType<typeof serviceClient>, runId: string) {
  const { data, error } = await service.from("publication_runs").select("*").eq("id", runId).maybeSingle()
  if (error || !data) throw Object.assign(new Error("Publication run not found"), { status: 404, code: "not_found" })
  return data as Record<string, unknown>
}

async function updateDestination(
  service: ReturnType<typeof serviceClient>,
  id: string,
  patch: Record<string, unknown>,
) {
  const { data, error } = await service
    .from("publishing_destinations")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single()
  if (error || !data) throw Object.assign(new Error(error?.message ?? "Failed to update destination"), { status: 500, code: "agent_failed" })
  return data as Record<string, unknown>
}

async function updateRun(
  service: ReturnType<typeof serviceClient>,
  id: string,
  patch: Record<string, unknown>,
) {
  const { data, error } = await service
    .from("publication_runs")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single()
  if (error || !data) throw Object.assign(new Error(error?.message ?? "Failed to update publication run"), { status: 500, code: "agent_failed" })
  return data as Record<string, unknown>
}

async function loadArtifactSnapshot(
  userClient: ReturnType<typeof createClient>,
  artifactId: string,
) {
  const { data, error } = await userClient.rpc("ai_get_artifact_v2", {
    p_artifact_id: artifactId,
    p_version_number: null,
  })
  if (error || data?.ok === false) {
    throw Object.assign(new Error(error?.message ?? data?.error ?? "Unable to read artifact"), {
      status: 403,
      code: "forbidden",
    })
  }
  const snapshot = asRecord(data?.snapshot)
  if (!snapshot) throw Object.assign(new Error("Artifact not found"), { status: 404, code: "not_found" })
  return snapshot
}

async function loadTaskSeo(service: ReturnType<typeof serviceClient>, taskId: number | null) {
  if (!taskId) return null
  // Task SEO column names vary across environments; ignore lookup failures.
  try {
    const { data } = await service.from("tasks").select("*").eq("id", taskId).maybeSingle()
    if (!data) return null
    const row = data as Record<string, unknown>
    return {
      title:
        asString(row.meta_title) ??
        asString(row.seo_title) ??
        asString(row.seo_meta_title) ??
        null,
      description:
        asString(row.meta_description) ??
        asString(row.seo_description) ??
        asString(row.seo_meta_description) ??
        null,
    }
  } catch {
    return null
  }
}

async function uploadArtifactFiles(
  provider: BrowserAgentProvider,
  service: ReturnType<typeof serviceClient>,
  workspaceId: string,
  publishingArtifact: ReturnType<typeof mapArtifactToPublishingArtifact>,
) {
  const uploaded: Array<{ id: string; name: string; path: string; purpose?: string | null; mimeType?: string | null }> = []
  const media = publishingArtifact.media ?? []
  for (const item of media.slice(0, 10)) {
    const attachmentId = item.attachmentId ?? item.id
    if (!attachmentId) continue
    const { data: attachment, error } = await service
      .from("attachments")
      .select("id,file_name,file_path,mime_type,size")
      .eq("id", attachmentId)
      .maybeSingle()
    if (error || !attachment?.file_path) continue
    const path = String(attachment.file_path)
    const bucket = path.includes("/project-files/") ? "project-files" : "attachments"
    const objectPath = path.includes(`${bucket}/`) ? path.split(`${bucket}/`).pop()! : path
    const { data: file, error: fileError } = await service.storage.from(bucket).download(objectPath)
    if (fileError || !file) {
      throw Object.assign(new Error(userFacingErrorMessage("upload_failed")), {
        status: 500,
        code: "upload_failed",
      })
    }
    const bytes = new Uint8Array(await file.arrayBuffer())
    const name = asString(attachment.file_name) || `${attachmentId}.bin`
    const mimeType = asString(attachment.mime_type) || item.mimeType || "application/octet-stream"
    const result = await provider.uploadFile({
      workspaceId,
      name,
      contentType: mimeType,
      bytes,
      purpose: item.purpose ?? item.type,
    })
    item.localPath = result.path
    uploaded.push({
      id: result.id,
      name: result.name,
      path: result.path,
      purpose: item.purpose ?? item.type,
      mimeType,
    })
  }
  return uploaded
}

function isSessionWorkspaceMismatchError(message: string | null | undefined): boolean {
  return /session belongs to a different workspace|workspace.*session|session.*workspace/i.test(
    String(message ?? ""),
  )
}

function isStaleSessionError(message: string | null | undefined): boolean {
  return (
    isSessionWorkspaceMismatchError(message) ||
    /session.*(expired|not found|invalid|no longer)|browser.*(stopped|closed|not found)/i.test(
      String(message ?? ""),
    )
  )
}

async function syncProviderRun(
  service: ReturnType<typeof serviceClient>,
  provider: BrowserAgentProvider,
  runRow: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const runId = String(runRow.id)
  const currentStatus = String(runRow.status) as PublicationRunStatus
  const browserId = asString(runRow.provider_browser_id)
  const metadata = { ...(asRecord(runRow.metadata) ?? {}) }

  if (["published", "failed", "cancelled", "uncertain"].includes(currentStatus) && !asString(runRow.live_view_url)) {
    return runRow
  }

  if (browserId) {
    try {
      const browser = await provider.getBrowser(browserId)
      const patch: Record<string, unknown> = { metadata }
      if (browser?.liveViewUrl) patch.live_view_url = browser.liveViewUrl
      if (!browser || browser.status === "stopped") {
        metadata.browser_active = false
        if (["queued", "starting"].includes(currentStatus)) {
          const startedHint =
            asString(runRow.execution_started_at) ??
            asString(runRow.started_at) ??
            asString(metadata.claimed_for_execution_at) ??
            asString(runRow.updated_at)
          const startedMs = startedHint ? Date.parse(startedHint) : NaN
          const ageMs = Number.isFinite(startedMs) ? Date.now() - startedMs : Number.POSITIVE_INFINITY
          if (ageMs > 3 * 60_000) {
            return updateRun(service, runId, {
              status: "failed",
              error_code: "browser_session_expired",
              error_message: "The publication browser session is no longer active.",
              completed_at: new Date().toISOString(),
              metadata,
            })
          }
        }
      } else {
        metadata.browser_active = true
      }
      return updateRun(service, runId, patch)
    } catch (error) {
      logPub("sync_browser_status_failed", {
        publication_run_id: runId,
        message: sanitizeLogText(error instanceof Error ? error.message : String(error)),
      })
      return runRow
    }
  }

  if (["queued", "starting"].includes(currentStatus)) {
    return runRow
  }
  return runRow
}


async function executeInternalScheduledRun(
  service: ReturnType<typeof serviceClient>,
  runRow: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const runId = String(runRow.id)
  const destination = await loadDestination(service, String(runRow.destination_id))
  // Unattended internal schedules always use Cloud — the user's machine may be offline.
  if (!isCloudConfigured()) {
    return updateRun(service, runId, {
      status: "failed",
      error_code: "cloud_browser_unavailable",
      error_message: cloudBrowserUnavailableMessage({
        detail: "Cloud browser is not configured for unattended scheduled publication.",
      }),
      completed_at: new Date().toISOString(),
      metadata: {
        ...(asRecord(runRow.metadata) ?? {}),
        browser_provider_resolved: "browser_use",
        browser_provider_reason: "unattended_requires_cloud",
      },
    })
  }
  const provider = getProvider("browser_use")
  let profileId = asString(destination.provider_profile_id)
  if (!profileId) {
    throw Object.assign(new Error("Destination has no persistent browser profile"), {
      status: 409,
      code: "session_expired",
    })
  }

  const sourceSnapshot = asRecord(runRow.source_snapshot) ?? asRecord(asRecord(runRow.result)?.artifact) ?? {}
  const publishingArtifact = {
    id: asString(sourceSnapshot.id) ?? runId,
    type: asString(sourceSnapshot.type) ?? "document",
    title: asString(sourceSnapshot.title) ?? undefined,
    content: asString(sourceSnapshot.content) ?? undefined,
    excerpt: asString(sourceSnapshot.excerpt) ?? undefined,
    slug: asString(sourceSnapshot.slug) ?? undefined,
    seo: asRecord(sourceSnapshot.seo) as { title?: string; description?: string } | undefined,
    media: Array.isArray(sourceSnapshot.media) ? (sourceSnapshot.media as never[]) : undefined,
    metadata: asRecord(sourceSnapshot.metadata) ?? undefined,
  }
  const destCtx = destinationTaskContext(destination, asString(publishingArtifact.type))
  const metadata = asRecord(runRow.metadata) ?? {}
  const screen = parseBrowserViewport(metadata.browser_viewport) ?? resolveBrowserViewport(null)
  const proxyCountryCode = resolveProxyCountryCode(metadata, asRecord(destination.metadata))
  const scheduledAtIso = asString(runRow.scheduled_at) ?? new Date().toISOString()
  const timezone = normalizeIanaTimezone(runRow.schedule_timezone, "UTC")

  const workspace = await provider.createWorkspace(`sched-${runId.slice(0, 8)}`)
  let files: Awaited<ReturnType<typeof uploadArtifactFiles>> = []
  try {
    files = await uploadArtifactFiles(provider, service, workspace.id, publishingArtifact)
  } catch (error) {
    return updateRun(service, runId, {
      status: "failed",
      error_code: "upload_failed",
      error_message: userFacingErrorMessage("upload_failed", (error as Error).message),
      completed_at: new Date().toISOString(),
    })
  }

  const task = buildExecuteInternalScheduledPublicationTask({
    destination: destCtx,
    artifact: publishingArtifact,
    files,
    scheduledAtIso,
    timezone,
  })

  let opened: Awaited<ReturnType<typeof openCloudBrowserForPublication>>
  try {
    opened = await openCloudBrowserForPublication(provider, {
      profileId,
      startUrl: destCtx.startUrl,
      proxyCountryCode,
      screen,
    })
  } catch (startError) {
    const message = sanitizeLogText((startError as Error).message)
    if (isCloudBrowserUnavailableError(startError)) {
      return updateRun(service, runId, {
        status: "failed",
        error_code: "cloud_browser_unavailable",
        error_message: cloudBrowserUnavailableMessage({ detail: message }),
        completed_at: new Date().toISOString(),
        metadata: {
          ...metadata,
          last_provider_error: message,
          browser_provider_resolved: "browser_use",
          browser_provider_reason: "unattended_requires_cloud",
        },
      })
    }
    return updateRun(service, runId, {
      status: "failed",
      error_code: "browser_unavailable",
      error_message: message || "Could not start scheduled publication browser session.",
      completed_at: new Date().toISOString(),
      metadata: {
        ...metadata,
        last_provider_error: message,
      },
    })
  }

  const liveViewUrl = opened.liveViewUrl
  const providerBrowserId = opened.browserId

  const updated = await updateRun(service, runId, {
    provider_run_id: null,
    provider_session_id: providerBrowserId,
    provider_workspace_id: workspace.id,
    provider_browser_id: providerBrowserId,
    status: "running",
    live_view_url: liveViewUrl,
    error_code: null,
    error_message: null,
    completed_at: null,
    started_at: asString(runRow.started_at) ?? new Date().toISOString(),
    activity: appendActivity(
      Array.isArray(runRow.activity) ? (runRow.activity as PublicationActivityEvent[]) : [],
      "Executing scheduled publication",
    ),
    metadata: {
      ...metadata,
      files,
      preferred_start_url: destCtx.startUrl,
      start_url_source: destCtx.startSource,
      user_has_control: false,
      awaiting_destination_auth: false,
      phase_message: "Executing scheduled publication",
      // Prior schedule confirmation authorized the final publish for this run.
      final_publish_attempted: true,
      internal_schedule_execution: true,
      reconcile_reason: null,
    },
  })
  logPub("scheduled_publication_executing", {
    publication_run_id: runId,
    destination_id: destination.id,
    provider_browser_id: providerBrowserId,
    scheduled_at: scheduledAtIso,
    browser_control: "articulate_ai",
  })
  return runArticulatePublishLoop(service, provider, updated, {
    task,
    entryUrl: destCtx.startUrl,
    allowFinalPublish: true,
    maxSteps: 20,
  })
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return json({ error: { code: "invalid_request", message: "POST required" } }, 405)

  try {
    const body = await req.json().catch(() => ({}))
    const action = asString(body?.action)
    if (!action) return json({ error: { code: "invalid_request", message: "action is required" } }, 400)

    const authHeader = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim() ?? ""
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    const isService = Boolean(authHeader && serviceKey && authHeader === serviceKey)

    // Ops/service path: free Browser Use concurrent slots without a user JWT.
    if (action === "cleanup_browsers" && isService) {
      const provider = getProvider()
      const freed = await stopActiveBrowsersForCapacity(provider)
      return json({
        ok: true,
        mode: "service",
        active_before: freed.activeBefore,
        stopped_browser_ids: freed.stopped,
        cancelled_runs: 0,
      })
    }

    if (action === "dispatch_scheduled_publications" && isService) {
      const service = serviceClient()
      const staleHours = scheduleStaleHours()
      const { data: dueRows, error } = await service
        .from("publication_runs")
        .select("id")
        .eq("status", "scheduled")
        .eq("schedule_strategy", "internal")
        .lte("scheduled_at", new Date().toISOString())
        .order("scheduled_at", { ascending: true })
        .limit(10)
      if (error) return json({ error: { code: "agent_failed", message: error.message } }, 500)

      const claimed: string[] = []
      const stale: string[] = []
      const executed: string[] = []
      const skipped: string[] = []

      for (const row of dueRows ?? []) {
        const runId = asString((row as Record<string, unknown>).id)
        if (!runId) continue
        const { data: claimedRow, error: claimError } = await service.rpc(
          "claim_scheduled_publication_run",
          { p_run_id: runId, p_stale_hours: staleHours },
        )
        if (claimError) {
          logPub("scheduled_claim_failed", { publication_run_id: runId, message: claimError.message })
          skipped.push(runId)
          continue
        }
        if (!claimedRow || !asString((claimedRow as Record<string, unknown>).id)) {
          skipped.push(runId)
          continue
        }
        const claimedRun = claimedRow as Record<string, unknown>
        claimed.push(runId)
        if (String(claimedRun.status) === "needs_user") {
          stale.push(runId)
          continue
        }
        if (String(claimedRun.status) !== "queued") {
          skipped.push(runId)
          continue
        }
        try {
          await executeInternalScheduledRun(service, claimedRun)
          executed.push(runId)
        } catch (execError) {
          logPub("scheduled_execute_failed", {
            publication_run_id: runId,
            message: sanitizeLogText((execError as Error).message),
          })
          await updateRun(service, runId, {
            status: "failed",
            error_code: "agent_failed",
            error_message: userFacingErrorMessage("agent_failed", (execError as Error).message),
            completed_at: new Date().toISOString(),
          })
        }
      }

      return json({
        ok: true,
        mode: "service",
        due: (dueRows ?? []).length,
        claimed: claimed.length,
        executed: executed.length,
        stale: stale.length,
        skipped: skipped.length,
        claimed_ids: claimed,
        executed_ids: executed,
        stale_ids: stale,
      })
    }

    const { userClient, user } = await requireUser(req)
    const service = serviceClient()
    const actorUserId = await resolveActorUserId(userClient, user.id)

    if (action === "list_destinations") {
      const projectId = positiveInt(body.project_id)
      const ownerScope = body.owner_scope === true || body.scope === "owner" || (!projectId && body.owner_scope !== false)
      if (!projectId && !ownerScope) {
        return json({ error: { code: "invalid_request", message: "project_id or owner_scope is required" } }, 400)
      }
      let query = userClient.from("publishing_destinations").select("*").order("name")
      if (projectId) {
        await assertCanEditProject(userClient, projectId)
        query = query.eq("project_id", projectId)
      } else {
        query = query.is("project_id", null).eq("created_by", actorUserId)
      }
      const { data, error } = await query
      if (error) return json({ error: { code: "agent_failed", message: error.message } }, 500)
      return json({ ok: true, destinations: (data ?? []).map((row) => publicDestination(row)) })
    }

    if (action === "configure_destination") {
      const destinationIdHint = uuidOrNull(body.destination_id)
      const projectId = positiveInt(body.project_id)
      const startUrl = normalizeDestinationStartUrl(
        body.start_url ?? body.url ?? body.service_url ?? body.platform_url,
      )
      const serviceOrPlatform = asString(
        body.service_or_platform ?? body.platform ?? body.service ?? body.cms,
      )
      const purpose = asString(body.purpose)
      const contentType = asString(body.content_type ?? body.contentType)
      const projectName = asString(body.project_name ?? body.projectName)
      const explicitName = asString(body.name)
      const connectRequested = body.connect !== false && body.skip_connect !== true
      const aiThreadId = uuidOrNull(body.ai_thread_id ?? body.thread_id)

      // Load accessible candidates for duplicate avoidance.
      let candidateQuery = service
        .from("publishing_destinations")
        .select("id, name, start_url, project_id, status, memory, metadata, provider_profile_id, created_by")
        .order("updated_at", { ascending: false })
        .limit(100)
      if (projectId) {
        candidateQuery = candidateQuery.or(
          `project_id.eq.${projectId},created_by.eq.${actorUserId}`,
        )
      } else {
        candidateQuery = candidateQuery.eq("created_by", actorUserId)
      }
      const { data: candidateRows } = await candidateQuery
      const candidates = (candidateRows ?? []) as Array<Record<string, unknown>>
      const accessible: Array<Record<string, unknown>> = []
      for (const row of candidates) {
        try {
          await assertCanAccessDestination(userClient, row, actorUserId)
          accessible.push(row)
        } catch {
          // skip inaccessible
        }
      }

      const existingMatch = findExistingDestinationCandidate(
        accessible.map((row) => ({
          id: String(row.id),
          name: String(row.name ?? ""),
          start_url: String(row.start_url ?? ""),
          project_id: positiveInt(row.project_id),
        })),
        {
          destinationId: destinationIdHint,
          projectId,
          startUrl,
          name: explicitName,
          serviceOrPlatform,
        },
      )

      let destination: Record<string, unknown>
      let created = false
      let reusedExisting = Boolean(existingMatch)

      if (existingMatch) {
        destination = await loadDestination(service, existingMatch.id)
        await assertCanAccessDestination(userClient, destination, actorUserId)
        const patch: Record<string, unknown> = {}
        if (explicitName) patch.name = explicitName
        if (startUrl && startUrl !== String(destination.start_url ?? "")) {
          patch.start_url = startUrl
        }
        if (projectId && destination.project_id == null) {
          await assertCanEditProject(userClient, projectId)
          patch.project_id = projectId
        }
        const guidance = buildProvisionalGuidance({
          purpose,
          contentType,
          serviceOrPlatform,
          projectName,
          guidance: asString(body.guidance),
        })
        const memoryPatch: Record<string, unknown> = {}
        if (guidance) memoryPatch.guidance = guidance
        if (body.entry_points != null) memoryPatch.entry_points = body.entry_points
        if (Object.keys(memoryPatch).length > 0) {
          patch.memory = mergeDestinationMemoryPatch(destination.memory, memoryPatch)
        }
        const meta = asRecord(destination.metadata) ?? {}
        patch.metadata = {
          ...meta,
          ...(serviceOrPlatform ? { service_or_platform: serviceOrPlatform } : {}),
          ...(purpose ? { purpose } : {}),
          ...(contentType ? { content_type: contentType } : {}),
          ...(projectName ? { project_name_hint: projectName } : {}),
          ...(aiThreadId ? { configure_ai_thread_id: aiThreadId } : {}),
          configured_via: "ai_configure_destination",
        }
        if (Object.keys(patch).length > 0) {
          destination = await updateDestination(service, String(destination.id), patch)
        }
      } else {
        if (!startUrl) {
          return json({
            error: {
              code: "invalid_request",
              message:
                "start_url is required to create a publishing destination (e.g. account.squarespace.com).",
            },
          }, 400)
        }
        if (projectId) await assertCanEditProject(userClient, projectId)
        const name = inferDestinationDisplayName({
          name: explicitName,
          serviceOrPlatform,
          projectName,
          startUrl,
        })
        const guidance = buildProvisionalGuidance({
          purpose,
          contentType,
          serviceOrPlatform,
          projectName,
          guidance: asString(body.guidance),
        })
        const memory = mergeDestinationMemoryPatch(null, {
          ...(guidance ? { guidance } : {}),
          ...(body.entry_points != null ? { entry_points: body.entry_points } : {}),
        })
        const browserRegion = resolveProxyCountryCode(
          body.browser_region,
          body.proxy_country_code,
          body,
        )
        const { data, error } = await userClient
          .from("publishing_destinations")
          .insert({
            project_id: projectId,
            name,
            start_url: startUrl,
            provider: "browser_use",
            status: "disconnected",
            created_by: actorUserId,
            memory,
            metadata: {
              browser_region: browserRegion,
              proxy_country_code: browserRegion,
              ...(serviceOrPlatform ? { service_or_platform: serviceOrPlatform } : {}),
              ...(purpose ? { purpose } : {}),
              ...(contentType ? { content_type: contentType } : {}),
              ...(projectName ? { project_name_hint: projectName } : {}),
              ...(aiThreadId ? { configure_ai_thread_id: aiThreadId } : {}),
              configured_via: "ai_configure_destination",
              provisional: true,
            },
          })
          .select("*")
          .single()
        if (error || !data) {
          return json({ error: { code: "agent_failed", message: error?.message ?? "Create failed" } }, 500)
        }
        destination = data as Record<string, unknown>
        created = true
        reusedExisting = false
      }

      const destinationId = String(destination.id)
      const status = String(destination.status)
      const alreadyConnected = status === "connected"
      let liveViewUrl: string | null = null
      let connectRunId: string | null = null
      let connectSessionId: string | null = null
      let connecting = false

      if (connectRequested && !alreadyConnected) {
        // Reuse connect_destination path via internal provider start (same as action).
        const provider = getProvider()
        let profileId = asString(destination.provider_profile_id)
        if (!profileId) {
          const profile = await provider.createProfile({
            name: projectId
              ? `project-${projectId}-${destinationId.slice(0, 8)}`
              : `user-${actorUserId}-${destinationId.slice(0, 8)}`,
            userId: projectId
              ? `project:${projectId}:destination:${destinationId}`
              : `user:${actorUserId}:destination:${destinationId}`,
          })
          profileId = profile.id
        }
        const previousBrowserId = asString(asRecord(destination.metadata)?.connect_browser_id)
        if (previousBrowserId) {
          try {
            await provider.stopBrowser(previousBrowserId)
          } catch {
            // best-effort
          }
        }
        const destinationName = String(destination.name)
        const connectStartUrl = String(destination.start_url)
        const connectMessage =
          `Sign in directly to ${destinationName} in this browser. Articulate does not receive or store your login credentials.`
        const screen = resolveBrowserViewport(body.browser_viewport ?? body.screen)
        const proxyCountryCode = resolveProxyCountryCode(
          body.browser_region,
          body.proxy_country_code,
          asRecord(destination.metadata),
        )
        const connectOpened = await openCloudBrowserForPublication(provider, {
          profileId,
          startUrl: connectStartUrl,
          proxyCountryCode,
          screen,
        })
        liveViewUrl = connectOpened.liveViewUrl
        const connectBrowserId = connectOpened.browserId
        if (!liveViewUrl) {
          try {
            await provider.stopBrowser(connectOpened.browserId)
          } catch {
            // ignore
          }
          return json({
            error: {
              code: "browser_unavailable",
              message: "Remote browser started but no Live View URL was returned. Try again.",
            },
          }, 502)
        }
        connectRunId = null
        connectSessionId = connectOpened.browserId
        connecting = true
        destination = await updateDestination(service, destinationId, {
          provider_profile_id: profileId,
          status: "connecting" satisfies PublishingDestinationStatus,
          metadata: {
            ...(asRecord(destination.metadata) ?? {}),
            connect_browser_id: connectBrowserId,
            connect_run_id: connectRunId,
            connect_session_id: connectSessionId,
            verify_run_id: null,
            verify_session_id: null,
            connect_live_view_url: liveViewUrl,
            connect_message: connectMessage,
            last_error: null,
            browser_region: proxyCountryCode,
            proxy_country_code: proxyCountryCode,
            browser_viewport: screen,
            discover_publishing_setup: true,
            configure_content_type: contentType,
            configure_project_hint: projectName,
          },
        })
        logPub("destination_configure_connect_started", {
          destination_id: destinationId,
          created,
          reused_existing: reusedExisting,
          provider_run_id: connectRunId,
        })
      }

      logPub("destination_configured", {
        destination_id: destinationId,
        created,
        reused_existing: reusedExisting,
        connecting,
        already_connected: alreadyConnected,
      })

      return json({
        ok: true,
        created,
        reused_existing: reusedExisting,
        connecting,
        already_connected: alreadyConnected,
        needs_authentication: connecting,
        destination: publicDestination(destination),
        destination_id: destinationId,
        live_view_url: liveViewUrl,
        connect_run_id: connectRunId,
        connect_session_id: connectSessionId,
        show_browser_preview: Boolean(liveViewUrl),
        message: connecting
          ? `Configured ${destination.name}. Sign in in the browser preview to finish connecting.`
          : alreadyConnected
            ? `Using existing destination ${destination.name}.`
            : `Configured ${destination.name}.`,
      })
    }

    if (action === "create_destination") {
      const projectId = positiveInt(body.project_id)
      const ownerScope = body.owner_scope === true || body.scope === "owner" || !projectId
      const name = asString(body.name)
      const startUrl = normalizeUrl(body.start_url ?? body.url)
      if (!name || !startUrl) {
        return json({ error: { code: "invalid_request", message: "name and start_url are required" } }, 400)
      }
      if (!projectId && !ownerScope) {
        return json({ error: { code: "invalid_request", message: "project_id or owner_scope is required" } }, 400)
      }
      if (projectId) await assertCanEditProject(userClient, projectId)
      const browserRegion = resolveProxyCountryCode(
        body.browser_region,
        body.proxy_country_code,
        body,
      )
      const { data, error } = await userClient
        .from("publishing_destinations")
        .insert({
          project_id: projectId,
          name,
          start_url: startUrl,
          provider: "browser_use",
          status: "disconnected",
          created_by: actorUserId,
          metadata: {
            browser_region: browserRegion,
            proxy_country_code: browserRegion,
          },
        })
        .select("*")
        .single()
      if (error || !data) return json({ error: { code: "agent_failed", message: error?.message ?? "Create failed" } }, 500)
      return json({ ok: true, destination: publicDestination(data) })
    }

    if (action === "update_destination") {
      const destinationId = uuidOrNull(body.destination_id)
      if (!destinationId) return json({ error: { code: "invalid_request", message: "destination_id is required" } }, 400)
      const destination = await loadDestination(service, destinationId)
      await assertCanAccessDestination(userClient, destination, actorUserId)

      const patch: Record<string, unknown> = {}
      const name = asString(body.name)
      if (name) patch.name = name
      const startUrl = normalizeUrl(body.start_url ?? body.url ?? body.default_start_url)
      if (startUrl) patch.start_url = startUrl

      if (body.memory != null || body.guidance != null || body.entry_points != null) {
        const memoryPatch: Record<string, unknown> = asRecord(body.memory) ?? {}
        if (body.guidance != null) memoryPatch.guidance = body.guidance
        if (body.entry_points != null) memoryPatch.entry_points = body.entry_points
        if (body.last_successful_entry_url != null) {
          memoryPatch.last_successful_entry_url = body.last_successful_entry_url
        }
        if (body.last_successful_publication_url != null) {
          memoryPatch.last_successful_publication_url = body.last_successful_publication_url
        }
        patch.memory = mergeDestinationMemoryPatch(destination.memory, memoryPatch)
      }

      if (Object.keys(patch).length === 0) {
        return json({ ok: true, destination: publicDestination(destination) })
      }

      // Prefer userClient so RLS still applies for editors; service fallback not needed.
      const { data, error } = await userClient
        .from("publishing_destinations")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", destinationId)
        .select("*")
        .single()
      if (error || !data) {
        return json({ error: { code: "agent_failed", message: error?.message ?? "Update failed" } }, 500)
      }
      return json({ ok: true, destination: publicDestination(data as Record<string, unknown>) })
    }

    if (action === "remove_destination_profile") {
      const destinationId = uuidOrNull(body.destination_id)
      if (!destinationId) {
        return json({ error: { code: "invalid_request", message: "destination_id is required" } }, 400)
      }
      const destination = await loadDestination(service, destinationId)
      await assertCanAccessDestination(userClient, destination, actorUserId)
      const profileId = asString(destination.provider_profile_id)
      if (profileId) {
        try {
          const provider = getProvider()
          if (typeof provider.deleteProfile === "function") {
            await provider.deleteProfile(profileId)
          }
        } catch (error) {
          // Local unlink is authoritative; remote delete is best-effort.
          logPub("profile_remote_delete_failed", {
            destination_id: destinationId,
            provider_profile_id: profileId,
            message: sanitizeLogText((error as Error).message),
          })
        }
      }
      const metadata = {
        ...(asRecord(destination.metadata) ?? {}),
        last_error: null,
        connect_message: null,
        connect_live_view_url: null,
        profile_removed_at: new Date().toISOString(),
        previous_provider_profile_id: profileId,
      }
      const updated = await updateDestination(service, destinationId, {
        provider_profile_id: null,
        status: "disconnected",
        last_connected_at: null,
        last_verified_at: null,
        metadata,
      })
      logPub("profile_removed", {
        destination_id: destinationId,
        provider_profile_id: profileId,
      })
      return json({
        ok: true,
        destination: publicDestination(updated),
        message: profileId
          ? "Browser profile removed. Reconnect the destination to sign in again."
          : "No browser profile was attached to this destination.",
      })
    }

    if (action === "delete_destination") {
      const destinationId = uuidOrNull(body.destination_id)
      if (!destinationId) return json({ error: { code: "invalid_request", message: "destination_id is required" } }, 400)
      const destination = await loadDestination(service, destinationId)
      await assertCanAccessDestination(userClient, destination, actorUserId)
      const profileId = asString(destination.provider_profile_id)
      // Clear local profile linkage first so a failed row-delete cannot leave a dead profile id.
      if (profileId) {
        await updateDestination(service, destinationId, {
          provider_profile_id: null,
          status: "disconnected",
          metadata: {
            ...(asRecord(destination.metadata) ?? {}),
            previous_provider_profile_id: profileId,
            profile_removed_at: new Date().toISOString(),
          },
        })
        try {
          const provider = getProvider()
          if (typeof provider.deleteProfile === "function") {
            await provider.deleteProfile(profileId)
          }
        } catch {
          // ignore — destination delete still proceeds
        }
      }
      const { error } = await userClient.from("publishing_destinations").delete().eq("id", destinationId)
      if (error) return json({ error: { code: "agent_failed", message: error.message } }, 500)
      return json({ ok: true })
    }

    if (action === "open_browser") {
      // First-class Browser tab session (not publishing-specific).
      // Desktop → client-driven WebContentsView; otherwise Cloud Live View.
      const startUrl = normalizeUrl(body.start_url) ?? "https://www.google.com/"
      const profileId = asString(body.profile_id)
      const screen = resolveBrowserViewport(body.browser_viewport ?? body.screen)
      const proxyCountryCode = resolveProxyCountryCode(body.proxy_country_code, body)
      const localBridge = parseLocalBridgeStatus(body)
      const desktopAvailable = parseDesktopAvailability(body)
      const resolved = resolveBrowserProvider({
        operation: "interactive_browser",
        executionMode: asString(body.browser_execution_mode ?? body.execution_mode),
        preferredProvider: asString(body.preferred_provider ?? body.provider),
        desktopAvailable,
        localBridge,
        cloudConfigured: isCloudConfigured(),
      })

      if (resolved.provider === "articulate_desktop") {
        logPub("browser_open_resolved", {
          browser_open_source: asString(body.source) ?? "unknown",
          resolved_provider: "articulate_desktop",
          desktop_available: true,
          reason: resolved.reason,
        })
        return json({
          ok: true,
          provider: "articulate_desktop",
          browser_label: "Desktop",
          desktop_browser: {
            required: true,
            start_url: startUrl,
            profile_id: profileId,
          },
          browser_id: null,
          live_view_url: null,
          start_url: startUrl,
          status: "pending_desktop",
        })
      }

      if (!isCloudConfigured()) {
        return cloudUnavailableResponse({
          localTried: false,
          detail: "BROWSER_USE_API_KEY is not configured.",
        })
      }

      const provider = getProvider("browser_use")
      let browser: Awaited<ReturnType<BrowserAgentProvider["createBrowser"]>>
      try {
        browser = await createBrowserWithCapacity(provider, {
          profileId,
          timeoutMinutes: 90,
          proxyCountryCode,
          startUrl,
          screen,
        })
      } catch (openError) {
        if (isCloudBrowserUnavailableError(openError)) {
          return cloudUnavailableResponse({
            localTried: false,
            detail: sanitizeLogText((openError as Error).message),
          })
        }
        throw openError
      }
      const aligned = await alignLiveViewToPane(provider, {
        liveViewUrl: browser.liveViewUrl,
        browserId: browser.id,
        screen,
      })
      const liveViewUrl = aligned.liveViewUrl
      if (!liveViewUrl) {
        try {
          await provider.stopBrowser(browser.id)
        } catch {
          // ignore
        }
        return json(
          {
            error: {
              code: "agent_failed",
              message: "Remote browser started but no Live View URL was returned.",
            },
          },
          502,
        )
      }
      logPub("browser_opened", {
        browser_open_source: asString(body.source) ?? "unknown",
        resolved_provider: "browser_use",
        desktop_available: desktopAvailable,
        provider_browser_id: browser.id,
        has_live_view: true,
        has_profile: Boolean(profileId),
        proxy_country_code: proxyCountryCode,
        requested_screen_width: screen.width,
        requested_screen_height: screen.height,
      })
      return json({
        ok: true,
        provider: "browser_use",
        browser_label: "Cloud",
        browser_id: browser.id,
        live_view_url: liveViewUrl,
        start_url: startUrl,
        status: browser.status,
        proxy_country_code: proxyCountryCode,
        requested_screen_width: screen.width,
        requested_screen_height: screen.height,
      })
    }

    if (action === "align_browser") {
      const provider = getProvider()
      const screen = resolveBrowserViewport(body.browser_viewport ?? body.screen)
      let browserId = asString(body.browser_id)
      let agentSessionId: string | null = null
      const runId = uuidOrNull(body.run_id)
      let runRow: Record<string, unknown> | null = null
      if (runId) {
        runRow = await loadRun(service, runId)
        await assertCanAccessRun(userClient, runRow, actorUserId)
        browserId = browserId ?? asString(runRow.provider_browser_id)
        agentSessionId = asString(runRow.provider_session_id)
      } else if (!browserId) {
        return json({ error: { code: "invalid_request", message: "browser_id or run_id is required" } }, 400)
      }
      const aligned = await alignLiveViewToPane(provider, {
        browserId,
        agentSessionId,
        screen,
      })
      if (runId && runRow) {
        await updateRun(service, runId, {
          provider_browser_id: aligned.browserId ?? browserId,
          ...(aligned.liveViewUrl ? { live_view_url: aligned.liveViewUrl } : {}),
          metadata: {
            ...(asRecord(runRow.metadata) ?? {}),
            browser_viewport: screen,
            requested_screen_width: screen.width,
            requested_screen_height: screen.height,
            provider_browser_id: aligned.browserId ?? browserId,
          },
        })
      }
      return json({
        ok: true,
        browser_id: aligned.browserId ?? browserId,
        live_view_url: aligned.liveViewUrl,
        resized: true,
        requested_screen_width: screen.width,
        requested_screen_height: screen.height,
      })
    }

    if (action === "control_browser") {
      const provider = getProvider()
      let browserId = asString(body.browser_id)
      let agentSessionId: string | null = null
      const runId = uuidOrNull(body.run_id)
      const command = asString(body.command) ?? "status"
      const allowed = new Set(["status", "navigate", "back", "forward", "reload", "history_entry"])
      if (!allowed.has(command)) {
        return json({ error: { code: "invalid_request", message: "Unsupported browser command" } }, 400)
      }
      if (runId) {
        const runRow = await loadRun(service, runId)
        await assertCanAccessRun(userClient, runRow, actorUserId)
        browserId = browserId ?? asString(runRow.provider_browser_id)
        agentSessionId = asString(runRow.provider_session_id)
      } else if (!browserId) {
        return json({ error: { code: "invalid_request", message: "browser_id or run_id is required" } }, 400)
      }
      const nav = await provider.controlBrowser({
        browserId,
        agentSessionId,
        command: command as
          | "status"
          | "navigate"
          | "back"
          | "forward"
          | "reload"
          | "history_entry",
        url: asString(body.url),
        historyEntryId: Number.isFinite(Number(body.history_entry_id))
          ? Number(body.history_entry_id)
          : null,
      })
      return json({
        ok: true,
        active: nav.active !== false,
        browser_id: browserId,
        url: nav.url,
        title: nav.title,
        can_go_back: nav.canGoBack,
        can_go_forward: nav.canGoForward,
        history: nav.history,
      })
    }

    if (action === "act_browser") {
      const command = asString(body.command)
      if (!isBrowserControllerCommand(command)) {
        return json({ error: { code: "invalid_request", message: "Unsupported browser command" } }, 400)
      }
      let browserId = asString(body.browser_id)
      // Only an explicit publication_run_id may bind this action to publishing.
      // Generic AI Chat run_id must never be treated as a publication run.
      const publicationRunId = uuidOrNull(body.publication_run_id)
      if (publicationRunId) {
        const runRow = await loadRun(service, publicationRunId)
        await assertCanAccessRun(userClient, runRow, actorUserId)
        browserId = browserId ?? asString(runRow.provider_browser_id)
      } else if (!browserId) {
        return json({
          error: {
            code: "browser_session_not_found",
            message: "browser_id is required for generic browser actions",
          },
        }, 400)
      }
      const provider = getProvider("browser_use")
      if (typeof provider.actOnBrowser !== "function") {
        return json({ error: { code: "browser_unavailable", message: "Browser control is not available" } }, 502)
      }
      const acted = await provider.actOnBrowser(browserId, {
        command,
        url: asString(body.url),
        selector: asString(body.selector),
        text: asString(body.text),
        index: Number.isFinite(Number(body.index)) ? Number(body.index) : null,
        key: asString(body.key),
        clear: body.clear === true,
        deltaX: Number.isFinite(Number(body.delta_x ?? body.deltaX)) ? Number(body.delta_x ?? body.deltaX) : null,
        deltaY: Number.isFinite(Number(body.delta_y ?? body.deltaY)) ? Number(body.delta_y ?? body.deltaY) : null,
        ms: Number.isFinite(Number(body.ms)) ? Number(body.ms) : null,
        limit: Number.isFinite(Number(body.limit)) ? Number(body.limit) : null,
      })
      logPub("browser_acted", {
        command,
        provider: "browser_use",
        browser_id: browserId,
        ok: acted.ok,
        url: acted.url,
        error_code: acted.error_code,
      })
      return json({
        ok: acted.ok,
        provider: "browser_use",
        browser_label: "Cloud",
        browser_id: browserId,
        command,
        ...acted,
        show_browser_preview: true,
      })
    }

    if (action === "run_browser") {
      return json({
        error: {
          code: "instruct_removed",
          message: "Browser Use Agent is removed. Use act_browser / use_browser commands instead.",
        },
      }, 410)
    }

    if (action === "publication_reason_step") {
      const task = asString(body.task)
      const state = asRecord(body.state) ?? {}
      const url = asString(state.url)
      if (!task || !url) {
        return json({ error: { code: "invalid_request", message: "task and state.url are required" } }, 400)
      }
      const history = Array.isArray(body.history) ? body.history : []
      const reasoned = await callArticulateReasonStep(
        {
          task,
          url,
          title: asString(state.title),
          elements: Array.isArray(state.elements) ? state.elements : [],
          text: asString(state.note ?? state.text),
          history: history as never,
          step: Number.isFinite(Number(body.step)) ? Number(body.step) : history.length + 1,
          entryUrl: asString(body.entry_url ?? body.entryUrl),
          allowFinalPublish: body.allow_final_publish === true || body.allowFinalPublish === true,
        },
        { apiKey: Deno.env.get("OPENAI_API_KEY"), model: "gpt-4.1-mini" },
      )
      return json({
        ok: true,
        ...reasoned,
        browser_control: "articulate_ai",
      })
    }

    if (action === "update_publication_progress") {
      const runId = uuidOrNull(body.run_id ?? body.publication_run_id)
      if (!runId) return json({ error: { code: "invalid_request", message: "run_id is required" } }, 400)
      const run = await loadRun(service, runId)
      await assertCanAccessRun(userClient, run, actorUserId)
      const phase = asString(body.phase ?? body.publication_phase)
      if (!phase) {
        return json({ error: { code: "invalid_request", message: "phase is required" } }, 400)
      }
      const updated = await applyPublicationProgress(service, run, {
        phase,
        message: asString(body.message),
        externalUrl: asString(body.external_url ?? body.externalUrl),
        externalId: asString(body.external_id ?? body.externalId),
        entryUrl: asString(body.entry_url ?? body.entryUrl),
        scheduleStrategy:
          body.schedule_strategy === "external" || body.schedule_strategy === "internal"
            ? body.schedule_strategy
            : null,
        currentUrl: asString(body.current_url ?? body.currentUrl),
      })
      return json({
        ok: true,
        run: publicRun(updated),
        browser_id: asString(updated.provider_browser_id),
      })
    }

    if (action === "connect_destination") {
      const destinationId = uuidOrNull(body.destination_id)
      if (!destinationId) return json({ error: { code: "invalid_request", message: "destination_id is required" } }, 400)
      const destination = await loadDestination(service, destinationId)
      await assertCanAccessDestination(userClient, destination, actorUserId)
      const provider = getProvider()

      let profileId = asString(destination.provider_profile_id)
      if (!profileId) {
        const projectId = positiveInt(destination.project_id)
        const profile = await provider.createProfile({
          name: projectId
            ? `project-${projectId}-${destinationId.slice(0, 8)}`
            : `user-${actorUserId}-${destinationId.slice(0, 8)}`,
          userId: projectId
            ? `project:${projectId}:destination:${destinationId}`
            : `user:${actorUserId}:destination:${destinationId}`,
        })
        profileId = profile.id
        logPub("profile_created", { destination_id: destinationId, provider_profile_id: profileId })
      }

      // Best-effort cleanup of a previous standalone connect browser (legacy path).
      const previousBrowserId = asString(asRecord(destination.metadata)?.connect_browser_id)
      if (previousBrowserId) {
        try {
          await provider.stopBrowser(previousBrowserId)
          logPub("previous_connect_browser_stopped", {
            destination_id: destinationId,
            provider_browser_id: previousBrowserId,
          })
        } catch {
          // best-effort
        }
      }

      // Human-in-the-loop connect: open the Cloud browser and yield for manual login.
      const startUrl = String(destination.start_url)
      const destinationName = String(destination.name)
      const connectMessage =
        `Sign in directly to ${destinationName} in this browser. Articulate does not receive or store your login credentials.`
      const screen = resolveBrowserViewport(body.browser_viewport ?? body.screen)
      const proxyCountryCode = resolveProxyCountryCode(
        body.browser_region,
        body.proxy_country_code,
        asRecord(destination.metadata),
      )
      const connectOpened = await openCloudBrowserForPublication(provider, {
        profileId,
        startUrl,
        proxyCountryCode,
        screen,
      })
      const connectRun = {
        id: null,
        sessionId: connectOpened.browserId,
      }

      const liveViewUrl = connectOpened.liveViewUrl
      const connectBrowserId = connectOpened.browserId

      if (!liveViewUrl) {
        try {
          await provider.stopBrowser(connectOpened.browserId)
        } catch {
          // ignore
        }
        return json(
          {
            error: {
              code: "browser_unavailable",
              message: "Remote browser started but no Live View URL was returned. Try Connect again.",
            },
          },
          502,
        )
      }

      logPub("connect_run_started", {
        destination_id: destinationId,
        provider_profile_id: profileId,
        provider_run_id: connectRun.id,
        provider_session_id: connectRun.sessionId,
        proxy_country_code: proxyCountryCode,
        requested_screen_width: screen.width,
        requested_screen_height: screen.height,
        has_live_view: true,
      })

      const updated = await updateDestination(service, destinationId, {
        provider_profile_id: profileId,
        status: "connecting" satisfies PublishingDestinationStatus,
        metadata: {
          ...(asRecord(destination.metadata) ?? {}),
          connect_browser_id: connectBrowserId,
          connect_run_id: connectRun.id,
          connect_session_id: connectRun.sessionId,
          verify_run_id: null,
          verify_session_id: null,
          connect_live_view_url: liveViewUrl,
          connect_message: connectMessage,
          last_error: null,
          browser_region: proxyCountryCode,
          proxy_country_code: proxyCountryCode,
          browser_viewport: screen,
          requested_screen_width: screen.width,
          requested_screen_height: screen.height,
        },
      })

      return json({
        ok: true,
        destination: publicDestination(updated),
        live_view_url: liveViewUrl,
        connect_run_id: connectRun.id,
        connect_session_id: connectRun.sessionId,
        start_url: startUrl,
      })
    }

    if (action === "complete_destination_connect" || action === "verify_destination") {
      const destinationId = uuidOrNull(body.destination_id)
      if (!destinationId) return json({ error: { code: "invalid_request", message: "destination_id is required" } }, 400)
      let destination = await loadDestination(service, destinationId)
      await assertCanAccessDestination(userClient, destination, actorUserId)

      // Desktop authentication is completed by the human in the same native
      // WebContentsView. The Edge Function records the handoff and frozen-task
      // continuation; it must never create a Browser Use session to verify it.
      const desktopRunId = uuidOrNull(body.publication_run_id)
      if (desktopRunId) {
        let pending = await loadRun(service, desktopRunId)
        await assertCanAccessRun(userClient, pending, actorUserId)
        if (isDesktopBrowserProvider(pending.provider)) {
          if (String(pending.destination_id) !== destinationId) {
            return json({ error: { code: "invalid_request", message: "Publication belongs to another destination." } }, 409)
          }
          const userConfirmed = body.user_confirmed === true || body.force === true
          if (!userConfirmed) {
            return json({
              ok: true,
              authenticated: false,
              pending: false,
              message: `Finish signing in to ${destination.name} in the Desktop browser, then confirm.`,
              destination: publicDestination(destination),
              run: publicRun(pending),
              resumed_publication: false,
            })
          }
          const pendingMeta = asRecord(pending.metadata) ?? {}
          const sourceSnapshot =
            asRecord(pending.source_snapshot) ??
            asRecord(asRecord(pending.result)?.artifact) ??
            {}
          const publishingArtifact = {
            id: asString(sourceSnapshot.id) ?? desktopRunId,
            type: asString(sourceSnapshot.type) ?? "document",
            title: asString(sourceSnapshot.title) ?? undefined,
            content: asString(sourceSnapshot.content) ?? undefined,
            excerpt: asString(sourceSnapshot.excerpt) ?? undefined,
            slug: asString(sourceSnapshot.slug) ?? undefined,
            seo: asRecord(sourceSnapshot.seo) as { title?: string; description?: string } | undefined,
            media: Array.isArray(sourceSnapshot.media) ? (sourceSnapshot.media as never[]) : undefined,
            metadata: asRecord(sourceSnapshot.metadata) ?? undefined,
          }
          const resumeTask = buildResumePublicationAfterAuthTask({
            destination: destinationTaskContext(destination, asString(publishingArtifact.type)),
            artifact: publishingArtifact,
            files: [],
          })
          destination = await updateDestination(service, destinationId, {
            status: "connected" satisfies PublishingDestinationStatus,
            last_connected_at: new Date().toISOString(),
            last_verified_at: new Date().toISOString(),
          })
          pending = await updateRun(service, desktopRunId, {
            execution_location: "client",
            status: "starting",
            error_code: null,
            error_message: null,
            metadata: {
              ...pendingMeta,
              desktop_browser: true,
              desktop_agent_task: resumeTask,
              awaiting_destination_auth: false,
              user_has_control: false,
              phase_message: "Continuing publication in Articulate Desktop…",
              client_execution: {
                ...(asRecord(pendingMeta.client_execution) ?? {}),
                type: "desktop_browser",
                operation: "continue_publication",
                status: "requested",
                requested_at: new Date().toISOString(),
              },
            },
            activity: appendActivity(
              Array.isArray(pending.activity) ? (pending.activity as PublicationActivityEvent[]) : [],
              "Continuing",
            ),
          })
          return json({
            ok: true,
            authenticated: true,
            pending: false,
            message: `Connected to ${destination.name}. Continuing publication…`,
            destination: publicDestination(destination),
            run: publicRun(pending),
            resumed_publication: true,
            execution: {
              type: "desktop_browser",
              operation: "continue_publication",
              status: "awaiting_client_execution",
            },
          })
        }
      }
      const provider = getProvider()
      const metadata = asRecord(destination.metadata) ?? {}
      const profileId = asString(destination.provider_profile_id)
      if (!profileId) {
        return json({ error: { code: "invalid_request", message: "Destination has no browser profile yet" } }, 400)
      }

      // Same-session handoff: NEVER stop the connect browser/session before continuing.
      // Stopping the Live View browser was the root cause of "Connection Lost".
      const connectSessionId = asString(metadata.connect_session_id) ?? asString(metadata.verify_session_id)
      if (!connectSessionId) {
        return json(
          {
            error: {
              code: "session_expired",
              message:
                "No active browser session to continue. Open Connect again, sign in in the Live View, then continue with the agent.",
            },
          },
          409,
        )
      }

      const verifySessionId = connectSessionId
      const snapshot = await snapshotPublicationBrowser(
        provider,
        asString(metadata.connect_browser_id) ?? connectSessionId,
      )
      let authenticated = true
      const settled = true
      let message = "Destination connected. Continue in the same browser session."
      let errorCode: string | null = null
      let liveViewUrl: string | null = asString(metadata.connect_live_view_url)
      if (snapshot?.auth_required && body.user_confirmed !== true && body.force !== true) {
        authenticated = false
        message = `Sign in directly to ${destination.name} in this browser. Articulate does not receive or store your login credentials.`
        errorCode = "authentication_required"
      }
      try {
        await maybeLearnDestinationMemory(service, destination, {
          contentType: asString(metadata.configure_content_type) ?? "article",
          entryUrl: snapshot?.url ?? null,
        })
        destination = await loadDestination(service, destinationId)
      } catch {
        // best-effort
      }

      const userConfirmed = body.user_confirmed === true || body.force === true
      if (settled && !authenticated && userConfirmed) {
        authenticated = true
        message = `Sign-in confirmed. Continuing with ${destination.name}…`
        errorCode = null
        logPub("verify_destination_user_confirmed", {
          destination_id: destinationId,
          provider_session_id: verifySessionId || connectSessionId,
        })
      }

      const nextStatus: PublishingDestinationStatus = !settled
        ? "connecting"
        : authenticated
          ? "connected"
          : "needs_login"

      const activeSessionId = verifySessionId || connectSessionId
      let resumedRun: Record<string, unknown> | null = null
      let pendingRunSnapshot: Record<string, unknown> | null = null
      let uiMessage = authenticated
        ? `Connected to ${destination.name}`
        : message

      if (settled && authenticated) {
        const pendingRunId =
          uuidOrNull(body.publication_run_id) ??
          uuidOrNull(metadata.pending_publication_run_id)
        if (pendingRunId) {
          try {
            let pending = await loadRun(service, pendingRunId)
            await assertCanAccessRun(userClient, pending, actorUserId)
            pendingRunSnapshot = pending
            if (
              String(pending.destination_id) === destinationId &&
              ["needs_user", "starting", "queued", "running"].includes(String(pending.status))
            ) {
              const pendingMeta = asRecord(pending.metadata) ?? {}
              if (String(pending.status) === "running" && pendingMeta.awaiting_destination_auth !== true) {
                resumedRun = pending
                uiMessage = `Connected to ${destination.name}. Publication already continuing…`
              } else {
              const sourceSnapshot =
                asRecord(pending.source_snapshot) ??
                asRecord(asRecord(pending.result)?.artifact) ??
                {}
              const publishingArtifact = {
                id: asString(sourceSnapshot.id) ?? pendingRunId,
                type: asString(sourceSnapshot.type) ?? "document",
                title: asString(sourceSnapshot.title) ?? undefined,
                content: asString(sourceSnapshot.content) ?? undefined,
                excerpt: asString(sourceSnapshot.excerpt) ?? undefined,
                slug: asString(sourceSnapshot.slug) ?? undefined,
                seo: asRecord(sourceSnapshot.seo) as
                  | { title?: string; description?: string }
                  | undefined,
                media: Array.isArray(sourceSnapshot.media)
                  ? (sourceSnapshot.media as never[])
                  : undefined,
                metadata: asRecord(sourceSnapshot.metadata) ?? undefined,
              }
              const files = Array.isArray(pendingMeta.files)
                ? (pendingMeta.files as Array<{ id: string; name: string; path: string; purpose?: string | null }>)
                : []
              const screen = parseBrowserViewport(pendingMeta.browser_viewport)
              const proxyCountryCode = resolveProxyCountryCode(
                pendingMeta,
                asRecord(destination.metadata),
              )
              const destCtx = destinationTaskContext(
                destination,
                asString(publishingArtifact.type),
              )
              const resumeTask = buildResumePublicationAfterAuthTask({
                destination: destCtx,
                artifact: publishingArtifact,
                files,
              })
              // Same publication handoff: reuse the connect session. Omit workspaceId so V4
              // inherits the session workspace. Never pair old sessionId + unrelated workspace.
              // Files must already belong to that workspace (connect started with it).
              const resumeBrowserId =
                asString(pending.provider_browser_id) ??
                asString(metadata.connect_browser_id) ??
                activeSessionId
              pending = await updateRun(service, pendingRunId, {
                provider_run_id: null,
                provider_session_id: resumeBrowserId,
                provider_browser_id: resumeBrowserId,
                status: "running",
                live_view_url: liveViewUrl,
                error_code: null,
                error_message: null,
                metadata: {
                  ...pendingMeta,
                  awaiting_destination_auth: false,
                  user_has_control: false,
                  phase_message: "Continuing publication…",
                },
                activity: appendActivity(
                  appendActivity(
                    Array.isArray(pending.activity)
                      ? (pending.activity as PublicationActivityEvent[])
                      : [],
                    "Opening destination",
                  ),
                  "Finding content editor",
                ),
              })
              if (!asString(pendingMeta.ai_thread_id)) {
                pending = await runArticulatePublishLoop(service, provider, pending, {
                  task: resumeTask,
                  entryUrl: destCtx.startUrl,
                  allowFinalPublish: false,
                })
              }
              resumedRun = pending
              uiMessage = `Connected to ${destination.name}. Continuing publication…`
              logPub("publication_resumed_after_auth", {
                publication_run_id: pendingRunId,
                destination_id: destinationId,
                provider_run_id: null,
                provider_session_id: resumeBrowserId,
                provider_browser_id: resumeBrowserId,
                same_session: true,
                browser_control: "articulate_ai",
              })
              }
            }
          } catch (resumeError) {
            logPub("publication_resume_after_auth_failed", {
              destination_id: destinationId,
              pending_publication_run_id: pendingRunId,
              error: sanitizeLogText((resumeError as Error).message),
            })
            // Auth still succeeded; client can retry start_publication.
            uiMessage = `Connected to ${destination.name}. Could not auto-continue publication — start it again.`
          }
        }
      }

      const updated = await updateDestination(service, destinationId, {
        status: nextStatus,
        last_connected_at: authenticated ? new Date().toISOString() : destination.last_connected_at,
        last_verified_at: settled || (authenticated && userConfirmed)
          ? new Date().toISOString()
          : destination.last_verified_at,
        metadata: {
          ...metadata,
          // Keep the session alive across repeated human↔agent handoffs.
          connect_browser_id: null,
          connect_run_id: asString(metadata.connect_run_id),
          connect_session_id: activeSessionId,
          verify_run_id: null,
          verify_session_id: activeSessionId,
          connect_live_view_url: liveViewUrl,
          connect_message: uiMessage,
          pending_publication_run_id: resumedRun ? null : metadata.pending_publication_run_id ?? null,
          last_error: authenticated || !settled ? null : message,
          ...(userConfirmed ? { user_confirmed_auth_at: new Date().toISOString() } : {}),
        },
      })

      logPub("verify_destination_result", {
        destination_id: destinationId,
        authenticated,
        pending: !settled,
        user_confirmed: userConfirmed,
        status: nextStatus,
        provider_run_id: null,
        provider_session_id: activeSessionId,
        same_session: true,
        resumed_publication_run_id: resumedRun ? String(resumedRun.id) : null,
        error_code: errorCode,
      })

      return json({
        ok: true,
        authenticated,
        pending: !settled,
        message: uiMessage,
        error_code: errorCode,
        live_view_url: liveViewUrl,
        connect_session_id: activeSessionId,
        destination: publicDestination(updated),
        run: resumedRun
          ? publicRun(resumedRun)
          : pendingRunSnapshot
            ? publicRun(pendingRunSnapshot)
            : null,
        resumed_publication: Boolean(resumedRun),
      })
    }

    if (action === "list_publications") {
      const artifactId = uuidOrNull(body.artifact_id)
      const projectId = positiveInt(body.project_id)
      const activeOnly = body.active_only === true || body.active === true
      const scheduledOnly = body.scheduled_only === true || body.scheduled === true
      const mineOnly = body.mine_only === true || body.started_by_me === true
      const threadId = uuidOrNull(body.ai_thread_id ?? body.thread_id)
      if (!artifactId && !projectId && !mineOnly && !threadId && !scheduledOnly) {
        return json({
          error: {
            code: "invalid_request",
            message: "artifact_id, project_id, mine_only, ai_thread_id, or scheduled_only is required",
          },
        }, 400)
      }
      let query = service.from("publication_runs").select("*").limit(50)
      if (artifactId) {
        await loadArtifactSnapshot(userClient, artifactId)
        query = query.eq("artifact_id", artifactId)
      }
      if (projectId) {
        await assertCanEditProject(userClient, projectId)
        query = query.eq("project_id", projectId)
      }
      if (mineOnly || threadId || scheduledOnly) {
        query = query.eq("started_by", actorUserId)
      }
      if (scheduledOnly) {
        query = query.eq("status", "scheduled")
      }
      if (activeOnly) {
        query = query.in("status", [
          "scheduled",
          "queued",
          "starting",
          "running",
          "needs_user",
          "awaiting_publish_confirmation",
          "publishing",
          "verifying",
        ])
      }
      query = scheduledOnly
        ? query.order("scheduled_at", { ascending: true })
        : query.order("created_at", { ascending: false })
      const { data, error } = await query
      if (error) return json({ error: { code: "agent_failed", message: error.message } }, 500)
      const runs = (data ?? []).filter((row) => {
        const record = row as Record<string, unknown>
        const project = positiveInt(record.project_id)
        if (project) {
          // project-scoped runs already filtered by access above when projectId set;
          // for mine/thread queries allow any accessible project run started by actor.
          if (mineOnly || threadId) {
            return positiveInt(record.started_by) === actorUserId
          }
          return true
        }
        return positiveInt(record.started_by) === actorUserId
      }).filter((row) => {
        if (!threadId) return true
        const metadata = asRecord((row as Record<string, unknown>).metadata) ?? {}
        return asString(metadata.ai_thread_id) === threadId
      })
      return json({ ok: true, runs: runs.map((row) => publicRun(row as Record<string, unknown>)) })
    }

    if (action === "get_publication" || action === "sync_publication") {
      const runId = uuidOrNull(body.run_id ?? body.publication_run_id)
      if (!runId) return json({ error: { code: "invalid_request", message: "run_id is required" } }, 400)
      let run = await loadRun(service, runId)
      await assertCanAccessRun(userClient, run, actorUserId)
      if (action === "sync_publication") {
        // Client runs are advanced by the renderer against the visible browser;
        // the Edge Function must never attempt to instantiate Electron.
        if (!isLocalBrowserProvider(run.provider) && !isDesktopBrowserProvider(run.provider)) {
          const provider = getProviderForRun(run)
          run = await syncProviderRun(service, provider, run)
        }
      }
      return json({
        ok: true,
        run: publicRun(run),
        browser_label: isDesktopBrowserProvider(run.provider)
          ? "Desktop"
          : isLocalBrowserProvider(run.provider)
            ? "Local"
            : "Cloud",
      })
    }

    if (action === "report_local_publication" || action === "report_desktop_publication") {
      const runId = uuidOrNull(body.run_id ?? body.publication_run_id)
      if (!runId) return json({ error: { code: "invalid_request", message: "run_id is required" } }, 400)
      let run = await loadRun(service, runId)
      await assertCanAccessRun(userClient, run, actorUserId)
      const desktopRun = isDesktopBrowserProvider(run.provider)
      const localRun = isLocalBrowserProvider(run.provider)
      if (!localRun && !desktopRun) {
        return json({
          error: {
            code: "invalid_request",
            message: "This publication is not using a client browser provider.",
          },
        }, 409)
      }
      if (action === "report_desktop_publication" && !desktopRun) {
        return json({ error: { code: "invalid_request", message: "This run is not using Articulate Desktop." } }, 409)
      }

      const metadata = asRecord(run.metadata) ?? {}
      const nextStatusRaw = asString(body.status)
      const allowed: PublicationRunStatus[] = [
        "starting",
        "running",
        "needs_user",
        "awaiting_publish_confirmation",
        "publishing",
        "verifying",
        "published",
        "failed",
        "cancelled",
        "uncertain",
        "scheduled",
      ]
      const nextStatus =
        nextStatusRaw && allowed.includes(nextStatusRaw as PublicationRunStatus)
          ? (nextStatusRaw as PublicationRunStatus)
          : null

      const clientBrowserId = asString(
        desktopRun
          ? body.desktop_browser_id ?? body.browser_id ?? body.provider_session_id
          : body.bridge_session_id ?? body.provider_session_id,
      )
      const phaseMessage = asString(body.phase_message ?? body.message)
      const externalUrl = asString(body.external_url)
      const externalId = asString(body.external_id)
      const scheduleStrategy = parseScheduleStrategy(body.schedule_strategy)
      const activityLabel = asString(body.activity_label)

      const patch: Record<string, unknown> = {
        metadata: {
          ...metadata,
          ...(desktopRun ? { desktop_browser: true } : { local_browser: true }),
          phase_message: phaseMessage ?? metadata.phase_message ?? null,
          awaiting_destination_auth: body.awaiting_destination_auth === true,
          user_has_control:
            body.user_has_control === true ||
            nextStatus === "needs_user" ||
            nextStatus === "awaiting_publish_confirmation",
          ...(desktopRun
            ? {
                desktop_browser_id: clientBrowserId ?? metadata.desktop_browser_id ?? null,
                desktop_agent_status: asString(body.agent_status),
                desktop_agent_thought: asString(body.thought),
                client_execution: {
                  ...(asRecord(metadata.client_execution) ?? {}),
                  type: "desktop_browser",
                  operation:
                    asString(body.execution_operation) ??
                    asString(asRecord(metadata.client_execution)?.operation) ??
                    "prepare_publication",
                  status:
                    nextStatus === "needs_user"
                      ? "needs_user"
                      : ["published", "failed", "cancelled", "uncertain", "scheduled"].includes(nextStatus ?? "")
                        ? "completed"
                        : "running",
                  updated_at: new Date().toISOString(),
                },
              }
            : {
                bridge_session_id: clientBrowserId ?? metadata.bridge_session_id ?? null,
                last_local_agent_status: asString(body.agent_status),
                last_local_agent_thought: asString(body.thought),
              }),
          ...(scheduleStrategy ? { pending_schedule_strategy: scheduleStrategy } : {}),
        },
      }
      if (clientBrowserId) {
        patch.provider_session_id = clientBrowserId
        if (desktopRun) patch.provider_browser_id = clientBrowserId
      }
      if (nextStatus) {
        if (!canTransitionPublicationStatus(String(run.status) as PublicationRunStatus, nextStatus)) {
          // Allow idempotent same-status updates from the local driver.
          if (String(run.status) !== nextStatus) {
            return json({
              error: {
                code: "invalid_request",
                message: `Cannot transition local publication from ${String(run.status)} to ${nextStatus}`,
              },
            }, 409)
          }
        } else {
          patch.status = nextStatus
        }
      }
      if (externalUrl) patch.external_url = externalUrl
      if (externalId) patch.external_id = externalId
      if (nextStatus === "published") {
        patch.published_at = new Date().toISOString()
        patch.completed_at = new Date().toISOString()
        patch.error_code = null
        patch.error_message = null
      }
      if (nextStatus === "scheduled") {
        patch.live_view_url = null
        if (scheduleStrategy) patch.schedule_strategy = scheduleStrategy
        ;(patch.metadata as Record<string, unknown>).schedule_wording =
          scheduleStrategy === "external" ? "destination" : "articulate"
        ;(patch.metadata as Record<string, unknown>).phase_message =
          scheduleStrategy === "external"
            ? `Scheduled in ${asString(metadata.destination_name) ?? "destination"}`
            : "Scheduled by Articulate"
      }
      if (nextStatus === "failed" || nextStatus === "cancelled" || nextStatus === "uncertain") {
        patch.completed_at = new Date().toISOString()
        patch.error_code =
          asString(body.error_code) ??
          (nextStatus === "cancelled" ? "cancelled" : nextStatus === "uncertain" ? "uncertain" : "agent_failed")
        patch.error_message =
          phaseMessage ??
          userFacingErrorMessage(asString(patch.error_code), asString(body.error_message))
      }
      if (activityLabel) {
        patch.activity = appendActivity(
          Array.isArray(run.activity) ? (run.activity as PublicationActivityEvent[]) : [],
          activityLabel,
        )
      }

      // Mark destination connected when user finished local auth.
      if (body.destination_connected === true) {
        await updateDestination(service, String(run.destination_id), {
          status: "connected" satisfies PublishingDestinationStatus,
          last_connected_at: new Date().toISOString(),
          last_verified_at: new Date().toISOString(),
        })
        ;(patch.metadata as Record<string, unknown>).awaiting_destination_auth = false
      }

      run = await updateRun(service, runId, patch)
      return json({
        ok: true,
        run: publicRun(run),
        browser_label: desktopRun ? "Desktop" : "Local",
      })
    }

    if (action === "start_publication") {
      const artifactId = uuidOrNull(body.artifact_id)
      const inlineContent = asRecord(body.content)
      const destinationId = uuidOrNull(body.destination_id)
      if ((!artifactId && !inlineContent) || !destinationId) {
        return json({
          error: {
            code: "invalid_request",
            message: "destination_id and either artifact_id or content are required",
          },
        }, 400)
      }

      let artifactProjectId: number | null = null
      let publishingArtifact: ReturnType<typeof mapArtifactToPublishingArtifact>
      let sourceType: "artifact" | "inline" = "artifact"

      if (artifactId) {
        const artifact = await loadArtifactSnapshot(userClient, artifactId)
        artifactProjectId = await resolveOptionalProjectIdForArtifact(userClient, service, artifact)
        const seo = await loadTaskSeo(service, positiveInt(artifact.task_id))
        publishingArtifact = mapArtifactToPublishingArtifact({ artifact, seo })
        sourceType = "artifact"
      } else {
        publishingArtifact = mapInlineContentToPublishingArtifact(inlineContent ?? {})
        sourceType = "inline"
        if (!asString(publishingArtifact.title) && !asString(publishingArtifact.content)) {
          return json({
            error: {
              code: "invalid_request",
              message: "Inline content requires at least a title or body",
            },
          }, 400)
        }
      }

      const destination = await loadDestination(service, destinationId)
      await assertCanAccessDestination(userClient, destination, actorUserId)
      const destinationProjectId = positiveInt(destination.project_id)
      if (destinationProjectId != null && artifactProjectId != null && destinationProjectId !== artifactProjectId) {
        return json({ error: { code: "forbidden", message: "Destination belongs to another project" } }, 403)
      }
      if (destinationProjectId != null && artifactId && artifactProjectId == null) {
        return json({
          error: {
            code: "forbidden",
            message: "This destination is project-scoped. Choose a personal destination or use a project artifact.",
          },
        }, 403)
      }
      const destinationMeta = asRecord(destination.metadata) ?? {}
      const screen = resolveBrowserViewport(body.browser_viewport ?? body.screen)
      const proxyCountryCode = resolveProxyCountryCode(
        body.browser_region,
        body.proxy_country_code,
        destinationMeta,
      )
      const destStatus = String(destination.status)
      let isConnected = destStatus === "connected"
      // Preserve publication intent before auth interrupts the flow.
      let needsAuthentication = !isConnected
      const destCtx = destinationTaskContext(destination, asString(publishingArtifact.type))
      const aiThreadId = uuidOrNull(body.ai_thread_id ?? body.thread_id)
      const publishMode = parsePublishMode(body.publish_mode ?? body.mode)
      const forcedStrategy = parseScheduleStrategy(
        body.schedule_strategy ?? (body.prefer_internal_schedule === true ? "internal" : null),
      )
      const localBridge = parseLocalBridgeStatus(body)
      const desktopAvailable = parseDesktopAvailability(body)
      const resolved = resolveBrowserProvider({
        operation:
          publishMode === "scheduled" && forcedStrategy !== "internal"
            ? "native_schedule"
            : "immediate_publication",
        executionMode: asString(body.browser_execution_mode ?? body.execution_mode),
        preferredProvider: asString(body.preferred_provider ?? body.provider),
        desktopAvailable,
        localBridge,
        cloudConfigured: isCloudConfigured(),
      })
      // Provider selection before any irreversible browser/Cloud work.
      if (resolved.provider === "browser_use" && !isCloudConfigured()) {
        return cloudUnavailableResponse({
          localTried: false,
          detail: "BROWSER_USE_API_KEY is not configured.",
        })
      }
      // Desktop is client-driven — do not instantiate a server provider yet.
      const provider =
        resolved.provider === "articulate_desktop"
          ? null
          : getProvider("browser_use")
      let profileId: string | null = null
      if (provider) {
        profileId = await ensureDestinationProfileId(
          service,
          provider,
          destination,
          actorUserId,
        )
      } else {
        profileId = asString((asRecord(destination.metadata) ?? {}).provider_profile_id) ??
          asString(destination.provider_profile_id)
      }
      let scheduledAt: Date | null = null
      let scheduleTimezone = "UTC"
      if (publishMode === "scheduled") {
        scheduledAt = parseScheduledAt(body.scheduled_at ?? body.scheduledAt)
        if (!scheduledAt) {
          return json({
            error: {
              code: "invalid_request",
              message: "scheduled_at is required for scheduled publications (ISO-8601 / timestamptz).",
            },
          }, 400)
        }
        if (scheduledAt.getTime() <= Date.now() - 60_000) {
          return json({
            error: {
              code: "invalid_request",
              message: "scheduled_at must be in the future.",
            },
          }, 400)
        }
        scheduleTimezone = normalizeIanaTimezone(
          body.timezone ?? body.schedule_timezone ?? body.scheduleTimezone,
          "UTC",
        )
      }

      const sourceSnapshot = {
        ...publishingArtifact,
        source_type: sourceType,
        captured_at: new Date().toISOString(),
      }
      const runProjectId = destinationProjectId ?? artifactProjectId

      // Internal park (no live browser): forced internal, or scheduled while destination needs login.
      const parkInternalNow =
        publishMode === "scheduled" &&
        (forcedStrategy === "internal" || needsAuthentication)

      if (parkInternalNow && scheduledAt) {
        // Internal schedules execute unattended via Cloud later — refuse impossible schedules.
        if (!isCloudConfigured()) {
          return json(
            {
              ok: false,
              error: {
                code: "cloud_browser_unavailable",
                message:
                  "This website does not appear to support native scheduling (or sign-in is still required). Articulate would need the Cloud browser to publish automatically later, but Cloud execution is currently unavailable.",
              },
              schedule_blocked: true,
              schedule_strategy: "internal",
              cloud_available: false,
            },
            503,
          )
        }
        const { data: inserted, error: insertError } = await service
          .from("publication_runs")
          .insert({
            project_id: runProjectId,
            artifact_id: artifactId,
            source_type: sourceType,
            source_snapshot: sourceSnapshot,
            destination_id: destinationId,
            started_by: actorUserId,
            provider: "browser_use",
            status: "scheduled",
            publish_mode: "scheduled",
            scheduled_at: scheduledAt.toISOString(),
            schedule_timezone: scheduleTimezone,
            schedule_strategy: "internal",
            started_at: new Date().toISOString(),
            activity: appendActivity([], "Scheduled"),
            metadata: {
              destination_name: destination.name,
              artifact_title: publishingArtifact.title ?? null,
              content_type: publishingArtifact.type ?? null,
              final_publish_attempted: false,
              user_has_control: false,
              awaiting_destination_auth: false,
              source_type: sourceType,
              preferred_start_url: destCtx.startUrl,
              start_url_source: destCtx.startSource,
              phase_message: needsAuthentication
                ? "Scheduled by Articulate. Sign-in may be required when the publication executes."
                : "Scheduled by Articulate.",
              schedule_authorized: true,
              schedule_wording: "articulate",
              browser_provider_resolved: "browser_use",
              browser_provider_reason: "unattended_requires_cloud",
              ...(aiThreadId ? { ai_thread_id: aiThreadId } : {}),
            },
            result: { artifact: publishingArtifact },
          })
          .select("*")
          .single()
        if (insertError || !inserted) {
          return json({ error: { code: "agent_failed", message: insertError?.message ?? "Could not create run" } }, 500)
        }
        logPub("publication_scheduled_internal", {
          publication_run_id: inserted.id,
          destination_id: destinationId,
          scheduled_at: scheduledAt.toISOString(),
          schedule_timezone: scheduleTimezone,
          needs_authentication_later: needsAuthentication,
        })
        return json({
          ok: true,
          needs_authentication: false,
          scheduled: true,
          schedule_strategy: "internal",
          run: publicRun(inserted as Record<string, unknown>),
          artifact: publishingArtifact,
          message: `Scheduled by Articulate for ${formatScheduledAtForDisplay(scheduledAt, scheduleTimezone)} (${scheduleTimezone}).`,
        })
      }

      // ── Desktop browser path (client drives Electron WebContentsView) ──
      if (resolved.provider === "articulate_desktop") {
        const task =
          publishMode === "scheduled" && scheduledAt
            ? buildPrepareScheduledPublicationTask({
                destination: destCtx,
                artifact: publishingArtifact,
                files: [],
                scheduledAtIso: scheduledAt.toISOString(),
                timezone: scheduleTimezone,
              })
            : buildPreparePublicationTask({
                destination: destCtx,
                artifact: publishingArtifact,
                files: [],
              })

        const connectMessage =
          `Sign in directly to ${destination.name} in the Desktop browser if needed. Articulate does not receive or store your login credentials.`

        const { data: inserted, error: insertError } = await service
          .from("publication_runs")
          .insert({
            project_id: runProjectId,
            artifact_id: artifactId,
            source_type: sourceType,
            source_snapshot: sourceSnapshot,
            destination_id: destinationId,
            started_by: actorUserId,
            provider: "articulate_desktop",
            execution_location: resolved.executionLocation,
            status: needsAuthentication ? "needs_user" : "starting",
            publish_mode: publishMode,
            scheduled_at: scheduledAt ? scheduledAt.toISOString() : null,
            schedule_timezone: publishMode === "scheduled" ? scheduleTimezone : null,
            schedule_strategy: publishMode === "scheduled" ? (forcedStrategy ?? "external") : null,
            started_at: new Date().toISOString(),
            activity: appendActivity(
              [],
              needsAuthentication ? "Waiting for user" : "Opening desktop browser",
            ),
            metadata: {
              destination_name: destination.name,
              artifact_title: publishingArtifact.title ?? null,
              content_type: publishingArtifact.type ?? null,
              final_publish_attempted: false,
              user_has_control: needsAuthentication,
              awaiting_destination_auth: needsAuthentication,
              files: [],
              source_type: sourceType,
              browser_viewport: screen,
              preferred_start_url: destCtx.startUrl,
              start_url_source: destCtx.startSource,
              schedule_authorized: publishMode === "scheduled",
              browser_provider_resolved: "articulate_desktop",
              browser_provider_reason: resolved.reason,
              desktop_browser: true,
              desktop_agent_task: task,
              client_execution: {
                type: "desktop_browser",
                operation: "prepare_publication",
                status: "requested",
                requested_at: new Date().toISOString(),
                client_session_id: asString(body.desktop_session_id),
              },
              phase_message: needsAuthentication
                ? connectMessage
                : "Browser running in Articulate Desktop",
              ...(aiThreadId ? { ai_thread_id: aiThreadId } : {}),
            },
            result: { artifact: publishingArtifact },
          })
          .select("*")
          .single()
        if (insertError || !inserted) {
          return json({ error: { code: "agent_failed", message: insertError?.message ?? "Could not create run" } }, 500)
        }

        logPub("publication_desktop_pending", {
          run_id: inserted.id,
          destination_id: destinationId,
          needs_authentication: needsAuthentication,
        })

        return json({
          ok: true,
          needs_authentication: needsAuthentication,
          provider: "articulate_desktop",
          browser_label: "Desktop",
          run: publicRun(inserted as Record<string, unknown>),
          artifact: publishingArtifact,
          message: needsAuthentication ? connectMessage : "Browser running in Articulate Desktop",
          desktop_browser: {
            required: true,
            start_url: destCtx.startUrl,
            task,
            profile_id: profileId,
          },
          execution: {
            type: "desktop_browser",
            operation: "prepare_publication",
            status: "awaiting_client_execution",
          },
        })
      }

      // ── Cloud browser path ──
      if (!provider) {
        return json(
          { error: { code: "agent_failed", message: "Cloud browser provider is unavailable." } },
          500,
        )
      }
      let workspace: Awaited<ReturnType<BrowserAgentProvider["createWorkspace"]>>
      try {
        workspace = await provider.createWorkspace(
          `pub-${(artifactId ?? publishingArtifact.id).slice(0, 8)}`,
        )
      } catch (workspaceError) {
        if (isCloudBrowserUnavailableError(workspaceError)) {
          return cloudUnavailableResponse({
            localTried: false,
            detail: sanitizeLogText((workspaceError as Error).message),
          })
        }
        throw workspaceError
      }
      let files: Awaited<ReturnType<typeof uploadArtifactFiles>> = []
      try {
        files = await uploadArtifactFiles(provider, service, workspace.id, publishingArtifact)
      } catch (error) {
        const code = (error as { code?: string }).code ?? "upload_failed"
        return json({ error: { code, message: userFacingErrorMessage(code, (error as Error).message) } }, 500)
      }

      const { data: inserted, error: insertError } = await service
        .from("publication_runs")
        .insert({
          project_id: runProjectId,
          artifact_id: artifactId,
          source_type: sourceType,
          source_snapshot: sourceSnapshot,
          destination_id: destinationId,
          started_by: actorUserId,
          provider: "browser_use",
          status: needsAuthentication ? "needs_user" : "starting",
          publish_mode: publishMode,
          scheduled_at: scheduledAt ? scheduledAt.toISOString() : null,
          schedule_timezone: publishMode === "scheduled" ? scheduleTimezone : null,
          schedule_strategy: publishMode === "scheduled" ? (forcedStrategy ?? null) : null,
          started_at: new Date().toISOString(),
          provider_workspace_id: workspace.id,
          activity: appendActivity(
            [],
            needsAuthentication ? "Waiting for user" : "Opening destination",
          ),
          metadata: {
            destination_name: destination.name,
            artifact_title: publishingArtifact.title ?? null,
            content_type: publishingArtifact.type ?? null,
            final_publish_attempted: false,
            user_has_control: needsAuthentication,
            awaiting_destination_auth: needsAuthentication,
            files,
            source_type: sourceType,
            browser_viewport: screen,
            browser_region: proxyCountryCode,
            proxy_country_code: proxyCountryCode,
            requested_screen_width: screen.width,
            requested_screen_height: screen.height,
            profile_loaded: Boolean(profileId),
            profile_id_suffix: profileIdSuffix(profileId),
            preferred_start_url: destCtx.startUrl,
            start_url_source: destCtx.startSource,
            schedule_authorized: publishMode === "scheduled",
            ...(aiThreadId ? { ai_thread_id: aiThreadId } : {}),
          },
          result: { artifact: publishingArtifact },
        })
        .select("*")
        .single()
      if (insertError || !inserted) {
        return json({ error: { code: "agent_failed", message: insertError?.message ?? "Could not create run" } }, 500)
      }

      if (needsAuthentication) {
        // NEW publication auth: always create a fresh Browser Use session bound to THIS
        // publication workspace. Never reuse destination metadata.connect_session_id —
        // that session is paired with a different (or no) workspace and causes
        // "session belongs to a different workspace". Durable auth is provider_profile_id.
        const connectMessage =
          `Sign in directly to ${destination.name} in this browser. Articulate does not receive or store your login credentials.`

        let connectOpened: Awaited<ReturnType<typeof openCloudBrowserForPublication>>
        try {
          connectOpened = await openCloudBrowserForPublication(provider, {
            profileId,
            startUrl: String(destination.start_url),
            proxyCountryCode,
            screen,
          })
        } catch (connectError) {
          const message = sanitizeLogText((connectError as Error).message)
          await updateRun(service, String(inserted.id), {
            status: "failed",
            error_code: "browser_unavailable",
            error_message: message || "Could not start remote browser for sign-in.",
            completed_at: new Date().toISOString(),
            metadata: {
              ...(asRecord(inserted.metadata) ?? {}),
              last_provider_error: message,
            },
          })
          throw connectError
        }

        const connectRunId = null
        const connectSessionId = connectOpened.browserId
        const liveViewUrl = connectOpened.liveViewUrl
        const connectBrowserId = connectOpened.browserId
        if (!liveViewUrl) {
          try {
            await provider.stopBrowser(connectOpened.browserId)
          } catch {
            // ignore
          }
          await updateRun(service, String(inserted.id), {
            status: "failed",
            error_code: "agent_failed",
            error_message: "Remote browser started but no Live View URL was returned. Try again.",
            completed_at: new Date().toISOString(),
            provider_run_id: connectRunId,
            provider_session_id: connectSessionId,
          })
          return json(
            {
              error: {
                code: "agent_failed",
                message: "Remote browser started but no Live View URL was returned. Try again.",
              },
            },
            502,
          )
        }

        // Transient connect_* metadata is diagnostics only; durable auth is provider_profile_id.
        await updateDestination(service, destinationId, {
          provider_profile_id: profileId,
          status: "connecting" satisfies PublishingDestinationStatus,
          metadata: {
            ...destinationMeta,
            connect_run_id: connectRunId,
            connect_session_id: connectSessionId,
            connect_browser_id: connectBrowserId,
            connect_live_view_url: liveViewUrl,
            connect_message: connectMessage,
            connect_session_legacy: true,
            pending_publication_run_id: String(inserted.id),
            last_error: null,
            discover_publishing_setup: true,
            configure_content_type: asString(publishingArtifact.type) ?? "article",
          },
        })

        const run = await updateRun(service, String(inserted.id), {
          provider_run_id: connectRunId,
          provider_session_id: connectSessionId,
          provider_workspace_id: workspace.id,
          provider_browser_id: connectBrowserId,
          status: "needs_user",
          live_view_url: liveViewUrl,
          error_code: "authentication_required",
          error_message: connectMessage,
          metadata: {
            destination_name: destination.name,
            artifact_title: publishingArtifact.title ?? null,
            final_publish_attempted: false,
            user_has_control: true,
            awaiting_destination_auth: true,
            phase_message: connectMessage,
            files,
            source_type: sourceType,
            browser_viewport: screen,
            requested_screen_width: screen?.width ?? null,
            requested_screen_height: screen?.height ?? null,
            provider_browser_id: connectBrowserId,
          },
          activity: appendActivity([], "Waiting for user"),
        })

        logPub("publication_awaiting_auth", {
          publication_run_id: run.id,
          destination_id: destinationId,
          provider_run_id: connectRunId,
          provider_session_id: connectSessionId,
          provider_workspace_id: workspace.id,
          provider_browser_id: connectBrowserId,
          proxy_country_code: proxyCountryCode,
          requested_screen_width: screen?.width ?? null,
          requested_screen_height: screen?.height ?? null,
          has_live_view: Boolean(liveViewUrl),
        })

        return json({
          ok: true,
          needs_authentication: true,
          run: publicRun(run),
          artifact: publishingArtifact,
          live_view_url: liveViewUrl,
          connect_session_id: connectSessionId,
          message: connectMessage,
        })
      }

      // Destination already connected — NEW publication: new session + new workspace + profile.
      // Never reuse destination metadata.connect_session_id (transient; wrong workspace).
      const task =
        publishMode === "scheduled" && scheduledAt
          ? buildPrepareScheduledPublicationTask({
              destination: destCtx,
              artifact: publishingArtifact,
              files,
              scheduledAtIso: scheduledAt.toISOString(),
              timezone: scheduleTimezone,
            })
          : buildPreparePublicationTask({
              destination: destCtx,
              artifact: publishingArtifact,
              files,
            })
      const tRunCreateStart = Date.now()
      let opened: Awaited<ReturnType<typeof openCloudBrowserForPublication>>
      try {
        opened = await openCloudBrowserForPublication(provider, {
          profileId,
          startUrl: destCtx.startUrl,
          proxyCountryCode,
          screen,
        })
      } catch (startError) {
        if (isMissingProfileError(startError)) {
          profileId = await recreateDestinationProfileId(
            service,
            provider,
            destination,
            actorUserId,
            profileId,
          )
          const connectMessage =
            `Sign in directly to ${destination.name} in this browser. Articulate does not receive or store your login credentials.`
          const connectOpened = await openCloudBrowserForPublication(provider, {
            profileId,
            startUrl: String(destination.start_url),
            proxyCountryCode,
            screen,
          })
          const liveViewUrl = connectOpened.liveViewUrl
          const connectBrowserId = connectOpened.browserId
          await updateDestination(service, destinationId, {
            provider_profile_id: profileId,
            status: "connecting",
            metadata: {
              ...destinationMeta,
              connect_run_id: null,
              connect_session_id: connectBrowserId,
              connect_browser_id: connectBrowserId,
              connect_live_view_url: liveViewUrl,
              connect_message: connectMessage,
              pending_publication_run_id: String(inserted.id),
              discover_publishing_setup: true,
              last_error: null,
            },
          })
          const authRun = await updateRun(service, String(inserted.id), {
            provider_run_id: null,
            provider_session_id: connectBrowserId,
            provider_browser_id: connectBrowserId,
            status: "needs_user",
            live_view_url: liveViewUrl,
            error_code: "authentication_required",
            error_message: connectMessage,
            metadata: {
              ...(asRecord(inserted.metadata) ?? {}),
              awaiting_destination_auth: true,
              user_has_control: true,
              phase_message: connectMessage,
              profile_recreated: true,
              browser_control: "articulate_ai",
            },
            activity: appendActivity([], "Waiting for user"),
          })
          return json({
            ok: true,
            needs_authentication: true,
            live_view_url: liveViewUrl,
            run: publicRun(authRun),
            browser_id: connectBrowserId,
            snapshot: connectOpened.snapshot,
            message: connectMessage,
          })
        }
        const message = sanitizeLogText((startError as Error).message)
        await updateRun(service, String(inserted.id), {
          status: "failed",
          error_code: "browser_unavailable",
          error_message: message || "Could not start publication browser session.",
          completed_at: new Date().toISOString(),
          metadata: {
            ...(asRecord(inserted.metadata) ?? {}),
            last_provider_error: message,
            requested_screen_width: screen?.width ?? null,
            requested_screen_height: screen?.height ?? null,
          },
        })
        throw startError
      }
      const tRunCreatedMs = Date.now() - tRunCreateStart
      const liveViewUrl = opened.liveViewUrl
      const providerBrowserId = opened.browserId
      const tBrowserReadyMs = Date.now() - tRunCreateStart

      const run = await updateRun(service, String(inserted.id), {
        provider_run_id: null,
        provider_session_id: providerBrowserId,
        provider_workspace_id: workspace.id,
        provider_browser_id: providerBrowserId,
        status: "running",
        live_view_url: liveViewUrl,
        activity: appendActivity(appendActivity([], "Opening destination"), "Finding content editor"),
        metadata: {
          destination_name: destination.name,
          artifact_title: publishingArtifact.title ?? null,
          content_type: publishingArtifact.type ?? null,
          final_publish_attempted: false,
          user_has_control: false,
          awaiting_destination_auth: false,
          files,
          source_type: sourceType,
          browser_viewport: screen,
          browser_region: proxyCountryCode,
          proxy_country_code: proxyCountryCode,
          requested_screen_width: screen?.width ?? null,
          requested_screen_height: screen?.height ?? null,
          provider_browser_id: providerBrowserId,
          profile_loaded: Boolean(profileId),
          profile_id_suffix: profileIdSuffix(profileId),
          preferred_start_url: destCtx.startUrl,
          start_url_source: destCtx.startSource,
          ...(aiThreadId ? { ai_thread_id: aiThreadId } : {}),
          timing_ms: {
            run_create: tRunCreatedMs,
            browser_ready: tBrowserReadyMs,
          },
        },
      })

      logPub("publication_started", {
        publication_run_id: run.id,
        destination_id: destinationId,
        artifact_id: artifactId,
        source_type: sourceType,
        provider_run_id: null,
        provider_session_id: providerBrowserId,
        provider_workspace_id: workspace.id,
        provider_browser_id: providerBrowserId,
        reused_connect_session: false,
        new_browser_session: true,
        profile_loaded: Boolean(profileId),
        profile_id_suffix: profileIdSuffix(profileId),
        has_live_view: Boolean(liveViewUrl),
        file_count: files.length,
        browser_region: proxyCountryCode,
        proxy_country_code: proxyCountryCode,
        pane_width: screen?.width ?? null,
        pane_height: screen?.height ?? null,
        requested_screen_width: screen?.width ?? null,
        requested_screen_height: screen?.height ?? null,
        record: false,
        timing_ms: {
          run_create: tRunCreatedMs,
          browser_ready: tBrowserReadyMs,
        },
      })

      return json({
        ok: true,
        needs_authentication: false,
        run: publicRun(run),
        artifact: publishingArtifact,
        browser_id: providerBrowserId,
        snapshot: opened.snapshot,
        publication_brief: {
          title: publishingArtifact.title ?? null,
          type: publishingArtifact.type ?? null,
          start_url: destCtx.startUrl,
          destination_name: destination.name,
          task,
        },
        diagnostics: {
          new_browser_session: true,
          reused_connect_session: false,
          profile_loaded: Boolean(profileId),
          profile_id_suffix: profileIdSuffix(profileId),
          browser_region: proxyCountryCode,
          proxy_country_code: proxyCountryCode,
          pane_width: screen?.width ?? null,
          pane_height: screen?.height ?? null,
          requested_screen_width: screen?.width ?? null,
          requested_screen_height: screen?.height ?? null,
          record: false,
          timing_ms: {
            run_create: tRunCreatedMs,
            browser_ready: tBrowserReadyMs,
          },
        },
      })
    }

    if (action === "take_control") {
      const runId = uuidOrNull(body.run_id)
      if (!runId) return json({ error: { code: "invalid_request", message: "run_id is required" } }, 400)
      let run = await loadRun(service, runId)
      await assertCanAccessRun(userClient, run, actorUserId)
      const metadata = { ...(asRecord(run.metadata) ?? {}), user_has_control: true }
      if (!isLocalBrowserProvider(run.provider) && asString(run.provider_browser_id)) {
        const provider = getProviderForRun(run)
        const live = await provider.getLiveView("", asString(run.provider_browser_id))
        if (live.liveViewUrl) run = await updateRun(service, runId, { live_view_url: live.liveViewUrl })
      }
      run = await updateRun(service, runId, {
        status: String(run.status) === "running" ? "needs_user" : run.status,
        metadata,
        error_message: asString(body.message) ?? "Take control of the browser to continue.",
        activity: appendActivity(
          Array.isArray(run.activity) ? (run.activity as PublicationActivityEvent[]) : [],
          "Waiting for user",
        ),
      })
      return json({ ok: true, run: publicRun(run) })
    }

    if (action === "continue_after_user") {
      const runId = uuidOrNull(body.run_id)
      if (!runId) return json({ error: { code: "invalid_request", message: "run_id is required" } }, 400)
      let run = await loadRun(service, runId)
      await assertCanAccessRun(userClient, run, actorUserId)
      if (String(run.status) === "awaiting_publish_confirmation") {
        return json({
          error: {
            code: "invalid_request",
            message: "Publication is ready. Confirm publication instead of continuing.",
          },
        }, 409)
      }
      if (["published", "uncertain"].includes(String(run.status))) {
        return json({
          error: {
            code: "uncertain",
            message: userFacingErrorMessage("uncertain"),
          },
        }, 409)
      }

      if (isLocalBrowserProvider(run.provider)) {
        const metadata = asRecord(run.metadata) ?? {}
        const continueText = buildContinueAfterUserTask(asString(body.message))
        run = await updateRun(service, runId, {
          status: "running",
          error_code: null,
          error_message: null,
          metadata: {
            ...metadata,
            user_has_control: false,
            awaiting_destination_auth: false,
            local_agent_task: continueText,
            local_continue_pending: true,
            phase_message: "Continuing in local browser…",
          },
          activity: appendActivity(
            Array.isArray(run.activity) ? (run.activity as PublicationActivityEvent[]) : [],
            "Continuing",
          ),
        })
        return json({
          ok: true,
          run: publicRun(run),
          local_continue: {
            required: true,
            task: continueText,
            bridge_session_id: asString(metadata.bridge_session_id) ?? asString(run.provider_session_id),
          },
          browser_label: "Local",
        })
      }

      const browserId = asString(run.provider_browser_id)
      if (!browserId) {
        return json({ error: { code: "session_expired", message: userFacingErrorMessage("session_expired") } }, 409)
      }
      const provider = getProviderForRun(run)
      const continueText = buildContinueAfterUserTask(asString(body.message))
      let snapshot
      try {
        snapshot = await snapshotPublicationBrowser(provider, browserId)
      } catch (continueError) {
        const msg = (continueError as Error).message
        if (!isStaleSessionError(msg) || Boolean(asRecord(run.metadata)?.final_publish_attempted)) {
          throw continueError
        }
        const destination = await loadDestination(service, String(run.destination_id))
        const profileId = asString(destination.provider_profile_id)
        if (!profileId) throw continueError
        const proxyCountryCode = resolveProxyCountryCode(
          asRecord(run.metadata),
          asRecord(destination.metadata),
        )
        const destCtx = destinationTaskContext(destination)
        logPub("continue_after_user_stale_session", {
          publication_run_id: runId,
          previous_provider_browser_id: browserId,
          proxy_country_code: proxyCountryCode,
          error: sanitizeLogText(msg),
        })
        const opened = await openCloudBrowserForPublication(provider, {
          profileId,
          startUrl: destCtx.startUrl,
          proxyCountryCode,
        })
        snapshot = opened.snapshot
        run = await updateRun(service, runId, {
          provider_run_id: null,
          provider_session_id: opened.browserId,
          provider_browser_id: opened.browserId,
          live_view_url: opened.liveViewUrl,
        })
      }
      const live = await provider.getLiveView("", asString(run.provider_browser_id))
      run = await updateRun(service, runId, {
        provider_run_id: null,
        provider_session_id: asString(run.provider_browser_id),
        status: "running",
        live_view_url: live.liveViewUrl ?? run.live_view_url,
        error_code: null,
        error_message: null,
        metadata: {
          ...(asRecord(run.metadata) ?? {}),
          user_has_control: false,
          phase_message: null,
        },
        activity: appendActivity(
          Array.isArray(run.activity) ? (run.activity as PublicationActivityEvent[]) : [],
          "Finding content editor",
        ),
      })
      const nextMeta = asRecord(run.metadata) ?? {}
      if (!asString(nextMeta.ai_thread_id)) {
        const destination = await loadDestination(service, String(run.destination_id))
        const destCtx = destinationTaskContext(destination)
        run = await runArticulatePublishLoop(service, provider, run, {
          task: continueText,
          entryUrl: destCtx.startUrl,
          allowFinalPublish: false,
          maxSteps: 6,
        })
      }
      return json({
        ok: true,
        run: publicRun(run),
        browser_id: asString(run.provider_browser_id),
        snapshot,
      })
    }

    if (action === "confirm_publication") {
      const runId = uuidOrNull(body.run_id)
      if (!runId) return json({ error: { code: "invalid_request", message: "run_id is required" } }, 400)
      let run = await loadRun(service, runId)
      await assertCanAccessRun(userClient, run, actorUserId)
      if (String(run.status) !== "awaiting_publish_confirmation") {
        return json({
          error: {
            code: "invalid_request",
            message: "Publication is not waiting for confirmation",
          },
        }, 409)
      }
      const metadata = asRecord(run.metadata) ?? {}
      if (metadata.final_publish_attempted) {
        return json({
          error: {
            code: "uncertain",
            message: userFacingErrorMessage("uncertain"),
          },
        }, 409)
      }

      const publishMode = parsePublishMode(run.publish_mode)
      const pendingStrategy =
        parseScheduleStrategy(body.schedule_strategy) ??
        parseScheduleStrategy(metadata.pending_schedule_strategy) ??
        parseScheduleStrategy(run.schedule_strategy) ??
        (publishMode === "scheduled" ? "external" : null)

      // Scheduled + internal: park without committing an external schedule.
      if (publishMode === "scheduled" && pendingStrategy === "internal") {
        if (!isCloudConfigured()) {
          return cloudUnavailableResponse({
            detail:
              "This website does not appear to support native scheduling. Articulate would need the Cloud browser to publish automatically later, but Cloud execution is currently unavailable.",
          })
        }
        const provider = getProviderForRun(run)
        const browserId = asString(run.provider_browser_id)
        if (browserId) {
          try {
            await provider.stopBrowser(browserId)
          } catch {
            // ignore
          }
        }
        run = await updateRun(service, runId, {
          status: "scheduled",
          schedule_strategy: "internal",
          live_view_url: null,
          provider_run_id: null,
          error_code: null,
          error_message: null,
          metadata: {
            ...metadata,
            final_publish_attempted: false,
            user_has_control: false,
            pending_schedule_strategy: null,
            schedule_authorized: true,
            schedule_wording: "articulate",
            phase_message: "Scheduled by Articulate.",
            local_confirm_pending: false,
          },
          activity: appendActivity(
            Array.isArray(run.activity) ? (run.activity as PublicationActivityEvent[]) : [],
            "Scheduled",
          ),
        })
        logPub("publication_schedule_confirmed_internal", { publication_run_id: runId })
        return json({
          ok: true,
          scheduled: true,
          schedule_strategy: "internal",
          run: publicRun(run),
          stop_local_browser: isLocalBrowserProvider(run.provider),
        })
      }

      // Local browser: client performs the confirm/schedule click in Chrome.
      if (isLocalBrowserProvider(run.provider)) {
        const scheduledAtIso = asString(run.scheduled_at)
        const timezone = normalizeIanaTimezone(run.schedule_timezone, "UTC")
        const confirmTask =
          publishMode === "scheduled" && pendingStrategy === "external" && scheduledAtIso
            ? buildConfirmScheduleTask({
                scheduledAtIso,
                timezone,
                strategy: "external",
              })
            : buildConfirmPublicationTask()
        run = await updateRun(service, runId, {
          status: "publishing",
          schedule_strategy:
            publishMode === "scheduled" ? (pendingStrategy ?? run.schedule_strategy) : run.schedule_strategy,
          metadata: {
            ...metadata,
            final_publish_attempted: true,
            user_has_control: false,
            local_confirm_pending: true,
            local_confirm_task: confirmTask,
            confirming_external_schedule:
              publishMode === "scheduled" && pendingStrategy === "external",
            phase_message:
              publishMode === "scheduled" && pendingStrategy === "external"
                ? "Confirming schedule in local browser…"
                : "Publishing in local browser…",
          },
          activity: appendActivity(
            Array.isArray(run.activity) ? (run.activity as PublicationActivityEvent[]) : [],
            publishMode === "scheduled" ? "Confirming schedule" : "Publishing",
          ),
        })
        return json({
          ok: true,
          run: publicRun(run),
          local_confirm: {
            required: true,
            task: confirmTask,
          },
          browser_label: "Local",
        })
      }

      // Scheduled + external: commit native schedule once via Articulate + BrowserController.
      if (publishMode === "scheduled" && pendingStrategy === "external") {
        const browserId = asString(run.provider_browser_id)
        if (!browserId) {
          return json({ error: { code: "session_expired", message: userFacingErrorMessage("session_expired") } }, 409)
        }
        const scheduledAtIso = asString(run.scheduled_at)
        const timezone = normalizeIanaTimezone(run.schedule_timezone, "UTC")
        if (!scheduledAtIso) {
          return json({
            error: { code: "invalid_request", message: "scheduled_at is missing on this run" },
          }, 409)
        }
        const provider = getProviderForRun(run)
        const live = await provider.getLiveView("", browserId)
        run = await updateRun(service, runId, {
          provider_run_id: null,
          provider_session_id: browserId,
          status: "publishing",
          schedule_strategy: "external",
          live_view_url: live.liveViewUrl ?? run.live_view_url,
          metadata: {
            ...metadata,
            final_publish_attempted: true,
            user_has_control: false,
            pending_schedule_strategy: "external",
            confirming_external_schedule: true,
            schedule_wording: "destination",
            browser_control: "articulate_ai",
          },
          activity: appendActivity(
            Array.isArray(run.activity) ? (run.activity as PublicationActivityEvent[]) : [],
            "Confirming schedule",
          ),
        })
        run = await runArticulatePublishLoop(service, provider, run, {
          task: buildConfirmScheduleTask({
            scheduledAtIso,
            timezone,
            strategy: "external",
          }),
          allowFinalPublish: true,
        })
        logPub("publication_schedule_confirmed_external", {
          publication_run_id: runId,
          provider_browser_id: browserId,
          browser_control: "articulate_ai",
        })
        return json({ ok: true, scheduled: true, schedule_strategy: "external", run: publicRun(run) })
      }

      const browserId = asString(run.provider_browser_id)
      if (!browserId) {
        return json({ error: { code: "session_expired", message: userFacingErrorMessage("session_expired") } }, 409)
      }
      const provider = getProviderForRun(run)
      const live = await provider.getLiveView("", browserId)
      run = await updateRun(service, runId, {
        provider_run_id: null,
        provider_session_id: browserId,
        status: "publishing",
        live_view_url: live.liveViewUrl ?? run.live_view_url,
        metadata: {
          ...metadata,
          final_publish_attempted: true,
          user_has_control: false,
          browser_control: "articulate_ai",
        },
        activity: appendActivity(
          appendActivity(
            Array.isArray(run.activity) ? (run.activity as PublicationActivityEvent[]) : [],
            "Publishing",
          ),
          "Verifying publication",
        ),
      })
      run = await runArticulatePublishLoop(service, provider, run, {
        task: buildConfirmPublicationTask(),
        allowFinalPublish: true,
      })
      logPub("publication_confirmed", {
        publication_run_id: runId,
        provider_browser_id: browserId,
        same_session: true,
        browser_control: "articulate_ai",
      })
      return json({ ok: true, run: publicRun(run) })
    }

    if (action === "reschedule_publication") {
      const runId = uuidOrNull(body.run_id ?? body.publication_run_id)
      if (!runId) return json({ error: { code: "invalid_request", message: "run_id is required" } }, 400)
      let run = await loadRun(service, runId)
      await assertCanAccessRun(userClient, run, actorUserId)
      if (String(run.status) !== "scheduled") {
        return json({
          error: { code: "invalid_request", message: "Only scheduled publications can be rescheduled this way" },
        }, 409)
      }
      const nextAt = parseScheduledAt(body.scheduled_at ?? body.scheduledAt)
      if (!nextAt || nextAt.getTime() <= Date.now() - 60_000) {
        return json({
          error: { code: "invalid_request", message: "A future scheduled_at is required" },
        }, 400)
      }
      const timezone = normalizeIanaTimezone(
        body.timezone ?? body.schedule_timezone ?? run.schedule_timezone,
        "UTC",
      )
      const strategy = parseScheduleStrategy(run.schedule_strategy) ?? "internal"
      if (strategy === "external") {
        return json({
          error: {
            code: "invalid_request",
            message:
              "This publication is scheduled on the external website. Open the browser flow to adjust the external schedule, then confirm.",
          },
          run: publicRun(run),
          requires_external_reschedule: true,
        }, 409)
      }
      run = await updateRun(service, runId, {
        scheduled_at: nextAt.toISOString(),
        schedule_timezone: timezone,
        metadata: {
          ...(asRecord(run.metadata) ?? {}),
          phase_message: `Rescheduled to ${formatScheduledAtForDisplay(nextAt, timezone)}`,
        },
        activity: appendActivity(
          Array.isArray(run.activity) ? (run.activity as PublicationActivityEvent[]) : [],
          "Rescheduled",
        ),
      })
      return json({ ok: true, run: publicRun(run) })
    }

    if (action === "publish_scheduled_now") {
      const runId = uuidOrNull(body.run_id ?? body.publication_run_id)
      if (!runId) return json({ error: { code: "invalid_request", message: "run_id is required" } }, 400)
      let run = await loadRun(service, runId)
      await assertCanAccessRun(userClient, run, actorUserId)
      if (String(run.status) !== "scheduled") {
        return json({
          error: { code: "invalid_request", message: "Publication is not in scheduled status" },
        }, 409)
      }
      const strategy = parseScheduleStrategy(run.schedule_strategy) ?? "internal"
      if (strategy === "external") {
        return json({
          error: {
            code: "invalid_request",
            message:
              "This publication is scheduled externally. Change or publish it through the destination website via Browser Use.",
          },
          requires_external_publish_now: true,
          run: publicRun(run),
        }, 409)
      }
      // Move due time to now, then claim + execute immediately.
      await updateRun(service, runId, {
        scheduled_at: new Date().toISOString(),
        metadata: {
          ...(asRecord(run.metadata) ?? {}),
          publish_now_requested: true,
        },
      })
      const { data: claimedRow, error: claimError } = await service.rpc(
        "claim_scheduled_publication_run",
        { p_run_id: runId, p_stale_hours: scheduleStaleHours() },
      )
      if (claimError || !claimedRow) {
        return json({
          error: { code: "agent_failed", message: claimError?.message ?? "Could not claim scheduled publication" },
        }, 500)
      }
      const claimed = claimedRow as Record<string, unknown>
      if (String(claimed.status) === "needs_user") {
        return json({ ok: true, run: publicRun(claimed), stale: true })
      }
      if (String(claimed.status) !== "queued") {
        return json({
          error: { code: "invalid_request", message: "Publication could not be claimed for immediate execution" },
          run: publicRun(claimed),
        }, 409)
      }
      run = await executeInternalScheduledRun(service, claimed)
      return json({ ok: true, run: publicRun(run), executed_now: true })
    }

    if (action === "cancel_publication") {
      const runId = uuidOrNull(body.run_id)
      if (!runId) return json({ error: { code: "invalid_request", message: "run_id is required" } }, 400)
      let run = await loadRun(service, runId)
      await assertCanAccessRun(userClient, run, actorUserId)
      const metadata = asRecord(run.metadata) ?? {}

      // Internal scheduled (not yet executing): cancel locally, no browser.
      if (
        String(run.status) === "scheduled" &&
        parseScheduleStrategy(run.schedule_strategy) === "internal"
      ) {
        run = await updateRun(service, runId, {
          status: "cancelled",
          error_code: "cancelled",
          error_message: userFacingErrorMessage("cancelled"),
          completed_at: new Date().toISOString(),
        })
        return json({ ok: true, run: publicRun(run), cancelled_locally: true })
      }

      // External scheduled: require explicit confirmation then Browser Use cancel.
      if (
        String(run.status) === "scheduled" &&
        parseScheduleStrategy(run.schedule_strategy) === "external"
      ) {
        if (body.confirm_external_cancel !== true && body.confirm !== true) {
          return json({
            error: {
              code: "invalid_request",
              message: "External schedule cancellation requires explicit confirmation (confirm_external_cancel=true).",
            },
            requires_confirmation: true,
            run: publicRun(run),
          }, 409)
        }
        // Start a fresh browser session to cancel the external schedule.
        const destination = await loadDestination(service, String(run.destination_id))
        const profileId = asString(destination.provider_profile_id)
        if (!profileId) {
          return json({
            error: { code: "session_expired", message: "Destination profile is missing; reconnect the destination." },
          }, 409)
        }
        const provider = getProvider()
        const destCtx = destinationTaskContext(destination, asString(asRecord(run.source_snapshot)?.type))
        const screen = resolveBrowserViewport(body.browser_viewport ?? body.screen)
        const proxyCountryCode = resolveProxyCountryCode(
          asRecord(run.metadata),
          asRecord(destination.metadata),
        )
        const workspace = await provider.createWorkspace(`cancel-${runId.slice(0, 8)}`)
        const opened = await openCloudBrowserForPublication(provider, {
          profileId,
          startUrl: destCtx.startUrl,
          proxyCountryCode,
          screen,
        })
        run = await updateRun(service, runId, {
          provider_run_id: null,
          provider_session_id: opened.browserId,
          provider_workspace_id: workspace.id,
          provider_browser_id: opened.browserId,
          status: "running",
          live_view_url: opened.liveViewUrl,
          metadata: {
            ...metadata,
            cancelling_external_schedule: true,
            final_publish_attempted: true,
            phase_message: "Cancelling external schedule…",
            browser_control: "articulate_ai",
          },
          activity: appendActivity(
            Array.isArray(run.activity) ? (run.activity as PublicationActivityEvent[]) : [],
            "Cancelling external schedule",
          ),
        })
        run = await runArticulatePublishLoop(service, provider, run, {
          task: `${buildCancelExternalScheduleTask()}

Destination: ${destCtx.name}
Preferred start URL: ${destCtx.startUrl}
External id: ${asString(run.external_id) ?? "unknown"}
External url: ${asString(run.external_url) ?? "unknown"}
Scheduled at: ${asString(run.scheduled_at) ?? "unknown"}
`,
          entryUrl: destCtx.startUrl,
          allowFinalPublish: true,
        })
        return json({ ok: true, run: publicRun(run), external_cancel_started: true })
      }

      if (metadata.final_publish_attempted && !["published", "failed", "cancelled", "uncertain", "scheduled"].includes(String(run.status))) {
        // Do not pretend cancel undoes a possible publish — mark uncertain.
        run = await updateRun(service, runId, {
          status: "uncertain",
          error_code: "uncertain",
          error_message: userFacingErrorMessage("uncertain"),
          completed_at: new Date().toISOString(),
        })
        return json({ ok: true, run: publicRun(run) })
      }
      const provider = getProviderForRun(run)
      const browserId = asString(run.provider_browser_id)
      if (browserId) {
        try {
          await provider.stopBrowser(browserId)
        } catch {
          // ignore
        }
      }
      run = await updateRun(service, runId, {
        status: "cancelled",
        error_code: "cancelled",
        error_message: userFacingErrorMessage("cancelled"),
        completed_at: new Date().toISOString(),
        metadata: {
          ...metadata,
          stop_local_browser: isLocalBrowserProvider(run.provider),
        },
      })
      return json({
        ok: true,
        run: publicRun(run),
        stop_local_browser: isLocalBrowserProvider(run.provider),
      })
    }

    if (action === "cleanup_browsers") {
      // Free Browser Use free-plan concurrent slots (max 3). Stops all active browsers.
      const provider = getProvider()
      const freed = await stopActiveBrowsersForCapacity(provider)
      const { data: activeRuns } = await service
        .from("publication_runs")
        .select("id, provider_run_id, provider_browser_id, status")
        .in("status", ["starting", "queued", "running", "needs_user", "awaiting_publish_confirmation", "publishing", "verifying"])
        .limit(50)
      let cancelledRuns = 0
      for (const row of activeRuns ?? []) {
        const runId = asString(row.id)
        if (!runId) continue
        try {
          await assertCanAccessRun(userClient, row as Record<string, unknown>, actorUserId)
        } catch {
          continue
        }
        const rowBrowserId = asString(row.provider_browser_id)
        if (rowBrowserId) {
          try {
            await provider.stopBrowser(rowBrowserId)
          } catch {
            // ignore
          }
        }
        await updateRun(service, runId, {
          status: "cancelled",
          error_code: "cancelled",
          error_message: "Cancelled while freeing Browser Use concurrent sessions.",
          completed_at: new Date().toISOString(),
        })
        cancelledRuns += 1
      }
      return json({
        ok: true,
        active_before: freed.activeBefore,
        stopped_browser_ids: freed.stopped,
        cancelled_runs: cancelledRuns,
      })
    }

    return json({ error: { code: "invalid_request", message: `Unknown action: ${action}` } }, 400)
  } catch (error) {
    if (error instanceof BrowserAgentError) {
      logPub("browser_agent_error", {
        code: error.code,
        status: error.status ?? null,
        message: sanitizeLogText(error.message),
      })
      const providerDetail = sanitizeLogText(error.message)
      if (isCloudBrowserUnavailableError(error) || error.code === "provider_not_configured") {
        return cloudUnavailableResponse({
          detail: providerDetail,
          status: error.status && error.status >= 400 && error.status < 600 ? error.status : 503,
        })
      }
      // Prefer actionable provider details (e.g. free-plan model rejection) over a generic mask.
      const message = providerDetail || userFacingErrorMessage("agent_failed")
      return json(
        {
          error: {
            code: "agent_failed",
            message,
          },
        },
        error.status && error.status >= 400 && error.status < 600 ? error.status : 500,
      )
    }
    const status = Number((error as { status?: number }).status ?? 500)
    const code = String((error as { code?: string }).code ?? "agent_failed")
    logPub("unhandled_error", {
      code,
      status,
      message: sanitizeLogText((error as Error).message),
    })
    return json(
      {
        error: {
          code,
          message: userFacingErrorMessage(code, (error as Error).message),
        },
      },
      Number.isFinite(status) ? status : 500,
    )
  }
})

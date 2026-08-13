import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { getNetworkAdapter } from "../_shared/bright-data/adapters/index.ts"
import {
  BrightDataClient,
  isTransientBrightDataError,
  isTransientBrightDataMessage,
} from "../_shared/bright-data/client.ts"
import {
  buildPostDedupeKey,
  type CompetitorSocialNetwork,
  type FetchPostsArgs,
  type NormalizedCompetitorPost,
} from "../_shared/bright-data/types.ts"

/**
 * Secrets:
 * - BRIGHT_DATA_API_KEY
 * - COMPETITOR_SYNC_CRON_SECRET (required for automatic/cron)
 * - SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
 *
 * POST body:
 * {
 *   project_id?: number
 *   competitor_id?: number
 *   social_profile_id?: number
 *   social_profile_ids?: number[]
 *   brand_social_profile_id?: number
 *   brand_social_profile_ids?: number[]
 *   entity_type?: "owned" | "competitor" | "all"
 *   mode?: "sync" | "trigger" | "resume"
 *   trigger: "manual" | "automatic"
 * }
 *
 * Bright Data snapshots regularly take longer than a single Edge Function can wait.
 * A snapshot is therefore triggered once, its id is stored on the sync run, and the
 * run stays `queued` until some later invocation (or the resume cron) collects it.
 * - `trigger` starts snapshots and returns immediately.
 * - `resume` collects snapshots that are already pending.
 * - `sync` does both, waiting as long as the request budget allows.
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const BRIGHT_DATA_API_KEY = Deno.env.get("BRIGHT_DATA_API_KEY") ?? ""
const COMPETITOR_SYNC_CRON_SECRET = Deno.env.get("COMPETITOR_SYNC_CRON_SECRET") ?? ""

const DEFAULT_FIRST_SYNC_DAYS = 30
const DEFAULT_MAX_POSTS = 50
/** Leave headroom under typical Supabase Edge wall-clock (~150s) so the gateway does not kill the request mid-poll. */
const REQUEST_BUDGET_MS = 130_000
/** Stop waiting on a snapshot with enough time left to persist results and answer. */
const RESPONSE_RESERVE_MS = 20_000
/** Waiting less than this is not worth a poll — leave the snapshot pending instead. */
const MIN_WAIT_MS = 8_000
const SNAPSHOT_POLL_INTERVAL_MS = 5_000
/** A pending snapshot that never becomes ready is abandoned after this long. */
const PENDING_SNAPSHOT_MAX_MS = 60 * 60_000
/** Abandon orphaned running rows left when a previous invoke was killed. */
const STALE_LOCK_MS = 4 * 60_000
const MAX_RESUME_RUNS = 25

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-competitor-sync-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

type ServiceClient = ReturnType<typeof createClient>
type SyncTrigger = "manual" | "automatic"
type SyncMode = "sync" | "trigger" | "resume"
type EntityType = "owned" | "competitor"

type CompetitorProfileRow = {
  kind: "competitor"
  id: number
  project_id: number
  competitor_id: number
  network: CompetitorSocialNetwork
  profile_url: string
  is_active: boolean
  last_synced_at: string | null
}

type BrandProfileRow = {
  kind: "owned"
  id: number
  project_id: number
  network: CompetitorSocialNetwork
  profile_url: string
  is_active: boolean
  last_synced_at: string | null
}

type SyncProfile = CompetitorProfileRow | BrandProfileRow

type SyncSettings = {
  cron_hour_utc: number
  first_sync_days: number
  max_posts_per_profile: number
}

type PendingRun = {
  runId: string
  snapshotId: string
  profile: SyncProfile
  fetchArgs: FetchPostsArgs
  metadata: Record<string, unknown>
}

type ProfileSyncResult = {
  ok: boolean
  pending: boolean
  postsFound: number
  postsCreated: number
  postsUpdated: number
  error: string | null
  runId: string
  snapshotId: string | null
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  })
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function toPositiveInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.trunc(value)
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed > 0) return Math.trunc(parsed)
  }
  return null
}

function toPositiveIntList(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  const ids = value
    .map(toPositiveInt)
    .filter((id): id is number => typeof id === "number")
  return [...new Set(ids)]
}

function daysAgoIso(days: number): string {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() - Math.max(1, days))
  return date.toISOString()
}

function utcDateString(date = new Date()): string {
  return date.toISOString().slice(0, 10)
}

/**
 * Prefer the median followers count from a scrape batch. Bright Data Instagram
 * rows occasionally return outlier `followers` values (orders of magnitude off);
 * taking max() polluted daily snapshots.
 */
function medianFollowers(posts: NormalizedCompetitorPost[]): number | null {
  const values = posts
    .map((post) => post.followersCountAtSync)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    .sort((a, b) => a - b)
  if (values.length === 0) return null
  const mid = Math.floor(values.length / 2)
  return values.length % 2 === 0
    ? Math.round((values[mid - 1]! + values[mid]!) / 2)
    : values[mid]!
}

function snapshotIdOf(metadata: unknown): string | null {
  const value = asRecord(metadata)?.snapshot_id
  return typeof value === "string" && value.trim() ? value.trim() : null
}

async function loadSettings(service: ServiceClient): Promise<SyncSettings> {
  const { data } = await service
    .from("app_runtime_settings")
    .select("value")
    .eq("key", "competitor_social_sync")
    .maybeSingle()

  const value = asRecord(data?.value) ?? {}
  return {
    cron_hour_utc: toPositiveInt(value.cron_hour_utc) ?? 6,
    first_sync_days: toPositiveInt(value.first_sync_days) ?? DEFAULT_FIRST_SYNC_DAYS,
    max_posts_per_profile:
      toPositiveInt(value.max_posts_per_profile) ?? DEFAULT_MAX_POSTS,
  }
}

async function assertManualAccess(args: {
  authorization: string | null
  projectIds: number[]
}): Promise<Response | null> {
  if (!args.authorization) {
    return json({ ok: false, error: "Missing Authorization header" }, 401)
  }

  const userDb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: args.authorization } },
  })

  for (const projectId of args.projectIds) {
    const { data: allowed, error } = await userDb.rpc("ai_assert_can_edit_project_v1", {
      p_project_id: projectId,
    })
    if (error || allowed !== true) {
      return json({ ok: false, error: "Forbidden" }, 403)
    }
  }
  return null
}

function hasValidCronSecret(req: Request): boolean {
  if (!COMPETITOR_SYNC_CRON_SECRET) return false
  const header = req.headers.get("x-competitor-sync-secret")
  if (header && header === COMPETITOR_SYNC_CRON_SECRET) return true
  const auth = req.headers.get("Authorization")
  if (auth === `Bearer ${COMPETITOR_SYNC_CRON_SECRET}`) return true
  return false
}

function hasServiceRoleAuth(req: Request): boolean {
  const auth = req.headers.get("Authorization")
  if (!auth?.startsWith("Bearer ") || !SUPABASE_SERVICE_ROLE_KEY) return false
  return auth.slice(7) === SUPABASE_SERVICE_ROLE_KEY
}

async function failRuns(
  service: ServiceClient,
  runs: Array<Record<string, unknown>>,
  message: string,
): Promise<void> {
  if (!runs.length) return
  const finishedAt = new Date().toISOString()

  const runIds = runs.map((row) => row.id).filter(Boolean)
  if (runIds.length) {
    await service
      .from("project_competitor_sync_runs")
      .update({
        status: "failed",
        finished_at: finishedAt,
        error_message: message,
        updated_at: finishedAt,
      })
      .in("id", runIds)
  }

  const competitorProfileIds = [
    ...new Set(
      runs
        .map((row) => row.social_profile_id)
        .filter((id): id is number => typeof id === "number" && id > 0),
    ),
  ]
  if (competitorProfileIds.length) {
    await service
      .from("project_competitor_social_profiles")
      .update({
        last_sync_status: "failed",
        last_sync_error: message,
        updated_at: finishedAt,
      })
      .in("id", competitorProfileIds)
      .in("last_sync_status", ["running", "queued"])
  }

  const brandProfileIds = [
    ...new Set(
      runs
        .map((row) => row.brand_social_profile_id)
        .filter((id): id is number => typeof id === "number" && id > 0),
    ),
  ]
  if (brandProfileIds.length) {
    await service
      .from("project_brand_social_profiles")
      .update({
        last_sync_status: "failed",
        last_sync_error: message,
        updated_at: finishedAt,
      })
      .in("id", brandProfileIds)
      .in("last_sync_status", ["running", "queued"])
  }
}

/**
 * Runs left behind by a killed worker are failed after a few minutes, but runs that
 * own a Bright Data snapshot are kept much longer so the resume path can collect them.
 */
async function releaseStaleSyncLocks(service: ServiceClient): Promise<number> {
  const now = Date.now()
  const { data: openRuns } = await service
    .from("project_competitor_sync_runs")
    .select("id, social_profile_id, brand_social_profile_id, started_at, metadata")
    .in("status", ["queued", "running"])
    .lt("started_at", new Date(now - STALE_LOCK_MS).toISOString())

  if (!openRuns?.length) return 0

  const orphaned: Array<Record<string, unknown>> = []
  const expiredSnapshots: Array<Record<string, unknown>> = []
  for (const run of openRuns) {
    const startedAt = typeof run.started_at === "string" ? Date.parse(run.started_at) : NaN
    if (!snapshotIdOf(run.metadata)) {
      orphaned.push(run)
    } else if (Number.isFinite(startedAt) && now - startedAt > PENDING_SNAPSHOT_MAX_MS) {
      expiredSnapshots.push(run)
    }
  }

  await failRuns(service, orphaned, "Timed out / worker interrupted")
  await failRuns(
    service,
    expiredSnapshots,
    "Bright Data snapshot never became ready — sync again to retry",
  )

  return orphaned.length + expiredSnapshots.length
}

/**
 * Runs that an earlier deploy failed on a Bright Data connection blip still own a
 * snapshot id, so they are put back in the queue for the resume sweep instead of
 * discarding a scrape that Bright Data has already been paid for.
 */
async function requeueTransientFailures(service: ServiceClient): Promise<number> {
  const now = Date.now()
  const { data: failedRuns } = await service
    .from("project_competitor_sync_runs")
    .select("id, social_profile_id, brand_social_profile_id, started_at, metadata, error_message")
    .eq("status", "failed")
    .gt("started_at", new Date(now - PENDING_SNAPSHOT_MAX_MS).toISOString())
    .limit(200)

  const resumable = (failedRuns ?? []).filter(
    (run) =>
      Boolean(snapshotIdOf(run.metadata)) &&
      isTransientBrightDataMessage(
        typeof run.error_message === "string" ? run.error_message : null,
      ),
  )
  if (!resumable.length) return 0

  const nowIso = new Date().toISOString()
  await service
    .from("project_competitor_sync_runs")
    .update({
      status: "queued",
      finished_at: null,
      error_message: null,
      updated_at: nowIso,
    })
    .in("id", resumable.map((run) => run.id))

  const profileIds = (key: "social_profile_id" | "brand_social_profile_id"): number[] => [
    ...new Set(
      resumable
        .map((run) => run[key])
        .filter((id): id is number => typeof id === "number" && id > 0),
    ),
  ]

  const competitorIds = profileIds("social_profile_id")
  if (competitorIds.length) {
    await service
      .from("project_competitor_social_profiles")
      .update({ last_sync_status: "queued", last_sync_error: null, updated_at: nowIso })
      .in("id", competitorIds)
  }

  const brandIds = profileIds("brand_social_profile_id")
  if (brandIds.length) {
    await service
      .from("project_brand_social_profiles")
      .update({ last_sync_status: "queued", last_sync_error: null, updated_at: nowIso })
      .in("id", brandIds)
  }

  return resumable.length
}

async function acquireProfileLock(
  service: ServiceClient,
  profile: SyncProfile,
): Promise<boolean> {
  let query = service
    .from("project_competitor_sync_runs")
    .select("id")
    .in("status", ["queued", "running"])
    .limit(1)

  if (profile.kind === "owned") {
    query = query.eq("brand_social_profile_id", profile.id)
  } else {
    query = query.eq("social_profile_id", profile.id)
  }

  const { data: running } = await query
  return !(running && running.length > 0)
}

async function upsertPosts(args: {
  service: ServiceClient
  profile: SyncProfile
  network: CompetitorSocialNetwork
  posts: NormalizedCompetitorPost[]
}): Promise<{ created: number; updated: number }> {
  let created = 0
  let updated = 0
  const nowIso = new Date().toISOString()
  const profile = args.profile
  const entityType: EntityType = profile.kind
  const ownership =
    profile.kind === "owned"
      ? {
          entity_type: "owned" as const,
          competitor_id: null,
          social_profile_id: null,
          brand_social_profile_id: profile.id,
        }
      : {
          entity_type: "competitor" as const,
          competitor_id: profile.competitor_id,
          social_profile_id: profile.id,
          brand_social_profile_id: null,
        }

  for (const post of args.posts) {
    const dedupeKey = buildPostDedupeKey({
      externalPostId: post.externalPostId,
      postUrl: post.postUrl,
    })

    const row = {
      project_id: profile.project_id,
      ...ownership,
      network: args.network,
      external_post_id: post.externalPostId,
      dedupe_key: dedupeKey,
      post_url: post.postUrl,
      published_at: post.publishedAt,
      text_content: post.textContent,
      media_type: post.mediaType,
      media_urls: post.mediaUrls,
      thumbnail_url: post.thumbnailUrl,
      reactions_count: post.reactionsCount,
      comments_count: post.commentsCount,
      shares_count: post.sharesCount,
      views_count: post.viewsCount,
      followers_count_at_sync: post.followersCountAtSync,
      extra_metrics: post.extraMetrics,
      raw_payload: post.rawPayload ?? {},
      last_seen_at: nowIso,
      updated_at: nowIso,
    }

    let existingQuery = args.service
      .from("project_competitor_social_posts")
      .select("id")
      .eq("dedupe_key", dedupeKey)

    if (entityType === "owned") {
      existingQuery = existingQuery.eq("brand_social_profile_id", profile.id)
    } else {
      existingQuery = existingQuery.eq("social_profile_id", profile.id)
    }

    const { data: existing } = await existingQuery.maybeSingle()

    if (existing?.id) {
      const { error } = await args.service
        .from("project_competitor_social_posts")
        .update(row)
        .eq("id", existing.id)
      if (error) throw error
      updated += 1
    } else {
      const { error } = await args.service
        .from("project_competitor_social_posts")
        .insert({
          ...row,
          first_seen_at: nowIso,
          created_at: nowIso,
        })
      if (error) {
        if (String(error.code) === "23505") {
          let retry = args.service
            .from("project_competitor_social_posts")
            .update(row)
            .eq("dedupe_key", dedupeKey)
          if (entityType === "owned") {
            retry = retry.eq("brand_social_profile_id", args.profile.id)
          } else {
            retry = retry.eq("social_profile_id", args.profile.id)
          }
          const { error: retryError } = await retry
          if (retryError) throw retryError
          updated += 1
        } else {
          throw error
        }
      } else {
        created += 1
      }
    }
  }

  return { created, updated }
}

async function writeDailySnapshot(args: {
  service: ServiceClient
  profile: SyncProfile
  posts: NormalizedCompetitorPost[]
  metadata: Record<string, unknown>
}): Promise<void> {
  const snapshotDate = utcDateString()
  const followers = medianFollowers(args.posts)

  let postsCountQuery = args.service
    .from("project_competitor_social_posts")
    .select("id", { count: "exact", head: true })

  if (args.profile.kind === "owned") {
    postsCountQuery = postsCountQuery.eq("brand_social_profile_id", args.profile.id)
  } else {
    postsCountQuery = postsCountQuery.eq("social_profile_id", args.profile.id)
  }

  const { count } = await postsCountQuery

  const row =
    args.profile.kind === "owned"
      ? {
          project_id: args.profile.project_id,
          entity_type: "owned" as const,
          brand_social_profile_id: args.profile.id,
          competitor_social_profile_id: null,
          snapshot_date: snapshotDate,
          followers_count: followers,
          posts_count: count ?? args.posts.length,
          raw_payload: {
            ...args.metadata,
            synced_posts: args.posts.length,
          },
        }
      : {
          project_id: args.profile.project_id,
          entity_type: "competitor" as const,
          brand_social_profile_id: null,
          competitor_social_profile_id: args.profile.id,
          snapshot_date: snapshotDate,
          followers_count: followers,
          posts_count: count ?? args.posts.length,
          raw_payload: {
            ...args.metadata,
            synced_posts: args.posts.length,
          },
        }

  let existingQuery = args.service
    .from("project_social_profile_daily_snapshots")
    .select("id")
    .eq("snapshot_date", snapshotDate)

  if (args.profile.kind === "owned") {
    existingQuery = existingQuery.eq("brand_social_profile_id", args.profile.id)
  } else {
    existingQuery = existingQuery.eq("competitor_social_profile_id", args.profile.id)
  }

  const { data: existing } = await existingQuery.maybeSingle()
  if (existing?.id) {
    await args.service
      .from("project_social_profile_daily_snapshots")
      .update(row)
      .eq("id", existing.id)
  } else {
    await args.service.from("project_social_profile_daily_snapshots").insert(row)
  }
}

async function markProfileStatus(
  service: ServiceClient,
  profile: SyncProfile,
  patch: Record<string, unknown>,
): Promise<void> {
  const table =
    profile.kind === "owned"
      ? "project_brand_social_profiles"
      : "project_competitor_social_profiles"
  await service.from(table).update(patch).eq("id", profile.id)
}

type FetchArgsOverride = {
  /** Force a specific start date (backfill), ignoring last_synced_at. */
  startDateIso?: string | null
  /** Force lookback window in days (backfill), ignoring last_synced_at. */
  lookbackDays?: number | null
  maxPosts?: number | null
}

function buildFetchArgs(
  profile: SyncProfile,
  settings: SyncSettings,
  override: FetchArgsOverride = {},
): FetchPostsArgs {
  const overrideStart =
    typeof override.startDateIso === "string" && override.startDateIso.trim()
      ? override.startDateIso.trim()
      : null
  const lookbackDays = toPositiveInt(override.lookbackDays)
  const startDateIso =
    overrideStart ??
    (lookbackDays
      ? daysAgoIso(lookbackDays)
      : profile.last_synced_at
        ? new Date(
            Math.max(0, new Date(profile.last_synced_at).getTime() - 24 * 60 * 60 * 1000),
          ).toISOString()
        : daysAgoIso(settings.first_sync_days))

  return {
    profileUrl: profile.profile_url,
    startDateIso,
    maxPosts:
      toPositiveInt(override.maxPosts) ?? settings.max_posts_per_profile,
  }
}

async function markRunFailed(args: {
  service: ServiceClient
  runId: string
  profile: SyncProfile
  message: string
}): Promise<void> {
  const finishedAt = new Date().toISOString()
  const message = args.message.slice(0, 4000)
  await args.service
    .from("project_competitor_sync_runs")
    .update({
      status: "failed",
      finished_at: finishedAt,
      error_message: message,
      updated_at: finishedAt,
    })
    .eq("id", args.runId)

  await markProfileStatus(args.service, args.profile, {
    last_sync_status: "failed",
    last_sync_error: message,
    updated_at: finishedAt,
  })
}

/**
 * Start a Bright Data snapshot and remember its id on the run so any later
 * invocation can finish the job without paying for a second scrape.
 */
async function startSnapshot(args: {
  service: ServiceClient
  brightData: BrightDataClient
  profile: SyncProfile
  trigger: SyncTrigger
  settings: SyncSettings
  fetchOverride?: FetchArgsOverride
}): Promise<PendingRun> {
  const { service, brightData, profile, trigger, settings } = args
  const startedAt = new Date().toISOString()

  const { data: run, error: runInsertError } = await service
    .from("project_competitor_sync_runs")
    .insert({
      project_id: profile.project_id,
      entity_type: profile.kind,
      competitor_id: profile.kind === "competitor" ? profile.competitor_id : null,
      social_profile_id: profile.kind === "competitor" ? profile.id : null,
      brand_social_profile_id: profile.kind === "owned" ? profile.id : null,
      network: profile.network,
      trigger_type: trigger,
      status: "queued",
      started_at: startedAt,
      metadata: {},
    })
    .select("id")
    .single()

  if (runInsertError || !run?.id) {
    throw runInsertError ?? new Error("Failed to create sync run")
  }

  await markProfileStatus(service, profile, {
    last_sync_status: "queued",
    last_sync_error: null,
    updated_at: startedAt,
  })

  const fetchArgs = buildFetchArgs(profile, settings, args.fetchOverride)

  try {
    const adapter = getNetworkAdapter(profile.network)
    const request = adapter.buildRequest(fetchArgs)
    const { snapshot_id } = await brightData.trigger(request.options, request.input)

    const metadata: Record<string, unknown> = {
      ...request.metadata,
      snapshot_id,
      entity_type: profile.kind,
      profile_url: fetchArgs.profileUrl,
      start_date: fetchArgs.startDateIso,
      max_posts: fetchArgs.maxPosts,
      snapshot_started_at: new Date().toISOString(),
    }

    await service
      .from("project_competitor_sync_runs")
      .update({ metadata, updated_at: new Date().toISOString() })
      .eq("id", run.id)

    return { runId: run.id, snapshotId: snapshot_id, profile, fetchArgs, metadata }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await markRunFailed({ service, runId: run.id, profile, message })
    throw error
  }
}

/**
 * Leave the run queued so the resume cron can collect the snapshot later. Used both for
 * snapshots that are still building and for connection failures while polling — in
 * neither case is the (already paid for) Bright Data snapshot lost.
 */
async function keepRunPending(args: {
  service: ServiceClient
  pending: PendingRun
  lastStatus: string
  transientError?: string
}): Promise<ProfileSyncResult> {
  const nowIso = new Date().toISOString()
  const metadata: Record<string, unknown> = {
    ...args.pending.metadata,
    last_progress_status: args.lastStatus,
    last_checked_at: nowIso,
  }
  if (args.transientError) {
    metadata.last_transient_error = args.transientError.slice(0, 500)
    metadata.transient_error_count =
      (toPositiveInt(args.pending.metadata.transient_error_count) ?? 0) + 1
  } else {
    delete metadata.last_transient_error
  }

  await args.service
    .from("project_competitor_sync_runs")
    .update({ status: "queued", metadata, updated_at: nowIso })
    .eq("id", args.pending.runId)

  await markProfileStatus(args.service, args.pending.profile, {
    last_sync_status: "queued",
    last_sync_error: null,
    updated_at: nowIso,
  })

  return {
    ok: true,
    pending: true,
    postsFound: 0,
    postsCreated: 0,
    postsUpdated: 0,
    error: null,
    runId: args.pending.runId,
    snapshotId: args.pending.snapshotId,
  }
}

/** Poll a pending snapshot and, when it is ready, persist its posts. */
async function collectPendingRun(args: {
  service: ServiceClient
  brightData: BrightDataClient
  pending: PendingRun
  maxWaitMs: number
}): Promise<ProfileSyncResult> {
  const { service, brightData, pending } = args
  const { profile } = pending

  try {
    const collected = await brightData.collect(pending.snapshotId, {
      pollIntervalMs: SNAPSHOT_POLL_INTERVAL_MS,
      maxWaitMs: Math.max(0, args.maxWaitMs),
    })

    if (collected.status === "pending") {
      return keepRunPending({
        service,
        pending,
        lastStatus: collected.lastStatus,
        transientError: collected.transientError,
      })
    }

    const adapter = getNetworkAdapter(profile.network)
    const posts = adapter.mapRecords(collected.records, pending.fetchArgs)

    const { created, updated } = await upsertPosts({
      service,
      profile,
      network: profile.network,
      posts,
    })

    await writeDailySnapshot({
      service,
      profile,
      posts,
      metadata: {
        ...pending.metadata,
        raw_count: collected.records.length,
      },
    })

    const finishedAt = new Date().toISOString()
    await service
      .from("project_competitor_sync_runs")
      .update({
        status: "succeeded",
        finished_at: finishedAt,
        posts_found: posts.length,
        posts_created: created,
        posts_updated: updated,
        metadata: {
          ...pending.metadata,
          raw_count: collected.records.length,
        },
        updated_at: finishedAt,
      })
      .eq("id", pending.runId)

    await markProfileStatus(service, profile, {
      last_synced_at: finishedAt,
      last_sync_status: "succeeded",
      last_sync_error: null,
      updated_at: finishedAt,
    })

    return {
      ok: true,
      pending: false,
      postsFound: posts.length,
      postsCreated: created,
      postsUpdated: updated,
      error: null,
      runId: pending.runId,
      snapshotId: pending.snapshotId,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (isTransientBrightDataError(error)) {
      return keepRunPending({
        service,
        pending,
        lastStatus: "unreachable",
        transientError: message,
      })
    }
    await markRunFailed({ service, runId: pending.runId, profile, message })
    return {
      ok: false,
      pending: false,
      postsFound: 0,
      postsCreated: 0,
      postsUpdated: 0,
      error: message,
      runId: pending.runId,
      snapshotId: pending.snapshotId,
    }
  }
}

async function findPendingRun(
  service: ServiceClient,
  profile: SyncProfile,
  settings: SyncSettings,
): Promise<PendingRun | null> {
  let query = service
    .from("project_competitor_sync_runs")
    .select("id, metadata, started_at")
    .in("status", ["queued", "running"])
    .order("started_at", { ascending: false })
    .limit(1)

  if (profile.kind === "owned") {
    query = query.eq("brand_social_profile_id", profile.id)
  } else {
    query = query.eq("social_profile_id", profile.id)
  }

  const { data } = await query
  const row = data?.[0]
  const snapshotId = snapshotIdOf(row?.metadata)
  if (!row || !snapshotId) return null

  return {
    runId: row.id,
    snapshotId,
    profile,
    fetchArgs: pendingFetchArgs(row.metadata, profile, settings),
    metadata: asRecord(row.metadata) ?? {},
  }
}

function pendingFetchArgs(
  metadata: unknown,
  profile: SyncProfile,
  settings: SyncSettings,
): FetchPostsArgs {
  const record = asRecord(metadata) ?? {}
  const profileUrl =
    typeof record.profile_url === "string" && record.profile_url.trim()
      ? record.profile_url
      : profile.profile_url
  const startDateIso =
    typeof record.start_date === "string" && record.start_date.trim()
      ? record.start_date
      : null
  return {
    profileUrl,
    startDateIso,
    maxPosts: toPositiveInt(record.max_posts) ?? settings.max_posts_per_profile,
  }
}

async function loadProfiles(args: {
  service: ServiceClient
  projectId: number | null
  competitorId: number | null
  socialProfileIds: number[]
  brandSocialProfileIds: number[]
  entityType: "owned" | "competitor" | "all"
}): Promise<SyncProfile[]> {
  const profiles: SyncProfile[] = []
  const includeCompetitor =
    args.entityType !== "owned" && args.brandSocialProfileIds.length === 0
  const includeOwned =
    args.entityType !== "competitor" &&
    args.socialProfileIds.length === 0 &&
    !args.competitorId

  if (includeCompetitor) {
    let query = args.service
      .from("project_competitor_social_profiles")
      .select(
        "id, project_id, competitor_id, network, profile_url, is_active, last_synced_at, competitors:project_competitors!inner(id, is_active)",
      )
      .eq("is_active", true)
      .eq("competitors.is_active", true)

    if (args.socialProfileIds.length) query = query.in("id", args.socialProfileIds)
    if (args.competitorId) query = query.eq("competitor_id", args.competitorId)
    if (args.projectId) query = query.eq("project_id", args.projectId)

    const { data, error } = await query.limit(500)
    if (error) throw error
    for (const row of data ?? []) {
      profiles.push({
        kind: "competitor",
        id: row.id,
        project_id: row.project_id,
        competitor_id: row.competitor_id,
        network: row.network,
        profile_url: row.profile_url,
        is_active: row.is_active,
        last_synced_at: row.last_synced_at,
      })
    }
  }

  if (includeOwned) {
    let query = args.service
      .from("project_brand_social_profiles")
      .select("id, project_id, network, profile_url, is_active, last_synced_at")
      .eq("is_active", true)

    if (args.brandSocialProfileIds.length) {
      query = query.in("id", args.brandSocialProfileIds)
    }
    if (args.projectId) query = query.eq("project_id", args.projectId)

    const { data, error } = await query.limit(500)
    if (error) throw error
    for (const row of data ?? []) {
      profiles.push({
        kind: "owned",
        id: row.id,
        project_id: row.project_id,
        network: row.network,
        profile_url: row.profile_url,
        is_active: row.is_active,
        last_synced_at: row.last_synced_at,
      })
    }
  }

  return profiles
}

/** Pending runs across the instance (or one project) that still own a snapshot id. */
async function loadPendingRuns(args: {
  service: ServiceClient
  projectId: number | null
  settings: SyncSettings
}): Promise<PendingRun[]> {
  let query = args.service
    .from("project_competitor_sync_runs")
    .select(
      "id, project_id, entity_type, social_profile_id, brand_social_profile_id, network, metadata, started_at",
    )
    .in("status", ["queued", "running"])
    .order("started_at", { ascending: true })
    .limit(MAX_RESUME_RUNS * 4)

  if (args.projectId) query = query.eq("project_id", args.projectId)

  const { data, error } = await query
  if (error) throw error

  // Runs without a snapshot id were interrupted before Bright Data was reached;
  // releaseStaleSyncLocks retires those, they cannot be resumed here.
  const runs = ((data ?? []) as Array<Record<string, unknown>>)
    .filter((row) => Boolean(snapshotIdOf(row.metadata)))
    .slice(0, MAX_RESUME_RUNS)
  const numericIds = (key: string): number[] =>
    runs
      .map((row) => row[key])
      .filter((id): id is number => typeof id === "number" && id > 0)
  const competitorProfileIds = numericIds("social_profile_id")
  const brandProfileIds = numericIds("brand_social_profile_id")

  const profilesById = new Map<string, SyncProfile>()

  if (competitorProfileIds.length) {
    const { data: rows } = await args.service
      .from("project_competitor_social_profiles")
      .select("id, project_id, competitor_id, network, profile_url, is_active, last_synced_at")
      .in("id", competitorProfileIds)
    for (const row of rows ?? []) {
      profilesById.set(`competitor:${row.id}`, {
        kind: "competitor",
        id: row.id,
        project_id: row.project_id,
        competitor_id: row.competitor_id,
        network: row.network,
        profile_url: row.profile_url,
        is_active: row.is_active,
        last_synced_at: row.last_synced_at,
      })
    }
  }

  if (brandProfileIds.length) {
    const { data: rows } = await args.service
      .from("project_brand_social_profiles")
      .select("id, project_id, network, profile_url, is_active, last_synced_at")
      .in("id", brandProfileIds)
    for (const row of rows ?? []) {
      profilesById.set(`owned:${row.id}`, {
        kind: "owned",
        id: row.id,
        project_id: row.project_id,
        network: row.network,
        profile_url: row.profile_url,
        is_active: row.is_active,
        last_synced_at: row.last_synced_at,
      })
    }
  }

  const pending: PendingRun[] = []
  for (const row of runs) {
    const snapshotId = snapshotIdOf(row.metadata)
    if (!snapshotId) continue
    const key =
      typeof row.brand_social_profile_id === "number" && row.brand_social_profile_id > 0
        ? `owned:${row.brand_social_profile_id}`
        : `competitor:${row.social_profile_id}`
    const profile = profilesById.get(key)
    if (!profile || typeof row.id !== "string") continue
    pending.push({
      runId: row.id,
      snapshotId,
      profile,
      fetchArgs: pendingFetchArgs(row.metadata, profile, args.settings),
      metadata: asRecord(row.metadata) ?? {},
    })
  }

  return pending
}

function profileResultRow(
  profile: SyncProfile,
  result: ProfileSyncResult,
): Record<string, unknown> {
  return {
    entity_type: profile.kind,
    social_profile_id: profile.kind === "competitor" ? profile.id : null,
    brand_social_profile_id: profile.kind === "owned" ? profile.id : null,
    competitor_id: profile.kind === "competitor" ? profile.competitor_id : null,
    network: profile.network,
    ...result,
  }
}

function summarize(args: {
  results: Array<Record<string, unknown>>
  total: number
  trigger: SyncTrigger
  mode: SyncMode
  staleLocksReleased: number
  transientRunsRequeued: number
}): Record<string, unknown> {
  let succeeded = 0
  let failed = 0
  let pending = 0
  for (const row of args.results) {
    if (row.pending === true) pending += 1
    else if (row.ok === true) succeeded += 1
    else failed += 1
  }

  const status =
    failed > 0 && succeeded + pending > 0
      ? "partial"
      : failed > 0
        ? "failed"
        : pending > 0 && succeeded === 0
          ? "pending"
          : pending > 0
            ? "partial"
            : "succeeded"

  return {
    ok: failed === 0,
    status,
    mode: args.mode,
    trigger: args.trigger,
    profiles_total: args.total,
    profiles_succeeded: succeeded,
    profiles_failed: failed,
    profiles_pending: pending,
    stale_locks_released: args.staleLocksReleased,
    transient_runs_requeued: args.transientRunsRequeued,
    results: args.results,
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders })
  }
  if (req.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405)
  }

  try {
    if (!BRIGHT_DATA_API_KEY) {
      return json({ ok: false, error: "BRIGHT_DATA_API_KEY is not configured" }, 500)
    }

    const body = asRecord(await req.json().catch(() => ({}))) ?? {}
    const triggerRaw = typeof body.trigger === "string" ? body.trigger : "manual"
    const trigger: SyncTrigger =
      triggerRaw === "automatic" ? "automatic" : "manual"
    const modeRaw = typeof body.mode === "string" ? body.mode.trim().toLowerCase() : "sync"
    const mode: SyncMode =
      modeRaw === "trigger" || modeRaw === "resume" ? modeRaw : "sync"

    const projectId = toPositiveInt(body.project_id)
    const competitorId = toPositiveInt(body.competitor_id)
    const socialProfileIds = [
      ...new Set([
        ...toPositiveIntList(body.social_profile_ids),
        ...(toPositiveInt(body.social_profile_id)
          ? [toPositiveInt(body.social_profile_id) as number]
          : []),
      ]),
    ]
    const brandSocialProfileIds = [
      ...new Set([
        ...toPositiveIntList(body.brand_social_profile_ids),
        ...(toPositiveInt(body.brand_social_profile_id)
          ? [toPositiveInt(body.brand_social_profile_id) as number]
          : []),
      ]),
    ]
    const entityTypeRaw =
      typeof body.entity_type === "string" ? body.entity_type.trim().toLowerCase() : "all"
    const entityType: "owned" | "competitor" | "all" =
      entityTypeRaw === "owned" || entityTypeRaw === "competitor" ? entityTypeRaw : "all"

    // Optional backfill overrides — ignore incremental last_synced_at window.
    const fetchOverride: FetchArgsOverride = {
      startDateIso:
        typeof body.start_date === "string" ? body.start_date : null,
      lookbackDays: toPositiveInt(body.lookback_days),
      maxPosts: toPositiveInt(body.max_posts),
    }

    const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const settings = await loadSettings(service)
    const requestStartedAt = Date.now()
    const staleLocksReleased = await releaseStaleSyncLocks(service)
    const transientRunsRequeued = await requeueTransientFailures(service)
    const brightData = new BrightDataClient(BRIGHT_DATA_API_KEY)
    const remainingMs = () =>
      REQUEST_BUDGET_MS - (Date.now() - requestStartedAt) - RESPONSE_RESERVE_MS

    const authorizeManual = async (projectIds: number[]) => {
      if (trigger === "manual") {
        return assertManualAccess({
          authorization: req.headers.get("Authorization"),
          projectIds,
        })
      }
      if (!hasValidCronSecret(req) && !hasServiceRoleAuth(req)) {
        if (COMPETITOR_SYNC_CRON_SECRET) {
          return json({ ok: false, error: "Invalid cron secret" }, 401)
        }
      }
      return null
    }

    if (mode === "resume") {
      const pendingRuns = await loadPendingRuns({ service, projectId, settings })
      if (pendingRuns.length === 0) {
        return json(
          summarize({
            results: [],
            total: 0,
            trigger,
            mode,
            staleLocksReleased,
            transientRunsRequeued,
          }),
        )
      }

      const denied = await authorizeManual([
        ...new Set(pendingRuns.map((run) => run.profile.project_id)),
      ])
      if (denied) return denied

      const results: Array<Record<string, unknown>> = []
      for (const pending of pendingRuns) {
        if (remainingMs() <= 0) break
        const result = await collectPendingRun({
          service,
          brightData,
          pending,
          // One progress check per snapshot: a resume pass sweeps many of them.
          maxWaitMs: 0,
        })
        results.push(profileResultRow(pending.profile, result))
      }

      return json(
        summarize({
          results,
          total: pendingRuns.length,
          trigger,
          mode,
          staleLocksReleased,
          transientRunsRequeued,
        }),
      )
    }

    const profileRows = await loadProfiles({
      service,
      projectId,
      competitorId,
      socialProfileIds,
      brandSocialProfileIds,
      entityType,
    })

    if (profileRows.length === 0) {
      return json({
        ok: true,
        status: "succeeded",
        mode,
        trigger,
        profiles_total: 0,
        profiles_succeeded: 0,
        profiles_failed: 0,
        profiles_pending: 0,
        stale_locks_released: staleLocksReleased,
        transient_runs_requeued: transientRunsRequeued,
        message: "No active social profiles matched the request",
      })
    }

    const denied = await authorizeManual([
      ...new Set(profileRows.map((row) => row.project_id)),
    ])
    if (denied) return denied

    const results: Array<Record<string, unknown>> = []

    for (const profile of profileRows) {
      let pending = await findPendingRun(service, profile, settings)

      if (!pending) {
        const canStart = await acquireProfileLock(service, profile)
        if (!canStart) {
          results.push(
            profileResultRow(profile, {
              ok: true,
              pending: true,
              postsFound: 0,
              postsCreated: 0,
              postsUpdated: 0,
              error: null,
              runId: "",
              snapshotId: null,
            }),
          )
          continue
        }

        try {
          pending = await startSnapshot({
            service,
            brightData,
            profile,
            trigger,
            settings,
            fetchOverride,
          })
        } catch (error) {
          results.push(
            profileResultRow(profile, {
              ok: false,
              pending: false,
              postsFound: 0,
              postsCreated: 0,
              postsUpdated: 0,
              error: error instanceof Error ? error.message : String(error),
              runId: "",
              snapshotId: null,
            }),
          )
          continue
        }
      }

      const waitMs = mode === "trigger" ? 0 : remainingMs()
      if (waitMs < MIN_WAIT_MS) {
        // Snapshot is running at Bright Data; the resume cron collects it.
        results.push(
          profileResultRow(profile, {
            ok: true,
            pending: true,
            postsFound: 0,
            postsCreated: 0,
            postsUpdated: 0,
            error: null,
            runId: pending.runId,
            snapshotId: pending.snapshotId,
          }),
        )
        continue
      }

      const result = await collectPendingRun({
        service,
        brightData,
        pending,
        maxWaitMs: waitMs,
      })
      results.push(profileResultRow(profile, result))
    }

    return json(
      summarize({
        results,
        total: profileRows.length,
        trigger,
        mode,
        staleLocksReleased,
        transientRunsRequeued,
      }),
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return json({ ok: false, error: message }, 500)
  }
})

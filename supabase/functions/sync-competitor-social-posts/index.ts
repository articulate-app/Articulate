import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { getNetworkAdapter } from "../_shared/bright-data/adapters/index.ts"
import { BrightDataClient } from "../_shared/bright-data/client.ts"
import {
  buildPostDedupeKey,
  type CompetitorSocialNetwork,
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
 *   brand_social_profile_id?: number
 *   entity_type?: "owned" | "competitor" | "all"
 *   trigger: "manual" | "automatic"
 * }
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
/** Per-profile Bright Data poll budget + small buffer before starting another profile. */
const PROFILE_RESERVE_MS = 105_000
/** Abandon orphaned running/queued rows left when a previous invoke was killed. */
const STALE_LOCK_MS = 4 * 60_000

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-competitor-sync-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

type ServiceClient = ReturnType<typeof createClient>
type SyncTrigger = "manual" | "automatic"
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

function daysAgoIso(days: number): string {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() - Math.max(1, days))
  return date.toISOString()
}

function utcDateString(date = new Date()): string {
  return date.toISOString().slice(0, 10)
}

function maxFollowers(posts: NormalizedCompetitorPost[]): number | null {
  let max: number | null = null
  for (const post of posts) {
    if (typeof post.followersCountAtSync === "number" && Number.isFinite(post.followersCountAtSync)) {
      if (max == null || post.followersCountAtSync > max) max = post.followersCountAtSync
    }
  }
  return max
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

async function releaseStaleSyncLocks(service: ServiceClient): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_LOCK_MS).toISOString()
  const finishedAt = new Date().toISOString()
  const message = "Timed out / worker interrupted"

  const { data: staleRuns } = await service
    .from("project_competitor_sync_runs")
    .select("id, social_profile_id, brand_social_profile_id")
    .in("status", ["queued", "running"])
    .lt("started_at", cutoff)

  if (!staleRuns?.length) return 0

  const runIds = staleRuns.map((row) => row.id).filter(Boolean)
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
      staleRuns
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
      .eq("last_sync_status", "running")
  }

  const brandProfileIds = [
    ...new Set(
      staleRuns
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
      .eq("last_sync_status", "running")
  }

  return staleRuns.length
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
  const entityType: EntityType = args.profile.kind

  for (const post of args.posts) {
    const dedupeKey = buildPostDedupeKey({
      externalPostId: post.externalPostId,
      postUrl: post.postUrl,
    })

    const row =
      entityType === "owned"
        ? {
            project_id: args.profile.project_id,
            entity_type: "owned" as const,
            competitor_id: null,
            social_profile_id: null,
            brand_social_profile_id: args.profile.id,
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
        : {
            project_id: args.profile.project_id,
            entity_type: "competitor" as const,
            competitor_id: args.profile.competitor_id,
            social_profile_id: args.profile.id,
            brand_social_profile_id: null,
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
      existingQuery = existingQuery.eq("brand_social_profile_id", args.profile.id)
    } else {
      existingQuery = existingQuery.eq("social_profile_id", args.profile.id)
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
  const followers = maxFollowers(args.posts)

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

async function syncProfile(args: {
  service: ServiceClient
  brightData: BrightDataClient
  profile: SyncProfile
  trigger: SyncTrigger
  settings: SyncSettings
}): Promise<{
  ok: boolean
  postsFound: number
  postsCreated: number
  postsUpdated: number
  error: string | null
  runId: string
}> {
  const { service, brightData, profile, trigger, settings } = args

  const canStart = await acquireProfileLock(service, profile)
  if (!canStart) {
    const { data: skippedRun } = await service
      .from("project_competitor_sync_runs")
      .insert({
        project_id: profile.project_id,
        entity_type: profile.kind,
        competitor_id: profile.kind === "competitor" ? profile.competitor_id : null,
        social_profile_id: profile.kind === "competitor" ? profile.id : null,
        brand_social_profile_id: profile.kind === "owned" ? profile.id : null,
        network: profile.network,
        trigger_type: trigger,
        status: "failed",
        started_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
        error_message: "Sync already running for this profile",
        metadata: { skipped: true },
      })
      .select("id")
      .single()

    return {
      ok: false,
      postsFound: 0,
      postsCreated: 0,
      postsUpdated: 0,
      error: "Sync already running for this profile",
      runId: skippedRun?.id ?? "",
    }
  }

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
      status: "running",
      started_at: startedAt,
      metadata: {},
    })
    .select("id")
    .single()

  if (runInsertError || !run?.id) {
    throw runInsertError ?? new Error("Failed to create sync run")
  }

  await markProfileStatus(service, profile, {
    last_sync_status: "running",
    last_sync_error: null,
    updated_at: startedAt,
  })

  try {
    const adapter = getNetworkAdapter(profile.network)
    const startDateIso = profile.last_synced_at
      ? new Date(
          Math.max(
            0,
            new Date(profile.last_synced_at).getTime() - 24 * 60 * 60 * 1000,
          ),
        ).toISOString()
      : daysAgoIso(settings.first_sync_days)

    const result = await adapter.fetchPosts(
      {
        profileUrl: profile.profile_url,
        startDateIso,
        maxPosts: settings.max_posts_per_profile,
      },
      brightData,
    )

    const { created, updated } = await upsertPosts({
      service,
      profile,
      network: profile.network,
      posts: result.posts,
    })

    await writeDailySnapshot({
      service,
      profile,
      posts: result.posts,
      metadata: {
        ...(result.metadata ?? {}),
        snapshot_id: result.snapshotId,
        raw_count: result.rawCount,
        start_date: startDateIso,
      },
    })

    const finishedAt = new Date().toISOString()
    await service
      .from("project_competitor_sync_runs")
      .update({
        status: "succeeded",
        finished_at: finishedAt,
        posts_found: result.posts.length,
        posts_created: created,
        posts_updated: updated,
        metadata: {
          ...result.metadata,
          snapshot_id: result.snapshotId,
          raw_count: result.rawCount,
          start_date: startDateIso,
          entity_type: profile.kind,
        },
        updated_at: finishedAt,
      })
      .eq("id", run.id)

    await markProfileStatus(service, profile, {
      last_synced_at: finishedAt,
      last_sync_status: "succeeded",
      last_sync_error: null,
      updated_at: finishedAt,
    })

    return {
      ok: true,
      postsFound: result.posts.length,
      postsCreated: created,
      postsUpdated: updated,
      error: null,
      runId: run.id,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const finishedAt = new Date().toISOString()
    await service
      .from("project_competitor_sync_runs")
      .update({
        status: "failed",
        finished_at: finishedAt,
        error_message: message.slice(0, 4000),
        updated_at: finishedAt,
      })
      .eq("id", run.id)

    await markProfileStatus(service, profile, {
      last_sync_status: "failed",
      last_sync_error: message.slice(0, 4000),
      updated_at: finishedAt,
    })

    return {
      ok: false,
      postsFound: 0,
      postsCreated: 0,
      postsUpdated: 0,
      error: message,
      runId: run.id,
    }
  }
}

async function loadProfiles(args: {
  service: ServiceClient
  projectId: number | null
  competitorId: number | null
  socialProfileId: number | null
  brandSocialProfileId: number | null
  entityType: "owned" | "competitor" | "all"
}): Promise<SyncProfile[]> {
  const profiles: SyncProfile[] = []
  const includeCompetitor =
    args.entityType !== "owned" && !args.brandSocialProfileId
  const includeOwned =
    args.entityType !== "competitor" && !args.socialProfileId && !args.competitorId

  if (includeCompetitor) {
    let query = args.service
      .from("project_competitor_social_profiles")
      .select(
        "id, project_id, competitor_id, network, profile_url, is_active, last_synced_at, competitors:project_competitors!inner(id, is_active)",
      )
      .eq("is_active", true)
      .eq("competitors.is_active", true)

    if (args.socialProfileId) query = query.eq("id", args.socialProfileId)
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

    if (args.brandSocialProfileId) query = query.eq("id", args.brandSocialProfileId)
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

    const projectId = toPositiveInt(body.project_id)
    const competitorId = toPositiveInt(body.competitor_id)
    const socialProfileId = toPositiveInt(body.social_profile_id)
    const brandSocialProfileId = toPositiveInt(body.brand_social_profile_id)
    const entityTypeRaw =
      typeof body.entity_type === "string" ? body.entity_type.trim().toLowerCase() : "all"
    const entityType: "owned" | "competitor" | "all" =
      entityTypeRaw === "owned" || entityTypeRaw === "competitor" ? entityTypeRaw : "all"

    const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const settings = await loadSettings(service)
    const requestStartedAt = Date.now()
    const staleLocksReleased = await releaseStaleSyncLocks(service)

    const profileRows = await loadProfiles({
      service,
      projectId,
      competitorId,
      socialProfileId,
      brandSocialProfileId,
      entityType,
    })

    if (profileRows.length === 0) {
      return json({
        ok: true,
        trigger,
        profiles_total: 0,
        profiles_succeeded: 0,
        profiles_failed: 0,
        stale_locks_released: staleLocksReleased,
        message: "No active social profiles matched the request",
      })
    }

    if (trigger === "manual") {
      const projectIds = [...new Set(profileRows.map((row) => row.project_id))]
      const denied = await assertManualAccess({
        authorization: req.headers.get("Authorization"),
        projectIds,
      })
      if (denied) return denied
    } else if (!hasValidCronSecret(req) && !hasServiceRoleAuth(req)) {
      if (COMPETITOR_SYNC_CRON_SECRET) {
        return json({ ok: false, error: "Invalid cron secret" }, 401)
      }
    }

    const brightData = new BrightDataClient(BRIGHT_DATA_API_KEY)
    const results: Array<Record<string, unknown>> = []
    let succeeded = 0
    let failed = 0
    let deferred = 0

    for (const profile of profileRows) {
      const elapsed = Date.now() - requestStartedAt
      if (elapsed + PROFILE_RESERVE_MS > REQUEST_BUDGET_MS) {
        deferred += 1
        results.push({
          entity_type: profile.kind,
          social_profile_id: profile.kind === "competitor" ? profile.id : null,
          brand_social_profile_id: profile.kind === "owned" ? profile.id : null,
          competitor_id: profile.kind === "competitor" ? profile.competitor_id : null,
          network: profile.network,
          ok: false,
          postsFound: 0,
          postsCreated: 0,
          postsUpdated: 0,
          error: "Deferred: request time budget exhausted (sync again to continue)",
          runId: "",
          deferred: true,
        })
        continue
      }

      const result = await syncProfile({
        service,
        brightData,
        profile,
        trigger,
        settings,
      })
      if (result.ok) succeeded += 1
      else failed += 1
      results.push({
        entity_type: profile.kind,
        social_profile_id: profile.kind === "competitor" ? profile.id : null,
        brand_social_profile_id: profile.kind === "owned" ? profile.id : null,
        competitor_id: profile.kind === "competitor" ? profile.competitor_id : null,
        network: profile.network,
        ...result,
      })
    }

    const status =
      deferred > 0 && succeeded > 0
        ? "partial"
        : deferred > 0 && succeeded === 0 && failed === 0
          ? "deferred"
          : failed === 0 && deferred === 0
            ? "succeeded"
            : succeeded === 0
              ? "failed"
              : "partial"

    return json({
      ok: failed === 0 && deferred === 0,
      status,
      trigger,
      profiles_total: profileRows.length,
      profiles_succeeded: succeeded,
      profiles_failed: failed,
      profiles_deferred: deferred,
      stale_locks_released: staleLocksReleased,
      results,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return json({ ok: false, error: message }, 500)
  }
})

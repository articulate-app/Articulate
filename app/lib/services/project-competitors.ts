"use client"

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import {
  COMPETITOR_NETWORK_LABELS,
  COMPETITOR_SOCIAL_NETWORKS,
  normalizeHttpUrl,
  normalizeProfileUrl,
  type CompetitorSocialNetwork,
  type SyncStatus,
} from "@/lib/competitor-social"
import {
  fetchSocialProfileCandidates,
  type SocialProfileCandidate,
} from "@/lib/services/social-profile-discovery"

export const PROJECT_COMPETITORS_QUERY_KEY = "project-competitors" as const
export const PROJECT_COMPETITOR_POSTS_QUERY_KEY = "project-competitor-posts" as const

export type ProjectCompetitor = {
  id: number
  project_id: number
  name: string
  website_url: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export type ProjectCompetitorSocialProfile = {
  id: number
  project_id: number
  competitor_id: number
  network: CompetitorSocialNetwork
  profile_url: string
  profile_url_normalized: string
  external_profile_id: string | null
  is_active: boolean
  last_synced_at: string | null
  last_sync_status: SyncStatus | null
  last_sync_error: string | null
  created_at: string
  updated_at: string
}

export type ProjectCompetitorWithProfiles = ProjectCompetitor & {
  profiles: ProjectCompetitorSocialProfile[]
}

export type ProjectCompetitorSocialPost = {
  id: number
  project_id: number
  competitor_id: number
  social_profile_id: number
  network: CompetitorSocialNetwork
  external_post_id: string | null
  post_url: string
  published_at: string | null
  text_content: string | null
  media_type: string | null
  media_urls: string[]
  thumbnail_url: string | null
  reactions_count: number | null
  comments_count: number | null
  shares_count: number | null
  views_count: number | null
  followers_count_at_sync: number | null
  extra_metrics: Record<string, unknown>
  last_seen_at: string
  created_at: string
  updated_at: string
  competitor_name?: string | null
}

export type SyncCompetitorSocialPostsResult = {
  ok: boolean
  status?: string
  mode?: string
  trigger?: string
  profiles_total?: number
  profiles_succeeded?: number
  profiles_failed?: number
  /** Snapshots left running at Bright Data; the resume cron finishes them. */
  profiles_pending?: number
  error?: string
  results?: Array<Record<string, unknown>>
}

export { COMPETITOR_NETWORK_LABELS, COMPETITOR_SOCIAL_NETWORKS }

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export async function listProjectCompetitors(
  projectId: number,
): Promise<ProjectCompetitorWithProfiles[]> {
  const supabase = createClientComponentClient()
  const { data: competitors, error } = await supabase
    .from("project_competitors")
    .select("*")
    .eq("project_id", projectId)
    .order("name", { ascending: true })

  if (error) throw error

  const { data: profiles, error: profilesError } = await supabase
    .from("project_competitor_social_profiles")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true })

  if (profilesError) throw profilesError

  const byCompetitor = new Map<number, ProjectCompetitorSocialProfile[]>()
  for (const profile of (profiles ?? []) as ProjectCompetitorSocialProfile[]) {
    const list = byCompetitor.get(profile.competitor_id) ?? []
    list.push(profile)
    byCompetitor.set(profile.competitor_id, list)
  }

  return ((competitors ?? []) as ProjectCompetitor[]).map((competitor) => ({
    ...competitor,
    profiles: byCompetitor.get(competitor.id) ?? [],
  }))
}

export async function createProjectCompetitor(args: {
  projectId: number
  name: string
  websiteUrl?: string | null
  isActive?: boolean
}): Promise<ProjectCompetitor> {
  const name = args.name.trim()
  if (!name) throw new Error("Competitor name is required")

  const websiteUrl = args.websiteUrl?.trim()
    ? normalizeHttpUrl(args.websiteUrl)
    : null

  const supabase = createClientComponentClient()
  const { data, error } = await supabase
    .from("project_competitors")
    .insert({
      project_id: args.projectId,
      name,
      website_url: websiteUrl,
      is_active: args.isActive !== false,
    })
    .select("*")
    .single()

  if (error) throw error
  return data as ProjectCompetitor
}

export async function updateProjectCompetitor(args: {
  competitorId: number
  name?: string
  websiteUrl?: string | null
  isActive?: boolean
}): Promise<ProjectCompetitor> {
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }
  if (typeof args.name === "string") {
    const name = args.name.trim()
    if (!name) throw new Error("Competitor name is required")
    patch.name = name
  }
  if (args.websiteUrl !== undefined) {
    patch.website_url = args.websiteUrl?.trim()
      ? normalizeHttpUrl(args.websiteUrl)
      : null
  }
  if (typeof args.isActive === "boolean") patch.is_active = args.isActive

  const supabase = createClientComponentClient()
  const { data, error } = await supabase
    .from("project_competitors")
    .update(patch)
    .eq("id", args.competitorId)
    .select("*")
    .single()

  if (error) throw error
  return data as ProjectCompetitor
}

export async function deleteProjectCompetitor(competitorId: number): Promise<void> {
  const supabase = createClientComponentClient()
  const { error } = await supabase
    .from("project_competitors")
    .delete()
    .eq("id", competitorId)
  if (error) throw error
}

export async function createCompetitorSocialProfile(args: {
  projectId: number
  competitorId: number
  network: CompetitorSocialNetwork
  profileUrl: string
  isActive?: boolean
}): Promise<ProjectCompetitorSocialProfile> {
  const normalized = normalizeProfileUrl(args.network, args.profileUrl)
  if (!normalized) {
    throw new Error(`Invalid ${COMPETITOR_NETWORK_LABELS[args.network]} profile URL`)
  }

  const supabase = createClientComponentClient()
  const { data, error } = await supabase
    .from("project_competitor_social_profiles")
    .insert({
      project_id: args.projectId,
      competitor_id: args.competitorId,
      network: args.network,
      profile_url: args.profileUrl.trim(),
      profile_url_normalized: normalized,
      is_active: args.isActive !== false,
    })
    .select("*")
    .single()

  if (error) {
    if (String(error.code) === "23505") {
      throw new Error("This social profile is already linked to the competitor")
    }
    throw error
  }
  return data as ProjectCompetitorSocialProfile
}

export type SocialDiscoverySync = {
  /** True once Bright Data snapshots are running for the freshly linked profiles. */
  started: boolean
  error: string | null
}

export type DiscoverSocialProfilesResult = {
  candidates: SocialProfileCandidate[]
  created: number
  alreadyLinked: number
  createdNetworks: CompetitorSocialNetwork[]
  sync: SocialDiscoverySync
}

const NO_SYNC: SocialDiscoverySync = { started: false, error: null }

/**
 * Discovery is useless without data, so linking profiles immediately starts their
 * first sync. Snapshots keep running server-side even if this request is cut short.
 */
export async function startSocialProfilesSync(args: {
  projectId: number
  socialProfileIds?: number[]
  brandSocialProfileIds?: number[]
}): Promise<SocialDiscoverySync> {
  try {
    const result = await syncCompetitorSocialPosts({
      projectId: args.projectId,
      socialProfileIds: args.socialProfileIds,
      brandSocialProfileIds: args.brandSocialProfileIds,
      entityType: args.brandSocialProfileIds?.length ? "owned" : "competitor",
      mode: "trigger",
      trigger: "manual",
    })
    if (!result.ok) {
      return { started: false, error: result.error ?? "Could not start the sync" }
    }
    return { started: true, error: null }
  } catch (error) {
    return {
      started: false,
      error: error instanceof Error ? error.message : "Could not start the sync",
    }
  }
}

/**
 * Read a competitor website, link every social profile it advertises and start
 * syncing the new ones. Networks already linked to that competitor are untouched.
 */
export async function discoverCompetitorSocialProfilesFromWebsite(args: {
  projectId: number
  competitorId: number
  websiteUrl: string
}): Promise<DiscoverSocialProfilesResult> {
  const candidates = await fetchSocialProfileCandidates({
    projectId: args.projectId,
    websiteUrl: args.websiteUrl,
  })
  if (candidates.length === 0) {
    return {
      candidates,
      created: 0,
      alreadyLinked: 0,
      createdNetworks: [],
      sync: NO_SYNC,
    }
  }

  const supabase = createClientComponentClient()
  const { data: existing, error } = await supabase
    .from("project_competitor_social_profiles")
    .select("network")
    .eq("competitor_id", args.competitorId)

  if (error) throw error
  const linkedNetworks = new Set(
    ((existing ?? []) as Array<{ network: CompetitorSocialNetwork }>).map(
      (row) => row.network,
    ),
  )

  let alreadyLinked = 0
  const createdIds: number[] = []
  const createdNetworks: CompetitorSocialNetwork[] = []
  for (const candidate of candidates) {
    if (linkedNetworks.has(candidate.network)) {
      alreadyLinked += 1
      continue
    }
    try {
      const profile = await createCompetitorSocialProfile({
        projectId: args.projectId,
        competitorId: args.competitorId,
        network: candidate.network,
        profileUrl: candidate.profileUrl,
      })
      linkedNetworks.add(candidate.network)
      createdIds.push(profile.id)
      createdNetworks.push(candidate.network)
    } catch {
      alreadyLinked += 1
    }
  }

  const sync = createdIds.length
    ? await startSocialProfilesSync({
        projectId: args.projectId,
        socialProfileIds: createdIds,
      })
    : NO_SYNC

  return {
    candidates,
    created: createdIds.length,
    alreadyLinked,
    createdNetworks,
    sync,
  }
}

export async function updateCompetitorSocialProfile(args: {
  profileId: number
  network?: CompetitorSocialNetwork
  profileUrl?: string
  isActive?: boolean
}): Promise<ProjectCompetitorSocialProfile> {
  const supabase = createClientComponentClient()
  const { data: existing, error: existingError } = await supabase
    .from("project_competitor_social_profiles")
    .select("*")
    .eq("id", args.profileId)
    .single()

  if (existingError) throw existingError

  const network = (args.network ?? existing.network) as CompetitorSocialNetwork
  const profileUrl = args.profileUrl ?? existing.profile_url
  const normalized = normalizeProfileUrl(network, profileUrl)
  if (!normalized) {
    throw new Error(`Invalid ${COMPETITOR_NETWORK_LABELS[network]} profile URL`)
  }

  const { data, error } = await supabase
    .from("project_competitor_social_profiles")
    .update({
      network,
      profile_url: profileUrl.trim(),
      profile_url_normalized: normalized,
      is_active: typeof args.isActive === "boolean" ? args.isActive : existing.is_active,
      updated_at: new Date().toISOString(),
    })
    .eq("id", args.profileId)
    .select("*")
    .single()

  if (error) {
    if (String(error.code) === "23505") {
      throw new Error("This social profile is already linked to the competitor")
    }
    throw error
  }
  return data as ProjectCompetitorSocialProfile
}

export async function deleteCompetitorSocialProfile(profileId: number): Promise<void> {
  const supabase = createClientComponentClient()
  const { error } = await supabase
    .from("project_competitor_social_profiles")
    .delete()
    .eq("id", profileId)
  if (error) throw error
}

export async function listCompetitorSocialPosts(args: {
  projectId: number
  competitorId?: number | null
  network?: CompetitorSocialNetwork | null
  from?: string | null
  to?: string | null
  limit?: number
}): Promise<ProjectCompetitorSocialPost[]> {
  const supabase = createClientComponentClient()
  let query = supabase
    .from("project_competitor_social_posts")
    .select(
      "id, project_id, competitor_id, social_profile_id, network, external_post_id, post_url, published_at, text_content, media_type, media_urls, thumbnail_url, reactions_count, comments_count, shares_count, views_count, followers_count_at_sync, extra_metrics, last_seen_at, created_at, updated_at, project_competitors(name)",
    )
    .eq("project_id", args.projectId)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(args.limit ?? 100)

  if (args.competitorId) query = query.eq("competitor_id", args.competitorId)
  if (args.network) query = query.eq("network", args.network)
  if (args.from) query = query.gte("published_at", args.from)
  if (args.to) query = query.lte("published_at", args.to)

  const { data, error } = await query
  if (error) throw error

  return (data ?? []).map((row: any) => {
    const competitorName =
      typeof row.project_competitors?.name === "string"
        ? row.project_competitors.name
        : null
    const { project_competitors: _ignored, ...rest } = row
    return {
      ...rest,
      media_urls: Array.isArray(rest.media_urls) ? rest.media_urls : [],
      competitor_name: competitorName,
    } as ProjectCompetitorSocialPost
  })
}

/**
 * @param mode `trigger` starts Bright Data snapshots and returns immediately,
 * `resume` collects snapshots that are already running, `sync` (default) does both.
 */
export async function syncCompetitorSocialPosts(args: {
  projectId?: number
  competitorId?: number
  socialProfileId?: number
  socialProfileIds?: number[]
  brandSocialProfileId?: number
  brandSocialProfileIds?: number[]
  entityType?: "owned" | "competitor" | "all"
  mode?: "sync" | "trigger" | "resume"
  trigger?: "manual" | "automatic"
}): Promise<SyncCompetitorSocialPostsResult> {
  const supabase = createClientComponentClient()
  const { data, error } = await supabase.functions.invoke(
    "sync-competitor-social-posts",
    {
      body: {
        project_id: args.projectId,
        competitor_id: args.competitorId,
        social_profile_id: args.socialProfileId,
        social_profile_ids: args.socialProfileIds,
        brand_social_profile_id: args.brandSocialProfileId,
        brand_social_profile_ids: args.brandSocialProfileIds,
        entity_type: args.entityType ?? "all",
        mode: args.mode ?? "sync",
        trigger: args.trigger ?? "manual",
      },
    },
  )

  const record = asRecord(data)
  if (error) {
    return {
      ok: false,
      error: error.message || (typeof record?.error === "string" ? record.error : "Sync failed"),
    }
  }
  if (!record) return { ok: false, error: "Empty sync response" }
  return {
    ok: record.ok === true,
    status: typeof record.status === "string" ? record.status : undefined,
    mode: typeof record.mode === "string" ? record.mode : undefined,
    trigger: typeof record.trigger === "string" ? record.trigger : undefined,
    profiles_total:
      typeof record.profiles_total === "number" ? record.profiles_total : undefined,
    profiles_succeeded:
      typeof record.profiles_succeeded === "number"
        ? record.profiles_succeeded
        : undefined,
    profiles_failed:
      typeof record.profiles_failed === "number" ? record.profiles_failed : undefined,
    profiles_pending:
      typeof record.profiles_pending === "number" ? record.profiles_pending : undefined,
    error: typeof record.error === "string" ? record.error : undefined,
    results: Array.isArray(record.results)
      ? (record.results as Array<Record<string, unknown>>)
      : undefined,
  }
}

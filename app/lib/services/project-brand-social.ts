"use client"

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import {
  COMPETITOR_NETWORK_LABELS,
  normalizeProfileUrl,
  type CompetitorSocialNetwork,
  type SyncStatus,
} from "@/lib/competitor-social"
import {
  ownedEntityId,
  type SocialEntityType,
} from "@/lib/project-social"
import {
  syncCompetitorSocialPosts,
  type SyncCompetitorSocialPostsResult,
} from "@/lib/services/project-competitors"
import {
  fetchSocialProfileCandidates,
  type SocialProfileCandidate,
} from "@/lib/services/social-profile-discovery"

export const PROJECT_BRAND_SOCIAL_PROFILES_QUERY_KEY =
  "project-brand-social-profiles" as const
export const PROJECT_SOCIAL_POSTS_QUERY_KEY = "project-social-posts" as const
export const PROJECT_SOCIAL_ENTITIES_QUERY_KEY = "project-social-entities" as const

export type ProjectBrandSocialProfile = {
  id: number
  project_id: number
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

export type ProjectSocialPost = {
  id: number
  project_id: number
  entity_id: string
  entity_type: SocialEntityType
  is_owned: boolean
  entity_name: string | null
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
  competitor_id: number | null
  social_profile_id: number | null
  brand_social_profile_id: number | null
}

export type ProjectSocialEntityRow = {
  project_id: number
  entity_id: string
  entity_name: string
  entity_type: SocialEntityType
  is_owned: boolean
}

export async function listProjectBrandSocialProfiles(
  projectId: number,
): Promise<ProjectBrandSocialProfile[]> {
  const supabase = createClientComponentClient()
  const { data, error } = await supabase
    .from("project_brand_social_profiles")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true })

  if (error) throw error
  return (data ?? []) as ProjectBrandSocialProfile[]
}

export async function createBrandSocialProfile(args: {
  projectId: number
  network: CompetitorSocialNetwork
  profileUrl: string
  isActive?: boolean
}): Promise<ProjectBrandSocialProfile> {
  const normalized = normalizeProfileUrl(args.network, args.profileUrl)
  if (!normalized) {
    throw new Error(`Invalid ${COMPETITOR_NETWORK_LABELS[args.network]} profile URL`)
  }

  const supabase = createClientComponentClient()
  const { data, error } = await supabase
    .from("project_brand_social_profiles")
    .insert({
      project_id: args.projectId,
      network: args.network,
      profile_url: args.profileUrl.trim(),
      profile_url_normalized: normalized,
      is_active: args.isActive !== false,
    })
    .select("*")
    .single()

  if (error) {
    if (String(error.code) === "23505") {
      throw new Error("This brand social profile is already linked to the project")
    }
    throw error
  }
  return data as ProjectBrandSocialProfile
}

export async function getProjectWebsiteUrl(projectId: number): Promise<string | null> {
  const supabase = createClientComponentClient()
  const { data, error } = await supabase
    .from("projects")
    .select("project_url")
    .eq("id", projectId)
    .maybeSingle()

  if (error) throw error
  const url = typeof data?.project_url === "string" ? data.project_url.trim() : ""
  return url || null
}

export type DiscoverSocialProfilesResult = {
  candidates: SocialProfileCandidate[]
  created: number
  alreadyLinked: number
}

/**
 * Read the project website and link every social profile it advertises.
 * Networks already linked are left untouched.
 */
export async function discoverBrandSocialProfilesFromWebsite(args: {
  projectId: number
  websiteUrl: string
}): Promise<DiscoverSocialProfilesResult> {
  const candidates = await fetchSocialProfileCandidates({
    projectId: args.projectId,
    websiteUrl: args.websiteUrl,
  })
  if (candidates.length === 0) {
    return { candidates, created: 0, alreadyLinked: 0 }
  }

  const existing = await listProjectBrandSocialProfiles(args.projectId)
  const linkedNetworks = new Set(existing.map((profile) => profile.network))

  let created = 0
  let alreadyLinked = 0
  for (const candidate of candidates) {
    if (linkedNetworks.has(candidate.network)) {
      alreadyLinked += 1
      continue
    }
    try {
      await createBrandSocialProfile({
        projectId: args.projectId,
        network: candidate.network,
        profileUrl: candidate.profileUrl,
      })
      linkedNetworks.add(candidate.network)
      created += 1
    } catch {
      alreadyLinked += 1
    }
  }

  return { candidates, created, alreadyLinked }
}

export async function updateBrandSocialProfile(args: {
  profileId: number
  network?: CompetitorSocialNetwork
  profileUrl?: string
  isActive?: boolean
}): Promise<ProjectBrandSocialProfile> {
  const supabase = createClientComponentClient()
  const { data: existing, error: existingError } = await supabase
    .from("project_brand_social_profiles")
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
    .from("project_brand_social_profiles")
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
      throw new Error("This brand social profile is already linked to the project")
    }
    throw error
  }
  return data as ProjectBrandSocialProfile
}

export async function deleteBrandSocialProfile(profileId: number): Promise<void> {
  const supabase = createClientComponentClient()
  const { error } = await supabase
    .from("project_brand_social_profiles")
    .delete()
    .eq("id", profileId)
  if (error) throw error
}

export async function listProjectSocialEntities(
  projectId: number,
): Promise<ProjectSocialEntityRow[]> {
  const supabase = createClientComponentClient()
  const { data, error } = await supabase
    .from("v_project_social_entities")
    .select("*")
    .eq("project_id", projectId)
    .order("is_owned", { ascending: false })
    .order("entity_name", { ascending: true })

  if (error) throw error
  return (data ?? []) as ProjectSocialEntityRow[]
}

export async function listProjectSocialPosts(args: {
  projectId: number
  entityIds?: string[] | null
  networks?: CompetitorSocialNetwork[] | null
  from?: string | null
  to?: string | null
  limit?: number
}): Promise<ProjectSocialPost[]> {
  const supabase = createClientComponentClient()
  const { data, error } = await supabase.rpc("fn_list_project_social_posts", {
    p_project_id: args.projectId,
    p_date_from: args.from ?? null,
    p_date_to: args.to ?? null,
    p_networks: args.networks?.length ? args.networks : null,
    p_entity_ids: args.entityIds?.length ? args.entityIds : null,
    p_media_types: null,
    p_limit: args.limit ?? 100,
  })

  if (error) throw error

  return (data ?? []).map((row: Record<string, unknown>) => ({
    ...(row as ProjectSocialPost),
    media_urls: Array.isArray(row.media_urls) ? (row.media_urls as string[]) : [],
    is_owned: row.is_owned === true || row.entity_type === "owned",
    entity_type: (row.entity_type === "owned" ? "owned" : "competitor") as SocialEntityType,
    entity_id:
      typeof row.entity_id === "string"
        ? row.entity_id
        : row.entity_type === "owned"
          ? ownedEntityId(args.projectId)
          : `competitor:${row.competitor_id}`,
  }))
}

export async function syncBrandSocialPosts(args: {
  projectId?: number
  brandSocialProfileId?: number
  trigger?: "manual" | "automatic"
}): Promise<SyncCompetitorSocialPostsResult> {
  return syncCompetitorSocialPosts({
    projectId: args.projectId,
    brandSocialProfileId: args.brandSocialProfileId,
    entityType: "owned",
    trigger: args.trigger ?? "manual",
  })
}

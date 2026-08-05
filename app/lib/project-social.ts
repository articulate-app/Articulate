/**
 * Shared social competitive-monitoring types and pure helpers.
 * Owned brand identity is always derived from the project — never from competitors.
 */

import {
  COMPETITOR_NETWORK_LABELS,
  COMPETITOR_SOCIAL_NETWORKS,
  type CompetitorSocialNetwork,
  type SyncStatus,
  buildPostDedupeKey,
  normalizeHttpUrl,
  normalizeProfileUrl,
  toNullableFiniteInt,
} from "./competitor-social"

export {
  COMPETITOR_NETWORK_LABELS as SOCIAL_NETWORK_LABELS,
  COMPETITOR_SOCIAL_NETWORKS as SOCIAL_NETWORKS,
  buildPostDedupeKey,
  normalizeHttpUrl,
  normalizeProfileUrl,
  type CompetitorSocialNetwork as SocialNetwork,
  type SyncStatus,
}

export type SocialEntityType = "owned" | "competitor"

export type SocialEntity = {
  id: string
  name: string
  entityType: SocialEntityType
  isOwned: boolean
}

export type NormalizedSocialPost = {
  entityId: string
  entityType: SocialEntityType
  isOwned: boolean
  network: string
  externalPostId: string | null
  postUrl: string
  publishedAt: string | null
  textContent: string | null
  mediaType: string | null
  mediaUrls: string[]
  thumbnailUrl: string | null
  reactionsCount: number | null
  commentsCount: number | null
  sharesCount: number | null
  viewsCount: number | null
  followersCountAtSync: number | null
}

/**
 * Public interactions formula (documented):
 * interactions = reactions + comments + shares
 *
 * Null metrics are omitted from the sum (not coerced to 0).
 * Returns null when every component is null/unavailable.
 */
export function computePublicInteractions(args: {
  reactionsCount: number | null | undefined
  commentsCount: number | null | undefined
  sharesCount: number | null | undefined
}): number | null {
  const parts = [args.reactionsCount, args.commentsCount, args.sharesCount]
  const present = parts.filter((value): value is number => typeof value === "number" && Number.isFinite(value))
  if (present.length === 0) return null
  return present.reduce((sum, value) => sum + value, 0)
}

export function ownedEntityId(projectId: number): string {
  return `owned:${projectId}`
}

export function competitorEntityId(competitorId: number): string {
  return `competitor:${competitorId}`
}

export function parseSocialEntityId(entityId: string): {
  entityType: SocialEntityType
  projectId?: number
  competitorId?: number
} | null {
  const owned = /^owned:(\d+)$/.exec(entityId)
  if (owned) {
    return { entityType: "owned", projectId: Number(owned[1]) }
  }
  const competitor = /^competitor:(\d+)$/.exec(entityId)
  if (competitor) {
    return { entityType: "competitor", competitorId: Number(competitor[1]) }
  }
  return null
}

/**
 * Authoritative owned entity for a project.
 * Never derived from competitor rows or name matching.
 */
export function buildOwnedSocialEntity(args: {
  projectId: number
  projectName: string | null | undefined
}): SocialEntity {
  return {
    id: ownedEntityId(args.projectId),
    name: (args.projectName ?? "").trim() || "Our brand",
    entityType: "owned",
    isOwned: true,
  }
}

export function buildCompetitorSocialEntity(args: {
  competitorId: number
  name: string
}): SocialEntity {
  return {
    id: competitorEntityId(args.competitorId),
    name: args.name,
    entityType: "competitor",
    isOwned: false,
  }
}

export function assertOwnedFlagsImmutable(input: {
  entityType?: unknown
  isOwned?: unknown
}): void {
  // Frontend must never invent ownership; backend/view derive these.
  if (input.entityType !== undefined || input.isOwned !== undefined) {
    throw new Error("entityType and isOwned are derived server-side and cannot be set by the client")
  }
}

export function medianOf(values: Array<number | null | undefined>): number | null {
  const nums = values
    .map((value) => toNullableFiniteInt(value))
    .filter((value): value is number => value != null)
    .sort((a, b) => a - b)
  if (nums.length === 0) return null
  const mid = Math.floor(nums.length / 2)
  if (nums.length % 2 === 0) {
    return (nums[mid - 1]! + nums[mid]!) / 2
  }
  return nums[mid]!
}

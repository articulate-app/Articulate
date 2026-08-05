/**
 * Shared competitive-content entity helpers.
 * Owned brand identity is always derived from the project — never from competitors.
 */

import {
  type ContentEntityType,
  type SyncStatus,
  normalizeDomain,
  normalizeHttpUrl,
} from "./competitive-content"
import {
  assertOwnedFlagsImmutable,
  competitorEntityId,
  ownedEntityId,
  parseSocialEntityId,
} from "./project-social"

export {
  assertOwnedFlagsImmutable,
  competitorEntityId,
  ownedEntityId,
  parseSocialEntityId as parseContentEntityId,
  type SyncStatus,
}

export type CompetitiveEntity = {
  id: string
  name: string
  entityType: ContentEntityType
  isOwned: boolean
}

/**
 * Authoritative owned entity for a project.
 * Never derived from competitor rows or name matching.
 */
export function buildOwnedCompetitiveEntity(args: {
  projectId: number
  projectName: string | null | undefined
}): CompetitiveEntity {
  return {
    id: ownedEntityId(args.projectId),
    name: (args.projectName ?? "").trim() || "Our brand",
    entityType: "owned",
    isOwned: true,
  }
}

export function buildCompetitorCompetitiveEntity(args: {
  competitorId: number
  name: string
}): CompetitiveEntity {
  return {
    id: competitorEntityId(args.competitorId),
    name: args.name,
    entityType: "competitor",
    isOwned: false,
  }
}

export function sortCompetitiveEntities<T extends { isOwned: boolean; name: string }>(
  entities: T[],
): T[] {
  return [...entities].sort((a, b) => {
    if (a.isOwned !== b.isOwned) return a.isOwned ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

export function resolveOwnedWebsiteSeed(projectUrl: string | null | undefined): {
  rootUrl: string
  normalizedDomain: string
} | null {
  const rootUrl = normalizeHttpUrl(projectUrl)
  const normalizedDomain = normalizeDomain(projectUrl)
  if (!rootUrl || !normalizedDomain) return null
  return { rootUrl, normalizedDomain }
}

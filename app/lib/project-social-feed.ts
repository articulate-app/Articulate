/**
 * Dedupe cross-network republishes of the same content on the same day.
 */

import type { ProjectSocialPost } from "./services/project-brand-social"
import { computePublicInteractions } from "./project-social"

export type DedupedSocialPost = ProjectSocialPost & {
  networks: string[]
  source_post_ids: number[]
}

function normalizeTextFingerprint(text: string | null | undefined): string {
  return (text ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/https?:\/\/\S+/g, "")
    .trim()
    .slice(0, 160)
}

function publishedDayKey(publishedAt: string | null | undefined): string {
  if (!publishedAt) return "unknown"
  return String(publishedAt).slice(0, 10)
}

function postScore(post: ProjectSocialPost): number {
  const interactions =
    computePublicInteractions({
      reactionsCount: post.reactions_count,
      commentsCount: post.comments_count,
      sharesCount: post.shares_count,
    }) ?? 0
  const hasThumb = post.thumbnail_url ? 1 : 0
  const textLen = (post.text_content ?? "").length
  return interactions * 1000 + hasThumb * 100 + Math.min(textLen, 500)
}

/**
 * Collapse same-entity, same-day, same (or empty) text across networks into one card.
 * Keeps the richest post and lists all networks.
 */
export function dedupeCrossNetworkPosts(posts: ProjectSocialPost[]): DedupedSocialPost[] {
  const groups = new Map<string, ProjectSocialPost[]>()

  for (const post of posts) {
    const fingerprint = normalizeTextFingerprint(post.text_content)
    // Empty text: still dedupe by entity+day only when fingerprint empty? Too aggressive.
    // Require non-empty fingerprint OR match on thumbnail URL basename.
    const keyParts = [
      post.entity_id,
      publishedDayKey(post.published_at),
      fingerprint || `url:${(post.post_url ?? "").replace(/[?#].*$/, "").slice(-80)}`,
    ]
    const key = keyParts.join("|")
    const list = groups.get(key) ?? []
    list.push(post)
    groups.set(key, list)
  }

  const deduped: DedupedSocialPost[] = []
  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => postScore(b) - postScore(a))
    const primary = sorted[0]!
    const networks = [...new Set(sorted.map((post) => post.network))]
    // Keep metrics from the richest (primary) post so card numbers map to one network.
    deduped.push({
      ...primary,
      networks,
      source_post_ids: sorted.map((post) => post.id),
    })
  }

  return deduped.sort((a, b) => {
    const aTime = a.published_at ? new Date(a.published_at).getTime() : 0
    const bTime = b.published_at ? new Date(b.published_at).getTime() : 0
    return bTime - aTime
  })
}

/** Metrics a post feed can be ranked by ("top performers"). */
export const SOCIAL_POST_SORT_METRICS = [
  { key: "interactions", label: "Interactions" },
  { key: "reactions", label: "Likes" },
  { key: "comments", label: "Comments" },
  { key: "shares", label: "Shares" },
  { key: "views", label: "Impressions" },
] as const

export type SocialPostSortMetric =
  (typeof SOCIAL_POST_SORT_METRICS)[number]["key"]

export function postMetricValue(
  post: ProjectSocialPost,
  metric: SocialPostSortMetric,
): number | null {
  switch (metric) {
    case "reactions":
      return post.reactions_count ?? null
    case "comments":
      return post.comments_count ?? null
    case "shares":
      return post.shares_count ?? null
    case "views":
      return post.views_count ?? null
    case "interactions":
      return computePublicInteractions({
        reactionsCount: post.reactions_count,
        commentsCount: post.comments_count,
        sharesCount: post.shares_count,
      })
  }
}

/**
 * Rank posts by an absolute metric, highest first. Posts without the metric
 * sink to the bottom so an unreported network never outranks a real number.
 */
export function sortPostsByMetric<T extends ProjectSocialPost>(
  posts: T[],
  metric: SocialPostSortMetric,
): T[] {
  return [...posts].sort((a, b) => {
    const aValue = postMetricValue(a, metric)
    const bValue = postMetricValue(b, metric)
    if (aValue == null && bValue == null) {
      const aTime = a.published_at ? new Date(a.published_at).getTime() : 0
      const bTime = b.published_at ? new Date(b.published_at).getTime() : 0
      return bTime - aTime
    }
    if (aValue == null) return 1
    if (bValue == null) return -1
    if (bValue !== aValue) return bValue - aValue
    const aTime = a.published_at ? new Date(a.published_at).getTime() : 0
    const bTime = b.published_at ? new Date(b.published_at).getTime() : 0
    return bTime - aTime
  })
}

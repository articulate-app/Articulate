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

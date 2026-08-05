/**
 * Shared types and pure helpers for competitor social monitoring.
 * Used by the frontend and mirrored conceptually in edge adapters.
 */

export const COMPETITOR_SOCIAL_NETWORKS = [
  "linkedin",
  "instagram",
  "facebook",
  "youtube",
  "tiktok",
  "x",
] as const

export type CompetitorSocialNetwork = (typeof COMPETITOR_SOCIAL_NETWORKS)[number]

export const COMPETITOR_NETWORK_LABELS: Record<CompetitorSocialNetwork, string> = {
  linkedin: "LinkedIn",
  instagram: "Instagram",
  facebook: "Facebook",
  youtube: "YouTube",
  tiktok: "TikTok",
  x: "X",
}

export type SyncStatus =
  | "idle"
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "partial"

export type NormalizedCompetitorPost = {
  network: CompetitorSocialNetwork
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
  extraMetrics: Record<string, unknown>
  rawPayload: unknown
}

export function isCompetitorSocialNetwork(value: unknown): value is CompetitorSocialNetwork {
  return (
    typeof value === "string" &&
    (COMPETITOR_SOCIAL_NETWORKS as readonly string[]).includes(value)
  )
}

export function normalizeHttpUrl(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  try {
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    const url = new URL(withProtocol)
    if (!url.hostname.includes(".")) return null
    url.hash = ""
    url.username = ""
    url.password = ""
    // Drop noisy tracking params commonly appended by social networks.
    ;["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "trk", "si"].forEach(
      (key) => url.searchParams.delete(key),
    )
    const normalizedPath = url.pathname.replace(/\/+$/, "") || ""
    url.pathname = normalizedPath
    const host = url.hostname.toLowerCase().replace(/^www\./, "")
    const search = url.searchParams.toString()
    return `https://${host}${url.pathname}${search ? `?${search}` : ""}`
  } catch {
    return null
  }
}

export function normalizeProfileUrl(
  network: CompetitorSocialNetwork,
  rawUrl: string,
): string | null {
  const normalized = normalizeHttpUrl(rawUrl)
  if (!normalized) return null

  try {
    const url = new URL(normalized)
    const host = url.hostname.toLowerCase()

    switch (network) {
      case "linkedin": {
        if (!host.endsWith("linkedin.com")) return null
        // Accept person or company pages.
        if (!/^\/(in|company)\//i.test(url.pathname)) return null
        return `https://www.linkedin.com${url.pathname.replace(/\/+$/, "")}`
      }
      case "instagram": {
        if (!host.includes("instagram.com")) return null
        return `https://www.instagram.com${url.pathname.replace(/\/+$/, "")}`
      }
      case "facebook": {
        if (!host.includes("facebook.com") && !host.includes("fb.com")) return null
        return `https://www.facebook.com${url.pathname.replace(/\/+$/, "")}`
      }
      case "youtube": {
        if (!host.includes("youtube.com") && !host.includes("youtu.be")) return null
        return `https://www.youtube.com${url.pathname.replace(/\/+$/, "")}`
      }
      case "tiktok": {
        if (!host.includes("tiktok.com")) return null
        return `https://www.tiktok.com${url.pathname.replace(/\/+$/, "")}`
      }
      case "x": {
        if (!host.includes("x.com") && !host.includes("twitter.com")) return null
        return `https://x.com${url.pathname.replace(/\/+$/, "")}`
      }
      default:
        return null
    }
  } catch {
    return null
  }
}

export function buildPostDedupeKey(args: {
  externalPostId: string | null
  postUrl: string
}): string {
  const external = args.externalPostId?.trim()
  if (external) return `id:${external}`
  const url = normalizeHttpUrl(args.postUrl)
  if (!url) throw new Error("Post URL is required when external_post_id is missing")
  return `url:${url}`
}

export function toNullableFiniteInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value)
  if (typeof value === "string" && value.trim()) {
    const cleaned = value.replace(/,/g, "").trim()
    const parsed = Number(cleaned)
    return Number.isFinite(parsed) ? Math.trunc(parsed) : null
  }
  return null
}

export function toNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null
}

export function extractFacebookUsername(profileUrl: string): string | null {
  const normalized = normalizeHttpUrl(profileUrl)
  if (!normalized) return null
  try {
    const path = new URL(normalized).pathname.replace(/^\/+|\/+$/g, "")
    if (!path) return null
    const first = path.split("/")[0] ?? null
    if (!first || ["profile.php", "pages", "groups", "watch", "reel"].includes(first)) {
      const params = new URL(normalized).searchParams.get("id")
      return params
    }
    return first
  } catch {
    return null
  }
}

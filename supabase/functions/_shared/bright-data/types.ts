export type CompetitorSocialNetwork =
  | "linkedin"
  | "instagram"
  | "facebook"
  | "youtube"
  | "tiktok"
  | "x"

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

export type FetchPostsArgs = {
  profileUrl: string
  /** ISO date — only posts on/after this date when supported by the dataset. */
  startDateIso: string | null
  /** Soft cap for first sync / discovery when the API accepts a limit. */
  maxPosts: number
}

/** Everything needed to start a Bright Data snapshot, without starting it. */
export type BrightDataRequestSpec = {
  options: import("./client.ts").BrightDataTriggerOptions
  input: unknown[]
  metadata: Record<string, unknown>
}

export type FetchPostsResult = {
  posts: NormalizedCompetitorPost[]
  snapshotId: string | null
  rawCount: number
  metadata: Record<string, unknown>
}

export type NetworkAdapter = {
  network: CompetitorSocialNetwork
  /** Trigger and collection are separate so a slow snapshot can be resumed later. */
  buildRequest: (args: FetchPostsArgs) => BrightDataRequestSpec
  mapRecords: (records: unknown[], args: FetchPostsArgs) => NormalizedCompetitorPost[]
  fetchPosts: (
    args: FetchPostsArgs,
    client: import("./client.ts").BrightDataClient,
  ) => Promise<FetchPostsResult>
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export function toNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null
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

export function stringArrayFromUnknown(value: unknown): string[] {
  if (!Array.isArray(value)) {
    const single = toNullableString(value)
    return single ? [single] : []
  }
  return value
    .map((item) => {
      if (typeof item === "string") return item.trim()
      const record = asRecord(item)
      return (
        toNullableString(record?.url) ??
        toNullableString(record?.src) ??
        toNullableString(record?.image) ??
        ""
      )
    })
    .filter(Boolean)
}

export function extractFacebookUsername(profileUrl: string): string | null {
  const normalized = normalizeHttpUrl(profileUrl)
  if (!normalized) return null
  try {
    const url = new URL(normalized)
    const path = url.pathname.replace(/^\/+|\/+$/g, "")
    if (!path) return null
    const first = path.split("/")[0] ?? null
    if (!first || ["profile.php", "pages", "groups", "watch", "reel"].includes(first)) {
      return url.searchParams.get("id")
    }
    return first
  } catch {
    return null
  }
}

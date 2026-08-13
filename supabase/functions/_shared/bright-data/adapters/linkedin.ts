import {
  asRecord,
  normalizeHttpUrl,
  stringArrayFromUnknown,
  toNullableFiniteInt,
  toNullableString,
  type FetchPostsArgs,
  type NormalizedCompetitorPost,
} from "../types.ts"
import { createNetworkAdapter } from "./create-adapter.ts"

/** LinkedIn posts dataset — discover by profile URL. */
const LINKEDIN_POSTS_DATASET_ID = "gd_lyy3tktm25m4avu764"

function mapLinkedInPost(raw: unknown): NormalizedCompetitorPost | null {
  const row = asRecord(raw)
  if (!row) return null

  const postUrl =
    normalizeHttpUrl(toNullableString(row.url) ?? toNullableString(row.post_url)) ??
    null
  if (!postUrl) return null

  const externalPostId =
    toNullableString(row.id) ??
    toNullableString(row.post_id) ??
    toNullableString(row.activity_id)

  const images = stringArrayFromUnknown(row.images)
  const videos = stringArrayFromUnknown(row.videos)
  const mediaUrls = [...images, ...videos]
  const thumbnail =
    toNullableString(row.video_thumbnail) ??
    images[0] ??
    null

  let mediaType: string | null = toNullableString(row.post_type)
  if (!mediaType) {
    if (videos.length > 0) mediaType = "video"
    else if (images.length > 0) mediaType = "image"
    else mediaType = "text"
  }

  return {
    network: "linkedin",
    externalPostId,
    postUrl,
    publishedAt: toNullableString(row.date_posted) ?? toNullableString(row.created_at),
    textContent: toNullableString(row.post_text) ?? toNullableString(row.title),
    mediaType,
    mediaUrls,
    thumbnailUrl: thumbnail,
    reactionsCount:
      toNullableFiniteInt(row.num_likes) ?? toNullableFiniteInt(row.likes),
    commentsCount: toNullableFiniteInt(row.num_comments),
    sharesCount:
      toNullableFiniteInt(row.num_shares) ?? toNullableFiniteInt(row.shares),
    viewsCount: toNullableFiniteInt(row.num_views) ?? toNullableFiniteInt(row.views),
    followersCountAtSync: toNullableFiniteInt(row.user_followers),
    extraMetrics: {
      headline: row.headline ?? null,
      user_id: row.user_id ?? null,
      use_url: row.use_url ?? null,
      hashtags: row.hashtags ?? null,
      post_type: row.post_type ?? null,
    },
    rawPayload: raw,
  }
}

/**
 * Company pages and Showcase pages both publish as org feeds. Bright Data's
 * `company_url` discover works for `/company/` and `/showcase/`; treating a
 * showcase as a person `profile_url` returns empty/error rows (posts_found=0).
 */
export function isLinkedInOrganizationUrl(profileUrl: string): boolean {
  return /linkedin\.com\/(company|showcase)\//i.test(profileUrl)
}

export const linkedinAdapter = createNetworkAdapter({
  network: "linkedin",
  mapPost: mapLinkedInPost,
  buildRequest(args: FetchPostsArgs) {
    const isOrganization = isLinkedInOrganizationUrl(args.profileUrl)
    const discoverBy = isOrganization ? "company_url" : "profile_url"
    const input: Record<string, unknown> = {
      url: args.profileUrl,
    }
    if (!isOrganization) input.only_authored_posts = true
    if (args.startDateIso) input.start_date = args.startDateIso

    return {
      options: {
        datasetId: LINKEDIN_POSTS_DATASET_ID,
        type: "discover_new",
        discoverBy,
        format: "json",
        includeErrors: true,
      },
      input: [input],
      metadata: {
        dataset_id: LINKEDIN_POSTS_DATASET_ID,
        discover_by: discoverBy,
      },
    }
  },
})

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

/** Instagram posts — discover by profile URL. */
const INSTAGRAM_POSTS_DATASET_ID = "gd_lk5ns7kz21pck8jpis"

function mapInstagramPost(raw: unknown): NormalizedCompetitorPost | null {
  const row = asRecord(raw)
  if (!row) return null
  const postUrl =
    normalizeHttpUrl(toNullableString(row.url) ?? toNullableString(row.post_url)) ??
    null
  if (!postUrl) return null

  const mediaUrls = stringArrayFromUnknown(
    row.photos ?? row.images ?? row.display_url ?? row.video_url,
  )
  const thumbnail =
    toNullableString(row.thumbnail) ??
    toNullableString(row.display_url) ??
    mediaUrls[0] ??
    null

  return {
    network: "instagram",
    externalPostId:
      toNullableString(row.id) ??
      toNullableString(row.pk) ??
      toNullableString(row.shortcode),
    postUrl,
    publishedAt:
      toNullableString(row.date_posted) ??
      toNullableString(row.taken_at) ??
      toNullableString(row.timestamp),
    textContent:
      toNullableString(row.description) ??
      toNullableString(row.caption) ??
      toNullableString(row.post_text),
    mediaType: toNullableString(row.content_type) ?? toNullableString(row.product_type),
    mediaUrls,
    thumbnailUrl: thumbnail,
    reactionsCount:
      toNullableFiniteInt(row.likes) ?? toNullableFiniteInt(row.likes_count),
    commentsCount:
      toNullableFiniteInt(row.comments) ?? toNullableFiniteInt(row.num_comments),
    sharesCount: toNullableFiniteInt(row.shares),
    viewsCount:
      toNullableFiniteInt(row.video_view_count) ?? toNullableFiniteInt(row.views),
    followersCountAtSync: toNullableFiniteInt(row.followers) ?? toNullableFiniteInt(row.followers_count),
    extraMetrics: {
      shortcode: row.shortcode ?? null,
      is_verified: row.is_verified ?? null,
    },
    rawPayload: raw,
  }
}

export const instagramAdapter = createNetworkAdapter({
  network: "instagram",
  mapPost: mapInstagramPost,
  buildRequest(args: FetchPostsArgs) {
    const input: Record<string, unknown> = {
      url: args.profileUrl,
      num_of_posts: args.maxPosts,
    }
    if (args.startDateIso) input.start_date = args.startDateIso

    return {
      options: {
        datasetId: INSTAGRAM_POSTS_DATASET_ID,
        type: "discover_new",
        discoverBy: "url",
        format: "json",
        includeErrors: true,
      },
      input: [input],
      metadata: {
        dataset_id: INSTAGRAM_POSTS_DATASET_ID,
        discover_by: "url",
      },
    }
  },
})

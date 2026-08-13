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

/** X (Twitter) posts — discover by profile URL. */
const X_POSTS_DATASET_ID = "gd_lwxkxvnf1cynvib9co"

function mapXPost(raw: unknown): NormalizedCompetitorPost | null {
  const row = asRecord(raw)
  if (!row) return null
  const postUrl =
    normalizeHttpUrl(
      toNullableString(row.url) ??
        toNullableString(row.post_url) ??
        toNullableString(row.tweet_url),
    ) ?? null
  if (!postUrl) return null

  const mediaUrls = stringArrayFromUnknown(
    row.photos ?? row.videos ?? row.media ?? row.images,
  )

  return {
    network: "x",
    externalPostId:
      toNullableString(row.id) ??
      toNullableString(row.tweet_id) ??
      toNullableString(row.post_id),
    postUrl,
    publishedAt:
      toNullableString(row.date_posted) ??
      toNullableString(row.created_at) ??
      toNullableString(row.timestamp),
    textContent:
      toNullableString(row.description) ??
      toNullableString(row.post_text) ??
      toNullableString(row.full_text) ??
      toNullableString(row.text),
    mediaType: mediaUrls.length > 0 ? "media" : "text",
    mediaUrls,
    thumbnailUrl:
      toNullableString(row.thumbnail) ??
      mediaUrls[0] ??
      null,
    reactionsCount:
      toNullableFiniteInt(row.likes) ??
      toNullableFiniteInt(row.favorite_count) ??
      toNullableFiniteInt(row.num_likes),
    commentsCount:
      toNullableFiniteInt(row.replies) ??
      toNullableFiniteInt(row.reply_count) ??
      toNullableFiniteInt(row.num_comments),
    sharesCount:
      toNullableFiniteInt(row.reposts) ??
      toNullableFiniteInt(row.retweet_count) ??
      toNullableFiniteInt(row.quotes),
    viewsCount:
      toNullableFiniteInt(row.views) ?? toNullableFiniteInt(row.view_count),
    followersCountAtSync:
      toNullableFiniteInt(row.followers) ?? toNullableFiniteInt(row.user_followers),
    extraMetrics: {
      user_name: row.user_name ?? row.username ?? null,
      is_verified: row.is_verified ?? null,
    },
    rawPayload: raw,
  }
}

export const xAdapter = createNetworkAdapter({
  network: "x",
  mapPost: mapXPost,
  buildRequest(args: FetchPostsArgs) {
    const input: Record<string, unknown> = { url: args.profileUrl }
    if (args.startDateIso) input.start_date = args.startDateIso

    return {
      options: {
        datasetId: X_POSTS_DATASET_ID,
        type: "discover_new",
        discoverBy: "profile_url",
        format: "json",
        includeErrors: true,
      },
      input: [input],
      metadata: {
        dataset_id: X_POSTS_DATASET_ID,
        discover_by: "profile_url",
      },
    }
  },
})

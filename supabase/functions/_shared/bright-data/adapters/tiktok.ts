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

/** TikTok posts — discover by profile URL. */
const TIKTOK_POSTS_DATASET_ID = "gd_lu702nij2f790tmv9h"

function mapTikTokPost(raw: unknown): NormalizedCompetitorPost | null {
  const row = asRecord(raw)
  if (!row) return null
  const postUrl =
    normalizeHttpUrl(toNullableString(row.url) ?? toNullableString(row.video_url)) ??
    null
  if (!postUrl) return null

  return {
    network: "tiktok",
    externalPostId:
      toNullableString(row.post_id) ??
      toNullableString(row.video_id) ??
      toNullableString(row.id),
    postUrl,
    publishedAt:
      toNullableString(row.create_time) ??
      toNullableString(row.date_posted) ??
      toNullableString(row.timestamp),
    textContent:
      toNullableString(row.description) ??
      toNullableString(row.post_text) ??
      toNullableString(row.title),
    mediaType: "video",
    mediaUrls: stringArrayFromUnknown(row.video_url ?? row.url),
    thumbnailUrl:
      toNullableString(row.thumbnail) ??
      toNullableString(row.cover) ??
      toNullableString(row.preview_image) ??
      null,
    reactionsCount:
      toNullableFiniteInt(row.digg_count) ??
      toNullableFiniteInt(row.likes) ??
      toNullableFiniteInt(row.num_likes),
    commentsCount:
      toNullableFiniteInt(row.comment_count) ?? toNullableFiniteInt(row.num_comments),
    sharesCount:
      toNullableFiniteInt(row.share_count) ?? toNullableFiniteInt(row.shares),
    viewsCount:
      toNullableFiniteInt(row.play_count) ?? toNullableFiniteInt(row.views),
    followersCountAtSync:
      toNullableFiniteInt(row.followers) ??
      toNullableFiniteInt(row.author_followers) ??
      null,
    extraMetrics: {
      profile_username: row.profile_username ?? row.author_username ?? null,
    },
    rawPayload: raw,
  }
}

export const tiktokAdapter = createNetworkAdapter({
  network: "tiktok",
  mapPost: mapTikTokPost,
  buildRequest(args: FetchPostsArgs) {
    const input: Record<string, unknown> = { url: args.profileUrl }
    if (args.startDateIso) input.start_date = args.startDateIso

    return {
      options: {
        datasetId: TIKTOK_POSTS_DATASET_ID,
        type: "discover_new",
        discoverBy: "profile_url",
        format: "json",
        includeErrors: true,
      },
      input: [input],
      metadata: {
        dataset_id: TIKTOK_POSTS_DATASET_ID,
        discover_by: "profile_url",
      },
    }
  },
})

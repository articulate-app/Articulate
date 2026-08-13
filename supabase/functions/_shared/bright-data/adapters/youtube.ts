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

/** YouTube videos — discover by channel/playlist URL. */
const YOUTUBE_VIDEOS_DATASET_ID = "gd_lk56epmy2i5g7lzu0k"

function mapYouTubeVideo(raw: unknown): NormalizedCompetitorPost | null {
  const row = asRecord(raw)
  if (!row) return null
  const postUrl =
    normalizeHttpUrl(
      toNullableString(row.url) ??
        toNullableString(row.video_url) ??
        (toNullableString(row.video_id)
          ? `https://www.youtube.com/watch?v=${toNullableString(row.video_id)}`
          : null),
    ) ?? null
  if (!postUrl) return null

  return {
    network: "youtube",
    externalPostId: toNullableString(row.video_id) ?? toNullableString(row.id),
    postUrl,
    publishedAt:
      toNullableString(row.date_posted) ??
      toNullableString(row.published_at) ??
      toNullableString(row.upload_date),
    textContent:
      toNullableString(row.title) ??
      toNullableString(row.description) ??
      toNullableString(row.post_text),
    mediaType: "video",
    mediaUrls: stringArrayFromUnknown(row.url ?? row.video_url),
    thumbnailUrl:
      toNullableString(row.thumbnail) ??
      toNullableString(row.thumbnail_url) ??
      null,
    reactionsCount:
      toNullableFiniteInt(row.likes) ?? toNullableFiniteInt(row.num_likes),
    commentsCount:
      toNullableFiniteInt(row.num_comments) ?? toNullableFiniteInt(row.comments_count),
    sharesCount: toNullableFiniteInt(row.shares),
    viewsCount:
      toNullableFiniteInt(row.views) ?? toNullableFiniteInt(row.view_count),
    followersCountAtSync:
      toNullableFiniteInt(row.subscribers) ?? toNullableFiniteInt(row.channel_subscribers),
    extraMetrics: {
      channel_name: row.channel_name ?? row.youtuber ?? null,
      duration: row.duration ?? row.length ?? null,
    },
    rawPayload: raw,
  }
}

export const youtubeAdapter = createNetworkAdapter({
  network: "youtube",
  mapPost: mapYouTubeVideo,
  buildRequest(args: FetchPostsArgs) {
    const input: Record<string, unknown> = { url: args.profileUrl }
    if (args.startDateIso) input.start_date = args.startDateIso

    return {
      options: {
        datasetId: YOUTUBE_VIDEOS_DATASET_ID,
        type: "discover_new",
        discoverBy: "url",
        format: "json",
        includeErrors: true,
      },
      input: [input],
      metadata: {
        dataset_id: YOUTUBE_VIDEOS_DATASET_ID,
        discover_by: "url",
      },
    }
  },
})

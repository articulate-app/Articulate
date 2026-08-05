import type { BrightDataClient } from "../client.ts"
import {
  asRecord,
  normalizeHttpUrl,
  stringArrayFromUnknown,
  toNullableFiniteInt,
  toNullableString,
  type FetchPostsArgs,
  type NetworkAdapter,
  type NormalizedCompetitorPost,
} from "../types.ts"

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

export const youtubeAdapter: NetworkAdapter = {
  network: "youtube",
  async fetchPosts(args: FetchPostsArgs, client: BrightDataClient) {
    const input: Record<string, unknown> = { url: args.profileUrl }
    if (args.startDateIso) input.start_date = args.startDateIso

    const { snapshotId, records } = await client.triggerAndCollect({
      options: {
        datasetId: YOUTUBE_VIDEOS_DATASET_ID,
        type: "discover_new",
        discoverBy: "url",
        format: "json",
        includeErrors: true,
      },
      input: [input],
    })

    const posts = records
      .map(mapYouTubeVideo)
      .filter((post): post is NormalizedCompetitorPost => Boolean(post))
      .slice(0, Math.max(1, args.maxPosts))

    return {
      posts,
      snapshotId,
      rawCount: records.length,
      metadata: {
        dataset_id: YOUTUBE_VIDEOS_DATASET_ID,
        discover_by: "url",
      },
    }
  },
}

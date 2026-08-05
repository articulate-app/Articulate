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

export const instagramAdapter: NetworkAdapter = {
  network: "instagram",
  async fetchPosts(args: FetchPostsArgs, client: BrightDataClient) {
    const input: Record<string, unknown> = {
      url: args.profileUrl,
      num_of_posts: args.maxPosts,
    }
    if (args.startDateIso) input.start_date = args.startDateIso

    const { snapshotId, records } = await client.triggerAndCollect({
      options: {
        datasetId: INSTAGRAM_POSTS_DATASET_ID,
        type: "discover_new",
        discoverBy: "url",
        format: "json",
        includeErrors: true,
      },
      input: [input],
    })

    const posts = records
      .map(mapInstagramPost)
      .filter((post): post is NormalizedCompetitorPost => Boolean(post))
      .slice(0, Math.max(1, args.maxPosts))

    return {
      posts,
      snapshotId,
      rawCount: records.length,
      metadata: {
        dataset_id: INSTAGRAM_POSTS_DATASET_ID,
        discover_by: "url",
      },
    }
  },
}

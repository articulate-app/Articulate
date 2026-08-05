import type { BrightDataClient } from "../client.ts"
import {
  asRecord,
  extractFacebookUsername,
  normalizeHttpUrl,
  stringArrayFromUnknown,
  toNullableFiniteInt,
  toNullableString,
  type FetchPostsArgs,
  type NetworkAdapter,
  type NormalizedCompetitorPost,
} from "../types.ts"

/** Facebook page posts — discover by username. */
const FACEBOOK_PAGE_POSTS_DATASET_ID = "gd_lkaxegm826bjpoo9m5"

function mapFacebookPost(raw: unknown): NormalizedCompetitorPost | null {
  const row = asRecord(raw)
  if (!row) return null
  const postUrl =
    normalizeHttpUrl(toNullableString(row.url) ?? toNullableString(row.post_url)) ??
    null
  if (!postUrl) return null

  const mediaUrls = stringArrayFromUnknown(
    row.attachments ?? row.images ?? row.image ?? row.video,
  )
  const reactions =
    toNullableFiniteInt(row.num_likes) ??
    toNullableFiniteInt(row.likes_count) ??
    toNullableFiniteInt(row.reaction_count) ??
    (() => {
      const list = Array.isArray(row.reactions) ? row.reactions : []
      let total = 0
      let hasAny = false
      for (const item of list) {
        const count = toNullableFiniteInt(asRecord(item)?.reaction_count)
        if (count != null) {
          hasAny = true
          total += count
        }
      }
      return hasAny ? total : null
    })()

  return {
    network: "facebook",
    externalPostId: toNullableString(row.post_id) ?? toNullableString(row.id),
    postUrl,
    publishedAt:
      toNullableString(row.date_posted) ??
      toNullableString(row.create_time) ??
      toNullableString(row.timestamp),
    textContent:
      toNullableString(row.content) ??
      toNullableString(row.post_text) ??
      toNullableString(row.message),
    mediaType: toNullableString(row.type) ?? toNullableString(row.post_type),
    mediaUrls,
    thumbnailUrl:
      toNullableString(row.thumbnail) ??
      toNullableString(row.image) ??
      mediaUrls[0] ??
      null,
    reactionsCount: reactions,
    commentsCount:
      toNullableFiniteInt(row.num_comments) ?? toNullableFiniteInt(row.comments_count),
    sharesCount:
      toNullableFiniteInt(row.num_shares) ?? toNullableFiniteInt(row.shares_count),
    viewsCount:
      toNullableFiniteInt(row.play_count) ?? toNullableFiniteInt(row.video_view_count),
    followersCountAtSync:
      toNullableFiniteInt(row.page_followers) ?? toNullableFiniteInt(row.followers),
    extraMetrics: {
      is_page: row.is_page ?? null,
      user_username_raw: row.user_username_raw ?? null,
    },
    rawPayload: raw,
  }
}

export const facebookAdapter: NetworkAdapter = {
  network: "facebook",
  async fetchPosts(args: FetchPostsArgs, client: BrightDataClient) {
    const profileUrl = normalizeHttpUrl(args.profileUrl) ?? args.profileUrl
    const username = extractFacebookUsername(profileUrl)

    // Dataset gd_lkaxegm826bjpoo9m5 = "Pages Posts by Profile URL"
    // Official input is `{ url: "https://www.facebook.com/{page}" }` (not user_name).
    // Docs: https://docs.brightdata.com/datasets/scrapers/facebook/send-first-request
    const input: Record<string, unknown> = { url: profileUrl }
    if (args.startDateIso) input.start_date = args.startDateIso

    const { snapshotId, records } = await client.triggerAndCollect({
      options: {
        datasetId: FACEBOOK_PAGE_POSTS_DATASET_ID,
        format: "json",
        includeErrors: true,
      },
      input: [input],
    })

    const posts = records
      .map(mapFacebookPost)
      .filter((post): post is NormalizedCompetitorPost => Boolean(post))
      .slice(0, Math.max(1, args.maxPosts))

    return {
      posts,
      snapshotId,
      rawCount: records.length,
      metadata: {
        dataset_id: FACEBOOK_PAGE_POSTS_DATASET_ID,
        input_mode: "url",
        user_name: username,
      },
    }
  },
}

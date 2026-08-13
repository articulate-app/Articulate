import { describe, expect, it } from "vitest"
import {
  dedupeCrossNetworkPosts,
  sortPostsByMetric,
} from "../app/lib/project-social-feed"
import type { ProjectSocialPost } from "../app/lib/services/project-brand-social"

function post(partial: Partial<ProjectSocialPost> & Pick<ProjectSocialPost, "id" | "network">): ProjectSocialPost {
  return {
    project_id: 1,
    entity_id: "competitor:1",
    entity_type: "competitor",
    is_owned: false,
    entity_name: "Rival",
    external_post_id: null,
    post_url: `https://example.com/${partial.network}/${partial.id}`,
    published_at: "2026-08-02T12:00:00.000Z",
    text_content: "Same caption across networks today",
    media_type: null,
    media_urls: [],
    thumbnail_url: null,
    reactions_count: 1,
    comments_count: 0,
    shares_count: 0,
    views_count: null,
    followers_count_at_sync: null,
    extra_metrics: {},
    last_seen_at: "2026-08-02T12:00:00.000Z",
    created_at: "2026-08-02T12:00:00.000Z",
    updated_at: "2026-08-02T12:00:00.000Z",
    competitor_id: 1,
    social_profile_id: 1,
    brand_social_profile_id: null,
    ...partial,
  }
}

describe("dedupeCrossNetworkPosts", () => {
  it("collapses same entity/day/caption across networks into one card", () => {
    const result = dedupeCrossNetworkPosts([
      post({ id: 1, network: "instagram", reactions_count: 10 }),
      post({ id: 2, network: "facebook", reactions_count: 40, thumbnail_url: "https://img" }),
      post({ id: 3, network: "linkedin", reactions_count: 5 }),
    ])
    expect(result).toHaveLength(1)
    expect(result[0]?.networks.sort()).toEqual(["facebook", "instagram", "linkedin"])
    expect(result[0]?.network).toBe("facebook")
    expect(result[0]?.reactions_count).toBe(40)
    expect(result[0]?.thumbnail_url).toBe("https://img")
  })

  it("keeps metrics from the primary (richest) post, not max across networks", () => {
    const result = dedupeCrossNetworkPosts([
      post({
        id: 1,
        network: "instagram",
        reactions_count: 50,
        comments_count: 40,
        shares_count: 10,
        thumbnail_url: "https://img",
      }),
      post({
        id: 2,
        network: "facebook",
        reactions_count: 90,
        comments_count: 0,
        shares_count: 0,
        thumbnail_url: null,
      }),
    ])
    expect(result).toHaveLength(1)
    // Instagram wins on total interactions even though Facebook has more likes alone.
    expect(result[0]?.network).toBe("instagram")
    expect(result[0]?.reactions_count).toBe(50)
    expect(result[0]?.comments_count).toBe(40)
  })

  it("keeps different captions separate", () => {
    const result = dedupeCrossNetworkPosts([
      post({ id: 1, network: "instagram", text_content: "Hello A" }),
      post({ id: 2, network: "facebook", text_content: "Hello B" }),
    ])
    expect(result).toHaveLength(2)
  })
})

describe("sortPostsByMetric", () => {
  const posts = [
    post({ id: 1, network: "instagram", reactions_count: 5, comments_count: 1, shares_count: 0, views_count: 900 }),
    post({ id: 2, network: "facebook", reactions_count: 50, comments_count: 0, shares_count: 0, views_count: null }),
    post({ id: 3, network: "linkedin", reactions_count: 10, comments_count: 30, shares_count: 5, views_count: 100 }),
  ]

  it("ranks by total interactions by default metric", () => {
    expect(sortPostsByMetric(posts, "interactions").map((row) => row.id)).toEqual([
      2, 3, 1,
    ])
  })

  it("ranks by a single engagement metric", () => {
    expect(sortPostsByMetric(posts, "comments").map((row) => row.id)).toEqual([
      3, 1, 2,
    ])
  })

  it("pushes posts without the metric to the end", () => {
    expect(sortPostsByMetric(posts, "views").map((row) => row.id)).toEqual([1, 3, 2])
  })

  it("does not mutate the input array", () => {
    const input = [...posts]
    sortPostsByMetric(input, "reactions")
    expect(input.map((row) => row.id)).toEqual([1, 2, 3])
  })
})

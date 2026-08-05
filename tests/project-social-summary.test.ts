import { describe, expect, it } from "vitest"
import {
  buildCompetitiveNarrative,
  buildCompetitiveRadarData,
  buildEntitySummaryBullets,
  rankEntitiesByEngagement,
  type SocialCompetitiveSummary,
  type SocialSummaryEntityMetrics,
} from "../app/lib/project-social-summary"

function entity(
  partial: Partial<SocialSummaryEntityMetrics> &
    Pick<SocialSummaryEntityMetrics, "entity_id" | "entity_name" | "is_owned">,
): SocialSummaryEntityMetrics {
  return {
    entity_type: partial.is_owned ? "owned" : "competitor",
    posts_count: 0,
    posts_with_interactions: 0,
    interactions_total: null,
    interactions_avg: null,
    interactions_median: null,
    reactions_total: null,
    comments_total: null,
    shares_total: null,
    views_total: null,
    share_of_posts_pct: null,
    share_of_interactions_pct: null,
    followers_latest: null,
    followers_delta: null,
    followers_delta_pct: null,
    follower_snapshot_days: null,
    networks: [],
    ...partial,
  }
}

describe("project-social-summary templates", () => {
  it("builds empty-state narrative when there are no posts", () => {
    const summary: SocialCompetitiveSummary = {
      project_id: 1,
      date_from: null,
      date_to: null,
      totals: { posts_count: 0, interactions_total: null, entities_count: 1 },
      entities: [
        entity({
          entity_id: "owned:1",
          entity_name: "Brand",
          is_owned: true,
        }),
      ],
    }
    expect(buildCompetitiveNarrative(summary)[0]).toContain("No tracked posts")
  })

  it("compares owned median interactions vs top competitor", () => {
    const summary: SocialCompetitiveSummary = {
      project_id: 1,
      date_from: null,
      date_to: null,
      totals: { posts_count: 10, interactions_total: 100, entities_count: 2 },
      entities: [
        entity({
          entity_id: "owned:1",
          entity_name: "Brand",
          is_owned: true,
          posts_count: 4,
          interactions_median: 20,
        }),
        entity({
          entity_id: "competitor:2",
          entity_name: "Rival",
          is_owned: false,
          posts_count: 6,
          interactions_median: 10,
        }),
      ],
    }
    const lines = buildCompetitiveNarrative(summary)
    expect(lines.some((line) => line.includes("100%") && line.includes("above"))).toBe(
      true,
    )
  })

  it("reports insufficient follower data when snapshots are missing", () => {
    const bullets = buildEntitySummaryBullets(
      entity({
        entity_id: "owned:1",
        entity_name: "Brand",
        is_owned: true,
        posts_count: 3,
        interactions_median: 12,
        interactions_total: 40,
        share_of_posts_pct: 30,
        share_of_interactions_pct: 25,
        follower_snapshot_days: 1,
      }),
    )
    expect(bullets.some((line) => line.includes("insufficient data"))).toBe(true)
    expect(bullets.some((line) => /share of/i.test(line))).toBe(false)
    expect(bullets.some((line) => line.includes("of tracked posts"))).toBe(false)
    expect(bullets.some((line) => line.includes("Total public interactions: 40"))).toBe(
      true,
    )
  })

  it("keeps owned entities first when ranking by engagement", () => {
    const ranked = rankEntitiesByEngagement([
      entity({
        entity_id: "competitor:9",
        entity_name: "Rival",
        is_owned: false,
        interactions_total: 999,
      }),
      entity({
        entity_id: "owned:1",
        entity_name: "Brand",
        is_owned: true,
        interactions_total: 1,
      }),
    ])
    expect(ranked[0]?.is_owned).toBe(true)
  })

  it("normalizes radar axes to period max and keeps owned brand", () => {
    const radar = buildCompetitiveRadarData(
      [
        entity({
          entity_id: "owned:1",
          entity_name: "Brand",
          is_owned: true,
          posts_count: 5,
          interactions_median: 10,
          interactions_total: 50,
          interactions_avg: 10,
          followers_latest: 1000,
        }),
        entity({
          entity_id: "competitor:2",
          entity_name: "Rival",
          is_owned: false,
          posts_count: 10,
          interactions_median: 20,
          interactions_total: 200,
          interactions_avg: 20,
          followers_latest: 500,
        }),
      ],
      { maxCompetitors: 3 },
    )

    expect(radar.hasComparableData).toBe(true)
    expect(radar.entities[0]?.is_owned).toBe(true)
    expect(radar.maxima.posts).toBe(10)
    expect(radar.maxima.followers).toBe(1000)

    const postsAxis = radar.chartData.find((row) => row.metric === "posts")
    const ownedKey = radar.entities[0]?.dataKey
    const rivalKey = radar.entities[1]?.dataKey
    expect(ownedKey).toBeTruthy()
    expect(rivalKey).toBeTruthy()
    expect(postsAxis?.[rivalKey!]).toBe(100)
    expect(postsAxis?.[ownedKey!]).toBe(50)
    expect(postsAxis?.raw[ownedKey!]).toBe(5)
  })

  it("marks radar empty when there are no posts", () => {
    const radar = buildCompetitiveRadarData([
      entity({
        entity_id: "owned:1",
        entity_name: "Brand",
        is_owned: true,
        posts_count: 0,
      }),
    ])
    expect(radar.hasComparableData).toBe(false)
  })
})

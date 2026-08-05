import { describe, expect, it } from "vitest"
import {
  articleBelongsToSource,
  classifyKeywordGapOpportunity,
  extractKeywordCandidatesFromContent,
  inferSourceTypeFromUrl,
  normalizeDomain,
  normalizeHttpUrl,
  normalizeKeywordKey,
  scoreEditorialSourceCandidate,
  shouldPreserveManualSource,
  simpleContentHash,
} from "../app/lib/competitive-content"
import {
  buildCompetitorCompetitiveEntity,
  buildOwnedCompetitiveEntity,
  resolveOwnedWebsiteSeed,
  sortCompetitiveEntities,
} from "../app/lib/project-competitive-content"
import {
  buildContentEntitySummaryText,
} from "../app/lib/project-competitive-content-summary"
import {
  buildGoogleAdsKeywordSeed,
  resolveKeywordResearchMode,
} from "../app/lib/keyword-research-input"
import { assertOwnedFlagsImmutable } from "../app/lib/project-social"

describe("competitive content URL helpers", () => {
  it("normalizes URLs and domains", () => {
    expect(
      normalizeHttpUrl("https://www.example.com/blog/post/?utm_source=x"),
    ).toBe("https://www.example.com/blog/post")
    expect(normalizeDomain("https://www.Example.com/path")).toBe("example.com")
  })

  it("infers source types from arbitrary editorial paths", () => {
    expect(inferSourceTypeFromUrl("https://example.com/insights/")).toBe("insights")
    expect(inferSourceTypeFromUrl("https://example.com/actualites/")).toBe("news")
    expect(inferSourceTypeFromUrl("https://example.com/knowledge-hub/")).toBe(
      "knowledge",
    )
  })

  it("scores editorial candidates and flags ambiguous band for AI", () => {
    const high = scoreEditorialSourceCandidate({
      sourceUrl: "https://example.com/insights/",
      hasFeed: true,
      hasSitemap: true,
      samplePages: [
        {
          url: "https://example.com/insights/a",
          schemaTypes: ["Article"],
          publishedAt: "2026-07-01",
          author: " ann",
          ogType: "article",
        },
        {
          url: "https://example.com/insights/b",
          schemaTypes: ["BlogPosting"],
          publishedAt: "2026-07-02",
        },
        {
          url: "https://example.com/insights/c",
          schemaTypes: ["NewsArticle"],
          publishedAt: "2026-07-03",
        },
      ],
    })
    expect(high.confidence).toBeGreaterThanOrEqual(0.75)
    expect(high.needsAi).toBe(false)

    const ambiguous = scoreEditorialSourceCandidate({
      sourceUrl: "https://example.com/hub/",
      hasSitemap: true,
      samplePages: [
        {
          url: "https://example.com/hub/a",
          publishedAt: "2026-07-01",
          schemaTypes: ["Article"],
        },
        {
          url: "https://example.com/hub/b",
          publishedAt: "2026-07-02",
        },
      ],
    })
    expect(ambiguous.confidence).toBeGreaterThanOrEqual(0.35)
    expect(ambiguous.confidence).toBeLessThan(0.75)
    expect(ambiguous.needsAi).toBe(true)
  })

  it("preserves ignored and manually confirmed sources", () => {
    expect(
      shouldPreserveManualSource({ status: "ignored", isManualOverride: false }),
    ).toBe(true)
    expect(
      shouldPreserveManualSource({ status: "confirmed", isManualOverride: true }),
    ).toBe(true)
    expect(
      shouldPreserveManualSource({ status: "suggested", isManualOverride: false }),
    ).toBe(false)
  })

  it("matches articles to source include/exclude patterns", () => {
    expect(
      articleBelongsToSource({
        articleUrl: "https://example.com/insights/hello",
        sourceUrl: "https://example.com/insights/",
        includePaths: ["/insights/*"],
        excludePaths: ["/insights/category/*"],
      }),
    ).toBe(true)

    expect(
      articleBelongsToSource({
        articleUrl: "https://example.com/insights/category/x",
        sourceUrl: "https://example.com/insights/",
        includePaths: ["/insights/*"],
        excludePaths: ["/insights/category/*"],
      }),
    ).toBe(false)
  })

  it("extracts primary and secondary keyword candidates", () => {
    const result = extractKeywordCandidatesFromContent({
      title: "Sustainable Packaging Trends for Retail Brands",
      description: "How retail brands adopt sustainable packaging",
      headings: ["Sustainable Packaging", "Retail Brands"],
      bodyText: "Sustainable packaging helps retail brands reduce waste.",
    })
    expect(result.primary).toBeTruthy()
    expect(result.secondary.length).toBeGreaterThan(0)
    expect(normalizeKeywordKey(result.primary!)).not.toContain("  ")
  })

  it("classifies keyword gap opportunities", () => {
    expect(
      classifyKeywordGapOpportunity({
        competitorsCount: 2,
        ownedArticlesCount: 0,
        ownedRankingPosition: null,
        bestCompetitorPosition: 4,
      }),
    ).toBe("not_covered")

    expect(
      classifyKeywordGapOpportunity({
        competitorsCount: 1,
        ownedArticlesCount: 1,
        ownedRankingPosition: 12,
        bestCompetitorPosition: 3,
      }),
    ).toBe("ranking_below_competitors")

    expect(
      classifyKeywordGapOpportunity({
        competitorsCount: 1,
        ownedArticlesCount: 1,
        ownedRankingPosition: 2,
        bestCompetitorPosition: 5,
      }),
    ).toBe("owned_advantage")
  })

  it("builds stable content hashes", () => {
    expect(simpleContentHash(["a", "b"])).toBe(simpleContentHash(["a", "b"]))
    expect(simpleContentHash(["a", "b"])).not.toBe(simpleContentHash(["a", "c"]))
  })
})

describe("owned brand identity", () => {
  it("builds owned entity from project, never from competitors", () => {
    const owned = buildOwnedCompetitiveEntity({
      projectId: 42,
      projectName: "Acme",
    })
    expect(owned).toEqual({
      id: "owned:42",
      name: "Acme",
      entityType: "owned",
      isOwned: true,
    })

    const competitor = buildCompetitorCompetitiveEntity({
      competitorId: 9,
      name: "Rival",
    })
    expect(competitor.isOwned).toBe(false)
    expect(competitor.entityType).toBe("competitor")
  })

  it("sorts owned brand first", () => {
    const sorted = sortCompetitiveEntities([
      { isOwned: false, name: "Zeta" },
      { isOwned: true, name: "Acme" },
      { isOwned: false, name: "Alpha" },
    ])
    expect(sorted.map((e) => e.name)).toEqual(["Acme", "Alpha", "Zeta"])
  })

  it("rejects client-set ownership flags", () => {
    expect(() => assertOwnedFlagsImmutable({ isOwned: true })).toThrow()
  })

  it("seeds owned website from project URL", () => {
    expect(resolveOwnedWebsiteSeed("https://www.acme.com/pt")).toEqual({
      rootUrl: "https://www.acme.com/pt",
      normalizedDomain: "acme.com",
    })
  })
})

describe("keyword research url mode", () => {
  it("builds Google Ads urlSeed payloads", () => {
    expect(
      buildGoogleAdsKeywordSeed({
        mode: "url",
        url: "https://example.com/blog/post",
      }),
    ).toEqual({ urlSeed: { url: "https://example.com/blog/post" } })

    expect(
      buildGoogleAdsKeywordSeed({
        mode: "url",
        url: "https://example.com/blog/post",
        contentSeedKeyword: "packaging trends",
      }),
    ).toEqual({
      urlSeed: { url: "https://example.com/blog/post" },
      keywordSeed: { keywords: ["packaging trends"] },
    })

    expect(
      buildGoogleAdsKeywordSeed({
        mode: "seed",
        seedKeyword: "seo tools",
      }),
    ).toEqual({ keywordSeed: { keywords: ["seo tools"] } })
  })

  it("resolves mode from request body", () => {
    expect(resolveKeywordResearchMode({ mode: "url", url: "https://x.com" })).toBe(
      "url",
    )
    expect(resolveKeywordResearchMode({ keyword: "hello" })).toBe("seed")
    expect(resolveKeywordResearchMode({ url: "https://x.com" })).toBe("url")
  })
})

describe("rule-based content summary", () => {
  it("avoids subjective claims", () => {
    const text = buildContentEntitySummaryText(
      {
        entity_id: "owned:1",
        entity_name: "Acme",
        entity_type: "owned",
        is_owned: true,
        articles_count: 8,
        articles_per_week: 1.9,
        articles_per_month: 8,
        days_since_last_publish: 4,
        languages_count: 2,
        sources_count: 2,
        unique_keywords: 34,
        keyword_volume_total: 1200,
        ranking_keywords_count: 3,
        ranking_position_avg: 8.2,
        share_of_articles_pct: 40,
        by_source_type: { insights: 5, news: 3 },
      },
      30,
    )
    expect(text).toContain("published 8 articles")
    expect(text.toLowerCase()).not.toContain("better")
    expect(text.toLowerCase()).not.toContain("success")
  })
})

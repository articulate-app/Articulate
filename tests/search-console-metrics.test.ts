import { describe, expect, it } from "vitest"
import {
  aggregateSearchMetrics,
  classifyIndexInspection,
  isBrandedQuery,
  normalizeSearchPageUrl,
} from "../app/lib/search-console-metrics"

describe("aggregateSearchMetrics", () => {
  it("computes CTR from totals, not an average of daily CTRs", () => {
    const result = aggregateSearchMetrics([
      { clicks: 10, impressions: 100, position: 5 },
      { clicks: 0, impressions: 100, position: 15 },
    ])
    expect(result.clicks).toBe(10)
    expect(result.impressions).toBe(200)
    expect(result.ctr).toBeCloseTo(0.05)
  })

  it("weights average position by impressions", () => {
    const result = aggregateSearchMetrics([
      { clicks: 1, impressions: 90, position: 2 },
      { clicks: 1, impressions: 10, position: 12 },
    ])
    // (2*90 + 12*10) / 100 = 3
    expect(result.positionAvg).toBeCloseTo(3)
  })

  it("returns null CTR/position when there are no impressions", () => {
    const result = aggregateSearchMetrics([
      { clicks: 0, impressions: 0, position: 5 },
    ])
    expect(result.ctr).toBeNull()
    expect(result.positionAvg).toBeNull()
  })
})

describe("isBrandedQuery", () => {
  it("matches brand variants, not only the exact project name", () => {
    expect(isBrandedQuery("articulate app login", ["articulate", "why articulate"])).toBe(
      true,
    )
    expect(isBrandedQuery("content calendar tools", ["articulate"])).toBe(false)
  })

  it("honors exclusion terms", () => {
    expect(
      isBrandedQuery("articulate competitor review", ["articulate"], ["competitor"]),
    ).toBe(false)
  })
})

describe("classifyIndexInspection", () => {
  it("detects robots and noindex blocks", () => {
    expect(
      classifyIndexInspection({ robotsTxtState: "DISALLOWED" }),
    ).toBe("blocked_by_robots")
    expect(
      classifyIndexInspection({ indexingState: "Blocked by noindex" }),
    ).toBe("blocked_by_noindex")
  })

  it("detects canonical mismatch and indexed verdicts", () => {
    expect(
      classifyIndexInspection({
        googleCanonical: "https://example.com/a",
        userCanonical: "https://example.com/b",
      }),
    ).toBe("canonical_mismatch")
    expect(
      classifyIndexInspection({
        verdict: "PASS",
        coverageState: "Submitted and indexed",
      }),
    ).toBe("indexed")
  })
})

describe("normalizeSearchPageUrl", () => {
  it("normalizes protocol host slash and www", () => {
    expect(normalizeSearchPageUrl("HTTPS://WWW.Example.com/Path/")).toBe(
      "https://example.com/Path",
    )
  })
})

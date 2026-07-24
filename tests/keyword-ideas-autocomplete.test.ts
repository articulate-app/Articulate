import { describe, expect, it } from "vitest"
import {
  mapLanguageIdToHl,
  mapRegionIdToGl,
  normalizeKeywordKey,
} from "../app/lib/google-autocomplete"
import { mergeKeywordIdeas } from "../app/lib/keyword-ideas-merge"

describe("google-autocomplete helpers", () => {
  it("normalizes keyword keys", () => {
    expect(normalizeKeywordKey("  Sandes   Mistas ")).toBe("sandes mistas")
  })

  it("maps Google Ads language/region ids to Suggest hl/gl", () => {
    expect(mapLanguageIdToHl("1014")).toBe("pt")
    expect(mapLanguageIdToHl("pt")).toBe("pt")
    expect(mapRegionIdToGl("2620")).toBe("pt")
    expect(mapRegionIdToGl("")).toBeUndefined()
  })
})

describe("mergeKeywordIdeas", () => {
  it("merges autocomplete suggestions and prefers Ads metrics", () => {
    const merged = mergeKeywordIdeas(
      "sandes",
      [
        {
          keyword: "sandes",
          avgMonthlySearches: 1000,
          competitionIndex: 40,
          monthlySearchVolumes: [],
        },
      ],
      ["sandes", "sandes de frango", "sandes mistas"],
      [
        {
          keyword: "sandes de frango",
          avgMonthlySearches: 500,
          competitionIndex: 20,
          monthlySearchVolumes: [],
        },
      ],
      10,
    )

    expect(merged.map((row) => row.keyword)).toEqual([
      "sandes",
      "sandes de frango",
      "sandes mistas",
    ])
    expect(merged[0]?.avgMonthlySearches).toBe(1000)
    expect(merged[1]?.avgMonthlySearches).toBe(500)
    expect(merged[2]?.avgMonthlySearches).toBe(0)
  })

  it("always keeps the seed even when outside the top page by volume", () => {
    const ads = Array.from({ length: 5 }, (_, i) => ({
      keyword: `other ${i}`,
      avgMonthlySearches: 1000 - i,
      competitionIndex: 10,
      monthlySearchVolumes: [],
    }))

    const merged = mergeKeywordIdeas("sandes", ads, ["sandes"], [], 3)

    expect(merged).toHaveLength(3)
    expect(merged.some((row) => row.keyword === "sandes")).toBe(true)
  })
})

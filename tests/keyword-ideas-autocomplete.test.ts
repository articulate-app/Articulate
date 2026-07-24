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
  it("keeps the searched seed first, then sorts the rest by volume", () => {
    const merged = mergeKeywordIdeas(
      "sandes",
      [
        {
          keyword: "sandes mistas",
          avgMonthlySearches: 2000,
          competitionIndex: 10,
          monthlySearchVolumes: [],
        },
        {
          keyword: "sandes",
          avgMonthlySearches: 100,
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
      "sandes mistas",
      "sandes de frango",
    ])
    expect(merged[0]?.avgMonthlySearches).toBe(100)
    expect(merged[1]?.avgMonthlySearches).toBe(2000)
    expect(merged[2]?.avgMonthlySearches).toBe(500)
  })

  it("merges related keywords that do not contain the seed text", () => {
    const merged = mergeKeywordIdeas(
      "sandes",
      [],
      ["sandes de frango"],
      [],
      10,
      [
        {
          keyword: "prego no pão",
          avgMonthlySearches: 800,
          competitionIndex: 35,
          monthlySearchVolumes: [],
        },
        {
          keyword: "bifanas receita tradicional",
          avgMonthlySearches: 400,
          competitionIndex: 20,
          monthlySearchVolumes: [],
        },
      ],
    )

    expect(merged[0]?.keyword).toBe("sandes")
    expect(merged.map((row) => row.keyword)).toContain("prego no pão")
    expect(merged.map((row) => row.keyword)).toContain("bifanas receita tradicional")
    expect(merged.map((row) => row.keyword)).toContain("sandes de frango")
  })
})

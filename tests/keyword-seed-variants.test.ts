import { describe, expect, it } from "vitest"
import { mergeKeywordIdeas } from "../app/lib/keyword-ideas-merge"
import {
  buildGoogleAdsKeywordSeed,
  expandKeywordSeedVariants,
  keywordOrthographicKey,
} from "../app/lib/keyword-research-input"

describe("keyword seed variants", () => {
  it("expands hyphen and ASCII folds with planner-friendly forms first", () => {
    expect(expandKeywordSeedVariants("pré-diabetes")).toEqual([
      "pre diabetes",
      "prediabetes",
      "pre-diabetes",
      "pré diabetes",
      "prédiabetes",
      "pré-diabetes",
    ])
  })

  it("treats hyphen / space / diacritic forms as the same orthographic key", () => {
    expect(keywordOrthographicKey("pré-diabetes")).toBe("prediabetes")
    expect(keywordOrthographicKey("pré diabetes")).toBe("prediabetes")
    expect(keywordOrthographicKey("pre diabetes")).toBe("prediabetes")
    expect(keywordOrthographicKey("prédiabetes")).toBe("prediabetes")
  })

  it("sends expanded seeds to Google Ads keywordSeed", () => {
    const payload = buildGoogleAdsKeywordSeed({
      mode: "seed",
      seedKeyword: "pré-diabetes",
    })
    expect(payload).toEqual({
      keywordSeed: {
        keywords: expandKeywordSeedVariants("pré-diabetes"),
      },
    })
  })

  it("inherits planner volume from the ASCII/space variant onto the typed seed", () => {
    const merged = mergeKeywordIdeas(
      "pré-diabetes",
      [
        {
          keyword: "pre diabetes",
          avgMonthlySearches: 480,
          competitionIndex: 11,
          monthlySearchVolumes: [],
        },
        {
          keyword: "dieta de pre diabetico",
          avgMonthlySearches: 10,
          competitionIndex: 48,
          monthlySearchVolumes: [],
        },
      ],
      [],
      [],
      10,
    )

    expect(merged[0]).toMatchObject({
      keyword: "pré-diabetes",
      avgMonthlySearches: 480,
      competitionIndex: 11,
    })
    // Orthographic duplicate of the seed is collapsed.
    expect(merged.some((row) => row.keyword === "pre diabetes")).toBe(false)
    expect(merged.map((row) => row.keyword)).toContain("dieta de pre diabetico")
  })
})

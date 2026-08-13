import { describe, expect, it } from "vitest"
import {
  isKeywordExpansionSparse,
  mapDataForSeoFlatIdeaItems,
} from "../app/lib/dataforseo-keyword-ideas"

describe("mapDataForSeoFlatIdeaItems", () => {
  it("maps keyword ideas / suggestions flat items", () => {
    const rows = mapDataForSeoFlatIdeaItems([
      {
        keyword: "investimentos financeiros",
        keyword_info: {
          search_volume: 560,
          competition: 0.2,
          monthly_searches: [
            { year: 2025, month: 1, search_volume: 480 },
            { year: 2025, month: 2, search_volume: 590 },
          ],
        },
        keyword_properties: { keyword_difficulty: 20 },
      },
      {
        keyword: "  ",
        keyword_info: { search_volume: 10 },
      },
    ])

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      keyword: "investimentos financeiros",
      avgMonthlySearches: 560,
      competitionIndex: 20,
    })
    expect(rows[0]?.monthlySearchVolumes).toEqual([
      { year: 2025, month: 1, monthlySearches: 480 },
      { year: 2025, month: 2, monthlySearches: 590 },
    ])
  })
})

describe("isKeywordExpansionSparse", () => {
  it("is sparse when Ads/related have no volume ideas and autocomplete is thin", () => {
    expect(
      isKeywordExpansionSparse({
        seedKeyword: "autores financeiros",
        adsIdeas: [
          {
            keyword: "autores financeiros",
            avgMonthlySearches: 0,
            competitionIndex: 0,
            monthlySearchVolumes: [],
          },
        ],
        relatedIdeas: [],
        autocompleteSuggestions: ["autores financeiros"],
      }),
    ).toBe(true)
  })

  it("is not sparse when related ideas already have volume", () => {
    expect(
      isKeywordExpansionSparse({
        seedKeyword: "autores financeiros",
        adsIdeas: [],
        relatedIdeas: [
          {
            keyword: "investimentos financeiros",
            avgMonthlySearches: 560,
            competitionIndex: 20,
            monthlySearchVolumes: [],
          },
          {
            keyword: "livros sobre investimentos",
            avgMonthlySearches: 220,
            competitionIndex: 10,
            monthlySearchVolumes: [],
          },
          {
            keyword: "livros de finanças",
            avgMonthlySearches: 70,
            competitionIndex: 15,
            monthlySearchVolumes: [],
          },
        ],
        autocompleteSuggestions: [],
      }),
    ).toBe(false)
  })

  it("counts autocomplete extras toward richness", () => {
    expect(
      isKeywordExpansionSparse({
        seedKeyword: "autores financeiros",
        adsIdeas: [],
        relatedIdeas: [],
        autocompleteSuggestions: [
          "autores financeiros",
          "autores financeiros portugueses",
          "autores financeiros livros",
          "autores financeiros recomendados",
        ],
      }),
    ).toBe(false)
  })
})

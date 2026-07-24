import type { KeywordMonthlySearchVolume } from "./keyword-ideas-metrics"
import { normalizeKeywordKey } from "./google-autocomplete"

export type KeywordIdeaRow = {
  keyword: string
  avgMonthlySearches: number
  competitionIndex: number
  monthlySearchVolumes: KeywordMonthlySearchVolume[]
}

export function emptyKeywordIdea(keyword: string): KeywordIdeaRow {
  return {
    keyword,
    avgMonthlySearches: 0,
    competitionIndex: 0,
    monthlySearchVolumes: [],
  }
}

/**
 * Merge Google Ads ideas + Autocomplete suggestions + historical metrics.
 * Always keeps the seed keyword in the final page so exact-match metrics still work.
 */
export function mergeKeywordIdeas(
  seedKeyword: string,
  adsIdeas: KeywordIdeaRow[],
  autocompleteSuggestions: string[],
  historicalIdeas: KeywordIdeaRow[],
  pageSize: number,
): KeywordIdeaRow[] {
  const byKey = new Map<string, KeywordIdeaRow>()
  const seedKey = normalizeKeywordKey(seedKeyword)

  const upsert = (idea: KeywordIdeaRow) => {
    const key = normalizeKeywordKey(idea.keyword)
    if (!key || idea.keyword === "Unknown") return

    const normalizedKeyword = idea.keyword.trim().replace(/\s+/g, " ")
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, { ...idea, keyword: normalizedKeyword })
      return
    }

    const existingHasMetrics =
      existing.avgMonthlySearches > 0 ||
      existing.competitionIndex > 0 ||
      existing.monthlySearchVolumes.length > 0
    const incomingHasMetrics =
      idea.avgMonthlySearches > 0 ||
      idea.competitionIndex > 0 ||
      idea.monthlySearchVolumes.length > 0

    if (!existingHasMetrics && incomingHasMetrics) {
      byKey.set(key, {
        ...idea,
        keyword: existing.keyword || normalizedKeyword,
      })
    }
  }

  if (seedKey) {
    upsert(emptyKeywordIdea(seedKeyword.trim().replace(/\s+/g, " ")))
  }

  for (const idea of adsIdeas) upsert(idea)
  for (const idea of historicalIdeas) upsert(idea)

  for (const suggestion of autocompleteSuggestions) {
    const key = normalizeKeywordKey(suggestion)
    if (!key || byKey.has(key)) continue
    upsert(emptyKeywordIdea(suggestion.trim().replace(/\s+/g, " ")))
  }

  const sorted = [...byKey.values()].sort((a, b) => {
    if (b.avgMonthlySearches !== a.avgMonthlySearches) {
      return b.avgMonthlySearches - a.avgMonthlySearches
    }
    return a.keyword.localeCompare(b.keyword)
  })

  const limited = sorted.slice(0, pageSize)
  if (!seedKey) return limited

  const seedIdea = byKey.get(seedKey)
  if (!seedIdea) return limited
  if (limited.some((idea) => normalizeKeywordKey(idea.keyword) === seedKey)) {
    return limited
  }

  return [...limited.slice(0, Math.max(0, pageSize - 1)), seedIdea]
}

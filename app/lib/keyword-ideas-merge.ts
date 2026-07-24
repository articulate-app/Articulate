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
 * Merge Google Ads ideas + Autocomplete + Related (DataForSEO) + historical metrics.
 * Seed keyword is always first; remaining rows are sorted by volume desc.
 */
export function mergeKeywordIdeas(
  seedKeyword: string,
  adsIdeas: KeywordIdeaRow[],
  autocompleteSuggestions: string[],
  historicalIdeas: KeywordIdeaRow[],
  pageSize: number,
  relatedIdeas: KeywordIdeaRow[] = [],
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
      return
    }

    // Prefer the richer volume when both already have metrics.
    if (
      incomingHasMetrics &&
      idea.avgMonthlySearches > existing.avgMonthlySearches
    ) {
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
  for (const idea of relatedIdeas) upsert(idea)
  for (const idea of historicalIdeas) upsert(idea)

  for (const suggestion of autocompleteSuggestions) {
    const key = normalizeKeywordKey(suggestion)
    if (!key || byKey.has(key)) continue
    upsert(emptyKeywordIdea(suggestion.trim().replace(/\s+/g, " ")))
  }

  const seedIdea = seedKey ? byKey.get(seedKey) : undefined
  if (seedIdea) {
    byKey.delete(seedKey)
  }

  const rest = [...byKey.values()].sort((a, b) => {
    if (b.avgMonthlySearches !== a.avgMonthlySearches) {
      return b.avgMonthlySearches - a.avgMonthlySearches
    }
    return a.keyword.localeCompare(b.keyword)
  })

  const restLimit = seedIdea ? Math.max(0, pageSize - 1) : pageSize
  const limitedRest = rest.slice(0, restLimit)

  return seedIdea ? [seedIdea, ...limitedRest] : limitedRest
}

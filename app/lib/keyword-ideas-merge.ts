import type { KeywordMonthlySearchVolume } from "./keyword-ideas-metrics"
import { normalizeKeywordKey } from "./google-autocomplete"
import {
  keywordOrthographicKey,
  keywordSeedVariantAffinity,
} from "./keyword-research-input"

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

function ideaHasMetrics(idea: KeywordIdeaRow): boolean {
  return (
    idea.avgMonthlySearches > 0
    || idea.competitionIndex > 0
    || idea.monthlySearchVolumes.length > 0
  )
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

    const existingHasMetrics = ideaHasMetrics(existing)
    const incomingHasMetrics = ideaHasMetrics(idea)

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

  // Planner may index "pre diabetes" while the user typed "pré-diabetes".
  // Keep the typed seed label, but inherit metrics from the closest variant
  // (hyphen/space first; avoid preferring a concatenated form with a different volume).
  let seedIdea = seedKey ? byKey.get(seedKey) : undefined
  if (seedIdea && !ideaHasMetrics(seedIdea)) {
    let bestMatch: KeywordIdeaRow | null = null
    let bestAffinity = 0
    for (const idea of byKey.values()) {
      if (normalizeKeywordKey(idea.keyword) === seedKey) continue
      if (!ideaHasMetrics(idea)) continue
      const affinity = keywordSeedVariantAffinity(seedIdea.keyword, idea.keyword)
      if (affinity <= 0) continue
      if (
        !bestMatch
        || affinity > bestAffinity
        || (
          affinity === bestAffinity
          && idea.avgMonthlySearches > bestMatch.avgMonthlySearches
        )
      ) {
        bestMatch = idea
        bestAffinity = affinity
      }
    }
    if (bestMatch) {
      seedIdea = {
        ...bestMatch,
        keyword: seedIdea.keyword,
      }
      byKey.set(seedKey, seedIdea)
    }
  }

  if (seedIdea) {
    byKey.delete(seedKey)
    const seedOrtho = keywordOrthographicKey(seedIdea.keyword)
    for (const [key, idea] of [...byKey.entries()]) {
      if (keywordOrthographicKey(idea.keyword) === seedOrtho) {
        byKey.delete(key)
      }
    }
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

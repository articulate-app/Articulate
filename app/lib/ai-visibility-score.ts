/**
 * AI visibility score helpers.
 * Score mixes mention rate (40%) with position quality (60%).
 * Position quality: #1 → 100 … #10 → 10; unmentioned / >10 → 0.
 */

export type AiVisibilityLatestPair = {
  brand_position: number | null
}

export function positionQualityScore(brandPosition: number | null | undefined): number {
  if (brandPosition == null || !Number.isFinite(brandPosition)) return 0
  if (brandPosition > 10) return 0
  return Math.max(0, Math.round(((11 - brandPosition) / 10) * 100))
}

export function computeAiVisibilityScore(pairs: AiVisibilityLatestPair[]): {
  visibilityScore: number | null
  mentionRate: number
  mentionedCount: number
  trackedCount: number
  avgPosition: number | null
  bestPosition: number | null
} {
  const trackedCount = pairs.length
  if (trackedCount === 0) {
    return {
      visibilityScore: null,
      mentionRate: 0,
      mentionedCount: 0,
      trackedCount: 0,
      avgPosition: null,
      bestPosition: null,
    }
  }

  const mentioned = pairs.filter(
    (pair) => pair.brand_position != null && Number.isFinite(pair.brand_position),
  )
  const mentionedCount = mentioned.length
  const mentionRate = mentionedCount / trackedCount
  const avgPosScore =
    pairs.reduce((sum, pair) => sum + positionQualityScore(pair.brand_position), 0) /
    trackedCount

  const positions = mentioned.map((pair) => Number(pair.brand_position))
  const avgPosition =
    positions.length > 0
      ? Math.round((positions.reduce((a, b) => a + b, 0) / positions.length) * 10) / 10
      : null
  const bestPosition = positions.length > 0 ? Math.min(...positions) : null

  return {
    visibilityScore: Math.round((0.4 * mentionRate + 0.6 * (avgPosScore / 100)) * 1000) / 10,
    mentionRate,
    mentionedCount,
    trackedCount,
    avgPosition,
    bestPosition,
  }
}

export function formatVisibilityScore(score: number | null | undefined): string {
  if (score == null || !Number.isFinite(score)) return "—"
  return String(Math.round(score * 10) / 10)
}

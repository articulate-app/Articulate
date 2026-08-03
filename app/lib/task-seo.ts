/**
 * Task-level SEO helpers.
 * Source of truth: `tasks.keyword` + `tasks.secondary_keywords` (text).
 */

export type TaskSeoKeywords = {
  primaryKeyword: string
  secondaryKeywords: string[]
  updatedAt?: string | null
}

export function parseKeywordTokens(raw: string | null | undefined): string[] {
  if (!raw || !String(raw).trim()) return []
  return String(raw)
    .split(/[;,]/)
    .map((token) => token.trim())
    .filter(Boolean)
}

export function formatSecondaryKeywords(values: string[]): string {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const trimmed = value.trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(trimmed)
  }
  return out.join(", ")
}

export function taskSeoQueryKey(taskId: number | string | null | undefined) {
  return ["task-seo", taskId == null ? null : String(taskId)] as const
}

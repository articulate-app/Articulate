function tokens(value: string): string[] {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
}

function tokenCounts(value: string): Map<string, number> {
  const counts = new Map<string, number>()
  for (const token of tokens(value)) {
    counts.set(token, (counts.get(token) ?? 0) + 1)
  }
  return counts
}

/** Word-level insert/delete counts for history chips. Not a full LCS. */
export function plainTextDiffStats(before: string | null | undefined, after: string | null | undefined): {
  insert_count: number
  delete_count: number
} {
  const left = tokenCounts(before ?? "")
  const right = tokenCounts(after ?? "")
  let insert_count = 0
  let delete_count = 0
  const keys = new Set([...left.keys(), ...right.keys()])
  for (const key of keys) {
    const previous = left.get(key) ?? 0
    const next = right.get(key) ?? 0
    if (next > previous) insert_count += next - previous
    if (previous > next) delete_count += previous - next
  }
  return { insert_count, delete_count }
}

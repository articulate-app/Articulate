/**
 * Reorder helpers for workspace pane tab strips.
 */

export function moveItemBeforeKey<T extends { key: string }>(
  items: T[],
  key: string,
  beforeKey: string | null | undefined,
): T[] {
  const from = items.findIndex((item) => item.key === key)
  if (from < 0) return items
  const item = items[from]!
  const without = items.filter((entry) => entry.key !== key)
  if (!beforeKey) return [...without, item]
  const to = without.findIndex((entry) => entry.key === beforeKey)
  if (to < 0) return [...without, item]
  return [...without.slice(0, to), item, ...without.slice(to)]
}

import type { GlobalSearchDocument } from "./global-search-types"

/** Entity types that filter the already-loaded left-pane list locally (no per-keystroke RPC). */
export const LEFT_PANE_CLIENT_FILTER_TYPES = new Set<string>([
  "project",
  "user",
  "artifact",
  "ai_thread",
  "mention",
])

export function matchesLeftPaneListQuery(item: GlobalSearchDocument, query: string): boolean {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return true
  const title = (item.display_payload?.title ?? item.title ?? "").toLowerCase()
  const subtitle = (item.display_payload?.subtitle ?? item.subtitle ?? "").toLowerCase()
  const preview = (item.display_payload?.preview ?? item.preview ?? "").toLowerCase()
  return title.includes(normalized) || subtitle.includes(normalized) || preview.includes(normalized)
}

export function filterLeftPaneListItems(
  items: GlobalSearchDocument[],
  query: string,
): GlobalSearchDocument[] {
  const normalized = query.trim()
  if (!normalized) return items
  return items.filter((item) => matchesLeftPaneListQuery(item, normalized))
}

/**
 * Helpers for rendering expandable tool-result payloads in the execution timeline.
 */

export type ToolResultRow = {
  id?: string | number | null
  label: string
  meta?: string | null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function toLabel(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

/** Pull a compact, human list of results out of a tool data_summary. */
export function toolResultRowsFromDetails(
  details: Record<string, unknown> | null | undefined,
): ToolResultRow[] {
  const summary = asRecord(details?.data_summary)
  if (!summary) return []

  const fromNamedList = (key: string, labelKeys: string[], metaKeys: string[]): ToolResultRow[] => {
    return asArray(summary[key]).flatMap((item) => {
      const row = asRecord(item)
      if (!row) return []
      const label = labelKeys.map((k) => toLabel(row[k])).find(Boolean) ?? null
      if (!label) return []
      const meta = metaKeys.map((k) => toLabel(row[k])).find(Boolean) ?? null
      return [{
        id: (row.id as string | number | null | undefined) ?? null,
        label,
        meta,
      }]
    })
  }

  const destinations = fromNamedList("destinations", ["name", "title"], ["start_url", "url", "status"])
  if (destinations.length > 0) return destinations

  const artifacts = fromNamedList("artifacts", ["title", "name"], ["markdown_link", "status"])
  if (artifacts.length > 0) return artifacts

  const pages = fromNamedList("pages", ["title", "name"], ["url"])
  if (pages.length > 0) return pages

  const items = fromNamedList("items", ["title", "name", "label"], ["url", "status"])
  if (items.length > 0) return items

  const titles = asArray(summary.titles)
    .map((title) => toLabel(title))
    .filter((title): title is string => Boolean(title))
    .map((label) => ({ label }))
  if (titles.length > 0) return titles

  const singleTitle = toLabel(summary.title)
  const singleUrl = toLabel(summary.url)
  if (singleTitle || singleUrl) {
    return [{ label: singleTitle || singleUrl || "Result", meta: singleTitle ? singleUrl : null }]
  }

  return []
}

export function stepHasExpandableToolResult(args: {
  phase: string
  entitiesCount: number
  details: Record<string, unknown> | null | undefined
}): boolean {
  if (args.phase === "started") return false
  const details = args.details
  if (!details) return args.entitiesCount > 0
  if (toolResultRowsFromDetails(details).length > 0) return true
  if (typeof details.result_summary === "string" && details.result_summary.trim()) return true
  if (asRecord(details.data_summary)) return true
  return args.entitiesCount > 0
}

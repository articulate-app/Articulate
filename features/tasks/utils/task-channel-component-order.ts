/**
 * Task/channel component list order:
 * 1. position ASC NULLS LAST
 * 2. stable component id as final tie-breaker
 */
export function compareTaskChannelComponentOrder(
  a: { position?: number | null; task_component_id?: string | null },
  b: { position?: number | null; task_component_id?: string | null },
): number {
  const aPos = typeof a.position === "number" && Number.isFinite(a.position) ? a.position : null
  const bPos = typeof b.position === "number" && Number.isFinite(b.position) ? b.position : null

  if (aPos == null && bPos == null) {
    return String(a.task_component_id ?? "").localeCompare(String(b.task_component_id ?? ""))
  }
  if (aPos == null) return 1
  if (bPos == null) return -1
  if (aPos !== bPos) return aPos - bPos
  return String(a.task_component_id ?? "").localeCompare(String(b.task_component_id ?? ""))
}

export function sortTaskChannelComponentsByPosition<
  T extends { position?: number | null; task_component_id?: string | null },
>(rows: T[]): T[] {
  return rows.slice().sort(compareTaskChannelComponentOrder)
}

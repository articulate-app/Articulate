export type GroupOrder = 'asc' | 'desc'

/**
 * Default sort direction for grouped lists when the URL omits `groupOrder`.
 * Kept in sync with the Group by menu (`grouping-dropdown.tsx`).
 */
export function getDefaultGroupOrderForGroupBy(groupBy: string): GroupOrder {
  return groupBy === 'delivery_date' || groupBy === 'publication_date' ? 'desc' : 'asc'
}

/** Non-empty `groupBy` query value (excludes cleared / sentinel values). */
export function parseActiveGroupByFromParam(raw: string | null): string | null {
  if (raw == null) return null
  const t = raw.trim()
  if (t === '' || t === 'null' || t === 'none') return null
  return t
}

/**
 * Only `asc` / `desc` count as an explicit order. Empty or whitespace => missing.
 */
export function parseExplicitGroupOrderParam(raw: string | null): GroupOrder | null {
  if (raw == null) return null
  const t = raw.trim().toLowerCase()
  if (t === '') return null
  if (t === 'asc' || t === 'desc') return t
  return null
}

/**
 * When `groupBy` is active but `groupOrder` is absent, sets the canonical default on `sp`.
 * Returns whether `sp` was mutated. Does not override a non-empty `groupOrder`.
 */
export function ensureDefaultGroupOrderInSearchParams(sp: URLSearchParams): boolean {
  const groupBy = parseActiveGroupByFromParam(sp.get('groupBy'))
  if (!groupBy) return false
  if (parseExplicitGroupOrderParam(sp.get('groupOrder')) != null) return false
  sp.set('groupOrder', getDefaultGroupOrderForGroupBy(groupBy))
  return true
}

/** Canonical task-list mode values. `list`/`ungrouped` are the explicit ungrouped views. */
export function isUngroupedTaskMode(mode: string | null): boolean {
  return mode === 'list' || mode === 'ungrouped'
}

/**
 * First-load default grouping for the tasks list, applied in-place to `sp`. Seeds the grouped
 * default (mode=grouped, groupBy=delivery_date, groupOrder=desc) ONLY when no `mode` is present.
 *
 * An explicit `mode=list` / `mode=ungrouped` is a deliberate "Group by > No group" choice and is
 * never re-grouped — this is what prevents `object=task&mode=list` from being normalized back into
 * `groupBy=delivery_date` (the URL-flicker / normalization loop). Returns whether `sp` was mutated.
 */
export function applyTaskListDefaultGroupingMode(sp: URLSearchParams): boolean {
  const currentMode = sp.get('mode')
  const ungrouped = isUngroupedTaskMode(currentMode)
  let changed = false
  if (!currentMode) {
    sp.set('mode', 'grouped')
    changed = true
  }
  if (!ungrouped) {
    if (!parseActiveGroupByFromParam(sp.get('groupBy'))) {
      sp.set('groupBy', 'delivery_date')
      changed = true
    }
    if (parseExplicitGroupOrderParam(sp.get('groupOrder')) == null) {
      sp.set('groupOrder', 'desc')
      changed = true
    }
  }
  return changed
}

/**
 * Build the next URL search params for a "Group by" selection. Preserves all unrelated params
 * (layout, center/right pane, object, filters); only touches grouping + mode keys.
 * - `null` / `'none'` (No group)  => ungrouped: removes groupBy + groupOrder, sets mode=list.
 * - a field                       => grouped:   sets groupBy + canonical groupOrder + mode=grouped.
 */
export function buildGroupingSearchParams(
  currentParams: URLSearchParams,
  groupBy: string | null,
): URLSearchParams {
  const next = new URLSearchParams(currentParams.toString())
  if (!parseActiveGroupByFromParam(groupBy)) {
    next.delete('groupBy')
    next.delete('groupOrder')
    next.set('mode', 'list')
  } else {
    const field = groupBy as string
    next.set('groupBy', field)
    next.set('groupOrder', getDefaultGroupOrderForGroupBy(field))
    next.set('mode', 'grouped')
  }
  next.delete('page')
  return next
}

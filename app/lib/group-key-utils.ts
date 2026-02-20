/**
 * Canonical group key/label utilities shared by UnifiedGroupedTaskList and optimistic updates.
 * Ensures new groups (e.g. from optimistic add) use the same key/label format as existing groups.
 */

/**
 * Format a YYYY-MM group key as a display label (e.g. "March 2026").
 * Matches the format used by group meta RPC and suggestions.
 */
export function formatDateGroupLabel(groupKey: string): string {
  const y = Number.parseInt(groupKey.slice(0, 4), 10)
  const m = Number.parseInt(groupKey.slice(5, 7), 10)
  if (Number.isFinite(y) && Number.isFinite(m) && m >= 1 && m <= 12) {
    const d = new Date(y, m - 1, 1)
    return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(d)
  }
  return groupKey
}

/**
 * Get display label for a group key when no sample row is available.
 * For date keys (YYYY-MM): formats as "March 2026".
 * For special keys: returns friendly labels.
 * For others: returns the key as fallback.
 */
export function getGroupLabelFromKey(groupKey: string, groupBy: string | null): string {
  if (!groupKey) return ''
  switch (groupKey) {
    case '__unassigned__':
      return 'Unassigned'
    case '__no_project__':
      return 'No Project'
    case '__no_date__':
      return 'No Date'
    default:
      break
  }
  const isDateGrouped = groupBy === 'delivery_date' || groupBy === 'publication_date'
  if (isDateGrouped && /^\d{4}-\d{2}$/.test(groupKey)) {
    return formatDateGroupLabel(groupKey)
  }
  return groupKey
}

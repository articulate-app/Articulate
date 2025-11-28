import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import type { DocumentsFilters } from '../types/documents'
import type { GroupingMode } from '../utils/document-grouping'

export interface DocumentGroupTotals {
  group_key: string
  invoiced: number
  costs: number
  ar_credit: number
  ap_credit: number
  result: number
}

/**
 * Convert frontend grouping mode to backend group_by parameter
 */
function mapGroupingModeToBackend(mode: GroupingMode): string {
  switch (mode) {
    case 'month':
      return 'month'
    case 'from_team':
      return 'from'
    case 'to_team':
      return 'to'
    case 'project':
      return 'project'
    case 'none':
      return 'none'
    default:
      return 'month'
  }
}

/**
 * Normalize backend group key to match frontend group key
 * Backend may return different formats, so we normalize them
 */
function normalizeGroupKey(groupKey: string, groupingMode: GroupingMode): string {
  // For 'none' mode, backend returns 'all' or similar, normalize to 'all'
  if (groupingMode === 'none') {
    return 'all'
  }
  
  // For other modes, return as-is (keys should already match)
  return groupKey
}

/**
 * Fetch group totals from the database
 */
export async function fetchDocumentGroupTotals(
  filters: DocumentsFilters,
  groupingMode: GroupingMode
): Promise<DocumentGroupTotals[]> {
  const supabase = createClientComponentClient()

  // Map grouping mode
  const groupBy = mapGroupingModeToBackend(groupingMode)

  // Build parameters
  const params: any = {
    p_group_by: groupBy,
    p_date_from: filters.fromDate || null,
    p_date_to: filters.toDate || null,
    p_from_team_ids: filters.fromTeam && filters.fromTeam.length > 0 ? filters.fromTeam : null,
    p_to_team_ids: filters.toTeam && filters.toTeam.length > 0 ? filters.toTeam : null,
    p_project_search: filters.projects && filters.projects.length > 0 ? filters.projects.join(',') : null,
    p_direction: filters.direction || null,
    p_currency: filters.currency || null,
  }

  const { data, error } = await supabase.rpc('get_document_group_totals', params)

  if (error) {
    console.error('[fetchDocumentGroupTotals] Error:', error)
    throw error
  }

  // Normalize group keys to match frontend format
  const normalizedData = (data || []).map((item: any) => ({
    ...item,
    group_key: normalizeGroupKey(item.group_key, groupingMode)
  }))

  return normalizedData as DocumentGroupTotals[]
}

/**
 * Get totals for a specific group key
 */
export function getTotalsForGroup(
  totals: DocumentGroupTotals[],
  groupKey: string
): DocumentGroupTotals | null {
  return totals.find(t => t.group_key === groupKey) || null
}

/**
 * Optimistically update totals when a document is added
 */
export function optimisticallyUpdateTotals(
  totals: DocumentGroupTotals[],
  groupKey: string,
  docKind: string,
  direction: 'ar' | 'ap',
  amount: number
): DocumentGroupTotals[] {
  const updatedTotals = [...totals]
  let groupTotals = updatedTotals.find(t => t.group_key === groupKey)

  // Create group if it doesn't exist
  if (!groupTotals) {
    groupTotals = {
      group_key: groupKey,
      invoiced: 0,
      costs: 0,
      ar_credit: 0,
      ap_credit: 0,
      result: 0,
    }
    updatedTotals.push(groupTotals)
  }

  // Update based on document type
  switch (docKind) {
    case 'invoice':
      if (direction === 'ar') {
        groupTotals.invoiced += amount
        groupTotals.result += amount
      } else {
        groupTotals.costs += amount
        groupTotals.result -= amount
      }
      break
    case 'credit_note':
      if (direction === 'ar') {
        groupTotals.ar_credit += amount
        groupTotals.result -= amount
      } else {
        groupTotals.ap_credit += amount
        groupTotals.result += amount
      }
      break
    // Payments and orders don't affect totals
  }

  return updatedTotals
}

/**
 * Optimistically update totals when a document is removed
 */
export function optimisticallyRemoveTotals(
  totals: DocumentGroupTotals[],
  groupKey: string,
  docKind: string,
  direction: 'ar' | 'ap',
  amount: number
): DocumentGroupTotals[] {
  return optimisticallyUpdateTotals(totals, groupKey, docKind, direction, -amount)
}


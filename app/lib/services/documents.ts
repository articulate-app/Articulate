import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import type { DocumentsFilters, DocumentsSortConfig, DocumentRow, DocumentsSummary } from '../types/documents'
import type { GroupingMode } from '../utils/document-grouping'

export function parseDocumentsFiltersFromUrl(params: URLSearchParams): DocumentsFilters {
  return {
    q: params.get('q') || '',
    direction: params.get('direction') || '',
    kind: params.get('kind')?.split(',').filter(Boolean) || [],
    status: params.get('status')?.split(',').filter(Boolean) || [],
    currency: params.get('currency') || '',
    fromTeam: params.get('fromTeam')?.split(',').filter(Boolean) || [],
    toTeam: params.get('toTeam')?.split(',').filter(Boolean) || [],
    fromDate: params.get('fromDate') || '',
    toDate: params.get('toDate') || '',
    projects: params.get('projects')?.split(',').filter(Boolean) || [],
  }
}

export function parseDocumentsSortFromUrl(params: URLSearchParams): DocumentsSortConfig {
  const sortParam = params.get('sort') || 'doc_date.desc,doc_id.asc'
  const [field, direction] = sortParam.split('.')
  
  return {
    field: (field as DocumentsSortConfig['field']) || 'doc_date',
    direction: (direction as 'asc' | 'desc') || 'desc',
  }
}

export function parseGroupingModeFromUrl(params: URLSearchParams): GroupingMode {
  const groupBy = params.get('group_by') as GroupingMode
  
  // Validate and return grouping mode
  const validModes: GroupingMode[] = ['month', 'from_team', 'to_team', 'project', 'none']
  return validModes.includes(groupBy) ? groupBy : 'month'
}

/**
 * Get the group key field for a given grouping mode
 */
function getGroupKeyField(groupingMode: GroupingMode): string | null {
  switch (groupingMode) {
    case 'month': return 'doc_month_key'
    case 'from_team': return 'from_team_key'
    case 'to_team': return 'to_team_key'
    case 'project': return 'projects_key'
    case 'none': return null
    default: return null
  }
}

/**
 * Get default direction for a grouping mode
 */
function getGroupDefaultDirection(groupingMode: GroupingMode): 'asc' | 'desc' {
  switch (groupingMode) {
    case 'month': return 'desc' // Newest first
    case 'from_team': return 'asc' // Alphabetical
    case 'to_team': return 'asc' // Alphabetical
    case 'project': return 'asc' // Alphabetical
    default: return 'asc'
  }
}

/**
 * Map sort field to its corresponding key field (for stable sorting)
 */
function getSortKeyField(sortField: DocumentsSortConfig['field']): string {
  switch (sortField) {
    case 'doc_date': return 'doc_date'
    case 'from_team_name': return 'from_team_key'
    case 'to_team_name': return 'to_team_key'
    case 'projects_text': return 'projects_key'
    default: return sortField
  }
}

export interface DocumentsOrderConfig {
  fields: Array<{ field: string; ascending: boolean }>
}

/**
 * Build ordering configuration based on grouping and sort
 */
export function buildDocumentsOrderConfig(
  sort: DocumentsSortConfig,
  groupingMode: GroupingMode = 'month'
): DocumentsOrderConfig {
  const fields: Array<{ field: string; ascending: boolean }> = []
  
  const groupKeyField = getGroupKeyField(groupingMode)
  const sortKeyField = getSortKeyField(sort.field)
  const sortAscending = sort.direction === 'asc'
  
  // Case 1: No grouping
  if (groupingMode === 'none' || !groupKeyField) {
    fields.push({ field: sortKeyField, ascending: sortAscending })
    if (sortKeyField !== 'doc_id') {
      fields.push({ field: 'doc_id', ascending: true })
    }
    return { fields }
  }
  
  // Case 2: Sorting by the grouping field
  const isSortingByGroupField = (
    (groupingMode === 'month' && sort.field === 'doc_date') ||
    (groupingMode === 'from_team' && sort.field === 'from_team_name') ||
    (groupingMode === 'to_team' && sort.field === 'to_team_name') ||
    (groupingMode === 'project' && sort.field === 'projects_text')
  )
  
  if (isSortingByGroupField) {
    // Order by group key in user's chosen direction
    fields.push({ field: groupKeyField, ascending: sortAscending })
    // Secondary sort within group (if month, use doc_date as secondary; otherwise use the sort key)
    if (groupingMode === 'month') {
      fields.push({ field: 'doc_date', ascending: sortAscending })
    }
    // Tie-breaker
    fields.push({ field: 'doc_id', ascending: true })
    return { fields }
  }
  
  // Case 3: Sorting by a different field than grouping
  // Group key in its default direction (keeps groups stable)
  const groupDefaultDir = getGroupDefaultDirection(groupingMode)
  fields.push({ field: groupKeyField, ascending: groupDefaultDir === 'asc' })
  // User's sort field
  fields.push({ field: sortKeyField, ascending: sortAscending })
  // Tie-breaker
  if (sortKeyField !== 'doc_id') {
    fields.push({ field: 'doc_id', ascending: true })
  }
  
  return { fields }
}

export function buildDocumentsTrailingQuery(
  filters: DocumentsFilters,
  sort: DocumentsSortConfig,
  groupingMode: GroupingMode = 'month'
) {
  return (query: any) => {
    let q = query

    // Apply filters
    if (filters.direction) {
      q = q.eq('direction', filters.direction)
    }

    if (filters.currency) {
      q = q.eq('currency_code', filters.currency)
    }

    if (filters.kind.length > 0) {
      q = q.in('doc_kind', filters.kind)
    }

    if (filters.status.length > 0) {
      q = q.in('status', filters.status)
    }

    if (filters.fromTeam.length > 0) {
      q = q.in('from_team_id', filters.fromTeam.map(Number))
    }

    if (filters.toTeam.length > 0) {
      q = q.in('to_team_id', filters.toTeam.map(Number))
    }

    if (filters.fromDate) {
      q = q.gte('doc_date', filters.fromDate)
    }

    if (filters.toDate) {
      q = q.lt('doc_date', filters.toDate)
    }

    // Projects filter
    if (filters.projects.length > 0) {
      const projectFilters = filters.projects.map(project => 
        `projects_text.ilike.%${project}%`
      )
      q = q.or(projectFilters.join(','))
    }

    // Global search
    if (filters.q) {
      const searchTerm = filters.q.trim()
      q = q.or([
        `doc_number.ilike.%${searchTerm}%`,
        `from_team_name.ilike.%${searchTerm}%`,
        `to_team_name.ilike.%${searchTerm}%`,
        `projects_text.ilike.%${searchTerm}%`
      ].join(','))
    }

    // Apply ordering based on grouping and sort configuration
    const orderConfig = buildDocumentsOrderConfig(sort, groupingMode)
    orderConfig.fields.forEach(({ field, ascending }) => {
      q = q.order(field, { ascending, nullsFirst: false })
    })

    return q
  }
}

export async function fetchDocumentsSummary(filters: DocumentsFilters): Promise<DocumentsSummary> {
  const supabase = createClientComponentClient()
  
  let query = supabase
    .from('v_documents_min')
    .select('doc_kind, direction, subtotal_amount, balance_due')

  // Apply the same filters as the main query
  if (filters.direction) {
    query = query.eq('direction', filters.direction)
  }

  if (filters.currency) {
    query = query.eq('currency_code', filters.currency)
  }

  if (filters.kind.length > 0) {
    query = query.in('doc_kind', filters.kind)
  }

  if (filters.status.length > 0) {
    query = query.in('status', filters.status)
  }

  if (filters.fromTeam.length > 0) {
    query = query.in('from_team_id', filters.fromTeam.map(Number))
  }

  if (filters.toTeam.length > 0) {
    query = query.in('to_team_id', filters.toTeam.map(Number))
  }

  if (filters.fromDate) {
    query = query.gte('doc_date', filters.fromDate)
  }

  if (filters.toDate) {
    query = query.lt('doc_date', filters.toDate)
  }

  // Projects filter
  if (filters.projects.length > 0) {
    // Filter by projects_text containing any of the selected projects
    const projectFilters = filters.projects.map(project => 
      `projects_text.ilike.%${project}%`
    )
    query = query.or(projectFilters.join(','))
  }

  // Global search
  if (filters.q) {
    const searchTerm = filters.q.trim()
    query = query.or([
      `doc_number.ilike.%${searchTerm}%`,
      `from_team_name.ilike.%${searchTerm}%`,
      `to_team_name.ilike.%${searchTerm}%`,
      `projects_text.ilike.%${searchTerm}%`
    ].join(','))
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching documents summary:', error)
    return {
      invoiced: 0,
      costs: 0,
      result: 0,
      pendingAR: 0,
      pendingAP: 0,
      pendingNet: 0,
    }
  }

  // Calculate summary values
  let invoiced = 0
  let costs = 0
  let pendingAR = 0
  let pendingAP = 0

  data?.forEach((doc: any) => {
    if (doc.doc_kind === 'invoice') {
      if (doc.direction === 'ar') {
        invoiced += doc.subtotal_amount || 0
        pendingAR += doc.balance_due || 0
      } else if (doc.direction === 'ap') {
        costs += doc.subtotal_amount || 0
        pendingAP += doc.balance_due || 0
      }
    }
  })

  const result = invoiced - costs
  const pendingNet = pendingAR - pendingAP

  return {
    invoiced,
    costs,
    result,
    pendingAR,
    pendingAP,
    pendingNet,
  }
}

export function getDocumentPaneType(document: DocumentRow): string {
  return `${document.direction.toUpperCase()}_${document.doc_kind.toUpperCase().replace('_', '_')}`
}

export function formatDocumentType(direction: string, docKind: string): string {
  const directionLabel = direction === 'ar' ? 'AR' : 'AP'
  const kindLabels: Record<string, string> = {
    'invoice': 'Invoice',
    'credit_note': 'Credit Note',
    'order': 'Order',
    'payment': 'Payment',
  }
  
  return `${directionLabel} ${kindLabels[docKind] || docKind}`
}

export function formatDocumentKind(docKind: string): string {
  const kindLabels: Record<string, string> = {
    'invoice': 'Invoice',
    'credit_note': 'Credit Note',
    'order': 'Order',
    'payment': 'Payment',
  }
  
  return kindLabels[docKind] || docKind
}


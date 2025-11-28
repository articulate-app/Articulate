import type { DocumentRow, DocumentsSortConfig } from '../types/documents'

export type GroupingMode = 'month' | 'from_team' | 'to_team' | 'project' | 'none'

export interface DocumentGroup {
  key: string
  label: string
  documents: DocumentRow[]
  sortOrder: number // For ordering groups (e.g., newest month first)
}

/**
 * Format a date as "MMM / YYYY"
 */
export function formatMonthYear(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).replace(' ', ' / ')
}

/**
 * Get month key for grouping (Mon/YYYY format to match backend)
 */
function getMonthKey(date: string): string {
  const d = new Date(date)
  const monthName = d.toLocaleDateString('en-US', { month: 'short' })
  const year = d.getFullYear()
  return `${monthName}/${year}`
}

/**
 * Group documents by month based on doc_date
 * IMPORTANT: Documents are already sorted by the backend, so we preserve their order
 */
function groupByMonth(documents: DocumentRow[], sort?: DocumentsSortConfig): DocumentGroup[] {
  // Since backend sorts by doc_month_key, documents are already clustered by month
  // We just need to extract groups in the order they appear
  const groups: DocumentGroup[] = []
  let currentGroup: DocumentGroup | null = null
  
  documents.forEach(doc => {
    const monthKey = getMonthKey(doc.doc_date)
    
    // If this is a new group, start it
    if (!currentGroup || currentGroup.key !== monthKey) {
      currentGroup = {
        key: monthKey,
        label: formatMonthYear(doc.doc_date),
        documents: [],
        sortOrder: 0, // Preserve server order
      }
      groups.push(currentGroup)
    }
    
    // Add document to current group (preserves server order)
    currentGroup.documents.push(doc)
  })
  
  return groups
}

/**
 * Group documents by "From" team
 * IMPORTANT: Documents are already sorted by the backend, so we preserve their order
 */
function groupByFromTeam(documents: DocumentRow[], sort?: DocumentsSortConfig): DocumentGroup[] {
  // Since backend sorts by from_team_key, documents are already clustered by team
  // We just need to extract groups in the order they appear
  const groups: DocumentGroup[] = []
  let currentGroup: DocumentGroup | null = null
  
  documents.forEach(doc => {
    const teamName = doc.from_team_name || 'Unknown'
    
    // If this is a new group, start it
    if (!currentGroup || currentGroup.label !== teamName) {
      currentGroup = {
        key: teamName,
        label: teamName,
        documents: [],
        sortOrder: 0, // Preserve server order
      }
      groups.push(currentGroup)
    }
    
    // Add document to current group (preserves server order)
    currentGroup.documents.push(doc)
  })
  
  return groups
}

/**
 * Group documents by "To" team
 */
function groupByToTeam(documents: DocumentRow[], sort?: DocumentsSortConfig): DocumentGroup[] {
  // Since backend sorts by to_team_key, documents are already clustered by team
  // We just need to extract groups in the order they appear
  const groups: DocumentGroup[] = []
  let currentGroup: DocumentGroup | null = null
  
  documents.forEach(doc => {
    const teamName = doc.to_team_name || 'Unknown'
    
    // If this is a new group, start it
    if (!currentGroup || currentGroup.label !== teamName) {
      currentGroup = {
        key: teamName,
        label: teamName,
        documents: [],
        sortOrder: 0, // Preserve server order
      }
      groups.push(currentGroup)
    }
    
    // Add document to current group (preserves server order)
    currentGroup.documents.push(doc)
  })
  
  return groups
}

/**
 * Group documents by project
 */
function groupByProject(documents: DocumentRow[], sort?: DocumentsSortConfig): DocumentGroup[] {
  // Since backend sorts by projects_key, documents are already clustered by project
  // We just need to extract groups in the order they appear
  const groups: DocumentGroup[] = []
  let currentGroup: DocumentGroup | null = null
  
  documents.forEach(doc => {
    const projectText = doc.projects_text || 'No Project'
    
    // If this is a new group, start it
    if (!currentGroup || currentGroup.label !== projectText) {
      currentGroup = {
        key: projectText,
        label: projectText,
        documents: [],
        sortOrder: 0, // Preserve server order
      }
      groups.push(currentGroup)
    }
    
    // Add document to current group (preserves server order)
    currentGroup.documents.push(doc)
  })
  
  return groups
}

/**
 * Main grouping function that delegates to specific grouping logic
 */
export function groupDocuments(documents: DocumentRow[], mode: GroupingMode, sort?: DocumentsSortConfig): DocumentGroup[] {
  if (mode === 'none') {
    // No grouping - documents are already sorted by backend, just wrap them
    return [{
      key: 'all',
      label: 'All Documents',
      documents, // Preserve server order
      sortOrder: 0,
    }]
  }
  
  switch (mode) {
    case 'month':
      return groupByMonth(documents, sort)
    case 'from_team':
      return groupByFromTeam(documents, sort)
    case 'to_team':
      return groupByToTeam(documents, sort)
    case 'project':
      return groupByProject(documents, sort)
    default:
      return groupByMonth(documents, sort)
  }
}

/**
 * Find which group a document belongs to based on grouping mode
 */
export function getDocumentGroupKey(document: DocumentRow, mode: GroupingMode): string {
  switch (mode) {
    case 'month':
      return getMonthKey(document.doc_date)
    case 'from_team':
      return document.from_team_name || 'Unknown'
    case 'to_team':
      return document.to_team_name || 'Unknown'
    case 'project':
      return document.projects_text || 'No Project'
    case 'none':
    default:
      return 'all'
  }
}

/**
 * Get the default sort configuration for a grouping mode
 * This ensures consistent ordering within groups for infinite scroll
 */
export function getDefaultSortForGrouping(mode: GroupingMode): DocumentsSortConfig {
  switch (mode) {
    case 'month':
      // For month grouping, sort by date descending (newest first)
      // Backend handles month grouping in the ORDER BY
      return { field: 'doc_date', direction: 'desc' }
    case 'from_team':
    case 'to_team':
    case 'project':
      // For team/project grouping, sort by date descending within each group
      return { field: 'doc_date', direction: 'desc' }
    case 'none':
    default:
      // Default sort
      return { field: 'doc_date', direction: 'desc' }
  }
}

/**
 * Generate ORDER BY clause for grouping-compatible sorting
 * This is used by the backend query to ensure proper pagination
 */
export function buildGroupingOrderBy(mode: GroupingMode, sort: DocumentsSortConfig): string {
  const sortDir = sort.direction === 'desc' ? 'DESC' : 'ASC'
  
  switch (mode) {
    case 'month':
      // Group by month, then by date, then by ID for stability
      return `date_trunc('month', doc_date) DESC, doc_date ${sortDir}, doc_id ASC`
    case 'from_team':
      // Group by from_team, then by date, then by ID
      return `from_team_name ASC NULLS LAST, doc_date ${sortDir}, doc_id ASC`
    case 'to_team':
      // Group by to_team, then by date, then by ID
      return `to_team_name ASC NULLS LAST, doc_date ${sortDir}, doc_id ASC`
    case 'project':
      // Group by project, then by date, then by ID
      return `projects_text ASC NULLS LAST, doc_date ${sortDir}, doc_id ASC`
    case 'none':
    default:
      // Use the standard sort field
      return `${sort.field} ${sortDir} NULLSLAST, doc_id ASC NULLSLAST`
  }
}


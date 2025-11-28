export interface DocumentRow {
  direction: 'ar' | 'ap'
  doc_kind: 'invoice' | 'credit_note' | 'order' | 'payment'
  doc_id: number
  doc_number: string
  doc_date: string
  currency_code: string
  subtotal_amount: number
  vat_amount: number
  total_amount: number
  status: string
  from_team_id: number
  from_team_name: string
  to_team_id: number
  to_team_name: string
  balance_due: number | null
  projects_text: string | null
  created_at: string
  updated_at: string
}

export type DocumentKind = DocumentRow['doc_kind']

export interface DocumentsFilters {
  q: string
  direction: string
  kind: string[]
  status: string[]
  currency: string
  fromTeam: string[]
  toTeam: string[]
  fromDate: string
  toDate: string
  projects: string[]
}

export interface DocumentsSortConfig {
  field: 'doc_date' | 'doc_id' | 'doc_number' | 'total_amount' | 'subtotal_amount' | 'from_team_name' | 'to_team_name' | 'direction' | 'doc_kind' | 'projects_text'
  direction: 'asc' | 'desc'
}

export interface DocumentsSummary {
  invoiced: number
  costs: number
  result: number
  pendingAR: number
  pendingAP: number
  pendingNet: number
}

export interface DocumentDetailsPaneProps {
  document: DocumentRow
  onClose: () => void
  onDocumentUpdate: (document: DocumentRow) => void
}

export type DocumentPaneType = 
  | 'AR_INVOICE'
  | 'AP_INVOICE'
  | 'AR_CREDIT_NOTE'
  | 'AP_CREDIT_NOTE'
  | 'AR_ORDER'
  | 'AP_ORDER'
  | 'AR_PAYMENT'
  | 'AP_PAYMENT'


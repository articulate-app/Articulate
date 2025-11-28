// Supplier Invoice types
export interface SupplierInvoice {
  id: number
  invoice_number: string
  invoice_date: string
  currency_code: string
  subtotal_amount: number
  vat_amount: number
  total_amount: number
  status: 'received' | 'partially_paid' | 'paid' | 'void' | 'draft'
  payer_team_id: number
  issuer_team_id: number
  supplier_team_name: string
  credited_amount: number
  amount_paid: number
  balance_due: number
  created_at: string
  updated_at: string
}

export interface SupplierInvoiceFilters {
  q: string
  status: string[]
  currency_code: string[]
  issuer_team_id: string[]
  period: { from?: Date; to?: Date }
}

export interface SupplierInvoiceSortConfig {
  field: 'invoice_date' | 'invoice_number' | 'total_amount' | 'status' | 'supplier_team_name'
  direction: 'asc' | 'desc'
}

export interface SupplierInvoiceList extends SupplierInvoice {
  // Additional fields from the view
}

// Supplier Payment types
export interface SupplierPayment {
  payment_id: number
  payer_team_id: number
  paid_to_team_id: number
  supplier_team_name: string
  payment_date: string
  payment_amount: number
  payment_currency: string
  method: string
  status: string
  external_ref: string
  notes: string
  amount_allocated: number
  unallocated_amount: number
  allocation_count: number
  created_at: string
  updated_at: string
}

export interface SupplierPaymentFilters {
  q: string
  payment_currency: string[]
  method: string[]
  status: string[]
  paid_to_team_id: string[]
  period: { from?: Date; to?: Date }
}

export interface SupplierPaymentSortConfig {
  field: 'payment_date' | 'payment_amount' | 'supplier_team_name' | 'method' | 'external_ref'
  direction: 'asc' | 'desc'
}

export interface SupplierPaymentList extends SupplierPayment {
  // Additional fields from the view
}

// Supplier Credit Note types
export interface SupplierCreditNote {
  credit_note_id: number
  received_invoice_id: number
  invoice_number: string
  invoice_date: string
  currency_code: string
  credit_number: string
  credit_date: string
  subtotal_amount: number
  vat_amount: number
  total_amount: number
  status: 'issued' | 'void'
  reason: string
  created_at: string
  updated_at: string
}

export interface SupplierCreditNoteFilters {
  q: string
  currency_code: string[]
  status: string[]
  period: { from?: Date; to?: Date }
}

export interface SupplierCreditNoteSortConfig {
  field: 'credit_date' | 'credit_number' | 'total_amount' | 'status'
  direction: 'asc' | 'desc'
}

export interface SupplierCreditNoteList extends SupplierCreditNote {
  // Additional fields from the view
}

// Payment Allocation types
export interface SupplierPaymentAllocation {
  payment_id: number
  received_invoice_id: number
  amount_applied: number
}

export interface CreateSupplierPaymentData {
  payer_team_id: number
  paid_to_team_id: number
  payment_date: string
  payment_amount: number
  payment_currency: string
  method: string
  external_ref?: string
  notes?: string
  allocations: Array<{ received_invoice_id: number; amount_applied: number }>
}

// Invoice Allocation types (Invoice ↔ Production Order)
export interface ReceivedInvoiceAllocation {
  id: number
  received_invoice_id: number
  production_order_id: number
  amount_subtotal_allocated: number
  created_at: string
}

export interface CreateInvoiceAllocationData {
  received_invoice_id: number
  production_order_id: number
  amount_subtotal_allocated: number
}

// Production Order types for allocations
export interface ProductionOrder {
  id: number
  project_name: string
  billing_period_start: string
  billing_period_end: string
  subtotal_amount: number
  currency_code: string
  supplier_team_id: number
  subtotal_allocated: number
  subtotal_remaining: number
  is_subtotal_fully_allocated: boolean
}

// User Role types
export interface UserRole {
  team_id: number
  role_id: number
}

export interface UserPermissions {
  isAdmin: boolean
  payerTeams: number[]
  externalTeams: number[]
  canCreatePayments: boolean
  canCreateInvoices: boolean
  canCreateCreditNotes: boolean
}

// Production Order types
export interface ProductionOrder {
  id: number
  period_month: string
  currency_code: string
  subtotal_amount: number
  status: string
  payer_team_id: number
  supplier_team_id: number
  payer_team_name: string
  supplier_team_name: string
  projects: Array<{
    project_id: number
    project_name: string
    task_count: number
    project_subtotal_novat: number
    earliest_delivery_date: string
    latest_delivery_date: string
  }>
}

export interface ProductionOrderFilters {
  q: string
  status: string[]
  currency_code: string[]
  payer_team_id: string[]
  supplier_team_id: string[]
  period: { from?: Date; to?: Date }
}

export interface ProductionOrderSortConfig {
  field: 'period_month' | 'payer_team_name' | 'supplier_team_name' | 'currency_code' | 'subtotal_amount' | 'status'
  direction: 'asc' | 'desc'
}

export interface ProductionOrderList extends ProductionOrder {
  // Additional fields from the view
}

// URL parameter types
export interface ExpensesUrlParams {
  q?: string
  status?: string
  currency?: string
  issuerTeamId?: string
  paidToTeamId?: string
  from?: string
  to?: string
  sort?: string
  dir?: 'asc' | 'desc'
  invoice?: string
  payment?: string
  creditNote?: string
} 
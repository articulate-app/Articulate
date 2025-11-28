export interface InvoiceOrder {
  id: number
  project_id: number
  project_name: string
  project_color?: string
  billing_period_start: string
  billing_period_end: string
  issued_date: string | null
  subtotal: number
  subtotal_amount: number // From database view
  vat_amount: number
  total_amount: number
  currency_code: string
  status: 'draft' | 'sent' | 'cancelled' | 'paid'
  is_issued: boolean
  lines_count: number
  created_at: string
  updated_at: string
  // Additional fields from v_invoice_orders_list view
  issued_subtotal?: number
  remaining_subtotal?: number
}

export interface InvoiceLine {
  id: number
  invoice_id: number
  line_type: string
  task_id: number | null
  description: string
  unit_price: number
  quantity: number
  total: number
  currency_code: string
  created_at: string
}

export interface InvoiceOrderFilters {
  project: string[]
  period: { from?: Date; to?: Date }
  status: string[]
  invoiced: 'all' | 'yes' | 'no'
  remaining: 'all' | 'has_remaining'
  search: string
}

export interface InvoiceOrderListRow extends InvoiceOrder {
  // Additional fields from the view
  project_color?: string
  task_references?: string[]
}

export interface InvoiceOrderSortConfig {
  field: 'billing_period_start' | 'total_amount' | 'project_name' | 'subtotal_amount' | 'issued_subtotal' | 'remaining_subtotal'
  direction: 'asc' | 'desc'
}

// URL parameter types
export interface InvoiceOrderUrlParams {
  q?: string
  projectId?: string
  from?: string
  to?: string
  status?: string
  invoiced?: '1' | '0' | ''
  sort?: string
  dir?: 'asc' | 'desc'
  page?: string
  limit?: string
  order?: string
}

// Issued Invoice types
export interface IssuedInvoice {
  id: number
  invoice_number?: string
  external_invoice_id?: string
  invoice_date?: string
  due_date?: string
  subtotal_amount?: number
  vat_amount: number
  total_amount: number
  currency_code: string
  status: string
  created_at: string
  updated_at: string
  payer_team_id?: number
  issuer_team_id?: number
  allocated_subtotal_amount?: number
  is_fully_allocated?: string
  payer_team_name?: string
  issuer_team_name?: string
  balance_due?: number
  credited_amount?: number
  credited_subtotal_amount?: number
  amount_paid?: number
  pdf_path?: string
  issued_invoice_orders?: any[]
  projects?: string[] | null
  projects_text?: string | null
  recipients?: {
    recipient_names: string[] | null
    recipient_emails: string[] | null
    recipient_names_text: string | null
    recipient_emails_text: string | null
  } | null
}

export interface IssuedInvoiceOrder {
  id: number
  issued_invoice_id: number
  invoice_order_id: number
  created_at: string
}

// Payment-related types
export interface PaymentFilters {
  search: string
  q?: string // Alias for search
  currency: string[]
  method: string[]
  payerTeamId?: number
  dateFrom?: string
  dateTo?: string
  period?: { from?: Date; to?: Date }
}

export interface PaymentSortConfig {
  field: 'payment_date' | 'payment_amount' | 'payer_team_name' | 'method' | 'external_ref'
  direction: 'asc' | 'desc'
}

export interface PaymentSummary {
  payment_id: number
  payer_team_id: number
  payer_team_name: string
  paid_to_team_id?: number
  paid_to_team_name?: string
  payment_date: string
  payment_amount: number
  payment_currency: string
  method: string
  status: string
  external_ref: string
  notes: string
  amount_allocated: number
  unallocated_amount: number
  is_overallocated: boolean
  allocation_count: number
  created_at: string
  updated_at: string
  allocations?: PaymentAllocation[]
}

export interface OpenInvoice {
  id: number
  invoice_number: string
  invoice_date: string
  currency: string
  total_amount: number
  balance_due: number
  payer_team_id: number
  created_at: string
}

export interface PaymentAllocation {
  payment_id: number
  issued_invoice_id: number
  amount_applied: number
}

export interface CreatePaymentData {
  payment_date: string
  payment_currency: string
  method: string
  payer_team_id?: number
  paid_to_team_id?: number
  external_ref?: string
  notes?: string
  payment_amount: number
}

export interface InvoiceOption {
  id: number
  invoice_number: string
  invoice_date: string
  balance_due: number
  currency: string
}

// Credit Note types
export interface CreditNoteSummary {
  credit_note_id: number
  credit_number: string
  credit_date: string
  invoice_number: string
  invoice_date: string
  currency_code: string
  subtotal_amount: number
  vat_amount: number
  total_amount: number
  status: 'issued' | 'void'
  reason?: string | null
  created_at: string
  updated_at: string
  issued_invoice_id: number
}

export interface CreditNoteFilters {
  dateFrom?: string
  dateTo?: string
  currency: string[]
  status: string[]
  search: string
}

export interface CreditNoteSortConfig {
  field: 'credit_date' | 'credit_number' | 'total_amount' | 'subtotal_amount' | 'status'
  direction: 'asc' | 'desc'
}

export interface CreditNoteDetails {
  credit_note_id: number
  id?: number // Optional for backward compatibility
  issued_invoice_id: number
  credit_number: string
  credit_date: string
  invoice_number: string // Direct field from view
  invoice_date: string   // Direct field from view
  currency_code: string
  subtotal_amount: number
  vat_amount: number
  total_amount: number
  status: 'issued' | 'void'
  reason?: string | null
  created_at: string
  updated_at: string
  pdf_path?: string | null
  issuer_team_id?: number // For PDF operations
}

export interface CreateCreditNoteData {
  issued_invoice_id: number
  credit_number?: string
  credit_date: string
  currency_code: string
  subtotal_amount: number
  vat_amount: number
  total_amount: number
  reason?: string
}

export interface FromInvoiceCreditNoteContext {
  invoiceId: number
  invoiceNumber?: string
  currency: string
  supplierTeamId?: number
  supplierTeamName?: string
  payerTeamId?: number
  payerTeamName?: string
  subtotalAmount?: number
  suggestedAmount?: number
}

export interface FromInvoiceContext {
  invoiceId: number
  invoiceNumber?: string
  payerTeamId: number
  payerTeamName?: string
  paidToTeamId?: number
  paidToTeamName?: string
  currency: string
  subtotalAmount?: number
  suggestedAmount?: number
  openPaymentAfterCreate?: boolean
}

// Invoice list types
export interface InvoiceFilters {
  q: string
  status: string[]
  issuerTeamId: string[]
  payerTeamId: string[]
  period: { from?: Date; to?: Date }
  balance: 'all' | 'paid' | 'unpaid' | 'overdue' | 'due_only'
  projects: string[]
}

export interface InvoiceSortConfig {
  field:
    | 'invoice_number'
    | 'status'
    | 'invoice_date'
    | 'due_date'
    | 'total_amount'
    | 'payer_team_name'
    | 'subtotal_amount'
    | 'credited_amount'
    | 'credited_subtotal_amount'
    | 'amount_paid'
    | 'allocated_subtotal_amount'
    | 'balance_due'
    | 'last_payment_date'
    | 'projects_text'
    | 'created_at'
  direction: 'asc' | 'desc'
}

export interface IssuedInvoiceList {
  id: number
  invoice_number?: string
  external_invoice_id?: string
  invoice_date?: string
  due_date?: string
  subtotal_amount?: number
  vat_amount: number
  total_amount: number
  currency_code: string
  status: string
  created_at: string
  updated_at: string
  payer_team_id?: number
  issuer_team_id?: number
  allocated_subtotal_amount?: number
  is_fully_allocated?: string
  payer_team_name?: string
  issuer_team_name?: string
  balance_due?: number
  credited_amount?: number
  credited_subtotal_amount?: number
  amount_paid?: number
  pdf_path?: string
  issued_invoice_orders?: any[]
  last_payment_date?: string | null
  projects?: string[] | null
  projects_text?: string | null
}

// New types for standalone invoice creation
export type CreateInvoiceStandalone = {
  p_invoice_order_ids: null;
  p_issuer_team_id: number;
  p_payer_team_id: number;
  p_currency_code: string; // ISO 4217
  p_invoice_number: string;
  p_external_invoice_id?: string | null;
  p_invoice_date?: string | null; // 'YYYY-MM-DD'
  p_pdf_path?: string | null;
  p_notes?: string | null;
  p_header_subtotal?: number | null;
  p_header_vat?: number | null;
  p_header_total?: number | null;
};

export type CreateInvoiceWithAllocations = {
  p_invoice_order_ids: number[];
  p_subtotal_overrides?: { [key: string]: number } | null;
  p_invoice_number: string;
  p_external_invoice_id?: string | null;
  p_invoice_date?: string | null;
  p_pdf_path?: string | null;
  p_notes?: string | null;
  p_header_subtotal?: number | null;
  p_header_vat?: number | null;
  p_header_total?: number | null;
  // no issuer/payer/currency in this mode
};

export type CreateInvoiceRPCPayload = CreateInvoiceStandalone | CreateInvoiceWithAllocations;

export interface TeamMembership {
  team_id: number;
  team_title: string;
  role_id: number;
}

export interface FromInvoiceCreditNoteContext {
  invoiceId: number
  invoiceNumber?: string
  currency: string
  supplierTeamId?: number
  supplierTeamName?: string
  payerTeamId?: number
  payerTeamName?: string
  subtotalAmount?: number
  suggestedAmount?: number
  vatRate?: number
} 
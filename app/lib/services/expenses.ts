import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import type { 
  SupplierInvoiceFilters, 
  SupplierInvoiceSortConfig,
  SupplierPaymentFilters,
  SupplierPaymentSortConfig,
  SupplierCreditNoteFilters,
  SupplierCreditNoteSortConfig,
  CreateSupplierPaymentData,
  CreateInvoiceAllocationData,
  UserRole,
  UserPermissions,
  ProductionOrderFilters,
  ProductionOrderSortConfig,
  ProductionOrderList
} from '../types/expenses'

// User role and permission helpers
export async function getUserRoles(): Promise<UserRole[]> {
  const supabase = createClientComponentClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) return []
  
  const { data, error } = await supabase
    .from('teams_users')
    .select('team_id, role_id')
    .eq('user_id', user.id)
  
  if (error) throw error
  return data || []
}

export function deriveUserPermissions(roles: UserRole[]): UserPermissions {
  const isAdmin = roles.some(r => r.role_id === 3)
  const payerTeams = roles.filter(r => [7, 8, 9].includes(r.role_id)).map(r => r.team_id)
  const externalTeams = roles.filter(r => r.role_id === 1).map(r => r.team_id)
  
  return {
    isAdmin,
    payerTeams,
    externalTeams,
    canCreatePayments: isAdmin || payerTeams.length > 0,
    canCreateInvoices: isAdmin || payerTeams.length > 0 || externalTeams.length > 0,
    canCreateCreditNotes: isAdmin || payerTeams.length > 0 || externalTeams.length > 0
  }
}

// Supplier Invoice services
export function buildSupplierInvoiceTrailingQuery(filters: SupplierInvoiceFilters, sort: SupplierInvoiceSortConfig) {
  return (query: any) => {
    // Apply search filter
    if (filters.q) {
      query = query.ilike('invoice_number', `%${filters.q}%`)
    }
    
    // Apply status filter
    if (filters.status.length > 0) {
      query = query.in('status', filters.status)
    }
    
    // Apply currency filter
    if (filters.currency_code.length > 0) {
      query = query.in('currency_code', filters.currency_code)
    }
    
    // Apply issuer team filter
    if (filters.issuer_team_id.length > 0) {
      query = query.in('issuer_team_id', filters.issuer_team_id)
    }
    
    // Apply date range filter
    if (filters.period.from) {
      query = query.gte('invoice_date', filters.period.from.toISOString().split('T')[0])
    }
    if (filters.period.to) {
      query = query.lte('invoice_date', filters.period.to.toISOString().split('T')[0])
    }
    
    // Apply sorting
    query = query.order(sort.field, { ascending: sort.direction === 'asc' })
    query = query.order('id', { ascending: true })
    
    return query
  }
}

export async function getSupplierInvoiceDetails(id: number): Promise<{ data: any | null; error: any }> {
  const supabase = createClientComponentClient()
  const { data, error } = await supabase
    .from('v_received_invoices_list')
    .select('*')
    .eq('id', id)
    .single()
  
  return { data, error }
}

// Supplier Payment services
export function buildSupplierPaymentTrailingQuery(filters: SupplierPaymentFilters, sort: SupplierPaymentSortConfig) {
  return (query: any) => {
    // Apply search filter
    if (filters.q) {
      query = query.ilike('external_ref', `%${filters.q}%`)
    }
    
    // Apply currency filter
    if (filters.payment_currency.length > 0) {
      query = query.in('payment_currency', filters.payment_currency)
    }
    
    // Apply method filter
    if (filters.method.length > 0) {
      query = query.in('method', filters.method)
    }
    
    // Apply status filter
    if (filters.status.length > 0) {
      query = query.in('status', filters.status)
    }
    
    // Apply supplier filter
    if (filters.paid_to_team_id.length > 0) {
      query = query.in('paid_to_team_id', filters.paid_to_team_id)
    }
    
    // Apply date range filter
    if (filters.period.from) {
      query = query.gte('payment_date', filters.period.from.toISOString().split('T')[0])
    }
    if (filters.period.to) {
      query = query.lte('payment_date', filters.period.to.toISOString().split('T')[0])
    }
    
    // Apply sorting
    query = query.order(sort.field, { ascending: sort.direction === 'asc' })
    query = query.order('payment_id', { ascending: true })
    
    return query
  }
}

export async function getSupplierPaymentDetails(paymentId: number) {
  const supabase = createClientComponentClient()
  const { data, error } = await supabase
    .from('supplier_payments')
    .select('*')
    .eq('payment_id', paymentId)
    .single()
  
  if (error) throw error
  return data
}

export async function getSupplierPaymentSummary(paymentId: number): Promise<{ data: any | null; error: any }> {
  try {
    const supabase = createClientComponentClient()
    
    const { data, error } = await supabase
      .from('v_supplier_payments_summary')
      .select('*')
      .eq('payment_id', paymentId)
      .single()

    if (error) {
      console.error('Supplier payment query error:', error)
      return { data: null, error }
    }

    return { data, error: null }
  } catch (error) {
    console.error('Error in getSupplierPaymentSummary:', error)
    return { data: null, error }
  }
}

export async function createSupplierPayment(paymentData: CreateSupplierPaymentData) {
  const supabase = createClientComponentClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) throw new Error('User not authenticated')
  
  const { data, error } = await supabase.rpc('create_supplier_payment_with_allocations', {
    p_payer_team_id: paymentData.payer_team_id,
    p_paid_to_team_id: paymentData.paid_to_team_id,
    p_received_by_user_id: user.id,
    p_payment_date: paymentData.payment_date,
    p_amount: paymentData.payment_amount,
    p_payment_currency: paymentData.payment_currency,
    p_method: paymentData.method,
    p_external_ref: paymentData.external_ref || null,
    p_notes: paymentData.notes || null,
    p_allocations: paymentData.allocations
  })
  
  if (error) throw error
  return data
}

// Supplier Credit Note services
export function buildSupplierCreditNoteTrailingQuery(filters: SupplierCreditNoteFilters, sort: SupplierCreditNoteSortConfig) {
  return (query: any) => {
    // Apply search filter
    if (filters.q) {
      query = query.ilike('credit_number', `%${filters.q}%`)
    }
    
    // Apply currency filter
    if (filters.currency_code.length > 0) {
      query = query.in('currency_code', filters.currency_code)
    }
    
    // Apply status filter
    if (filters.status.length > 0) {
      query = query.in('status', filters.status)
    }
    
    // Apply date range filter
    if (filters.period.from) {
      query = query.gte('credit_date', filters.period.from.toISOString().split('T')[0])
    }
    if (filters.period.to) {
      query = query.lte('credit_date', filters.period.to.toISOString().split('T')[0])
    }
    
    // Apply sorting
    query = query.order(sort.field, { ascending: sort.direction === 'asc' })
    query = query.order('credit_note_id', { ascending: true })
    
    return query
  }
}

export async function getSupplierCreditNoteDetails(creditNoteId: number): Promise<{ data: any | null; error: any }> {
  try {
    const supabase = createClientComponentClient()
    const { data, error } = await supabase
      .from('v_received_credit_notes_summary')
      .select('*')
      .eq('credit_note_id', creditNoteId)
      .single()
    
    if (error) {
      console.error('Supplier credit note query error:', error)
      return { data: null, error }
    }
    
    return { data, error: null }
  } catch (error) {
    console.error('Supplier credit note fetch exception:', error)
    return { data: null, error }
  }
}

// Invoice Allocation services (Invoice ↔ Production Order)
export async function getInvoiceAllocations(invoiceId: number) {
  const supabase = createClientComponentClient()
  const { data, error } = await supabase
    .from('received_invoice_allocations')
    .select(`
      *,
      production_orders!inner(
        id,
        period_month,
        subtotal_amount,
        currency_code,
        supplier_team_id
      )
    `)
    .eq('received_invoice_id', invoiceId)
  
  if (error) throw error
  return data
}

export async function createInvoiceAllocation(allocationData: CreateInvoiceAllocationData) {
  const supabase = createClientComponentClient()
  const { data, error } = await supabase
    .from('received_invoice_allocations')
    .insert(allocationData)
    .select()
    .single()
  
  if (error) throw error
  return data
}

export async function deleteInvoiceAllocation(allocationId: number) {
  const supabase = createClientComponentClient()
  const { error } = await supabase
    .from('received_invoice_allocations')
    .delete()
    .eq('id', allocationId)
  
  if (error) throw error
}

export async function deleteSupplierPayment(paymentId: number) {
  const supabase = createClientComponentClient()
  const { error } = await supabase
    .from('supplier_payments')
    .delete()
    .eq('id', paymentId)
  
  if (error) throw error
}

// Production Order search for allocations
export async function searchProductionOrders(search: string, supplierTeamId: number, currencyCode: string) {
  const supabase = createClientComponentClient()
  let query = supabase
    .from('production_orders')
    .select('id, project_name, billing_period_start, billing_period_end, subtotal_amount, currency_code, supplier_team_id')
    .eq('supplier_team_id', supplierTeamId)
    .eq('currency_code', currencyCode)
    .order('billing_period_start', { ascending: false })
    .order('id', { ascending: true })
    .limit(25)
  
  if (search) {
    query = query.ilike('project_name', `%${search}%`)
  }
  
  const { data, error } = await query
  
  if (error) throw error
  return data
}

// Available invoices for payment allocation
export async function getAvailableInvoicesForPayment(currency: string, search?: string) {
  const supabase = createClientComponentClient()
  let query = supabase
    .from('v_received_invoices_list')
    .select('id, invoice_number, invoice_date, currency_code, total_amount, credited_amount, amount_paid, balance_due, status')
    .in('status', ['received', 'partially_paid'])
    .eq('currency_code', currency)
    .gt('balance_due', 0)
    .order('invoice_date', { ascending: false })
    .order('id', { ascending: true })
    .limit(25)
  
  if (search) {
    query = query.ilike('invoice_number', `%${search}%`)
  }
  
  const { data, error } = await query
  
  if (error) throw error
  return data
}

// URL parsing helpers
export function parseSupplierInvoiceFiltersFromUrl(params: URLSearchParams) {
  return {
    q: params.get('q') || '',
    status: params.get('status')?.split(',').filter(Boolean) || [],
    currency_code: params.get('currency')?.split(',').filter(Boolean) || [],
    issuer_team_id: params.get('issuerTeamId')?.split(',').filter(Boolean) || [],
    period: {
      from: params.get('from') ? new Date(params.get('from')!) : undefined,
      to: params.get('to') ? new Date(params.get('to')!) : undefined,
    }
  }
}

export function parseSupplierInvoiceSortFromUrl(params: URLSearchParams): SupplierInvoiceSortConfig {
  const field = params.get('sort') as SupplierInvoiceSortConfig['field'] || 'invoice_date'
  const direction = params.get('dir') === 'asc' ? 'asc' : 'desc'
  return { field, direction }
}

export async function getSupplierInvoicePDFSignedUrl(
  pdfPath: string
): Promise<{ data: string | null; error: any }> {
  const supabase = createClientComponentClient()
  
  const { data, error } = await supabase.storage
    .from('supplier-invoices')
    .createSignedUrl(pdfPath, 600) // 10 minutes
  
  return { data: data?.signedUrl || null, error }
}

export function parseSupplierPaymentFiltersFromUrl(params: URLSearchParams) {
  return {
    q: params.get('q') || '',
    payment_currency: params.get('currency')?.split(',').filter(Boolean) || [],
    method: params.get('method')?.split(',').filter(Boolean) || [],
    status: params.get('status')?.split(',').filter(Boolean) || [],
    paid_to_team_id: params.get('paidToTeamId')?.split(',').filter(Boolean) || [],
    period: {
      from: params.get('from') ? new Date(params.get('from')!) : undefined,
      to: params.get('to') ? new Date(params.get('to')!) : undefined,
    }
  }
}

export function parseSupplierPaymentSortFromUrl(params: URLSearchParams): SupplierPaymentSortConfig {
  const field = params.get('sort') as SupplierPaymentSortConfig['field'] || 'payment_date'
  const direction = params.get('dir') === 'asc' ? 'asc' : 'desc'
  return { field, direction }
}

export function parseSupplierCreditNoteFiltersFromUrl(params: URLSearchParams) {
  return {
    q: params.get('q') || '',
    currency_code: params.get('currency')?.split(',').filter(Boolean) || [],
    status: params.get('status')?.split(',').filter(Boolean) || [],
    period: {
      from: params.get('from') ? new Date(params.get('from')!) : undefined,
      to: params.get('to') ? new Date(params.get('to')!) : undefined,
    }
  }
}

export function parseSupplierCreditNoteSortFromUrl(params: URLSearchParams): SupplierCreditNoteSortConfig {
  const field = params.get('sort') as SupplierCreditNoteSortConfig['field'] || 'credit_date'
  const direction = params.get('dir') === 'asc' ? 'asc' : 'desc'
  return { field, direction }
}

// Production Order services
export function buildProductionOrderTrailingQuery(filters: ProductionOrderFilters, sort: ProductionOrderSortConfig) {
  return (query: any) => {
    // Apply search filter (client-side for now)
    if (filters.q) {
      // This will be handled client-side since we need to search within the projects JSON
      // For now, we'll apply other filters and handle search in the component
    }

    // Apply status filter
    if (filters.status.length > 0) {
      query = query.in('status', filters.status)
    }

    // Apply currency filter
    if (filters.currency_code.length > 0) {
      query = query.in('currency_code', filters.currency_code)
    }

    // Apply payer team filter
    if (filters.payer_team_id.length > 0) {
      query = query.in('payer_team_id', filters.payer_team_id.map(id => parseInt(id)))
    }

    // Apply supplier team filter
    if (filters.supplier_team_id.length > 0) {
      query = query.in('supplier_team_id', filters.supplier_team_id.map(id => parseInt(id)))
    }

    // Apply period filter
    if (filters.period.from && filters.period.to) {
      query = query
        .gte('period_month', filters.period.from.toISOString().slice(0, 7)) // YYYY-MM format
        .lte('period_month', filters.period.to.toISOString().slice(0, 7))
    }

    // Apply sorting
    query = query.order(sort.field, { ascending: sort.direction === 'asc' })
    // Add secondary sort for consistency (id is not in the sortable fields, so we'll use period_month)
    if (sort.field !== 'period_month') {
      query = query.order('period_month', { ascending: false })
    }

    return query
  }
}

export function parseProductionOrderFiltersFromUrl(params: URLSearchParams): ProductionOrderFilters {
  return {
    q: params.get('q') || '',
    status: params.get('status')?.split(',').filter(Boolean) || [],
    currency_code: params.get('currency')?.split(',').filter(Boolean) || [],
    payer_team_id: params.get('payerTeamId')?.split(',').filter(Boolean) || [],
    supplier_team_id: params.get('supplierTeamId')?.split(',').filter(Boolean) || [],
    period: {
      from: params.get('from') ? new Date(params.get('from')!) : undefined,
      to: params.get('to') ? new Date(params.get('to')!) : undefined,
    }
  }
}

export function parseProductionOrderSortFromUrl(params: URLSearchParams): ProductionOrderSortConfig {
  const field = params.get('sort') as ProductionOrderSortConfig['field'] || 'period_month'
  const direction = params.get('dir') === 'asc' ? 'asc' : 'desc'
  return { field, direction }
} 
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import type { PaymentFilters, PaymentSortConfig, PaymentSummary, OpenInvoice, PaymentAllocation } from './types/billing'

const supabase = createClientComponentClient()

// Types for payment creation
export interface CreatePaymentArgs {
  payerTeamId: number
  paidToTeamId?: number
  receivedByUserId?: number
  paymentDate: string
  amount: number
  currency: string
  method: string
  externalRef?: string
  notes?: string
  allocations?: Allocation[]
}

export interface Allocation {
  issued_invoice_id: number
  amount_applied: number
}

/**
 * Build trailing query for InfiniteList
 */
export function buildPaymentTrailingQuery(
  filters: PaymentFilters,
  sort: PaymentSortConfig
) {
  return (query: any) => {
    let q = query

    // Apply filters
    if (filters.currency && filters.currency.length > 0) {
      q = q.in('payment_currency', filters.currency)
    }

    if (filters.method && filters.method.length > 0) {
      q = q.in('method', filters.method)
    }

    if (filters.payerTeamId) {
      q = q.eq('payer_team_id', filters.payerTeamId)
    }

    if (filters.dateFrom) {
      q = q.gte('payment_date', filters.dateFrom)
    }

    if (filters.dateTo) {
      q = q.lte('payment_date', filters.dateTo)
    }

    // Text search on external_ref, notes, payer_team_name, and allocations (invoice numbers)
    if (filters.search) {
      q = q.or(`external_ref.ilike.%${filters.search}%,notes.ilike.%${filters.search}%,payer_team_name.ilike.%${filters.search}%,allocations::text.ilike.%${filters.search}%`)
    }

    // Apply sorting
    q = q.order(sort.field, { ascending: sort.direction === 'asc' })
    
    // Add secondary sort by payment_id for consistency
    q = q.order('payment_id', { ascending: sort.direction === 'asc' })

    return q
  }
}

/**
 * Parse payment filters from URL parameters
 */
export function parsePaymentFiltersFromUrl(params: URLSearchParams): PaymentFilters {
  const search = params.get('q') || ''
  const currency = params.get('currency')?.split(',').filter(Boolean) || []
  const method = params.get('method')?.split(',').filter(Boolean) || []
  const payerTeamId = params.get('payerTeamId') ? parseInt(params.get('payerTeamId')!) : undefined
  const dateFrom = params.get('from') || undefined
  const dateTo = params.get('to') || undefined

  return {
    search,
    currency,
    method,
    payerTeamId,
    dateFrom,
    dateTo,
  }
}

/**
 * Parse payment sort config from URL parameters
 */
export function parsePaymentSortFromUrl(params: URLSearchParams): PaymentSortConfig {
  const field = params.get('sort') as PaymentSortConfig['field'] || 'payment_date'
  const direction = (params.get('dir') as 'asc' | 'desc') || 'desc'

  return { field, direction }
}

/**
 * Get payment summary by ID
 */
export async function getPaymentSummary(paymentId: number): Promise<{ data: PaymentSummary | null; error: any }> {
  try {
    console.log('Fetching payment with ID:', paymentId)
    
    const { data, error } = await supabase
      .from('v_client_payments_summary')
      .select('payment_id,payer_team_id,payer_team_name,paid_to_team_id,paid_to_team_name,payment_date,payment_amount,payment_currency,status,external_ref,notes,amount_allocated,unallocated_amount,is_overallocated,allocation_count,created_at,updated_at')
      .eq('payment_id', paymentId)
      .single()

    console.log('Payment query result:', { data, error })

    if (error) {
      console.error('Payment query error:', error)
      return { data: null, error }
    }

    return { data: data as PaymentSummary, error: null }
  } catch (error) {
    console.error('Payment fetch exception:', error)
    return { data: null, error }
  }
}

/**
 * Get payment allocations by payment ID
 */
export async function getPaymentAllocations(paymentId: number): Promise<{ data: any[] | null; error: any }> {
  try {
    // First get the allocations
    const { data: allocations, error: allocationsError } = await supabase
      .from('client_payment_allocations')
      .select('issued_invoice_id, amount_applied')
      .eq('payment_id', paymentId)

    if (allocationsError) throw allocationsError

    if (!allocations || allocations.length === 0) {
      return { data: [], error: null }
    }

    // Then get the invoice details from the view
    const invoiceIds = allocations.map(a => a.issued_invoice_id)
    const { data: invoices, error: invoicesError } = await supabase
      .from('v_issued_invoices_list')
      .select('id, invoice_number, total_amount, balance_due, currency_code')
      .in('id', invoiceIds)

    if (invoicesError) throw invoicesError

    // Combine the data
    const formattedData = allocations.map((allocation: any) => {
      const invoice = invoices?.find(inv => inv.id === allocation.issued_invoice_id)
      return {
        invoice_id: allocation.issued_invoice_id,
        amount_applied: allocation.amount_applied,
        invoice_number: invoice?.invoice_number || 'Unknown',
        invoice_total: invoice?.total_amount || 0,
        invoice_balance: invoice?.balance_due || 0,
        currency: invoice?.currency_code || 'EUR'
      }
    })

    return { data: formattedData, error: null }
  } catch (error) {
    return { data: null, error }
  }
}

/**
 * List open invoices for a payer team and currency
 */
export async function listOpenInvoices(payerTeamId: number, currency: string): Promise<{ data: OpenInvoice[]; error: any }> {
  try {
    console.log('Fetching open invoices for:', { payerTeamId, currency })
    
    const { data, error } = await supabase
      .from('v_issued_invoices_list')
      .select('*')
      .eq('payer_team_id', payerTeamId)
      .eq('currency_code', currency)
      .gt('balance_due', 0)
      .order('invoice_date', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(50)

    console.log('Open invoices query result:', { data, error })

    return { data: data || [], error }
  } catch (error) {
    console.error('Open invoices fetch exception:', error)
    return { data: [], error }
  }
}

/**
 * Create a new payment
 */
export async function createPayment(args: CreatePaymentArgs): Promise<{ data: any; error: any }> {
  try {
    const { data, error } = await supabase.rpc('create_client_payment_with_allocations', {
      p_payer_team_id: args.payerTeamId,
      p_paid_to_team_id: args.paidToTeamId || null,
      p_received_by_user_id: args.receivedByUserId,
      p_payment_date: args.paymentDate,
      p_amount: args.amount,
      p_payment_currency: args.currency,
      p_method: args.method,
      p_exchange_rate_note: null,
      p_external_ref: args.externalRef || null,
      p_notes: args.notes || null,
      p_allocations: args.allocations || []
    })

    return { data, error }
  } catch (error) {
    return { data: null, error }
  }
}

/**
 * Legacy create payment function (for compatibility)
 */
export async function createPaymentLegacy(args: CreatePaymentArgs): Promise<{ data: any; error: any }> {
  return createPayment(args)
}

/**
 * Replace payment allocations
 */
export async function replacePaymentAllocations(
  paymentId: number, 
  allocations: Allocation[]
): Promise<{ data: any; error: any }> {
  try {
    // First delete existing allocations
    await supabase
      .from('client_payment_allocations')
      .delete()
      .eq('payment_id', paymentId)

    // Then insert new allocations
    if (allocations.length > 0) {
      const { data, error } = await supabase
        .from('client_payment_allocations')
        .insert(
          allocations.map(allocation => ({
            payment_id: paymentId,
            issued_invoice_id: allocation.issued_invoice_id,
            amount_applied: allocation.amount_applied,
          }))
        )
        .select()

      return { data, error }
    }

    return { data: [], error: null }
  } catch (error) {
    return { data: null, error }
  }
}

/**
 * Update a payment
 */
export async function updatePayment(
  paymentId: number, 
  updates: Partial<{
    external_ref: string
    notes: string
    payment_date: string
    method: string
    amount: number
    payment_currency: string
    payer_team_id: number
  }>
): Promise<{ data: any; error: any }> {
  try {
    const { data, error } = await supabase
      .from('client_payments')
      .update(updates)
      .eq('id', paymentId)
      .select()

    return { data, error }
  } catch (error) {
    return { data: null, error }
  }
}

/**
 * Delete a payment
 */
export async function deletePayment(paymentId: number): Promise<{ data: any; error: any }> {
  try {
    const { data, error } = await supabase
      .from('client_payments')
      .delete()
      .eq('id', paymentId)

    return { data, error }
  } catch (error) {
    return { data: null, error }
  }
}

/**
 * Delete an allocation
 */
export async function deleteAllocation(paymentId: number, invoiceId: number): Promise<{ data: any; error: any }> {
  try {
    const { data, error } = await supabase
      .from('client_payment_allocations')
      .delete()
      .eq('payment_id', paymentId)
      .eq('issued_invoice_id', invoiceId)

    return { data, error }
  } catch (error) {
    return { data: null, error }
  }
}

/**
 * Get payment allocations for a specific invoice
 */
export async function getInvoicePaymentAllocations(invoiceId: number): Promise<{ data: any[] | null; error: any }> {
  try {
    // Get allocations for this invoice
    const { data: allocations, error: allocationsError } = await supabase
      .from('client_payment_allocations')
      .select('payment_id, issued_invoice_id, amount_applied')
      .eq('issued_invoice_id', invoiceId)

    if (allocationsError) throw allocationsError

    if (!allocations || allocations.length === 0) {
      return { data: [], error: null }
    }

    // Get payment details for these allocations
    const paymentIds = allocations.map(a => a.payment_id)
    const { data: payments, error: paymentsError } = await supabase
      .from('v_client_payments_summary')
      .select('payment_id, payment_date, payment_amount, payment_currency, external_ref, payer_team_name')
      .in('payment_id', paymentIds)

    if (paymentsError) throw paymentsError

    // Combine the data
    const formattedData = allocations.map((allocation: any) => {
      const payment = payments?.find(p => p.payment_id === allocation.payment_id)
      return {
        payment_id: allocation.payment_id,
        issued_invoice_id: allocation.issued_invoice_id,
        amount_applied: allocation.amount_applied,
        payment_date: payment?.payment_date,
        payment_amount: payment?.payment_amount,
        payment_currency: payment?.payment_currency,
        external_ref: payment?.external_ref,
        payer_team_name: payment?.payer_team_name
      }
    })

    return { data: formattedData, error: null }
  } catch (error) {
    return { data: null, error }
  }
}
 
 
 
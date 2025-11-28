import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import type { 
  CreditNoteFilters, 
  CreditNoteSortConfig, 
  CreditNoteSummary, 
  CreditNoteDetails,
  CreateCreditNoteData 
} from './types/billing'

const supabase = createClientComponentClient()

/**
 * Build trailing query for InfiniteList
 */
export function buildCreditNoteTrailingQuery(
  filters: CreditNoteFilters,
  sort: CreditNoteSortConfig
) {
  return (query: any) => {
    let q = query

    // Apply filters
    if (filters.currency && filters.currency.length > 0) {
      q = q.in('currency_code', filters.currency)
    }

    if (filters.status && filters.status.length > 0) {
      q = q.in('status', filters.status)
    }

    if (filters.dateFrom) {
      q = q.gte('credit_date', filters.dateFrom)
    }

    if (filters.dateTo) {
      q = q.lte('credit_date', filters.dateTo)
    }

    // Text search on credit_number and invoice_number
    if (filters.search) {
      q = q.or(`credit_number.ilike.%${filters.search}%,invoice_number.ilike.%${filters.search}%`)
    }

    // Apply sorting
    q = q.order(sort.field, { ascending: sort.direction === 'asc' })
    
    // Add secondary sort by credit_note_id for consistency
    q = q.order('credit_note_id', { ascending: sort.direction === 'asc' })

    return q
  }
}

/**
 * Parse credit note filters from URL parameters
 */
export function parseCreditNoteFiltersFromUrl(params: URLSearchParams): CreditNoteFilters {
  const search = params.get('q') || ''
  const currency = params.get('currency')?.split(',').filter(Boolean) || []
  const status = params.get('status')?.split(',').filter(Boolean) || []
  const dateFrom = params.get('from') || undefined
  const dateTo = params.get('to') || undefined

  return {
    search,
    currency,
    status,
    dateFrom,
    dateTo,
  }
}

/**
 * Parse credit note sort config from URL parameters
 */
export function parseCreditNoteSortFromUrl(params: URLSearchParams): CreditNoteSortConfig {
  const field = params.get('sort') as CreditNoteSortConfig['field'] || 'credit_date'
  const direction = (params.get('dir') as 'asc' | 'desc') || 'desc'

  return { field, direction }
}

/**
 * Get credit note details by ID
 */
export async function getCreditNoteDetails(creditNoteId: number): Promise<{ data: CreditNoteDetails | null; error: any }> {
  try {
    const { data, error } = await supabase
      .from('v_credit_notes_summary')
      .select('*')
      .eq('credit_note_id', creditNoteId)
      .single()

    if (error) {
      console.error('Credit note query error:', error)
      return { data: null, error }
    }

    return { data, error: null }
  } catch (error) {
    console.error('Credit note fetch exception:', error)
    return { data: null, error }
  }
}

/**
 * Create a new credit note
 */
export async function createCreditNote(data: CreateCreditNoteData): Promise<{ data: number | null; error: any }> {
  try {
    const { data: result, error } = await supabase
      .from('issued_credit_notes')
      .insert({
        issued_invoice_id: data.issued_invoice_id,
        credit_number: data.credit_number,
        credit_date: data.credit_date,
        currency_code: data.currency_code,
        subtotal_amount: data.subtotal_amount,
        vat_amount: data.vat_amount,
        total_amount: data.total_amount,
        reason: data.reason
      })
      .select('id')
      .single()

    if (error) {
      return { data: null, error }
    }

    return { data: result.id, error: null }
  } catch (error) {
    return { data: null, error }
  }
}

/**
 * Update a credit note
 */
export async function updateCreditNote(
  creditNoteId: number,
  updates: {
    credit_number?: string
    credit_date?: string
    currency_code?: string
    subtotal_amount?: number
    vat_amount?: number
    total_amount?: number
    reason?: string
    pdf_path?: string
  }
): Promise<{ data: any; error: any }> {
  try {
    const { data, error } = await supabase
      .from('issued_credit_notes')
      .update(updates)
      .eq('id', creditNoteId)
      .select()

    // Return first updated row (should be exactly one)
    return { data: data?.[0] || null, error }
  } catch (error) {
    return { data: null, error }
  }
}

/**
 * Void a credit note
 */
export async function voidCreditNote(creditNoteId: number): Promise<{ data: any; error: any }> {
  try {
    const { data, error } = await supabase
      .from('issued_credit_notes')
      .update({ status: 'void' })
      .eq('id', creditNoteId)

    return { data, error }
  } catch (error) {
    return { data: null, error }
  }
}

/**
 * Delete a credit note
 */
export async function deleteCreditNote(creditNoteId: number): Promise<{ data: any; error: any }> {
  try {
    // creditNoteId is actually the database id (primary key) from the view
    console.log('Deleting credit note with id:', creditNoteId)
    const { data, error } = await supabase
      .from('issued_credit_notes')
      .delete()
      .eq('id', creditNoteId)

    console.log('Delete result:', { data, error })
    return { data, error }
  } catch (error) {
    return { data: null, error }
  }
}

/**
 * List available invoices for credit note creation
 */
export async function listAvailableInvoicesForCreditNote(currency: string): Promise<{ data: any[]; error: any }> {
  try {
    const { data, error } = await supabase
      .from('v_issued_invoices_list')
      .select('id, invoice_number, invoice_date, total_amount, balance_due, currency_code, status, subtotal_amount, vat_amount, issuer_team_id')
      .eq('currency_code', currency)
      .in('status', ['issued', 'partially_paid'])
      .order('invoice_date', { ascending: false })
      .order('id', { ascending: true })
      .limit(50)

    return { data: data || [], error }
  } catch (error) {
    return { data: [], error }
  }
}

/**
 * Get credit note PDF signed URL
 */
export async function getCreditNotePDFSignedUrl(
  pdfPath: string
): Promise<{ data: string | null; error: any }> {
  const { data, error } = await supabase.storage
    .from('credit-notes')
    .createSignedUrl(pdfPath, 600) // 10 minutes
  
  return { data: data?.signedUrl || null, error }
}

/**
 * Delete credit note PDF using RPC
 */
export async function deleteCreditNotePdf(
  creditNoteId: number
): Promise<{ data: string | null; error: any }> {
  const { data, error } = await supabase
    .rpc('delete_credit_note_pdf', { p_credit_note_id: creditNoteId })
  
  return { data, error }
} 
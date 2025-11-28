import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import type { SupabaseClient } from '@supabase/supabase-js'
import { updateItemInStore } from '../../../hooks/use-infinite-query'
import type { 
  InvoiceOrder, 
  InvoiceLine, 
  InvoiceOrderFilters, 
  InvoiceOrderSortConfig,
  InvoiceOrderUrlParams,
  InvoiceFilters,
  InvoiceSortConfig,
  TeamMembership,
  CreateInvoiceRPCPayload
} from '../types/billing'

/**
 * Calls the toc_invoice edge function to sync with TOC Online
 * Handles errors gracefully and updates api_response column
 */
export async function syncInvoiceWithTOC(invoiceId: number): Promise<{ success: boolean; error?: string }> {
  const supabase = createClientComponentClient()
  
  try {
    // Get the Supabase URL from environment
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!supabaseUrl) {
      throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL')
    }

    // Get the current session for authentication
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) {
      throw new Error('No access token available')
    }

    // Call the toc_invoice edge function
    const response = await fetch(`${supabaseUrl}/functions/v1/toc_invoice`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        invoice_id: invoiceId
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`TOC sync failed: ${response.status} ${errorText}`)
    }

    const result = await response.json()
    
    // Update the api_response column with success response
    await supabase
      .from('issued_client_invoices')
      .update({
        api_response: {
          success: true,
          synced_at: new Date().toISOString(),
          toc_data: result.toc_data
        }
      })
      .eq('id', invoiceId)

    console.log(`✅ Invoice ${invoiceId} successfully synced with TOC Online`)
    return { success: true }

  } catch (error: any) {
    console.error(`❌ TOC sync error for invoice ${invoiceId}:`, error.message)
    
    // Update the api_response column with error details
    try {
      await supabase
        .from('issued_client_invoices')
        .update({
          api_response: {
            success: false,
            error: error.message,
            failed_at: new Date().toISOString()
          }
        })
        .eq('id', invoiceId)
    } catch (updateError) {
      console.error('Failed to update api_response column:', updateError)
    }

    return { success: false, error: error.message }
  }
}

/**
 * Manually trigger TOC sync for an existing invoice
 * Useful for retrying failed syncs or syncing invoices created before automation
 */
export async function retrySyncInvoiceWithTOC(invoiceId: number): Promise<{ success: boolean; error?: string }> {
  console.log(`🔄 Manually triggering TOC sync for invoice ${invoiceId}...`)
  return await syncInvoiceWithTOC(invoiceId)
}

/**
 * Check the TOC sync status of an invoice
 */
export async function getInvoiceTOCSyncStatus(invoiceId: number): Promise<{ 
  synced: boolean; 
  syncedAt?: string; 
  error?: string; 
  apiResponse?: any 
}> {
  const supabase = createClientComponentClient()
  
  try {
    const { data, error } = await supabase
      .from('issued_client_invoices')
      .select('api_response')
      .eq('id', invoiceId)
      .single()

    if (error) {
      throw new Error(error.message)
    }

    const apiResponse = data?.api_response

    if (!apiResponse) {
      return { synced: false }
    }

    if (apiResponse.success) {
      return {
        synced: true,
        syncedAt: apiResponse.synced_at,
        apiResponse
      }
    } else {
      return {
        synced: false,
        error: apiResponse.error,
        apiResponse
      }
    }
  } catch (error: any) {
    return {
      synced: false,
      error: error.message
    }
  }
}

export async function fetchInvoiceOrders(
  filters: InvoiceOrderFilters,
  sort: InvoiceOrderSortConfig,
  page: number = 1,
  limit: number = 50
): Promise<{ data: any[]; count: number; error: any }> {
  const supabase = createClientComponentClient()
  
  let query = supabase
    .from('v_invoice_orders_list')
    .select('*', { count: 'exact' })

  // Apply filters
  if (filters.project.length > 0) {
    query = query.in('project_id', filters.project)
  }

  if (filters.period.from) {
    query = query.gte('billing_period_start', filters.period.from.toISOString().split('T')[0])
  }

  if (filters.period.to) {
    query = query.lte('billing_period_end', filters.period.to.toISOString().split('T')[0])
  }

  if (filters.status.length > 0) {
    query = query.in('status', filters.status)
  }

  if (filters.remaining === 'has_remaining') {
    query = query.gt('remaining_to_issue', 0)
  }

  if (filters.search) {
    query = query.or(`project_name.ilike.%${filters.search}%`)
  }

  // Apply sorting
  query = query.order(sort.field, { ascending: sort.direction === 'asc' })

  // Apply pagination
  const from = (page - 1) * limit
  const to = from + limit - 1
  query = query.range(from, to)

  const { data, count, error } = await query

  return {
    data: data || [],
    count: count || 0,
    error
  }
}



export async function createDraftIssuedInvoice(
  invoiceOrderIds: number[],
  overrides?: { [key: string]: number },
  invoiceSubtotal?: number | null
): Promise<{ data: number | null; error: any }> {
  const supabase = createClientComponentClient()
  const { data, error } = await supabase.rpc('create_draft_issued_invoice', {
    p_invoice_order_ids: invoiceOrderIds,
    p_overrides: overrides || {},
    p_invoice_subtotal: invoiceSubtotal
  })
  
  return { data, error }
}

export async function fetchIssuedInvoice(id: number): Promise<{ data: any | null; error: any }> {
  const supabase = createClientComponentClient()
  
  // First, try to fetch the invoice data from the view that includes the new fields
  const { data: invoice, error: basicError } = await supabase
    .from('v_issued_invoices_list')
    .select('*')
    .eq('id', id)
    .single()
  
  if (basicError) {
    console.error('Error fetching invoice data from view:', basicError)
    return { data: null, error: basicError }
  }
  
  if (!invoice) {
    return { data: null, error: { message: 'Invoice not found' } }
  }
  
  // Then fetch the linked orders separately to avoid the multiple rows issue
  const { data: issuedInvoiceOrders, error: ordersError } = await supabase
    .from('issued_invoice_orders')
    .select(`
      *,
      invoice_orders (
        id, billing_period_start, billing_period_end,
        subtotal_amount, vat_amount, total_amount,
        issued_subtotal, remaining_subtotal,
        currency_code,
        projects (name, color)
      )
    `)
    .eq('issued_invoice_id', id)
  
  if (ordersError) {
    console.error('Error fetching invoice orders:', ordersError)
    // Return the invoice without orders rather than failing completely
    return { data: { ...invoice, issued_invoice_orders: [] }, error: null }
  }
  
  // Combine the data
  const fullInvoice = {
    ...invoice,
    issued_invoice_orders: issuedInvoiceOrders || []
  }
  
  return { data: fullInvoice, error: null }
}

export async function fetchIssuedInvoicesForOrder(orderId: number): Promise<{ data: any[]; error: any }> {
  const supabase = createClientComponentClient()
  const { data, error } = await supabase
    .from('v_order_issued_invoices')
    .select('*')
    .eq('invoice_order_id', orderId)
    .order('issued_invoice_id', { ascending: false })
  
  return { data: data || [], error }
}

export async function fetchInvoiceOrder(orderId: number): Promise<{ data: any | null; error: any }> {
  const supabase = createClientComponentClient()
  
  const { data, error } = await supabase
    .from('invoice_orders')
    .select(`
      *,
      issued_invoice_orders (
        issued_invoice_id,
        amount_override_total,
        amount_override_subtotal,
        amount_override_vat,
        issued_client_invoices (id, status, invoice_number, invoice_date)
      )
    `)
    .eq('id', orderId)
    .single()
  
  return { data, error }
}

export async function fetchInvoiceLines(
  invoiceOrderId: number,
  page: number = 1,
  limit: number = 50
): Promise<{ data: any[]; count: number; error: any }> {
  const supabase = createClientComponentClient()
  
  let query = supabase
    .from('invoice_lines')
    .select('*', { count: 'exact' })
    .eq('invoice_order_id', invoiceOrderId)
    .order('id', { ascending: true })

  // Apply pagination
  const from = (page - 1) * limit
  const to = from + limit - 1
  query = query.range(from, to)

  const { data, count, error } = await query

  return {
    data: data || [],
    count: count || 0,
    error
  }
}

export async function unlinkInvoiceOrder(
  issuedInvoiceId: number,
  invoiceOrderId: number
): Promise<{ data: any | null; error: any }> {
  const supabase = createClientComponentClient()
  
  // Delete the connection from issued_invoice_orders table
  const { data, error } = await supabase
    .from('issued_invoice_orders')
    .delete()
    .eq('issued_invoice_id', issuedInvoiceId)
    .eq('invoice_order_id', invoiceOrderId)
    .select()
  
  return { data, error }
}

export async function fetchProjects(): Promise<{ data: any[]; error: any }> {
  const supabase = createClientComponentClient()
  
  const { data, error } = await supabase
    .from('projects')
    .select('id, name, color')
    .order('name')

  return {
    data: data || [],
    error
  }
}

export function parseFiltersFromUrl(params: URLSearchParams): InvoiceOrderFilters {
  return {
    project: params.get('projectId')?.split(',').filter(Boolean) || [],
    period: {
      from: params.get('from') ? new Date(params.get('from')!) : undefined,
      to: params.get('to') ? new Date(params.get('to')!) : undefined,
    },
    status: params.get('status')?.split(',').filter(Boolean) || [],
    invoiced: (params.get('invoiced') as 'all' | 'yes' | 'no') || 'all',
    remaining: (params.get('remaining') as 'all' | 'has_remaining') || 'all',
    search: params.get('q') || '',
  }
}

export function parseSortFromUrl(params: URLSearchParams): InvoiceOrderSortConfig {
  const sortField = params.get('sort') as InvoiceOrderSortConfig['field'] || 'billing_period_start'
  const sortDirection = (params.get('dir') as 'asc' | 'desc') || 'desc'
  
  return {
    field: sortField,
    direction: sortDirection,
  }
}

export function buildTrailingQuery(
  filters: InvoiceOrderFilters,
  sort: InvoiceOrderSortConfig
) {
  return (query: any) => {
    let q = query

    // Apply filters
    if (filters.project.length > 0) {
      q = q.in('project_id', filters.project)
    }

    if (filters.period.from) {
      q = q.gte('billing_period_start', filters.period.from.toISOString().split('T')[0])
    }

    if (filters.period.to) {
      q = q.lte('billing_period_end', filters.period.to.toISOString().split('T')[0])
    }

    if (filters.status.length > 0) {
      q = q.in('status', filters.status)
    }

    if (filters.remaining === 'has_remaining') {
      q = q.gt('remaining_to_issue', 0)
    }

    if (filters.search) {
      q = q.or(`project_name.ilike.%${filters.search}%`)
    }

    // Apply sorting
    q = q.order(sort.field, { ascending: sort.direction === 'asc' })

    return q
  }
}

// New functions for issued invoice management

export async function updateIssuedInvoice(
  id: number,
  updates: {
    invoice_number?: string
    external_invoice_id?: string
    invoice_date?: string
    pdf_path?: string | undefined
    currency_code?: string
    subtotal_amount?: number
    vat_amount?: number
    total_amount?: number
    issuer_team_id?: number | null
    payer_team_id?: number | null
  }
): Promise<{ data: any | null; error: any }> {
  const supabase = createClientComponentClient()
  const { data, error } = await supabase
    .from('issued_client_invoices')
    .update(updates)
    .eq('id', id)
    .select()
  
  // If successful, return the first updated row (should be exactly one)
  return { data: data?.[0] || null, error }
}

export async function updateIssuedInvoiceOrderAmounts(
  issuedInvoiceId: number,
  orderId: number,
  billedTotal: number,
  orderTotal: number
): Promise<{ data: any | null; error: any }> {
  const supabase = createClientComponentClient()
  
  // Calculate proportional amounts
  const rate = orderTotal === 0 ? 0 : billedTotal / orderTotal
  
  // Get the order details to calculate proportional subtotal and VAT
  const { data: orderData, error: orderError } = await supabase
    .from('invoice_orders')
    .select('subtotal_amount, vat_amount, total_amount')
    .eq('id', orderId)
    .single()
  
  if (orderError || !orderData) {
    return { data: null, error: orderError || new Error('Order not found') }
  }
  
  // Calculate proportional amounts
  const billedSubtotal = Math.round(orderData.subtotal_amount * rate * 100) / 100
  const billedVat = Math.round(orderData.vat_amount * rate * 100) / 100
  const calculatedTotal = billedSubtotal + billedVat
  
  // Ensure rounding consistency
  const finalBilledTotal = Math.round(billedTotal * 100) / 100
  
  // Update the issued_invoice_orders row
  const { data, error } = await supabase
    .from('issued_invoice_orders')
    .update({
      amount_override_subtotal: billedSubtotal,
      amount_override_vat: billedVat,
      amount_override_total: finalBilledTotal
    })
    .eq('issued_invoice_id', issuedInvoiceId)
    .eq('invoice_order_id', orderId)
    .select()
    .single()
  
  return { data, error }
}

export async function uploadInvoicePDF(
  file: File,
  issuedInvoiceId: number,
  invoiceNumber: string,
  issuerTeamId: number
): Promise<{ data: string | null; error: any }> {
  const supabase = createClientComponentClient()
  
  // Generate stable file key
  const year = new Date().getFullYear()
  const fileExtension = file.name.split('.').pop() || 'pdf'
  const fileName = `${issuedInvoiceId}-${invoiceNumber}.${fileExtension}`
  const filePath = `invoices/${year}/${issuerTeamId}/${fileName}`
  
  // Upload file to storage
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('invoices')
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false
    })
  
  if (uploadError) {
    return { data: null, error: uploadError }
  }
  
  return { data: filePath, error: null }
}

export async function getInvoicePDFSignedUrl(
  pdfPath: string
): Promise<{ data: string | null; error: any }> {
  const supabase = createClientComponentClient()
  
  const { data, error } = await supabase.storage
    .from('invoices')
    .createSignedUrl(pdfPath, 600) // 10 minutes
  
  return { data: data?.signedUrl || null, error }
}

export async function deleteInvoicePdf(
  invoiceId: number
): Promise<{ data: string | null; error: any }> {
  const supabase = createClientComponentClient()
  const { data, error } = await supabase
    .rpc('delete_invoice_pdf', { p_invoice_id: invoiceId })
  
  return { data, error }
}

export async function issueInvoice(
  id: number
): Promise<{ data: any | null; error: any }> {
  const supabase = createClientComponentClient()
  const { data, error } = await supabase
    .from('issued_client_invoices')
    .update({ status: 'issued' })
    .eq('id', id)
    .select()
    .single()
  
  return { data, error }
}

/**
 * Update an invoice order in all caches for optimistic updates.
 * This function should be called when an invoice is issued to update the order status.
 */
export function updateInvoiceOrderInCaches(updatedOrder: InvoiceOrder) {
  // Update the invoice orders in all InfiniteList stores
  updateItemInStore('v_invoice_orders_list', undefined, updatedOrder)
  
  // Also trigger a custom event for any other components that need to know
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('invoiceOrderUpdated', { 
      detail: updatedOrder 
    }))
  }
}

// Invoice List services
export async function fetchInvoices(
  filters: InvoiceFilters,
  sort: InvoiceSortConfig,
  page: number = 1,
  limit: number = 50
): Promise<{ data: any[]; count: number; error: any }> {
  const supabase = createClientComponentClient()
  
  let query = supabase
    .from('v_issued_invoices_list')
    .select('*', { count: 'exact' })

  // Apply filters
  if (filters.status.length > 0) {
    query = query.in('status', filters.status)
  }

  if (filters.issuerTeamId.length > 0) {
    query = query.in('issuer_team_id', filters.issuerTeamId)
  }

  if (filters.payerTeamId.length > 0) {
    query = query.in('payer_team_id', filters.payerTeamId)
  }

  if (filters.period.from) {
    query = query.gte('invoice_date', filters.period.from.toISOString().split('T')[0])
  }

  if (filters.period.to) {
    query = query.lte('invoice_date', filters.period.to.toISOString().split('T')[0])
  }

  if (filters.balance === 'due_only') {
    query = query.gt('balance_due', 0)
  }

  if (filters.q) {
    query = query.or(`invoice_number.ilike.%${filters.q}%,payer_team_name.ilike.%${filters.q}%,projects_text.ilike.%${filters.q}%`)
  }

  if (filters.projects.length > 0) {
    query = query.overlaps('projects', filters.projects)
  }

  // Apply sorting
  if (sort.field === 'invoice_date') {
    query = query.order('invoice_date', { ascending: sort.direction === 'asc' })
    query = query.order('created_at', { ascending: sort.direction === 'desc' })
  } else if (sort.field === 'projects_text') {
    // sort by the text vector of projects if present
    query = query.order('projects_text', { ascending: sort.direction === 'asc' })
  } else {
    query = query.order(sort.field, { ascending: sort.direction === 'asc' })
  }

  // Apply pagination
  const from = (page - 1) * limit
  const to = from + limit - 1
  query = query.range(from, to)

  const { data, count, error } = await query

  return {
    data: data || [],
    count: count || 0,
    error
  }
}

export function parseInvoiceFiltersFromUrl(params: URLSearchParams): InvoiceFilters {
  return {
    q: params.get('q') || '',
    status: params.get('status')?.split(',').filter(Boolean) || [],
    issuerTeamId: params.get('issuerTeamId')?.split(',').filter(Boolean) || [],
    payerTeamId: params.get('payerTeamId')?.split(',').filter(Boolean) || [],
    period: {
      from: params.get('from') ? new Date(params.get('from')!) : undefined,
      to: params.get('to') ? new Date(params.get('to')!) : undefined,
    },
    balance: (params.get('balance') as 'all' | 'due_only') || 'all',
    projects: params.get('projects')?.split(',').filter(Boolean) || [],
  }
}

export function parseInvoiceSortFromUrl(params: URLSearchParams): InvoiceSortConfig {
  const sortField = params.get('sort') as InvoiceSortConfig['field'] || 'invoice_date'
  const sortDirection = params.get('dir') as 'asc' | 'desc' || 'desc'
  
  return {
    field: sortField,
    direction: sortDirection,
  }
}

export function buildInvoiceTrailingQuery(
  filters: InvoiceFilters,
  sort: InvoiceSortConfig
) {
  return (query: any) => {
    let q = query

    // Apply filters
    if (filters.status.length > 0) {
      q = q.in('status', filters.status)
    }

    if (filters.issuerTeamId.length > 0) {
      q = q.in('issuer_team_id', filters.issuerTeamId)
    }

    if (filters.payerTeamId.length > 0) {
      q = q.in('payer_team_id', filters.payerTeamId)
    }

    if (filters.period.from) {
      q = q.gte('invoice_date', filters.period.from.toISOString().split('T')[0])
    }

    if (filters.period.to) {
      q = q.lte('invoice_date', filters.period.to.toISOString().split('T')[0])
    }

    if (filters.balance === 'due_only') {
      q = q.gt('balance_due', 0)
    }

    if (filters.q) {
      q = q.or(`invoice_number.ilike.%${filters.q}%,payer_team_name.ilike.%${filters.q}%,projects_text.ilike.%${filters.q}%`)
    }

    if (filters.projects.length > 0) {
      q = q.overlaps('projects', filters.projects)
    }

    // Apply sorting
    if (sort.field === 'invoice_date') {
      q = q.order('invoice_date', { ascending: sort.direction === 'asc' })
      q = q.order('created_at', { ascending: sort.direction === 'desc' })
    } else {
      q = q.order(sort.field, { ascending: sort.direction === 'asc' })
    }

    return q
  }
} 

export async function fetchIssuedInvoiceLines(
  issuedInvoiceId: number,
  page: number = 1,
  limit: number = 50
): Promise<{ data: any[]; count: number; error: any }> {
  const supabase = createClientComponentClient()
  
  let query = supabase
    .from('v_issued_invoice_lines')
    .select('*', { count: 'exact' })
    .eq('issued_invoice_id', issuedInvoiceId)
    .order('description', { ascending: true })

  // Apply pagination
  const from = (page - 1) * limit
  const to = from + limit - 1
  query = query.range(from, to)

  const { data, count, error } = await query

  return {
    data: data || [],
    count: count || 0,
    error
  }
} 

export async function createAndIssueInvoice({
  invoiceOrderIds,
  overrides,
  invoiceNumber,
  invoiceDate,
  pdfPath,
  subtotal,
  vatAmount,
  totalAmount,
  externalInvoiceId,
  notes
}: {
  invoiceOrderIds: number[]
  overrides: { [key: string]: number }
  invoiceNumber: string
  invoiceDate: string
  pdfPath: string | null
  subtotal: number
  vatAmount: number
  totalAmount: number
  externalInvoiceId?: string
  notes?: string
}): Promise<{ data: number | null; error: any }> {
  const supabase = createClientComponentClient()
  
  // The overrides are already in subtotal format, so we can use them directly
  const { data, error } = await supabase.rpc('create_and_issue_invoice', {
    p_invoice_order_ids: invoiceOrderIds,
    p_subtotal_overrides: overrides,
    p_invoice_number: invoiceNumber,
    p_external_invoice_id: externalInvoiceId || null,
    p_invoice_date: invoiceDate,
    p_pdf_path: pdfPath,
    p_notes: notes || null,
    p_header_subtotal: subtotal,
    p_header_vat: vatAmount,
    p_header_total: totalAmount
  })
  
  // If invoice creation was successful, immediately sync with TOC Online
  if (data && !error) {
    const invoiceId = data
    console.log(`🔄 Automatically syncing invoice ${invoiceId} with TOC Online...`)
    
    // Fire and forget - don't wait for TOC sync to complete
    // This ensures users see immediate feedback while sync happens in background
    syncInvoiceWithTOC(invoiceId).catch(syncError => {
      console.error(`Background TOC sync failed for invoice ${invoiceId}:`, syncError)
    })
  }
  
  return { data, error }
}

/**
 * Fetch teams the current user belongs to for issuer team dropdown
 */
export async function fetchUserTeams(): Promise<{ data: TeamMembership[] | null; error: any }> {
  const supabase = createClientComponentClient()
  
  const { data, error } = await supabase
    .from('v_teams_i_belong_to')
    .select('team_id, team_title, role_id')
    .order('team_title', { ascending: true })
  
  return { data, error }
}

/**
 * Fetch client teams for payer team dropdown
 */
export async function fetchClientTeams(): Promise<{ data: TeamMembership[] | null; error: any }> {
  const supabase = createClientComponentClient()
  
  const { data, error } = await supabase
    .from('v_clients_teams')
    .select('team_id, title')
    .order('title', { ascending: true })
  
  // Map to match TeamMembership interface
  const mappedData = data?.map(item => ({
    team_id: item.team_id,
    team_title: item.title,
    role_id: 0 // Default value since role_id doesn't exist in v_clients_teams
  })) || null
  
  return { data: mappedData, error }
}

/**
 * Fetch supplier teams for payer team dropdown
 */
export async function fetchSupplierTeams(): Promise<{ data: TeamMembership[] | null; error: any }> {
  const supabase = createClientComponentClient()
  
  const { data, error } = await supabase
    .from('v_suppliers_teams')
    .select('team_id, team_name')
    .order('team_name', { ascending: true })
  
  // Map to match TeamMembership interface
  const mappedData = data?.map(item => ({
    team_id: item.team_id,
    team_title: item.team_name,
    role_id: 0 // Default value since role_id doesn't exist in v_suppliers_teams
  })) || null
  
  return { data: mappedData, error }
}

/**
 * Create and issue invoice using the new RPC function
 * Supports both standalone and allocations modes
 */
export async function createAndIssueInvoiceRPC(payload: CreateInvoiceRPCPayload): Promise<{ data: number | null; error: any }> {
  const supabase = createClientComponentClient()
  
  const { data, error } = await supabase.rpc('create_and_issue_invoice', payload)
  
  // If invoice creation was successful, immediately sync with TOC Online
  if (data && !error) {
    const invoiceId = data
    console.log(`🔄 Automatically syncing invoice ${invoiceId} with TOC Online...`)
    
    // Fire and forget - don't wait for TOC sync to complete
    // This ensures users see immediate feedback while sync happens in background
    syncInvoiceWithTOC(invoiceId).catch(syncError => {
      console.error(`Background TOC sync failed for invoice ${invoiceId}:`, syncError)
    })
  }
  
  return { data, error }
} 
"use client"

import React, { useState, useEffect } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { X, MoreHorizontal, Edit, Plus, Trash2, Copy } from 'lucide-react'
import IssuedInvoiceDetail from '../billing/IssuedInvoiceDetail'
import { PaymentsList } from './PaymentsList'
import { PaymentsFilters } from './PaymentsFilters'
import { PaymentCreateButton } from './PaymentCreateButton'
import { PaymentDetailsPane } from './PaymentDetailsPane'
import { PaymentCreateModal } from './PaymentCreateModal'
import { Button } from '../ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../ui/dialog'
import { parsePaymentFiltersFromUrl, parsePaymentSortFromUrl, deletePayment } from '../../lib/payments'
import { getItemFromStore } from '../../../hooks/use-infinite-query'
import { useDebounce } from '../../hooks/use-debounce'
import { useQueryClient } from '@tanstack/react-query'
import type { PaymentFilters, PaymentSortConfig, PaymentSummary } from '../../lib/types/billing'
import { FilterBadges } from '../../../components/ui/filter-badges'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useQuery } from '@tanstack/react-query'
import { removePaymentFromCaches } from './payment-cache-utils'
import { toast } from '../ui/use-toast'

// Helper to map payment filters to badges
function getActivePaymentFilterBadges(
  filters: PaymentFilters,
  setFilters: (filters: PaymentFilters) => void,
  router: any,
  pathname: string,
  params: URLSearchParams,
  filterOptions?: { teams?: Array<{ id: number; name: string }> }
): { badges: Array<{ id: string; label: string; value: string; onRemove: () => void }>; onClearAll: () => void } {
  const badges: Array<{ id: string; label: string; value: string; onRemove: () => void }> = []
  
  // Helper function to get user-friendly labels
  const getLabel = (key: string, val: string): string => {
    if (!filterOptions) return val
    switch (key) {
      case 'payerTeam': {
        const team = filterOptions.teams?.find(t => String(t.id) === String(val))
        return team?.name || val
      }
      default:
        return val
    }
  }
  
  const updateUrl = (newFilters: PaymentFilters) => {
    const newParams = new URLSearchParams(params.toString())
    
    // Clear all filter params
    const filterKeys = ['search', 'currency', 'method', 'payerTeamId', 'dateFrom', 'dateTo']
    filterKeys.forEach((key: string) => newParams.delete(key))
    
    // Set new filter params
    if (newFilters.search) newParams.set('search', newFilters.search)
    if (newFilters.currency?.length) newParams.set('currency', newFilters.currency.join(','))
    if (newFilters.method?.length) newParams.set('method', newFilters.method.join(','))
    if (newFilters.payerTeamId) newParams.set('payerTeamId', String(newFilters.payerTeamId))
    if (newFilters.dateFrom) newParams.set('dateFrom', newFilters.dateFrom)
    if (newFilters.dateTo) newParams.set('dateTo', newFilters.dateTo)
    
    router.push(`${pathname}?${newParams.toString()}`)
    setFilters(newFilters)
  }

  // Search query
  if (filters.search) {
    badges.push({
      id: 'search',
      label: 'Search',
      value: filters.search,
      onRemove: () => {
        const newFilters = { ...filters, search: '' }
        updateUrl(newFilters)
      }
    })
  }

  // Currency filters
  if (filters.currency?.length) {
    filters.currency.forEach(currency => {
      badges.push({
        id: `currency-${currency}`,
        label: 'Currency',
        value: currency,
        onRemove: () => {
          const newFilters = { ...filters, currency: filters.currency.filter(c => c !== currency) }
          updateUrl(newFilters)
        }
      })
    })
  }

  // Method filters
  if (filters.method?.length) {
    filters.method.forEach(method => {
      badges.push({
        id: `method-${method}`,
        label: 'Method',
        value: method.charAt(0).toUpperCase() + method.slice(1),
        onRemove: () => {
          const newFilters = { ...filters, method: filters.method.filter(m => m !== method) }
          updateUrl(newFilters)
        }
      })
    })
  }

  // Payer Team filter
  if (filters.payerTeamId) {
    badges.push({
      id: 'payerTeam',
      label: 'Payer Team',
      value: getLabel('payerTeam', String(filters.payerTeamId)),
      onRemove: () => {
        const newFilters = { ...filters, payerTeamId: undefined }
        updateUrl(newFilters)
      }
    })
  }

  // Date range filters
  if (filters.dateFrom) {
    badges.push({
      id: 'date-from',
      label: 'Payment Date',
      value: `from ${new Date(filters.dateFrom).toLocaleDateString()}`,
      onRemove: () => {
        const newFilters = { ...filters, dateFrom: undefined }
        updateUrl(newFilters)
      }
    })
  }

  if (filters.dateTo) {
    badges.push({
      id: 'date-to',
      label: 'Payment Date',
      value: `to ${new Date(filters.dateTo).toLocaleDateString()}`,
      onRemove: () => {
        const newFilters = { ...filters, dateTo: undefined }
        updateUrl(newFilters)
      }
    })
  }

  // Function to clear all filters
  const onClearAll = () => {
    const emptyFilters: PaymentFilters = {
      search: '',
      currency: [],
      method: [],
      payerTeamId: undefined,
      dateFrom: undefined,
      dateTo: undefined
    }
    updateUrl(emptyFilters)
  }

  return { badges, onClearAll }
}

interface PaymentsListPageProps {
  searchValue?: string
  onSearchChange?: (value: string) => void
  onFilterClick?: () => void
  isFilterOpen?: boolean
  setIsFilterOpen?: (open: boolean) => void
}

export function PaymentsListPage({ 
  searchValue: layoutSearchValue, 
  onSearchChange: layoutOnSearchChange,
  onFilterClick: layoutOnFilterClick,
  isFilterOpen: layoutIsFilterOpen,
  setIsFilterOpen: layoutSetIsFilterOpen
}: PaymentsListPageProps = {}) {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const queryClient = useQueryClient()
  
  // State
  const [filters, setFilters] = useState<PaymentFilters>({
    search: '',
    currency: [],
    method: [],
    payerTeamId: undefined,
    dateFrom: undefined,
    dateTo: undefined,
  })
  const [sort, setSort] = useState<PaymentSortConfig>({
    field: 'payment_date',
    direction: 'desc',
  })
  const [selectedPayment, setSelectedPayment] = useState<PaymentSummary | null>(null)
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null)
  const [localIsFilterOpen, setLocalIsFilterOpen] = useState(false)
  const isFilterOpen = layoutIsFilterOpen !== undefined ? layoutIsFilterOpen : localIsFilterOpen
  const setIsFilterOpen = layoutSetIsFilterOpen || setLocalIsFilterOpen

  // Fetch teams for filter badges
  const supabase = createClientComponentClient()
  const { data: teams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('teams')
        .select('id, title')
        .order('title')
      if (error) throw error
      return data.map(team => ({ id: team.id, name: team.title }))
    },
    enabled: true,
  })
  const [isCreatePaymentOpen, setIsCreatePaymentOpen] = useState(false)
  const [isEditPaymentOpen, setIsEditPaymentOpen] = useState(false)
  const [isSelectInvoiceOpen, setIsSelectInvoiceOpen] = useState(false)
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false)
  
  // Use layout search value or fallback to local state
  const [localSearchInput, setLocalSearchInput] = useState('')
  const searchInput = layoutSearchValue !== undefined ? layoutSearchValue : localSearchInput
  const setSearchInput = layoutOnSearchChange || setLocalSearchInput
  
  // Debounced search for better performance
  const debouncedSearch = useDebounce(searchInput, 300)

  // Sync debounced search with filters and URL
  useEffect(() => {
    if (debouncedSearch !== filters.search) {
      handleFiltersChange({ ...filters, search: debouncedSearch })
    }
  }, [debouncedSearch])
  

  


  const handleCreateClick = () => {
    // Close any open payment details and open the payment creation pane
    setSelectedPayment(null)
    setIsCreatePaymentOpen(true)
  }

  const handleCopyLink = async () => {
    if (!selectedPayment) return
    try {
      const url = `${window.location.origin}/billing/payments?payment=${selectedPayment.payment_id}`
      await navigator.clipboard.writeText(url)
      toast({
        title: 'Link copied',
        description: 'Payment link has been copied to clipboard',
      })
    } catch (err) {
      console.error('Failed to copy link:', err)
      toast({
        title: 'Error',
        description: 'Failed to copy link',
        variant: 'destructive',
      })
    }
  }

  // Listen for the create button event from the layout
  useEffect(() => {
    const handleCreate = (event: CustomEvent) => {
      if (event.detail.pathname === '/billing/payments') {
        // Close any open payment details and open the payment creation pane
        setSelectedPayment(null)
        setIsCreatePaymentOpen(true)
      }
    }

    const handleFilterClick = (event: CustomEvent) => {
      if (event.detail.pathname === '/billing/payments') {
        setIsFilterOpen(true)
      }
    }

    const handleSearch = (event: CustomEvent) => {
      if (event.detail.pathname === '/billing/payments') {
        console.log('[PaymentsListPage] Received search event:', event.detail.value)
        setSearchInput(event.detail.value)
      }
    }

    const handlePaymentUpdated = (event: CustomEvent) => {
      console.log('[PaymentsListPage] Received payment update event:', event.detail)
      // Update the selected payment if it's the one being updated
      if (selectedPayment && selectedPayment.payment_id === event.detail.paymentId) {
        setSelectedPayment(event.detail.updatedPayment)
      }
      // The optimistic update should already be handled by updatePaymentInCaches
      // But we can also trigger a refetch to ensure consistency
      queryClient.invalidateQueries({ 
        predicate: (query) => 
          Array.isArray(query.queryKey) && 
          (query.queryKey[0] === 'v_client_payments_summary' || 
           query.queryKey.includes('v_client_payments_summary'))
      })
    }

    window.addEventListener('billing:create', handleCreate as EventListener)
    window.addEventListener('billing:filter-click', handleFilterClick as EventListener)
    window.addEventListener('billing:search', handleSearch as EventListener)
    window.addEventListener('paymentUpdated', handlePaymentUpdated as EventListener)
    return () => {
      window.removeEventListener('billing:create', handleCreate as EventListener)
      window.removeEventListener('billing:filter-click', handleFilterClick as EventListener)
      window.removeEventListener('billing:search', handleSearch as EventListener)
      window.removeEventListener('paymentUpdated', handlePaymentUpdated as EventListener)
    }
  }, [])

  // Hydrate from URL on mount
  useEffect(() => {
    const urlFilters = parsePaymentFiltersFromUrl(new URLSearchParams(params.toString()))
    const urlSort = parsePaymentSortFromUrl(new URLSearchParams(params.toString()))
    
    setFilters(urlFilters)
    setSearchInput(urlFilters.search)
    setSort(urlSort)
    
    // Sync with layout search value if available
    if (layoutOnSearchChange && urlFilters.search) {
      layoutOnSearchChange(urlFilters.search)
    }
    
    // Check for selected payment in URL
    const paymentId = params.get('payment')
    if (paymentId) {
      // Try to get the payment from the store first (using payment_id as the key)
      const paymentFromStore = getItemFromStore('v_client_payments_summary', undefined, parseInt(paymentId)) as PaymentSummary | null
      if (paymentFromStore) {
        setSelectedPayment(paymentFromStore)
      }
    }

    // Check for selected invoice in URL
    const invoiceId = params.get('invoice')
    if (invoiceId) {
      setSelectedInvoice({ id: parseInt(invoiceId) })
    }
  }, [params])

  // Prevent hydration mismatch by not rendering until client-side
  const [isClient, setIsClient] = useState(false)
  useEffect(() => {
    setIsClient(true)
  }, [])

  if (!isClient) {
    return null
  }

  // Update URL when filters or sort change
  const updateUrl = (newFilters: PaymentFilters, newSort: PaymentSortConfig, selectedPaymentId?: number) => {
    const newParams = new URLSearchParams()
    
    // Update search
    if (newFilters.search) {
      newParams.set('q', newFilters.search)
    }
    
    // Update currency filter
    if (newFilters.currency.length > 0) {
      newParams.set('currency', newFilters.currency.join(','))
    }
    
    // Update method filter
    if (newFilters.method.length > 0) {
      newParams.set('method', newFilters.method.join(','))
    }
    
    // Update payer team filter
    if (newFilters.payerTeamId) {
      newParams.set('payerTeamId', newFilters.payerTeamId.toString())
    }
    
    // Update date filters
    if (newFilters.dateFrom) {
      newParams.set('from', newFilters.dateFrom)
    }
    if (newFilters.dateTo) {
      newParams.set('to', newFilters.dateTo)
    }
    
    // Update sort
    newParams.set('sort', newSort.field)
    newParams.set('dir', newSort.direction)
    
    // Update selected payment
    if (selectedPaymentId) {
      newParams.set('payment', selectedPaymentId.toString())
    }
    
    // Use replaceState to update URL without triggering server calls
    const newUrl = `${pathname}?${newParams.toString()}`
    window.history.replaceState({}, '', newUrl)
  }

  const handleFiltersChange = (newFilters: PaymentFilters) => {
    setFilters(newFilters)
    updateUrl(newFilters, sort)
  }

  const handleSortChange = (newSort: PaymentSortConfig) => {
    setSort(newSort)
    updateUrl(filters, newSort)
  }

  const handlePaymentSelect = (payment: PaymentSummary) => {
    setSelectedPayment(payment)
    updateUrl(filters, sort, payment.payment_id)
  }

  const handleCloseDrawer = () => {
    setSelectedPayment(null)
    updateUrl(filters, sort)
  }

  const handlePaymentCreated = (paymentId: number) => {
    // Invalidate queries to refresh the payments list
    queryClient.invalidateQueries({ 
      predicate: (query) => 
        Array.isArray(query.queryKey) && 
        (query.queryKey[0] === 'v_client_payments_summary' || 
         query.queryKey.includes('v_client_payments_summary'))
    })
  }

  const handleOpenInvoice = async (invoiceId: number) => {
    // Set the selected invoice (IssuedInvoiceDetail will handle fetching the data)
    setSelectedInvoice({ id: invoiceId })
    
    // Update URL to include the invoice parameter
    const newParams = new URLSearchParams(params.toString())
    newParams.set('invoice', invoiceId.toString())
    router.replace(`${pathname}?${newParams.toString()}`, { scroll: false })
  }

  const handleCloseInvoice = () => {
    setSelectedInvoice(null)
    // Remove invoice parameter from URL
    const newParams = new URLSearchParams(params.toString())
    newParams.delete('invoice')
    router.replace(`${pathname}?${newParams.toString()}`, { scroll: false })
  }

  const handlePaymentUpdate = (updatedPayment: PaymentSummary) => {
    // Update the selected payment in the list
    setSelectedPayment(updatedPayment)
    
    // Emit an event to update the list
    window.dispatchEvent(new CustomEvent('paymentUpdated', {
              detail: { paymentId: updatedPayment.payment_id, updatedPayment }
    }))
  }

  const handlePaymentDelete = async (paymentId: number) => {
    try {
      // Close the payment details pane first (so user doesn't see the payment anymore)
      setSelectedPayment(null)
      
      // Optimistically remove from caches (so it disappears from the list)
      removePaymentFromCaches(queryClient, paymentId)
      
      // Make the API call to delete the payment
      const { error } = await deletePayment(paymentId)
      
      if (error) {
        throw error
      }
      
      // Show success message
      toast({
        title: 'Success',
        description: 'Payment deleted successfully',
      })
      
      // Emit an event to remove from the list (for any other components listening)
      window.dispatchEvent(new CustomEvent('paymentDeleted', {
        detail: { paymentId }
      }))
      
    } catch (error) {
      console.error('Failed to delete payment:', error)
      
      // Show error message
      toast({
        title: 'Error',
        description: 'Failed to delete payment',
        variant: 'destructive',
      })
      
      // Note: We don't need to rollback the optimistic update here because
      // the cache removal was already done and the user expects the payment to be gone
      // If there's an error, we'll let the next data fetch refresh the list
    }
  }

  const getActiveFilterCount = () => {
    let count = 0
    if (debouncedSearch) count++
    if (filters.currency.length > 0) count++
    if (filters.method.length > 0) count++
    if (filters.payerTeamId) count++
    if (filters.dateFrom || filters.dateTo) count++
    return count
  }

  return (
    <div className="flex flex-col h-full">
      {/* Billing Navigation */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <nav className="flex space-x-1">
            <Link
              href="/billing/invoices"
              className="px-3 py-2 text-sm font-medium transition-colors border-b-2 text-gray-500 hover:text-gray-700 border-transparent hover:border-gray-300"
            >
              Invoices
            </Link>
            <Link
              href="/billing/invoice-orders"
              className="px-3 py-2 text-sm font-medium transition-colors border-b-2 text-gray-500 hover:text-gray-700 border-transparent hover:border-gray-300"
            >
              Invoice Orders
            </Link>
            <Link
              href="/billing/payments"
              className="px-3 py-2 text-sm font-medium transition-colors border-b-2 text-gray-900 border-gray-900"
            >
              Payments
            </Link>
            <Link
              href="/billing/credit-notes"
              className="px-3 py-2 text-sm font-medium transition-colors border-b-2 text-gray-500 hover:text-gray-700 border-transparent hover:border-gray-300"
            >
              Credit Notes
            </Link>
          </nav>
          <Button onClick={handleCreateClick} className="bg-black text-white hover:bg-gray-800">
            <Plus className="w-4 h-4 mr-2" />
            Add
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 transition-all duration-200">
        {/* Active Filter Badges */}
        {(() => {
          const filterOptions = { teams }
          const { badges, onClearAll } = getActivePaymentFilterBadges(filters, setFilters, router, pathname, new URLSearchParams(params.toString()), filterOptions)
          return (
            <FilterBadges
              badges={badges}
              onClearAll={onClearAll}
              className="mt-2 mb-2"
            />
          )
        })()}

        {/* List */}
        <div className="flex-1 min-h-0">
          <PaymentsList
            filters={{ ...filters, search: debouncedSearch }}
            sort={sort}
            onSortChange={handleSortChange}
            onPaymentSelect={handlePaymentSelect}
            selectedPayment={selectedPayment}
            hasRightPaneOpen={!!selectedPayment}
          />
        </div>

        {/* Right pane - Payment Detail */}
        {selectedPayment && !isCreatePaymentOpen && (
          <div 
            className="fixed top-0 w-96 bg-white border-l border-gray-200 flex flex-col h-screen z-40 shadow-lg pointer-events-auto"
            style={{ right: selectedInvoice ? '384px' : '0px' }}
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-semibold text-gray-900 truncate">
                  Payment #{selectedPayment.payment_id}
                </h2>
              </div>
              <div className="flex items-center space-x-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={handleCopyLink}>
                      <Copy className="w-4 h-4 mr-2" />
                      Copy link
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setIsEditPaymentOpen(true)}>
                      <Edit className="w-4 h-4 mr-2" />
                      Edit Payment
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setIsSelectInvoiceOpen(true)}>
                      <Plus className="w-4 h-4 mr-2" />
                      Select Invoice
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setShowDeleteConfirmation(true)} className="text-red-600">
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete Payment
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button variant="ghost" size="sm" onClick={handleCloseDrawer}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-auto">
              <PaymentDetailsPane
                paymentId={selectedPayment.payment_id}
                initialPayment={selectedPayment}
                onClose={handleCloseDrawer}
                onPaymentUpdate={handlePaymentUpdate}
                onPaymentDelete={handlePaymentDelete}
                onOpenInvoice={handleOpenInvoice}
              />
            </div>
          </div>
        )}

        {/* Third pane - Invoice Detail */}
        {selectedInvoice && (
          <div className="fixed top-0 right-0 w-96 bg-white border-l border-gray-200 flex flex-col h-screen z-50 shadow-lg">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-semibold text-gray-900 truncate">
                  Invoice #{selectedInvoice.id}
                </h2>
              </div>
              <Button variant="ghost" size="sm" onClick={handleCloseInvoice}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex-1 overflow-auto">
              <IssuedInvoiceDetail id={selectedInvoice.id} isPane={true} />
            </div>
          </div>
        )}
      </div>

      {/* Filters Panel */}
      <PaymentsFilters
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        filters={filters}
        onFiltersChange={handleFiltersChange}
      />

      {/* Payment Create Modal */}
      <PaymentCreateModal
        isOpen={isCreatePaymentOpen}
        onClose={() => setIsCreatePaymentOpen(false)}
        onPaymentCreated={(paymentId, updatedPayment) => {
          setIsCreatePaymentOpen(false)
          handlePaymentCreated(paymentId)
        }}
        sortConfig={sort}
      />

      {/* Edit Payment Modal */}
      <PaymentCreateModal
        isOpen={isEditPaymentOpen}
        onClose={() => setIsEditPaymentOpen(false)}
        onPaymentCreated={(paymentId, updatedPayment) => {
          setIsEditPaymentOpen(false)
          handlePaymentUpdate(selectedPayment!)
        }}
        initialStep={1}
        editingPayment={selectedPayment}
        sortConfig={sort}
      />

      {/* Select Invoice Modal */}
      <PaymentCreateModal
        isOpen={isSelectInvoiceOpen}
        onClose={() => setIsSelectInvoiceOpen(false)}
        onPaymentCreated={(paymentId, updatedPayment) => {
          setIsSelectInvoiceOpen(false)
          handlePaymentUpdate(selectedPayment!)
        }}
        initialStep={2}
        editingPayment={selectedPayment}
        sortConfig={sort}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteConfirmation} onOpenChange={setShowDeleteConfirmation}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Payment</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete Payment #{selectedPayment?.payment_id}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirmation(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => {
                if (selectedPayment) {
                  handlePaymentDelete(selectedPayment.payment_id)
                  setShowDeleteConfirmation(false)
                }
              }}
            >
              Delete Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
} 
 
 
 















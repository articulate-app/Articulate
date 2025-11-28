"use client"

import React, { useState, useEffect } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { MoreHorizontal, X } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu'
import { SupplierPaymentsTable } from './SupplierPaymentsTable'
import { Button } from '../ui/button'
import { SearchFilterBar } from '../ui/search-filter-bar'
import { parseSupplierPaymentFiltersFromUrl, parseSupplierPaymentSortFromUrl } from '../../lib/services/expenses'
import { getItemFromStore } from '../../../hooks/use-infinite-query'
import { useDebounce } from '../../hooks/use-debounce'
import { useQueryClient, useMutation } from '@tanstack/react-query'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { toast } from '../ui/use-toast'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog'
import { SupplierPaymentCreateModal } from './SupplierPaymentCreateModal'
import { SupplierPaymentDetailsPane } from './SupplierPaymentDetailsPane'
import { SupplierInvoiceDetailsPane } from './SupplierInvoiceDetailsPane'
import { addSupplierPaymentToAllCaches, removeSupplierPaymentFromAllCaches } from './supplier-payment-cache-utils'
import type { SupplierPaymentFilters, SupplierPaymentSortConfig, SupplierPaymentList } from '../../lib/types/expenses'

export function SupplierPaymentsListPage() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const queryClient = useQueryClient()
  const supabase = createClientComponentClient()
  
  // State for selected payment and filters
  const [selectedPayment, setSelectedPayment] = useState<any>(null)
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isDeleteConfirmationOpen, setIsDeleteConfirmationOpen] = useState(false)
  const [filters, setFilters] = useState<SupplierPaymentFilters>({
    q: '',
    payment_currency: [],
    method: [],
    status: [],
    paid_to_team_id: [],
    period: {},
  })
  const [sort, setSort] = useState<SupplierPaymentSortConfig>({ field: 'payment_date', direction: 'desc' })
  
  // Separate search input state to avoid immediate URL updates
  const [searchInput, setSearchInput] = useState('')
  
  // Debounced search for better performance
  const debouncedSearch = useDebounce(searchInput, 300)

  // Listen for the create button event from the layout
  useEffect(() => {
    const handleCreate = (event: CustomEvent) => {
      if (event.detail.pathname === '/expenses/supplier-payments') {
        setIsCreateModalOpen(true)
      }
    }

    window.addEventListener('expenses:create', handleCreate as EventListener)
    return () => window.removeEventListener('expenses:create', handleCreate as EventListener)
  }, [])

  // Hydrate from URL on mount
  useEffect(() => {
    const urlFilters = parseSupplierPaymentFiltersFromUrl(new URLSearchParams(params.toString()))
    const urlSort = parseSupplierPaymentSortFromUrl(new URLSearchParams(params.toString()))
    
    setFilters(urlFilters)
    setSearchInput(urlFilters.q)
    setSort(urlSort)
    
    // Check for selected payment in URL
    const paymentId = params.get('payment')
    if (paymentId) {
      // Try to get the payment from the store first
      const paymentFromStore = getItemFromStore('v_supplier_payments_summary', undefined, parseInt(paymentId)) as SupplierPaymentList | null
      if (paymentFromStore) {
        setSelectedPayment(paymentFromStore)
      } else {
        // If not in store, we'll need to wait for the data to load
        // The payment will be set when the user clicks on it
      }
    }

    // Check for selected invoice in URL
    const invoiceId = params.get('invoice')
    if (invoiceId) {
      setSelectedInvoice({ id: parseInt(invoiceId) })
    }
  }, [params])


  // Update URL when filters or sort change
  const updateUrl = (newFilters: SupplierPaymentFilters, newSort: SupplierPaymentSortConfig, selectedPaymentId?: number) => {
    const newParams = new URLSearchParams()
    
    // Update search
    if (newFilters.q) {
      newParams.set('q', newFilters.q)
    }
    
    // Update currency filter
    if (newFilters.payment_currency.length > 0) {
      newParams.set('currency', newFilters.payment_currency.join(','))
    }
    
    // Update method filter
    if (newFilters.method.length > 0) {
      newParams.set('method', newFilters.method.join(','))
    }
    
    // Update status filter
    if (newFilters.status.length > 0) {
      newParams.set('status', newFilters.status.join(','))
    }
    
    // Update supplier filter
    if (newFilters.paid_to_team_id.length > 0) {
      newParams.set('paidToTeamId', newFilters.paid_to_team_id.join(','))
    }
    
    // Update period filters
    if (newFilters.period.from) {
      newParams.set('from', newFilters.period.from.toISOString().split('T')[0])
    }
    if (newFilters.period.to) {
      newParams.set('to', newFilters.period.to.toISOString().split('T')[0])
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

  const handleFiltersChange = (newFilters: SupplierPaymentFilters) => {
    setFilters(newFilters)
    updateUrl(newFilters, sort)
  }

  const handleSortChange = (newSort: SupplierPaymentSortConfig) => {
    setSort(newSort)
    updateUrl(filters, newSort)
  }

  const handlePaymentSelect = (payment: SupplierPaymentList) => {
    setSelectedPayment(payment)
    updateUrl(filters, sort, payment.payment_id)
  }

  const handleCloseDrawer = () => {
    setSelectedPayment(null)
    updateUrl(filters, sort)
  }

  const handleOpenInvoice = (invoiceId: number) => {
    // Set the selected invoice (SupplierInvoiceDetailsPane will handle fetching the data)
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


  // Delete payment mutation with optimistic updates
  const deletePaymentMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPayment?.payment_id) throw new Error('No payment ID provided')
      
      // Optimistically remove from caches first
      removeSupplierPaymentFromAllCaches(queryClient, selectedPayment.payment_id)
      
      const { error } = await supabase
        .from('supplier_payments')
        .delete()
        .eq('id', selectedPayment.payment_id)
      
      if (error) throw error
      return { success: true }
    },
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Payment deleted successfully',
      })
      // Close the details pane
      setSelectedPayment(null)
      setIsDeleteConfirmationOpen(false)
    },
    onError: (err: any) => {
      toast({
        title: 'Error',
        description: err.message || 'Failed to delete payment',
        variant: 'destructive',
      })
    }
  })

  const handleDeletePayment = () => {
    setIsDeleteConfirmationOpen(true)
  }

  const getActiveFilterCount = () => {
    let count = 0
    if (debouncedSearch) count++
    if (filters.payment_currency.length > 0) count++
    if (filters.method.length > 0) count++
    if (filters.status.length > 0) count++
    if (filters.paid_to_team_id.length > 0) count++
    if (filters.period.from || filters.period.to) count++
    return count
  }

  return (
    <div className="flex h-screen bg-white">
      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Search and Filter Bar */}
        <SearchFilterBar
          searchValue={searchInput}
          onSearchChange={(value) => {
            setSearchInput(value)
            // Update filters for URL, but don't trigger immediate query
            handleFiltersChange({ ...filters, q: value })
          }}
          onFilterClick={() => console.log('Filter clicked')}
          activeFilterCount={getActiveFilterCount()}
          searchPlaceholder="Search external reference..."
        />

        {/* Table */}
        <div className="flex-1 overflow-hidden">
          <SupplierPaymentsTable
            filters={{ ...filters, q: debouncedSearch }}
            sort={sort}
            onSortChange={handleSortChange}
            onPaymentSelect={handlePaymentSelect}
            selectedPayment={selectedPayment}
          />
        </div>
      </div>

      {/* Right pane - Payment Detail */}
      {selectedPayment && (
        <div 
          className="fixed top-0 bg-white border-l border-gray-200 flex flex-col h-full z-40 shadow-lg transition-all duration-200 w-96"
          style={{ right: selectedInvoice ? '384px' : '0px' }}
        >
          <div className="flex items-center justify-between p-4 border-b border-gray-200 flex-shrink-0">
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold text-gray-900 truncate">
                Payment #{selectedPayment.payment_id}
              </h2>
              <p className="text-sm text-gray-500 truncate">
                {selectedPayment.status}
              </p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0">
                  <span className="sr-only">Open menu</span>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setIsEditModalOpen(true)}>
                  Edit payment
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => console.log('Add allocation')}>
                  Add allocation
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={handleDeletePayment}
                  className="text-red-600 focus:text-red-600"
                >
                  Delete payment
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="sm" onClick={handleCloseDrawer}>
              <X className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex-1 overflow-auto min-h-0">
            <SupplierPaymentDetailsPane
              paymentId={selectedPayment.payment_id}
              onClose={handleCloseDrawer}
              onPaymentUpdate={(payment) => {
                setSelectedPayment(payment)
              }}
              initialPayment={selectedPayment}
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
            <SupplierInvoiceDetailsPane
              invoiceId={selectedInvoice.id}
              onClose={handleCloseInvoice}
              onInvoiceUpdate={(invoice) => {
                // Update the selected invoice if needed
                setSelectedInvoice(invoice)
              }}
            />
          </div>
        </div>
      )}

      {/* Create Payment Modal */}
      <SupplierPaymentCreateModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onPaymentCreated={(paymentId) => {
          // Refresh the payments list
          window.location.reload()
        }}
      />

      {/* Edit Payment Modal */}
      <SupplierPaymentCreateModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onPaymentCreated={(paymentId) => {
          // Refresh the payments list and update selected payment
          window.location.reload()
        }}
        editingPayment={selectedPayment}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteConfirmationOpen} onOpenChange={setIsDeleteConfirmationOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Payment</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this payment? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteConfirmationOpen(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => deletePaymentMutation.mutate()}
              disabled={deletePaymentMutation.isPending}
            >
              {deletePaymentMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
} 
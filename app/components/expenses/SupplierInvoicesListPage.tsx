"use client"

import React, { useState, useEffect } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { MoreHorizontal, X, Trash2, Copy } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu'
import { SupplierInvoicesTable } from './SupplierInvoicesTable'
import { SupplierInvoicesFilters } from './SupplierInvoicesFilters'
import { Button } from '../ui/button'
import { SearchFilterBar } from '../ui/search-filter-bar'
import { parseSupplierInvoiceFiltersFromUrl, parseSupplierInvoiceSortFromUrl, getSupplierInvoiceDetails } from '../../lib/services/expenses'
import { getItemFromStore } from '../../../hooks/use-infinite-query'
import { useDebounce } from '../../hooks/use-debounce'
import { SupplierInvoiceDetailsPane } from './SupplierInvoiceDetailsPane'
import { SupplierInvoiceCreateModal } from './SupplierInvoiceCreateModal'
import { addSupplierInvoiceToAllCaches, removeSupplierInvoiceFromAllCaches } from './supplier-invoice-cache-utils'
import { useQueryClient, useMutation } from '@tanstack/react-query'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { toast } from '../ui/use-toast'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog'
import type { SupplierInvoiceFilters, SupplierInvoiceSortConfig, SupplierInvoiceList } from '../../lib/types/expenses'

export function SupplierInvoicesListPage() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const queryClient = useQueryClient()
  const supabase = createClientComponentClient()
  
  // State for selected invoice and filters
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isDeleteConfirmationOpen, setIsDeleteConfirmationOpen] = useState(false)
  const [filters, setFilters] = useState<SupplierInvoiceFilters>({
    q: '',
    status: [],
    currency_code: [],
    issuer_team_id: [],
    period: {},
  })
  const [sort, setSort] = useState<SupplierInvoiceSortConfig>({ field: 'invoice_date', direction: 'desc' })
  
  // Separate search input state to avoid immediate URL updates
  const [searchInput, setSearchInput] = useState('')
  
  // Debounced search for better performance
  const debouncedSearch = useDebounce(searchInput, 300)

  // Delete invoice mutation with optimistic updates
  const deleteInvoiceMutation = useMutation({
    mutationFn: async () => {
      if (!selectedInvoice?.id) throw new Error('No invoice ID provided')
      
      // Optimistically remove from caches first
      removeSupplierInvoiceFromAllCaches(queryClient, selectedInvoice.id)
      
      const { error } = await supabase
        .from('received_supplier_invoices')
        .delete()
        .eq('id', selectedInvoice.id)
      
      if (error) throw error
      return { success: true }
    },
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Supplier invoice deleted successfully',
      })
      // Close the details pane
      setSelectedInvoice(null)
      setIsDeleteConfirmationOpen(false)
    },
    onError: (err: any) => {
      toast({
        title: 'Error',
        description: err.message || 'Failed to delete supplier invoice',
        variant: 'destructive',
      })
    }
  })

  // Listen for the create button event from the layout
  useEffect(() => {
    const handleCreate = (event: CustomEvent) => {
      if (event.detail.pathname === '/expenses/supplier-invoices') {
        setIsCreateModalOpen(true)
      }
    }

    window.addEventListener('expenses:create', handleCreate as EventListener)
    return () => window.removeEventListener('expenses:create', handleCreate as EventListener)
  }, [])

  // Hydrate from URL on mount
  useEffect(() => {
    const urlFilters = parseSupplierInvoiceFiltersFromUrl(new URLSearchParams(params.toString()))
    const urlSort = parseSupplierInvoiceSortFromUrl(new URLSearchParams(params.toString()))
    
    setFilters(urlFilters)
    setSearchInput(urlFilters.q)
    setSort(urlSort)
    
    // Check for selected invoice in URL
    const invoiceId = params.get('invoice')
    if (invoiceId) {
      // Try to get the invoice from the store first
      const invoiceFromStore = getItemFromStore('v_received_invoices_list', undefined, parseInt(invoiceId)) as SupplierInvoiceList | null
      if (invoiceFromStore) {
        setSelectedInvoice(invoiceFromStore)
      } else {
        // If not in store, we'll need to wait for the data to load
        // The invoice will be set when the user clicks on it
      }
    }
  }, [params])

  // Prevent hydration mismatch by not rendering until client-side
  const [isClient, setIsClient] = useState(false)
  useEffect(() => {
    setIsClient(true)
  }, [])

  if (!isClient) {
    return (
      <div className="flex h-screen bg-white">
        <div className="flex-1 flex flex-col min-w-0">
          <div className="bg-white border-b border-gray-200 px-6 py-4">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-semibold text-gray-900">Supplier Invoices</h1>
              <div className="w-20 h-8 bg-gray-200 animate-pulse rounded"></div>
            </div>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <div className="text-gray-500">Loading...</div>
          </div>
        </div>
      </div>
    )
  }

  // Update URL when filters or sort change
  const updateUrl = (newFilters: SupplierInvoiceFilters, newSort: SupplierInvoiceSortConfig, selectedInvoiceId?: number) => {
    const newParams = new URLSearchParams()
    
    // Update search
    if (newFilters.q) {
      newParams.set('q', newFilters.q)
    }
    
    // Update status filter
    if (newFilters.status.length > 0) {
      newParams.set('status', newFilters.status.join(','))
    }
    
    // Update currency filter
    if (newFilters.currency_code.length > 0) {
      newParams.set('currency', newFilters.currency_code.join(','))
    }
    
    // Update issuer team filter
    if (newFilters.issuer_team_id.length > 0) {
      newParams.set('issuerTeamId', newFilters.issuer_team_id.join(','))
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
    
    // Update selected invoice
    if (selectedInvoiceId) {
      newParams.set('invoice', selectedInvoiceId.toString())
    }
    
    // Use replaceState to update URL without triggering server calls
    const newUrl = `${pathname}?${newParams.toString()}`
    window.history.replaceState({}, '', newUrl)
  }

  const handleFiltersChange = (newFilters: SupplierInvoiceFilters) => {
    setFilters(newFilters)
    updateUrl(newFilters, sort)
  }

  const handleSortChange = (newSort: SupplierInvoiceSortConfig) => {
    setSort(newSort)
    updateUrl(filters, newSort)
  }

  const handleInvoiceSelect = (invoice: SupplierInvoiceList) => {
    setSelectedInvoice(invoice)
    updateUrl(filters, sort, invoice.id)
  }

  const handleCloseDrawer = () => {
    setSelectedInvoice(null)
    updateUrl(filters, sort)
  }

  // Optimistic update function for supplier invoice list using TaskList pattern
  const optimisticallyAddSupplierInvoice = async (invoiceId: number) => {
    try {
      const { data: newInvoice, error } = await getSupplierInvoiceDetails(invoiceId)
      if (error) throw error
      
      console.log('Fetched new supplier invoice for optimistic update:', newInvoice)
      
      // Use the same pattern as TaskList - update InfiniteList stores directly with sort config
      addSupplierInvoiceToAllCaches(queryClient, newInvoice, sort)
      
    } catch (error) {
      console.error('Failed to optimistically update supplier invoice list:', error)
      // If optimistic update fails, just invalidate all queries
      queryClient.invalidateQueries({
        predicate: (query) =>
          Array.isArray(query.queryKey) && 
          (query.queryKey[0] === 'v_received_invoices_list' || 
           (typeof query.queryKey[0] === 'string' && query.queryKey[0].startsWith('supplier-invoices-')))
      })
    }
  }

  const handleCreateSuccess = (invoiceId: number) => {
    console.log('Supplier invoice created successfully:', invoiceId)
    // Optimistically update the invoice list
    optimisticallyAddSupplierInvoice(invoiceId)
  }


  const handleCopyLink = async () => {
    try {
      const url = `${window.location.origin}/expenses/supplier-invoices?invoice=${selectedInvoice.id}`
      await navigator.clipboard.writeText(url)
      toast({
        title: 'Success',
        description: 'Link copied to clipboard',
      })
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to copy link',
        variant: 'destructive',
      })
    }
  }

  const getActiveFilterCount = () => {
    let count = 0
    if (debouncedSearch) count++
    if (filters.status.length > 0) count++
    if (filters.currency_code.length > 0) count++
    if (filters.issuer_team_id.length > 0) count++
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
          onFilterClick={() => setIsFilterOpen(true)}
          activeFilterCount={getActiveFilterCount()}
          searchPlaceholder="Search invoice number..."
        />

        {/* Table */}
        <div className="flex-1 overflow-hidden">
          <SupplierInvoicesTable
            filters={{ ...filters, q: debouncedSearch }}
            sort={sort}
            onSortChange={handleSortChange}
            onInvoiceSelect={handleInvoiceSelect}
            selectedInvoice={selectedInvoice}
          />
        </div>
      </div>

      {/* Right pane - Invoice Detail */}
      {selectedInvoice && (
        <div className="fixed top-0 bg-white border-l border-gray-200 flex flex-col h-full z-40 shadow-lg transition-all duration-200 right-0 w-96">
          <div className="flex items-center justify-between p-4 border-b border-gray-200 flex-shrink-0">
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold text-gray-900 truncate">
                Invoice #{selectedInvoice.invoice_number}
              </h2>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0">
                  <span className="sr-only">Open menu</span>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleCopyLink}>
                  <Copy className="w-4 h-4 mr-2" />
                  Copy link
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => console.log('Add payment')}>
                  Add payment
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => console.log('Add credit note')}>
                  Add credit note
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => console.log('Edit invoice')}>
                  Edit invoice
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => setIsDeleteConfirmationOpen(true)}
                  className="text-red-600 focus:text-red-600"
                  disabled={deleteInvoiceMutation.isPending}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete invoice
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="sm" onClick={handleCloseDrawer}>
              <X className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex-1 overflow-auto min-h-0">
            <SupplierInvoiceDetailsPane 
              invoiceId={selectedInvoice.id} 
              onClose={handleCloseDrawer}
              onInvoiceUpdate={(updatedInvoice) => {
                setSelectedInvoice(updatedInvoice)
              }}
              initialInvoice={selectedInvoice}
            />
          </div>
        </div>
      )}

      {/* Filters Panel */}
      <SupplierInvoicesFilters
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        filters={filters}
        onFiltersChange={handleFiltersChange}
      />

      {/* Create Invoice Modal */}
      <SupplierInvoiceCreateModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={handleCreateSuccess}
        sortConfig={sort}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteConfirmationOpen} onOpenChange={setIsDeleteConfirmationOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Supplier Invoice</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this supplier invoice? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteConfirmationOpen(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => deleteInvoiceMutation.mutate()}
              disabled={deleteInvoiceMutation.isPending}
            >
              {deleteInvoiceMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
} 
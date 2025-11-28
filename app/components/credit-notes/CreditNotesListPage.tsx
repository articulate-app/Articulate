"use client"

import React, { useState, useEffect } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { X, MoreHorizontal, Edit, AlertTriangle, Trash2, Plus, Copy } from 'lucide-react'
import { CreditNotesList } from './CreditNotesList'
import { CreditNotesFilters } from './CreditNotesFilters'
import { CreditNoteDetailsPane } from './CreditNoteDetailsPane'
import { CreditNoteCreateModal } from './CreditNoteCreateModal'
import { Button } from '../ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../ui/dialog'
import { parseCreditNoteFiltersFromUrl, parseCreditNoteSortFromUrl, deleteCreditNote } from '../../lib/creditNotes'
import { useDebounce } from '../../hooks/use-debounce'
import { useQueryClient, useMutation } from '@tanstack/react-query'
import { removeCreditNoteFromCaches, addCreditNoteToCaches } from './credit-note-cache-utils'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { toast } from '../ui/use-toast'
import type { CreditNoteFilters, CreditNoteSortConfig, CreditNoteSummary } from '../../lib/types/billing'
import IssuedInvoiceDetail from '../billing/IssuedInvoiceDetail'
import { FilterBadges } from '../../../components/ui/filter-badges'

// Helper to map credit note filters to badges
function getActiveCreditNoteFilterBadges(
  filters: CreditNoteFilters,
  setFilters: (filters: CreditNoteFilters) => void,
  router: any,
  pathname: string,
  params: URLSearchParams
): { badges: Array<{ id: string; label: string; value: string; onRemove: () => void }>; onClearAll: () => void } {
  const badges: Array<{ id: string; label: string; value: string; onRemove: () => void }> = []
  
  const updateUrl = (newFilters: CreditNoteFilters) => {
    const newParams = new URLSearchParams(params.toString())
    
    // Clear all filter params
    const filterKeys = ['search', 'dateFrom', 'dateTo', 'currency', 'status']
    filterKeys.forEach((key: string) => newParams.delete(key))
    
    // Set new filter params
    if (newFilters.search) newParams.set('search', newFilters.search)
    if (newFilters.dateFrom) newParams.set('dateFrom', newFilters.dateFrom)
    if (newFilters.dateTo) newParams.set('dateTo', newFilters.dateTo)
    if (newFilters.currency?.length) newParams.set('currency', newFilters.currency.join(','))
    if (newFilters.status?.length) newParams.set('status', newFilters.status.join(','))
    
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

  // Status filters
  if (filters.status?.length) {
    filters.status.forEach(status => {
      badges.push({
        id: `status-${status}`,
        label: 'Status',
        value: status.charAt(0).toUpperCase() + status.slice(1),
        onRemove: () => {
          const newFilters = { ...filters, status: filters.status.filter(s => s !== status) }
          updateUrl(newFilters)
        }
      })
    })
  }

  // Date range filters
  if (filters.dateFrom) {
    badges.push({
      id: 'date-from',
      label: 'Credit Date',
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
      label: 'Credit Date',
      value: `to ${new Date(filters.dateTo).toLocaleDateString()}`,
      onRemove: () => {
        const newFilters = { ...filters, dateTo: undefined }
        updateUrl(newFilters)
      }
    })
  }

  // Function to clear all filters
  const onClearAll = () => {
    const emptyFilters: CreditNoteFilters = {
      search: '',
      currency: [],
      status: [],
      dateFrom: undefined,
      dateTo: undefined
    }
    updateUrl(emptyFilters)
  }

  return { badges, onClearAll }
}

interface CreditNotesListPageProps {
  searchValue?: string
  onSearchChange?: (value: string) => void
  onFilterClick?: () => void
  isFilterOpen?: boolean
  setIsFilterOpen?: (open: boolean) => void
}

export function CreditNotesListPage({ 
  searchValue: layoutSearchValue, 
  onSearchChange: layoutOnSearchChange,
  onFilterClick: layoutOnFilterClick,
  isFilterOpen: layoutIsFilterOpen,
  setIsFilterOpen: layoutSetIsFilterOpen
}: CreditNotesListPageProps = {}) {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const queryClient = useQueryClient()
  const supabase = createClientComponentClient()
  
  // State
  const [filters, setFilters] = useState<CreditNoteFilters>({
    search: '',
    currency: [],
    status: [],
    dateFrom: undefined,
    dateTo: undefined,
  })
  const [sort, setSort] = useState<CreditNoteSortConfig>({
    field: 'credit_date',
    direction: 'desc',
  })
  const [selectedCreditNote, setSelectedCreditNote] = useState<CreditNoteSummary | null>(null)
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null)
  const [localIsFilterOpen, setLocalIsFilterOpen] = useState(false)
  const isFilterOpen = layoutIsFilterOpen !== undefined ? layoutIsFilterOpen : localIsFilterOpen
  const setIsFilterOpen = layoutSetIsFilterOpen || setLocalIsFilterOpen
  const [isCreateCreditNoteOpen, setIsCreateCreditNoteOpen] = useState(false)
  const [isEditCreditNoteOpen, setIsEditCreditNoteOpen] = useState(false)
  const [isEditingCreditNote, setIsEditingCreditNote] = useState(false)
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
    // Close any open credit note details and open the credit note creation modal
    setSelectedCreditNote(null)
    setIsCreateCreditNoteOpen(true)
  }

  const handleCopyLink = async () => {
    if (!selectedCreditNote) return
    try {
      const url = `${window.location.origin}/billing/credit-notes?creditNote=${selectedCreditNote.credit_note_id}`
      await navigator.clipboard.writeText(url)
      toast({
        title: 'Link copied',
        description: 'Credit note link has been copied to clipboard',
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
      if (event.detail.pathname === '/billing/credit-notes') {
        // Close any open credit note details and open the credit note creation modal
        setSelectedCreditNote(null)
        setIsCreateCreditNoteOpen(true)
      }
    }

    const handleFilterClick = (event: CustomEvent) => {
      if (event.detail.pathname === '/billing/credit-notes') {
        setIsFilterOpen(true)
      }
    }

    const handleSearch = (event: CustomEvent) => {
      if (event.detail.pathname === '/billing/credit-notes') {
        console.log('[CreditNotesListPage] Received search event:', event.detail.value)
        setSearchInput(event.detail.value)
      }
    }

    window.addEventListener('billing:create', handleCreate as EventListener)
    window.addEventListener('billing:filter-click', handleFilterClick as EventListener)
    window.addEventListener('billing:search', handleSearch as EventListener)
    return () => {
      window.removeEventListener('billing:create', handleCreate as EventListener)
      window.removeEventListener('billing:filter-click', handleFilterClick as EventListener)
      window.removeEventListener('billing:search', handleSearch as EventListener)
    }
  }, [])

  // Hydrate from URL on mount
  useEffect(() => {
    const urlFilters = parseCreditNoteFiltersFromUrl(new URLSearchParams(params.toString()))
    const urlSort = parseCreditNoteSortFromUrl(new URLSearchParams(params.toString()))
    
    setFilters(urlFilters)
    setSearchInput(urlFilters.search)
    setSort(urlSort)
    
    // Sync with layout search value if available
    if (layoutOnSearchChange && urlFilters.search) {
      layoutOnSearchChange(urlFilters.search)
    }
    
    // Check for selected credit note in URL
    const creditNoteId = params.get('id')
    if (creditNoteId) {
      // Try to get the credit note from the store first (using getItemFromStore if available)
      // For now, we'll just wait for the data to load and let user click to select
      // TODO: Implement store-based restoration if needed
      console.log('Credit note ID found in URL:', creditNoteId)
    }

    // Check for selected invoice in URL
    const invoiceId = params.get('invoice')
    if (invoiceId) {
      setSelectedInvoice({ id: parseInt(invoiceId) })
    }
  }, [params])

  // Listen for optimistic update events
  useEffect(() => {
    const handleCreditNoteCreated = (event: CustomEvent) => {
      console.log('Credit note created event received:', event.detail)
      // The cache utils already handle updating the list, so we just need to close the modal
      setIsCreateCreditNoteOpen(false)
    }

    const handleCreditNoteUpdated = (event: CustomEvent) => {
      console.log('Credit note updated event received:', event.detail)
      // The cache utils already handle updating the list and details pane
    }

    const handleCreditNoteDeleted = (event: CustomEvent) => {
      console.log('Credit note deleted event received:', event.detail)
      // Close the details pane if the deleted credit note is currently selected
      if (selectedCreditNote && selectedCreditNote.credit_note_id === event.detail.creditNoteId) {
        setSelectedCreditNote(null)
        // Remove from URL
        const newParams = new URLSearchParams(params.toString())
        newParams.delete('id')
        router.replace(`${pathname}?${newParams.toString()}`)
      }
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('credit-note-created', handleCreditNoteCreated as EventListener)
      window.addEventListener('credit-note-updated', handleCreditNoteUpdated as EventListener)
      window.addEventListener('credit-note-deleted', handleCreditNoteDeleted as EventListener)
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('credit-note-created', handleCreditNoteCreated as EventListener)
        window.removeEventListener('credit-note-updated', handleCreditNoteUpdated as EventListener)
        window.removeEventListener('credit-note-deleted', handleCreditNoteDeleted as EventListener)
      }
    }
  }, [params, router, pathname, selectedCreditNote])

  // Update URL when filters or sort change
  const updateUrl = (newFilters: CreditNoteFilters, newSort: CreditNoteSortConfig) => {
    const newParams = new URLSearchParams()
    
    if (newFilters.search) newParams.set('q', newFilters.search)
    if (newFilters.currency.length > 0) newParams.set('currency', newFilters.currency.join(','))
    if (newFilters.status.length > 0) newParams.set('status', newFilters.status.join(','))
    if (newFilters.dateFrom) newParams.set('from', newFilters.dateFrom)
    if (newFilters.dateTo) newParams.set('to', newFilters.dateTo)
    if (newSort.field !== 'credit_date') newParams.set('sort', newSort.field)
    if (newSort.direction !== 'desc') newParams.set('dir', newSort.direction)
    
    // Use replaceState to update URL without triggering server calls
    const newUrl = `${pathname}?${newParams.toString()}`
    window.history.replaceState({}, '', newUrl)
  }

  const handleFiltersChange = (newFilters: CreditNoteFilters) => {
    setFilters(newFilters)
    updateUrl(newFilters, sort)
  }

  const handleSortChange = (newSort: CreditNoteSortConfig) => {
    setSort(newSort)
    updateUrl(filters, newSort)
  }

  const handleCreditNoteSelect = (creditNote: CreditNoteSummary) => {
    setSelectedCreditNote(creditNote)
    // Update URL with credit note ID
    const newParams = new URLSearchParams(params.toString())
    newParams.set('id', creditNote.credit_note_id.toString())
    router.replace(`${pathname}?${newParams.toString()}`)
  }

  const handleCloseDrawer = () => {
    setSelectedCreditNote(null)
    updateUrl(filters, sort)
  }

  // Optimistic update function for credit note list using TaskList pattern
  const optimisticallyAddCreditNote = async (creditNoteId: number) => {
    try {
      const { data: newCreditNote, error } = await supabase
        .from('v_credit_notes_summary')
        .select('*')
        .eq('credit_note_id', creditNoteId)
        .single()

      if (error) throw error
      
      console.log('Fetched new credit note for optimistic update:', newCreditNote)
      
      // Use the same pattern as TaskList - update InfiniteList stores directly with sort config
      addCreditNoteToCaches(queryClient, newCreditNote, sort)
      
    } catch (error) {
      console.error('Failed to optimistically update credit note list:', error)
      // If optimistic update fails, just invalidate all queries
      queryClient.invalidateQueries({
        predicate: (query) =>
          Array.isArray(query.queryKey) && 
          (query.queryKey[0] === 'v_credit_notes_summary' || 
           (typeof query.queryKey[0] === 'string' && query.queryKey[0].startsWith('credit-notes-')))
      })
    }
  }

  const handleCreditNoteCreated = (creditNoteId: number) => {
    // Optimistically add the credit note to the list
    optimisticallyAddCreditNote(creditNoteId)
  }

  const handleCreditNoteUpdate = (updatedCreditNote: CreditNoteSummary) => {
    // Update the selected credit note in the list
    setSelectedCreditNote(updatedCreditNote)
    
    // Emit an event to update the list
    window.dispatchEvent(new CustomEvent('creditNoteUpdated', {
      detail: { creditNoteId: updatedCreditNote.credit_note_id, updatedCreditNote }
    }))
  }

  const handleCreditNoteDelete = (creditNoteId: number) => {
    // Remove the credit note from the list
    setSelectedCreditNote(null)
    
    // Emit an event to remove from the list
    window.dispatchEvent(new CustomEvent('creditNoteDeleted', {
      detail: { creditNoteId }
    }))
  }

  const handleOpenInvoice = async (invoiceId: number) => {
    if (!invoiceId) {
      console.error('Invoice ID is undefined')
      return
    }
    setSelectedInvoice({ id: invoiceId })
    const newParams = new URLSearchParams(params.toString())
    newParams.set('invoice', invoiceId.toString())
    router.replace(`${pathname}?${newParams.toString()}`, { scroll: false })
  }

  const handleCloseInvoice = () => {
    setSelectedInvoice(null)
    const newParams = new URLSearchParams(params.toString())
    newParams.delete('invoice')
    router.replace(`${pathname}?${newParams.toString()}`, { scroll: false })
  }

  const handleEditCreditNote = () => {
    setIsEditCreditNoteOpen(true)
  }

  const handleCancelEditCreditNote = () => {
    setIsEditingCreditNote(false)
  }

  const handleSaveCreditNote = () => {
    // The save logic is handled in CreditNoteDetailsPane
    setIsEditingCreditNote(false)
  }

  const handleVoidCreditNote = () => {
    // The void logic is handled in CreditNoteDetailsPane
  }

  const handleDeleteCreditNote = () => {
    if (!selectedCreditNote) return
    setShowDeleteConfirmation(true)
  }

  // Delete credit note mutation with optimistic updates (mirroring invoice deletion)
  const deleteCreditNoteMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCreditNote?.credit_note_id) throw new Error('No credit note ID provided')
      
      // Optimistically remove from caches first (TaskList pattern)
      removeCreditNoteFromCaches(queryClient, selectedCreditNote.credit_note_id)
      
      const { error } = await deleteCreditNote(selectedCreditNote.credit_note_id)
      
      if (error) throw error
      return { success: true }
    },
    onSuccess: () => {
      // Dispatch event to notify other components
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('credit-note-deleted', { 
          detail: { creditNoteId: selectedCreditNote?.credit_note_id }
        }))
      }

      // Close modal and clear selection
      setShowDeleteConfirmation(false)
      setSelectedCreditNote(null)
      
      // Remove from URL
      const newParams = new URLSearchParams(params.toString())
      newParams.delete('id')
      router.replace(`${pathname}?${newParams.toString()}`)

      toast({
        title: 'Success',
        description: 'Credit note deleted successfully',
      })
    },
    onError: (err: any) => {
      toast({
        title: 'Error',
        description: err.message || 'Failed to delete credit note',
        variant: 'destructive',
      })
    }
  })

  const confirmDeleteCreditNote = () => {
    if (!selectedCreditNote) return
    deleteCreditNoteMutation.mutate()
  }

  const getActiveFilterCount = () => {
    let count = 0
    if (debouncedSearch) count++
    if (filters.currency.length > 0) count++
    if (filters.status.length > 0) count++
    if (filters.dateFrom || filters.dateTo) count++
    return count
  }

  return (
    <>
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
                className="px-3 py-2 text-sm font-medium transition-colors border-b-2 text-gray-500 hover:text-gray-700 border-transparent hover:border-gray-300"
              >
                Payments
              </Link>
              <Link
                href="/billing/credit-notes"
                className="px-3 py-2 text-sm font-medium transition-colors border-b-2 text-gray-900 border-gray-900"
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
            const { badges, onClearAll } = getActiveCreditNoteFilterBadges(filters, setFilters, router, pathname, new URLSearchParams(params.toString()))
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
            <CreditNotesList
              filters={{ ...filters, search: debouncedSearch }}
              sort={sort}
              onSortChange={handleSortChange}
              onCreditNoteSelect={handleCreditNoteSelect}
              selectedCreditNote={selectedCreditNote}
              hasRightPaneOpen={!!selectedCreditNote}
            />
          </div>
        </div>

        {/* Right pane - Credit Note Detail */}
        {selectedCreditNote && !isCreateCreditNoteOpen && (
          <div 
            className="fixed top-0 w-96 bg-white border-l border-gray-200 flex flex-col h-screen z-40 shadow-lg"
            style={{ right: selectedInvoice ? '384px' : '0px' }}
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-semibold text-gray-900 truncate">
                  Credit Note #{selectedCreditNote.credit_number}
                </h2>
              </div>
              <div className="flex items-center space-x-2">
                {isEditingCreditNote ? (
                  <>
                    <Button variant="outline" size="sm" onClick={handleCancelEditCreditNote}>
                      Cancel
                    </Button>
                    <Button size="sm" onClick={handleSaveCreditNote}>
                      Save
                    </Button>
                  </>
                ) : (
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
                      <DropdownMenuItem onClick={handleEditCreditNote}>
                        <Edit className="w-4 h-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      {selectedCreditNote.status === 'issued' && (
                        <DropdownMenuItem onClick={handleVoidCreditNote}>
                          <AlertTriangle className="w-4 h-4 mr-2" />
                          Void
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={handleDeleteCreditNote} className="text-red-600">
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                <Button variant="ghost" size="sm" onClick={handleCloseDrawer}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-auto">
              <CreditNoteDetailsPane
                creditNoteId={selectedCreditNote.credit_note_id}
                onClose={handleCloseDrawer}
                onCreditNoteUpdate={handleCreditNoteUpdate}
                onCreditNoteDelete={handleCreditNoteDelete}
                onOpenInvoice={handleOpenInvoice}
                initialCreditNote={selectedCreditNote}
                onEdit={handleEditCreditNote}
                onVoid={handleVoidCreditNote}
                onDelete={handleDeleteCreditNote}
                isEditing={isEditingCreditNote}
                onSave={handleSaveCreditNote}
                onCancel={handleCancelEditCreditNote}
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
      <CreditNotesFilters
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        filters={filters}
        onFiltersChange={handleFiltersChange}
      />

      {/* Credit Note Create Modal */}
      <CreditNoteCreateModal
        isOpen={isCreateCreditNoteOpen}
        onClose={() => setIsCreateCreditNoteOpen(false)}
        onCreditNoteCreated={(creditNoteId) => {
          setIsCreateCreditNoteOpen(false)
          handleCreditNoteCreated(creditNoteId)
        }}
        sortConfig={sort}
      />

      {/* Credit Note Edit Modal */}
      <CreditNoteCreateModal
        isOpen={isEditCreditNoteOpen}
        onClose={() => setIsEditCreditNoteOpen(false)}
        onCreditNoteCreated={(creditNoteId) => {
          setIsEditCreditNoteOpen(false)
          // Refetch to update the list
          queryClient.invalidateQueries({ queryKey: ['creditNotes'] })
        }}
        editingCreditNote={selectedCreditNote}
        sortConfig={sort}
      />

      {/* Delete Confirmation Modal */}
      <Dialog open={showDeleteConfirmation} onOpenChange={setShowDeleteConfirmation}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Credit Note</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this credit note? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirmation(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={confirmDeleteCreditNote}
              disabled={deleteCreditNoteMutation.isPending}
            >
              {deleteCreditNoteMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
} 
"use client"

import React, { useState, useEffect } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { MoreHorizontal, X } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu'
import { Button } from '../ui/button'
import { SearchFilterBar } from '../ui/search-filter-bar'
import { parseSupplierCreditNoteFiltersFromUrl, parseSupplierCreditNoteSortFromUrl } from '../../lib/services/expenses'
import { getItemFromStore } from '../../../hooks/use-infinite-query'
import { useDebounce } from '../../hooks/use-debounce'
import { SupplierCreditNoteCreateModal } from './SupplierCreditNoteCreateModal'
import type { SupplierCreditNoteFilters, SupplierCreditNoteSortConfig, SupplierCreditNoteList } from '../../lib/types/expenses'

export function SupplierCreditNotesListPage() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  
  // State for selected credit note and filters
  const [selectedCreditNote, setSelectedCreditNote] = useState<any>(null)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [filters, setFilters] = useState<SupplierCreditNoteFilters>({
    q: '',
    currency_code: [],
    status: [],
    period: {},
  })
  const [sort, setSort] = useState<SupplierCreditNoteSortConfig>({ field: 'credit_date', direction: 'desc' })
  
  // Separate search input state to avoid immediate URL updates
  const [searchInput, setSearchInput] = useState('')
  
  // Debounced search for better performance
  const debouncedSearch = useDebounce(searchInput, 300)

  // Listen for the create button event from the layout
  useEffect(() => {
    const handleCreate = (event: CustomEvent) => {
      if (event.detail.pathname === '/expenses/supplier-credit-notes') {
        setIsCreateModalOpen(true)
      }
    }

    window.addEventListener('expenses:create', handleCreate as EventListener)
    return () => window.removeEventListener('expenses:create', handleCreate as EventListener)
  }, [])

  // Hydrate from URL on mount
  useEffect(() => {
    const urlFilters = parseSupplierCreditNoteFiltersFromUrl(new URLSearchParams(params.toString()))
    const urlSort = parseSupplierCreditNoteSortFromUrl(new URLSearchParams(params.toString()))
    
    setFilters(urlFilters)
    setSearchInput(urlFilters.q)
    setSort(urlSort)
    
    // Check for selected credit note in URL
    const creditNoteId = params.get('creditNote')
    if (creditNoteId) {
      // Try to get the credit note from the store first
      const creditNoteFromStore = getItemFromStore('v_received_credit_notes_summary', undefined, parseInt(creditNoteId)) as SupplierCreditNoteList | null
      if (creditNoteFromStore) {
        setSelectedCreditNote(creditNoteFromStore)
      } else {
        // If not in store, we'll need to wait for the data to load
        // The credit note will be set when the user clicks on it
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
              <h1 className="text-2xl font-semibold text-gray-900">Supplier Credit Notes</h1>
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
  const updateUrl = (newFilters: SupplierCreditNoteFilters, newSort: SupplierCreditNoteSortConfig, selectedCreditNoteId?: number) => {
    const newParams = new URLSearchParams()
    
    // Update search
    if (newFilters.q) {
      newParams.set('q', newFilters.q)
    }
    
    // Update currency filter
    if (newFilters.currency_code.length > 0) {
      newParams.set('currency', newFilters.currency_code.join(','))
    }
    
    // Update status filter
    if (newFilters.status.length > 0) {
      newParams.set('status', newFilters.status.join(','))
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
    
    // Update selected credit note
    if (selectedCreditNoteId) {
      newParams.set('creditNote', selectedCreditNoteId.toString())
    }
    
    // Use replaceState to update URL without triggering server calls
    const newUrl = `${pathname}?${newParams.toString()}`
    window.history.replaceState({}, '', newUrl)
  }

  const handleFiltersChange = (newFilters: SupplierCreditNoteFilters) => {
    setFilters(newFilters)
    updateUrl(newFilters, sort)
  }

  const handleSortChange = (newSort: SupplierCreditNoteSortConfig) => {
    setSort(newSort)
    updateUrl(filters, newSort)
  }

  const handleCreditNoteSelect = (creditNote: SupplierCreditNoteList) => {
    setSelectedCreditNote(creditNote)
    updateUrl(filters, sort, creditNote.credit_note_id)
  }

  const handleCloseDrawer = () => {
    setSelectedCreditNote(null)
    updateUrl(filters, sort)
  }

  const getActiveFilterCount = () => {
    let count = 0
    if (debouncedSearch) count++
    if (filters.currency_code.length > 0) count++
    if (filters.status.length > 0) count++
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
          searchPlaceholder="Search credit number..."
        />

        {/* Table */}
        <div className="flex-1 overflow-hidden">
          <div className="p-6 text-center text-gray-500">
            Credit notes table will be implemented here
          </div>
        </div>
      </div>

      {/* Right pane - Credit Note Detail */}
      {selectedCreditNote && (
        <div className="fixed top-0 bg-white border-l border-gray-200 flex flex-col h-full z-40 shadow-lg transition-all duration-200 right-0 w-96">
          <div className="flex items-center justify-between p-4 border-b border-gray-200 flex-shrink-0">
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold text-gray-900 truncate">
                Credit Note #{selectedCreditNote.credit_number}
              </h2>
              <p className="text-sm text-gray-500 truncate">
                {selectedCreditNote.status}
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
                <DropdownMenuItem onClick={() => console.log('Edit credit note')}>
                  Edit credit note
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => console.log('Delete credit note')}
                  className="text-red-600 focus:text-red-600"
                >
                  Delete credit note
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="sm" onClick={handleCloseDrawer}>
              <X className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex-1 overflow-auto min-h-0">
            <div className="p-6">
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-gray-900">Credit Note Details</h3>
                  <p className="text-sm text-gray-500">
                    Credit note details will be implemented here
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Credit Note Modal */}
      <SupplierCreditNoteCreateModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreditNoteCreated={(creditNote) => {
          // Refresh the credit notes list
          window.location.reload()
        }}
      />
    </div>
  )
} 
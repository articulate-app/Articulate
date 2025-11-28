"use client"

import React, { useState, useEffect, useMemo } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { MoreHorizontal, X, Plus, Copy } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu'
import { InvoicesTable } from './InvoicesTable'
import { InvoicesFilters } from './InvoicesFilters'
import { Button } from '../ui/button'
import { toast } from '../ui/use-toast'
import { parseInvoiceFiltersFromUrl, parseInvoiceSortFromUrl } from '../../lib/services/billing'
import { getItemFromStore } from '../../../hooks/use-infinite-query'
import { useDebounce } from '../../hooks/use-debounce'
import IssuedInvoiceDetail from './IssuedInvoiceDetail'
import { CreateInvoiceDetailsModal } from './CreateInvoiceDetailsModal'
import { InvoiceOrderSelectionModal } from './InvoiceOrderSelectionModal'
import { InvoiceAllocationModal } from './InvoiceAllocationModal'
import type { InvoiceFilters, InvoiceSortConfig, IssuedInvoiceList, InvoiceOrder } from '../../lib/types/billing'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchIssuedInvoice } from '../../lib/services/billing'
import { addInvoiceToAllCaches, removeInvoiceFromAllCaches, updateInvoiceInCaches } from './invoice-cache-utils'
import { TaskDetails } from '../tasks/TaskDetails'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useTaskEditFields } from '../../hooks/use-task-edit-fields'
import { InvoiceOrderLinesDrawer } from './InvoiceOrderLinesDrawer'
import { FilterBadges } from '../../../components/ui/filter-badges'

// Helper to map invoice filters to badges
function getActiveInvoiceFilterBadges(
  filters: InvoiceFilters,
  setFilters: (filters: InvoiceFilters) => void,
  router: any,
  pathname: string,
  params: URLSearchParams,
  filterOptions?: { teams?: Array<{ id: number; name: string }>; projects?: string[] }
): { badges: Array<{ id: string; label: string; value: string; onRemove: () => void }>; onClearAll: () => void } {
  const badges: Array<{ id: string; label: string; value: string; onRemove: () => void }> = []
  
  // Helper function to get user-friendly labels
  const getLabel = (key: string, val: string): string => {
    if (!filterOptions) return val
    switch (key) {
      case 'issuerTeam':
      case 'payerTeam': {
        const team = filterOptions.teams?.find(t => String(t.id) === String(val))
        return team?.name || val
      }
      case 'project': {
        // Projects are already strings, so return as-is
        return val
      }
      default:
        return val
    }
  }
  
  const updateUrl = (newFilters: InvoiceFilters) => {
    const newParams = new URLSearchParams(params.toString())
    
    // Clear all filter params
    const filterKeys = ['q', 'status', 'issuerTeamId', 'payerTeamId', 'periodFrom', 'periodTo', 'balance', 'projects']
    filterKeys.forEach((key: string) => newParams.delete(key))
    
    // Set new filter params
    if (newFilters.q) newParams.set('q', newFilters.q)
    if (newFilters.status?.length) newParams.set('status', newFilters.status.join(','))
    if (newFilters.issuerTeamId?.length) newParams.set('issuerTeamId', newFilters.issuerTeamId.join(','))
    if (newFilters.payerTeamId?.length) newParams.set('payerTeamId', newFilters.payerTeamId.join(','))
    if (newFilters.period?.from) newParams.set('periodFrom', newFilters.period.from.toISOString().slice(0, 10))
    if (newFilters.period?.to) newParams.set('periodTo', newFilters.period.to.toISOString().slice(0, 10))
    if (newFilters.balance && newFilters.balance !== 'all') newParams.set('balance', newFilters.balance as string)
    if (newFilters.projects?.length) newParams.set('projects', newFilters.projects.join(','))
    
    router.push(`${pathname}?${newParams.toString()}`)
    setFilters(newFilters)
  }

  // Search query
  if (filters.q) {
    badges.push({
      id: 'search',
      label: 'Search',
      value: filters.q,
      onRemove: () => {
        const newFilters = { ...filters, q: '' }
        updateUrl(newFilters)
      }
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

  // Issuer Team filters
  if (filters.issuerTeamId?.length) {
    filters.issuerTeamId.forEach(teamId => {
      badges.push({
        id: `issuerTeam-${teamId}`,
        label: 'Issuer Team',
        value: getLabel('issuerTeam', teamId),
        onRemove: () => {
          const newFilters = { ...filters, issuerTeamId: filters.issuerTeamId.filter(id => id !== teamId) }
          updateUrl(newFilters)
        }
      })
    })
  }

  // Payer Team filters
  if (filters.payerTeamId?.length) {
    filters.payerTeamId.forEach(teamId => {
      badges.push({
        id: `payerTeam-${teamId}`,
        label: 'Payer Team',
        value: getLabel('payerTeam', teamId),
        onRemove: () => {
          const newFilters = { ...filters, payerTeamId: filters.payerTeamId.filter(id => id !== teamId) }
          updateUrl(newFilters)
        }
      })
    })
  }

  // Date range filters
  if (filters.period?.from) {
    badges.push({
      id: 'period-from',
      label: 'Invoice Date',
      value: `from ${filters.period.from.toLocaleDateString()}`,
      onRemove: () => {
        const newFilters = { ...filters, period: { ...filters.period, from: undefined } }
        updateUrl(newFilters)
      }
    })
  }

  if (filters.period?.to) {
    badges.push({
      id: 'period-to',
      label: 'Invoice Date',
      value: `to ${filters.period.to.toLocaleDateString()}`,
      onRemove: () => {
        const newFilters = { ...filters, period: { ...filters.period, to: undefined } }
        updateUrl(newFilters)
      }
    })
  }

  // Balance filter
  if (filters.balance && filters.balance !== 'all') {
    badges.push({
      id: 'balance',
      label: 'Balance',
      value: filters.balance === 'due_only' ? 'Due Only' : filters.balance,
      onRemove: () => {
        const newFilters = { ...filters, balance: 'all' as const }
        updateUrl(newFilters)
      }
    })
  }

  // Projects filters
  if (filters.projects?.length) {
    filters.projects.forEach(project => {
      badges.push({
        id: `project-${project}`,
        label: 'Project',
        value: project,
        onRemove: () => {
          const newFilters = { ...filters, projects: filters.projects.filter(p => p !== project) }
          updateUrl(newFilters)
        }
      })
    })
  }

  // Function to clear all filters
  const onClearAll = () => {
    const emptyFilters: InvoiceFilters = {
      q: '',
      status: [],
      issuerTeamId: [],
      payerTeamId: [],
      period: {},
      balance: 'all',
      projects: []
    }
    updateUrl(emptyFilters)
  }

  return { badges, onClearAll }
}

interface InvoicesListPageProps {
  onFilterClick?: () => void
  isFilterOpen?: boolean
  setIsFilterOpen?: (open: boolean) => void
}

export function InvoicesListPage({ 
  onFilterClick: layoutOnFilterClick,
  isFilterOpen: layoutIsFilterOpen,
  setIsFilterOpen: layoutSetIsFilterOpen
}: InvoicesListPageProps = {}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const queryClient = useQueryClient()
  
  // State for selected invoice and filters
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null)
  const [localIsFilterOpen, setLocalIsFilterOpen] = useState(false)
  const isFilterOpen = layoutIsFilterOpen !== undefined ? layoutIsFilterOpen : localIsFilterOpen
  const setIsFilterOpen = layoutSetIsFilterOpen || setLocalIsFilterOpen
  const [filters, setFilters] = useState<InvoiceFilters>({
    q: '',
    status: [],
    issuerTeamId: [],
    payerTeamId: [],
    period: {},
    balance: 'all',
    projects: [],
  })
  const [sort, setSort] = useState<InvoiceSortConfig>({ field: 'invoice_date', direction: 'desc' })
  
  // State for menu actions
  const [menuAction, setMenuAction] = useState<string | null>(null)
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null)
  const [selectedInvoiceOrder, setSelectedInvoiceOrder] = useState<any>(null)
  
  // State for invoice creation flow
  const [isInvoiceDetailsModalOpen, setIsInvoiceDetailsModalOpen] = useState(false)
  const [isOrderSelectionModalOpen, setIsOrderSelectionModalOpen] = useState(false)
  const [isAllocationModalOpen, setIsAllocationModalOpen] = useState(false)
  const [selectedOrdersForInvoice, setSelectedOrdersForInvoice] = useState<InvoiceOrder[]>([])
  const [createdInvoiceId, setCreatedInvoiceId] = useState<number | null>(null)
  const [invoiceFormData, setInvoiceFormData] = useState<any>(null)
  
  // Use page's own search state (like the filter pane does)
  const [searchInput, setSearchInput] = useState('')

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

  // Debug search value changes
  useEffect(() => {
    console.log('[InvoicesListPage] Search input:', searchInput)
  }, [searchInput])

  
  // Debounced search for better performance
  const debouncedSearch = useDebounce(searchInput, 300)

  // Sync debounced search with filters and URL
  useEffect(() => {
    console.log('[InvoicesListPage] Debounced search changed:', debouncedSearch)
    console.log('[InvoicesListPage] Current filters.q:', filters.q)
    if (debouncedSearch !== filters.q) {
      console.log('[InvoicesListPage] Updating filters with search:', debouncedSearch)
      const newFilters = { ...filters, q: debouncedSearch }
      console.log('[InvoicesListPage] New filters:', newFilters)
      handleFiltersChange(newFilters)
    }
  }, [debouncedSearch])

  const handleCreateClick = () => {
    // Open the invoice details modal first (new flow)
    setIsInvoiceDetailsModalOpen(true)
  }

  const handleCopyLink = async () => {
    if (!selectedInvoice) return
    try {
      const url = `${window.location.origin}/billing/invoices?invoice=${selectedInvoice.id}`
      await navigator.clipboard.writeText(url)
      toast({
        title: 'Link copied',
        description: 'Invoice link has been copied to clipboard',
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
    if (event.detail.pathname === '/billing/invoices') {
      // Open the invoice details modal first (new flow)
      setIsInvoiceDetailsModalOpen(true)
    }
  }

    const handleFilterClick = (event: CustomEvent) => {
      if (event.detail.pathname === '/billing/invoices') {
        setIsFilterOpen(true)
      }
    }

    const handleSearch = (event: CustomEvent) => {
      if (event.detail.pathname === '/billing/invoices') {
        console.log('[InvoicesListPage] Received search event:', event.detail.value)
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
    const urlFilters = parseInvoiceFiltersFromUrl(new URLSearchParams(params.toString()))
    const urlSort = parseInvoiceSortFromUrl(new URLSearchParams(params.toString()))
    
    setFilters(urlFilters)
    setSearchInput(urlFilters.q)
    setSort(urlSort)
    
    // Check for selected invoice in URL
    const invoiceId = params.get('invoice')
    if (invoiceId) {
      // Try to get the invoice from the store first
      const invoiceFromStore = getItemFromStore('v_issued_invoices_list', undefined, parseInt(invoiceId)) as IssuedInvoiceList | null
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
              <h1 className="text-2xl font-semibold text-gray-900">Invoices</h1>
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
  const updateUrl = (newFilters: InvoiceFilters, newSort: InvoiceSortConfig, selectedInvoiceId?: number) => {
    const newParams = new URLSearchParams()
    
    // Update search
    if (newFilters.q) {
      newParams.set('q', newFilters.q)
    }
    
    // Update status filter
    if (newFilters.status.length > 0) {
      newParams.set('status', newFilters.status.join(','))
    }
    
    // Update issuer team filter
    if (newFilters.issuerTeamId.length > 0) {
      newParams.set('issuerTeamId', newFilters.issuerTeamId.join(','))
    }
    
    // Update payer team filter
    if (newFilters.payerTeamId.length > 0) {
      newParams.set('payerTeamId', newFilters.payerTeamId.join(','))
    }
    
    // Update period filters
    if (newFilters.period.from) {
      newParams.set('from', newFilters.period.from.toISOString().split('T')[0])
    }
    if (newFilters.period.to) {
      newParams.set('to', newFilters.period.to.toISOString().split('T')[0])
    }
    
    // Update balance filter
    if (newFilters.balance !== 'all') {
      newParams.set('balance', newFilters.balance)
    }
    
    // Update projects filter
    if (newFilters.projects.length > 0) {
      newParams.set('projects', newFilters.projects.join(','))
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

  const handleFiltersChange = (newFilters: InvoiceFilters) => {
    setFilters(newFilters)
    updateUrl(newFilters, sort)
  }

  const handleSortChange = (newSort: InvoiceSortConfig) => {
    setSort(newSort)
    updateUrl(filters, newSort)
  }

  const handleInvoiceSelect = (invoice: IssuedInvoiceList) => {
    setSelectedInvoice(invoice)
    updateUrl(filters, sort, invoice.id)
  }

  const handleCloseDrawer = () => {
    setSelectedInvoice(null)
    updateUrl(filters, sort)
  }

  const getActiveFilterCount = () => {
    let count = 0
    if (debouncedSearch) count++
    if (filters.status.length > 0) count++
    if (filters.issuerTeamId.length > 0) count++
    if (filters.payerTeamId.length > 0) count++
    if (filters.period.from || filters.period.to) count++
    if (filters.balance !== 'all') count++
    if (filters.projects.length > 0) count++
    return count
  }

  // Handle invoice details created (step 1)
  const handleInvoiceDetailsCreated = (invoiceId: number) => {
    setCreatedInvoiceId(invoiceId)
    setIsInvoiceDetailsModalOpen(false)
    console.log('Invoice created successfully:', invoiceId)
    // Optimistically update the invoice list
    optimisticallyAddInvoice(invoiceId)
  }

  // Handle proceed to orders from invoice details (step 1 -> 2)
  const handleProceedToOrders = (invoiceId: number, formData?: any) => {
    if (invoiceId === 0) {
      // This means we haven't created the invoice yet, just proceeding to order selection
      setCreatedInvoiceId(null) // No invoice created yet
      setInvoiceFormData(formData) // Store form data for later use
      setIsInvoiceDetailsModalOpen(false)
      setIsOrderSelectionModalOpen(true)
      // Don't update invoice list yet, invoice will be created in step 3
    } else {
      // Invoice was already created (standalone case)
      setCreatedInvoiceId(invoiceId)
      setInvoiceFormData(null) // Clear form data since invoice is already created
      setIsInvoiceDetailsModalOpen(false)
      setIsOrderSelectionModalOpen(true)
      // Optimistically update the invoice list
      optimisticallyAddInvoice(invoiceId)
    }
  }

  // Handle invoice order selection (step 2 -> 3)
  const handleOrdersSelected = (orders: InvoiceOrder[]) => {
    setSelectedOrdersForInvoice(orders)
    setIsOrderSelectionModalOpen(false)
    setIsAllocationModalOpen(true)
  }

  // Handle final allocation completed (step 3)
  const handleAllocationCompleted = (invoiceId: number) => {
    setIsAllocationModalOpen(false)
    setSelectedOrdersForInvoice([])
    
    // If this was a new invoice (created during allocation), update the list
    if (!createdInvoiceId && invoiceFormData) {
      optimisticallyAddInvoice(invoiceId)
    }
    
    setCreatedInvoiceId(null)
    setInvoiceFormData(null)
    console.log('Invoice allocations completed:', invoiceId)
  }

  // Handle going back from order selection to invoice details (step 2 -> 1)
  const handleBackToInvoiceDetails = () => {
    setIsOrderSelectionModalOpen(false)
    setIsInvoiceDetailsModalOpen(true)
    // Keep the invoice form data to preserve user input
  }

  // Handle closing any modal and reset state
  const handleCloseModals = () => {
    setIsInvoiceDetailsModalOpen(false)
    setIsOrderSelectionModalOpen(false)
    setIsAllocationModalOpen(false)
    setSelectedOrdersForInvoice([])
    setCreatedInvoiceId(null)
    setInvoiceFormData(null)
  }

  // Optimistic update function for invoice list using TaskList pattern
  const optimisticallyAddInvoice = async (invoiceId: number) => {
    try {
      const { data: newInvoice, error } = await fetchIssuedInvoice(invoiceId)
      if (error) throw error
      
      console.log('Fetched new invoice for optimistic update:', newInvoice)
      
      // Use the same pattern as TaskList - update InfiniteList stores directly with sort config
      addInvoiceToAllCaches(queryClient, newInvoice, sort)
      
    } catch (error) {
      console.error('Failed to optimistically update invoice list:', error)
      // If optimistic update fails, just invalidate all queries
      queryClient.invalidateQueries({
        predicate: (query) =>
          Array.isArray(query.queryKey) && 
          (query.queryKey[0] === 'v_issued_invoices_list' || 
           (typeof query.queryKey[0] === 'string' && query.queryKey[0].startsWith('invoices-')))
      })
    }
  }

  // Task details pane component that uses Edge Functions
  function TaskDetailsPane({ 
    taskId, 
    onClose
  }: { 
    taskId: number; 
    onClose: () => void;
  }) {
    const [currentUser, setCurrentUser] = useState<any>(null)
    const [accessToken, setAccessToken] = useState<string | null>(null)

    // Get current user and access token
    useEffect(() => {
      const getUserData = async () => {
        const supabase = createClientComponentClient()
        const { data: { user } } = await supabase.auth.getUser()
        const { data: { session } } = await supabase.auth.getSession()
        
        setCurrentUser(user)
        setAccessToken(session?.access_token || null)
      }
      
      getUserData()
    }, [])

    // Fetch task details using the Edge Function
    const { data: taskData, isLoading: isTaskLoading, error: taskError } = useQuery({
      queryKey: ['task', taskId, accessToken],
      queryFn: async () => {
        const supabase = createClientComponentClient()
        
        // Use the URL with query parameter as shown in the example
        const { data, error } = await supabase.functions.invoke(`task-details-bootstrap?task_id=${taskId}`)
        
        if (error) throw error
        return data
      },
      enabled: !!taskId && !!accessToken
    })

    // Get edit fields (may be cached)
    const { data: editFields } = useTaskEditFields(accessToken)

    if (isTaskLoading) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-gray-500">Loading task...</div>
        </div>
      )
    }

    if (taskError || !taskData?.task) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-gray-500">Task not found</div>
        </div>
      )
    }

    // Render the full TaskDetails component exactly like in the tasks page
    return (
      <TaskDetails
        isCollapsed={false}
        selectedTask={taskData.task}
        onClose={onClose}
        onCollapse={onClose}
        isExpanded={false}
        attachments={taskData.attachments || []}
        mentions={taskData.mentions || []}
        watchers={taskData.watchers || []}
        currentUser={currentUser}
        subtasks={taskData.subtasks || []}
        project_watchers={taskData.project_watchers || []}
        accessToken={accessToken}
      />
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Billing Navigation */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <nav className="flex space-x-1">
            <Link
              href="/billing/invoices"
              className="px-3 py-2 text-sm font-medium transition-colors border-b-2 text-gray-900 border-gray-900"
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
      <div className={`flex-1 flex flex-col min-w-0 transition-all duration-200 ${selectedInvoice ? (selectedTaskId ? 'mr-[768px]' : 'mr-96') : ''}`}>
        {/* Active Filter Badges */}
        {(() => {
          const filterOptions = { teams }
          const { badges, onClearAll } = getActiveInvoiceFilterBadges(filters, setFilters, router, pathname, new URLSearchParams(params.toString()), filterOptions)
          return (
            <FilterBadges
              badges={badges}
              onClearAll={onClearAll}
              className="mt-2 mb-2"
            />
          )
        })()}

        {/* Table */}
        <div className="flex-1 min-h-0">
          <InvoicesTable
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
        <div className={`fixed top-0 bg-white border-l border-gray-200 flex flex-col h-full z-40 shadow-lg transition-all duration-200 ${selectedTaskId ? 'right-96 w-96' : selectedInvoiceOrder ? 'right-96 w-96' : 'right-0 w-96'}`}>
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
                <DropdownMenuItem onClick={() => setMenuAction('add-invoice-order')}>
                  Add invoice order
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setMenuAction('add-payment')}>
                  Add payment
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setMenuAction('upload-invoice')}>
                  Upload invoice
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => setMenuAction('delete-invoice')}
                  className="text-red-600 focus:text-red-600"
                >
                  Delete invoice
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="sm" onClick={handleCloseDrawer}>
              <X className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex-1 overflow-auto min-h-0">
            <IssuedInvoiceDetail 
              id={selectedInvoice.id} 
              isPane={true} 
              menuAction={menuAction}
              onMenuActionHandled={() => setMenuAction(null)}
              onTaskSelect={setSelectedTaskId}
              selectedTaskId={selectedTaskId}
              onInvoiceOrderSelect={setSelectedInvoiceOrder}
              initialInvoice={selectedInvoice}
            />
          </div>
        </div>
      )}

      {/* Task Details Pane */}
      {selectedTaskId && (
        <div className="fixed top-0 right-0 w-96 bg-white border-l border-gray-200 flex flex-col h-full z-50 shadow-lg">
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold">Task Details</h2>
            <Button variant="ghost" size="sm" onClick={() => setSelectedTaskId(null)}>
              <X className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex-1 overflow-auto">
            {/* TaskDetails component will be rendered here */}
            <TaskDetailsPane 
              taskId={selectedTaskId} 
              onClose={() => setSelectedTaskId(null)} 
            />
          </div>
        </div>
      )}

      {/* Invoice Order Details Pane */}
      {selectedInvoiceOrder && (
        <InvoiceOrderLinesDrawer
          order={selectedInvoiceOrder}
          onClose={() => setSelectedInvoiceOrder(null)}
          hasOpenInvoiceDetail={false}
        />
      )}

      {/* Filters Panel */}
      <InvoicesFilters
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        filters={filters}
        onFiltersChange={handleFiltersChange}
      />

      {/* Step 1: Create Invoice Details Modal */}
      <CreateInvoiceDetailsModal
        isOpen={isInvoiceDetailsModalOpen}
        onClose={handleCloseModals}
        onInvoiceCreated={handleInvoiceDetailsCreated}
        onProceedToOrders={handleProceedToOrders}
        initialData={invoiceFormData || undefined}
      />

      {/* Step 2: Invoice Order Selection Modal */}
      <InvoiceOrderSelectionModal
        isOpen={isOrderSelectionModalOpen}
        onClose={handleCloseModals}
        onBack={handleBackToInvoiceDetails}
        onOrdersSelected={handleOrdersSelected}
        invoiceId={createdInvoiceId || undefined}
        payerTeamId={invoiceFormData?.payer_team_id}
        issuerTeamId={invoiceFormData?.issuer_team_id}
      />

      {/* Step 3: Invoice Allocation Modal */}
      <InvoiceAllocationModal
        isOpen={isAllocationModalOpen}
        onClose={handleCloseModals}
        selectedOrders={selectedOrdersForInvoice}
        invoiceId={createdInvoiceId}
        invoiceFormData={invoiceFormData}
        onSuccess={handleAllocationCompleted}
      />
    </div>
  )
} 
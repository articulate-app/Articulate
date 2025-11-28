"use client"

import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { DocumentsSummaryCards } from '../../components/documents/DocumentsSummaryCards'
import { DocumentsFilters } from '../../components/documents/DocumentsFilters'
import { DocumentsTableGrouped } from '../../components/documents/DocumentsTableGrouped'
import { DocumentsUnifiedFilterBar } from '../../components/documents/DocumentsUnifiedFilterBar'
import { DocumentDetailsPane } from '../../panes/documents/DocumentDetailsPane'
import { Button } from '../../components/ui/button'
import { ProductionOrderDetailsPane } from '../../screens/expenses/ProductionOrderDetailsPane'
import { PaymentDetailsPane } from '../../components/payments/PaymentDetailsPane'
import { TaskDetails } from '../../components/tasks/TaskDetails'
import { CreditNoteDetailsPane } from '../../components/credit-notes/CreditNoteDetailsPane'
import { InvoiceOrderLinesDrawer } from '../../components/billing/InvoiceOrderLinesDrawer'
import IssuedInvoiceDetail from '../../components/billing/IssuedInvoiceDetail'
import { SupplierInvoiceDetailsPane } from '../../components/expenses/SupplierInvoiceDetailsPane'
import { X, MoreHorizontal, Edit, CreditCard, Trash2 } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../components/ui/dropdown-menu'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useTaskEditFields } from '../../hooks/use-task-edit-fields'
import { SearchFilterBar } from '../../components/ui/search-filter-bar'
import { FilterBadges } from '../../../components/ui/filter-badges'
import { parseDocumentsFiltersFromUrl, parseDocumentsSortFromUrl, parseGroupingModeFromUrl, buildDocumentsTrailingQuery } from '../../lib/services/documents'
import { useDebounce } from '../../hooks/use-debounce'
import { useQueryClient, useQuery } from '@tanstack/react-query'
import { useDocumentPaneNavigation } from '../../hooks/use-document-pane-navigation'
import { removeDocumentFromCaches, updateDocumentInCaches, addDocumentToCaches } from '../../components/documents/document-cache-utils'
import { SharedInvoiceCreateModal } from '../../components/documents/SharedInvoiceCreateModal'
import { SharedPaymentCreateModal } from '../../components/documents/SharedPaymentCreateModal'
import { CreditNoteCreateModal } from '../../components/credit-notes/CreditNoteCreateModal'
import { optimisticallyUpdateTotals, type DocumentGroupTotals } from '../../lib/services/document-group-totals'
import { getDocumentGroupKey, getDefaultSortForGrouping, type GroupingMode } from '../../lib/utils/document-grouping'
import type { DocumentsFilters as DocumentsFiltersType, DocumentsSortConfig, DocumentRow } from '../../lib/types/documents'

interface DocumentsPageProps {
  onFilterClick?: () => void
  isFilterOpen?: boolean
  setIsFilterOpen?: (open: boolean) => void
  searchValue?: string
  onSearchChange?: (value: string) => void
  isSidebarCollapsed?: boolean
  onSidebarToggle?: () => void
}

export function DocumentsPage({ 
  onFilterClick: layoutOnFilterClick,
  isFilterOpen: layoutIsFilterOpen,
  setIsFilterOpen: layoutSetIsFilterOpen,
  searchValue: layoutSearchValue,
  onSearchChange: layoutOnSearchChange,
  isSidebarCollapsed,
  onSidebarToggle
}: DocumentsPageProps = {}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const queryClient = useQueryClient()
  
  // State for selected document and filters
  const [selectedDocument, setSelectedDocument] = useState<DocumentRow | null>(null)
  const [localIsFilterOpen, setLocalIsFilterOpen] = useState(false)
  const [menuAction, setMenuAction] = useState<string | null>(null)
  
  // Third pane navigation using custom hook
  const {
    selectedRelatedDocument,
    relatedDocumentType,
    handleRelatedDocumentSelect: originalHandleRelatedDocumentSelect,
    handleRelatedDocumentClose: originalHandleRelatedDocumentClose,
    isThirdPaneOpen
  } = useDocumentPaneNavigation()

  // Task details pane component that uses Edge Functions
  function TaskDetailsPane({ 
    taskId, 
    onClose, 
    isExpanded = false, 
    onExpand, 
    onCollapse,
    initialTaskData
  }: { 
    taskId: number; 
    onClose: () => void;
    isExpanded?: boolean;
    onExpand?: () => void;
    onCollapse?: () => void;
    initialTaskData?: any;
  }) {
    const [currentUser, setCurrentUser] = useState<any>(null)
    const [accessToken, setAccessToken] = useState<string | null>(null)
    const supabase = createClientComponentClient()

    // Get current user and access token
    React.useEffect(() => {
      const getUserData = async () => {
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
        // Use the URL with query parameter as shown in the example
        const { data, error } = await supabase.functions.invoke(`task-details-bootstrap?task_id=${taskId}`)
        
        if (error) throw error
        return data
      },
      enabled: !!taskId && !!accessToken
    })

    // Get edit fields (may be cached)
    const { data: editFields } = useTaskEditFields(accessToken)

    // Create a basic task object from initial data while loading
    const basicTaskData = initialTaskData ? {
      id: String(initialTaskData.task_id),
      title: initialTaskData.title,
      delivery_date: initialTaskData.delivery_date,
      publication_date: null,
      assigned_to_id: '',
      assigned_to_name: null,
      project_id_int: initialTaskData.project_id,
      project_name: null,
      project_color: null,
      project_status_id: '',
      project_status_name: null,
      project_status_color: null,
      content_type_id: '',
      content_type_title: null,
      production_type_id: '',
      production_type_title: null,
      language_id: '',
      language_code: null,
      channel_names: [],
      parent_task_id_int: null,
      copy_post: null,
      briefing: null,
      notes: null,
      key_visual_attachment_id: null,
      is_overdue: false,
      is_publication_overdue: false,
      meta_title: null,
      meta_description: null,
      keyword: null,
    } : null

    // Show loading if we don't have any data yet
    if (isTaskLoading && !taskData && !basicTaskData) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-gray-500">Loading task...</div>
        </div>
      )
    }

    // Show error if we have an error and no data
    if (taskError && !taskData && !basicTaskData) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-gray-500">Task not found</div>
        </div>
      )
    }

    // Use complete data if available, otherwise fall back to basic data
    const taskToShow = taskData?.task || basicTaskData
    const attachmentsToShow = taskData?.attachments || []

    return (
      <TaskDetails
        isCollapsed={false}
        selectedTask={taskToShow as any}
        onClose={onClose}
        onCollapse={onClose}
        isExpanded={isExpanded}
        onExpand={isExpanded ? undefined : onExpand}
        onRestore={isExpanded ? onCollapse : undefined}
        attachments={attachmentsToShow}
        currentUser={currentUser}
        accessToken={accessToken}
      />
    )
  }

  // Enhanced handlers that also update URL
  const handleRelatedDocumentSelect = (document: any, type: string) => {
    console.log('handleRelatedDocumentSelect called with:', { document, type })
    console.log('Document keys:', Object.keys(document))
    console.log('Document data:', JSON.stringify(document, null, 2))
    originalHandleRelatedDocumentSelect(document, type)
    updateUrl(filters, sort, selectedDocument?.doc_id, undefined, document.id, type)
  }

  const handleRelatedDocumentClose = () => {
    originalHandleRelatedDocumentClose()
    updateUrl(filters, sort, selectedDocument?.doc_id, undefined, null, null)
  }
  
  // State for create modals
  const [isCreateInvoiceModalOpen, setIsCreateInvoiceModalOpen] = useState(false)
  const [isCreatePaymentModalOpen, setIsCreatePaymentModalOpen] = useState(false)
  const [isCreateCreditNoteModalOpen, setIsCreateCreditNoteModalOpen] = useState(false)
  
  const isFilterOpen = layoutIsFilterOpen !== undefined ? layoutIsFilterOpen : localIsFilterOpen
  const setIsFilterOpen = layoutSetIsFilterOpen || setLocalIsFilterOpen
  const [filters, setFilters] = useState<DocumentsFiltersType>({
    q: '',
    direction: '', // No default - let user choose
    kind: [], // No default - show all types
    status: [],
    currency: '',
    fromTeam: [],
    toTeam: [],
    fromDate: '',
    toDate: '',
    projects: [],
  })
  const [sort, setSort] = useState<DocumentsSortConfig>({ 
    field: 'doc_date', 
    direction: 'desc' 
  })
  
  // Grouping mode state
  const [groupingMode, setGroupingMode] = useState<GroupingMode>('month')
  
  // Optimistic group totals state
  const [optimisticGroupTotals, setOptimisticGroupTotals] = useState<DocumentGroupTotals[] | undefined>(undefined)
  
  // Track previous grouping mode to detect changes
  const previousGroupingModeRef = useRef<GroupingMode>('month')
  
  // Use layout's search state or fallback to local state
  const [localSearchInput, setLocalSearchInput] = useState('')
  const searchInput = layoutSearchValue !== undefined ? layoutSearchValue : localSearchInput
  const setSearchInput = layoutOnSearchChange || setLocalSearchInput
  const debouncedSearch = useDebounce(searchInput, 300)
  
  // Debug search input
  useEffect(() => {
    console.log('[DocumentsPage] searchInput changed:', searchInput, 'layoutSearchValue:', layoutSearchValue, 'localSearchInput:', localSearchInput)
  }, [searchInput, layoutSearchValue, localSearchInput])

  // Prevent hydration mismatch by not rendering until client-side
  const [isClient, setIsClient] = useState(false)
  useEffect(() => {
    setIsClient(true)
  }, [])
  
  // Listen to global search events from layout
  useEffect(() => {
    const handleSearch = (event: any) => {
      const value = event.detail?.value || ''
      console.log('[DocumentsPage] Received search event from global search bar:', value)
      
      // Update search input directly
      if (layoutOnSearchChange) {
        layoutOnSearchChange(value)
      } else {
        setLocalSearchInput(value)
      }
    }
    
    window.addEventListener('documents:search', handleSearch)
    return () => {
      window.removeEventListener('documents:search', handleSearch)
    }
  }, [layoutOnSearchChange])

  // Listen for filter click events from layout
  useEffect(() => {
    const handleFilterClick = () => {
      setIsFilterOpen(true)
    }

    window.addEventListener('documents:filter-click', handleFilterClick)
    return () => window.removeEventListener('documents:filter-click', handleFilterClick)
  }, [])

  // Track if hydration is complete (to prevent URL overwrites during hydration)
  const isHydrated = useRef(false)
  
  // Hydrate from URL on mount (only once)
  useEffect(() => {
    if (isHydrated.current) return
    
    const urlFilters = parseDocumentsFiltersFromUrl(new URLSearchParams(params.toString()))
    const urlSort = parseDocumentsSortFromUrl(new URLSearchParams(params.toString()))
    const urlGrouping = parseGroupingModeFromUrl(new URLSearchParams(params.toString()))
    
    // Use URL filters without forcing defaults
    setFilters(urlFilters)
    setSearchInput(urlFilters.q)
    setSort(urlSort)
    setGroupingMode(urlGrouping)
    
    // Check for selected document in URL and fetch it
    const documentId = params.get('document')
    if (documentId) {
      const docIdNum = parseInt(documentId, 10)
      if (!isNaN(docIdNum)) {
        // Fetch the document from v_documents_min to open the details pane
        const fetchDocument = async () => {
          try {
            const { createClientComponentClient } = await import('@supabase/auth-helpers-nextjs')
            const supabase = createClientComponentClient()
            
            const { data: docs, error } = await supabase
              .from('v_documents_min')
              .select('*')
              .eq('doc_id', docIdNum)
              .limit(1)
            
            if (!error && docs && docs.length > 0) {
              setSelectedDocument(docs[0])
            }
          } catch (err) {
            console.error('[DocumentsPage] Error fetching document from URL:', err)
          }
        }
        
        fetchDocument()
      }
    }

    // Handle third pane from URL
    const relatedDocumentId = params.get('related')
    const relatedType = params.get('relatedType')
    if (relatedDocumentId && relatedType) {
      const id = parseInt(relatedDocumentId)
      if (!isNaN(id)) {
        // For now, we'll create a basic document object
        // In a real implementation, you'd fetch the related document data
        const relatedDoc = { id, type: relatedType }
        handleRelatedDocumentSelect(relatedDoc, relatedType)
      }
    }
    
    // Mark hydration as complete after a short delay to ensure all state updates have settled
    setTimeout(() => {
      isHydrated.current = true
    }, 100)
  }, []) // Only run once on mount

  // Update URL when filters or sort change
  const updateUrl = (
    newFilters: DocumentsFiltersType, 
    newSort: DocumentsSortConfig,
    selectedDocId?: number | null, // null means explicitly remove, undefined means preserve current
    newGroupingMode?: GroupingMode, // optional, if not provided, preserve current
    relatedDocId?: number | null, // null means explicitly remove, undefined means preserve current
    relatedDocType?: string | null // null means explicitly remove, undefined means preserve current
  ) => {
    // ✅ Start with CURRENT URL params to preserve everything
    const searchParams = new URLSearchParams(params.toString())
    
    // Update/remove filters in URL
    if (newFilters.q) {
      searchParams.set('q', newFilters.q)
    } else {
      searchParams.delete('q')
    }
    
    if (newFilters.direction) {
      searchParams.set('direction', newFilters.direction)
    } else {
      searchParams.delete('direction')
    }
    
    if (newFilters.kind.length > 0) {
      searchParams.set('kind', newFilters.kind.join(','))
    } else {
      searchParams.delete('kind')
    }
    
    if (newFilters.status.length > 0) {
      searchParams.set('status', newFilters.status.join(','))
    } else {
      searchParams.delete('status')
    }
    
    if (newFilters.currency) {
      searchParams.set('currency', newFilters.currency)
    } else {
      searchParams.delete('currency')
    }
    
    if (newFilters.fromTeam.length > 0) {
      searchParams.set('fromTeam', newFilters.fromTeam.join(','))
    } else {
      searchParams.delete('fromTeam')
    }
    
    if (newFilters.toTeam.length > 0) {
      searchParams.set('toTeam', newFilters.toTeam.join(','))
    } else {
      searchParams.delete('toTeam')
    }
    
    if (newFilters.fromDate) {
      searchParams.set('fromDate', newFilters.fromDate)
    } else {
      searchParams.delete('fromDate')
    }
    
    if (newFilters.toDate) {
      searchParams.set('toDate', newFilters.toDate)
    } else {
      searchParams.delete('toDate')
    }
    
    if (newFilters.projects.length > 0) {
      searchParams.set('projects', newFilters.projects.join(','))
    } else {
      searchParams.delete('projects')
    }
    
    // Update sort in URL (only if not default)
    if (newSort.field !== 'doc_date' || newSort.direction !== 'desc') {
      searchParams.set('sort', `${newSort.field}.${newSort.direction}`)
    } else {
      searchParams.delete('sort')
    }
    
    // Update grouping mode in URL (only if not default)
    if (newGroupingMode !== undefined) {
      if (newGroupingMode !== 'month') {
        searchParams.set('group_by', newGroupingMode)
      } else {
        searchParams.delete('group_by')
      }
    }
    // If newGroupingMode is undefined, group_by param is preserved from current URL
    
    // Handle selected document parameter
    if (selectedDocId === null) {
      searchParams.delete('document')
    } else if (selectedDocId !== undefined) {
      searchParams.set('document', selectedDocId.toString())
    }
    // If selectedDocId is undefined, document param is preserved from current URL

    // Handle third pane parameters
    if (relatedDocId === null) {
      searchParams.delete('related')
    } else if (relatedDocId !== undefined) {
      searchParams.set('related', relatedDocId.toString())
    }
    // If relatedDocId is undefined, related param is preserved from current URL

    if (relatedDocType === null) {
      searchParams.delete('relatedType')
    } else if (relatedDocType !== undefined) {
      searchParams.set('relatedType', relatedDocType)
    }
    // If relatedDocType is undefined, relatedType param is preserved from current URL
    
    const newUrl = `${pathname}?${searchParams.toString()}`
    router.push(newUrl)
  }

  // Handle search input changes
  useEffect(() => {
    // Skip URL update during hydration to prevent overwriting URL params
    if (!isHydrated.current) {
      return
    }
    
    console.log('[DocumentsPage] Debounced search changed:', debouncedSearch)
    const newFilters = { ...filters, q: debouncedSearch }
    setFilters(newFilters)
    updateUrl(newFilters, sort) // Will preserve all URL params
    console.log('[DocumentsPage] Updated filters and URL with search:', debouncedSearch)
  }, [debouncedSearch])

  // Handle filter changes
  const handleFiltersChange = (newFilters: DocumentsFiltersType) => {
    setFilters(newFilters)
    updateUrl(newFilters, sort)
  }

  // Handle sort changes
  const handleSortChange = (newSort: DocumentsSortConfig) => {
    setSort(newSort)
    updateUrl(filters, newSort)
  }
  
  // Handle grouping mode change
  const handleGroupingModeChange = (newMode: GroupingMode) => {
    // Check if mode actually changed
    if (newMode === groupingMode) return
    
    // Update grouping mode (keep current sort - don't reset it)
    setGroupingMode(newMode)
    
    // Update URL with new grouping mode and CURRENT sort (preserve both)
    updateUrl(filters, sort, undefined, newMode, undefined, undefined)
    
    // Reset optimistic totals
    setOptimisticGroupTotals(undefined)
    
    // Clear all infinite query caches for documents to force refetch
    // This ensures we get data with the correct grouping-compatible ordering
    queryClient.removeQueries({ queryKey: ['documents'] })
    
    // Invalidate group totals to refetch with new grouping
    queryClient.invalidateQueries({ queryKey: ['document-group-totals'] })
    
    // Track the change
    previousGroupingModeRef.current = newMode
    
    console.log(`[DocumentsPage] Grouping mode changed to: ${newMode}, keeping current sort:`, sort)
  }

  // Handle document selection
  const handleDocumentSelect = (document: DocumentRow) => {
    setSelectedDocument(document)
    updateUrl(filters, sort, document.doc_id, undefined, undefined, undefined)
  }

  // Handle document details close
  const handleDocumentDetailsClose = () => {
    setSelectedDocument(null)
    updateUrl(filters, sort, null, undefined, null, null) // null explicitly removes document and third pane params
  }

  // Handle document update (optimistic updates)
  const handleDocumentUpdate = (updatedDocument: DocumentRow) => {
    // Update the selected document if it's the same one
    if (selectedDocument && selectedDocument.doc_id === updatedDocument.doc_id) {
      setSelectedDocument(updatedDocument)
    }
    
    // Update all caches optimistically
    updateDocumentInCaches(queryClient, updatedDocument.doc_id, updatedDocument, updatedDocument.doc_kind)
  }

  // Handle document deletion (optimistic updates)
  const handleDocumentDelete = (documentId: number, docKind?: string) => {
    // Close the details pane if the deleted document is selected
    if (selectedDocument && selectedDocument.doc_id === documentId) {
      setSelectedDocument(null)
    }
    
    // Remove from all caches optimistically
    removeDocumentFromCaches(queryClient, documentId, docKind)
    
    // Emit custom event for other components
    window.dispatchEvent(new CustomEvent('documentDeleted', {
      detail: { documentId }
    }))
  }


  // Handle document creation (optimistic updates)
  const handleDocumentCreate = (newDocument: DocumentRow) => {
    // Add to all caches optimistically
    addDocumentToCaches(queryClient, newDocument, groupingMode)
    
    // Update group totals optimistically
    const groupTotalsQueryKey = ['document-group-totals', JSON.stringify(filters), groupingMode]
    const currentTotals = queryClient.getQueryData<DocumentGroupTotals[]>(groupTotalsQueryKey) || []
    
    if (newDocument.doc_kind === 'invoice' || newDocument.doc_kind === 'credit_note') {
      const groupKey = getDocumentGroupKey(newDocument, groupingMode)
      const updatedTotals = optimisticallyUpdateTotals(
        currentTotals,
        groupKey,
        newDocument.doc_kind,
        newDocument.direction,
        newDocument.total_amount
      )
      
      // Set optimistic totals in state
      setOptimisticGroupTotals(updatedTotals)
      
      // Update query cache
      queryClient.setQueryData(groupTotalsQueryKey, updatedTotals)
      
      // Clear optimistic state after a delay (let server data replace it)
      setTimeout(() => {
        setOptimisticGroupTotals(undefined)
        queryClient.invalidateQueries({ queryKey: groupTotalsQueryKey })
      }, 2000)
    }
    
    // Emit custom event for other components
    window.dispatchEvent(new CustomEvent('documentCreated', {
      detail: { document: newDocument }
    }))
  }

  // Build trailing query for the table
  const trailingQuery = useMemo(() => 
    buildDocumentsTrailingQuery(filters, sort, groupingMode), 
    [filters, sort, groupingMode]
  )

  // Get active filter badges
  const getActiveFilterBadges = () => {
    const badges = []
    
    if (filters.direction) {
      badges.push({
        id: 'direction',
        label: 'Direction',
        value: filters.direction === 'ar' ? 'AR' : 'AP',
        onRemove: () => handleFiltersChange({ ...filters, direction: '' })
      })
    }
    
    if (filters.kind.length > 0) {
      badges.push({
        id: 'kind',
        label: 'Type',
        value: filters.kind.join(', '),
        onRemove: () => handleFiltersChange({ ...filters, kind: [] })
      })
    }
    
    if (filters.status.length > 0) {
      badges.push({
        id: 'status',
        label: 'Status',
        value: filters.status.join(', '),
        onRemove: () => handleFiltersChange({ ...filters, status: [] })
      })
    }
    
    if (filters.currency) {
      badges.push({
        id: 'currency',
        label: 'Currency',
        value: filters.currency,
        onRemove: () => handleFiltersChange({ ...filters, currency: '' })
      })
    }
    
    if (filters.fromTeam.length > 0) {
      badges.push({
        id: 'fromTeam',
        label: 'From Team',
        value: filters.fromTeam.join(', '),
        onRemove: () => handleFiltersChange({ ...filters, fromTeam: [] })
      })
    }
    
    if (filters.toTeam.length > 0) {
      badges.push({
        id: 'toTeam',
        label: 'To Team',
        value: filters.toTeam.join(', '),
        onRemove: () => handleFiltersChange({ ...filters, toTeam: [] })
      })
    }

    if (filters.projects.length > 0) {
      badges.push({
        id: 'projects',
        label: 'Projects',
        value: filters.projects.join(', '),
        onRemove: () => handleFiltersChange({ ...filters, projects: [] })
      })
    }
    
    if (filters.fromDate || filters.toDate) {
      const dateRange = [filters.fromDate, filters.toDate].filter(Boolean).join(' - ')
      badges.push({
        id: 'dateRange',
        label: 'Date Range',
        value: dateRange,
        onRemove: () => handleFiltersChange({ ...filters, fromDate: '', toDate: '' })
      })
    }
    
    return badges
  }

  const handleClearAllFilters = () => {
    const emptyFilters: DocumentsFiltersType = {
      q: '',
      direction: '',
      kind: [],
      status: [],
      currency: '',
      fromTeam: [],
      toTeam: [],
      fromDate: '',
      toDate: '',
      projects: [],
    }
    setFilters(emptyFilters)
    setSearchInput('')
    updateUrl(emptyFilters, sort)
  }

  const activeFilterBadges = getActiveFilterBadges()
  const activeFilterCount = activeFilterBadges.length + (filters.q ? 1 : 0)

  if (!isClient) {
    return (
      <div className="flex h-screen bg-white">
        <div className="flex-1 flex flex-col min-w-0">
          <div className="bg-white border-b border-gray-200 px-6 py-4">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-semibold text-gray-900">Documents (Unified) --- Test</h1>
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

  return (
    <div className="flex h-full relative">
      {/* Main Content */}
      <div className={`flex-1 flex flex-col min-w-0 transition-all duration-200 ${selectedDocument ? (isThirdPaneOpen ? 'w-[calc(100%-768px)]' : 'w-[calc(100%-384px)]') : 'w-full'}`}>
      {/* Summary Cards */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <DocumentsSummaryCards 
          filters={filters} 
          onTimeFrameChange={(timeFrame) => {
            // Handle time frame change - you can implement date filtering logic here
            console.log('Time frame changed:', timeFrame)
          }}
        />
      </div>

      {/* Unified Filter Bar */}
      <DocumentsUnifiedFilterBar
        filters={filters}
        onFiltersChange={handleFiltersChange}
        activeFilterBadges={activeFilterBadges}
        onClearAllFilters={handleClearAllFilters}
        onAddInvoice={() => setIsCreateInvoiceModalOpen(true)}
        onAddPayment={() => setIsCreatePaymentModalOpen(true)}
        onAddCreditNote={() => setIsCreateCreditNoteModalOpen(true)}
      />


      {/* Table */}
      <div className="flex-1 min-h-0">
        <DocumentsTableGrouped
          filters={filters}
          sort={sort}
          onSortChange={handleSortChange}
          onDocumentSelect={handleDocumentSelect}
          selectedDocument={selectedDocument}
          trailingQuery={trailingQuery}
          hasRightPaneOpen={!!selectedDocument}
          groupingMode={groupingMode}
          onGroupingModeChange={handleGroupingModeChange}
          optimisticGroupTotals={optimisticGroupTotals}
        />
      </div>
      </div>

      {/* Right Pane */}
      {selectedDocument && (
        <div className={`fixed top-0 bg-white border-l border-gray-200 flex flex-col h-screen z-40 shadow-lg transition-all duration-200 ${isThirdPaneOpen ? 'right-96 w-96' : 'right-0 w-96'}`}>
          <DocumentDetailsPane
            key={`doc-${selectedDocument.doc_id}-${selectedDocument.doc_kind}`}
            document={selectedDocument}
            onClose={handleDocumentDetailsClose}
            onDocumentUpdate={handleDocumentUpdate}
            onDocumentDelete={handleDocumentDelete}
            onDocumentCreate={handleDocumentCreate}
            menuAction={menuAction}
            onMenuActionHandled={() => setMenuAction(null)}
            onMenuAction={setMenuAction}
            onRelatedDocumentSelect={handleRelatedDocumentSelect}
          />
        </div>
      )}

      {/* Third Pane - Related Document Details */}
      {selectedRelatedDocument && (
        <div className="fixed top-0 right-0 w-96 bg-white border-l border-gray-200 flex flex-col h-screen z-50 shadow-lg">
          <div className="flex-1 overflow-auto">
            {/* Third pane content will be rendered here based on relatedDocumentType */}
            {relatedDocumentType === 'production_order' && (
              <ProductionOrderDetailsPane
                productionOrderId={selectedRelatedDocument.id}
                onClose={handleRelatedDocumentClose}
                initialProductionOrder={selectedRelatedDocument}
                showHeader={true}
              />
            )}
            {relatedDocumentType === 'task' && (
              <TaskDetailsPane
                taskId={selectedRelatedDocument.id}
                onClose={handleRelatedDocumentClose}
                isExpanded={false}
                onExpand={() => {}}
                onCollapse={() => {}}
                initialTaskData={selectedRelatedDocument}
              />
            )}
            {relatedDocumentType === 'payment' && (
              <PaymentDetailsPane
                paymentId={selectedRelatedDocument.payment_id || selectedRelatedDocument.id || selectedRelatedDocument.doc_id}
                initialPayment={selectedRelatedDocument}
                direction="ar"
                onPaymentUpdate={() => {}}
                onPaymentDelete={() => {}}
                onClose={handleRelatedDocumentClose}
                onRelatedDocumentSelect={handleRelatedDocumentSelect}
                showHeader={true}
              />
            )}
            {relatedDocumentType === 'supplier_payment' && (
              <PaymentDetailsPane
                paymentId={selectedRelatedDocument.payment_id || selectedRelatedDocument.id || selectedRelatedDocument.doc_id}
                initialPayment={selectedRelatedDocument}
                direction="ap"
                onPaymentUpdate={() => {}}
                onPaymentDelete={() => {}}
                onClose={handleRelatedDocumentClose}
                onRelatedDocumentSelect={handleRelatedDocumentSelect}
                showHeader={true}
              />
            )}
            {relatedDocumentType === 'invoice' && (
              selectedRelatedDocument.direction === 'ar' ? (
                <IssuedInvoiceDetail
                  id={selectedRelatedDocument.id}
                  isPane={true}
                  initialInvoice={{
                    ...selectedRelatedDocument,
                    // Map v_documents_min fields to AR invoice fields
                    invoice_number: selectedRelatedDocument.doc_number,
                    invoice_date: selectedRelatedDocument.doc_date,
                    currency_code: selectedRelatedDocument.currency_code,
                    subtotal_amount: selectedRelatedDocument.subtotal_amount,
                    vat_amount: selectedRelatedDocument.vat_amount,
                    total_amount: selectedRelatedDocument.total_amount,
                    balance_due: selectedRelatedDocument.balance_due,
                    status: selectedRelatedDocument.status,
                    issuer_team_id: selectedRelatedDocument.from_team_id,
                    issuer_team_name: selectedRelatedDocument.from_team_name,
                    payer_team_id: selectedRelatedDocument.to_team_id,
                    payer_team_name: selectedRelatedDocument.to_team_name,
                    projects_text: selectedRelatedDocument.projects_text,
                    amount_paid: selectedRelatedDocument.amount_paid,
                    created_at: selectedRelatedDocument.created_at,
                    updated_at: selectedRelatedDocument.updated_at
                  }}
                  onRelatedDocumentSelect={handleRelatedDocumentSelect}
                  showHeader={true}
                  onClose={handleRelatedDocumentClose}
                />
              ) : (
                <SupplierInvoiceDetailsPane
                  invoiceId={selectedRelatedDocument.id}
                  onClose={handleRelatedDocumentClose}
                  onInvoiceUpdate={() => {}}
                  initialInvoice={{
                    ...selectedRelatedDocument,
                    // Map v_documents_min fields to AP invoice fields
                    invoice_number: selectedRelatedDocument.doc_number,
                    invoice_date: selectedRelatedDocument.doc_date,
                    currency_code: selectedRelatedDocument.currency_code,
                    subtotal_amount: selectedRelatedDocument.subtotal_amount,
                    vat_amount: selectedRelatedDocument.vat_amount,
                    total_amount: selectedRelatedDocument.total_amount,
                    balance_due: selectedRelatedDocument.balance_due,
                    status: selectedRelatedDocument.status,
                    supplier_team_id: selectedRelatedDocument.from_team_id,
                    supplier_team_name: selectedRelatedDocument.from_team_name,
                    payer_team_id: selectedRelatedDocument.to_team_id,
                    payer_team_name: selectedRelatedDocument.to_team_name,
                    projects_text: selectedRelatedDocument.projects_text,
                    amount_paid: selectedRelatedDocument.amount_paid,
                    created_at: selectedRelatedDocument.created_at,
                    updated_at: selectedRelatedDocument.updated_at
                  }}
                  onRelatedDocumentSelect={handleRelatedDocumentSelect}
                  showHeader={true}
                />
              )
            )}
            {relatedDocumentType === 'credit_note' && (
              <CreditNoteDetailsPane
                creditNoteId={selectedRelatedDocument.credit_note_id || selectedRelatedDocument.id}
                onClose={handleRelatedDocumentClose}
                onCreditNoteUpdate={() => {}}
                onCreditNoteDelete={() => {}}
                onRelatedDocumentSelect={handleRelatedDocumentSelect}
                initialCreditNote={{
                  ...selectedRelatedDocument,
                  // Map v_documents_min fields to credit note fields
                  credit_number: selectedRelatedDocument.doc_number,
                  credit_date: selectedRelatedDocument.doc_date,
                  currency_code: selectedRelatedDocument.currency_code,
                  subtotal_amount: selectedRelatedDocument.subtotal_amount,
                  vat_amount: selectedRelatedDocument.vat_amount,
                  total_amount: selectedRelatedDocument.total_amount,
                  status: selectedRelatedDocument.status,
                  issuer_team_id: selectedRelatedDocument.from_team_id,
                  issuer_team_name: selectedRelatedDocument.from_team_name,
                  payer_team_id: selectedRelatedDocument.to_team_id,
                  payer_team_name: selectedRelatedDocument.to_team_name,
                  // Also map the v_documents_min field names for direct access
                  from_team_name: selectedRelatedDocument.from_team_name,
                  to_team_name: selectedRelatedDocument.to_team_name,
                  created_at: selectedRelatedDocument.created_at,
                  updated_at: selectedRelatedDocument.updated_at
                }}
                direction={selectedRelatedDocument.direction || 'ar'}
                showHeader={true}
              />
            )}
            {relatedDocumentType === 'invoice_order' && (
              <InvoiceOrderLinesDrawer
                order={selectedRelatedDocument as any}
                onClose={handleRelatedDocumentClose}
                onOpenIssuedInvoice={() => {}}
                onExpandInvoiceLines={() => {}}
                hasOpenInvoiceDetail={false}
                hasOpenTaskDetails={false}
                onRelatedDocumentSelect={handleRelatedDocumentSelect}
                onTaskClick={(taskId, taskData) => {
                  // Open task details in third pane
                  if (handleRelatedDocumentSelect) {
                    handleRelatedDocumentSelect({
                      task_id: taskId,
                      title: taskData?.title || `Task ${taskId}`,
                      delivery_date: taskData?.delivery_date,
                      project_id: taskData?.project_id,
                      id: taskId,
                      doc_id: taskId,
                      doc_kind: 'task',
                      direction: 'ar',
                      doc_number: `TASK-${taskId}`,
                      doc_date: taskData?.delivery_date || new Date().toISOString()
                    }, 'task')
                  }
                }}
              />
            )}
          </div>
        </div>
      )}

      {/* Filter Panel */}
      <DocumentsFilters
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        filters={filters}
        onFiltersChange={handleFiltersChange}
      />

      {/* Create Modals */}
      <SharedInvoiceCreateModal
        isOpen={isCreateInvoiceModalOpen}
        onClose={() => setIsCreateInvoiceModalOpen(false)}
        onSuccess={(document) => {
          console.log('Invoice created:', document)
          handleDocumentCreate(document)
          setIsCreateInvoiceModalOpen(false)
        }}
        sortConfig={{ field: 'invoice_date', direction: 'desc' }}
      />

      <SharedPaymentCreateModal
        isOpen={isCreatePaymentModalOpen}
        onClose={() => setIsCreatePaymentModalOpen(false)}
        onSuccess={(document) => {
          handleDocumentCreate(document)
          setIsCreatePaymentModalOpen(false)
        }}
        initialStep={1}
        sortConfig={{ field: 'payment_date', direction: 'desc' }}
      />

      <CreditNoteCreateModal
        isOpen={isCreateCreditNoteModalOpen}
        onClose={() => setIsCreateCreditNoteModalOpen(false)}
        onCreditNoteCreated={async (creditNoteId, teamInfo) => {
          // If we have team info from the form, use it for immediate optimistic update
          if (teamInfo) {
            const document = {
              doc_id: creditNoteId,
              direction: teamInfo.creditNoteType === 'AR' ? 'ar' as const : 'ap' as const,
              doc_kind: 'credit_note' as const,
              doc_number: teamInfo.creditNumber || `CN-${creditNoteId}`,
              doc_date: teamInfo.creditDate,
              currency_code: teamInfo.currencyCode,
              subtotal_amount: -Math.abs(teamInfo.subtotalAmount),
              vat_amount: -Math.abs(teamInfo.vatAmount),
              total_amount: -Math.abs(teamInfo.totalAmount),
              status: 'issued',
              from_team_id: teamInfo.supplierTeamId,
              from_team_name: teamInfo.supplierTeamName,
              to_team_id: teamInfo.payerTeamId,
              to_team_name: teamInfo.payerTeamName,
              balance_due: -Math.abs(teamInfo.totalAmount), // Initial balance is the total amount
              projects_text: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }
            handleDocumentCreate(document)
            setIsCreateCreditNoteModalOpen(false)
            
            // Fetch full details in the background to update the cache with correct values
            try {
              const { createClientComponentClient } = await import('@supabase/auth-helpers-nextjs')
              const supabase = createClientComponentClient()
              
              const viewName = teamInfo.creditNoteType === 'AR' ? 'v_credit_notes_summary' : 'v_received_credit_notes_summary'
              const { data: fullCreditNote } = await supabase
                .from(viewName)
                .select('*')
                .eq('credit_note_id', creditNoteId)
                .single()

              if (fullCreditNote) {
                // Update the document with full details (negative amounts for credit notes)
                const updatedDocument = {
                  ...document,
                  doc_number: fullCreditNote.credit_number || document.doc_number,
                  doc_date: fullCreditNote.credit_date,
                  currency_code: fullCreditNote.currency_code,
                  subtotal_amount: -Math.abs(fullCreditNote.subtotal_amount),
                  vat_amount: -Math.abs(fullCreditNote.vat_amount),
                  total_amount: -Math.abs(fullCreditNote.total_amount),
                  balance_due: -Math.abs(fullCreditNote.unapplied_amount),
                  created_at: fullCreditNote.created_at,
                  updated_at: fullCreditNote.updated_at
                }
                updateDocumentInCaches(queryClient, creditNoteId, updatedDocument, 'credit_note')
              }
            } catch (error) {
              console.error('Error fetching full credit note details:', error)
            }
          } else {
            // Fallback: fetch from view if no team info provided
            try {
              const { createClientComponentClient } = await import('@supabase/auth-helpers-nextjs')
              const supabase = createClientComponentClient()

              const { data: creditNote, error } = await supabase
                .from('v_credit_notes_summary')
                .select('*')
                .eq('credit_note_id', creditNoteId)
                .single()

              if (!error && creditNote) {
                const document = {
                  doc_id: creditNote.credit_note_id,
                  direction: 'ar' as const,
                  doc_kind: 'credit_note' as const,
                  doc_number: creditNote.credit_number || `CN-${creditNote.credit_note_id}`,
                  doc_date: creditNote.credit_date,
                  currency_code: creditNote.currency_code,
                  subtotal_amount: -Math.abs(creditNote.subtotal_amount),
                  vat_amount: -Math.abs(creditNote.vat_amount),
                  total_amount: -Math.abs(creditNote.total_amount),
                  status: creditNote.status || 'issued',
                  from_team_id: creditNote.issuer_team_id,
                  from_team_name: creditNote.issuer_team_name,
                  to_team_id: creditNote.payer_team_id,
                  to_team_name: creditNote.payer_team_name,
                  balance_due: -Math.abs(creditNote.unapplied_amount),
                  projects_text: null,
                  created_at: creditNote.created_at,
                  updated_at: creditNote.updated_at
                }
                handleDocumentCreate(document)
              }
            } catch (error) {
              console.error('Error fetching credit note details:', error)
            }
            setIsCreateCreditNoteModalOpen(false)
          }
        }}
      />
    </div>
  )
}

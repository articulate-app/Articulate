"use client"

import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { X, Plus } from 'lucide-react'
import { InvoiceOrdersTable } from './InvoiceOrdersTable'
import { InvoiceOrdersFilters } from './InvoiceOrdersFilters'
import { InvoiceOrderLinesDrawer } from './InvoiceOrderLinesDrawer'
import { InvoiceLinesFullscreenView } from './InvoiceOrderLinesDrawer'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { TaskDetails } from '../tasks/TaskDetails'
import { useTaskEditFields } from '../../hooks/use-task-edit-fields'
import { normalizeTask } from '../tasks/task-cache-utils'
import { Button } from '../ui/button'
import { BulkActionBar } from './BulkActionBar'
import IssuedInvoiceDetail from './IssuedInvoiceDetail'
import { CreateAndIssueInvoiceModal } from './CreateAndIssueInvoiceModal'
import { parseFiltersFromUrl, parseSortFromUrl } from '../../lib/services/billing'
import { getItemFromStore } from '../../../hooks/use-infinite-query'
import { useCurrentUserStore } from '../../store/current-user'
import { toast } from '../ui/use-toast'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { InvoiceOrder, InvoiceOrderFilters, InvoiceOrderSortConfig } from '../../lib/types/billing'
import { useDebounce } from '../../hooks/use-debounce'
import { FilterBadges } from '../../../components/ui/filter-badges'

// Helper to map invoice order filters to badges
function getActiveInvoiceOrderFilterBadges(
  filters: InvoiceOrderFilters,
  setFilters: (filters: InvoiceOrderFilters) => void,
  router: any,
  pathname: string,
  params: URLSearchParams,
  filterOptions?: { projects?: Array<{ id: number; name: string }> }
): { badges: Array<{ id: string; label: string; value: string; onRemove: () => void }>; onClearAll: () => void } {
  const badges: Array<{ id: string; label: string; value: string; onRemove: () => void }> = []
  
  // Helper function to get user-friendly labels
  const getLabel = (key: string, val: string): string => {
    if (!filterOptions) return val
    switch (key) {
      case 'project': {
        const project = filterOptions.projects?.find(p => String(p.id) === String(val))
        return project?.name || val
      }
      default:
        return val
    }
  }
  
  const updateUrl = (newFilters: InvoiceOrderFilters) => {
    const newParams = new URLSearchParams(params.toString())
    
    // Clear all filter params
    const filterKeys = ['search', 'project', 'periodFrom', 'periodTo', 'status', 'invoiced', 'remaining']
    filterKeys.forEach((key: string) => newParams.delete(key))
    
    // Set new filter params
    if (newFilters.search) newParams.set('search', newFilters.search)
    if (newFilters.project?.length) newParams.set('project', newFilters.project.join(','))
    if (newFilters.period?.from) newParams.set('periodFrom', newFilters.period.from.toISOString().slice(0, 10))
    if (newFilters.period?.to) newParams.set('periodTo', newFilters.period.to.toISOString().slice(0, 10))
    if (newFilters.status?.length) newParams.set('status', newFilters.status.join(','))
    if (newFilters.invoiced && newFilters.invoiced !== 'all') newParams.set('invoiced', newFilters.invoiced === 'yes' ? '1' : '0')
    if (newFilters.remaining && newFilters.remaining !== 'all') newParams.set('remaining', newFilters.remaining)
    
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

  // Project filters
  if (filters.project?.length) {
    filters.project.forEach(projectId => {
      badges.push({
        id: `project-${projectId}`,
        label: 'Project',
        value: getLabel('project', projectId),
        onRemove: () => {
          const newFilters = { ...filters, project: filters.project.filter(id => id !== projectId) }
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
  if (filters.period?.from) {
    badges.push({
      id: 'period-from',
      label: 'Billing Period',
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
      label: 'Billing Period',
      value: `to ${filters.period.to.toLocaleDateString()}`,
      onRemove: () => {
        const newFilters = { ...filters, period: { ...filters.period, to: undefined } }
        updateUrl(newFilters)
      }
    })
  }

  // Invoiced filter
  if (filters.invoiced && filters.invoiced !== 'all') {
    badges.push({
      id: 'invoiced',
      label: 'Invoiced',
      value: filters.invoiced === 'yes' ? 'Yes' : 'No',
      onRemove: () => {
        const newFilters = { ...filters, invoiced: 'all' as const }
        updateUrl(newFilters)
      }
    })
  }

  // Remaining filter
  if (filters.remaining && filters.remaining !== 'all') {
    badges.push({
      id: 'remaining',
      label: 'Remaining',
      value: 'Has Remaining',
      onRemove: () => {
        const newFilters = { ...filters, remaining: 'all' as const }
        updateUrl(newFilters)
      }
    })
  }

  // Function to clear all filters
  const onClearAll = () => {
    const emptyFilters: InvoiceOrderFilters = {
      project: [],
      period: {},
      status: [],
      invoiced: 'all' as const,
      remaining: 'all' as const,
      search: ''
    }
    updateUrl(emptyFilters)
  }

  return { badges, onClearAll }
}

// Task details pane component that uses Edge Functions
function TaskDetailsPane({ 
  taskId, 
  onClose, 
  isExpanded = false, 
  onExpand, 
  onCollapse,
  hasOpenInvoiceDetail = false,
  initialTaskData = null
}: { 
  taskId: number; 
  onClose: () => void;
  isExpanded?: boolean;
  onExpand?: () => void;
  onCollapse?: () => void;
  hasOpenInvoiceDetail?: boolean;
  initialTaskData?: any;
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

  // Transform initial task data from v_billing_period_tasks to match bootstrap data structure
  const transformInitialTaskData = (initialData: any) => {
    if (!initialData) return null
    
    // Create a task object that matches the bootstrap data structure
    // This ensures React sees it as the same type of object
    return {
      id: initialData.task_id,
      title: initialData.title,
      delivery_date: initialData.delivery_date,
      publication_date: initialData.publication_date,
      production_type_title: initialData.production_type_title,
      content_type_title: initialData.content_type_title,
      language_code: initialData.language_code,
      assigned_to_name: initialData.assigned_to_name,
      is_billable_candidate: initialData.is_billable_candidate,
      project_name: initialData.project_name || null,
      project_status_name: initialData.project_status_name || null,
      project_status_color: initialData.project_status_color || null,
      is_overdue: initialData.is_overdue || false,
      is_publication_overdue: initialData.is_publication_overdue || false,
      // Add minimal required fields with null values (will be filled by bootstrap)
      assigned_to_id: null,
      project_id_int: null,
      project_color: null,
      project_status_id: null,
      content_type_id: null,
      production_type_id: null,
      language_id: null,
      channel_names: [],
      copy_post: null,
      briefing: null,
      notes: null,
      meta_title: null,
      meta_description: null,
      keyword: null,
      key_visual_attachment_id: null,
      parent_task_id_int: null,
      thread_id: null,
      threads: [],
      mentions: [],
      watchers: [],
      review_data: null
    }
  }

  // Use useState to maintain a stable task object that triggers re-renders
  const [displayTask, setDisplayTask] = useState<any>(null)
  
  // Update the task object when data changes
  useEffect(() => {
    if (initialTaskData) {
      // Initialize with initial data
      const initialTask = transformInitialTaskData(initialTaskData)
      setDisplayTask(initialTask)
    }
    
    if (taskData?.task) {
      // Update with bootstrap data, preserving the initial structure
      setDisplayTask((prevTask: any) => {
        if (prevTask) {
          return {
            ...prevTask,
            ...taskData.task,
            // Keep the original ID format
            id: prevTask.id,
          }
        } else {
          return taskData.task
        }
      })
    }
  }, [taskData?.task, initialTaskData])

  // Always render the full TaskDetails component - it handles its own loading states
  return (
    <div className={`bg-white flex flex-col ${isExpanded ? 'w-full h-full' : 'fixed top-0 w-96 border-l border-gray-200 h-screen'}`} style={!isExpanded ? { right: hasOpenInvoiceDetail ? '384px' : '0px', zIndex: 45 } : {}}>
      <TaskDetails
        isCollapsed={false}
        selectedTask={displayTask}
        onClose={onClose}
        onCollapse={onClose}
        isExpanded={isExpanded}
        onExpand={isExpanded ? undefined : onExpand}
        onRestore={isExpanded ? onCollapse : undefined}
        attachments={taskData?.attachments || []}
        mentions={taskData?.mentions || []}
        watchers={taskData?.watchers || []}
        currentUser={currentUser}
        subtasks={taskData?.subtasks || []}
        project_watchers={taskData?.project_watchers || []}
        accessToken={accessToken}
      />
    </div>
  )
}

interface InvoiceOrdersListPageProps {
  searchValue?: string
  onSearchChange?: (value: string) => void
  onFilterClick?: () => void
  isFilterOpen?: boolean
  setIsFilterOpen?: (open: boolean) => void
}

export default function InvoiceOrdersListPage({ 
  searchValue: layoutSearchValue, 
  onSearchChange: layoutOnSearchChange,
  onFilterClick: layoutOnFilterClick,
  isFilterOpen: layoutIsFilterOpen,
  setIsFilterOpen: layoutSetIsFilterOpen
}: InvoiceOrdersListPageProps = {}) {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  
  // State
  const [filters, setFilters] = useState<InvoiceOrderFilters>({
    project: [],
    period: {},
    status: [],
    invoiced: 'all',
    remaining: 'all',
    search: '',
  })
  const [sort, setSort] = useState<InvoiceOrderSortConfig>({
    field: 'billing_period_start',
    direction: 'desc',
  })
  const [selectedOrder, setSelectedOrder] = useState<InvoiceOrder | null>(null)
  const [selectedOrders, setSelectedOrders] = useState<Set<number>>(new Set())
  const [selectedIssuedInvoice, setSelectedIssuedInvoice] = useState<any>(null)
  const [localIsFilterOpen, setLocalIsFilterOpen] = useState(false)
  const isFilterOpen = layoutIsFilterOpen !== undefined ? layoutIsFilterOpen : localIsFilterOpen
  const setIsFilterOpen = layoutSetIsFilterOpen || setLocalIsFilterOpen
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [createInvoiceOrderIds, setCreateInvoiceOrderIds] = useState<number[]>([])
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null)
  const [isTaskExpanded, setIsTaskExpanded] = useState(false)
  const [initialTaskData, setInitialTaskData] = useState<any>(null)
  const [expandedInvoiceOrder, setExpandedInvoiceOrder] = useState<InvoiceOrder | null>(null)
  const [expandedSearchQuery, setExpandedSearchQuery] = useState('')
  const [invoiceLines, setInvoiceLines] = useState<any[]>([])
  const { publicUserId } = useCurrentUserStore()
  const queryClient = useQueryClient()

  // Use layout search value or fallback to local state
  const [localSearchInput, setLocalSearchInput] = useState('')
  const searchInput = layoutSearchValue !== undefined ? layoutSearchValue : localSearchInput
  const setSearchInput = layoutOnSearchChange || setLocalSearchInput
  
  // Debounced search for better performance
  const debouncedSearch = useDebounce(searchInput, 300)

  // Fetch projects for filter badges
  const supabase = createClientComponentClient()
  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name')
        .order('name')
      if (error) throw error
      return data.map(project => ({ id: project.id, name: project.name }))
    },
    enabled: true,
  })

  // Sync debounced search with filters and URL
  useEffect(() => {
    if (debouncedSearch !== filters.search) {
      const newFilters = { ...filters, search: debouncedSearch }
      setFilters(newFilters)
      handleFiltersChange(newFilters)
    }
  }, [debouncedSearch])


  // Listen for the create button event from the layout
  useEffect(() => {
    const handleCreate = (event: CustomEvent) => {
      if (event.detail.pathname === '/billing/invoice-orders') {
        // Open the create modal (assuming there's a create modal for invoice orders)
        setIsCreateModalOpen(true)
      }
    }

    const handleFilterClick = (event: CustomEvent) => {
      if (event.detail.pathname === '/billing/invoice-orders') {
        setIsFilterOpen(true)
      }
    }

    const handleSearch = (event: CustomEvent) => {
      if (event.detail.pathname === '/billing/invoice-orders') {
        console.log('[InvoiceOrdersListPage] Received search event:', event.detail.value)
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

  // Listen for invoice order updates from child components
  useEffect(() => {
    const handleInvoiceOrderUpdate = (event: CustomEvent) => {
      if (event.detail?.orderId && event.detail?.action === 'invoice_created') {
        // Refresh the invoice order data to show updated statuses and amounts
        queryClient.invalidateQueries({ queryKey: ['v_invoice_orders_list'] })
        
        // If we have the specific order selected, refresh its data
        if (selectedOrder?.id === event.detail.orderId) {
          // Trigger a refetch of the selected order data
          queryClient.invalidateQueries({ 
            queryKey: ['issued-invoices-for-order', event.detail.orderId] 
          })
        }
      }
    }

    const handleInvoiceCreatedAndIssued = (event: CustomEvent) => {
      if (event.detail?.action === 'invoice_created_and_issued') {
        // Comprehensive refresh when an invoice is created and issued
        queryClient.invalidateQueries({ queryKey: ['v_invoice_orders_list'] })
        queryClient.invalidateQueries({ queryKey: ['v_issued_invoices_list'] })
        
        // Refresh any specific order data that might be affected
        if (event.detail.orderIds) {
          event.detail.orderIds.forEach((orderId: number) => {
            queryClient.invalidateQueries({ 
              queryKey: ['issued-invoices-for-order', orderId] 
            })
          })
        }
      }
    }

    const handleRefreshInvoiceOrderData = (event: CustomEvent) => {
      const { orderId } = event.detail
      if (orderId && selectedOrder?.id === orderId) {
        // Refresh the selected order data to show updated amounts
        queryClient.invalidateQueries({ 
          queryKey: ['issued-invoices-for-order', orderId] 
        })
        
        // Also refresh the main list to ensure consistency
        queryClient.invalidateQueries({ queryKey: ['v_invoice_orders_list'] })
        
        // Update the selectedOrder state with the latest data from the store
        const cachedData = queryClient.getQueryData(['v_invoice_orders_list'])
        if (cachedData && Array.isArray(cachedData)) {
          const updatedOrder = cachedData.find((item: any) => item.id === orderId)
          if (updatedOrder) {
            setSelectedOrder(updatedOrder)
          }
        }
      }
    }

    window.addEventListener('invoiceOrderUpdated', handleInvoiceOrderUpdate as EventListener)
    window.addEventListener('invoiceCreatedAndIssued', handleInvoiceCreatedAndIssued as EventListener)
    window.addEventListener('refreshInvoiceOrderData', handleRefreshInvoiceOrderData as EventListener)
    
    return () => {
      window.removeEventListener('invoiceOrderUpdated', handleInvoiceOrderUpdate as EventListener)
      window.removeEventListener('invoiceCreatedAndIssued', handleInvoiceCreatedAndIssued as EventListener)
      window.removeEventListener('refreshInvoiceOrderData', handleRefreshInvoiceOrderData as EventListener)
    }
  }, [queryClient, selectedOrder])

  // Hydrate from URL on mount
  useEffect(() => {
    const urlFilters = parseFiltersFromUrl(new URLSearchParams(params.toString()))
    const urlSort = parseSortFromUrl(new URLSearchParams(params.toString()))
    
    setFilters(urlFilters)
    setSearchInput(urlFilters.search || '')
    setSort(urlSort)
    
    // Sync with layout search value if available
    if (layoutOnSearchChange && urlFilters.search) {
      layoutOnSearchChange(urlFilters.search)
    }
    
    // Check for selected order in URL
    const orderId = params.get('order')
    if (orderId) {
      // Try to get the order from the store first
      const orderFromStore = getItemFromStore('v_invoice_orders_list', undefined, parseInt(orderId)) as InvoiceOrder | null
      if (orderFromStore) {
        setSelectedOrder(orderFromStore)
      }
    }

    // Check for selected task in URL
    const taskId = params.get('taskid')
    if (taskId) {
      setSelectedTaskId(parseInt(taskId))
      setIsTaskExpanded(false) // Always start with non-expanded view
      // Clear initial task data when URL changes (different task selected)
      setInitialTaskData(null)
    } else {
      setSelectedTaskId(null)
      setIsTaskExpanded(false)
      setInitialTaskData(null)
    }
  }, [params])

  // Handle focus=true when selectedOrder becomes available (for direct URL access)
  useEffect(() => {
    const focusParam = params.get('focus')
    
    // If focus=true in URL and we have a selectedOrder but no expanded view yet
    if (focusParam === 'true' && selectedOrder && !expandedInvoiceOrder) {
      setExpandedInvoiceOrder(selectedOrder)
      
      // Load invoice lines data for direct URL access
      const loadInvoiceLines = async () => {
        try {
          const supabase = createClientComponentClient()
          const { data: lines, error } = await supabase
            .from('invoice_lines')
            .select('*')
            .eq('invoice_order_id', selectedOrder.id)
            .order('id', { ascending: true })
          
          if (error) {
            console.error('Error fetching invoice lines:', error)
            setInvoiceLines([])
          } else {
            setInvoiceLines(lines || [])
          }
        } catch (err) {
          console.error('Error fetching invoice lines:', err)
          setInvoiceLines([])
        }
      }
      loadInvoiceLines()
    }
  }, [selectedOrder, params, expandedInvoiceOrder])

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
              <h1 className="text-2xl font-semibold text-gray-900">Invoice Orders</h1>
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
  const updateUrl = (newFilters: InvoiceOrderFilters, newSort: InvoiceOrderSortConfig, selectedOrderId?: number) => {
    const newParams = new URLSearchParams(params.toString())
    
    // Update search
    if (newFilters.search) {
      newParams.set('q', newFilters.search)
    } else {
      newParams.delete('q')
    }
    
    // Update project filter
    if (newFilters.project.length > 0) {
      newParams.set('projectId', newFilters.project.join(','))
    } else {
      newParams.delete('projectId')
    }
    
    // Update period filters
    if (newFilters.period.from) {
      newParams.set('from', newFilters.period.from.toISOString().split('T')[0])
    } else {
      newParams.delete('from')
    }
    if (newFilters.period.to) {
      newParams.set('to', newFilters.period.to.toISOString().split('T')[0])
    } else {
      newParams.delete('to')
    }
    
    // Update status filter
    if (newFilters.status.length > 0) {
      newParams.set('status', newFilters.status.join(','))
    } else {
      newParams.delete('status')
    }
    
    // Update remaining filter
    if (newFilters.remaining && newFilters.remaining !== 'all') {
      newParams.set('remaining', newFilters.remaining)
    } else {
      newParams.delete('remaining')
    }
    
    // Update sort
    newParams.set('sort', newSort.field)
    newParams.set('dir', newSort.direction)
    
    // Update selected order
    if (selectedOrderId) {
      newParams.set('order', selectedOrderId.toString())
    } else {
      newParams.delete('order')
    }
    
    router.replace(`${pathname}?${newParams.toString()}`)
  }

  const handleFiltersChange = (newFilters: InvoiceOrderFilters) => {
    setFilters(newFilters)
    setSearchInput(newFilters.search || '')
    
    // Update URL
    const newParams = new URLSearchParams()
    if (newFilters.search) newParams.set('q', newFilters.search)
    if (newFilters.project.length > 0) newParams.set('projectId', newFilters.project.join(','))
    if (newFilters.period.from) newParams.set('from', newFilters.period.from.toISOString().split('T')[0])
    if (newFilters.period.to) newParams.set('to', newFilters.period.to.toISOString().split('T')[0])
    if (newFilters.status.length > 0) newParams.set('status', newFilters.status.join(','))
    if (newFilters.invoiced !== 'all') newParams.set('invoiced', newFilters.invoiced)
    if (newFilters.remaining !== 'all') newParams.set('remaining', newFilters.remaining)
    if (sort.field !== 'billing_period_start' || sort.direction !== 'desc') {
      newParams.set('sort', sort.field)
      newParams.set('dir', sort.direction)
    }
    
    const newUrl = `${pathname}?${newParams.toString()}`
    window.history.replaceState({}, '', newUrl)
  }

  const getActiveFilterCount = () => {
    let count = 0
    if (debouncedSearch) count++
    if (filters.project.length > 0) count++
    if (filters.period.from || filters.period.to) count++
    if (filters.status.length > 0) count++
    if (filters.invoiced !== 'all') count++
    if (filters.remaining !== 'all') count++
    return count
  }

  const handleSortChange = (newSort: InvoiceOrderSortConfig) => {
    setSort(newSort)
    updateUrl(filters, newSort)
  }

  const handleOrderSelect = (order: InvoiceOrder) => {
    setSelectedOrder(order)
    updateUrl(filters, sort, order.id)
  }

  const handleCloseDrawer = () => {
    setSelectedOrder(null)
    updateUrl(filters, sort)
  }

  const handleOpenIssuedInvoice = async (invoiceId: number) => {
    // Get the invoice from the store first
    const invoiceFromStore = getItemFromStore('v_issued_invoices_list', undefined, invoiceId)
    if (invoiceFromStore) {
      setSelectedIssuedInvoice(invoiceFromStore)
    } else {
      // If not in store, we'll need to fetch it via React Query in the IssuedInvoiceDetail component
      setSelectedIssuedInvoice({ id: invoiceId } as any) // Temporary placeholder
    }
    
    // Update URL to include the issued invoice
    const newParams = new URLSearchParams(params.toString())
    newParams.set('issuedInvoice', invoiceId.toString())
    router.replace(`${pathname}?${newParams.toString()}`)
  }

  const handleCloseIssuedInvoice = () => {
    setSelectedIssuedInvoice(null)
    // Remove issued invoice from URL
    const newParams = new URLSearchParams(params.toString())
    newParams.delete('issuedInvoice')
    router.replace(`${pathname}?${newParams.toString()}`)
  }

  const handleOrderToggle = (orderId: number) => {
    setSelectedOrders(prev => {
      const newSet = new Set(prev)
      if (newSet.has(orderId)) {
        newSet.delete(orderId)
      } else {
        newSet.add(orderId)
      }
      return newSet
    })
  }

  const handleClearSelection = () => {
    setSelectedOrders(new Set())
  }

  const handleCreateAndIssueInvoice = (orderIds?: number[]) => {
    const selectedIds = orderIds || Array.from(selectedOrders)
    if (selectedIds.length === 0) return

    setCreateInvoiceOrderIds(selectedIds)
    setIsCreateModalOpen(true)
  }

  const handleCreateClick = () => {
    // For invoice orders, we don't have a direct create button
    // This could open a modal to create a new invoice order
    console.log('Create invoice order clicked')
  }

  const handleExpandInvoiceLines = (order: InvoiceOrder, invoiceLines: any[]) => {
    setExpandedInvoiceOrder(order)
    setExpandedSearchQuery('')
    
    // Use the invoice lines data passed from the drawer (no API call needed)
    setInvoiceLines(invoiceLines)
    
    // Update URL with focus parameter
    const newParams = new URLSearchParams(params.toString())
    newParams.set('focus', 'true')
    router.push(`${pathname}?${newParams.toString()}`)
  }

  const handleCloseExpandedView = () => {
    setExpandedInvoiceOrder(null)
    setExpandedSearchQuery('')
    setInvoiceLines([]) // Clear invoice lines data
    
    // Remove focus parameter from URL
    const newParams = new URLSearchParams(params.toString())
    newParams.delete('focus')
    router.push(`${pathname}?${newParams.toString()}`)
  }

  const handleCloseTaskDetails = () => {
    setSelectedTaskId(null)
    setIsTaskExpanded(false)
    setInitialTaskData(null) // Clear initial task data
    
    // Remove taskid parameter from URL without triggering reload
    const newParams = new URLSearchParams(params.toString())
    newParams.delete('taskid')
    router.replace(`${pathname}?${newParams.toString()}`, { scroll: false })
  }

  const handleExpandTask = () => {
    setIsTaskExpanded(true)
  }

  const handleCollapseTask = () => {
    setIsTaskExpanded(false)
  }

  const getSelectedOrderObjects = (): InvoiceOrder[] => {
    // Use the stored order IDs for creating invoices
    const orders = createInvoiceOrderIds.map(id => 
      getItemFromStore('v_invoice_orders_list', undefined, id) as InvoiceOrder
    ).filter(Boolean)
    
    console.log('Creating draft invoice with orders:', {
      orderIds: createInvoiceOrderIds,
      foundOrders: orders.length,
      orders: orders
    })
    
    return orders
  }

  const handleCreateAndIssueInvoiceSuccess = (invoiceId: number) => {
    // Clear selection
    setSelectedOrders(new Set())
    setCreateInvoiceOrderIds([])
    
    // Invalidate and refetch the lists to show updated data
    queryClient.invalidateQueries({ queryKey: ['v_invoice_orders_list'] })
    queryClient.invalidateQueries({ queryKey: ['v_issued_invoices_list'] })
    
    // Navigate to the new invoice
    router.push(`/billing/issued-invoices/${invoiceId}`)
  }

  // If fullscreen invoice lines view is open, render it instead
  if (expandedInvoiceOrder && !selectedTaskId) {
    return (
      <InvoiceLinesFullscreenView
        order={expandedInvoiceOrder}
        invoiceLines={invoiceLines}
        onClose={handleCloseExpandedView}
        searchQuery={expandedSearchQuery}
        onSearchChange={setExpandedSearchQuery}
        onTaskClick={(taskId: number, taskData?: any) => {
          // Update URL with task parameter without triggering reload
          const newParams = new URLSearchParams(params.toString())
          newParams.set('taskid', taskId.toString())
          setSelectedTaskId(taskId)
          setInitialTaskData(taskData) // Store initial task data for instant loading
          router.replace(`${pathname}?${newParams.toString()}`, { scroll: false })
        }}
      />
    )
  }

  // If both expanded invoice order and task are selected, show task in fullscreen
  if (expandedInvoiceOrder && selectedTaskId) {
    return (
      <div className="h-screen bg-white flex">
        <div className="flex-1">
          <InvoiceLinesFullscreenView
            order={expandedInvoiceOrder}
            invoiceLines={invoiceLines}
            onClose={handleCloseExpandedView}
            searchQuery={expandedSearchQuery}
            onSearchChange={setExpandedSearchQuery}
            onTaskClick={(taskId: number, taskData?: any) => {
              // Update URL with task parameter without triggering reload
              const newParams = new URLSearchParams(params.toString())
              newParams.set('taskid', taskId.toString())
              setSelectedTaskId(taskId)
              setInitialTaskData(taskData) // Store initial task data for instant loading
              router.replace(`${pathname}?${newParams.toString()}`, { scroll: false })
            }}
          />
        </div>
        <TaskDetailsPane 
          taskId={selectedTaskId} 
          onClose={handleCloseTaskDetails}
          isExpanded={false}
          onExpand={handleExpandTask}
          onCollapse={handleCollapseTask}
        />
      </div>
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
              className="px-3 py-2 text-sm font-medium transition-colors border-b-2 text-gray-500 hover:text-gray-700 border-transparent hover:border-gray-300"
            >
              Invoices
            </Link>
            <Link
              href="/billing/invoice-orders"
              className="px-3 py-2 text-sm font-medium transition-colors border-b-2 text-gray-900 border-gray-900"
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
      <div className="flex-1 flex flex-col min-w-0 transition-all duration-200">
        {/* Bulk Action Bar */}
        <BulkActionBar
          selectedCount={selectedOrders.size}
          onClearSelection={handleClearSelection}
          onCreateAndIssueInvoice={handleCreateAndIssueInvoice}
        />

        {/* Active Filter Badges */}
        {(() => {
          const filterOptions = { projects }
          const { badges, onClearAll } = getActiveInvoiceOrderFilterBadges(filters, setFilters, router, pathname, new URLSearchParams(params.toString()), filterOptions)
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
          <InvoiceOrdersTable
            filters={{ ...filters, search: debouncedSearch }}
            sort={sort}
            selectedOrder={selectedOrder}
            selectedOrders={selectedOrders}
            onOrderSelect={handleOrderSelect}
            onOrderToggle={handleOrderToggle}
            onSortChange={handleSortChange}
            hasRightPaneOpen={Boolean(selectedOrder || selectedIssuedInvoice || (selectedTaskId && !isTaskExpanded))}
            rightPaneCount={(Number(Boolean(selectedOrder)) + Number(Boolean(selectedIssuedInvoice)) + Number(Boolean(selectedTaskId && !isTaskExpanded)))}
            selectedTaskId={selectedTaskId}
          />
        </div>
      </div>

      {/* Right pane - Drawer */}
      {selectedOrder && (
        <InvoiceOrderLinesDrawer
          order={selectedOrder}
          onClose={handleCloseDrawer}
          onOpenIssuedInvoice={handleOpenIssuedInvoice}
          onExpandInvoiceLines={handleExpandInvoiceLines}
          hasOpenInvoiceDetail={!!selectedIssuedInvoice}
          hasOpenTaskDetails={!!selectedTaskId}
          onTaskClick={(taskId, taskData) => {
            // Update URL with task parameter without triggering reload
            const newParams = new URLSearchParams(params.toString())
            newParams.set('taskid', taskId.toString())
            setSelectedTaskId(taskId)
            setInitialTaskData(taskData) // Store initial task data for instant loading
            router.replace(`${pathname}?${newParams.toString()}`, { scroll: false })
          }}
        />
      )}
      {/* Third pane - Issued Invoice Detail */}
      {selectedIssuedInvoice && (
        <div className="fixed top-0 right-0 w-96 bg-white border-l border-gray-200 flex flex-col h-screen z-50 shadow-lg">
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold text-gray-900 truncate">
                Invoice #{selectedIssuedInvoice.id}
              </h2>
              <p className="text-sm text-gray-500 truncate">
                {selectedIssuedInvoice.status}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={handleCloseIssuedInvoice}>
              <X className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex-1 overflow-auto">
            <IssuedInvoiceDetail id={selectedIssuedInvoice.id} isPane={true} />
          </div>
        </div>
      )}

      {/* Fourth pane - Task Details */}
      {selectedTaskId && !isTaskExpanded && (
        <TaskDetailsPane 
          taskId={selectedTaskId} 
          onClose={handleCloseTaskDetails}
          isExpanded={false}
          onExpand={handleExpandTask}
          onCollapse={handleCollapseTask}
          hasOpenInvoiceDetail={!!selectedIssuedInvoice}
          initialTaskData={initialTaskData}
        />
      )}

      {/* Expanded Task Details - Full Width */}
      {selectedTaskId && isTaskExpanded && (
        <div className="fixed inset-0 z-50 bg-white">
          <TaskDetailsPane 
            taskId={selectedTaskId} 
            onClose={handleCloseTaskDetails}
            isExpanded={true}
            onExpand={handleExpandTask}
            onCollapse={handleCollapseTask}
            initialTaskData={initialTaskData}
          />
        </div>
      )}

      {/* Filter panel */}
      <InvoiceOrdersFilters
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        filters={filters}
        onFiltersChange={handleFiltersChange}
      />

      {/* Create and Issue Invoice Modal */}
      <CreateAndIssueInvoiceModal
        isOpen={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false)
          setCreateInvoiceOrderIds([])
        }}
        selectedOrders={getSelectedOrderObjects()}
        onSuccess={handleCreateAndIssueInvoiceSuccess}
      />
    </div>
  )
} 
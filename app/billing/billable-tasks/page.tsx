"use client"

import React, { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { ArrowLeft, Search, Filter, Download, FileText, FileSpreadsheet } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Badge } from '../../components/ui/badge'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { toast } from '../../components/ui/use-toast'
import { InfiniteList } from '../../components/ui/infinite-list'
import { useDebounce } from '../../hooks/use-debounce'
import { formatDate } from '../../lib/utils'
import { exportToCSV, exportToXLSX } from '../../../lib/utils/export'

interface BillableTask {
  task_id: number
  title: string
  delivery_date: string
  production_type_title: string
  content_type_title: string
  language_code: string
  assigned_to_name: string
  is_billable_candidate: boolean
}

interface BillableTasksFilters {
  q: string
  delivery_date_from?: string
  delivery_date_to?: string
  production_type_title?: string
  content_type_title?: string
  language_code?: string
  billable_only: boolean
}

export default function BillableTasksPage() {
  const router = useRouter()
  const params = useSearchParams()
  
  // Get context from URL params
  const ctxType = params.get('ctx') as 'order' | 'invoice' | null
  const ctxId = params.get('id') ? parseInt(params.get('id')!) : null
  const focus = params.get('focus') === 'true'
  
  // State
  const [filters, setFilters] = useState<BillableTasksFilters>({
    q: params.get('q') || '',
    delivery_date_from: params.get('delivery_date_from') || '',
    delivery_date_to: params.get('delivery_date_to') || '',
    production_type_title: params.get('production_type_title') || '',
    content_type_title: params.get('content_type_title') || '',
    language_code: params.get('language_code') || '',
    billable_only: params.get('billable_only') === 'true'
  })
  const [sort, setSort] = useState<{ field: string; direction: 'asc' | 'desc' }>({
    field: params.get('sort') || 'delivery_date',
    direction: (params.get('dir') as 'asc' | 'desc') || 'desc'
  })
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  
  // Separate search input state
  const [searchInput, setSearchInput] = useState(filters.q)
  const debouncedSearch = useDebounce(searchInput, 300)

  // Update URL when filters or sort change
  const updateUrl = (newFilters: BillableTasksFilters, newSort: { field: string; direction: 'asc' | 'desc' }) => {
    const newParams = new URLSearchParams()
    
    if (ctxType) newParams.set('ctx', ctxType)
    if (ctxId) newParams.set('id', ctxId.toString())
    if (focus) newParams.set('focus', 'true')
    if (newFilters.q) newParams.set('q', newFilters.q)
    if (newFilters.delivery_date_from) newParams.set('delivery_date_from', newFilters.delivery_date_from)
    if (newFilters.delivery_date_to) newParams.set('delivery_date_to', newFilters.delivery_date_to)
    if (newFilters.production_type_title) newParams.set('production_type_title', newFilters.production_type_title)
    if (newFilters.content_type_title) newParams.set('content_type_title', newFilters.content_type_title)
    if (newFilters.language_code) newParams.set('language_code', newFilters.language_code)
    if (newFilters.billable_only) newParams.set('billable_only', 'true')
    
    newParams.set('sort', newSort.field)
    newParams.set('dir', newSort.direction)
    
    const newUrl = `/billing/billable-tasks?${newParams.toString()}`
    router.replace(newUrl)
  }

  // Update filters when search changes
  useEffect(() => {
    const newFilters = { ...filters, q: debouncedSearch }
    setFilters(newFilters)
    updateUrl(newFilters, sort)
  }, [debouncedSearch])

  // Build query for infinite list
  const buildQuery = (query: any) => {
    let q = query
      .eq('ctx_type', ctxType)
      .eq('ctx_id', ctxId)
      .order(sort.field, { ascending: sort.direction === 'asc' })

    // Apply filters
    if (filters.q) {
      q = q.ilike('title', `%${filters.q}%`)
    }
    if (filters.delivery_date_from) {
      q = q.gte('delivery_date', filters.delivery_date_from)
    }
    if (filters.delivery_date_to) {
      q = q.lte('delivery_date', filters.delivery_date_to)
    }
    if (filters.production_type_title) {
      q = q.eq('production_type_title', filters.production_type_title)
    }
    if (filters.content_type_title) {
      q = q.eq('content_type_title', filters.content_type_title)
    }
    if (filters.language_code) {
      q = q.eq('language_code', filters.language_code)
    }
    if (filters.billable_only) {
      q = q.eq('is_billable_candidate', true)
    }

    return q
  }

  const handleExportCSV = async () => {
    try {
      const supabase = createClientComponentClient()
      const { data, error } = await buildQuery(
        supabase
          .from('v_billing_period_tasks')
          .select('task_id,title,delivery_date,production_type_title,content_type_title,language_code,assigned_to_name,is_billable_candidate')
      )

      if (error) throw error

      const csvData = (data || []).map((task: BillableTask) => ({
        'Task ID': task.task_id,
        'Title': task.title,
        'Delivery Date': task.delivery_date,
        'Production Type': task.production_type_title,
        'Content Type': task.content_type_title,
        'Language': task.language_code,
        'Assigned To': task.assigned_to_name,
        'Billable': task.is_billable_candidate ? 'Yes' : 'No'
      }))

      exportToCSV(csvData, `billable-tasks-${ctxType}-${ctxId}`)
    } catch (err: any) {
      console.error('Error exporting CSV:', err)
      toast({
        title: 'Error',
        description: err.message || 'Failed to export CSV',
        variant: 'destructive',
      })
    }
  }

  const handleExportXLSX = async () => {
    try {
      const supabase = createClientComponentClient()
      const { data, error } = await buildQuery(
        supabase
          .from('v_billing_period_tasks')
          .select('task_id,title,delivery_date,production_type_title,content_type_title,language_code,assigned_to_name,is_billable_candidate')
      )

      if (error) throw error

      const xlsxData = (data || []).map((task: BillableTask) => ({
        'Task ID': task.task_id,
        'Title': task.title,
        'Delivery Date': task.delivery_date,
        'Production Type': task.production_type_title,
        'Content Type': task.content_type_title,
        'Language': task.language_code,
        'Assigned To': task.assigned_to_name,
        'Billable': task.is_billable_candidate ? 'Yes' : 'No'
      }))

      exportToXLSX(xlsxData, `billable-tasks-${ctxType}-${ctxId}`)
    } catch (err: any) {
      console.error('Error exporting XLSX:', err)
      toast({
        title: 'Error',
        description: err.message || 'Failed to export XLSX',
        variant: 'destructive',
      })
    }
  }

  const getActiveFilterCount = () => {
    let count = 0
    if (filters.q) count++
    if (filters.delivery_date_from || filters.delivery_date_to) count++
    if (filters.production_type_title) count++
    if (filters.content_type_title) count++
    if (filters.language_code) count++
    if (filters.billable_only) count++
    return count
  }

  if (!ctxType || !ctxId) {
    return (
      <div className="flex h-screen bg-white">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-semibold text-gray-900 mb-4">Invalid Context</h1>
            <p className="text-gray-500">Missing context type or ID</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-white">
      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.back()}
                className="text-gray-600 hover:text-gray-900"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <div>
                <h1 className="text-2xl font-semibold text-gray-900">
                  Billable Tasks - {ctxType === 'order' ? 'Invoice Order' : 'Issued Invoice'} #{ctxId}
                </h1>
                <p className="text-sm text-gray-500">
                  Tasks for this billing period
                </p>
              </div>
            </div>
            
            {/* Export Actions */}
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportCSV}
                className="flex items-center space-x-2"
              >
                <FileText className="w-4 h-4" />
                <span>CSV</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportXLSX}
                className="flex items-center space-x-2"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>XLSX</span>
              </Button>
            </div>
          </div>
        </div>

        {/* Search and Filter Bar */}
        <div className="flex items-center space-x-3 p-4 bg-white border-b border-gray-200">
          {/* Search Input */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              type="text"
              placeholder="Search task titles..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-10 bg-white border-gray-300 focus:border-gray-400 focus:ring-gray-400"
            />
          </div>

          {/* Filter Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsFilterOpen(true)}
            className="flex items-center space-x-2 bg-white border-gray-300 hover:bg-gray-50"
          >
            <Filter className="w-4 h-4" />
            <span>Filters</span>
            {getActiveFilterCount() > 0 && (
              <span className="bg-gray-200 text-gray-800 text-xs font-medium px-2 py-1 rounded-full">
                {getActiveFilterCount()}
              </span>
            )}
          </Button>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-hidden">
          <InfiniteList<'v_billing_period_tasks'>
            tableName="v_billing_period_tasks"
            columns="task_id,title,delivery_date,production_type_title,content_type_title,language_code,assigned_to_name,is_billable_candidate"
            pageSize={50}
            trailingQuery={buildQuery}
            isTableBody={false}
            renderNoResults={() => (
              <div className="text-center text-gray-500 py-8">
                {filters.q ? 'No tasks match your search' : 'No tasks found for this billing period'}
              </div>
            )}
            renderEndMessage={() => null}
            renderSkeleton={(count) => (
              <div className="space-y-2 p-4">
                {Array.from({ length: count }).map((_, i) => (
                  <div key={i} className="p-3 border border-gray-200 rounded animate-pulse">
                    <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                    <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                  </div>
                ))}
              </div>
            )}
          >
            {(tasks) => (
              <div className="overflow-hidden border border-gray-200 rounded-lg mx-4 my-4">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                          onClick={() => setSort({ field: 'title', direction: sort.field === 'title' && sort.direction === 'asc' ? 'desc' : 'asc' })}>
                        Title
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                          onClick={() => setSort({ field: 'delivery_date', direction: sort.field === 'delivery_date' && sort.direction === 'asc' ? 'desc' : 'asc' })}>
                        Delivery Date
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                          onClick={() => setSort({ field: 'production_type_title', direction: sort.field === 'production_type_title' && sort.direction === 'asc' ? 'desc' : 'asc' })}>
                        Production Type
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                          onClick={() => setSort({ field: 'content_type_title', direction: sort.field === 'content_type_title' && sort.direction === 'asc' ? 'desc' : 'asc' })}>
                        Content Type
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                          onClick={() => setSort({ field: 'language_code', direction: sort.field === 'language_code' && sort.direction === 'asc' ? 'desc' : 'asc' })}>
                        Language
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                          onClick={() => setSort({ field: 'assigned_to_name', direction: sort.field === 'assigned_to_name' && sort.direction === 'asc' ? 'desc' : 'asc' })}>
                        Assignee
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {tasks.map((task: BillableTask) => (
                      <tr key={task.task_id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-sm text-gray-900 max-w-xs">
                          <div className="flex items-center space-x-2">
                            <span className="truncate">{task.title}</span>
                            {!task.is_billable_candidate && (
                              <Badge variant="outline" className="text-xs">
                                Non-billable
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-sm text-gray-500">
                          {task.delivery_date ? formatDate(task.delivery_date) : '-'}
                        </td>
                        <td className="px-3 py-2 text-sm text-gray-500">
                          {task.production_type_title || '-'}
                        </td>
                        <td className="px-3 py-2 text-sm text-gray-500">
                          {task.content_type_title || '-'}
                        </td>
                        <td className="px-3 py-2 text-sm text-gray-500">
                          {task.language_code || '-'}
                        </td>
                        <td className="px-3 py-2 text-sm text-gray-500">
                          {task.assigned_to_name || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </InfiniteList>
        </div>
      </div>

      {/* Filter Panel - TODO: Implement filters modal */}
      {isFilterOpen && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg max-w-md w-full mx-4">
            <h3 className="text-lg font-medium mb-4">Filters</h3>
            <p className="text-gray-500 mb-4">Filter implementation coming soon...</p>
            <Button onClick={() => setIsFilterOpen(false)}>Close</Button>
          </div>
        </div>
      )}
    </div>
  )
} 
 
 
 
 
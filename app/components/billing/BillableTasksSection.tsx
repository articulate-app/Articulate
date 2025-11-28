"use client"

import React, { useState, useEffect } from 'react'
import { Badge } from '../ui/badge'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { toast } from '../ui/use-toast'
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

interface BillableTasksSectionProps {
  ctxType: 'order' | 'invoice'
  ctxId: number
  title: string
  onTaskClick?: (taskId: number, taskData?: BillableTask) => void
  onExpand?: () => void
  preloadedTasks?: BillableTask[]
  preloadedTotalCount?: number
  onDataLoaded?: (tasks: BillableTask[], totalCount: number) => void
}

export function BillableTasksSection({ ctxType, ctxId, title, onTaskClick, onExpand, preloadedTasks, preloadedTotalCount, onDataLoaded }: BillableTasksSectionProps) {
  const [tasks, setTasks] = useState<BillableTask[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [totalCount, setTotalCount] = useState(0)
  const supabase = createClientComponentClient()

  // Fetch tasks for the billing period
  const fetchTasks = async () => {
    try {
      setIsLoading(true)
      
      // First get the count
      const { count, error: countError } = await supabase
        .from('v_billing_period_tasks')
        .select('task_id', { count: 'exact', head: true })
        .eq('ctx_type', ctxType)
        .eq('ctx_id', ctxId)

      if (countError) throw countError
      setTotalCount(count || 0)

      // Then get the first page of tasks
      const { data, error } = await supabase
        .from('v_billing_period_tasks')
        .select('task_id,title,delivery_date,publication_date,production_type_title,content_type_title,language_code,assigned_to_name,is_billable_candidate,project_name,project_status_name,project_status_color,is_overdue,is_publication_overdue')
        .eq('ctx_type', ctxType)
        .eq('ctx_id', ctxId)
        .order('delivery_date', { ascending: false })
        .limit(50)

      if (error) throw error
      setTasks(data || [])
      
      // Notify parent component that data has been loaded
      if (onDataLoaded) {
        onDataLoaded(data || [], count || 0)
      }
    } catch (err: any) {
      console.error('Error fetching billable tasks:', err)
      toast({
        title: 'Error',
        description: err.message || 'Failed to fetch billable tasks',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (preloadedTasks && preloadedTotalCount !== undefined) {
      // Use preloaded data to avoid unnecessary API calls
      setTasks(preloadedTasks)
      setTotalCount(preloadedTotalCount)
      setIsLoading(false)
    } else if (ctxId) {
      fetchTasks()
    }
  }, [ctxId, ctxType, preloadedTasks, preloadedTotalCount])

  const handleExpand = () => {
    if (onExpand) {
      // Use the provided expand handler to expand within the current pane
      onExpand()
    } else {
      // Fallback: Navigate to the full-screen view in the same window
      const params = new URLSearchParams()
      params.set('ctx', ctxType)
      params.set('id', ctxId.toString())
      params.set('focus', 'true')
      
      const url = `/billing/billable-tasks?${params.toString()}`
      window.location.href = url
    }
  }

  const handleExportCSV = async () => {
    try {
      const { data, error } = await supabase
        .from('v_billing_period_tasks')
        .select('task_id,title,delivery_date,publication_date,production_type_title,content_type_title,language_code,assigned_to_name,is_billable_candidate,project_name,project_status_name,project_status_color,is_overdue,is_publication_overdue')
        .eq('ctx_type', ctxType)
        .eq('ctx_id', ctxId)
        .order('delivery_date', { ascending: false })

      if (error) throw error

      const csvData = (data || []).map(task => ({
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
      const { data, error } = await supabase
        .from('v_billing_period_tasks')
        .select('task_id,title,delivery_date,publication_date,production_type_title,content_type_title,language_code,assigned_to_name,is_billable_candidate,project_name,project_status_name,project_status_color,is_overdue,is_publication_overdue')
        .eq('ctx_type', ctxType)
        .eq('ctx_id', ctxId)
        .order('delivery_date', { ascending: false })

      if (error) throw error

      const xlsxData = (data || []).map(task => ({
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

  const handleTaskClick = (taskId: number) => {
    if (onTaskClick) {
      // Find the task data from the current tasks list
      const taskData = tasks.find(task => task.task_id === taskId)
      onTaskClick(taskId, taskData)
    }
  }

  if (isLoading) {
    return (
      <div className="w-full">
        <div className="flex items-center space-x-3 mb-4">
          <div className="w-16 h-6 bg-gray-200 animate-pulse rounded"></div>
          <div className="w-8 h-6 bg-gray-200 animate-pulse rounded"></div>
        </div>
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-12 bg-gray-200 animate-pulse rounded"></div>
          ))}
        </div>
        <div className="flex items-center space-x-4 pt-4">
          <div className="w-16 h-4 bg-gray-200 animate-pulse rounded"></div>
          <div className="w-12 h-4 bg-gray-200 animate-pulse rounded"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center space-x-3 mb-4 w-full">
        <h3 className="text-sm font-medium text-gray-900">{title}</h3>
        <Badge variant="secondary">{totalCount}</Badge>
      </div>

      {/* Tasks Cards */}
      {tasks.length > 0 ? (
        <div className="w-full">
          {tasks.map((task, index) => (
            <div 
              key={task.task_id} 
              className={`flex items-center justify-between py-2 w-full ${index !== tasks.length - 1 ? 'border-b border-gray-200' : ''}`}
            >
              {/* Left side - Title with icon */}
              <div className="flex items-center space-x-1 flex-1 min-w-0 pr-4">
                <span 
                  className="text-sm text-gray-900 truncate cursor-pointer underline-offset-4 hover:underline"
                  onClick={() => handleTaskClick(task.task_id)}
                >
                  {task.title}
                </span>
                <svg 
                  className="w-3 h-3 text-gray-400 flex-shrink-0 cursor-pointer" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                  onClick={() => handleTaskClick(task.task_id)}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                {!task.is_billable_candidate && (
                  <Badge variant="outline" className="text-xs flex-shrink-0 ml-2">
                    Non-billable
                  </Badge>
                )}
              </div>
              
              {/* Right side - Delivery date and assignee */}
              <div className="flex items-center space-x-3 flex-shrink-0">
                <span className="text-xs text-gray-500 whitespace-nowrap">
                  {task.delivery_date ? (() => {
                    const date = new Date(task.delivery_date)
                    return date.toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })
                  })() : '-'}
                </span>
                <div className="w-6 h-6 bg-gray-300 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-xs text-gray-600 font-medium">
                    {task.assigned_to_name ? (() => {
                      const nameParts = task.assigned_to_name.trim().split(' ')
                      if (nameParts.length === 1) {
                        return nameParts[0].substring(0, 2).toUpperCase()
                      }
                      return (nameParts[0].charAt(0) + nameParts[nameParts.length - 1].charAt(0)).toUpperCase()
                    })() : '?'}
                  </span>
                </div>
              </div>
            </div>
          ))}
          
          {/* Action buttons at bottom left */}
          <div className="flex items-center space-x-4 pt-4">
            <button
              onClick={handleExportCSV}
              disabled={isLoading}
              className="text-xs text-gray-600 hover:text-gray-900 hover:underline disabled:opacity-50"
            >
              DOWNLOAD
            </button>
            <button
              onClick={handleExpand}
              className="text-xs text-gray-600 hover:text-gray-900 hover:underline"
            >
              EXPAND
            </button>
          </div>
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500">
          {isLoading ? 'Loading tasks...' : 'No billable tasks found'}
        </div>
      )}
    </div>
  )
} 
 
 
 
 
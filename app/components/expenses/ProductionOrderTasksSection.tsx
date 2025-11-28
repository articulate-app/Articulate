"use client"

import React, { useState, useEffect } from 'react'
import { Badge } from '../ui/badge'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { toast } from '../ui/use-toast'

interface ProductionOrderTask {
  task_id: number
  title: string
  delivery_date: string
  project_id: number
  production_type_id: number
  content_type_id: number
  language_id: number
  production_type_title: string
  content_type_title: string
  language_code: string
  assigned_to_name: string
  task_agreed_subtotal: number
  project_name: string
  project_color: string | null
}

interface ProductionOrderTasksSectionProps {
  productionOrderId: number
  onTaskClick?: (taskId: number, taskData?: ProductionOrderTask) => void
}

export function ProductionOrderTasksSection({ 
  productionOrderId, 
  onTaskClick 
}: ProductionOrderTasksSectionProps) {
  const [tasks, setTasks] = useState<ProductionOrderTask[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [totalCount, setTotalCount] = useState(0)
  const supabase = createClientComponentClient()

  // Fetch tasks for the production order
  const fetchTasks = async () => {
    try {
      setIsLoading(true)
      
      // Fetch tasks from the view
      const { data, error, count } = await supabase
        .from('v_production_order_tasks_min')
        .select('*', { count: 'exact' })
        .eq('production_order_id', productionOrderId)
        .order('delivery_date', { ascending: false })

      if (error) throw error
      
      setTasks(data || [])
      setTotalCount(count || 0)
    } catch (err: any) {
      console.error('Error fetching production order tasks:', err)
      toast({
        title: 'Error',
        description: err.message || 'Failed to fetch tasks',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (productionOrderId) {
      fetchTasks()
    }
  }, [productionOrderId])

  const handleTaskClick = (taskId: number) => {
    if (onTaskClick) {
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
      </div>
    )
  }

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center space-x-3 mb-4 w-full">
        <h3 className="text-sm font-medium text-gray-900">Tasks</h3>
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
              {/* Left side - Title with icon and project */}
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
                {task.project_name && (
                  <span className="text-xs text-gray-500 flex-shrink-0 ml-2 truncate">
                    {task.project_name}
                  </span>
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
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500">
          {isLoading ? 'Loading tasks...' : 'No tasks found'}
        </div>
      )}
    </div>
  )
}


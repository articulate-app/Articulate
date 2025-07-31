'use client'

import { useEffect, useRef, useCallback } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useQueryClient } from '@tanstack/react-query'
import { updateTaskInCaches } from '../app/components/tasks/task-cache-utils'
import { updateItemInStore } from './use-infinite-query'
import { toast } from '../app/components/ui/use-toast'

// Singleton pattern to ensure only one realtime subscription exists
let globalChannel: ReturnType<ReturnType<typeof createClientComponentClient>['channel']> | null = null
let globalSubscribers = new Set<(task: any, event: 'INSERT' | 'UPDATE' | 'DELETE') => void>()
let isGlobalSubscribed = false
let instanceCount = 0

interface UseTaskRealtimeOptions {
  /**
   * Whether to enable realtime subscriptions
   * @default true
   */
  enabled?: boolean
  /**
   * Whether to show toast notifications for realtime updates
   * @default false
   */
  showNotifications?: boolean
  /**
   * Custom handler for task updates
   */
  onTaskUpdate?: (task: any, event: 'INSERT' | 'UPDATE' | 'DELETE') => void
}

/**
 * Hook to handle realtime subscriptions for the tasks table.
 * Automatically updates all task caches when changes are received.
 */
export function useTaskRealtime(options: UseTaskRealtimeOptions = {}) {
  const {
    enabled = true,
    showNotifications = false,
    onTaskUpdate
  } = options

  const supabase = createClientComponentClient()
  const queryClient = useQueryClient()
  const isSubscribedRef = useRef(false)

  // Handle task updates from realtime events
  const handleTaskUpdate = useCallback((payload: any, event: 'INSERT' | 'UPDATE' | 'DELETE') => {
    const task = payload.new || payload.old
    if (!task) return

    console.log(`[useTaskRealtime] Received ${event} event for task:`, task.id, task)

    try {
      switch (event) {
        case 'INSERT':
          // For new tasks, we might want to add them to relevant caches
          // This is handled by the form submission flow, so we'll just invalidate
          queryClient.invalidateQueries({ queryKey: ['tasks'] })
          if (showNotifications) {
            toast({
              title: 'New task created',
              description: `Task "${task.title}" was created`,
            })
          }
          break

        case 'UPDATE':
          console.log('[useTaskRealtime] Updating caches for task:', task.id, 'with data:', task)
          
          // Update all caches with the new task data
          updateTaskInCaches(queryClient, task)
          
          // Also update the InfiniteList stores
          updateItemInStore('tasks', undefined, task)
          
          // Force a refetch of calendar queries to ensure UI updates
          queryClient.invalidateQueries({ 
            queryKey: ['tasks']
          })
          
          if (showNotifications) {
            toast({
              title: 'Task updated',
              description: `Task "${task.title}" was updated`,
            })
          }
          break

        case 'DELETE':
          // Remove from caches and invalidate queries
          queryClient.invalidateQueries({ queryKey: ['tasks'] })
          queryClient.invalidateQueries({ queryKey: ['task', String(task.id)] })
          
          if (showNotifications) {
            toast({
              title: 'Task deleted',
              description: `Task "${task.title}" was deleted`,
            })
          }
          break
      }

      // Call custom handler if provided
      if (onTaskUpdate) {
        onTaskUpdate(task, event)
      }
    } catch (error) {
      console.error('[useTaskRealtime] Error handling task update:', error)
    }
  }, [queryClient, showNotifications, onTaskUpdate])

  // Set up realtime subscription using singleton pattern
  useEffect(() => {
    if (!enabled) return

    instanceCount++
    console.log(`[useTaskRealtime] Instance ${instanceCount} created. Total instances: ${instanceCount}`)

    // Add this instance's handler to global subscribers
    if (onTaskUpdate) {
      globalSubscribers.add(onTaskUpdate)
    }

    // If global channel doesn't exist, create it
    if (!globalChannel && !isGlobalSubscribed) {
      console.log('[useTaskRealtime] Creating global realtime subscription for tasks table')
      console.log('[useTaskRealtime] Global subscribers count:', globalSubscribers.size)
      
      // Log Supabase client info for debugging
      console.log('[useTaskRealtime] Supabase client config:', {
        auth: !!supabase.auth,
        realtime: !!supabase.realtime,
      })

      globalChannel = supabase.channel('tasks-realtime-global')

      // Subscribe to all task changes
      globalChannel
        .on('postgres_changes', 
          { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'tasks' 
          }, 
          (payload) => {
            // Notify all subscribers
            globalSubscribers.forEach(subscriber => {
              try {
                subscriber(payload.new, 'INSERT')
              } catch (error) {
                console.error('[useTaskRealtime] Error in subscriber:', error)
              }
            })
          }
        )
        .on('postgres_changes', 
          { 
            event: 'UPDATE', 
            schema: 'public', 
            table: 'tasks' 
          }, 
          (payload) => {
            // Notify all subscribers
            globalSubscribers.forEach(subscriber => {
              try {
                subscriber(payload.new, 'UPDATE')
              } catch (error) {
                console.error('[useTaskRealtime] Error in subscriber:', error)
              }
            })
          }
        )
        .on('postgres_changes', 
          { 
            event: 'DELETE', 
            schema: 'public', 
            table: 'tasks' 
          }, 
          (payload) => {
            // Notify all subscribers
            globalSubscribers.forEach(subscriber => {
              try {
                subscriber(payload.old, 'DELETE')
              } catch (error) {
                console.error('[useTaskRealtime] Error in subscriber:', error)
              }
            })
          }
        )
        .subscribe((status) => {
          console.log('[useTaskRealtime] Global subscription status:', status)
          if (status === 'SUBSCRIBED') {
            isGlobalSubscribed = true
            console.log('[useTaskRealtime] Successfully subscribed to tasks realtime')
          } else if (status === 'CHANNEL_ERROR') {
            console.error('[useTaskRealtime] Channel error - subscription failed')
            // Reset global state on error
            globalChannel = null
            isGlobalSubscribed = false
          }
        })
    }

    // Mark this instance as subscribed
    isSubscribedRef.current = true

    // Cleanup function
    return () => {
      instanceCount--
      console.log(`[useTaskRealtime] Instance destroyed. Remaining instances: ${instanceCount}`)

      // Remove this instance's handler from global subscribers
      if (onTaskUpdate) {
        globalSubscribers.delete(onTaskUpdate)
      }

      // If no more subscribers, clean up global channel
      if (globalSubscribers.size === 0 && globalChannel) {
        console.log('[useTaskRealtime] No more subscribers, cleaning up global subscription')
        supabase.removeChannel(globalChannel)
        globalChannel = null
        isGlobalSubscribed = false
      }

      isSubscribedRef.current = false
    }
  }, [enabled, supabase, onTaskUpdate])

  // Return subscription status
  return {
    isSubscribed: isSubscribedRef.current && isGlobalSubscribed,
    channel: globalChannel,
  }
} 
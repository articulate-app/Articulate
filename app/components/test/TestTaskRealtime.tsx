"use client"

import { useState, useEffect } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useTaskRealtime } from '../../../hooks/use-task-realtime'

export function TestTaskRealtime() {
  const [events, setEvents] = useState<Array<{ type: string; taskId: number; timestamp: string; data: any }>>([])
  const [isConnected, setIsConnected] = useState(false)
  const supabase = createClientComponentClient()

  // Set up realtime with notifications enabled for testing
  const { isSubscribed } = useTaskRealtime({
    enabled: true,
    showNotifications: true,
    onTaskUpdate: (task, event) => {
      console.log(`[TestTaskRealtime] Received ${event} event:`, task)
      setEvents(prev => [
        {
          type: event,
          taskId: task.id,
          timestamp: new Date().toISOString(),
          data: task
        },
        ...prev.slice(0, 9) // Keep last 10 events
      ])
    }
  })

  // Debug: Log subscription status changes
  useEffect(() => {
    console.log('[TestTaskRealtime] Subscription status changed:', isSubscribed)
  }, [isSubscribed])

  useEffect(() => {
    setIsConnected(isSubscribed)
  }, [isSubscribed])

  const testUpdate = async () => {
    try {
      // Get a random task to update
      const { data: tasks } = await supabase
        .from('tasks')
        .select('id, title')
        .limit(1)
      
      if (tasks && tasks.length > 0) {
        const task = tasks[0]
        const newTitle = `${task.title} (updated at ${new Date().toLocaleTimeString()})`
        
        await supabase
          .from('tasks')
          .update({ title: newTitle })
          .eq('id', task.id)
        
        console.log(`[TestTaskRealtime] Updated task ${task.id} with title: ${newTitle}`)
      }
    } catch (error) {
      console.error('[TestTaskRealtime] Error updating task:', error)
    }
  }

  return (
    <div className="p-4 border rounded-lg bg-white">
      <h2 className="text-lg font-semibold mb-4">Task Realtime Test</h2>
      
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-sm">
            {isConnected ? 'Connected to realtime' : 'Disconnected from realtime'}
          </span>
        </div>
        
        <button
          onClick={testUpdate}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Test Update Task
        </button>
      </div>

      <div className="space-y-2">
        <h3 className="font-medium">Recent Events:</h3>
        {events.length === 0 ? (
          <p className="text-gray-500 text-sm">No events received yet. Try updating a task in another window.</p>
        ) : (
          <div className="space-y-1">
            {events.map((event, index) => (
              <div key={index} className="text-xs p-2 bg-gray-50 rounded">
                <div className="font-medium">{event.type} - Task {event.taskId}</div>
                <div className="text-gray-600">{event.timestamp}</div>
                <div className="text-gray-500 truncate">
                  {event.data?.title || 'No title'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
} 
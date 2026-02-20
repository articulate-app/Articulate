'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useQuery } from '@tanstack/react-query'
import { TaskDetails } from '../tasks/TaskDetails'

interface InboxTaskDetailsPaneProps {
  taskId: number
  onClose: () => void
}

export function InboxTaskDetailsPane({ taskId, onClose }: InboxTaskDetailsPaneProps) {
  const supabase = createClientComponentClient()
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: { session } } = await supabase.auth.getSession()
      setCurrentUser(user)
      setAccessToken(session?.access_token || null)
    }
    load()
  }, [supabase])

  const { data, isLoading, error } = useQuery({
    queryKey: ['inbox-task-details-bootstrap', taskId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke(`task-details-bootstrap?task_id=${taskId}`)
      if (error) throw error
      return data
    },
    enabled: Number.isFinite(taskId),
    staleTime: 0,
  })

  const selectedTask = useMemo(() => {
    // The edge function returns a mixed shape; TaskDetails expects the merged "task-like" object.
    if (!data) return null
    return { ...(data.task || {}), ...data }
  }, [data])

  if (error) {
    return (
      <div className="p-4 text-sm text-destructive">
        Failed to load task details: {String((error as any)?.message || error)}
      </div>
    )
  }

  if (isLoading || !selectedTask) {
    return <div className="p-4 text-sm text-muted-foreground">Loading task…</div>
  }

  return (
    <TaskDetails
      isCollapsed={false}
      selectedTask={selectedTask as any}
      // Use TaskDetails' own header close button (it is wired to onCollapse)
      onClose={onClose}
      onCollapse={onClose}
      accessToken={accessToken}
      currentUser={currentUser}
      disableUrlSync
    />
  )
}



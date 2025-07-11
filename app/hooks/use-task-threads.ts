import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import type { Thread } from '../types/task'

export function useTaskThreads(taskId: string | number | undefined) {
  const supabase = createClientComponentClient()
  const queryClient = useQueryClient()

  const query = useQuery<Thread[]>({
    queryKey: ['threads', taskId],
    queryFn: async () => {
      if (!taskId) return []
      const { data, error } = await supabase
        .from('threads')
        .select('id, title, created_at, task_id')
        .eq('task_id', taskId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data || []
    },
    enabled: !!taskId,
    staleTime: 60000,
  })

  useEffect(() => {
    if (!taskId) return
    const channel = supabase
      .channel('threads')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'threads', filter: `task_id=eq.${taskId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['threads', taskId] })
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [taskId, supabase, queryClient])

  return query
} 
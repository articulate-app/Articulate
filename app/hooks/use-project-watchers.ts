import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import type { User } from '../lib/services/users'

export function useProjectWatchers(projectId: string | number | undefined) {
  const supabase = createClientComponentClient()
  const queryClient = useQueryClient()

  const query = useQuery<User[]>({
    queryKey: ['project_watchers', projectId],
    queryFn: async () => {
      if (!projectId) return []
      const { data, error } = await supabase
        .from('project_watchers')
        .select('user_id, users(id, full_name)')
        .eq('project_id', projectId)
      if (error) throw error
      return (data || []).map((row: any) => row.users).filter(Boolean)
    },
    enabled: !!projectId,
    staleTime: 60000,
  })

  useEffect(() => {
    if (!projectId) return
    const channel = supabase
      .channel('project_watchers')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'project_watchers', filter: `project_id=eq.${projectId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['project_watchers', projectId] })
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [projectId, supabase, queryClient])

  return query
} 
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useCurrentUserStore } from '../store/current-user'

/**
 * Hook to mark mentions as read by upserting into seen_mentions table
 */
export function useMarkMentionsRead() {
  const supabase = createClientComponentClient()
  const queryClient = useQueryClient()
  const currentUserId = useCurrentUserStore((s) => s.publicUserId)

  const mutation = useMutation({
    mutationFn: async (mentionIds: number[]) => {
      if (!currentUserId || mentionIds.length === 0) return

      // Upsert seen_mentions for each mention
      const inserts = mentionIds.map((mentionId) => ({
        mention_id: mentionId,
        seen_by_id: currentUserId,
      }))

      const { error } = await supabase.from('seen_mentions').upsert(inserts, {
        onConflict: 'mention_id,seen_by_id',
      })

      if (error) throw error

      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ['inbox-threads'] })
    },
  })

  return mutation
}


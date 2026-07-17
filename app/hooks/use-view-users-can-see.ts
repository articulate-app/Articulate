"use client"

import { useQuery } from "@tanstack/react-query"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"

export type ViewUser = {
  id: number
  full_name: string | null
  photo: string | null
}

const QUERY_KEY = ["view_users_i_can_see"] as const

/**
 * Single shared query for view_users_i_can_see (id, full_name, photo).
 * Use the same hook from layout (e.g. filter pane) and from activity timeline so
 * there is only one network call; React Query dedupes by query key.
 */
export function useViewUsersCanSee(enabled = true) {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<ViewUser[]> => {
      const supabase = createClientComponentClient()
      const { data, error } = await supabase
        .from("view_users_i_can_see")
        .select("id, full_name, photo")
        .order("full_name")
      if (error) throw error
      return (data ?? []).map((row: { id: number; full_name: string | null; photo?: string | null }) => ({
        id: row.id,
        full_name: row.full_name ?? null,
        photo: row.photo ?? null,
      }))
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  })
}

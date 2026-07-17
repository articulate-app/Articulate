"use client"

import { useQuery } from "@tanstack/react-query"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import type { Review } from "@/lib/types/tasks"

export const taskReviewsQueryKey = (taskId: number) => ["task-reviews", taskId] as const

export async function fetchTaskReviews(taskId: number, signal?: AbortSignal): Promise<Review[]> {
  const supabase = createClientComponentClient()
  const query = supabase
    .from("reviews")
    .select(`
      id, task_id, created_by, created_at, updated_at,
      score_seo, score_relevance, score_grammar, score_delays, review_score,
      positive_feedback, negative_feedback, review_title,
      author:created_by ( id, full_name, photo )
    `)
    .eq("task_id", taskId)
    .order("created_at", { ascending: false })

  if (signal) {
    query.abortSignal(signal)
  }

  const { data, error } = await query
  if (error) throw error

  return (data || []).map((review) => ({
    ...review,
    author: Array.isArray(review.author) ? review.author[0] : review.author,
  })) as Review[]
}

export function useTaskReviewsQuery(taskId: number | null | undefined, enabled = true) {
  return useQuery({
    queryKey: taskId ? taskReviewsQueryKey(taskId) : ["task-reviews", null],
    enabled: enabled && !!taskId && Number.isFinite(taskId),
    staleTime: 60_000,
    queryFn: ({ signal }) => fetchTaskReviews(taskId!, signal),
  })
}

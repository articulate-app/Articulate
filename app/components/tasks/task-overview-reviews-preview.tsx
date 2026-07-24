"use client"

import React, { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import type { ReviewData } from "@/lib/types/tasks"
import { TaskOverviewPreviewSection } from "./task-overview-preview-section"
import { AddReviewInlineCard } from "./AddReviewInlineCard"
import { useInViewport } from "@/hooks/use-in-viewport"
import { taskReviewsQueryKey, useTaskReviewsQuery } from "@/hooks/use-task-reviews-query"
import { AddDashedButton } from "../ui/add-dashed-button"

const PREVIEW_REVIEW_LIMIT = 2

function StarRating({ score }: { score: number | null }) {
  if (score === null) return <span className="text-xs text-gray-400">—</span>
  return (
    <span className="flex items-center gap-0.5">
      <span className="text-xs font-medium text-gray-600">{score.toFixed(1)}</span>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={`text-xs ${i < Math.floor(score) ? "text-yellow-400" : "text-gray-300"}`}>
          ★
        </span>
      ))}
    </span>
  )
}

function hasReviewSummary(reviewData?: ReviewData | null): boolean {
  if (!reviewData) return false
  return (
    reviewData.global_score !== null ||
    reviewData.avg_seo_score !== null ||
    reviewData.avg_relevance_score !== null ||
    reviewData.avg_grammar_score !== null ||
    reviewData.avg_delays_score !== null
  )
}

type TaskOverviewReviewsPreviewProps = {
  taskId: number
  reviewData?: ReviewData | null
  onViewAll: () => void
  active?: boolean
}

export function TaskOverviewReviewsPreview({
  taskId,
  reviewData,
  onViewAll,
  active = true,
}: TaskOverviewReviewsPreviewProps) {
  const queryClient = useQueryClient()
  const { ref, isInViewport } = useInViewport({ enabled: active })
  const shouldLoad = active && isInViewport
  const [isAddingReview, setIsAddingReview] = useState(false)

  const reviewsQuery = useTaskReviewsQuery(taskId, shouldLoad)
  const recentReviews = (reviewsQuery.data ?? []).slice(0, PREVIEW_REVIEW_LIMIT)
  const summaryVisible = hasReviewSummary(reviewData)
  const hasPreviewContent = summaryVisible || recentReviews.length > 0
  const isEmpty =
    shouldLoad &&
    !reviewsQuery.isLoading &&
    !hasPreviewContent &&
    !isAddingReview

  const handleReviewAdded = () => {
    setIsAddingReview(false)
    void reviewsQuery.refetch()
    void queryClient.invalidateQueries({ queryKey: taskReviewsQueryKey(taskId) })
    void queryClient.invalidateQueries({ queryKey: ["task", String(taskId)] })
  }

  return (
    <div ref={ref}>
      <TaskOverviewPreviewSection
        title="Reviews"
        onViewAll={onViewAll}
        active={shouldLoad}
        isLoading={shouldLoad && reviewsQuery.isLoading && !summaryVisible && !isAddingReview}
        isError={reviewsQuery.isError && !isAddingReview}
        onRetry={() => void reviewsQuery.refetch()}
        isEmpty={isEmpty}
        emptyMessage="Add review"
        onEmptyClick={() => setIsAddingReview(true)}
      >
        <div className="space-y-3">
          {isAddingReview ? (
            <AddReviewInlineCard
              taskId={taskId}
              onSuccess={handleReviewAdded}
              onCancel={() => setIsAddingReview(false)}
            />
          ) : null}
          {summaryVisible && reviewData ? (
            <div className="rounded-lg border border-gray-200 bg-white p-3">
              {reviewData.global_score !== null ? (
                <div className="mb-2 text-center text-sm font-semibold text-gray-900">
                  {reviewData.global_score.toFixed(1)} / 5
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-14 text-gray-500">SEO</span>
                  <StarRating score={reviewData.avg_seo_score} />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-14 text-gray-500">Relevance</span>
                  <StarRating score={reviewData.avg_relevance_score} />
                </div>
              </div>
            </div>
          ) : null}
          {recentReviews.map((review) => (
            <div key={review.id} className="rounded-md border border-gray-100 px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium text-gray-900">
                  {review.review_title || "Review"}
                </span>
                {review.review_score != null ? (
                  <span className="shrink-0 text-xs text-gray-600">
                    {review.review_score.toFixed(1)} ★
                  </span>
                ) : null}
              </div>
              {review.positive_feedback ? (
                <p className="mt-1 line-clamp-2 text-xs text-gray-600">{review.positive_feedback}</p>
              ) : null}
            </div>
          ))}
          {!isAddingReview ? (
            <AddDashedButton
              label="Add review"
              className="mt-0"
              onClick={() => setIsAddingReview(true)}
            />
          ) : null}
        </div>
      </TaskOverviewPreviewSection>
    </div>
  )
}

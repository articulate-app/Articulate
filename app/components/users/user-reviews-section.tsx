"use client"

import { useCallback, useMemo, useState } from "react"
import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { ChevronDown, Loader2 } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select"
import { TaskOverviewPreviewSection } from "../tasks/task-overview-preview-section"
import { Button } from "../ui/button"
import { UserScrollableList } from "./user-scrollable-list"
import { cn } from "../../lib/utils"

const PAGE_SIZE = 5

export type ReviewSortOption = "recent" | "oldest" | "best" | "worst"

type UserReviewSummary = {
  user_id: number
  review_count: number
  avg_score: number | null
  avg_seo: number | null
  avg_relevance: number | null
  avg_grammar: number | null
  avg_delays: number | null
}

type UserReviewDetailed = {
  review_id: number
  review_score: number | null
  review_title: string | null
  task_title: string
  project_name: string | null
  created_at: string
  positive_feedback: string | null
  negative_feedback: string | null
  score_seo: number | null
  score_relevance: number | null
  score_grammar: number | null
  score_delays: number | null
}

const SORT_OPTIONS: { id: ReviewSortOption; label: string }[] = [
  { id: "recent", label: "Most recent" },
  { id: "oldest", label: "Oldest" },
  { id: "best", label: "Best score" },
  { id: "worst", label: "Worst score" },
]

function StarRating({ score }: { score: number | null }) {
  if (score === null) return <span className="text-xs text-gray-400">—</span>
  const display = score > 5 ? score / 2 : score
  return (
    <span className="flex items-center gap-0.5">
      <span className="text-xs font-medium text-gray-600">{display.toFixed(1)}</span>
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          className={`text-xs ${i < Math.floor(display) ? "text-yellow-400" : "text-gray-300"}`}
        >
          ★
        </span>
      ))}
    </span>
  )
}

function formatScore(score: number | null): string {
  if (score === null) return "—"
  return score.toFixed(1)
}

function formatReviewDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
}

function sortReviews(reviews: UserReviewDetailed[], sortBy: ReviewSortOption): UserReviewDetailed[] {
  const next = [...reviews]
  switch (sortBy) {
    case "oldest":
      return next.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    case "best":
      return next.sort((a, b) => (b.review_score ?? -1) - (a.review_score ?? -1))
    case "worst":
      return next.sort((a, b) => (a.review_score ?? 999) - (b.review_score ?? 999))
    case "recent":
    default:
      return next.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }
}

type UserReviewsSectionProps = {
  userId: number
  onViewAll?: () => void
  active?: boolean
  onVisible?: () => void
  /** When true, wrap in TaskOverviewPreviewSection (overview). When false, bare section (tab). */
  asPreview?: boolean
}

export function UserReviewsSection({
  userId,
  onViewAll,
  active = true,
  onVisible,
  asPreview = false,
}: UserReviewsSectionProps) {
  const supabase = createClientComponentClient()
  const [sortBy, setSortBy] = useState<ReviewSortOption>("recent")
  const [expandedReviewId, setExpandedReviewId] = useState<number | null>(null)

  const summaryQuery = useQuery({
    queryKey: ["user-review-summary", userId],
    enabled: active && userId > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_user_review_summary")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle()
      if (error) throw error
      return (data as UserReviewSummary | null) ?? null
    },
  })

  const reviewsQuery = useInfiniteQuery({
    queryKey: ["user-reviews-infinite", userId],
    enabled: active && userId > 0,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const from = pageParam as number
      const { data, error } = await supabase
        .from("v_user_reviews_detailed")
        .select(
          "review_id, review_score, review_title, task_title, project_name, created_at, positive_feedback, negative_feedback, score_seo, score_relevance, score_grammar, score_delays",
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .range(from, from + PAGE_SIZE - 1)
      if (error) throw error
      return (data as UserReviewDetailed[]) || []
    },
    getNextPageParam: (lastPage, pages) =>
      lastPage.length < PAGE_SIZE ? undefined : pages.length * PAGE_SIZE,
  })

  const reviews = useMemo(
    () => sortReviews((reviewsQuery.data?.pages ?? []).flat(), sortBy),
    [reviewsQuery.data?.pages, sortBy],
  )

  const onLoadMore = useCallback(() => {
    if (!reviewsQuery.hasNextPage || reviewsQuery.isFetchingNextPage) return
    void reviewsQuery.fetchNextPage()
  }, [reviewsQuery])

  const summary = summaryQuery.data
  const isLoading = summaryQuery.isLoading || reviewsQuery.isLoading
  const isError = summaryQuery.isError || reviewsQuery.isError
  const hasSummary =
    !!summary &&
    (summary.review_count > 0 ||
      summary.avg_score != null ||
      summary.avg_seo != null ||
      summary.avg_relevance != null ||
      summary.avg_grammar != null)
  const hasContent = hasSummary || reviews.length > 0
  const activeSortLabel = SORT_OPTIONS.find((option) => option.id === sortBy)?.label ?? "Most recent"

  const summaryBlock =
    summary && hasSummary ? (
      <div>
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 py-2.5">
          <div className="text-sm text-gray-900">Average score</div>
          <div className="shrink-0 text-sm font-medium tabular-nums text-gray-900">
            {formatScore(summary.avg_score)}
            {summary.avg_score != null ? (
              <span className="font-normal text-gray-500"> / 10</span>
            ) : null}
          </div>
        </div>
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 py-2.5">
          <div className="text-sm text-gray-900">Reviews</div>
          <div className="shrink-0 text-sm font-medium tabular-nums text-gray-900">
            {summary.review_count}
          </div>
        </div>
        <div className="grid gap-x-8 sm:grid-cols-2">
          <div className="flex items-center justify-between gap-3 border-b border-gray-100 py-2.5">
            <span className="text-sm text-gray-900">SEO</span>
            <StarRating score={summary.avg_seo} />
          </div>
          <div className="flex items-center justify-between gap-3 border-b border-gray-100 py-2.5">
            <span className="text-sm text-gray-900">Relevance</span>
            <StarRating score={summary.avg_relevance} />
          </div>
          <div className="flex items-center justify-between gap-3 border-b border-gray-100 py-2.5">
            <span className="text-sm text-gray-900">Grammar</span>
            <StarRating score={summary.avg_grammar} />
          </div>
          <div className="flex items-center justify-between gap-3 border-b border-gray-100 py-2.5">
            <span className="text-sm text-gray-900">Delays</span>
            <StarRating score={summary.avg_delays} />
          </div>
        </div>
      </div>
    ) : (
      <p className="py-2 text-sm text-gray-500">No review summary yet.</p>
    )

  const reviewsList =
    reviews.length > 0 ? (
      <UserScrollableList
        hasMore={!!reviewsQuery.hasNextPage}
        onLoadMore={onLoadMore}
        isLoadingMore={reviewsQuery.isFetchingNextPage}
        maxRows={5}
      >
        {reviews.map((review) => {
          const title = review.review_title?.trim() || "Review"
          const isExpanded = expandedReviewId === review.review_id
          const hasDetails =
            !!(review.positive_feedback || review.negative_feedback) ||
            !!review.task_title ||
            !!review.project_name
          return (
            <div
              key={review.review_id}
              className="border-b border-gray-100 py-2.5 last:border-b-0"
            >
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 text-left"
                onClick={() => {
                  if (!hasDetails) return
                  setExpandedReviewId(isExpanded ? null : review.review_id)
                }}
                aria-expanded={hasDetails ? isExpanded : undefined}
              >
                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                  {hasDetails ? (
                    <ChevronDown
                      className={cn(
                        "h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform",
                        isExpanded && "rotate-180",
                      )}
                    />
                  ) : (
                    <span className="inline-block h-3.5 w-3.5 shrink-0" aria-hidden />
                  )}
                  <span className="min-w-0 truncate text-sm text-gray-900">
                    {title}
                    <span className="text-gray-500">
                      {" · "}
                      {formatReviewDate(review.created_at)}
                    </span>
                  </span>
                </div>
                <div className="shrink-0 text-sm font-medium tabular-nums text-gray-900">
                  {formatScore(review.review_score)}
                  {review.review_score != null ? (
                    <span className="ml-0.5 text-yellow-400">★</span>
                  ) : null}
                </div>
              </button>
              {isExpanded && hasDetails ? (
                <div className="mt-2 space-y-2 border-t border-gray-100 pt-2 pl-5">
                  <p className="truncate text-xs text-gray-500">
                    {[review.task_title, review.project_name].filter(Boolean).join(" · ")}
                  </p>
                  {review.positive_feedback ? (
                    <p className="text-sm text-gray-700">
                      <span className="font-medium text-green-700">Positive: </span>
                      {review.positive_feedback}
                    </p>
                  ) : null}
                  {review.negative_feedback ? (
                    <p className="text-sm text-gray-700">
                      <span className="font-medium text-red-700">Negative: </span>
                      {review.negative_feedback}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          )
        })}
      </UserScrollableList>
    ) : (
      <p className="py-2 text-sm text-gray-500">No reviews yet.</p>
    )

  const body = (
    <div className="space-y-6">
      {hasSummary ? <section className="min-w-0">{summaryBlock}</section> : null}

      <section className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-medium text-gray-900">User reviews</h3>
          <Select value={sortBy} onValueChange={(value) => setSortBy(value as ReviewSortOption)}>
            <SelectTrigger className="h-8 w-auto gap-1 border-0 bg-transparent px-2 text-gray-900 hover:bg-gray-100 focus:ring-0 focus:ring-offset-0">
              <SelectValue>{activeSortLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {reviewsList}
      </section>
    </div>
  )

  if (asPreview) {
    return (
      <TaskOverviewPreviewSection
        title="Reviews"
        onViewAll={onViewAll}
        active={active}
        onVisible={onVisible}
        isLoading={active && isLoading}
        isError={isError}
        onRetry={() => {
          void summaryQuery.refetch()
          void reviewsQuery.refetch()
        }}
        isEmpty={active && !isLoading && !hasContent}
        emptyMessage="No reviews yet."
        className="py-8"
      >
        {body}
      </TaskOverviewPreviewSection>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="py-8 text-center text-sm text-red-600">
        Failed to load reviews.
        <Button type="button" variant="outline" size="sm" className="ml-2" onClick={() => void reviewsQuery.refetch()}>
          Retry
        </Button>
      </div>
    )
  }

  if (!hasContent) {
    return <p className="py-8 text-sm text-gray-500">No reviews yet.</p>
  }

  return body
}

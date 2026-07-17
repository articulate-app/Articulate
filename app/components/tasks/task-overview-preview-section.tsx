"use client"

import React, { useEffect } from "react"
import { ChevronRight, Loader2, Plus, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
import { useInViewport } from "@/hooks/use-in-viewport"

type TaskOverviewPreviewSectionProps = {
  title: string
  onViewAll?: () => void
  viewAllLabel?: string
  /** Optional actions rendered beside the section title (e.g. comments thread controls). */
  headerActions?: React.ReactNode
  /** Optional row rendered directly below the title row (e.g. filter pills). */
  belowTitle?: React.ReactNode
  /** When false, children are not rendered and lazy loading does not start. */
  active?: boolean
  isLoading?: boolean
  isError?: boolean
  onRetry?: () => void
  isEmpty?: boolean
  emptyMessage?: string
  /** When set, empty state renders as an action button (e.g. "Add attachment"). */
  onEmptyClick?: () => void
  children?: React.ReactNode
  className?: string
  /** Optional ref for the outer section element (e.g. viewport lazy-load). */
  sectionRef?: React.Ref<HTMLElement>
  /** Called once when the section scrolls into view and content is shown. */
  onVisible?: () => void
}

export function TaskOverviewPreviewSection({
  title,
  onViewAll,
  viewAllLabel = "View all",
  headerActions,
  belowTitle,
  active = true,
  isLoading = false,
  isError = false,
  onRetry,
  isEmpty = false,
  emptyMessage = "Nothing here yet.",
  onEmptyClick,
  children,
  className,
  sectionRef,
  onVisible,
}: TaskOverviewPreviewSectionProps) {
  const { ref, isInViewport } = useInViewport({ enabled: active })

  const showContent = active && isInViewport

  useEffect(() => {
    if (!showContent || !onVisible) return
    onVisible()
  }, [showContent, onVisible])

  const setSectionRef = (node: HTMLElement | null) => {
    ;(ref as React.MutableRefObject<HTMLElement | null>).current = node
    if (typeof sectionRef === "function") {
      sectionRef(node)
    } else if (sectionRef && typeof sectionRef === "object") {
      ;(sectionRef as React.MutableRefObject<HTMLElement | null>).current = node
    }
  }

  return (
    <section
      ref={setSectionRef}
      className={cn("border-t border-gray-100 py-4 first:border-t-0", className)}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {onViewAll ? (
            <button
              type="button"
              onClick={onViewAll}
              className="group flex min-w-0 items-center gap-1 text-left"
            >
              <h3 className="text-base font-medium text-gray-900 group-hover:text-gray-700">
                {title}
              </h3>
              <ChevronRight className="h-4 w-4 shrink-0 text-gray-400 opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          ) : (
            <h3 className="text-base font-medium text-gray-900">{title}</h3>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {headerActions}
          {onViewAll ? (
            <button
              type="button"
              onClick={onViewAll}
              className="shrink-0 text-xs text-blue-600 hover:underline"
            >
              {viewAllLabel}
            </button>
          ) : null}
        </div>
      </div>

      {belowTitle ? <div className="mb-3">{belowTitle}</div> : null}

      {!showContent ? (
        <div className="space-y-2">
          <div className="h-4 w-2/3 animate-pulse rounded bg-gray-100" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-gray-100" />
        </div>
      ) : isLoading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      ) : isError ? (
        <div className="flex items-center gap-2 text-sm text-red-600">
          <span>Could not load preview.</span>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1 text-xs text-red-700 hover:underline"
            >
              <RefreshCw className="h-3 w-3" />
              Retry
            </button>
          ) : null}
        </div>
      ) : isEmpty ? (
        onEmptyClick ? (
          <button
            type="button"
            onClick={onEmptyClick}
            className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 hover:underline"
          >
            <Plus className="h-4 w-4" />
            {emptyMessage}
          </button>
        ) : (
          <p className="text-sm text-gray-500">{emptyMessage}</p>
        )
      ) : (
        children
      )}
    </section>
  )
}

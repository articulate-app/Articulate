"use client"

import React, { useEffect, useId, useState } from "react"
import { ChevronDown, ChevronRight, Loader2, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
import { useInViewport } from "@/hooks/use-in-viewport"
import { AddDashedButton } from "../ui/add-dashed-button"

type TaskOverviewPreviewSectionProps = {
  title: string
  /** Marks the whole section (title included) as the outputs file-drop target. */
  outputsDropzone?: boolean
  onViewAll?: () => void
  viewAllLabel?: string
  /** Optional actions rendered beside the section title (e.g. comments thread controls). */
  headerActions?: React.ReactNode
  /** Optional row rendered directly below the title row (e.g. filter pills). */
  belowTitle?: React.ReactNode
  /** When false, children are not rendered. Viewport is only used for `onVisible`. */
  active?: boolean
  /** Start expanded (default true). */
  defaultCollapsed?: boolean
  /** Controlled collapsed state; when set, parent owns expand/collapse. */
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
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
  outputsDropzone = false,
  onViewAll,
  viewAllLabel = "View all",
  headerActions,
  belowTitle,
  active = true,
  defaultCollapsed = false,
  collapsed: collapsedControlled,
  onCollapsedChange,
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
  const contentId = useId()
  const [collapsedLocal, setCollapsedLocal] = useState(defaultCollapsed)
  const isCollapsed =
    typeof collapsedControlled === "boolean" ? collapsedControlled : collapsedLocal
  const setCollapsed = (next: boolean) => {
    if (typeof collapsedControlled !== "boolean") setCollapsedLocal(next)
    onCollapsedChange?.(next)
  }

  const { ref, isInViewport } = useInViewport({ enabled: active && !isCollapsed })
  const showChrome = active && !isCollapsed
  const hasChildren = children != null && children !== false

  useEffect(() => {
    if (!showChrome || !isInViewport || !onVisible) return
    onVisible()
  }, [showChrome, isInViewport, onVisible])

  const setSectionRef = (node: HTMLElement | null) => {
    ;(ref as React.MutableRefObject<HTMLElement | null>).current = node
    if (typeof sectionRef === "function") {
      sectionRef(node)
    } else if (sectionRef && typeof sectionRef === "object") {
      ;(sectionRef as React.MutableRefObject<HTMLElement | null>).current = node
    }
  }

  const Chevron = isCollapsed ? ChevronRight : ChevronDown

  return (
    <section
      ref={setSectionRef}
      data-outputs-dropzone={outputsDropzone ? "true" : undefined}
      className={cn("border-t border-gray-200 pt-5 pb-4", className)}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setCollapsed(!isCollapsed)}
          className="group flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={!isCollapsed}
          aria-controls={contentId}
        >
          <h3 className="min-w-0 truncate text-sm font-semibold text-gray-900">{title}</h3>
        </button>
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
          <button
            type="button"
            onClick={() => setCollapsed(!isCollapsed)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-50 hover:text-gray-600"
            aria-expanded={!isCollapsed}
            aria-controls={contentId}
            aria-label={isCollapsed ? `Expand ${title}` : `Collapse ${title}`}
          >
            <Chevron className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      {!isCollapsed ? (
        <div id={contentId}>
          {belowTitle ? <div className="mb-3">{belowTitle}</div> : null}

          {hasChildren ? (
            children
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
              <AddDashedButton
                label={emptyMessage}
                className="mt-0"
                onClick={onEmptyClick}
              />
            ) : (
              <p className="text-sm text-gray-500">{emptyMessage}</p>
            )
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

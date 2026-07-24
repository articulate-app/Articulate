"use client"

import { useEffect, useRef, type ReactNode } from "react"
import { Loader2 } from "lucide-react"
import { cn } from "../../lib/utils"

/** Roughly 5 compact rows (~44px each). */
export const USER_LIST_SCROLL_MAX_5_CLASS = "max-h-[13.75rem]"
/** Roughly 10 compact rows. */
export const USER_LIST_SCROLL_MAX_10_CLASS = "max-h-[27.5rem]"
/** Taller comments viewport (~14 rows). */
export const USER_LIST_SCROLL_MAX_COMMENTS_CLASS = "max-h-[38.5rem]"

type UserScrollableListProps = {
  children: ReactNode
  hasMore?: boolean
  onLoadMore?: () => void
  isLoadingMore?: boolean
  className?: string
  /** Observe against this scroll root (defaults to the list itself). */
  disabled?: boolean
  /** Fill parent height instead of capping row height. */
  fill?: boolean
  /** Visible viewport height before inner scroll (default 5). */
  maxRows?: 5 | 10 | "comments"
  /**
   * Bleed into parent right padding so the inner scrollbar sits next to the main pane scrollbar.
   */
  edgeAlign?: boolean
}

/**
 * Caps visible height and loads more when the sentinel enters view.
 */
export function UserScrollableList({
  children,
  hasMore = false,
  onLoadMore,
  isLoadingMore = false,
  className,
  disabled = false,
  fill = false,
  maxRows = 5,
  edgeAlign = false,
}: UserScrollableListProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const root = rootRef.current
    const sentinel = sentinelRef.current
    if (!root || !sentinel || disabled || !onLoadMore) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !isLoadingMore) {
          onLoadMore()
        }
      },
      { root, threshold: 0.1, rootMargin: "80px 0px" },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [disabled, hasMore, isLoadingMore, onLoadMore, children])

  return (
    <div
      ref={rootRef}
      className={cn(
        "min-w-0 overflow-y-auto",
        fill
          ? "h-full max-h-none"
          : maxRows === "comments"
            ? USER_LIST_SCROLL_MAX_COMMENTS_CLASS
            : maxRows === 10
              ? USER_LIST_SCROLL_MAX_10_CLASS
              : USER_LIST_SCROLL_MAX_5_CLASS,
        edgeAlign && "-mr-6",
        className,
      )}
    >
      <div className={cn(edgeAlign && "pr-6")}>{children}</div>
      <div ref={sentinelRef} className="h-3 w-full shrink-0" aria-hidden />
      {isLoadingMore ? (
        <div className={cn("flex items-center justify-center gap-2 py-2 text-xs text-gray-500", edgeAlign && "pr-6")}>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading more…
        </div>
      ) : null}
    </div>
  )
}

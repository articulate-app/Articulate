"use client"

import { useCallback, useMemo } from "react"
import { usePathname } from "next/navigation"
import { format, parseISO, isValid } from "date-fns"
import { Loader2, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { useTaskSuggestionsQuery } from "../../hooks/use-task-suggestions-query"
import { buildCenterPaneTabSelectionSearchParams } from "../../lib/center-pane-selection-url"
import { shallowReplaceSearchParams } from "../../lib/tasks-shallow-nav"
import { useCenterPaneTabsStore } from "../../store/center-pane-tabs"
import type { SuggestionItem } from "../../lib/types/planner-item"

function formatPlannedDate(value: string | null | undefined): string | null {
  if (!value) return null
  const parsed = parseISO(value.length === 10 ? `${value}T00:00:00` : value)
  if (!isValid(parsed)) return null
  return format(parsed, "d MMM yyyy")
}

function SuggestionRow({
  item,
  compact,
  onOpen,
}: {
  item: SuggestionItem
  compact?: boolean
  onOpen: (item: SuggestionItem) => void
}) {
  const planned = formatPlannedDate(item.planned_for_date ?? item.delivery_date)
  const meta = [item.content_type_title, planned].filter(Boolean).join(" · ")

  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className={cn(
        "flex w-full min-w-0 items-start gap-3 rounded-md text-left transition-colors hover:bg-gray-50",
        compact ? "px-2 py-2" : "px-3 py-2.5",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex shrink-0 items-center justify-center rounded-md bg-amber-50 text-amber-700",
          compact ? "h-7 w-7" : "h-8 w-8",
        )}
      >
        <Sparkles className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate font-medium text-gray-900",
            compact ? "text-sm" : "text-sm",
          )}
        >
          {item.title || "Untitled suggestion"}
        </span>
        {meta ? (
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{meta}</span>
        ) : null}
      </span>
    </button>
  )
}

export function ProjectSuggestionsTab({
  projectId,
  variant = "full",
}: {
  projectId: number
  variant?: "full" | "preview"
}) {
  const pathname = usePathname()
  const upsertTab = useCenterPaneTabsStore((s) => s.upsertTab)
  const isPreview = variant === "preview"

  const suggestionsQuery = useTaskSuggestionsQuery({
    projectIds: [projectId],
    from: null,
    to: null,
    limit: isPreview ? 8 : 200,
    enabled: Number.isFinite(projectId) && projectId > 0,
    cacheKeyParts: ["project-sheet", isPreview ? "preview" : "full"],
  })

  const items = suggestionsQuery.data ?? []
  const previewItems = useMemo(() => items.slice(0, 5), [items])
  const displayItems = isPreview ? previewItems : items

  const handleOpen = useCallback(
    (item: SuggestionItem) => {
      const id = item.entity_id ?? item.suggestion_id ?? item.id
      if (id == null || !Number.isFinite(Number(id))) return
      const base = new URLSearchParams(
        typeof window !== "undefined" ? window.location.search : "",
      )
      const next = buildCenterPaneTabSelectionSearchParams({
        currentSearchParams: base,
        kind: "suggestion",
        id,
      })
      upsertTab({
        kind: "suggestion",
        id: String(id),
        title: item.title || null,
      })
      shallowReplaceSearchParams(pathname, next, "project-suggestion-open")
    },
    [pathname, upsertTab],
  )

  if (suggestionsQuery.isLoading) {
    return (
      <div
        className={cn(
          "flex items-center justify-center gap-2 text-sm text-muted-foreground",
          isPreview ? "py-6" : "h-full min-h-[12rem]",
        )}
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading suggestions…
      </div>
    )
  }

  if (suggestionsQuery.isError) {
    return (
      <div
        className={cn(
          "text-sm text-red-600",
          isPreview ? "py-4" : "p-6",
        )}
      >
        Failed to load suggestions.
        <button
          type="button"
          className="ml-2 underline"
          onClick={() => void suggestionsQuery.refetch()}
        >
          Retry
        </button>
      </div>
    )
  }

  if (displayItems.length === 0) {
    return (
      <div
        className={cn(
          "text-sm text-muted-foreground",
          isPreview ? "py-2" : "flex h-full min-h-[12rem] items-center justify-center p-6",
        )}
      >
        No pending AI suggestions for this project.
      </div>
    )
  }

  return (
    <div className={cn("min-w-0", isPreview ? "" : "p-6")}>
      {!isPreview ? (
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">AI suggestions</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Proposed tasks from the project planner. Open one to review, approve, or dismiss.
            </p>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">
            {items.length} pending
          </span>
        </div>
      ) : items.length > 0 ? (
        <p className="mb-2 px-2 text-xs text-muted-foreground">
          {items.length} pending
        </p>
      ) : null}

      <div
        className={cn(
          "min-w-0 divide-y divide-gray-100",
          !isPreview && "rounded-md border border-gray-200",
        )}
      >
        {displayItems.map((item) => (
          <SuggestionRow
            key={item.board_item_id ?? `suggestion:${item.id}`}
            item={item}
            compact={isPreview}
            onOpen={handleOpen}
          />
        ))}
      </div>
    </div>
  )
}

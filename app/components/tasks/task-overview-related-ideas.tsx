"use client"

import React from "react"
import { Loader2, RefreshCw, X, Check } from "lucide-react"
import { TaskOverviewPreviewSection } from "./task-overview-preview-section"

export type TaskRelatedIdeaPreviewRow = {
  id: string
  task_id: number
  project_id: number | null
  title: string | null
  description: string | null
  content_type_id: number | null
  status: string
}

type TaskOverviewRelatedIdeasProps = {
  ideas: TaskRelatedIdeaPreviewRow[]
  isLoading?: boolean
  isRefreshing?: boolean
  ideaActionById?: Record<string, "accepted" | "dismissed" | null>
  contentTypeLabelById?: Map<string, string>
  onDismiss: (ideaId: string) => void
  onAccept: (idea: TaskRelatedIdeaPreviewRow) => void
  onRefresh?: () => void
  active?: boolean
}

export function TaskOverviewRelatedIdeas({
  ideas,
  isLoading = false,
  isRefreshing = false,
  ideaActionById = {},
  contentTypeLabelById,
  onDismiss,
  onAccept,
  onRefresh,
  active = true,
}: TaskOverviewRelatedIdeasProps) {
  const isEmpty = !isLoading && ideas.length === 0

  return (
    <TaskOverviewPreviewSection
      title="Related ideas"
      active={active}
      isLoading={isLoading}
      isEmpty={isEmpty}
      emptyMessage="No related ideas yet."
    >
      <ul className="flex flex-col">
        {ideas.map((idea) => {
          const isActing = ideaActionById[idea.id] != null
          const contentTypeLabel =
            idea.content_type_id != null
              ? contentTypeLabelById?.get(String(idea.content_type_id))
              : null
          const title = idea.title?.trim() || "Untitled idea"
          const description = idea.description?.trim() || null

          return (
            <li key={idea.id} className="group flex min-h-0 items-center gap-2.5 py-2">
              <div className="min-w-0 flex-1 overflow-hidden">
                <div className="flex min-w-0 items-center gap-1.5 text-sm leading-5">
                  <span className="truncate text-gray-900">{title}</span>
                  {contentTypeLabel ? (
                    <>
                      <span className="shrink-0 text-gray-300" aria-hidden>
                        ·
                      </span>
                      <span className="shrink-0 truncate text-muted-foreground">
                        {contentTypeLabel}
                      </span>
                    </>
                  ) : null}
                </div>
                {description ? (
                  <div className="mt-0.5 truncate text-xs text-gray-500">{description}</div>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-0.5 opacity-100 md:opacity-0 md:transition-opacity md:group-hover:opacity-100">
                <button
                  type="button"
                  className="inline-flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
                  title="Dismiss"
                  aria-label="Dismiss idea"
                  disabled={isActing || isRefreshing}
                  onClick={() => onDismiss(idea.id)}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="inline-flex h-6 w-6 items-center justify-center rounded text-blue-600 hover:bg-blue-50 disabled:opacity-50"
                  title="Accept"
                  aria-label="Accept idea"
                  disabled={isActing || isRefreshing}
                  onClick={() => onAccept(idea)}
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          )
        })}
      </ul>
      {onRefresh ? (
        <button
          type="button"
          className="mt-1 flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50"
          onClick={onRefresh}
          disabled={isRefreshing}
        >
          {isRefreshing ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              Refreshing…
            </>
          ) : (
            <>
              <RefreshCw className="h-3 w-3" />
              Refresh ideas
            </>
          )}
        </button>
      ) : null}
    </TaskOverviewPreviewSection>
  )
}

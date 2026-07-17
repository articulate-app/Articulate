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
      <ul className="flex flex-col py-1">
        {ideas.map((idea, idx) => {
          const isActing = ideaActionById[idea.id] != null
          const contentTypeLabel =
            idea.content_type_id != null
              ? contentTypeLabelById?.get(String(idea.content_type_id))
              : null
          const title = idea.title?.trim() || "Untitled idea"
          const description = idea.description?.trim() || null

          return (
            <li key={idea.id}>
              {idx > 0 ? <div className="border-t border-gray-200" /> : null}
              <div className="group flex items-center gap-2 py-1.5 min-h-0">
                <div className="min-w-0 flex-1 overflow-hidden">
                  <div className="truncate text-sm text-gray-900">{title}</div>
                  <div className="truncate text-xs text-gray-500">
                    {contentTypeLabel || description || "Suggested follow-up"}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:transition-opacity">
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

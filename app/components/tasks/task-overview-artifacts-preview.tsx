"use client"

import React, { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { ChevronRight, FileText } from "lucide-react"
import { TaskOverviewPreviewSection } from "./task-overview-preview-section"
import { useInViewport } from "@/hooks/use-in-viewport"
import { listProjectArtifacts, listTaskArtifacts } from "@/lib/services/artifacts"
import { getActivityRelativeTimeLabel } from "../activity-row-timestamp"
import { openArtifactCenterTab } from "../../../features/artifacts/open-artifact-center-tab"
import { cn } from "@/lib/utils"

const PREVIEW_ARTIFACT_LIMIT = 5

type TaskOverviewArtifactsPreviewProps = {
  taskId?: number
  projectId?: number
  onViewAll: () => void
  active?: boolean
}

/**
 * Lightweight stacked artifact cards for Overview.
 * Uses list RPCs with `includeContent: false` (preview metadata only).
 */
export function TaskOverviewArtifactsPreview({
  taskId,
  projectId,
  onViewAll,
  active = true,
}: TaskOverviewArtifactsPreviewProps) {
  const { ref, isInViewport } = useInViewport({ enabled: active })
  const shouldLoad = active && isInViewport
  const scopeKey =
    taskId != null && taskId > 0
      ? (["task-artifacts", taskId, "overview-preview"] as const)
      : projectId != null && projectId > 0
        ? (["project-artifacts", projectId, "overview-preview"] as const)
        : null

  const artifactsQuery = useQuery({
    queryKey: scopeKey ?? ["artifacts-overview-preview", "none"],
    enabled: shouldLoad && scopeKey != null,
    staleTime: 30_000,
    queryFn: async () => {
      if (taskId != null && taskId > 0) {
        const result = await listTaskArtifacts({
          taskId,
          includeContent: false,
          limit: PREVIEW_ARTIFACT_LIMIT + 1,
        })
        return result.artifacts ?? []
      }
      if (projectId != null && projectId > 0) {
        const result = await listProjectArtifacts({
          projectId,
          includeContent: false,
          limit: PREVIEW_ARTIFACT_LIMIT + 1,
        })
        return result.artifacts ?? []
      }
      return []
    },
  })

  const artifacts = artifactsQuery.data ?? []
  const previewArtifacts = useMemo(
    () => artifacts.slice(0, PREVIEW_ARTIFACT_LIMIT),
    [artifacts],
  )
  const hasMore = artifacts.length > PREVIEW_ARTIFACT_LIMIT
  const isEmpty =
    shouldLoad && !artifactsQuery.isLoading && !artifactsQuery.isError && previewArtifacts.length === 0

  return (
    <div ref={ref}>
      <TaskOverviewPreviewSection
        title="Outputs"
        onViewAll={onViewAll}
        active={shouldLoad}
        isLoading={shouldLoad && artifactsQuery.isLoading}
        isError={artifactsQuery.isError}
        onRetry={() => void artifactsQuery.refetch()}
        isEmpty={isEmpty}
        emptyMessage="Nothing here yet."
      >
        <ul className="space-y-1.5">
          {previewArtifacts.map((artifact) => {
            const title = artifact.title?.trim() || "Untitled output"
            const preview = artifact.content_preview?.trim() || null
            return (
              <li key={artifact.id}>
                <button
                  type="button"
                  className={cn(
                    "group flex w-full items-start gap-2 rounded-md border border-gray-200 bg-white px-3 py-2.5 text-left",
                    "transition-colors hover:border-gray-300 hover:bg-gray-50",
                  )}
                  onClick={() => {
                    openArtifactCenterTab({
                      artifactId: artifact.id,
                      title,
                      version: artifact.current_version ?? null,
                    })
                  }}
                  title={`Open ${title}`}
                >
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-gray-900">
                      {title}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-gray-500">
                      {artifact.artifact_type ? <span>{artifact.artifact_type}</span> : null}
                      {artifact.updated_at ? (
                        <span>{getActivityRelativeTimeLabel(artifact.updated_at)}</span>
                      ) : null}
                    </span>
                    {preview ? (
                      <span className="mt-1 line-clamp-2 text-xs text-gray-500">{preview}</span>
                    ) : null}
                  </span>
                  <ChevronRight
                    className="mt-0.5 h-4 w-4 shrink-0 text-gray-300 transition-colors group-hover:text-gray-500"
                    aria-hidden
                  />
                </button>
              </li>
            )
          })}
        </ul>
        {hasMore ? (
          <button
            type="button"
            className="mt-2 text-xs text-blue-600 hover:underline"
            onClick={onViewAll}
          >
            View all outputs
          </button>
        ) : null}
      </TaskOverviewPreviewSection>
    </div>
  )
}

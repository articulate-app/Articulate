"use client"

import React, { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ExternalLink, Loader2, Paperclip, RefreshCw, X } from "lucide-react"
import { cn } from "../../app/lib/utils"
import { sourceScopeLabel, type SourceStatus } from "../../app/lib/sources/source-types"
import {
  attachSourceScope,
  getSource,
  refreshSource,
} from "../../app/lib/services/sources"
import { useSourcesRealtime } from "../../app/hooks/use-sources-realtime"
import { useCenterPaneTabsStore } from "../../app/store/center-pane-tabs"
import { buildCenterPaneTabKey } from "../../app/store/center-pane-tabs"

export type SourcePaneProps = {
  sourceId: string
  onClose?: () => void
  className?: string
}

const STATUS_STYLES: Record<SourceStatus, string> = {
  pending: "bg-amber-50 text-amber-800 border-amber-200",
  ready: "bg-emerald-50 text-emerald-800 border-emerald-200",
  failed: "bg-red-50 text-red-800 border-red-200",
  archived: "bg-gray-50 text-gray-600 border-gray-200",
}

/**
 * Canonical source center-pane tab: factual input context only (not an artifact).
 */
export function SourcePane({ sourceId, onClose, className }: SourcePaneProps) {
  const queryClient = useQueryClient()
  const updateTitle = useCenterPaneTabsStore((s) => s.updateTitle)
  const [attachTaskId, setAttachTaskId] = useState("")
  const [attachProjectId, setAttachProjectId] = useState("")
  const [attachError, setAttachError] = useState<string | null>(null)

  const sourceQuery = useQuery({
    queryKey: ["source", sourceId, "current"],
    queryFn: () => getSource({ sourceId }),
    enabled: !!sourceId,
    staleTime: 5_000,
    refetchInterval: (query) =>
      query.state.data?.source.status === "pending" ? 4_000 : false,
  })

  const source = sourceQuery.data?.source ?? null

  useSourcesRealtime({
    sourceId,
    taskId: source?.task_id,
    projectId: source?.project_id,
    aiThreadId: source?.ai_thread_id,
    enabled: !!sourceId,
  })

  React.useEffect(() => {
    if (!source?.title) return
    updateTitle(buildCenterPaneTabKey("source", sourceId), source.title)
  }, [source?.title, sourceId, updateTitle])

  const refreshMutation = useMutation({
    mutationFn: () => refreshSource(sourceId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["source", sourceId] })
    },
  })

  const attachMutation = useMutation({
    mutationFn: async () => {
      const taskId = attachTaskId.trim() ? Number(attachTaskId) : null
      const projectId = attachProjectId.trim() ? Number(attachProjectId) : null
      if (
        (taskId != null && (!Number.isFinite(taskId) || taskId <= 0)) ||
        (projectId != null && (!Number.isFinite(projectId) || projectId <= 0))
      ) {
        throw new Error("Enter a valid task or project id")
      }
      if (taskId == null && projectId == null) {
        throw new Error("Enter a task id and/or project id")
      }
      return attachSourceScope({
        sourceId,
        taskId,
        projectId,
      })
    },
    onSuccess: () => {
      setAttachError(null)
      setAttachTaskId("")
      setAttachProjectId("")
      void queryClient.invalidateQueries({ queryKey: ["source", sourceId] })
    },
    onError: (err: unknown) => {
      setAttachError(err instanceof Error ? err.message : "Failed to attach scope")
    },
  })

  const scopeBadges = useMemo(() => {
    if (!source) return [] as string[]
    const badges: string[] = []
    if (source.task_id != null) badges.push(`Task ${source.task_id}`)
    if (source.project_id != null) badges.push(`Project ${source.project_id}`)
    if (source.ai_thread_id) badges.push("AI thread")
    if (badges.length === 0) badges.push("Unattached")
    return badges
  }, [source])

  const canRefresh =
    source != null &&
    (source.source_type === "url" || source.source_type === "file" || !!source.attachment_id)

  return (
    <div className={cn("flex h-full min-h-0 flex-col bg-white", className)}>
      <header className="flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-base font-semibold text-gray-900">
              {source?.title ?? "Source"}
            </h2>
            {source ? (
              <span
                className={cn(
                  "rounded border px-1.5 py-0.5 text-[11px] font-medium capitalize",
                  STATUS_STYLES[source.status],
                )}
              >
                {source.status}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-gray-500">
            Source · {source?.source_type?.replace(/_/g, " ") ?? "—"}
            {source ? ` · v${source.current_version}` : ""}
            {source ? ` · ${sourceScopeLabel(source)}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {canRefresh ? (
            <button
              type="button"
              onClick={() => refreshMutation.mutate()}
              disabled={refreshMutation.isPending || source?.status === "pending"}
              className="inline-flex items-center gap-1 rounded border border-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              title="Refresh extracted content"
            >
              {refreshMutation.isPending || source?.status === "pending" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Refresh
            </button>
          ) : null}
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              aria-label="Close source"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {sourceQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading source…
          </div>
        ) : sourceQuery.isError ? (
          <p className="text-sm text-red-600">
            {sourceQuery.error instanceof Error
              ? sourceQuery.error.message
              : "Failed to load source"}
          </p>
        ) : source ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-1.5">
              {scopeBadges.map((badge) => (
                <span
                  key={badge}
                  className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] text-gray-700"
                >
                  {badge}
                </span>
              ))}
            </div>

            {source.source_url ? (
              <div>
                <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">
                  Original URL
                </p>
                <a
                  href={source.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex max-w-full items-center gap-1 truncate text-sm text-blue-700 hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{source.source_url}</span>
                </a>
              </div>
            ) : null}

            {source.attachment_id ? (
              <div>
                <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">
                  Attachment
                </p>
                <p className="inline-flex items-center gap-1.5 text-sm text-gray-700">
                  <Paperclip className="h-3.5 w-3.5 text-gray-400" />
                  <span className="font-mono text-xs">{source.attachment_id}</span>
                </p>
              </div>
            ) : null}

            {source.status === "pending" ? (
              <div className="flex items-center gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <Loader2 className="h-4 w-4 animate-spin" />
                Importing… extraction runs in the background and will update this view.
              </div>
            ) : null}

            {source.status === "failed" ? (
              <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                Import failed. You can retry with Refresh.
              </div>
            ) : null}

            <div>
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">
                Extracted content
              </p>
              {source.content_text?.trim() ? (
                <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap rounded border border-gray-100 bg-gray-50 p-3 text-sm leading-relaxed text-gray-800">
                  {source.content_text}
                </pre>
              ) : (
                <p className="text-sm text-gray-500">
                  {source.status === "pending"
                    ? "Content will appear when import finishes."
                    : "No extracted text yet."}
                </p>
              )}
            </div>

            <div className="rounded border border-gray-200 p-3">
              <p className="mb-2 text-xs font-medium text-gray-700">
                Attach to task / project
              </p>
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-0.5 text-[11px] text-gray-500">
                  Task id
                  <input
                    value={attachTaskId}
                    onChange={(e) => setAttachTaskId(e.target.value)}
                    className="w-28 rounded border border-gray-200 px-2 py-1 text-sm text-gray-900"
                    inputMode="numeric"
                    placeholder="e.g. 42"
                  />
                </label>
                <label className="flex flex-col gap-0.5 text-[11px] text-gray-500">
                  Project id
                  <input
                    value={attachProjectId}
                    onChange={(e) => setAttachProjectId(e.target.value)}
                    className="w-28 rounded border border-gray-200 px-2 py-1 text-sm text-gray-900"
                    inputMode="numeric"
                    placeholder="e.g. 7"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => attachMutation.mutate()}
                  disabled={attachMutation.isPending}
                  className="rounded border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                >
                  {attachMutation.isPending ? "Attaching…" : "Attach"}
                </button>
              </div>
              {attachError ? (
                <p className="mt-2 text-xs text-red-600">{attachError}</p>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

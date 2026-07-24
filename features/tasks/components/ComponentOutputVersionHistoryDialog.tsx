"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
import { Loader2, RotateCcw, GitCompare } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../app/components/ui/dialog"
import { Button } from "../../../app/components/ui/button"
import { Badge } from "../../../app/components/ui/badge"
import { toast } from "../../../app/components/ui/use-toast"
import {
  fetchTaskChannelComponentOutputVersions,
  fetchTaskComponentOutputVersions,
  resolveChangeSourceBadge,
  rollbackTaskComponentOutputVersion,
} from "@/lib/services/content-version-history"
import type { RolledBackTaskComponentOutput, TaskComponentOutputVersion } from "@/lib/types/content-version-history"
import { ComponentContentDiffView } from "./ComponentContentDiffView"
import { ComponentOutputReadonlyBody } from "./ComponentOutputReadonlyBody"
import { COMPONENT_OUTPUT_BODY_WRAPPER_CLASS } from "./component-output-body-shared"
import { buildComponentPreviewDiff, normalizeDiffPlainText } from "../utils/component-content-diff"
import { normalizeMixedRichText } from "../../../app/lib/rich-text-normalization"
import { cn } from "../../../app/lib/utils"
import {
  CONTENT_VERSION_HISTORY_REFRESH_EVENT,
  type ContentVersionHistoryRefreshDetail,
} from "../../ai-chat/apply-ai-thread-timeline-restore"

export type VersionHistoryComponentOption = {
  taskComponentId: string | null
  taskComponentOutputId: string
  title: string
  currentContentText?: string | null
}

type ComponentOutputVersionHistoryDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Channel-wide history (preferred). When set with channelId, loads all component versions. */
  taskId?: number | null
  channelId?: number | null
  channelLabel?: string | null
  componentOptions?: VersionHistoryComponentOption[]
  /** Pre-select a component filter (task_component_id). Null/undefined = all components. */
  initialFilterTaskComponentId?: string | null
  /** Legacy single-component mode (kept for callers that only have one output id). */
  taskComponentOutputId?: string | null
  componentTitle?: string
  currentContentText?: string | null
  onRestored?: (output: RolledBackTaskComponentOutput) => void
  onBeforeRestore?: (version: TaskComponentOutputVersion) => Promise<void>
}

function versionContentToHtml(version: TaskComponentOutputVersion): string {
  if (version.content_text?.trim()) {
    return normalizeMixedRichText(version.content_text) || version.content_text
  }
  if (Array.isArray(version.content_json)) {
    const paragraphText = version.content_json
      .filter((block) => block && typeof block === "object")
      .map((block) => {
        const row = block as { type?: string; text?: string }
        if (row.type === "paragraph" || row.type === "text") {
          return typeof row.text === "string" ? row.text : ""
        }
        return ""
      })
      .join("\n")
      .trim()
    if (paragraphText) return normalizeMixedRichText(paragraphText) || paragraphText
  }
  return ""
}

function formatVersionTimestamp(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

export function ComponentOutputVersionHistoryDialog({
  open,
  onOpenChange,
  taskId = null,
  channelId = null,
  channelLabel = null,
  componentOptions = [],
  initialFilterTaskComponentId = null,
  taskComponentOutputId = null,
  componentTitle = "Component output",
  currentContentText = null,
  onRestored,
  onBeforeRestore,
}: ComponentOutputVersionHistoryDialogProps) {
  const isChannelMode = taskId != null && channelId != null
  const [versions, setVersions] = useState<TaskComponentOutputVersion[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [restoringVersionId, setRestoringVersionId] = useState<string | null>(null)
  const [expandedDiffVersionId, setExpandedDiffVersionId] = useState<string | null>(null)
  const [expandedPreviewVersionId, setExpandedPreviewVersionId] = useState<string | null>(null)
  const [filterTaskComponentId, setFilterTaskComponentId] = useState<string>("all")

  useEffect(() => {
    if (!open) return
    setFilterTaskComponentId(initialFilterTaskComponentId?.trim() || "all")
    setExpandedDiffVersionId(null)
    setExpandedPreviewVersionId(null)
  }, [open, initialFilterTaskComponentId])

  const componentTitleByOutputId = useMemo(() => {
    const map = new Map<string, string>()
    for (const option of componentOptions) {
      map.set(option.taskComponentOutputId, option.title)
    }
    return map
  }, [componentOptions])

  const componentTitleByTaskComponentId = useMemo(() => {
    const map = new Map<string, string>()
    for (const option of componentOptions) {
      if (option.taskComponentId) map.set(option.taskComponentId, option.title)
    }
    return map
  }, [componentOptions])

  const currentContentByOutputId = useMemo(() => {
    const map = new Map<string, string | null>()
    for (const option of componentOptions) {
      map.set(option.taskComponentOutputId, option.currentContentText ?? null)
    }
    if (taskComponentOutputId) {
      map.set(taskComponentOutputId, currentContentText)
    }
    return map
  }, [componentOptions, currentContentText, taskComponentOutputId])

  const loadVersions = useCallback(async () => {
    setIsLoading(true)
    try {
      if (isChannelMode && taskId != null && channelId != null) {
        const rows = await fetchTaskChannelComponentOutputVersions(taskId, channelId)
        setVersions(rows)
        return
      }
      if (!taskComponentOutputId) {
        setVersions([])
        return
      }
      const rows = await fetchTaskComponentOutputVersions(taskComponentOutputId)
      setVersions(rows)
    } catch (error) {
      console.error("Failed to load component output versions", error)
      toast({
        title: "Failed to load version history",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }, [channelId, isChannelMode, taskComponentOutputId, taskId])

  useEffect(() => {
    if (!open) return
    void loadVersions()
  }, [open, loadVersions])

  useEffect(() => {
    if (!open) return
    const handleRefresh = (event: Event) => {
      const detail = (event as CustomEvent<ContentVersionHistoryRefreshDetail>).detail
      if (isChannelMode) {
        if (detail?.taskId != null && taskId != null && detail.taskId !== taskId) return
        if (detail?.channelId != null && channelId != null && detail.channelId !== channelId) return
      } else if (
        detail?.taskComponentOutputId
        && taskComponentOutputId
        && detail.taskComponentOutputId !== taskComponentOutputId
      ) {
        return
      }
      void loadVersions()
    }
    window.addEventListener(CONTENT_VERSION_HISTORY_REFRESH_EVENT, handleRefresh)
    return () => window.removeEventListener(CONTENT_VERSION_HISTORY_REFRESH_EVENT, handleRefresh)
  }, [channelId, isChannelMode, loadVersions, open, taskComponentOutputId, taskId])

  const filterOptions = useMemo(() => {
    const seen = new Set<string>()
    const options: Array<{ value: string; label: string }> = [{ value: "all", label: "All components" }]
    for (const option of componentOptions) {
      const value = option.taskComponentId?.trim() || `output:${option.taskComponentOutputId}`
      if (seen.has(value)) continue
      seen.add(value)
      options.push({ value, label: option.title || "Untitled component" })
    }
    // Include components that appear in history but are no longer in the active list.
    for (const version of versions) {
      const value = version.task_component_id?.trim() || `output:${version.task_component_output_id}`
      if (seen.has(value)) continue
      seen.add(value)
      const label =
        (version.task_component_id && componentTitleByTaskComponentId.get(version.task_component_id))
        || componentTitleByOutputId.get(version.task_component_output_id)
        || "Removed component"
      options.push({ value, label })
    }
    return options
  }, [componentOptions, componentTitleByOutputId, componentTitleByTaskComponentId, versions])

  const filteredVersions = useMemo(() => {
    if (!isChannelMode || filterTaskComponentId === "all") return versions
    if (filterTaskComponentId.startsWith("output:")) {
      const outputId = filterTaskComponentId.slice("output:".length)
      return versions.filter((version) => version.task_component_output_id === outputId)
    }
    return versions.filter((version) => version.task_component_id === filterTaskComponentId)
  }, [filterTaskComponentId, isChannelMode, versions])

  const previousByOutputAndVersion = useMemo(() => {
    const grouped = new Map<string, TaskComponentOutputVersion[]>()
    for (const version of versions) {
      const key = version.task_component_output_id
      const list = grouped.get(key) ?? []
      list.push(version)
      grouped.set(key, list)
    }
    const map = new Map<string, TaskComponentOutputVersion | null>()
    for (const [outputId, list] of grouped) {
      const sortedAsc = [...list].sort((a, b) => a.version_number - b.version_number)
      for (let index = 0; index < sortedAsc.length; index += 1) {
        map.set(`${outputId}:${sortedAsc[index].version_number}`, sortedAsc[index - 1] ?? null)
      }
    }
    return map
  }, [versions])

  const handleRestore = async (version: TaskComponentOutputVersion) => {
    setRestoringVersionId(version.id)
    try {
      await onBeforeRestore?.(version)
      const restored = await rollbackTaskComponentOutputVersion({
        taskComponentOutputId: version.task_component_output_id,
        versionNumber: version.version_number,
      })
      onRestored?.(restored)
      toast({ title: "Version restored" })
      onOpenChange(false)
    } catch (error) {
      console.error("Failed to restore component output version", error)
      toast({
        title: "Failed to restore version",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      setRestoringVersionId(null)
    }
  }

  const dialogTitle = isChannelMode
    ? `Version history${channelLabel ? ` · ${channelLabel}` : ""}`
    : `Version history · ${componentTitle}`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle>{dialogTitle}</DialogTitle>
        </DialogHeader>
        {isChannelMode && filterOptions.length > 1 ? (
          <div className="px-6 pb-2">
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Component
            </label>
            <select
              value={filterTaskComponentId}
              onChange={(event) => setFilterTaskComponentId(event.target.value)}
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              {filterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="max-h-[calc(85vh-5rem)] overflow-y-auto px-6 pb-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filteredVersions.length === 0 ? (
            <div className="py-8 text-sm text-muted-foreground">No saved versions yet.</div>
          ) : (
            <div className="space-y-3">
              {filteredVersions.map((version) => {
                const badge = resolveChangeSourceBadge(version.change_source)
                const previous =
                  previousByOutputAndVersion.get(
                    `${version.task_component_output_id}:${version.version_number}`,
                  ) ?? null
                const beforeText =
                  previous?.content_text
                  ?? currentContentByOutputId.get(version.task_component_output_id)
                  ?? ""
                const afterText = version.content_text ?? ""
                const diffLines = buildComponentPreviewDiff({
                  operation: "replace",
                  beforeText,
                  afterText,
                })
                const showDiff = expandedDiffVersionId === version.id
                const showPreview = expandedPreviewVersionId === version.id
                const versionComponentTitle =
                  (version.task_component_id
                    && componentTitleByTaskComponentId.get(version.task_component_id))
                  || componentTitleByOutputId.get(version.task_component_output_id)
                  || componentTitle

                return (
                  <div key={version.id} className="rounded-xl border border-border bg-card p-3 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {isChannelMode && filterTaskComponentId === "all" ? (
                            <span className="max-w-[14rem] truncate text-sm font-medium text-foreground">
                              {versionComponentTitle}
                            </span>
                          ) : null}
                          <span className="text-sm font-medium">v{version.version_number}</span>
                          <Badge
                            variant="secondary"
                            className={cn(
                              badge.badge === "ai" && "bg-violet-100 text-violet-800",
                              badge.badge === "manual" && "bg-slate-100 text-slate-700",
                              badge.badge === "rollback" && "bg-amber-100 text-amber-800",
                            )}
                          >
                            {badge.label}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {formatVersionTimestamp(version.created_at)}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {version.change_source}
                          {version.changed_by_name ? ` · ${version.changed_by_name}` : null}
                        </div>
                        {version.change_summary ? (
                          <p className="text-sm text-foreground">{version.change_summary}</p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setExpandedPreviewVersionId((prev) =>
                              prev === version.id ? null : version.id,
                            )
                            if (expandedDiffVersionId === version.id) {
                              setExpandedDiffVersionId(null)
                            }
                          }}
                        >
                          Preview
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setExpandedDiffVersionId((prev) =>
                              prev === version.id ? null : version.id,
                            )
                            if (expandedPreviewVersionId === version.id) {
                              setExpandedPreviewVersionId(null)
                            }
                          }}
                        >
                          <GitCompare className="mr-1 h-3.5 w-3.5" />
                          Diff
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={restoringVersionId != null}
                          onClick={() => void handleRestore(version)}
                        >
                          {restoringVersionId === version.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <>
                              <RotateCcw className="mr-1 h-3.5 w-3.5" />
                              Restore
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                    {showPreview ? (
                      <div
                        className={cn(COMPONENT_OUTPUT_BODY_WRAPPER_CLASS, "mt-3 max-h-80 overflow-y-auto")}
                        style={{ maxHeight: 320 }}
                      >
                        <ComponentOutputReadonlyBody
                          html={versionContentToHtml(version)}
                          toolbarId={`version-preview-${version.id}`}
                          className="border-0 bg-transparent shadow-none"
                        />
                      </div>
                    ) : null}
                    {showDiff ? (
                      <div
                        className="mt-3 overflow-y-auto rounded-md border border-border/70 bg-muted/20"
                        style={{ maxHeight: 320 }}
                      >
                        <ComponentContentDiffView
                          lines={diffLines.filter((line) =>
                            line.type === "added" || line.type === "removed" || normalizeDiffPlainText(line.text),
                          )}
                        />
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

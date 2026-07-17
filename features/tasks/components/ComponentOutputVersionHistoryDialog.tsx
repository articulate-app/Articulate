"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
import { Loader2, RotateCcw, GitCompare } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../app/components/ui/dialog"
import { Button } from "../../../app/components/ui/button"
import { Badge } from "../../../app/components/ui/badge"
import { toast } from "../../../app/components/ui/use-toast"
import {
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

type ComponentOutputVersionHistoryDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  taskComponentOutputId: string | null
  componentTitle: string
  currentContentText?: string | null
  onRestored?: (output: RolledBackTaskComponentOutput) => void
  onBeforeRestore?: () => Promise<void>
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
  taskComponentOutputId,
  componentTitle,
  currentContentText,
  onRestored,
  onBeforeRestore,
}: ComponentOutputVersionHistoryDialogProps) {
  const [versions, setVersions] = useState<TaskComponentOutputVersion[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [restoringVersionNumber, setRestoringVersionNumber] = useState<number | null>(null)
  const [expandedDiffVersionNumber, setExpandedDiffVersionNumber] = useState<number | null>(null)
  const [expandedPreviewVersionNumber, setExpandedPreviewVersionNumber] = useState<number | null>(null)

  const loadVersions = useCallback(async () => {
    if (!taskComponentOutputId) {
      setVersions([])
      return
    }
    setIsLoading(true)
    try {
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
  }, [taskComponentOutputId])

  useEffect(() => {
    if (!open) return
    void loadVersions()
  }, [open, loadVersions])

  useEffect(() => {
    if (!open) return
    const handleRefresh = (event: Event) => {
      const detail = (event as CustomEvent<ContentVersionHistoryRefreshDetail>).detail
      if (
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
  }, [loadVersions, open, taskComponentOutputId])

  const previousByVersionNumber = useMemo(() => {
    const sortedAsc = [...versions].sort((a, b) => a.version_number - b.version_number)
    const map = new Map<number, TaskComponentOutputVersion | null>()
    for (let index = 0; index < sortedAsc.length; index += 1) {
      map.set(sortedAsc[index].version_number, sortedAsc[index - 1] ?? null)
    }
    return map
  }, [versions])

  const handleRestore = async (version: TaskComponentOutputVersion) => {
    if (!taskComponentOutputId) return
    setRestoringVersionNumber(version.version_number)
    try {
      await onBeforeRestore?.()
      const restored = await rollbackTaskComponentOutputVersion({
        taskComponentOutputId,
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
      setRestoringVersionNumber(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle>Version history · {componentTitle}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[calc(85vh-5rem)] overflow-y-auto px-6 pb-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : versions.length === 0 ? (
            <div className="py-8 text-sm text-muted-foreground">No saved versions yet.</div>
          ) : (
            <div className="space-y-3">
              {versions.map((version) => {
                const badge = resolveChangeSourceBadge(version.change_source)
                const previous = previousByVersionNumber.get(version.version_number) ?? null
                const beforeText =
                  previous?.content_text ??
                  (version.version_number === versions[0]?.version_number ? currentContentText ?? "" : "")
                const afterText = version.content_text ?? ""
                const diffLines = buildComponentPreviewDiff({
                  operation: "replace",
                  beforeText,
                  afterText,
                })
                const showDiff = expandedDiffVersionNumber === version.version_number
                const showPreview = expandedPreviewVersionNumber === version.version_number

                return (
                  <div key={version.id} className="rounded-xl border border-border bg-card p-3 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
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
                            setExpandedPreviewVersionNumber((prev) =>
                              prev === version.version_number ? null : version.version_number,
                            )
                            if (expandedDiffVersionNumber === version.version_number) {
                              setExpandedDiffVersionNumber(null)
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
                            setExpandedDiffVersionNumber((prev) =>
                              prev === version.version_number ? null : version.version_number,
                            )
                            if (expandedPreviewVersionNumber === version.version_number) {
                              setExpandedPreviewVersionNumber(null)
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
                          disabled={restoringVersionNumber != null}
                          onClick={() => void handleRestore(version)}
                        >
                          {restoringVersionNumber === version.version_number ? (
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

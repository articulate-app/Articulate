"use client"

import React, { useCallback, useEffect, useState } from "react"
import { Loader2, RotateCcw } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../app/components/ui/dialog"
import { Button } from "../../../app/components/ui/button"
import { Badge } from "../../../app/components/ui/badge"
import { toast } from "../../../app/components/ui/use-toast"
import {
  fetchTaskChannelContentVersions,
  resolveChangeSourceBadge,
  rollbackTaskChannelContentVersion,
} from "@/lib/services/content-version-history"
import type { TaskChannelContentVersion } from "@/lib/types/content-version-history"
import { cn } from "../../../app/lib/utils"
import {
  CONTENT_VERSION_HISTORY_REFRESH_EVENT,
  type ContentVersionHistoryRefreshDetail,
} from "../../ai-chat/apply-ai-thread-timeline-restore"

type TaskChannelContentHistoryDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  taskId: number
  channelId: number
  channelLabel?: string
  onRestored?: () => void
}

function formatVersionTimestamp(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

export function TaskChannelContentHistoryDialog({
  open,
  onOpenChange,
  taskId,
  channelId,
  channelLabel,
  onRestored,
}: TaskChannelContentHistoryDialogProps) {
  const [versions, setVersions] = useState<TaskChannelContentVersion[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [restoringVersionId, setRestoringVersionId] = useState<string | null>(null)

  const loadVersions = useCallback(async () => {
    setIsLoading(true)
    try {
      const rows = await fetchTaskChannelContentVersions(taskId, channelId)
      setVersions(rows)
    } catch (error) {
      console.error("Failed to load task channel content versions", error)
      toast({
        title: "Failed to load content history",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }, [taskId, channelId])

  useEffect(() => {
    if (!open) return
    void loadVersions()
  }, [open, loadVersions])

  useEffect(() => {
    if (!open) return
    const handleRefresh = (event: Event) => {
      const detail = (event as CustomEvent<ContentVersionHistoryRefreshDetail>).detail
      if (detail?.taskId != null && detail.taskId !== taskId) return
      if (detail?.channelId != null && detail.channelId !== channelId) return
      void loadVersions()
    }
    window.addEventListener(CONTENT_VERSION_HISTORY_REFRESH_EVENT, handleRefresh)
    return () => window.removeEventListener(CONTENT_VERSION_HISTORY_REFRESH_EVENT, handleRefresh)
  }, [channelId, loadVersions, open, taskId])

  const handleRestore = async (version: TaskChannelContentVersion) => {
    setRestoringVersionId(version.id)
    try {
      await rollbackTaskChannelContentVersion(version.id)
      onRestored?.()
      toast({ title: "Channel content restored" })
      onOpenChange(false)
    } catch (error) {
      console.error("Failed to restore task channel content version", error)
      toast({
        title: "Failed to restore channel content",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      setRestoringVersionId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle>
            Content history{channelLabel ? ` · ${channelLabel}` : ""}
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-[calc(85vh-5rem)] overflow-y-auto px-6 pb-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : versions.length === 0 ? (
            <div className="py-8 text-sm text-muted-foreground">
              No full-channel snapshots yet. Component-level history is still available.
            </div>
          ) : (
            <div className="space-y-3">
              {versions.map((version) => {
                const badge = resolveChangeSourceBadge(version.change_source)
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
                            Restore full channel
                          </>
                        )}
                      </Button>
                    </div>
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

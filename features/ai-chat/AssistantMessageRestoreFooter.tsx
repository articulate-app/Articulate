"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
import { Check, Undo2 } from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../app/components/ui/alert-dialog"
import { IconTooltip } from "../../app/components/ui/icon-tooltip"
import { toast } from "../../app/components/ui/use-toast"
import { useCurrentUserStore } from "../../app/store/current-user"
import { cn } from "../../app/lib/utils"
import { MESSAGES_PAGE_SIZE_DEFAULT } from "./hooks"
import {
  formatAiMessageChangeSetMetadata,
  type AiMessageChangeSet,
} from "./ai-message-change-set"
import {
  applyAiThreadRestoreOptimisticOutputs,
  refreshUiAfterAiThreadTimelineRestore,
  restoreAiThreadToMessage,
  truncateThreadMessagesAfterRestore,
} from "./apply-ai-thread-timeline-restore"
import { dispatchAiThreadRestored } from "./ai-thread-restore-events"

type AssistantMessageRestoreFooterProps = {
  threadId: string
  messageId: string
  changeSet?: AiMessageChangeSet | null
  taskId?: number | null
  activeChannelId?: number | null
  /** When true, render only the restore control (no metadata row wrapper). */
  inline?: boolean
  showMetadata?: boolean
}

export function AssistantMessageRestoreFooter({
  threadId,
  messageId,
  changeSet = null,
  taskId = null,
  activeChannelId = null,
  inline = false,
  showMetadata = true,
}: AssistantMessageRestoreFooterProps) {
  const queryClient = useQueryClient()
  const publicUserId = useCurrentUserStore((state) => state.publicUserId)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [isRestoring, setIsRestoring] = useState(false)
  const [showSuccessFlash, setShowSuccessFlash] = useState(false)

  const metadataLabel = useMemo(
    () => (changeSet ? formatAiMessageChangeSetMetadata(changeSet) : null),
    [changeSet],
  )
  const affectedComponents = changeSet?.summary?.components ?? []

  useEffect(() => {
    if (!showSuccessFlash) return
    const timer = window.setTimeout(() => setShowSuccessFlash(false), 1500)
    return () => window.clearTimeout(timer)
  }, [showSuccessFlash])

  const handleConfirmRestore = useCallback(async () => {
    setIsRestoring(true)
    try {
      const result = await restoreAiThreadToMessage({
        threadId,
        targetMessageId: messageId,
        restoredBy: publicUserId,
      })
      setConfirmOpen(false)

      // Optimistically reflect the restored state before any refetch completes.
      applyAiThreadRestoreOptimisticOutputs(queryClient, result.restoredItems)
      truncateThreadMessagesAfterRestore(queryClient, {
        threadId,
        pageSize: MESSAGES_PAGE_SIZE_DEFAULT,
        publicUserId,
        restoredToMessageId: result.restoredToMessageId ?? messageId,
        createdChatMessage: result.createdChatMessage,
      })
      dispatchAiThreadRestored({
        threadId,
        restoredToMessageId: result.restoredToMessageId ?? messageId,
        restoreMessageId: result.restoreMessageId,
      })

      // Reconcile against the server in the background (no reload required).
      await refreshUiAfterAiThreadTimelineRestore({
        queryClient,
        threadId,
        pageSize: MESSAGES_PAGE_SIZE_DEFAULT,
        publicUserId,
        taskId,
        channelId: activeChannelId,
        changeSet,
      })
      setShowSuccessFlash(true)
      toast({
        title: result.restoredItemCount > 0 ? "Restored to this point." : "Restored the conversation to this point.",
      })
    } catch {
      toast({
        variant: "destructive",
        title: "Could not restore to this point.",
      })
    } finally {
      setIsRestoring(false)
    }
  }, [
    activeChannelId,
    changeSet,
    messageId,
    publicUserId,
    queryClient,
    taskId,
    threadId,
  ])

  const restoreButton = (
    <IconTooltip label="Restore to this point">
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        disabled={isRestoring}
        aria-label="Restore to this point"
        className={cn(
          "rounded p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50",
          showSuccessFlash && "text-emerald-600 hover:text-emerald-700",
        )}
      >
        {showSuccessFlash ? (
          <Check className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <Undo2 className="h-3.5 w-3.5" aria-hidden />
        )}
      </button>
    </IconTooltip>
  )

  return (
    <>
      {inline ? (
        restoreButton
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
          {showMetadata && metadataLabel ? <span>{metadataLabel}</span> : null}
          {showMetadata && metadataLabel ? <span aria-hidden="true">·</span> : null}
          {restoreButton}
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore to this point?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>This will undo content changes made after this AI reply.</p>
                {affectedComponents.length > 0 ? (
                  <div>
                    <p className="mb-1.5 font-medium text-foreground">Affected components</p>
                    <ul className="list-disc space-y-1 pl-5">
                      {affectedComponents.map((component) => (
                        <li key={`${component.task_id}:${component.channel_id}:${component.component_title}`}>
                          {component.component_title}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRestoring}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isRestoring}
              onClick={(event) => {
                event.preventDefault()
                void handleConfirmRestore()
              }}
            >
              {isRestoring ? "Restoring…" : "Restore"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

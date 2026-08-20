"use client"

import { useCallback, useState } from "react"
import { usePathname } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { Copy, FilePlus, Loader2, Maximize2, Trash2 } from "lucide-react"
import { toast } from "../../app/components/ui/use-toast"
import { ConfirmDialog } from "../../app/components/ui/confirm-dialog"
import {
  PANE_CHROME_ICON_BUTTON_CLASS,
  PANE_CHROME_ICON_CLASS,
} from "../../app/components/tasks/pane-header-tokens"
import { copyHtmlToWordClipboard } from "../tasks/utils/task-docx-export-model"
import { htmlToTipTapDoc, tipTapJsonToPlainText } from "../../app/lib/collaboration/tiptap-json-to-yxml"
import { isArtifactRevisionConflictError } from "../../app/lib/artifacts/artifact-types"
import {
  createWorkspaceArtifact,
  deleteArtifact,
  saveWorkspaceArtifact,
} from "../../app/lib/services/artifacts"
import { useCurrentUserStore } from "../../app/store/current-user"
import { buildCenterPaneTabKey, useCenterPaneTabsStore } from "../../app/store/center-pane-tabs"
import { cn } from "../../app/lib/utils"
import { ComponentOutputReadonlyBody } from "../tasks/components/ComponentOutputReadonlyBody"
import { AI_CHAT_PREVIEW_BODY_WRAPPER_CLASS } from "../tasks/components/component-output-body-shared"
import { forgetDeletedArtifact } from "../artifacts/artifact-query-cache"
import { openArtifactCenterTab } from "../artifacts/open-artifact-center-tab"
import { isPersistedAiMessageId, toPersistedAiThreadId } from "./thread-id"

function htmlToImportedContent(html: string, title: string) {
  const tipTap = htmlToTipTapDoc(html)
  const text = tipTapJsonToPlainText(tipTap).replace(/\s+/g, " ").trim()
  return {
    title,
    text,
    contentJson: {
      version: 1,
      editor_kind: "rich_text" as const,
      content_format: "tiptap_json" as const,
      tiptap: tipTap,
      blocks: [{ id: "body", type: "rich_text", html, text }],
    },
  }
}

function persistErrorMessage(error: unknown): string {
  if (error && typeof error === "object") {
    const rec = error as { message?: unknown; details?: unknown }
    const message = typeof rec.message === "string" ? rec.message.trim() : ""
    const details = typeof rec.details === "string" ? rec.details.trim() : ""
    if (message && details && !message.includes(details)) return `${message}: ${details}`
    if (message) return message
  }
  if (error instanceof Error && error.message.trim()) return error.message.trim()
  return "Failed to save this document"
}

export function AssistantDraftOutputCard({
  messageId,
  threadId,
  taskId,
  projectId,
  title,
  html,
  plainText,
}: {
  messageId: string
  threadId?: string | null
  taskId?: number | null
  projectId?: number | null
  title: string
  html: string
  plainText: string
}) {
  const queryClient = useQueryClient()
  const pathname = usePathname()
  const currentUserId = useCurrentUserStore((state) => state.publicUserId)
  const closeCenterTab = useCenterPaneTabsStore((state) => state.closeTab)
  const [savedArtifactId, setSavedArtifactId] = useState<string | null>(null)
  const [busy, setBusy] = useState<"save" | "expand" | "delete" | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const persistAsOutput = useCallback(async (): Promise<string | null> => {
    if (savedArtifactId) return savedArtifactId
    const imported = htmlToImportedContent(html, title)
    const aiThreadId = toPersistedAiThreadId(threadId)
    const aiMessageId = isPersistedAiMessageId(messageId) ? messageId : null
    const metadata = {
      import_kind: "chat_draft",
      source_message_id: messageId,
    }
    const created = await createWorkspaceArtifact({
      title: imported.title,
      taskId: taskId ?? null,
      projectId: projectId ?? null,
      aiThreadId,
      metadata,
    })
    const saved = await saveWorkspaceArtifact({
      artifactId: created.id,
      expectedVersion: created.current_version ?? 0,
      snapshot: {
        title: imported.title,
        content_text: imported.text,
        content_json: imported.contentJson,
        metadata,
      },
      changeSource: "manual",
      changedBy: currentUserId,
      aiMessageId,
      aiThreadId,
      changeSummary: "Saved from chat",
    })
    if (isArtifactRevisionConflictError(saved)) {
      throw new Error(saved.message || "Failed to save output")
    }
    setSavedArtifactId(created.id)
    await queryClient.invalidateQueries({ queryKey: ["global-search"] })
    await queryClient.invalidateQueries({ queryKey: ["task-artifacts"] })
    return created.id
  }, [currentUserId, html, messageId, projectId, queryClient, savedArtifactId, taskId, threadId, title])

  const handleCopy = async () => {
    const result = await copyHtmlToWordClipboard({
      html,
      plainText: plainText.trim() || title,
    })
    toast({
      title: result.ok ? "Copied" : "Copy failed",
      description: result.ok ? "Document copied" : result.message ?? "Could not copy this document",
      variant: result.ok ? undefined : "destructive",
    })
  }

  const handleExpand = async () => {
    setBusy("expand")
    try {
      const artifactId = await persistAsOutput()
      if (!artifactId) return
      openArtifactCenterTab({
        artifactId,
        title,
        pathname: pathname || undefined,
      })
    } catch (error) {
      toast({
        title: "Could not open output",
        description: persistErrorMessage(error),
        variant: "destructive",
      })
    } finally {
      setBusy(null)
    }
  }

  const handleAddToOutputs = async () => {
    setBusy("save")
    try {
      const artifactId = await persistAsOutput()
      if (!artifactId) return
      toast({ title: "Saved to Outputs", description: title })
    } catch (error) {
      toast({
        title: "Could not save output",
        description: persistErrorMessage(error),
        variant: "destructive",
      })
    } finally {
      setBusy(null)
    }
  }

  const handleDelete = async () => {
    if (!savedArtifactId) return
    setBusy("delete")
    try {
      await deleteArtifact({ artifactId: savedArtifactId })
      forgetDeletedArtifact(queryClient, savedArtifactId)
      closeCenterTab(buildCenterPaneTabKey("artifact", savedArtifactId))
      setSavedArtifactId(null)
      setDeleteOpen(false)
      await queryClient.invalidateQueries({ queryKey: ["global-search"] })
      await queryClient.invalidateQueries({ queryKey: ["task-artifacts"] })
    } catch (error) {
      toast({
        title: "Could not delete output",
        description: persistErrorMessage(error),
        variant: "destructive",
      })
    } finally {
      setBusy(null)
    }
  }

  const isBusy = busy != null

  return (
    <>
      <div className="assistant-draft-output-card group card-row relative w-full max-w-full min-w-0 overflow-x-hidden rounded-xl border border-border bg-card text-left shadow-sm">
        <div className="flex h-10 min-h-10 w-full min-w-0 items-center gap-1.5 px-3 sm:px-4">
          <button
            type="button"
            onClick={() => void handleExpand()}
            disabled={isBusy}
            className="min-w-0 flex-1 truncate text-left text-sm font-medium text-foreground hover:underline"
          >
            {title}
          </button>
          <button
            type="button"
            onClick={() => void handleCopy()}
            disabled={isBusy}
            className={PANE_CHROME_ICON_BUTTON_CLASS}
            aria-label="Copy"
            title="Copy"
          >
            <Copy className={PANE_CHROME_ICON_CLASS} />
          </button>
          <button
            type="button"
            onClick={() => void handleExpand()}
            disabled={isBusy}
            className={PANE_CHROME_ICON_BUTTON_CLASS}
            aria-label="Expand"
            title="Expand"
          >
            {busy === "expand" ? (
              <Loader2 className={cn(PANE_CHROME_ICON_CLASS, "animate-spin")} />
            ) : (
              <Maximize2 className={PANE_CHROME_ICON_CLASS} />
            )}
          </button>
          {savedArtifactId ? (
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              disabled={isBusy}
              className={PANE_CHROME_ICON_BUTTON_CLASS}
              aria-label="Delete"
              title="Delete"
            >
              {busy === "delete" ? (
                <Loader2 className={cn(PANE_CHROME_ICON_CLASS, "animate-spin")} />
              ) : (
                <Trash2 className={PANE_CHROME_ICON_CLASS} />
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleAddToOutputs()}
              disabled={isBusy}
              className={PANE_CHROME_ICON_BUTTON_CLASS}
              aria-label="Add to Outputs"
              title="Add to Outputs"
            >
              {busy === "save" ? (
                <Loader2 className={cn(PANE_CHROME_ICON_CLASS, "animate-spin")} />
              ) : (
                <FilePlus className={PANE_CHROME_ICON_CLASS} />
              )}
            </button>
          )}
        </div>
        <div className="max-h-80 w-full max-w-full min-w-0 overflow-x-hidden overflow-y-auto px-3 pb-2 pt-0 sm:px-4">
          <ComponentOutputReadonlyBody
            html={html}
            toolbarId={`assistant-draft-${messageId}`}
            className={cn(
              AI_CHAT_PREVIEW_BODY_WRAPPER_CLASS,
              "border-0 bg-transparent shadow-none",
            )}
            editorWrapperClassName="min-h-[2.5rem] resize-none border-0"
            fromAiChat
          />
        </div>
      </div>
      <ConfirmDialog
        open={deleteOpen}
        title="Delete output"
        description="This output will move to Deleted. You can restore it or delete it permanently from the Outputs list."
        confirmLabel="Delete"
        busy={busy === "delete"}
        busyLabel="Deleting…"
        onOpenChange={(open) => {
          if (busy !== "delete") setDeleteOpen(open)
        }}
        onConfirm={() => {
          void handleDelete()
        }}
      />
    </>
  )
}

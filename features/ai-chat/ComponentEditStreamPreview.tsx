"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AlertCircle, Loader2 } from "lucide-react"
import {
  componentEditStreamKey,
  resolveComponentEditStreamPreviewView,
  useComponentEditStreamStore,
} from "../../app/store/component-edit-stream"
import { ComponentOutputEditableBody } from "../tasks/components/ComponentOutputEditableBody"
import { ComponentOutputReadonlyBody } from "../tasks/components/ComponentOutputReadonlyBody"
import { ComponentContentDiffView } from "../tasks/components/ComponentContentDiffView"
import { AI_CHAT_PREVIEW_BODY_WRAPPER_CLASS } from "../tasks/components/component-output-body-shared"
import { cn } from "../../app/lib/utils"
import { normalizeMixedRichText } from "../../app/lib/rich-text-normalization"
import { isGenericComponentPreviewTitle } from "./component-edit-preview-guards"
import {
  findAiMessageChangeSetItemForPreview,
  parseAiMessageChangeSetItems,
} from "./ai-message-change-set"
import {
  buildComponentPreviewDiff,
  buildDefaultPreviewContentHtml,
  buildMergedPreviewAfterText,
  computeDiffCharStats,
  hasRenderableDiff,
  normalizeDiffPlainText,
} from "../tasks/utils/component-content-diff"
import {
  contentBlocksToPlainText,
  extractOutputContentBlocksFromHtml,
  htmlToPreviewBlocks,
  saveComponentOutputFromPreview,
  type ComponentOutputContentBlock,
} from "./save-component-output-from-preview"

const CONTENT_LEFT_INSET_PX = 16
const SAVE_DEBOUNCE_MS = 700

type ComponentEditStreamPreviewProps = {
  streamKey: string
  assistantMessageId?: string | null
  assistantMessageContentJson?: unknown | null
  resolveComponentTitle?: (args: {
    taskId: number
    channelId: number
    componentId: string
    eventTitle?: string | null
  }) => string
  onOpenInContentTab: (streamKey: string) => void
  onPatchContentTab?: (params: {
    taskId: number
    channelId: number
    taskComponentOutputId?: string | null
    candidateTaskComponentIds?: string[]
    finalBlocks: Array<{ type: "paragraph"; text: string }>
    contentText?: string | null
    strategy?: "replace" | "append"
    outputKind?: string | null
    trace?: string
  }) => void
}

function PreviewDiffCharStats({
  added,
  removed,
  onClick,
  canToggle,
}: {
  added: number
  removed: number
  onClick?: () => void
  canToggle?: boolean
}) {
  if (added === 0 && removed === 0) return null
  const className = canToggle
    ? "inline-flex items-center gap-1.5 rounded px-1 py-0.5 transition-colors hover:bg-muted"
    : "inline-flex items-center gap-1.5"
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        onClick?.()
      }}
      disabled={!canToggle}
      className={className}
      aria-label={canToggle ? "Toggle diff view" : undefined}
    >
      {added > 0 ? <span className="font-medium text-emerald-600">+{added}</span> : null}
      {removed > 0 ? <span className="font-medium text-red-600">−{removed}</span> : null}
    </button>
  )
}

export function ComponentEditStreamPreview({
  streamKey,
  assistantMessageId,
  assistantMessageContentJson,
  resolveComponentTitle,
  onOpenInContentTab,
  onPatchContentTab,
}: ComponentEditStreamPreviewProps) {
  const stream = useComponentEditStreamStore((state) => state.streams[streamKey] ?? null)
  const preview = resolveComponentEditStreamPreviewView(stream, assistantMessageId)
  const [showDiff, setShowDiff] = useState(true)
  const [editorHtml, setEditorHtml] = useState<string>("")
  const [isSaving, setIsSaving] = useState(false)
  const saveTimerRef = useRef<number | null>(null)
  const previousBlocksRef = useRef<ComponentOutputContentBlock[]>([])
  const lastSavedHtmlRef = useRef<string>("")

  const defaultPreview = useMemo(() => {
    if (!preview) return { html: "<p></p>", isRemovedState: false }
    const contentText =
      ("afterContentText" in preview && preview.afterContentText?.trim())
        ? preview.afterContentText
        : preview.contentText
    return buildDefaultPreviewContentHtml({
      operation: preview.operation,
      baseContentText: preview.baseContentText,
      contentText,
      displayHtml: preview.displayHtml,
      phase: preview.phase,
      contentJson: preview.contentJson,
      componentTitle: preview.componentTitle,
    })
  }, [preview])

  const resolvedHtml = useMemo(() => {
    if (showDiff) return preview?.displayHtml || "<p></p>"
    return defaultPreview.html || "<p></p>"
  }, [defaultPreview.html, preview?.displayHtml, showDiff])

  useEffect(() => {
    setShowDiff(true)
  }, [streamKey, assistantMessageId])

  useEffect(() => {
    setEditorHtml(resolvedHtml)
    lastSavedHtmlRef.current = resolvedHtml
    previousBlocksRef.current = extractOutputContentBlocksFromHtml(resolvedHtml)
  }, [resolvedHtml, streamKey, assistantMessageId])

  useEffect(
    () => () => {
      if (saveTimerRef.current != null) {
        window.clearTimeout(saveTimerRef.current)
      }
    },
    [],
  )

  const persistedChangeSetItem = useMemo(() => {
    if (!stream || !assistantMessageContentJson) return null
    const items = parseAiMessageChangeSetItems(assistantMessageContentJson)
    if (items.length === 0) return null
    return findAiMessageChangeSetItemForPreview({
      items,
      taskId: stream.taskId,
      channelId: stream.channelId,
      componentId: stream.componentId,
      taskComponentOutputId: stream.taskComponentOutputId,
    })
  }, [assistantMessageContentJson, stream])

  const resolvedBaseContentText = useMemo(() => {
    if (!preview) return ""
    const fromPreview = preview.baseContentText?.trim() ?? ""
    if (fromPreview) return fromPreview
    return persistedChangeSetItem?.before_content_text?.trim() ?? ""
  }, [persistedChangeSetItem?.before_content_text, preview])

  const resolvedContentText = useMemo(() => {
    if (!preview) return ""
    const explicitAfter = "afterContentText" in preview ? preview.afterContentText?.trim() ?? "" : ""
    if (explicitAfter) return explicitAfter
    const fromPreview = preview.contentText?.trim() ?? ""
    if (fromPreview) return fromPreview
    return persistedChangeSetItem?.after_content_text?.trim() ?? ""
  }, [persistedChangeSetItem?.after_content_text, preview])

  const beforeText = useMemo(() => {
    return normalizeDiffPlainText(resolvedBaseContentText)
  }, [resolvedBaseContentText])

  const afterText = useMemo(() => {
    if (!preview) return ""
    const explicitAfter = "afterContentText" in preview ? preview.afterContentText?.trim() ?? "" : ""
    if (explicitAfter) {
      return normalizeDiffPlainText(explicitAfter)
    }
    if (
      preview.operation === "replace"
      || persistedChangeSetItem?.operation === "replace"
      || ("editStrategy" in preview && preview.editStrategy === "patch")
    ) {
      return normalizeDiffPlainText(resolvedContentText)
    }
    return buildMergedPreviewAfterText({
      operation: preview.operation ?? persistedChangeSetItem?.operation ?? null,
      beforeText: resolvedBaseContentText,
      contentText: resolvedContentText,
      displayHtml: preview.displayHtml,
    })
  }, [persistedChangeSetItem?.operation, preview, resolvedBaseContentText, resolvedContentText])

  const diffLines = useMemo(() => {
    if (!preview) return []
    return buildComponentPreviewDiff({
      operation: preview.operation,
      beforeText,
      afterText,
    })
  }, [afterText, beforeText, preview])

  const diffStats = useMemo(() => {
    if (!preview) return { added: 0, removed: 0 }
    return computeDiffCharStats(beforeText, afterText)
  }, [afterText, beforeText, preview])

  const canShowDiff = hasRenderableDiff(diffLines)
  const toggleDiffView = useCallback(() => {
    if (!canShowDiff) return
    setShowDiff((value) => !value)
  }, [canShowDiff])

  const patchPreviewEverywhere = useCallback(
    (html: string) => {
      if (!stream || !assistantMessageId) return
      const normalizedHtml = normalizeMixedRichText(html) || html
      const blocks = htmlToPreviewBlocks(normalizedHtml)
      const contentText = contentBlocksToPlainText(blocks)
      useComponentEditStreamStore.getState().updatePreviewArtifactContent({
        key: streamKey,
        messageId: assistantMessageId,
        contentText,
        contentJson: blocks,
        displayHtml: normalizedHtml,
      })
      onPatchContentTab?.({
        taskId: stream.taskId,
        channelId: stream.channelId,
        taskComponentOutputId: stream.taskComponentOutputId,
        candidateTaskComponentIds: [stream.componentId],
        finalBlocks: blocks,
        contentText,
        strategy: "replace",
        trace: "component-edit-preview-local-edit",
      })
    },
    [assistantMessageId, onPatchContentTab, stream, streamKey],
  )

  const persistPreviewEdit = useCallback(
    async (html: string) => {
      if (!stream?.taskComponentOutputId) return
      const result = await saveComponentOutputFromPreview({
        taskComponentOutputId: stream.taskComponentOutputId,
        html,
        previousBlocks: previousBlocksRef.current,
      })
      if (!result.ok) return
      previousBlocksRef.current = result.blocks
      lastSavedHtmlRef.current = html
    },
    [stream?.taskComponentOutputId],
  )

  const scheduleSave = useCallback(
    (html: string) => {
      if (saveTimerRef.current != null) {
        window.clearTimeout(saveTimerRef.current)
      }
      saveTimerRef.current = window.setTimeout(() => {
        saveTimerRef.current = null
        setIsSaving(true)
        void persistPreviewEdit(html).finally(() => setIsSaving(false))
      }, SAVE_DEBOUNCE_MS)
    },
    [persistPreviewEdit],
  )

  const handleEditorChange = useCallback(
    (html: string) => {
      setEditorHtml(html)
      patchPreviewEverywhere(html)
      if (html === lastSavedHtmlRef.current) return
      scheduleSave(html)
    },
    [patchPreviewEverywhere, scheduleSave],
  )

  const title = useMemo(() => {
    if (!preview || !stream) return "Component"
    const eventTitle = preview.componentTitle?.trim() || null
    if (resolveComponentTitle) {
      return resolveComponentTitle({
        taskId: stream.taskId,
        channelId: stream.channelId,
        componentId: stream.componentId,
        eventTitle,
      })
    }
    if (eventTitle && !isGenericComponentPreviewTitle(eventTitle)) return eventTitle
    return eventTitle || "Component"
  }, [
    preview,
    resolveComponentTitle,
    stream,
  ])

  if (!preview || preview.phase == null || !stream) return null

  const hasRevisionConflict = stream.revisionConflict === true
  const isPatchPreview =
    preview.editStrategy === "patch"
    || (Array.isArray(preview.patches) && preview.patches.length > 0)

  const showStreamingSpinner = preview.phase === "started" || preview.phase === "delta"
  const showFailed = preview.phase === "failed"
  const canEdit =
    !showDiff
    && !defaultPreview.isRemovedState
    && (preview.phase === "completed" || preview.phase === "saved" || preview.phase === "failed")
  return (
    <div
      className={cn(
        "group card-row relative w-full max-w-full min-w-0 overflow-x-hidden rounded-xl border border-border bg-card text-left shadow-sm",
        showFailed && "border-destructive/40",
        hasRevisionConflict && "border-amber-300",
      )}
    >
      {hasRevisionConflict ? (
        <div className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950 sm:px-4">
          <div className="font-medium">The live component changed while this preview was open.</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onOpenInContentTab(streamKey)}
              className="rounded-md border border-amber-300 bg-white px-2.5 py-1 font-medium hover:bg-amber-100/60"
            >
              Reload
            </button>
            {canShowDiff ? (
              <button
                type="button"
                onClick={() => setShowDiff(true)}
                className="rounded-md border border-amber-300 bg-white px-2.5 py-1 font-medium hover:bg-amber-100/60"
              >
                Compare
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="flex w-full min-w-0 max-w-full items-center gap-2 px-3 py-2.5 sm:px-4">
        <button
          type="button"
          onClick={() => onOpenInContentTab(streamKey)}
          className="min-w-0 flex-1 truncate text-left text-sm text-foreground"
        >
          {(showStreamingSpinner || isSaving) && (
            <Loader2 className="mr-1.5 inline h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground align-[-2px]" aria-hidden />
          )}
          <span className="font-medium">{title}</span>
          {isPatchPreview ? (
            <span className="ml-2 inline-flex shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              Targeted edit
            </span>
          ) : null}
        </button>
        {(diffStats.added > 0 || diffStats.removed > 0) ? (
          <PreviewDiffCharStats
            added={diffStats.added}
            removed={diffStats.removed}
            canToggle={canShowDiff}
            onClick={toggleDiffView}
          />
        ) : null}
        {canShowDiff ? (
          <button
            type="button"
            onClick={toggleDiffView}
            className="shrink-0 rounded px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {showDiff ? "Hide diff" : "Show diff"}
          </button>
        ) : null}
        {showFailed ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
            <AlertCircle className="h-3 w-3" aria-hidden />
            Failed
          </span>
        ) : null}
      </div>
      {showFailed && preview.errorMessage ? (
        <p className="px-3 pb-1 text-xs text-destructive/90 sm:px-4">{preview.errorMessage}</p>
      ) : null}
      <div
        className="mt-0 w-full max-w-full min-w-0 overflow-x-hidden border-t border-border/70 pb-3 pt-2"
        style={{ paddingLeft: CONTENT_LEFT_INSET_PX, paddingRight: 16 }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className={cn(
            AI_CHAT_PREVIEW_BODY_WRAPPER_CLASS,
            "ai-chat-component-edit-preview-body max-w-full min-w-0 break-words [overflow-wrap:anywhere]",
          )}
        >
          {showStreamingSpinner ? (
            <ComponentOutputReadonlyBody
              html={editorHtml}
              toolbarId={`component-edit-preview-stream-${streamKey}-${assistantMessageId ?? "orphan"}`}
              className="border-0 bg-transparent shadow-none"
              fromAiChat
            />
          ) : showDiff && canShowDiff ? (
            <ComponentContentDiffView lines={diffLines} fromAiChat />
          ) : defaultPreview.isRemovedState ? (
            <div className="space-y-2 px-3 py-2">
              <div className="text-xs font-medium text-muted-foreground">Content removed</div>
              {defaultPreview.html ? (
                <ComponentOutputReadonlyBody
                  html={defaultPreview.html}
                  toolbarId={`component-edit-preview-removed-${streamKey}-${assistantMessageId ?? "orphan"}`}
                  className="border-0 bg-transparent shadow-none"
                  fromAiChat
                />
              ) : null}
            </div>
          ) : canEdit ? (
            <ComponentOutputEditableBody
              html={editorHtml}
              onChange={handleEditorChange}
              toolbarId={`component-edit-preview-${streamKey}-${assistantMessageId ?? "orphan"}`}
              className="border-0 bg-transparent shadow-none"
              fromAiChat
            />
          ) : (
            <ComponentOutputReadonlyBody
              html={editorHtml}
              toolbarId={`component-edit-preview-readonly-${streamKey}-${assistantMessageId ?? "orphan"}`}
              className="border-0 bg-transparent shadow-none"
              fromAiChat
            />
          )}
        </div>
      </div>
    </div>
  )
}

export function buildComponentEditPreviewStreamKeyFromParts(args: {
  taskId: number
  channelId: number
  componentId: string
  taskComponentOutputId?: string | null
}): string {
  return componentEditStreamKey(
    args.taskId,
    args.channelId,
    args.componentId,
    args.taskComponentOutputId,
  )
}

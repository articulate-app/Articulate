"use client"

import React, { useCallback, useState, useMemo, useRef, useEffect } from "react"
import type { AiAttachmentMeta, AiMessage } from "./types"
import type { AiContextTag } from "./composer-inline-editor"
import { Attachments } from "./Attachments"
import { Copy, Edit2 } from "lucide-react"
import { toast } from "../../app/components/ui/use-toast"
import { getSupabaseBrowser } from "../../lib/supabase-browser"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { buildNextUrlForEntityLink, isTasksShellPath, parseAppEntityLink } from "./app-entity-links"
import { shallowPushSearchParams } from "../../app/lib/tasks-shallow-nav"
import { Composer, type MentionSuggestion } from "./Composer"
import { buildAiChatTaggedRefs, type TaggedTaskChannelRef, type TaggedTaskComponentRef } from "./build-ai-chat-tagged-refs"
import { enhanceBlocksWithMarkdownTables } from "./text-to-output-blocks"
import { getAssistantContentBlocks } from "./assistant-content-blocks"
import {
  AI_CHAT_ASSISTANT_MESSAGE_CLASS,
  formatAssistantBlocksForDisplay,
  formatAssistantContentForDisplay,
  groupAssistantBlocksForRender,
} from "./ai-chat-message-format"
import { UserMessageBody } from "./UserMessageBody"
import { buildUserMessageContentJson } from "./ai-chat-user-message-content"
import { resolveUserMessageDisplayContent } from "./resolve-user-message-display-content"
import type { AiMessageSegment } from "./composer-inline-editor"
import { parseAiMessageChangeSet } from "./ai-message-change-set"
import { AssistantMessageRestoreFooter } from "./AssistantMessageRestoreFooter"

interface MessageBubbleProps {
  msg: AiMessage
  isMine: boolean
  taskId?: number
  threadContext?: {
    effective_language_code?: string | null
    project_id?: number | null
    task_id?: number | null
  }
  activeChannelId?: number | null
  chatContext?: {
    componentId?: string | null
    briefingMode?: boolean
  }
  mentionDirectSeed?: MentionSuggestion[]
  /** After DB edit/delete, clears UI cache and runs the same streaming ai-chat path as the composer. */
  resendAfterUserMessageEdit?: (args: {
    editedMessage: AiMessage
    newContent: string
    attachments: AiAttachmentMeta[]
    taggedTaskIds: number[]
    taggedProjectIds: number[]
    taggedUserIds: number[]
    taggedChannelIds?: number[]
    taggedTaskChannelRefs?: TaggedTaskChannelRef[]
    taggedTaskComponentRefs?: TaggedTaskComponentRef[]
  }) => Promise<void>
  /** Plain assistant text eligible for copy after duplicate preview stripping. */
  copyableAssistantText?: string
  /** Intro narration rendered before inline preview card. */
  assistantIntroHtml?: string | null
  /** Closing narration rendered after inline preview card. */
  assistantOutroHtml?: string | null
  /** Inline component edit preview card. */
  componentEditPreview?: React.ReactNode
  /** Compact generic write-action preview cards (`ai_change_preview`), rendered near edit previews. */
  changePreview?: React.ReactNode
  /** Durable multi-task orchestrated build progress card. */
  orchestratedBuild?: React.ReactNode
  /** "Component sources checked" / "Structure decision" trace cards, rendered above previews. */
  traceCards?: React.ReactNode
  /** Request Plan V3 execution-plan audit card (live or persisted). */
  requestPlanCard?: React.ReactNode
  /** Compact clarification card for ambiguous component edits. */
  clarificationCard?: React.ReactNode
  /** Visible terminal failure/interruption card for assistant runs. */
  runFailureCard?: React.ReactNode
}

type RenderableMessageBlock =
  | { type: "text"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "table"; headers: string[]; rows: string[][] }
  | {
      type: "attachment"
      attachment_id?: string | null
      asset_key?: string | null
      media_type?: string | null
      mime_type?: string | null
      file_path?: string | null
      signed_url?: string | null
      width_pct?: number | null
      alt_text?: string | null
      caption?: string | null
      missing_attachment?: boolean | null
      attachment?: Record<string, unknown> | null
    }

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function normalizeRenderableBlocks(value: unknown): RenderableMessageBlock[] {
  const source = getAssistantContentBlocks(value) ?? []
  const blocks: RenderableMessageBlock[] = []
  for (const item of source) {
    if (!item || typeof item !== "object") continue
    const block = item as Record<string, unknown>
    if (block.type === "text") {
      blocks.push({ type: "text", text: typeof block.text === "string" ? block.text : "" })
      continue
    }
    if (block.type === "paragraph") {
      blocks.push({ type: "paragraph", text: typeof block.text === "string" ? block.text : "" })
      continue
    }
    if (block.type === "table") {
      blocks.push({
        type: "table",
        headers: Array.isArray(block.headers) ? block.headers.map(String) : [],
        rows: Array.isArray(block.rows)
          ? block.rows.map((row) => (Array.isArray(row) ? row.map(String) : []))
          : [],
      })
      continue
    }
    if (block.type === "attachment") {
      blocks.push({
        type: "attachment",
        attachment_id: typeof block.attachment_id === "string" ? block.attachment_id : null,
        asset_key: typeof block.asset_key === "string" ? block.asset_key : null,
        media_type: typeof block.media_type === "string" ? block.media_type : null,
        mime_type: typeof block.mime_type === "string" ? block.mime_type : null,
        file_path: typeof block.file_path === "string" ? block.file_path : null,
        signed_url: typeof block.signed_url === "string" ? block.signed_url : null,
        width_pct: toFiniteNumber(block.width_pct),
        alt_text: typeof block.alt_text === "string" ? block.alt_text : null,
        caption: typeof block.caption === "string" ? block.caption : null,
        missing_attachment: typeof block.missing_attachment === "boolean" ? block.missing_attachment : null,
        attachment:
          block.attachment && typeof block.attachment === "object"
            ? (block.attachment as Record<string, unknown>)
            : null,
      })
    }
  }
  return blocks
}

function toAttachmentMeta(value: Record<string, unknown> | null | undefined): AiAttachmentMeta | null {
  if (!value) return null
  const filePathRaw = typeof value.file_path === "string" ? value.file_path : null
  const signedUrl = typeof value.signed_url === "string" ? value.signed_url : null
  const attachmentId =
    typeof value.attachment_id === "string"
      ? value.attachment_id
      : typeof value.id === "string"
        ? value.id
        : undefined
  const filePath = filePathRaw || (signedUrl ? `remote/${attachmentId ?? crypto.randomUUID()}` : null)
  if (!filePath) return null
  return {
    id: attachmentId,
    file_name:
      typeof value.file_name === "string"
        ? value.file_name
        : typeof value.name === "string"
          ? value.name
          : filePath.split("/").at(-1) || "attachment",
    file_path: filePath,
    mime_type:
      typeof value.mime_type === "string"
        ? value.mime_type
        : typeof value.content_type === "string"
          ? value.content_type
          : "application/octet-stream",
    size: toFiniteNumber(value.size) ?? 0,
    preview_url: signedUrl,
  }
}

function resolveBlockAttachment(
  block: Extract<RenderableMessageBlock, { type: "attachment" }>,
  knownAttachments: AiAttachmentMeta[] | null | undefined
): AiAttachmentMeta | null {
  const direct = toAttachmentMeta(block.attachment ?? null)
  if (direct) return direct
  const fromBlock = toAttachmentMeta({
    attachment_id: block.attachment_id,
    file_path: block.file_path,
    mime_type: block.mime_type,
    signed_url: block.signed_url,
  })
  if (fromBlock) return fromBlock
  const attachmentId = typeof block.attachment_id === "string" ? block.attachment_id : null
  if (!attachmentId) return null
  return (knownAttachments ?? []).find((attachment) => attachment.id === attachmentId) ?? null
}

function clampWidthPct(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null
  return Math.max(20, Math.min(100, value))
}

function AssistantOutputBlock({
  block,
  attachments,
  onLinkClick,
}: {
  block: Exclude<RenderableMessageBlock, { type: "text" } | { type: "paragraph" }>
  attachments?: AiAttachmentMeta[] | null
  onLinkClick: (event: React.MouseEvent<HTMLDivElement>) => void
}) {
  if (block.type === "table") {
    const headers = Array.isArray(block.headers) ? block.headers : []
    const rows = Array.isArray(block.rows) ? block.rows : []
    return (
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr>
              {headers.map((header, headerIndex) => (
                <th key={headerIndex} className="border border-gray-200 px-3 py-2 text-left font-medium">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {headers.map((_, cellIndex) => (
                  <td key={cellIndex} className="border border-gray-200 px-3 py-2">
                    {row[cellIndex] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  if (block.type === "attachment") {
    const blockAttachment = resolveBlockAttachment(block, attachments)
    if (!blockAttachment) {
      if (!block.missing_attachment) return null
      return (
        <div className="max-w-[340px] rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
          Missing attachment
          {block.attachment_id ? ` (${block.attachment_id})` : ""}
        </div>
      )
    }
    const widthPct = clampWidthPct(block.width_pct)
    return (
      <div style={widthPct ? { width: `${widthPct}%`, maxWidth: "100%" } : undefined}>
        <Attachments items={[blockAttachment]} />
      </div>
    )
  }

  return null
}

export function MessageBubble({
  msg,
  isMine,
  taskId,
  threadContext: _threadContext,
  activeChannelId,
  chatContext: _chatContext,
  mentionDirectSeed,
  resendAfterUserMessageEdit,
  copyableAssistantText,
  assistantIntroHtml = null,
  assistantOutroHtml = null,
  componentEditPreview = null,
  changePreview = null,
  orchestratedBuild = null,
  traceCards = null,
  requestPlanCard = null,
  clarificationCard = null,
  runFailureCard = null,
}: MessageBubbleProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const status = msg.status
  const [isEditing, setIsEditing] = useState(false)
  const [editSession, setEditSession] = useState(0)
  const [showTouchActions, setShowTouchActions] = useState(false)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const structuredBlocks = useMemo(
    () => enhanceBlocksWithMarkdownTables(normalizeRenderableBlocks(msg.content_json), msg.content),
    [msg.content, msg.content_json]
  )
  const assistantRenderSegments = useMemo(
    () => groupAssistantBlocksForRender(structuredBlocks),
    [structuredBlocks]
  )
  const hasStructuredBlocks = structuredBlocks.length > 0

  const handleInlineEditSubmit = useCallback(
    async ({
      messageText,
      messageTags,
      messageSegments,
    }: {
      messageText: string
      messageTags: AiContextTag[]
      messageFiles: File[]
      messageSegments?: AiMessageSegment[]
    }) => {
      const trimmed = messageText.replace(/\u200b/g, "").trim()
      if (!trimmed || !msg.thread_id) return
      if (!resendAfterUserMessageEdit) {
        toast({
          title: "Edit unavailable",
          description: "This chat is not ready to resend yet.",
          variant: "destructive",
        })
        return
      }

      const supabase = getSupabaseBrowser()
      const userContentJson = buildUserMessageContentJson({
        tags: messageTags,
        segments: messageSegments,
      })

      try {
        const { error: updateError } = await supabase
          .from("ai_messages")
          .update({
            content: trimmed,
            ...(userContentJson ? { content_json: userContentJson } : {}),
          })
          .eq("id", msg.id)
        if (updateError) throw updateError

        const { error: deleteError } = await supabase
          .from("ai_messages")
          .delete()
          .eq("thread_id", msg.thread_id)
          .gt("created_at", msg.created_at)
        if (deleteError) throw deleteError

        setIsEditing(false)
        setShowTouchActions(false)

        const refs = buildAiChatTaggedRefs(messageTags)
        await resendAfterUserMessageEdit({
          editedMessage: msg,
          newContent: trimmed,
          attachments: (msg.attachments ?? []) as AiAttachmentMeta[],
          taggedTaskIds: refs.tagged_task_ids,
          taggedProjectIds: refs.tagged_project_ids,
          taggedUserIds: refs.tagged_user_ids,
          taggedChannelIds: refs.tagged_channel_ids,
          taggedTaskChannelRefs: refs.tagged_task_channel_refs,
          taggedTaskComponentRefs: refs.tagged_task_component_refs,
        })
      } catch (error: unknown) {
        console.error("Failed to edit message:", error)
        toast({
          title: "Edit failed",
          description: error instanceof Error ? error.message : "Failed to update message",
          variant: "destructive",
        })
      }
    },
    [msg, resendAfterUserMessageEdit]
  )

  const handleCopy = async () => {
    const text = copyableAssistantText ?? (msg.content ?? "")
    if (!text.trim()) return
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
      } else {
        const ta = document.createElement("textarea")
        ta.value = text
        ta.setAttribute("readonly", "")
        ta.style.position = "fixed"
        ta.style.left = "-9999px"
        document.body.appendChild(ta)
        ta.select()
        const ok = document.execCommand("copy")
        document.body.removeChild(ta)
        if (!ok) throw new Error("execCommand unavailable")
      }
      toast({
        title: "Copied to clipboard",
        description: "Message content copied",
      })
    } catch (error) {
      console.error("Failed to copy:", error)
      toast({
        title: "Copy failed",
        description: "Failed to copy to clipboard",
        variant: "destructive",
      })
    }
  }

  const handleEdit = () => {
    setEditSession((n) => n + 1)
    setIsEditing(true)
  }

  const handleCancelEdit = () => {
    setIsEditing(false)
  }

  const handleTouchStart = () => {
    if (!isMine || isEditing) return
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current)
    longPressTimerRef.current = setTimeout(() => {
      setShowTouchActions(true)
    }, 420)
  }

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current)
    }
  }, [])

  const handleAssistantLinkClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null
    const anchor = target?.closest("a")
    if (!anchor) return
    const href = anchor.getAttribute("href")
    const parsedLink = parseAppEntityLink(href)
    if (!parsedLink) return

    event.preventDefault()
    event.stopPropagation()

    if (parsedLink.type === "user") {
      toast({
        title: "User link not available yet",
        description: "TODO: wire app://user links to a dedicated user details view.",
      })
      return
    }

    const nextUrl = buildNextUrlForEntityLink({
      currentPathname: pathname,
      currentSearchParams: new URLSearchParams(searchParams.toString()),
      parsedLink,
      fromAiChat: true,
    })
    if (!nextUrl) return

    if (isTasksShellPath(pathname)) {
      const queryStart = nextUrl.indexOf("?")
      const nextParams = new URLSearchParams(queryStart >= 0 ? nextUrl.slice(queryStart + 1) : "")
      shallowPushSearchParams(pathname, nextParams, "ai-chat-task-link")
      return
    }

    router.push(nextUrl, { scroll: false })
  }

  const showOwnHoverActions = isMine && !isEditing && showTouchActions
  const resolvedCopyableAssistantText = (copyableAssistantText ?? "").trim()
  const showAssistantCopyButton =
    !isEditing && !isMine && msg.role === "assistant" && resolvedCopyableAssistantText.length > 0
  const hasInlinePreview = Boolean(componentEditPreview)
  const hasChangePreview = Boolean(changePreview) && !isMine
  const hasOrchestratedBuild = Boolean(orchestratedBuild) && !isMine
  const hasTraceCards = Boolean(traceCards) && !isMine
  const hasRequestPlanCard = Boolean(requestPlanCard) && !isMine
  const introHtml = (assistantIntroHtml ?? "").trim()
  const outroHtml = (assistantOutroHtml ?? "").trim()
  const hasIntroHtml = introHtml.length > 0
  const hasOutroHtml = outroHtml.length > 0
  const hasAssistantPlainContent = Boolean(msg.content?.trim()) || hasStructuredBlocks
  const assistantChangeSet = useMemo(
    () => (msg.role === "assistant" ? parseAiMessageChangeSet(msg.content_json) : null),
    [msg.content_json, msg.role],
  )
  const hasAssistantResponse =
    !isEditing
    && !isMine
    && msg.role === "assistant"
    && (
      resolvedCopyableAssistantText.length > 0
      || hasStructuredBlocks
      || hasInlinePreview
      || hasChangePreview
      || hasOrchestratedBuild
      || hasTraceCards
      || hasRequestPlanCard
      || hasIntroHtml
      || hasOutroHtml
      || Boolean(msg.content?.trim())
    )
  const showAssistantActionRow = hasAssistantResponse
  const shouldRenderBubble =
    isMine
    || isEditing
    || hasAssistantPlainContent
    || hasInlinePreview
    || hasChangePreview
    || hasOrchestratedBuild
    || hasTraceCards
    || hasRequestPlanCard
    || hasIntroHtml
    || hasOutroHtml
    || Boolean(clarificationCard)
    || Boolean(runFailureCard)

  const renderAssistantHtml = (html: string) => (
    <div
      className={AI_CHAT_ASSISTANT_MESSAGE_CLASS}
      onClick={handleAssistantLinkClick}
      dangerouslySetInnerHTML={{ __html: formatAssistantContentForDisplay(html) }}
    />
  )

  const userDisplayContent = useMemo(
    () => (msg.role === "user" ? resolveUserMessageDisplayContent(msg.content ?? "", msg.content_json) : ""),
    [msg.content, msg.content_json, msg.role],
  )

  const renderUserMessage = (content: string) => (
    <UserMessageBody content={content} contentJson={msg.content_json} />
  )

  return (
    <div
      className={`group flex ${isMine ? "justify-end" : "justify-start"} w-full`}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      <div className="relative max-w-[80%] min-w-0">
        {!isMine && status === "pending" && <div className="text-xs text-muted-foreground">Sending...</div>}
        {status === "failed" && <div className="text-xs text-red-600">Failed to send. Retry?</div>}

        {shouldRenderBubble ? (
        <div
          data-ai-selectable="chat-message"
          data-message-id={msg.id}
          data-message-role={msg.role}
          className={`rounded-lg px-3 py-2 text-sm break-words max-w-full min-w-0 overflow-x-hidden ${isMine ? "bg-gray-100" : "bg-white"}`}
        >
          {hasTraceCards && !isEditing ? (
            <div className="mb-3 w-full min-w-0 max-w-full">{traceCards}</div>
          ) : null}
          {hasRequestPlanCard && !isEditing ? (
            <div className="mb-3 w-full min-w-0 max-w-full">{requestPlanCard}</div>
          ) : null}
          {hasOrchestratedBuild && !isEditing ? (
            <div className="mb-3 w-full min-w-0 max-w-full">{orchestratedBuild}</div>
          ) : null}
          {hasChangePreview && !isEditing ? (
            <div className="mb-3 w-full min-w-0 max-w-full">{changePreview}</div>
          ) : null}
          {isEditing && isMine && resendAfterUserMessageEdit ? (
            <div className="w-full min-w-0">
              <Composer
                key={`inline-edit-${msg.id}-${editSession}`}
                variant="inlineEdit"
                threadId={msg.thread_id}
                taskId={taskId}
                activeChannelId={activeChannelId ?? null}
                mentionDirectSeed={mentionDirectSeed}
                initialPlainTextForEditor={msg.content ?? ""}
                editorSeedKey={`${msg.id}:${editSession}`}
                onSubmitOverride={handleInlineEditSubmit}
              />
              <div className="mt-1 flex justify-end">
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : isMine && (userDisplayContent || msg.content) ? (
            renderUserMessage(userDisplayContent || msg.content || "")
          ) : hasInlinePreview || hasIntroHtml || hasOutroHtml ? (
            <div className="space-y-3">
              {hasIntroHtml ? renderAssistantHtml(introHtml) : null}
              {componentEditPreview ? <div className="w-full min-w-0 max-w-full">{componentEditPreview}</div> : null}
              {hasOutroHtml ? renderAssistantHtml(outroHtml) : null}
            </div>
          ) : hasStructuredBlocks ? (
            <div className="space-y-4">
              {assistantRenderSegments.map((segment, index) => {
                if (segment.kind === "markdown") {
                  return (
                    <div
                      key={`assistant-md-${index}`}
                      className={AI_CHAT_ASSISTANT_MESSAGE_CLASS}
                      onClick={handleAssistantLinkClick}
                      dangerouslySetInnerHTML={{
                        __html: formatAssistantBlocksForDisplay(segment.blocks),
                      }}
                    />
                  )
                }
                if (segment.kind === "table") {
                  return (
                    <AssistantOutputBlock
                      key={`assistant-table-${index}`}
                      block={segment.block}
                      attachments={msg.attachments}
                      onLinkClick={handleAssistantLinkClick}
                    />
                  )
                }
                return (
                  <AssistantOutputBlock
                    key={`assistant-attachment-${index}`}
                    block={segment.block as Extract<RenderableMessageBlock, { type: "attachment" }>}
                    attachments={msg.attachments}
                    onLinkClick={handleAssistantLinkClick}
                  />
                )
              })}
            </div>
          ) : msg.content ? (
            msg.role === "assistant" ? (
              renderAssistantHtml(msg.content)
            ) : (
              renderUserMessage(userDisplayContent || msg.content || "")
            )
          ) : null}

          {!(isEditing && isMine) && !hasStructuredBlocks ? <Attachments items={msg.attachments} /> : null}

          {showAssistantActionRow ? (
            <div className="mt-2 flex items-center justify-start gap-1">
              {showAssistantCopyButton ? (
                <button
                  type="button"
                  onClick={() => void handleCopy()}
                  className="rounded p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
                  title="Copy to clipboard"
                  aria-label="Copy to clipboard"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              ) : null}
              <AssistantMessageRestoreFooter
                inline
                showMetadata={false}
                threadId={msg.thread_id}
                messageId={msg.id}
                changeSet={assistantChangeSet}
                taskId={taskId ?? _threadContext?.task_id ?? null}
                activeChannelId={activeChannelId ?? null}
              />
            </div>
          ) : null}
        </div>
        ) : null}
        {!isMine && clarificationCard ? (
          <div className="mt-2 w-full min-w-0 max-w-full">{clarificationCard}</div>
        ) : null}
        {!isMine && runFailureCard ? (
          <div className="w-full min-w-0 max-w-full">{runFailureCard}</div>
        ) : null}
        {!isEditing && isMine ? (
          <div
            className={`mt-1 flex items-center justify-end gap-2 text-xs text-gray-500 transition-opacity ${
              showOwnHoverActions ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            }`}
          >
            <button type="button" onClick={handleEdit} className="rounded p-1 hover:bg-gray-200/80 hover:text-gray-800" title="Edit message" aria-label="Edit message">
              <Edit2 className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={() => void handleCopy()} className="rounded p-1 hover:bg-gray-200/80 hover:text-gray-800" title="Copy to clipboard" aria-label="Copy to clipboard">
              <Copy className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

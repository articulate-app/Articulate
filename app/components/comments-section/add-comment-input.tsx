import React, { useCallback, useEffect, useRef, useState } from "react"
import { z } from "zod"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { Button } from "../ui/button"
import { RichTextEditor } from '../ui/rich-text-editor'
import { useCurrentUserStore } from '../../store/current-user';
import { useQueryClient } from '@tanstack/react-query';

const commentSchema = z.object({
  comment: z.string().min(1, "Comment cannot be empty").max(2000),
})

interface AddCommentInputProps {
  taskId: number
  projectId?: number | null
  threadScope?: "task" | "project" | "direct"
  targetUserId?: number | null
  threadId: number | string | null // allow string for temp id
  onCommentAdded?: () => void
  onThreadCreated?: (thread: { id: number | string, isOptimistic?: boolean }) => void // pass thread object
  pendingParticipants?: { value: string; label: string }[]
  setPendingParticipants?: (p: { value: string; label: string }[]) => void
  currentUserId?: number | null
  replyTo?: { id: number; author?: string; preview: string } | null
  onClearReply?: () => void
  compactMode?: boolean
  pendingOutputAnchor?: {
    taskComponentOutputId: string
    attachmentId: string | null
    anchorType: "image_point"
    anchorX: number
    anchorY: number
    anchorData?: unknown
  } | null
  onConsumePendingOutputAnchor?: () => void
  focusComposerToken?: number
  /** Flush layout inside task comments panel (avatar sits outside). */
  embedded?: boolean
  /** Called when the editor blurs while empty (for collapsible composers). */
  onCollapseRequest?: () => void
}

export function AddCommentInput({
  taskId,
  projectId = null,
  threadScope = "task",
  targetUserId = null,
  threadId,
  onCommentAdded,
  onThreadCreated,
  pendingParticipants,
  setPendingParticipants,
  replyTo,
  onClearReply,
  compactMode = true,
  pendingOutputAnchor = null,
  onConsumePendingOutputAnchor,
  focusComposerToken = 0,
  embedded = false,
  onCollapseRequest,
}: AddCommentInputProps) {
  const [comment, setComment] = useState("")
  const [isPosting, setIsPosting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editorHeight, setEditorHeight] = useState(compactMode ? 96 : 120)
  const formRef = useRef<HTMLFormElement>(null)
  const resizeStartYRef = useRef(0)
  const resizeStartHeightRef = useRef(120)
  const supabase = createClientComponentClient()
  let optimisticTempId: string | null = null
  const publicUserId = useCurrentUserStore((s) => s.publicUserId);
  const queryClient = useQueryClient();
  const [isFocused, setIsFocused] = useState(false);
  useEffect(() => {
    if (focusComposerToken <= 0) return
    requestAnimationFrame(() => {
      const quill = formRef.current?.querySelector('.ql-editor') as HTMLElement | null
      if (quill) {
        quill.focus()
        console.log('[comments composer] focused from image anchor')
      }
    })
  }, [focusComposerToken])

  // Remove the wrapper div and use direct handlers

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const validation = commentSchema.safeParse({ comment })
    if (!validation.success) {
      setError(validation.error.errors[0].message)
      return
    }
    setIsPosting(true)
    let thread = threadId
    let createdViaOutputAnchor = false
    try {
      if (!thread && pendingOutputAnchor && publicUserId) {
        const watcherIds = (pendingParticipants || [])
          .map((u: any) => Number(u?.value ?? u?.id))
          .filter((value: number) => Number.isFinite(value) && value > 0)
        const uniqueWatcherIds = Array.from(new Set([Number(publicUserId), ...watcherIds]))
        const { data: rpcData, error: rpcError } = await supabase.rpc("create_output_comment_thread", {
          p_task_component_output_id: pendingOutputAnchor.taskComponentOutputId,
          p_created_by: Number(publicUserId),
          p_comment: comment,
          p_anchor_type: "image_point",
          p_anchor_start: null,
          p_anchor_end: null,
          p_anchor_quote: null,
          p_attachment_id: pendingOutputAnchor.attachmentId,
          p_anchor_x: pendingOutputAnchor.anchorX,
          p_anchor_y: pendingOutputAnchor.anchorY,
          p_anchor_width: null,
          p_anchor_height: null,
          p_anchor_time_start: null,
          p_anchor_time_end: null,
          p_anchor_data: pendingOutputAnchor.anchorData ?? null,
          p_watcher_ids: uniqueWatcherIds,
        })
        if (rpcError) throw rpcError
        const resolvedThreadId =
          typeof rpcData === "number"
            ? rpcData
            : Array.isArray(rpcData)
              ? Number((rpcData[0] as any)?.thread_id ?? (rpcData[0] as any)?.id)
              : Number((rpcData as any)?.thread_id ?? (rpcData as any)?.id)
        if (!Number.isFinite(resolvedThreadId)) {
          throw new Error("Could not resolve output comment thread id.")
        }
        thread = resolvedThreadId
        createdViaOutputAnchor = true
        onThreadCreated?.({ id: resolvedThreadId })
        onConsumePendingOutputAnchor?.()
      }
      // If no thread, create one first (optimistically)
      if (!thread) {
        if (threadScope === "project" && !projectId) {
          setError("Missing project id for project thread.")
          setIsPosting(false)
          return
        }
        if (threadScope === "direct" && !targetUserId) {
          setError("Missing target user for direct thread.")
          setIsPosting(false)
          return
        }
        const participantIds = (pendingParticipants || [])
          .map((u: any) => Number(u?.value ?? u?.id))
          .filter((value: number) => Number.isFinite(value))
        const allIds =
          threadScope === "direct"
            ? [String(publicUserId), String(targetUserId)]
            : [String(publicUserId), ...participantIds]
        const uniqueIds = Array.from(new Set(allIds))
        if (uniqueIds.length < 2) {
          setError("A thread must have at least 2 participants.")
          setIsPosting(false)
          return
        }
        // 1. Optimistically create a temp thread
        optimisticTempId = `temp-${Date.now()}`
        onThreadCreated?.({ id: optimisticTempId, isOptimistic: true })
        thread = optimisticTempId
        // UI will now show the chat area for this temp thread
        // 2. Actually create the thread in Supabase
        let newThread: { id: number } | null = null
        let threadError: any = null

        if (threadScope === "direct") {
          const directThreadResult = await supabase.rpc("fn_get_or_create_user_thread", {
            p_user_id: targetUserId,
          })
          if (directThreadResult.error) {
            threadError = directThreadResult.error
          } else {
            const maybeThread =
              typeof directThreadResult.data === "object" && directThreadResult.data
                ? (directThreadResult.data as { id?: number })
                : null
            const maybeThreadId = Number(maybeThread?.id ?? directThreadResult.data)
            newThread = Number.isFinite(maybeThreadId) ? { id: maybeThreadId } : null
            if (!newThread) {
              threadError = new Error("Could not resolve direct thread id.")
            }
          }
        } else {
          const insertPayload =
            threadScope === "project"
              ? { project_id: projectId, task_id: null, created_by: publicUserId, thread_type: "general" }
              : { task_id: taskId, created_by: publicUserId }
          const created = await supabase
            .from('threads')
            .insert([insertPayload])
            .select()
            .single()
          newThread = created.data as { id: number } | null
          threadError = created.error
        }
        if (threadError) throw threadError
        if (!newThread?.id) {
          throw new Error("Could not create thread.")
        }
        thread = newThread.id
        // Replace temp thread with real one in parent
        onThreadCreated?.({ id: newThread.id })

        const watcherIds =
          threadScope === "direct"
            ? [Number(publicUserId), Number(targetUserId)]
            : (pendingParticipants || [])
                .map((user: any) => Number(user?.value ?? user?.id))
                .filter((watcherId: number) => Number.isFinite(watcherId) && watcherId > 0)

        if (watcherIds.length > 0) {
          const uniqueWatcherIds = Array.from(new Set(watcherIds))
          const { error: watcherError } = await supabase
            .from('thread_watchers')
            .upsert(
              uniqueWatcherIds.map((watcherId) => ({
                thread_id: newThread.id,
                watcher_id: watcherId,
                added_by: publicUserId,
              })),
              { onConflict: "thread_id,watcher_id", ignoreDuplicates: true },
            )
          if (watcherError) throw watcherError
        }

        if (threadScope !== "direct") {
          setPendingParticipants && setPendingParticipants([])
        }
        // Invalidate queries for threads and mentions
        queryClient.invalidateQueries(['threads', taskId] as any);
        queryClient.invalidateQueries(['mentions', newThread.id] as any);
      }
      if (!createdViaOutputAnchor) {
        const { error: mentionError } = await supabase
          .from('mentions')
          .insert({
            thread_id: thread,
            comment,
            attachment: null,
            reply_to_id: replyTo?.id ?? null,
            created_at: new Date().toISOString(),
            created_by: publicUserId,
          })
        if (mentionError) throw mentionError
      }
      setComment("");
      onClearReply?.()
      // Refocus the editor after send
      setTimeout(() => {
        const quill = document.querySelector('.ql-editor');
        if (quill) (quill as HTMLElement).focus();
      }, 100);
      onCommentAdded?.()
    } catch (err: any) {
      setError(err.message || "Failed to post comment")
      // If optimistic thread was created, notify parent to remove it
      if (optimisticTempId) {
        onThreadCreated?.({ id: optimisticTempId, isOptimistic: false }) // signal to remove
      }
    } finally {
      setIsPosting(false)
    }
  }

  // Helper to check if comment is empty (strip HTML tags)
  function isCommentEmpty(html: string) {
    if (!html) return true
    const hasInlineMedia = /<(img|video|figure)\b/i.test(html)
    if (hasInlineMedia) return false
    return !html.replace(/<(.|\n)*?>/g, '').trim()
  }

  const recalcEditorHeight = useCallback(() => {
    if (compactMode) return
    const editor = formRef.current?.querySelector('.ql-editor') as HTMLElement | null
    if (!editor) return
    const contentHeight = editor.scrollHeight
    if (contentHeight <= 110) {
      setEditorHeight(120)
      return
    }
    const nextHeight = Math.min(280, contentHeight + 36)
    setEditorHeight(nextHeight)
  }, [compactMode])

  const handleResizeMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (compactMode) return
    e.preventDefault()
    resizeStartYRef.current = e.clientY
    resizeStartHeightRef.current = editorHeight

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientY - resizeStartYRef.current
      const next = Math.max(120, Math.min(320, resizeStartHeightRef.current + delta))
      setEditorHeight(next)
    }

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className={embedded ? "flex w-full flex-col gap-2 bg-white py-2" : "bg-white flex flex-col gap-2 p-3"}
      tabIndex={0} // ensure form is always focusable
    >
      {replyTo ? (
        <div className="flex items-start justify-between gap-3 rounded-md border bg-gray-50 px-3 py-2">
          <div className="min-w-0">
            <div className="text-xs font-normal text-gray-700">
              Replying to {replyTo.author || 'message'}
            </div>
            <div className="text-xs text-gray-600 truncate">{replyTo.preview}</div>
          </div>
          <button
            type="button"
            className="text-xs text-gray-500 hover:text-gray-900"
            onClick={onClearReply}
            aria-label="Cancel reply"
            title="Cancel reply"
          >
            ×
          </button>
        </div>
      ) : null}
      <div className="relative">
        <RichTextEditor
          value={comment}
          onChange={(val: string) => {
            setComment(val);
            requestAnimationFrame(recalcEditorHeight)
          }}
          placeholder="Add a comment..."
          height={editorHeight}
          autoGrow={compactMode}
          editorClassName={compactMode ? "min-h-[88px] px-3 py-2" : undefined}
          toolbarVariant="compact"
          toolbarVisibility="always"
          toolbarId={`ql-toolbar-rich-comment-${threadId ?? 'new'}`}
          onInsertAttachment={async (file) => {
            const ext = file.name.split(".").pop() || "bin"
            const normalizedThread = typeof threadId === "number" ? threadId : Number(threadId)
            const folder = Number.isFinite(normalizedThread)
              ? `thread-${normalizedThread}`
              : `draft-${publicUserId ?? "anon"}`
            const fileName = `inline-${Date.now()}.${ext}`
            const filePath = `${folder}/${fileName}`
            const { error: uploadError } = await supabase.storage
              .from("mention-files")
              .upload(filePath, file, { upsert: false })
            if (uploadError) throw uploadError
            const { data } = supabase.storage.from("mention-files").getPublicUrl(filePath)
            const mediaType = file.type.toLowerCase().startsWith("video/") ? "video" : "image"
            return {
              attachmentId: filePath,
              url: data.publicUrl,
              mediaType,
              fileName: file.name || fileName,
            }
          }}
          renderSendButton={() =>
            isFocused && (
              <Button
                type="submit"
                size="sm"
                disabled={isPosting || isCommentEmpty(comment)}
                className="bg-primary text-white rounded-full shadow hover:bg-primary/90 transition px-4 py-2"
                style={{ minWidth: 64 }}
                tabIndex={0}
              >
                Send
              </Button>
            )
          }
          onFocus={() => setIsFocused(true)}
          onBlur={() => {
            setIsFocused(false)
            if (isCommentEmpty(comment) && !replyTo && !pendingOutputAnchor) {
              onCollapseRequest?.()
            }
          }}
        />
        {!compactMode ? (
          <div
            onMouseDown={handleResizeMouseDown}
            className="absolute bottom-0 right-0 w-5 h-5 cursor-nwse-resize flex items-center justify-center hover:bg-gray-100 rounded-tl transition-colors z-10"
            style={{ cursor: 'nwse-resize' }}
            title="Drag to resize"
          >
            {/* Resize grip icon (matches native textarea / secondary keywords field) */}
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-gray-400" aria-hidden>
              <path d="M0 12 L12 0" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              <path d="M4 12 L12 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </div>
        ) : null}
      </div>
      {error && <span className="text-xs text-destructive mt-1">{error}</span>}
    </form>
  )
} 
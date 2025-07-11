import React, { useRef, useState } from "react"
import { z } from "zod"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { Button } from "../ui/button"
import { RichTextEditor } from '../ui/rich-text-editor'

const commentSchema = z.object({
  comment: z.string().min(1, "Comment cannot be empty").max(2000),
  attachment: z.any().optional(),
}).refine(
  (data) => !data.attachment || data.attachment instanceof File,
  { message: "Attachment must be a file", path: ["attachment"] }
)

interface AddCommentInputProps {
  taskId: number
  threadId: number | string | null // allow string for temp id
  onCommentAdded?: () => void
  onThreadCreated?: (thread: { id: number | string, isOptimistic?: boolean }) => void // pass thread object
  pendingParticipants?: { value: string; label: string }[]
  setPendingParticipants?: (p: { value: string; label: string }[]) => void
  currentUserId?: number | null
}

export function AddCommentInput({ taskId, threadId, onCommentAdded, onThreadCreated, pendingParticipants, setPendingParticipants, currentUserId }: AddCommentInputProps) {
  const [comment, setComment] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [isPosting, setIsPosting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const supabase = createClientComponentClient()
  const [publicUserId, setPublicUserId] = useState<number | null>(null)
  let optimisticTempId: string | null = null

  React.useEffect(() => {
    const controller = new AbortController();
    // Fetch the current user's public user ID
    const fetchUserId = async () => {
      const { data: authData } = await supabase.auth.getUser();
      const authUid = authData?.user?.id;
      if (!authUid) return;
      let query = supabase
        .from('users')
        .select('id')
        .eq('auth_user_id', authUid)
        .maybeSingle();
      // Only call abortSignal if it exists and is a function
      if ('abortSignal' in query && typeof query.abortSignal === 'function') {
        query = query.abortSignal(controller.signal);
      }
      const { data: userRows } = await query;
      if (userRows?.id) setPublicUserId(userRows.id);
    };
    fetchUserId();
    return () => controller.abort();
  }, [supabase]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0])
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const validation = commentSchema.safeParse({ comment, attachment: file })
    if (!validation.success) {
      setError(validation.error.errors[0].message)
      return
    }
    setIsPosting(true)
    let thread = threadId
    try {
      // If no thread, create one first (optimistically)
      if (!thread) {
        const participantIds = (pendingParticipants || []).map(u => u.value)
        const allIds = [String(currentUserId), ...participantIds]
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
        const { data: newThread, error: threadError } = await supabase
          .from('threads')
          .insert([{ task_id: taskId, created_by: publicUserId }])
          .select()
          .single()
        if (threadError) throw threadError
        thread = newThread.id
        // Replace temp thread with real one in parent
        onThreadCreated?.({ id: newThread.id })
        // Add all pending participants (except current user) as watchers
        if (pendingParticipants && pendingParticipants.length > 0) {
          const toAdd = pendingParticipants.filter(u => String(u.value) !== String(currentUserId))
          if (toAdd.length > 0) {
            const { error: watcherError } = await supabase
              .from('thread_watchers')
              .insert(toAdd.map(u => ({ thread_id: newThread.id, watcher_id: u.value, added_by: publicUserId })))
            if (watcherError) throw watcherError
          }
        }
        setPendingParticipants && setPendingParticipants([])
      }
      let attachmentUrl: string | null = null
      if (file) {
        const ext = file.name.split('.').pop()
        const fileName = `mention-${thread}-${Date.now()}.${ext}`
        const filePath = `${thread}/${fileName}`
        const { error: uploadError } = await supabase.storage
          .from('mention-files')
          .upload(filePath, file)
        if (uploadError) throw uploadError
        const { data: { publicUrl } } = supabase.storage
          .from('mention-files')
          .getPublicUrl(filePath)
        attachmentUrl = publicUrl
      }
      const { error: mentionError } = await supabase
        .from('mentions')
        .insert({
          thread_id: thread,
          comment,
          attachment: attachmentUrl,
          created_at: new Date().toISOString(),
          created_by: publicUserId,
        })
      if (mentionError) throw mentionError
      setComment("")
      setFile(null)
      fileInputRef.current && (fileInputRef.current.value = "")
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
    return !html || !html.replace(/<(.|\n)*?>/g, '').trim()
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="sticky bottom-0 left-0 right-0 bg-white border-t flex flex-col gap-2 p-3 z-20"
      style={{ boxShadow: "0 -2px 8px rgba(0,0,0,0.03)" }}
    >
      <RichTextEditor
        value={comment}
        onChange={setComment}
        placeholder="Add a comment..."
        height={120}
        toolbarId={`ql-toolbar-rich-comment-${threadId ?? 'new'}`}
      />
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        onChange={handleFileChange}
        disabled={isPosting}
        accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
        id="add-comment-file"
      />
      <div className="flex items-center justify-between mt-2 w-full">
        <label htmlFor="add-comment-file" className="cursor-pointer px-2 py-1 text-gray-500 hover:text-primary">
          📎
        </label>
        <Button type="submit" size="sm" disabled={isPosting || isCommentEmpty(comment)} className="ml-auto">
          {isPosting ? "Posting..." : "Send"}
        </Button>
      </div>
      {error && <span className="text-xs text-destructive mt-1">{error}</span>}
    </form>
  )
} 
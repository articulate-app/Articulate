"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { Plus } from "lucide-react"
import { ThreadedRealtimeChat } from "../threaded-realtime-chat"
import { AddCommentInput } from "./add-comment-input"
import { ThreadParticipantsInline } from "./thread-participants-inline"
import { Button } from "../ui/button"
import { getImageUrl } from "../../lib/public-media"
import { useCurrentUserStore } from "../../store/current-user"
import { CHAT_CONTENT_COLUMN_CLASS } from "../../lib/chat-content-column"

type CenterPaneThreadChatProps = {
  threadId: number
  focusedMentionId?: number | null
  /** Called when a new thread is created so parent can update URL selection. */
  onThreadCreated?: (threadId: number) => void
}

/**
 * Full thread view for the tasks shell center pane: messages + shared comments composer
 * (avatar, rich text, We'll notify / participants, new thread) — no bare "Thread" back header.
 */
export function CenterPaneThreadChat({
  threadId,
  focusedMentionId = null,
  onThreadCreated,
}: CenterPaneThreadChatProps) {
  const supabase = createClientComponentClient()
  const queryClient = useQueryClient()
  const publicUserId = useCurrentUserStore((s) => s.publicUserId)
  const fullName = useCurrentUserStore((s) => s.fullName)
  const photo = useCurrentUserStore((s) => s.photo)
  const userMetadata = useCurrentUserStore((s) => s.userMetadata)

  const [isAddingThread, setIsAddingThread] = useState(false)
  const [pendingParticipants, setPendingParticipants] = useState<{ value: string; label: string }[]>([])
  const [removedParticipants, setRemovedParticipants] = useState<{ value: string; label: string }[]>([])
  const [replyTo, setReplyTo] = useState<{ id: number; author?: string; preview: string } | null>(null)
  /** Thread shown in the chat area; may diverge from URL while composing a new thread. */
  const [activeThreadId, setActiveThreadId] = useState<number>(threadId)
  /** Scope source for project/task when starting a new thread from this view. */
  const [scopeThreadId, setScopeThreadId] = useState<number>(threadId)

  useEffect(() => {
    setActiveThreadId(threadId)
    setScopeThreadId(threadId)
    setIsAddingThread(false)
    setReplyTo(null)
    setPendingParticipants([])
    setRemovedParticipants([])
  }, [threadId])

  const currentUserName = fullName || userMetadata?.full_name || userMetadata?.email || "You"
  const currentUserAvatarUrl =
    getImageUrl(photo || userMetadata?.photo || userMetadata?.avatar_url || null)

  const { data: threadMeta } = useQuery({
    queryKey: ["center-pane-thread-meta", scopeThreadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("threads")
        .select("id, title, project_id, task_id")
        .eq("id", scopeThreadId)
        .maybeSingle()
      if (error) throw error
      return data
    },
    enabled: Number.isFinite(scopeThreadId) && scopeThreadId > 0,
    staleTime: 30_000,
  })

  const projectId = threadMeta?.project_id != null ? Number(threadMeta.project_id) : null
  const taskId = threadMeta?.task_id != null ? Number(threadMeta.task_id) : 0
  const threadScope: "task" | "project" | "direct" =
    taskId > 0 ? "task" : projectId != null && projectId > 0 ? "project" : "direct"

  const { data: participants = [], refetch: refetchParticipants } = useQuery({
    queryKey: ["center-pane-thread-watchers", isAddingThread ? scopeThreadId : activeThreadId],
    queryFn: async () => {
      const id = isAddingThread ? scopeThreadId : activeThreadId
      const { data, error } = await supabase
        .from("thread_watchers")
        .select("watcher_id, users:watcher_id(id, full_name, email, photo)")
        .eq("thread_id", id)
      if (error) throw error
      return (data || []).map((row: any) => row.users).filter(Boolean)
    },
    enabled: Number.isFinite(isAddingThread ? scopeThreadId : activeThreadId) && (isAddingThread ? scopeThreadId : activeThreadId) > 0,
  })

  const { data: allProjectUsers = [] } = useQuery({
    queryKey: ["center-pane-thread-users", projectId, threadScope],
    queryFn: async () => {
      if (projectId != null && projectId > 0) {
        const { data, error } = await supabase
          .from("project_watchers")
          .select("users:watcher_id(id, full_name, email, photo)")
          .eq("project_id", projectId)
        if (error) throw error
        return (data || []).map((row: any) => row.users).filter(Boolean)
      }
      const { data, error } = await supabase
        .from("view_users_i_can_see")
        .select("id, full_name, email, photo")
        .order("full_name")
      if (error) throw error
      return data || []
    },
    staleTime: 60_000,
  })

  const targetUserId = useMemo(() => {
    if (threadScope !== "direct" || !publicUserId) return null
    const other = (participants.length > 0 ? participants : allProjectUsers).find(
      (user: { id?: number }) => Number(user?.id) !== Number(publicUserId),
    )
    return other?.id != null ? Number(other.id) : null
  }, [threadScope, publicUserId, participants, allProjectUsers])

  const handleStartNewThread = useCallback(() => {
    setIsAddingThread(true)
    setReplyTo(null)
    setPendingParticipants([])
    setRemovedParticipants([])
  }, [])

  const handleThreadCreated = useCallback(
    (thread: { id: number | string; isOptimistic?: boolean }) => {
      if (thread.isOptimistic) return
      const nextId = Number(thread.id)
      if (!Number.isFinite(nextId) || nextId <= 0) return
      setIsAddingThread(false)
      setActiveThreadId(nextId)
      setScopeThreadId(nextId)
      setPendingParticipants([])
      onThreadCreated?.(nextId)
      void queryClient.invalidateQueries({ queryKey: ["center-pane-thread-watchers", nextId] })
    },
    [onThreadCreated, queryClient],
  )

  if (!publicUserId) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-gray-500">
        Sign in to view this thread.
      </div>
    )
  }

  const composerThreadId = isAddingThread ? null : activeThreadId

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="min-h-0 flex-1 overflow-hidden">
        {!isAddingThread && activeThreadId > 0 ? (
          <ThreadedRealtimeChat
            key={String(activeThreadId)}
            threadId={activeThreadId}
            currentUserId={publicUserId}
            currentUserName={currentUserName}
            currentUserAvatar={currentUserAvatarUrl || undefined}
            currentUserEmail={userMetadata?.email || ""}
            currentPublicUserId={publicUserId}
            hideInput
            focusedMentionId={focusedMentionId}
            onReplySelected={(payload) => setReplyTo(payload)}
          />
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-gray-500">
            Starting a new thread. Add participants below, then send your first message.
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-gray-200 bg-white px-4 py-3">
        <div className={CHAT_CONTENT_COLUMN_CLASS}>
        <div className="mb-2 flex items-start">
          <div className="min-w-0 flex-1">
            <AddCommentInput
              key={`center-thread-input-${composerThreadId ?? "new"}-${replyTo?.id ?? "none"}`}
              taskId={taskId}
              projectId={projectId}
              threadScope={threadScope}
              targetUserId={targetUserId}
              threadId={composerThreadId}
              compactMode
              embedded
              pendingParticipants={pendingParticipants}
              setPendingParticipants={setPendingParticipants}
              replyTo={replyTo}
              onClearReply={() => setReplyTo(null)}
              onCommentAdded={() => {
                setReplyTo(null)
                void refetchParticipants()
              }}
              onThreadCreated={handleThreadCreated}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="shrink-0 text-xs text-gray-500">We&apos;ll notify</span>
          <div className="min-w-0 flex-1 overflow-hidden">
            {isAddingThread || !composerThreadId ? (
              <ThreadParticipantsInline
                pendingMode
                pendingParticipants={pendingParticipants}
                setPendingParticipants={setPendingParticipants}
                removedParticipants={removedParticipants}
                setRemovedParticipants={setRemovedParticipants}
                participants={allProjectUsers}
                allProjectUsers={allProjectUsers}
                currentUserId={publicUserId}
                projectId={projectId ?? 0}
              />
            ) : (
              <ThreadParticipantsInline
                threadId={composerThreadId}
                projectId={projectId ?? 0}
                allowRemove
                key={composerThreadId}
                participants={participants}
                allProjectUsers={allProjectUsers}
                currentUserId={publicUserId}
                onParticipantsChanged={() => void refetchParticipants()}
              />
            )}
          </div>
          {isAddingThread ? (
            <span className="shrink-0 text-xs text-muted-foreground">Starting new thread</span>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 shrink-0 px-2 text-xs"
              onClick={handleStartNewThread}
              title="Start thread"
              aria-label="Start thread"
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Thread
            </Button>
          )}
        </div>
        </div>
      </div>
    </div>
  )
}

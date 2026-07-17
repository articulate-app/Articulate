'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useThreadMentions } from '../../hooks/use-thread-mentions'
import { useMarkMentionsRead } from '../../hooks/use-mark-mentions-read'
import { ThreadedRealtimeChat } from '../threaded-realtime-chat'
import { useCurrentUserStore } from '../../store/current-user'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { ThreadParticipantsInline } from '../comments-section/thread-participants-inline'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Maximize2, Minimize2, Pencil, X } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { toast } from '../ui/use-toast'
import { useMobileDetection } from '../../hooks/use-mobile-detection'
import { MobileDetailHeader, type MobileDetailAction } from '../ui/mobile-detail-header'

interface InboxThreadViewProps {
  threadId: number | string | null
  threadTitle: string | null
  projectId: number | null
  taskId: number | null
  autoFocusComposer?: boolean
  focusedMentionId?: number | string | null
  onOpenTaskDetails?: (taskId: number) => void
  onOpenProjectDetails?: (projectId: number) => void
  onClose?: () => void
  isDetailsFocused?: boolean
  onFocusToggle?: () => void
}

export function InboxThreadView({
  threadId,
  threadTitle,
  projectId,
  taskId,
  autoFocusComposer = false,
  focusedMentionId = null,
  onOpenTaskDetails,
  onOpenProjectDetails,
  onClose,
  isDetailsFocused = false,
  onFocusToggle,
}: InboxThreadViewProps) {
  const supabase = createClientComponentClient()
  const queryClient = useQueryClient()
  const isMobile = useMobileDetection()
  const currentUserId = useCurrentUserStore((s) => s.publicUserId)
  const currentUserName = useCurrentUserStore((s) => s.fullName)
  const currentUserEmail = useCurrentUserStore((s) => s.userMetadata?.email)
  const currentUserAvatar = useCurrentUserStore((s) => s.userMetadata?.avatar_url)

  const { mentions, isLoading: mentionsLoading, error: mentionsError } = useThreadMentions({
    threadId,
    pageSize: 50,
    enabled: !!threadId,
  })

  const markAsRead = useMarkMentionsRead()
  const hasUpsertedSeenIdsRef = useRef<Set<number>>(new Set())

  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [draftTitle, setDraftTitle] = useState(threadTitle || '')

  useEffect(() => {
    setDraftTitle(threadTitle || '')
    setIsEditingTitle(false)
  }, [threadTitle, threadId])

  const saveTitle = async () => {
    if (!threadId) return
    const next = draftTitle.trim() ? draftTitle.trim() : null
    try {
      // Avoid `.select().single()` here: RLS often allows UPDATE but blocks returning rows,
      // which yields 0 rows and triggers PGRST116.
      const { error } = await supabase.from('threads').update({ title: next }).eq('id', threadId)
      if (error) throw error

      // Optimistic update the inbox list cache so it reflects immediately
      queryClient.setQueriesData({ queryKey: ['inbox-threads'] }, (old: any) => {
        // Supports both legacy (array) and infinite-query (pages) shapes.
        if (Array.isArray(old)) {
          return old.map((t) => (t.thread_id === threadId ? { ...t, thread_title: next } : t))
        }
        if (old && Array.isArray(old.pages)) {
          const pages = old.pages.map((page: any[]) =>
            Array.isArray(page)
              ? page.map((t) => (t.thread_id === threadId ? { ...t, thread_title: next } : t))
              : page
          )
          return { ...old, pages }
        }
        return old
      })
      queryClient.invalidateQueries({ queryKey: ['inbox-threads'] })
      setIsEditingTitle(false)
    } catch (e: any) {
      toast({
        title: 'Failed to rename thread',
        description: e?.message || 'Please try again.',
        variant: 'destructive',
      })
      setDraftTitle(threadTitle || '')
      setIsEditingTitle(false)
    }
  }

  const { data: taskInfo } = useQuery({
    queryKey: ['inbox-task-info', taskId],
    queryFn: async () => {
      if (!taskId) return null
      const { data, error } = await supabase.from('tasks').select('id, title, project_name').eq('id', taskId).maybeSingle()
      if (error) throw error
      return data || null
    },
    enabled: !!taskId,
    staleTime: 60_000,
  })

  const { data: projectInfo } = useQuery({
    queryKey: ['inbox-project-info', projectId],
    queryFn: async () => {
      if (!projectId) return null
      const { data, error } = await supabase.from('v_projects_minimal').select('id, name').eq('id', projectId).maybeSingle()
      if (error) throw error
      return data || null
    },
    enabled: !!projectId && !taskId,
    staleTime: 60_000,
  })

  const unreadMentionIds = useMemo(() => {
    if (!threadId || !currentUserId) return []
    return (mentions || [])
      .filter((m) => m && !m.is_read && m.created_by !== currentUserId && typeof m.id === 'number')
      .map((m) => m.id)
  }, [mentions, currentUserId, threadId])

  // Fetch thread watchers for the participants component
  const { data: watchers, refetch: refetchWatchers } = useQuery({
    queryKey: ['thread-watchers', threadId],
    queryFn: async () => {
      if (!threadId) return []
      const { data, error } = await supabase
        .from('thread_watchers')
        .select('watcher_id, users:watcher_id(id, full_name, email, photo)')
        .eq('thread_id', threadId)
      if (error) throw error
      return (data || []).map((w: any) => w.users).filter(Boolean)
    },
    enabled: !!threadId,
  })

  // Fetch all project users for the participants component
  const { data: allProjectUsers } = useQuery({
    queryKey: ['project-users', projectId],
    queryFn: async () => {
      if (!projectId) {
        // If no project, fetch all users
        const { data, error } = await supabase
          .from('view_users_i_can_see')
          .select('id, full_name, email, photo')
          .order('full_name')
        if (error) throw error
        return data || []
      }
      // Fetch project watchers
      const { data, error } = await supabase
        .from('project_watchers')
        .select('user_id, users:user_id(id, full_name, email, photo)')
        .eq('project_id', projectId)
      if (error) throw error
      return (data || []).map((pw: any) => pw.users).filter(Boolean)
    },
    enabled: !!threadId,
  })

  // Mark mentions as read when thread is opened or new mentions arrive
  useEffect(() => {
    if (!threadId || !currentUserId || unreadMentionIds.length === 0) return

    const toUpsert = unreadMentionIds.filter((id) => !hasUpsertedSeenIdsRef.current.has(id))
    if (toUpsert.length === 0) return

    toUpsert.forEach((id) => hasUpsertedSeenIdsRef.current.add(id))

    markAsRead.mutate(toUpsert, {
      onSuccess: () => {
        // Avoid refetch loops: update the cached mentions for this thread as read.
        queryClient.setQueryData(['thread-mentions', threadId, 50], (old: any) => {
          if (!Array.isArray(old)) return old
          return old.map((m) => (toUpsert.includes(m.id) ? { ...m, is_read: true } : m))
        })
      },
    })
  }, [threadId, currentUserId, unreadMentionIds, markAsRead, queryClient])


  if (!threadId) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Select a thread to view messages
      </div>
    )
  }

  if (mentionsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (mentionsError) {
    return (
      <div className="flex items-center justify-center h-full text-destructive">
        Error loading messages: {String(mentionsError)}
      </div>
    )
  }

  const openLinkedEntity = () => {
    if (typeof taskId === 'number' && onOpenTaskDetails) {
      onOpenTaskDetails(taskId)
      return
    }
    if (typeof projectId === 'number' && onOpenProjectDetails) {
      onOpenProjectDetails(projectId)
    }
  }
  const linkedEntityLabel = taskInfo?.title || taskInfo?.project_name || projectInfo?.name || null
  const mobileThreadActions: MobileDetailAction[] = [
    {
      id: 'rename',
      label: 'Rename thread',
      icon: <Pencil className="h-4 w-4" />,
      onSelect: () => setIsEditingTitle(true),
    },
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Mobile thread header: stable title + top-right "..." overflow (participants stay inline). */}
      {isMobile ? (
        <MobileDetailHeader
          onBack={onClose}
          backLabel="Close details"
          title={
            isEditingTitle ? (
              <Input
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    await saveTitle()
                  } else if (e.key === 'Escape') {
                    setDraftTitle(threadTitle || '')
                    setIsEditingTitle(false)
                  }
                }}
                onBlur={saveTitle}
                autoFocus
                className="h-8"
              />
            ) : (
              threadTitle || 'Untitled Thread'
            )
          }
          subtitle={
            linkedEntityLabel ? (
              <button
                type="button"
                className="truncate hover:underline"
                onClick={openLinkedEntity}
                title={taskId ? 'Open task details' : 'Open project details'}
              >
                {linkedEntityLabel}
              </button>
            ) : projectId ? (
              `Project #${projectId}`
            ) : undefined
          }
          rightSlot={
            threadId ? (
              <ThreadParticipantsInline
                threadId={Number(threadId)}
                projectId={projectId || undefined}
                allowRemove={true}
                participants={watchers || []}
                allProjectUsers={allProjectUsers || []}
                currentUserId={currentUserId}
                onParticipantsChanged={() => refetchWatchers()}
              />
            ) : null
          }
          actions={mobileThreadActions}
        />
      ) : (
      /* Thread header */
      <div className="p-4 border-b flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          {isEditingTitle ? (
            <Input
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  await saveTitle()
                } else if (e.key === 'Escape') {
                  setDraftTitle(threadTitle || '')
                  setIsEditingTitle(false)
                }
              }}
              onBlur={saveTitle}
              autoFocus
            />
          ) : (
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="font-semibold text-lg truncate">
                {threadTitle || 'Untitled Thread'}
              </h2>
              <button
                type="button"
                className="text-gray-400 hover:text-gray-700"
                onClick={() => setIsEditingTitle(true)}
                aria-label="Edit thread title"
                title="Edit thread title"
              >
                <Pencil className="h-4 w-4" />
              </button>
            </div>
          )}
          {projectId && <p className="text-sm text-muted-foreground">Project #{projectId}</p>}
          {(taskInfo?.title || taskInfo?.project_name || projectInfo?.name) ? (
            <button
              type="button"
              className="mt-1 text-sm text-muted-foreground hover:underline truncate"
              onClick={() => {
                if (typeof taskId === 'number' && onOpenTaskDetails) {
                  onOpenTaskDetails(taskId)
                  return
                }
                if (typeof projectId === 'number' && onOpenProjectDetails) {
                  onOpenProjectDetails(projectId)
                }
              }}
              title={taskId ? 'Open task details' : 'Open project details'}
              aria-label={taskId ? 'Open task details' : 'Open project details'}
            >
              {taskInfo?.title || taskInfo?.project_name || projectInfo?.name}
            </button>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          {threadId ? (
            <ThreadParticipantsInline
              threadId={Number(threadId)}
              projectId={projectId || undefined}
              allowRemove={true}
              participants={watchers || []}
              allProjectUsers={allProjectUsers || []}
              currentUserId={currentUserId}
              onParticipantsChanged={() => refetchWatchers()}
            />
          ) : null}
          {onFocusToggle ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onFocusToggle}
              className="h-8 w-8 p-0 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              aria-label={isDetailsFocused ? "Restore details pane" : "Expand details pane"}
              title={isDetailsFocused ? "Restore details pane" : "Expand details pane"}
            >
              {isDetailsFocused ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </Button>
          ) : null}
          {onClose ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-8 w-8 p-0 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              aria-label="Close details"
              title="Close details"
            >
              <X className="w-4 h-4" />
            </Button>
          ) : null}
        </div>
      </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-hidden">
        {mentions.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            No messages found
          </div>
        ) : (
          <ThreadedRealtimeChat
            threadId={threadId}
            currentUserId={currentUserId || 0}
            currentUserName={currentUserName || undefined}
            currentUserAvatar={currentUserAvatar || undefined}
            currentUserEmail={currentUserEmail || undefined}
            currentPublicUserId={currentUserId || undefined}
            autoFocusInput={autoFocusComposer}
            focusedMentionId={focusedMentionId}
            hideInput={false}
            groupByDate={true}
            initialMessages={mentions
              .filter((m) => {
                const isValid = m && m.id != null && m.created_at && m.created_by != null
                if (!isValid) {
                  console.warn('[InboxThreadView] Filtering out invalid mention:', m)
                }
                return isValid
              })
              .map((m) => {
                // Ensure users is an object, not an array
                let users = m.users
                if (Array.isArray(users)) {
                  users = users[0] || null
                }
                
                return {
                  id: m.id,
                  comment: m.comment || '',
                  attachment: m.attachment || null,
                  reply_to_id: m.reply_to_id || null,
                  created_at: m.created_at,
                  created_by: m.created_by,
                  users: users || null,
                }
              })}
          />
        )}
      </div>
    </div>
  )
}


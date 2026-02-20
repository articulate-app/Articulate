'use client'

import type { InboxThread, InboxWatcherUser } from '../../hooks/use-inbox-threads'
import { Input } from '../ui/input'
import { Badge } from '../ui/badge'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'
import { useQuery } from '@tanstack/react-query'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs'
import { FilterBadges } from '../../../components/ui/filter-badges'
import { MultiSelect } from '../ui/multi-select'
import { DateRangePicker } from '../ui/date-range-picker'
import { SlidePanel } from '../ui/slide-panel'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { useCurrentUserStore } from '../../store/current-user'
import { useQueryClient } from '@tanstack/react-query'
import { RichTextEditor } from '../ui/rich-text-editor'
import { differenceInCalendarDays, isToday, isYesterday } from 'date-fns'

function getInitials(name: string | null | undefined): string {
  if (!name) return '?'
  const parts = name.trim().split(' ').filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

interface InboxThreadListProps {
  selectedThreadId: number | null
  onSelectThread: (threadId: number) => void
  box: 'received' | 'sent'
  onBoxChange: (box: 'received' | 'sent') => void
  searchQuery: string
  onSearchChange: (query: string) => void
  projectIds: number[]
  onProjectIdsChange: (ids: number[]) => void
  taskIds: number[]
  onTaskIdsChange: (ids: number[]) => void
  senderIds: number[]
  onSenderIdsChange: (ids: number[]) => void
  dateFrom: string | null
  dateTo: string | null
  onDateRangeChange: (range: { from: string | null; to: string | null }) => void
  threads: InboxThread[]
  isLoading: boolean
  hasNextPage: boolean
  isFetchingNextPage: boolean
  onLoadMore: () => void
  onThreadCreatedNavigate?: (threadId: number) => void
}

export function InboxThreadList({
  selectedThreadId,
  onSelectThread,
  box,
  onBoxChange,
  searchQuery,
  onSearchChange,
  projectIds,
  onProjectIdsChange,
  taskIds,
  onTaskIdsChange,
  senderIds,
  onSenderIdsChange,
  dateFrom,
  dateTo,
  onDateRangeChange,
  threads,
  isLoading,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  onThreadCreatedNavigate,
}: InboxThreadListProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const [isFiltersOpen, setIsFiltersOpen] = useState(false)
  const [isNewThreadOpen, setIsNewThreadOpen] = useState(false)
  const [newThreadTitle, setNewThreadTitle] = useState('')
  const [newThreadParticipantIds, setNewThreadParticipantIds] = useState<string[]>([])
  const [newThreadMessage, setNewThreadMessage] = useState('')
  const [isCreatingThread, setIsCreatingThread] = useState(false)
  const [createThreadError, setCreateThreadError] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const currentUserId = useCurrentUserStore((s) => s.publicUserId)
  const currentUserName = useCurrentUserStore((s) => s.fullName)
  const currentUserEmail = useCurrentUserStore((s) => s.userMetadata?.email)
  const currentUserPhoto = useCurrentUserStore((s) => s.userMetadata?.avatar_url)

  useEffect(() => {
    const onOpen = () => setIsFiltersOpen(true)
    window.addEventListener('inbox:filter-click', onOpen as any)
    return () => window.removeEventListener('inbox:filter-click', onOpen as any)
  }, [])

  // Infinite scroll: reuse the same sentinel IntersectionObserver pattern as Tasks list.
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage && threads.length > 0) {
          onLoadMore()
        }
      },
      {
        root: scrollContainerRef.current,
        threshold: 0.1,
        rootMargin: '50px',
      }
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, onLoadMore, threads.length])

  // Fetch projects for filter
  const supabase = createClientComponentClient()
  const { data: projects } = useQuery({
    queryKey: ['projects-minimal'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_projects_minimal')
        .select('id, name, color')
        .order('name')
      if (error) throw error
      return data || []
    },
  })

  // Fetch users for sender filter
  const { data: users } = useQuery({
    queryKey: ['users-for-inbox-filter'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('view_users_i_can_see')
        .select('id, full_name, email, photo')
        .order('full_name')
      if (error) throw error
      return data || []
    },
  })

  const [taskSearch, setTaskSearch] = useState('')
  const shouldFetchTasks =
    (isFiltersOpen && taskSearch.trim().length >= 2) || taskIds.length > 0

  const { data: taskOptions } = useQuery({
    queryKey: ['inbox-task-options', taskIds.join(','), taskSearch],
    queryFn: async () => {
      const selected = taskIds
      let selectedRows: any[] = []
      if (selected.length > 0) {
        const res = await supabase.from('tasks').select('id, title, project_name').in('id', selected)
        if (res.error) throw res.error
        selectedRows = res.data || []
      }

      let searchedRows: any[] = []
      if (isFiltersOpen && taskSearch.trim().length >= 2) {
        const res = await supabase
          .from('tasks')
          .select('id, title, project_name')
          .ilike('title', `%${taskSearch.trim()}%`)
          .limit(20)
        if (res.error) throw res.error
        searchedRows = res.data || []
      }

      const byId = new Map<number, any>()
      for (const row of [...selectedRows, ...searchedRows]) {
        if (typeof row?.id === 'number') byId.set(row.id, row)
      }

      return Array.from(byId.values()).map((t) => ({
        id: String(t.id),
        label: t.project_name ? `${t.project_name} · ${t.title}` : t.title ?? `Task #${t.id}`,
      }))
    },
    enabled: shouldFetchTasks,
  })

  const projectMultiOptions = (projects || []).map((p: any) => ({ id: String(p.id), label: p.name }))
  const senderMultiOptions = (users || []).map((u: any) => ({ id: String(u.id), label: u.full_name || u.email }))
  const taskMultiOptions = taskOptions || []

  const badges = [
    searchQuery.trim()
      ? { id: 'q', label: 'search', value: searchQuery.trim(), onRemove: () => onSearchChange('') }
      : null,
    projectIds.length
      ? { id: 'project', label: 'project', value: `${projectIds.length} selected`, onRemove: () => onProjectIdsChange([]) }
      : null,
    taskIds.length
      ? { id: 'task', label: 'task', value: `${taskIds.length} selected`, onRemove: () => onTaskIdsChange([]) }
      : null,
    senderIds.length
      ? { id: 'sender', label: 'sender', value: `${senderIds.length} selected`, onRemove: () => onSenderIdsChange([]) }
      : null,
    dateFrom || dateTo
      ? {
          id: 'date',
          label: 'date',
          value: `${dateFrom ?? '…'} → ${dateTo ?? '…'}`,
          onRemove: () => onDateRangeChange({ from: null, to: null }),
        }
      : null,
  ].filter(Boolean) as any[]

  const clearAll = () => {
    onSearchChange('')
    onProjectIdsChange([])
    onTaskIdsChange([])
    onSenderIdsChange([])
    onDateRangeChange({ from: null, to: null })
  }

  const handleCreateThread = async () => {
    if (!currentUserId) {
      setCreateThreadError('You must be signed in to create a thread.')
      return
    }
    setIsCreatingThread(true)
    setCreateThreadError(null)
    try {
      const isMessageEmpty = (html: string) => !html || !html.replace(/<(.|\n)*?>/g, '').trim()
      if (isMessageEmpty(newThreadMessage)) {
        setCreateThreadError('Please write a first message.')
        setIsCreatingThread(false)
        return
      }

      // Creator should be auto-watched by DB trigger; FE should NOT insert creator watcher.
      // Require at least one other participant.
      const uniqueOtherParticipantIds = Array.from(new Set(newThreadParticipantIds.filter(Boolean)))
      if (uniqueOtherParticipantIds.length < 1) {
        setCreateThreadError('A thread must have at least 2 participants.')
        setIsCreatingThread(false)
        return
      }

      const { data: thread, error: threadError } = await supabase
        .from('threads')
        .insert([
          {
            title: newThreadTitle.trim() ? newThreadTitle.trim() : null,
            created_by: currentUserId,
          },
        ])
        .select('id')
        .single()

      if (threadError) throw threadError
      if (!thread?.id) throw new Error('Failed to create thread')

      // Add watchers (excluding creator; creator is auto-watched by trigger)
      const watcherRows = uniqueOtherParticipantIds
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id))
        .map((id) => ({
          thread_id: thread.id,
          watcher_id: id,
          added_by: currentUserId,
        }))
      if (watcherRows.length > 0) {
        const { error: watchersError } = await supabase.from('thread_watchers').insert(watcherRows)
        if (watchersError) throw watchersError
      }

      // Insert the first message (required so the thread shows in inbox views)
      const { data: insertedMention, error: mentionError } = await supabase
        .from('mentions')
        .insert({
          thread_id: thread.id,
          comment: newThreadMessage,
          created_by: currentUserId,
          created_at: new Date().toISOString(),
        })
        .select('id, created_at')
        .single()
      if (mentionError) throw mentionError

      // Patch inbox cache in-place (avoid refetching watcher data)
      const stripHtml = (html: string) => html.replace(/<[^>]*>/g, '').trim()
      const nowIso = insertedMention?.created_at || new Date().toISOString()
      const nextTitle = newThreadTitle.trim() ? newThreadTitle.trim() : null

      const selectedUsersById = new Map<number, any>()
      for (const u of users || []) {
        if (typeof u?.id === 'number') selectedUsersById.set(u.id, u)
      }
      const otherWatchers = Array.from(new Set(newThreadParticipantIds.map((v) => Number(v)).filter(Number.isFinite)))
        .map((id) => selectedUsersById.get(id))
        .filter(Boolean)
        .map((u: any) => ({
          id: Number(u.id),
          full_name: u.full_name ?? null,
          email: u.email ?? null,
          photo: u.photo ?? null,
        }))

      const me =
        typeof currentUserId === 'number'
          ? [{ id: currentUserId, full_name: currentUserName ?? null, email: currentUserEmail ?? null, photo: currentUserPhoto ?? null }]
          : []

      const newRow: InboxThread = {
        thread_id: thread.id,
        thread_title: nextTitle,
        project_id: null,
        task_id: null,
        team_id: null,
        user_id: null,
        is_private: null,
        pinned: false,
        thread_created_at: nowIso,
        last_mention_id: insertedMention?.id ?? null,
        last_mention_at: nowIso,
        last_mention_by: currentUserId ?? null,
        last_mention_snippet: stripHtml(newThreadMessage).slice(0, 160),
        unread_count: 0,
        watchers: [...me, ...otherWatchers],
        other_watchers: otherWatchers,
      }

      const isWithinDateRange = (from: string, to: string) => {
        const ms = new Date(nowIso).getTime()
        const fromMs = new Date(`${from}T00:00:00.000Z`).getTime()
        const toMs = new Date(`${to}T23:59:59.999Z`).getTime()
        return ms >= fromMs && ms <= toMs
      }

      // Insert into any cached inbox list query where it should appear (usually 'sent')
      for (const [key, data] of queryClient.getQueriesData({ queryKey: ['inbox-threads'] })) {
        if (!Array.isArray(key)) continue
        const keyBox = key[1]
        const keyUserId = key[2]
        const keyQ = (key[3] as string) || ''
        const keyProjects = (key[4] as string) || ''
        const keyTasks = (key[5] as string) || ''
        const keySenders = (key[6] as string) || ''
        const keyFrom = (key[7] as string) || ''
        const keyTo = (key[8] as string) || ''

        if (keyBox !== 'sent') continue
        if (typeof currentUserId === 'number' && keyUserId !== currentUserId) continue
        if (keyProjects) continue // new thread has no project/task association yet
        if (keyTasks) continue
        if (keySenders && typeof currentUserId === 'number' && !keySenders.split(',').includes(String(currentUserId))) continue
        if (keyFrom && !keyTo && new Date(nowIso) < new Date(`${keyFrom}T00:00:00.000Z`)) continue
        if (!keyFrom && keyTo && new Date(nowIso) > new Date(`${keyTo}T23:59:59.999Z`)) continue
        if (keyFrom && keyTo && !isWithinDateRange(keyFrom, keyTo)) continue
        if (keyQ.trim()) {
          const needle = keyQ.trim().toLowerCase()
          const hay = `${nextTitle ?? ''} ${newRow.last_mention_snippet ?? ''}`.toLowerCase()
          if (!hay.includes(needle)) continue
        }

        queryClient.setQueryData(key, (old: any) => {
          if (!old || !Array.isArray(old.pages)) return old
          const firstPage = Array.isArray(old.pages[0]) ? (old.pages[0] as InboxThread[]) : []
          const exists = firstPage.some((t) => t.thread_id === newRow.thread_id)
          if (exists) return old
          const pages = [[newRow, ...firstPage], ...old.pages.slice(1)]
          return { ...old, pages }
        })
      }

      setIsNewThreadOpen(false)
      setNewThreadTitle('')
      setNewThreadParticipantIds([])
      setNewThreadMessage('')
      onThreadCreatedNavigate?.(thread.id)
    } catch (e: any) {
      setCreateThreadError(e?.message || 'Failed to create thread')
    } finally {
      setIsCreatingThread(false)
    }
  }

  return (
    <div className="flex flex-col h-full border-r">
      {/* Top bar with search and filters */}
      <div className="p-4 border-b space-y-3">
        <div className="flex items-center gap-2">
          <Tabs value={box} onValueChange={(v) => onBoxChange(v as 'received' | 'sent')} className="flex-1">
            <TabsList className="w-full grid grid-cols-2">
              <TabsTrigger value="received">Received</TabsTrigger>
              <TabsTrigger value="sent">Sent</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-10 w-10"
            onClick={() => setIsNewThreadOpen(true)}
            title="New thread"
            aria-label="New thread"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <FilterBadges badges={badges} onClearAll={badges.length > 1 ? clearAll : undefined} className="mt-2 mb-2" />

      <SlidePanel
        isOpen={isFiltersOpen}
        onClose={() => setIsFiltersOpen(false)}
        position="right"
        title="Filters"
        className="w-full max-w-md"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Projects</label>
            <MultiSelect
              options={projectMultiOptions}
              value={projectIds.map(String)}
              onChange={(vals) => onProjectIdsChange(vals.map(Number).filter(Number.isFinite))}
              placeholder="Select projects..."
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Tasks</label>
            <MultiSelect
              options={taskMultiOptions}
              value={taskIds.map(String)}
              onSearch={setTaskSearch}
              onChange={(vals) => onTaskIdsChange(vals.map(Number).filter(Number.isFinite))}
              placeholder="Select tasks..."
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Senders</label>
            <MultiSelect
              options={senderMultiOptions}
              value={senderIds.map(String)}
              onChange={(vals) => onSenderIdsChange(vals.map(Number).filter(Number.isFinite))}
              placeholder="Select senders..."
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Mention date</label>
            <DateRangePicker
              value={{
                from: dateFrom ? new Date(dateFrom) : undefined,
                to: dateTo ? new Date(dateTo) : undefined,
              }}
              onChange={(v) => {
                const toYmd = (d?: Date) =>
                  d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : null
                onDateRangeChange({ from: toYmd(v.from), to: toYmd(v.to) })
              }}
            />
          </div>

          <div className="flex items-center justify-between border-t pt-4">
            <button
              type="button"
              className="text-sm text-muted-foreground hover:underline"
              onClick={clearAll}
            >
              Clear all
            </button>
            <button
              type="button"
              className="text-sm font-medium"
              onClick={() => setIsFiltersOpen(false)}
            >
              Done
            </button>
          </div>
        </div>
      </SlidePanel>

      <Dialog open={isNewThreadOpen} onOpenChange={setIsNewThreadOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New thread</DialogTitle>
            <DialogDescription>Select participants, then write the first message.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Title (optional)</label>
              <Input
                value={newThreadTitle}
                onChange={(e) => setNewThreadTitle(e.target.value)}
                placeholder="e.g. Website copy review"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Participants</label>
              <MultiSelect
                options={senderMultiOptions.filter((u) => String(u.id) !== String(currentUserId))}
                value={newThreadParticipantIds}
                onChange={setNewThreadParticipantIds}
                placeholder="Select people..."
              />
              <p className="text-xs text-muted-foreground">You’ll be added automatically.</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">First message</label>
              <RichTextEditor
                value={newThreadMessage}
                onChange={setNewThreadMessage}
                placeholder="Write a message…"
                height={140}
                toolbarId="ql-toolbar-inbox-new-thread"
              />
            </div>
            {createThreadError && <div className="text-sm text-destructive">{createThreadError}</div>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsNewThreadOpen(false)} disabled={isCreatingThread}>
              Cancel
            </Button>
            <Button type="button" onClick={handleCreateThread} disabled={isCreatingThread}>
              {isCreatingThread ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Thread list */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 text-sm text-muted-foreground">Loading threads...</div>
        ) : threads.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground text-center">
            No threads found
          </div>
        ) : (
          <div className="divide-y">
            {(() => {
              const bucketOrder = ['Today', 'Yesterday', 'Past week', 'This month', 'Older'] as const
              const getBucket = (iso: string | null) => {
                if (!iso) return 'Older'
                const d = new Date(iso)
                if (Number.isNaN(d.getTime())) return 'Older'
                if (isToday(d)) return 'Today'
                if (isYesterday(d)) return 'Yesterday'
                const daysAgo = differenceInCalendarDays(new Date(), d)
                if (daysAgo >= 2 && daysAgo <= 6) return 'Past week'
                const now = new Date()
                if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) return 'This month'
                return 'Older'
              }

              const groups: Record<string, InboxThread[]> = {}
              for (const t of threads) {
                const label = getBucket(t.last_mention_at)
                groups[label] = groups[label] ? [...groups[label], t] : [t]
              }

              return bucketOrder.flatMap((label) => {
                const items = groups[label] || []
                if (items.length === 0) return []
                return [
                  <div key={`sep-${label}`} className="sticky top-0 z-10 bg-white px-4 py-2 border-b">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</div>
                  </div>,
                  ...items.map((thread) => (
                    <ThreadRow
                      key={thread.thread_id}
                      thread={thread}
                      isSelected={selectedThreadId === thread.thread_id}
                      onClick={() => onSelectThread(thread.thread_id)}
                    />
                  )),
                ]
              })
            })()}
          </div>
        )}
        {/* Sentinel for infinite scroll */}
        <div ref={sentinelRef} style={{ height: 20 }} />
        {!isLoading && isFetchingNextPage ? (
          <div className="p-4 text-center text-xs text-muted-foreground">Loading more…</div>
        ) : null}
      </div>
    </div>
  )
}

interface ThreadRowProps {
  thread: InboxThread
  isSelected: boolean
  onClick: () => void
}

function ThreadRow({ thread, isSelected, onClick }: ThreadRowProps) {
  const otherWatchers = Array.isArray(thread.other_watchers) ? (thread.other_watchers as InboxWatcherUser[]) : []
  const isDm = otherWatchers.length === 1

  const timeAgo = thread.last_mention_at
    ? formatDistanceToNow(new Date(thread.last_mention_at), { addSuffix: true })
    : null

  const visible = otherWatchers.slice(0, 3)
  const remaining = Math.max(0, otherWatchers.length - visible.length)
  const dmUser = otherWatchers[0]
  const displayName = isDm
    ? dmUser?.full_name || dmUser?.email || 'DM'
    : thread.thread_title || 'Group'
  const displaySubTitle = !isDm && thread.thread_title ? null : thread.thread_title
  // Prefer resolving sender from watchers (single source of truth, no extra fetch).
  const watchers = Array.isArray(thread.watchers) ? (thread.watchers as InboxWatcherUser[]) : []
  const sender = watchers.find((w) => w.id === thread.last_mention_by) || null
  const senderLabel = sender?.full_name || sender?.email || (thread.last_mention_by ? `User #${thread.last_mention_by}` : null)

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left p-4 hover:bg-gray-50 transition-colors',
        isSelected && 'bg-blue-50 border-l-4 border-l-blue-500'
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex -space-x-2">
              {visible.length > 0 ? (
                visible.map((p) => (
                  <div
                    key={p.id}
                    className="w-6 h-6 rounded-full bg-gray-200 border border-white flex items-center justify-center text-[10px] font-medium text-gray-700"
                    title={p.full_name || p.email || 'Participant'}
                  >
                    {getInitials(p.full_name || p.email)}
                  </div>
                ))
              ) : (
                <div className="w-6 h-6 rounded-full bg-gray-200 border border-white flex items-center justify-center text-[10px] font-medium text-gray-700">
                  ?
                </div>
              )}
              {remaining > 0 ? (
                <div
                  className="w-6 h-6 rounded-full bg-gray-100 border border-white flex items-center justify-center text-[10px] font-medium text-gray-600"
                  title={`${remaining} more`}
                >
                  +{remaining}
                </div>
              ) : null}
            </div>
            <div className="font-medium text-sm truncate">
              {displayName}
            </div>
          </div>
          {displaySubTitle ? (
            <div className="text-xs text-muted-foreground truncate mt-0.5">{displaySubTitle}</div>
          ) : null}
          {/* Do not show raw IDs in the left pane */}
        </div>
        {(Number(thread.unread_count) || 0) > 0 && (
          <Badge variant="default" className="bg-blue-500 text-white">
            {thread.unread_count}
          </Badge>
        )}
      </div>
      {thread.last_mention_snippet && (
        <div className="text-sm text-muted-foreground truncate mb-2">
          {thread.last_mention_snippet}
        </div>
      )}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-2">{senderLabel ? <span>{senderLabel}</span> : null}</div>
        {timeAgo && <span>{timeAgo}</span>}
      </div>
    </button>
  )
}


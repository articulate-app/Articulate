'use client'

import { useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { InboxThreadList } from './inbox-thread-list'
import { InboxThreadView } from './inbox-thread-view'
import { InboxTaskDetailsPane } from './inbox-task-details-pane'
import { InboxProjectDetailsPane } from './inbox-project-details-pane'
import { useInboxThreadsInfinite } from '../../hooks/use-inbox-threads'
import { useCurrentUserStore } from '../../store/current-user'

function parseCsvNumbers(value: string | null): number[] {
  if (!value) return []
  return value
    .split(',')
    .map((v) => Number(v.trim()))
    .filter((n) => Number.isFinite(n))
}

export function InboxPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const currentUserId = useCurrentUserStore((s) => s.publicUserId)

  const box = (searchParams.get('box') === 'sent' ? 'sent' : 'received') as 'received' | 'sent'
  const searchQuery = searchParams.get('q') || ''
  const projectIds = parseCsvNumbers(searchParams.get('project'))
  const taskIds = parseCsvNumbers(searchParams.get('task'))
  const senderIds = parseCsvNumbers(searchParams.get('sender'))
  const dateFrom = searchParams.get('from')
  const dateTo = searchParams.get('to')

  // Get selected thread from URL
  const selectedThreadIdParam = searchParams.get('thread')
  const selectedThreadId = selectedThreadIdParam ? Number(selectedThreadIdParam) : null
  // Third pane details (do NOT use `task` because it is a left-pane filter param)
  const detailTaskIdParam = searchParams.get('detailTask')
  const detailTaskId = detailTaskIdParam ? Number(detailTaskIdParam) : null
  const detailProjectIdParam = searchParams.get('detailProject')
  const detailProjectId = detailProjectIdParam ? Number(detailProjectIdParam) : null
  const focusComposer = searchParams.get('focusComposer') === '1'

  const setParams = (patch: Record<string, string | null | undefined>, mode: 'replace' | 'push' = 'replace') => {
    const params = new URLSearchParams(searchParams.toString())
    // Inbox is always sorted by last mention date; ensure we don't persist old sort params.
    params.delete('sort')
    params.delete('order')
    for (const [key, value] of Object.entries(patch)) {
      if (value == null || value === '') params.delete(key)
      else params.set(key, value)
    }
    const url = `/inbox?${params.toString()}`
    if (mode === 'push') router.push(url, { scroll: false })
    else router.replace(url, { scroll: false })
  }

  // Get thread list once (avoid double fetching)
  const { threads, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInboxThreadsInfinite({
    box,
    currentUserId,
    searchQuery,
    projectIds,
    taskIds,
    senderIds,
    dateFrom,
    dateTo,
  })

  const selectedThread = threads.find((t) => t.thread_id === selectedThreadId)

  // Handle thread selection
  const handleSelectThread = (threadId: number) => {
    setParams({ thread: String(threadId), focusComposer: null }, 'push')
  }

  useEffect(() => {
    if (!focusComposer) return
    if (!selectedThreadId) return
    setParams({ focusComposer: null }, 'replace')
  }, [focusComposer, selectedThreadId])

  // Note: we intentionally do NOT auto-clear ?thread when the current list doesn't contain it
  // because the list can be filtered (box/filters) while a thread is still a valid selection.

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left pane: Thread list */}
      <div className="w-1/3 min-w-[300px] max-w-[400px] flex-shrink-0">
        <InboxThreadList
          selectedThreadId={selectedThreadId}
          onSelectThread={handleSelectThread}
          box={box}
          onBoxChange={(next) => setParams({ box: next, thread: null }, 'replace')}
          searchQuery={searchQuery}
          onSearchChange={(q) => setParams({ q, thread: null }, 'replace')}
          projectIds={projectIds}
          onProjectIdsChange={(ids) => setParams({ project: ids.length ? ids.join(',') : null, thread: null }, 'replace')}
          taskIds={taskIds}
          onTaskIdsChange={(ids) => setParams({ task: ids.length ? ids.join(',') : null, thread: null }, 'replace')}
          senderIds={senderIds}
          onSenderIdsChange={(ids) => setParams({ sender: ids.length ? ids.join(',') : null, thread: null }, 'replace')}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateRangeChange={(range) =>
            setParams(
              {
                from: range?.from ?? null,
                to: range?.to ?? null,
                thread: null,
              },
              'replace'
            )
          }
          threads={threads}
          isLoading={isLoading}
          hasNextPage={!!hasNextPage}
          isFetchingNextPage={!!isFetchingNextPage}
          onLoadMore={() => fetchNextPage()}
          onThreadCreatedNavigate={(id) => {
            // A newly-created thread's last_mention_by is me, so it will appear in Sent.
            setParams({ box: 'sent', thread: String(id) }, 'push')
          }}
        />
      </div>

      {/* Middle pane: Thread view (always visible) */}
      <div className="flex-1 min-w-0">
        <InboxThreadView
          threadId={selectedThreadId}
          threadTitle={selectedThread?.thread_title || null}
          projectId={selectedThread?.project_id || null}
          taskId={selectedThread?.task_id || null}
          autoFocusComposer={focusComposer}
          onOpenTaskDetails={(id) => setParams({ detailTask: String(id), detailProject: null }, 'push')}
          onOpenProjectDetails={(id) => setParams({ detailProject: String(id), detailTask: null }, 'push')}
        />
      </div>

      {/* Right pane: Task / Project details (third pane, no overlap) */}
      {typeof detailTaskId === 'number' && Number.isFinite(detailTaskId) ? (
        <div className="w-[440px] max-w-[440px] flex-shrink-0 border-l h-full overflow-hidden">
          <InboxTaskDetailsPane
            taskId={detailTaskId}
            onClose={() => setParams({ detailTask: null }, 'replace')}
          />
        </div>
      ) : typeof detailProjectId === 'number' && Number.isFinite(detailProjectId) ? (
        <div className="w-[440px] max-w-[440px] flex-shrink-0 border-l h-full overflow-hidden">
          <InboxProjectDetailsPane
            projectId={detailProjectId}
            onClose={() => setParams({ detailProject: null }, 'replace')}
          />
        </div>
      ) : null}
    </div>
  )
}


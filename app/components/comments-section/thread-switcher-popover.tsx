import React, { useEffect, useState } from "react"
import { Popover, PopoverTrigger, PopoverContent } from "../ui/popover"
import { Button } from "../ui/button"
import { Thread } from '../../types/task'

interface Mention {
  id: number
  thread_id: number
  comment: string | null
  created_at: string
}

interface User {
  id: number
  full_name: string
  email: string
  photo?: string
}

interface ThreadSwitcherPopoverProps {
  taskId: number
  threads: Thread[]
  activeThreadId: number | null
  onSelectThread: (threadId: number) => void
}

function getInitials(name: string | undefined | null) {
  if (!name || typeof name !== 'string') return "?"
  const parts = name.trim().split(" ").filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function ThreadSwitcherPopover({ taskId, threads, activeThreadId, onSelectThread }: ThreadSwitcherPopoverProps) {
  const [latestMentions, setLatestMentions] = useState<Record<number, Mention | null>>({})
  const [participantsByThread, setParticipantsByThread] = useState<Record<number, User[]>>({})
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    async function fetchLatestMentionsAndParticipants() {
      setLoading(true)
      try {
        const threadIds = threads.map(t => t.id)
        if (threadIds.length === 0) return
        const supabase = (await import("@supabase/auth-helpers-nextjs")).createClientComponentClient()
        // Fetch latest mentions
        const { data: mentions } = await supabase
          .from('mentions')
          .select('id,thread_id,comment,created_at')
          .in('thread_id', threadIds)
          .order('created_at', { ascending: false })
        // Map threadId -> latest mention
        const map: Record<number, Mention | null> = {}
        for (const threadId of threadIds) {
          map[threadId] = (mentions || []).find(m => m.thread_id === threadId) || null
        }
        setLatestMentions(map)
        // Fetch all participants for all threads in one query
        const { data: threadWatchers } = await supabase
          .from('thread_watchers')
          .select('thread_id, watcher_id, users:watcher_id(id, full_name, email, photo)')
          .in('thread_id', threadIds)
        // Group by thread_id
        const participants: Record<number, User[]> = {}
        for (const watcher of threadWatchers || []) {
          if (!participants[watcher.thread_id]) participants[watcher.thread_id] = []
          if (watcher.users && typeof watcher.users === 'object' && !Array.isArray(watcher.users)) {
            participants[watcher.thread_id].push(watcher.users as User)
          }
        }
        setParticipantsByThread(participants)
      } finally {
        setLoading(false)
      }
    }
    fetchLatestMentionsAndParticipants()
  }, [threads])

  // Sort threads by latest mention (desc), fallback to created_at
  const sortedThreads = [...threads].sort((a, b) => {
    const aMention = latestMentions[a.id]?.created_at || a.created_at
    const bMention = latestMentions[b.id]?.created_at || b.created_at
    return new Date(bMention).getTime() - new Date(aMention).getTime()
  })

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="icon" variant="ghost" className="ml-1" aria-label="Switch thread" title="Switch thread">
          <span className="text-lg">🕓</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-2">
        <div className="font-semibold text-xs mb-2">Switch Thread</div>
        {loading ? (
          <div className="text-xs text-muted-foreground">Loading threads...</div>
        ) : (
          <div className="flex flex-col gap-2 max-h-72 overflow-y-auto">
            {sortedThreads.map(thread => (
              <button
                key={thread.id}
                className={`flex items-start gap-2 w-full text-left rounded p-2 hover:bg-accent border ${thread.id === activeThreadId ? 'border-primary' : 'border-transparent'}`}
                onClick={() => { setOpen(false); onSelectThread(thread.id) }}
              >
                <div className="flex-1">
                  <div className="font-medium text-xs truncate">{thread.title || `Thread #${thread.id}`}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {latestMentions[thread.id]?.comment || <span className="italic">No comments yet</span>}
                  </div>
                </div>
                {/* Inline avatars for participants */}
                <div className="flex items-center gap-1">
                  {(participantsByThread[thread.id] || []).slice(0, 5).map(user => (
                    <div
                      key={user.id}
                      className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold uppercase text-gray-900 border border-gray-300"
                      title={user.full_name || user.email}
                    >
                      {getInitials(user.full_name || user.email)}
                    </div>
                  ))}
                  {(participantsByThread[thread.id]?.length || 0) > 5 && (
                    <span className="text-xs text-muted-foreground">+{participantsByThread[thread.id].length - 5}</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
} 
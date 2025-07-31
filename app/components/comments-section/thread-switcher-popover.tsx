import React, { useEffect, useState } from "react"
import { Popover, PopoverTrigger, PopoverContent } from "../ui/popover"
import { Button } from "../ui/button"
import { Thread } from '../../types/task'
import { Trash2 } from 'lucide-react'

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
  onOpenChange?: (open: boolean) => void
  onDeleteThread?: (threadId: number) => void // Add this prop
}

function getInitials(name: string | undefined | null) {
  if (!name || typeof name !== 'string') return "?"
  const parts = name.trim().split(" ").filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function ThreadSwitcherPopover({ taskId, threads, activeThreadId, onSelectThread, onOpenChange, onDeleteThread }: ThreadSwitcherPopoverProps) {
  const [latestMentions, setLatestMentions] = useState<Record<number, Mention | null>>({})
  const [participantsByThread, setParticipantsByThread] = useState<Record<number, User[]>>({})
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  // Populate participantsByThread from threads prop
  useEffect(() => {
    const map: Record<number, User[]> = {};
    for (const thread of threads) {
      if (Array.isArray(thread.thread_watchers)) {
        // thread.id may be string or number, always use Number
        map[Number(thread.id)] = thread.thread_watchers.map((tw) => tw.users).filter(Boolean);
      }
    }
    setParticipantsByThread(map);
  }, [threads]);

  // Sort threads by latest mention (desc), fallback to created_at
  const sortedThreads = [...threads].sort((a, b) => {
    const aMention = latestMentions[Number(a.id)]?.created_at || a.created_at
    const bMention = latestMentions[Number(b.id)]?.created_at || b.created_at
    return new Date(bMention).getTime() - new Date(aMention).getTime()
  })

  return (
    <Popover open={open} onOpenChange={(nextOpen) => {
      setOpen(nextOpen);
      if (onOpenChange) onOpenChange(nextOpen);
    }}>
      <PopoverTrigger asChild>
        <div className="flex items-center gap-2">
          {onDeleteThread && activeThreadId && (
            <button
              type="button"
              className="text-xs text-destructive hover:underline flex items-center gap-1"
              onClick={e => { e.stopPropagation(); onDeleteThread(activeThreadId); }}
              title="Delete this thread"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <Button size="icon" variant="ghost" className="ml-1" aria-label="Switch thread" title="Switch thread">
            <span className="text-lg">🕓</span>
          </Button>
        </div>
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
                onClick={() => { setOpen(false); onSelectThread(Number(thread.id)) }}
              >
                <div className="flex-1">
                  <div className="font-medium text-xs truncate">{thread.title || `Thread #${thread.id}`}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {latestMentions[Number(thread.id)]?.comment || <span className="italic">No comments yet</span>}
                  </div>
                </div>
                {/* Inline avatars for participants */}
                <div className="flex items-center gap-1">
                  {(participantsByThread[Number(thread.id)] || []).slice(0, 5).map((user: User) => (
                    <div
                      key={user.id}
                      className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold uppercase text-gray-900 border border-gray-300"
                      title={user.full_name || user.email}
                    >
                      {getInitials(user.full_name || user.email)}
                    </div>
                  ))}
                  {(participantsByThread[Number(thread.id)]?.length || 0) > 5 && (
                    <span className="text-xs text-muted-foreground">+{participantsByThread[Number(thread.id)].length - 5}</span>
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
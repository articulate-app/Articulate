import React, { useEffect, useState } from "react"
import { Popover, PopoverTrigger, PopoverContent } from "../ui/popover"
import { Thread } from '../../types/task'
import { Trash2, Clock } from 'lucide-react'
import { getImageUrl } from "../../lib/public-media"

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
  latestMentionsByThread?: Record<number, Mention | null>
  contextLabelByThread?: Record<number, string>
}

function getInitials(name: string | undefined | null) {
  if (!name || typeof name !== 'string') return "?"
  const parts = name.trim().split(" ").filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function ThreadSwitcherPopover({
  taskId,
  threads,
  activeThreadId,
  onSelectThread,
  onOpenChange,
  onDeleteThread,
  latestMentionsByThread,
  contextLabelByThread,
}: ThreadSwitcherPopoverProps) {
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
  const latestMentions = latestMentionsByThread ?? {}
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
        <PopoverTrigger asChild>
          <button
            type="button"
            className="shrink-0 rounded p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
            aria-label="Switch thread"
            title="Switch thread"
          >
            <Clock className="w-4 h-4" />
          </button>
        </PopoverTrigger>
      </div>
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
                {(latestMentions[Number(thread.id)] as any)?.users ? (
                  <div className="shrink-0 mt-0.5">
                    {(() => {
                      const author = (latestMentions[Number(thread.id)] as any)?.users as any
                      const photoUrl = getImageUrl(author?.photo || undefined)
                      if (photoUrl) {
                        return (
                          <img
                            src={photoUrl}
                            alt={author?.full_name || author?.email || "User"}
                            className="h-6 w-6 rounded-full border border-gray-300 object-cover"
                          />
                        )
                      }
                      return (
                        <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold uppercase text-gray-900 border border-gray-300">
                          {getInitials(author?.full_name || author?.email)}
                        </div>
                      )
                    })()}
                  </div>
                ) : null}
                <div className="flex-1">
                  <div className="font-medium text-xs truncate">{thread.title || `Thread #${thread.id}`}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {latestMentions[Number(thread.id)]?.comment || <span className="italic">No comments yet</span>}
                  </div>
                  {contextLabelByThread?.[Number(thread.id)] ? (
                    <div className="mt-0.5 text-[11px] text-gray-500 truncate">
                      {contextLabelByThread[Number(thread.id)]}
                    </div>
                  ) : null}
                  {typeof (thread as any).mention_count === "number" ? (
                    <div className="mt-0.5 text-[11px] text-gray-500">
                      {(thread as any).mention_count} comments
                    </div>
                  ) : null}
                </div>
                {/* Inline avatars for participants */}
                <div className="flex items-center gap-1">
                  {(participantsByThread[Number(thread.id)] || []).slice(0, 5).map((user: User) => (
                    (() => {
                      const photoUrl = getImageUrl(user.photo || undefined)
                      return photoUrl ? (
                        <img
                          key={user.id}
                          src={photoUrl}
                          alt={user.full_name || user.email || "User"}
                          className="h-6 w-6 rounded-full border border-gray-300 object-cover"
                          title={user.full_name || user.email}
                        />
                      ) : (
                        <div
                          key={user.id}
                          className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold uppercase text-gray-900 border border-gray-300"
                          title={user.full_name || user.email}
                        >
                          {getInitials(user.full_name || user.email)}
                        </div>
                      )
                    })()
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
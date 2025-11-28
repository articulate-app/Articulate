"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog"
import { Loader2 } from "lucide-react"
import { format, isToday, isYesterday, differenceInDays } from "date-fns"
import type { UserDmThread } from "../../types/chat"

interface UserDmThreadHistoryModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: number
  activeThreadId?: number | null
  onSelectThread: (threadId: number) => void
}

/**
 * Format a date for display in thread history
 */
function formatThreadDate(dateString: string | null): string {
  if (!dateString) return "No messages"
  
  const date = new Date(dateString)
  
  if (isToday(date)) {
    return `Today, ${format(date, "HH:mm")}`
  } else if (isYesterday(date)) {
    return `Yesterday, ${format(date, "HH:mm")}`
  } else {
    const daysAgo = differenceInDays(new Date(), date)
    if (daysAgo < 7) {
      return `${daysAgo}d ago, ${format(date, "HH:mm")}`
    } else {
      return format(date, "MMM d, yyyy HH:mm")
    }
  }
}

export function UserDmThreadHistoryModal({
  open,
  onOpenChange,
  userId,
  activeThreadId,
  onSelectThread,
}: UserDmThreadHistoryModalProps) {
  const [threads, setThreads] = useState<UserDmThread[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open && userId) {
      loadThreads()
    }
  }, [open, userId])

  const loadThreads = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const { createClientComponentClient } = await import("@supabase/auth-helpers-nextjs")
      const supabase = createClientComponentClient()
      
      const { data, error: fetchError } = await supabase.rpc("fn_list_user_dm_threads_with_user", {
        p_user_id: userId,
      })

      if (fetchError) throw fetchError
      setThreads((data as UserDmThread[]) || [])
    } catch (err: any) {
      setError(err.message || "Failed to load threads")
    } finally {
      setIsLoading(false)
    }
  }

  const handleSelectThread = (threadId: number) => {
    onSelectThread(threadId)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Thread History</DialogTitle>
          <DialogDescription>
            Select a thread to open or continue chatting
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : error ? (
            <div className="text-sm text-red-600 py-4">{error}</div>
          ) : threads.length === 0 ? (
            <div className="text-sm text-gray-500 py-4 text-center">
              No threads found. Start a new conversation to create a thread.
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {threads.map((thread) => {
                const isActive = thread.id === activeThreadId
                return (
                  <button
                    key={thread.id}
                    onClick={() => handleSelectThread(thread.id)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      isActive
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-gray-900 truncate">
                          {thread.title || "Chat"}
                          {isActive && (
                            <span className="ml-2 text-xs text-blue-600">(Current)</span>
                          )}
                        </div>
                        {thread.last_comment && (
                          <div className="text-xs text-gray-500 truncate mt-1">
                            {thread.last_comment}
                          </div>
                        )}
                        {thread.last_message_at && (
                          <div className="text-xs text-gray-400 mt-1">
                            {formatThreadDate(thread.last_message_at)}
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}


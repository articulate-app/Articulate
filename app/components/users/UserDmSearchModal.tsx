"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog"
import { Input } from "../ui/input"
import { Loader2 } from "lucide-react"
import { format, isToday, isYesterday, differenceInDays } from "date-fns"
import { searchUserDmMentions } from "../../lib/services/users"
import type { UserDmSearchResult } from "../../types/chat"

interface UserDmSearchModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: number
  otherUserName: string
  onSelectResult: (result: UserDmSearchResult) => void
}

/**
 * Format a date for display in search results
 */
function formatResultDate(dateString: string): string {
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

/**
 * Highlight search term in text
 */
function highlightText(text: string, query: string): React.ReactNode {
  if (!query || !text) return text
  
  const parts = text.split(new RegExp(`(${query})`, 'gi'))
  return parts.map((part, index) => 
    part.toLowerCase() === query.toLowerCase() ? (
      <mark key={index} className="bg-yellow-200 font-medium">{part}</mark>
    ) : (
      part
    )
  )
}

export function UserDmSearchModal({
  open,
  onOpenChange,
  userId,
  otherUserName,
  onSelectResult,
}: UserDmSearchModalProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [results, setResults] = useState<UserDmSearchResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [debounceTimer, setDebounceTimer] = useState<NodeJS.Timeout | null>(null)

  // Reset when modal opens/closes
  useEffect(() => {
    if (!open) {
      setSearchTerm("")
      setResults([])
      setError(null)
      if (debounceTimer) {
        clearTimeout(debounceTimer)
        setDebounceTimer(null)
      }
    }
  }, [open, debounceTimer])

  const performSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setResults([])
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)
    try {
      const { data, error: searchError } = await searchUserDmMentions(userId, query, 50, 0)
      
      if (searchError) throw searchError
      setResults((data as UserDmSearchResult[]) || [])
    } catch (err: any) {
      setError(err.message || "Failed to search messages")
      setResults([])
    } finally {
      setIsLoading(false)
    }
  }, [userId])

  // Debounced search
  useEffect(() => {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
    }

    if (!searchTerm.trim()) {
      setResults([])
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    const timer = setTimeout(() => {
      performSearch(searchTerm)
    }, 300)

    setDebounceTimer(timer)

    return () => {
      if (timer) clearTimeout(timer)
    }
  }, [searchTerm, performSearch])

  const handleSelectResult = (result: UserDmSearchResult) => {
    onSelectResult(result)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Search messages with {otherUserName}</DialogTitle>
          <DialogDescription>
            Search across all DM threads with this user
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 flex flex-col min-h-0">
          <div>
            <Input
              placeholder="Search messages..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  if (searchTerm.trim()) {
                    performSearch(searchTerm)
                  }
                }
              }}
              autoFocus
            />
          </div>

          <div className="flex-1 overflow-y-auto min-h-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : error ? (
              <div className="text-sm text-red-600 py-4">{error}</div>
            ) : searchTerm.trim() && results.length === 0 ? (
              <div className="text-sm text-gray-500 py-4 text-center">
                No messages found matching "{searchTerm}"
              </div>
            ) : !searchTerm.trim() ? (
              <div className="text-sm text-gray-500 py-4 text-center">
                Enter a search term to find messages
              </div>
            ) : (
              <div className="space-y-2">
                {results.map((result) => (
                  <button
                    key={result.mention_id}
                    onClick={() => handleSelectResult(result)}
                    className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm text-gray-900">
                            {result.thread_title || "Chat"}
                          </span>
                          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                            Thread #{result.thread_id}
                          </span>
                        </div>
                        <div className="text-sm text-gray-700 mb-1 line-clamp-2">
                          {highlightText(result.comment, searchTerm)}
                        </div>
                        <div className="text-xs text-gray-400">
                          {formatResultDate(result.created_at)}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}


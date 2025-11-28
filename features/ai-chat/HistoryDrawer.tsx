"use client"

import React, { useState, useMemo } from "react"
import type { AiThread } from "./types"
import { useThreads, useRenameThread, useSoftDeleteThread } from "./hooks"
import { Search, Edit2, Trash2 } from "lucide-react"
import { format, isToday, isYesterday, differenceInDays } from "date-fns"
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuItem } from "../../components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogTitle, DialogFooter } from "../../components/ui/dialog"
import { Button } from "../../components/ui/button"

interface HistoryDropdownProps {
  onSelectThread: (thread: AiThread) => void
  activeThreadId?: string | null
}

export function HistoryDropdown({ onSelectThread, activeThreadId }: HistoryDropdownProps) {
  const { threads, isLoading } = useThreads()
  const renameThread = useRenameThread()
  const deleteThread = useSoftDeleteThread()
  const [searchQuery, setSearchQuery] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState("")
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [threadToDelete, setThreadToDelete] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const filteredThreads = useMemo(() => {
    if (!searchQuery) return threads
    return threads.filter(thread => 
      (thread.title || '').toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [threads, searchQuery])

  const groupedThreads = useMemo(() => {
    const groups: { [key: string]: AiThread[] } = {}
    
    filteredThreads.forEach(thread => {
      const date = new Date(thread.last_message_at || thread.created_at)
      let groupKey: string
      
      if (isToday(date)) {
        groupKey = 'Today'
      } else if (isYesterday(date)) {
        groupKey = 'Yesterday'
      } else {
        const daysAgo = differenceInDays(new Date(), date)
        if (daysAgo < 7) {
          groupKey = `${daysAgo}d ago`
        } else if (daysAgo < 30) {
          groupKey = `${Math.floor(daysAgo / 7)}w ago`
        } else {
          groupKey = format(date, 'MMM yyyy')
        }
      }
      
      if (!groups[groupKey]) groups[groupKey] = []
      groups[groupKey].push(thread)
    })
    
    return groups
  }, [filteredThreads])

  const handleRename = async (threadId: string, newTitle: string) => {
    try {
      await renameThread(threadId, newTitle)
      setEditingId(null)
      setEditTitle("")
    } catch (error) {
      console.error('Failed to rename thread:', error)
    }
  }

  const handleDeleteClick = (threadId: string) => {
    setThreadToDelete(threadId)
    setIsDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!threadToDelete) return
    
    setIsDeleting(true)
    try {
      await deleteThread(threadToDelete)
      setIsDeleteDialogOpen(false)
      setThreadToDelete(null)
    } catch (error) {
      console.error('Failed to delete thread:', error)
    } finally {
      setIsDeleting(false)
    }
  }

  const startEdit = (thread: AiThread) => {
    setEditingId(thread.id)
    setEditTitle(thread.title || '')
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="p-2 hover:bg-gray-100 rounded-md transition-colors" title="Chat History">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12,6 12,12 16,14"/>
          </svg>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80 p-0 max-h-96 flex flex-col">
        {/* Search */}
        <div className="p-3 border-b flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search chats..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {isLoading && (
            <div className="p-4 text-sm text-muted-foreground">Loading chats...</div>
          )}
          {!isLoading && Object.keys(groupedThreads).length === 0 && (
            <div className="p-4 text-sm text-muted-foreground">No chats found</div>
          )}
          
          {!isLoading && Object.entries(groupedThreads).map(([groupName, groupThreads]) => (
            <div key={groupName}>
              <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide bg-gray-50">
                {groupName}
              </div>
              {groupThreads.map((thread) => (
                <DropdownMenuItem
                  key={thread.id}
                  onClick={() => onSelectThread(thread)}
                  className={`group flex items-center justify-between px-3 py-2 ${
                    activeThreadId === thread.id ? 'bg-blue-50' : ''
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    {editingId === thread.id ? (
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleRename(thread.id, editTitle)
                          } else if (e.key === 'Escape') {
                            setEditingId(null)
                            setEditTitle("")
                          }
                        }}
                        onBlur={() => {
                          handleRename(thread.id, editTitle)
                        }}
                        className="w-full text-sm font-medium bg-transparent border-none outline-none"
                        autoFocus
                      />
                    ) : (
                      <>
                        <div className="text-sm font-medium truncate">{thread.title || 'Untitled'}</div>
                        <div className="text-xs text-muted-foreground capitalize">
                          {thread.scope} • {thread.visibility}
                        </div>
                      </>
                    )}
                  </div>
                  
                  {editingId !== thread.id && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          startEdit(thread)
                        }}
                        className="p-1 hover:bg-gray-200 rounded"
                        title="Rename"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteClick(thread.id)
                        }}
                        className="p-1 hover:bg-red-100 rounded text-red-600"
                        title="Delete"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </DropdownMenuItem>
              ))}
            </div>
          ))}
        </div>
      </DropdownMenuContent>
      
      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogTitle>Delete Chat</DialogTitle>
          <div className="py-2">Are you sure you want to delete this chat? This cannot be undone.</div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteConfirm} disabled={isDeleting}>
              {isDeleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DropdownMenu>
  )
}

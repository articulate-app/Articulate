"use client"

import React, { useMemo, useState, useEffect } from "react"
import type { AiScope, AiThread } from "./types"
import { ChatWindow } from "./ChatWindow"
import { HistoryDropdown } from "./HistoryDrawer"
import { ResizablePanel } from "../../app/components/ui/resizable-panel"
import { Plus, X, X as XIcon, MoreHorizontal, Edit2, Trash2, Maximize2, Copy, XCircle } from "lucide-react"
import { useCreateThread, useRenameThread, useSoftDeleteThread } from "./hooks"
import { getSupabaseBrowser } from "../../lib/supabase-browser"
import { useRouter, useSearchParams } from "next/navigation"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../app/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogTitle, DialogFooter } from "../../app/components/ui/dialog"
import { Button } from "../../app/components/ui/button"
import { toast } from "../../app/components/ui/use-toast"

interface AiPaneProps {
  isOpen: boolean
  onClose?: () => void
  initialScope?: AiScope
  projectId?: number
  taskId?: number
  inline?: boolean // New prop to render inline instead of as modal
  contentTypeTitle?: string // Content type context for AI generation
  activeChannelId?: number | null // Active channel ID for task context
}

export function AiPane({ isOpen, onClose, initialScope = 'global', projectId, taskId, inline = false, contentTypeTitle, activeChannelId }: AiPaneProps) {
  // Early return if not open to prevent unnecessary hook calls
  if (!isOpen) return null

  const [active, setActive] = useState<AiThread | null>(null)
  const [openTabs, setOpenTabs] = useState<AiThread[]>([])
  const [isCreating, setIsCreating] = useState(false)
  const [editingTabId, setEditingTabId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [threadToDelete, setThreadToDelete] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const createThread = useCreateThread()
  const renameThread = useRenameThread()
  const deleteThread = useSoftDeleteThread()
  const router = useRouter()
  const searchParams = useSearchParams()

  // Handle thread ID from URL parameters
  useEffect(() => {
    const threadId = searchParams.get('aiThreadId')
    if (threadId && isOpen) {
      // If there's a thread ID in the URL, load that thread
      if (!active || active.id !== threadId) {
        loadThread(threadId)
      }
    } else if (isOpen && !active && !isCreating && !threadId) {
      // Only create new chat if there's no threadId in URL
      handleNewChat()
    }
  }, [isOpen, active, isCreating, searchParams])
  
  // Load an existing thread
  const loadThread = async (threadId: string) => {
    if (isCreating) return
    
    setIsCreating(true)
    try {
      const supabase = getSupabaseBrowser()
      const { data, error } = await supabase
        .from('ai_threads')
        .select('*')
        .eq('id', threadId)
        .single()
      
      if (error) throw error
      
      if (data) {
        setActive(data as AiThread)
        // Add to tabs if not already there
        setOpenTabs(prev => {
          const exists = prev.some(tab => tab.id === data.id)
          return exists ? prev : [...prev, data as AiThread]
        })
      }
    } catch (error) {
      console.error('Failed to load thread:', error)
      toast({
        title: 'Failed to load thread',
        description: 'Could not load the AI thread',
        variant: 'destructive'
      })
    } finally {
      setIsCreating(false)
    }
  }

  // Update URL when active thread changes (only when pane is open)
  useEffect(() => {
    if (active && isOpen) {
      const currentParams = new URLSearchParams(searchParams.toString())
      currentParams.set('aiThreadId', active.id)
      const newUrl = currentParams.toString() ? `?${currentParams.toString()}` : ''
      router.replace(`/tasks${newUrl}`, { scroll: false })
    }
  }, [active, isOpen, router, searchParams])

  const handleNewChat = async () => {
    if (isCreating) return
    
    setIsCreating(true)
    try {
      const payload: Partial<AiThread> =
        initialScope === 'task' && taskId
          ? { scope: 'task', task_id: taskId, visibility: 'private' }
          : initialScope === 'project' && projectId
          ? { scope: 'project', project_id: projectId, visibility: 'private' }
          : { scope: 'global', visibility: 'private' }
      
      const newThread = await createThread(payload)
      setActive(newThread)
      // Add to tabs if not already there
      setOpenTabs(prev => {
        const exists = prev.some(tab => tab.id === newThread.id)
        return exists ? prev : [...prev, newThread]
      })
      
      // Auto-send message if content type is provided
      if (contentTypeTitle && newThread) {
        await sendAutoMessage(newThread.id, contentTypeTitle)
      }
    } catch (error) {
      console.error('Failed to create new chat:', error)
    } finally {
      setIsCreating(false)
    }
  }

  // Auto-send message for content type generation
  const sendAutoMessage = async (threadId: string, contentTypeTitle: string) => {
    try {
      const standardMessage = `Please create a ${contentTypeTitle.toLowerCase()} for this task. Use the task details and briefing to understand the context and requirements.`
      
      const session = (await getSupabaseBrowser().auth.getSession()).data.session
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ai-chat`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          thread_id: threadId, 
          message: standardMessage,
          attachments: [],
          active_channel_id: activeChannelId ?? undefined
        }),
      })
      
      if (!res.ok) {
        const errText = await res.text()
        throw new Error(errText)
      }
    } catch (error) {
      console.error('Failed to send auto message:', error)
    }
  }

  const handleSelectThread = (thread: AiThread) => {
    setActive(thread)
    // Add to tabs if not already there
    setOpenTabs(prev => {
      const exists = prev.some(tab => tab.id === thread.id)
      return exists ? prev : [...prev, thread]
    })
  }

  const handleCloseTab = (threadId: string) => {
    setOpenTabs(prev => prev.filter(tab => tab.id !== threadId))
    // If we're closing the active tab, switch to another tab or clear active
    if (active?.id === threadId) {
      const remainingTabs = openTabs.filter(tab => tab.id !== threadId)
      setActive(remainingTabs.length > 0 ? remainingTabs[remainingTabs.length - 1] : null)
    }
  }

  const handleStartEdit = (tab: AiThread) => {
    setEditingTabId(tab.id)
    setEditTitle(tab.title || '')
  }

  const handleRename = async (threadId: string) => {
    try {
      // Optimistically update the tab
      setOpenTabs(prev => prev.map(tab => 
        tab.id === threadId ? { ...tab, title: editTitle } : tab
      ))
      // Also update active if it's the same thread
      if (active?.id === threadId) {
        setActive(prev => prev ? { ...prev, title: editTitle } : null)
      }
      await renameThread(threadId, editTitle)
      setEditingTabId(null)
      setEditTitle('')
    } catch (error) {
      console.error('Failed to rename thread:', error)
      // Revert optimistic update on error
      const originalTab = openTabs.find(tab => tab.id === threadId)
      if (originalTab) {
        setOpenTabs(prev => prev.map(tab => 
          tab.id === threadId ? { ...tab, title: originalTab.title } : tab
        ))
        if (active?.id === threadId) {
          setActive(prev => prev ? { ...prev, title: originalTab.title } : null)
        }
      }
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
      // Remove from tabs and set new active
      setOpenTabs(prev => prev.filter(tab => tab.id !== threadToDelete))
      if (active?.id === threadToDelete) {
        const remainingTabs = openTabs.filter(tab => tab.id !== threadToDelete)
        setActive(remainingTabs.length > 0 ? remainingTabs[remainingTabs.length - 1] : null)
      }
      setIsDeleteDialogOpen(false)
      setThreadToDelete(null)
    } catch (error) {
      console.error('Failed to delete thread:', error)
    } finally {
      setIsDeleting(false)
    }
  }

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRename(editingTabId!)
    } else if (e.key === 'Escape') {
      setEditingTabId(null)
      setEditTitle('')
    }
  }

  const handleCloseAllTabs = () => {
    setOpenTabs([])
    setActive(null)
  }

  const handleCopyLink = () => {
    if (active) {
      const currentUrl = window.location.href
      const urlWithThread = new URL(currentUrl)
      urlWithThread.searchParams.set('aiThreadId', active.id)
      navigator.clipboard.writeText(urlWithThread.toString())
    }
  }

  // Inline mode - render without modal overlay
  if (inline) {
    return (
      <div className="h-full flex flex-col bg-white">
        {/* Simplified header with tabs on left, controls on right */}
        <div className="flex items-center justify-between p-3 border-b bg-white flex-shrink-0">
          {/* Left side: Tabs */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {openTabs.length > 0 && (
              <div className="flex border border-gray-200 rounded-md overflow-hidden">
                {openTabs.map((tab) => (
                  <div
                    key={tab.id}
                    className={`group flex items-center gap-1 px-3 py-1.5 cursor-pointer ${
                      active?.id === tab.id 
                        ? 'bg-blue-50 border-b-2 border-blue-500' 
                        : 'hover:bg-gray-50'
                    }`}
                    onClick={() => setActive(tab)}
                    onDoubleClick={() => handleStartEdit(tab)}
                  >
                    {editingTabId === tab.id ? (
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onKeyDown={handleTitleKeyDown}
                        onBlur={() => handleRename(tab.id)}
                        className="text-sm bg-transparent border-none outline-none px-1 py-0.5 border border-gray-300 rounded min-w-0 flex-1"
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <>
                        <span className="text-sm truncate max-w-20 flex-1" title={tab.title || 'Untitled'}>
                          {tab.title || 'Untitled'}
                        </span>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              onClick={(e) => e.stopPropagation()}
                              className="p-0.5 hover:bg-gray-200 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                              title="More options"
                            >
                              <MoreHorizontal className="w-3 h-3" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation()
                              handleStartEdit(tab)
                            }}>
                              <Edit2 className="w-3 h-3 mr-2" />
                              Rename
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDeleteClick(tab.id)
                              }}
                              className="text-red-600"
                            >
                              <Trash2 className="w-3 h-3 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleCloseTab(tab.id)
                          }}
                          className="p-0.5 hover:bg-gray-200 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Close tab"
                        >
                          <XIcon className="w-3 h-3" />
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          
          {/* Right side: Essential controls only */}
          <div className="flex items-center gap-2">
            <HistoryDropdown 
              onSelectThread={handleSelectThread}
              activeThreadId={active?.id}
            />
            <button
              onClick={handleNewChat}
              disabled={isCreating}
              className="p-2 hover:bg-gray-100 rounded-md transition-colors disabled:opacity-50"
              title="New Chat"
            >
              <Plus className="w-5 h-5" />
            </button>
            
            {/* More options menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="p-2 hover:bg-gray-100 rounded-md transition-colors"
                  title="More options"
                >
                  <MoreHorizontal className="w-5 h-5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleCloseAllTabs}>
                  <XCircle className="w-4 h-4 mr-2" />
                  Close all tabs
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleCopyLink} disabled={!active}>
                  <Copy className="w-4 h-4 mr-2" />
                  Copy link
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            
            <button
              className="p-2 hover:bg-gray-100 rounded-md transition-colors"
              title="Expand"
            >
              <Maximize2 className="w-5 h-5" />
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-md transition-colors"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
        
        {/* Main chat area */}
        <div className="flex-1 min-h-0">
            {active ? (
              <ChatWindow 
                thread={active} 
                taskId={taskId} 
                activeChannelId={activeChannelId}
                chatContext={{
                  componentId: searchParams.get('chatComponentId'),
                  briefingMode: searchParams.get('chatMode') === 'build_briefing',
                  preFillMessage: searchParams.get('chatPreFill') ? decodeURIComponent(searchParams.get('chatPreFill') || '') : undefined,
                  mode: (searchParams.get('chatMode') as "build_component" | "build_briefing") || null
                }}
              />
            ) : isCreating ? (
            <div className="h-full flex items-center justify-center text-muted-foreground">Creating new chat...</div>
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground">Loading...</div>
          )}
        </div>
        
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
      </div>
    )
  }

  // Modal mode - render with overlay
  return (
    <div className="fixed inset-0 z-50 bg-black/50" onClick={onClose}>
      <div 
        className="fixed right-0 top-0 h-full w-[600px] bg-white border-l border-gray-200 shadow-lg z-50 flex flex-col"
        onClick={(e) => e.stopPropagation()}
        style={{ width: '600px', minWidth: '600px', maxWidth: '600px' }}
      >
        <div className="h-full flex flex-col">
          {/* Simplified header with tabs on left, controls on right */}
          <div className="flex items-center justify-between p-3 border-b bg-white flex-shrink-0">
            {/* Left side: Tabs */}
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {openTabs.length > 0 && (
                <div className="flex border border-gray-200 rounded-md overflow-hidden">
                  {openTabs.map((tab) => (
                    <div
                      key={tab.id}
                      className={`group flex items-center gap-1 px-3 py-1.5 cursor-pointer ${
                        active?.id === tab.id 
                          ? 'bg-blue-50 border-b-2 border-blue-500' 
                          : 'hover:bg-gray-50'
                      }`}
                      onClick={() => setActive(tab)}
                      onDoubleClick={() => handleStartEdit(tab)}
                    >
                      {editingTabId === tab.id ? (
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onKeyDown={handleTitleKeyDown}
                          onBlur={() => handleRename(tab.id)}
                          className="text-sm bg-transparent border-none outline-none px-1 py-0.5 border border-gray-300 rounded min-w-0 flex-1"
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <>
                          <span className="text-sm truncate max-w-20 flex-1" title={tab.title || 'Untitled'}>
                            {tab.title || 'Untitled'}
                          </span>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                onClick={(e) => e.stopPropagation()}
                                className="p-0.5 hover:bg-gray-200 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                title="More options"
                              >
                                <MoreHorizontal className="w-3 h-3" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={(e) => {
                                e.stopPropagation()
                                handleStartEdit(tab)
                              }}>
                                <Edit2 className="w-3 h-3 mr-2" />
                                Rename
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleDeleteClick(tab.id)
                                }}
                                className="text-red-600"
                              >
                                <Trash2 className="w-3 h-3 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleCloseTab(tab.id)
                            }}
                            className="p-0.5 hover:bg-gray-200 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Close tab"
                          >
                            <XIcon className="w-3 h-3" />
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            {/* Right side: Essential controls only */}
            <div className="flex items-center gap-2">
              <HistoryDropdown 
                onSelectThread={handleSelectThread}
                activeThreadId={active?.id}
              />
              <button
                onClick={handleNewChat}
                disabled={isCreating}
                className="p-2 hover:bg-gray-100 rounded-md transition-colors disabled:opacity-50"
                title="New Chat"
              >
                <Plus className="w-5 h-5" />
              </button>
              
              {/* More options menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="p-2 hover:bg-gray-100 rounded-md transition-colors"
                    title="More options"
                  >
                    <MoreHorizontal className="w-5 h-5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleCloseAllTabs}>
                    <XCircle className="w-4 h-4 mr-2" />
                    Close all tabs
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleCopyLink} disabled={!active}>
                    <Copy className="w-4 h-4 mr-2" />
                    Copy link
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              
              <button
                className="p-2 hover:bg-gray-100 rounded-md transition-colors"
                title="Expand"
              >
                <Maximize2 className="w-5 h-5" />
              </button>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-md transition-colors"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          
          {/* Main chat area */}
          <div className="flex-1 min-h-0">
            {active ? (
              <ChatWindow thread={active} taskId={taskId} activeChannelId={activeChannelId} />
            ) : isCreating ? (
              <div className="h-full flex items-center justify-center text-muted-foreground">Creating new chat...</div>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground">Loading...</div>
            )}
          </div>
        </div>
      </div>
      
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
    </div>
  )
}



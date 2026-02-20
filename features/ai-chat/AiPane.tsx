"use client"

import React, { useMemo, useState, useEffect, useRef } from "react"
import type { AiScope, AiThread } from "./types"
import { ChatWindow } from "./ChatWindow"
import { HistoryDropdown } from "./HistoryDrawer"
import { ResizablePanel } from "../../app/components/ui/resizable-panel"
import { Plus, X, X as XIcon, MoreHorizontal, Edit2, Trash2, Maximize2, Copy, XCircle } from "lucide-react"
import { useCreateThread, useRenameThread, useSoftDeleteThread } from "./hooks"
import { getSupabaseBrowser } from "../../lib/supabase-browser"
import { useRouter, useSearchParams } from "next/navigation"
import { ensureProjectThread, ensureGlobalThread } from "./ai-utils"
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
  const isUpdatingFromStateRef = useRef(false)
  const previousActiveIdRef = useRef<string | null>(null)

  // Handle thread ID from URL parameters
  useEffect(() => {
    // Skip if we're currently updating the URL from state changes
    if (isUpdatingFromStateRef.current) {
      return
    }

    const threadId = searchParams.get('aiThreadId')
    
    if (threadId && isOpen) {
      // Check if this thread is already in open tabs (might be a closed tab)
      const isInOpenTabs = openTabs.some(tab => tab.id === threadId)
      
      // If there's a thread ID in the URL, load that thread
      // Only load if it's different from the current active thread and not already in tabs
      if ((!active || active.id !== threadId) && !isInOpenTabs) {
        loadThread(threadId)
      } else if (isInOpenTabs && (!active || active.id !== threadId)) {
        // Thread is in tabs but not active, just switch to it
        const tab = openTabs.find(tab => tab.id === threadId)
        if (tab) {
          isUpdatingFromStateRef.current = true
          previousActiveIdRef.current = tab.id
          setActive(tab)
          requestAnimationFrame(() => {
            isUpdatingFromStateRef.current = false
          })
        }
      }
    } else if (isOpen && !active && !isCreating && !threadId) {
      // For project/global scope, try to load existing thread first
      if (initialScope === 'project' && projectId) {
        loadProjectThread()
      } else if (initialScope === 'global') {
        loadGlobalThread()
      } else {
        // For task scope or other cases, create new chat
        handleNewChat()
      }
    }
  }, [isOpen, active, isCreating, searchParams, openTabs, initialScope, projectId])
  
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
        // Set flag before updating active to prevent URL effect loop
        isUpdatingFromStateRef.current = true
        previousActiveIdRef.current = data.id
        
        setActive(data as AiThread)
        // Add to tabs if not already there
        setOpenTabs(prev => {
          const exists = prev.some(tab => tab.id === data.id)
          return exists ? prev : [...prev, data as AiThread]
        })
        
        // Reset flag after state update
        requestAnimationFrame(() => {
          isUpdatingFromStateRef.current = false
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

  // Load or create project thread
  const loadProjectThread = async () => {
    if (isCreating || !projectId) return
    
    setIsCreating(true)
    try {
      const threadId = await ensureProjectThread(projectId)
      await loadThread(threadId)
    } catch (error) {
      console.error('Failed to load project thread:', error)
      toast({
        title: 'Failed to load project chat',
        description: 'Could not load the project AI thread',
        variant: 'destructive'
      })
    } finally {
      setIsCreating(false)
    }
  }

  // Load or create global thread
  const loadGlobalThread = async () => {
    if (isCreating) return
    
    setIsCreating(true)
    try {
      const threadId = await ensureGlobalThread()
      await loadThread(threadId)
    } catch (error) {
      console.error('Failed to load global thread:', error)
      toast({
        title: 'Failed to load global chat',
        description: 'Could not load the global AI thread',
        variant: 'destructive'
      })
    } finally {
      setIsCreating(false)
    }
  }

  // Update URL when active thread changes (only when pane is open)
  useEffect(() => {
    if (active && isOpen) {
      // Skip if we're already updating from a state change
      if (isUpdatingFromStateRef.current && previousActiveIdRef.current === active.id) {
        return
      }
      
      const currentThreadId = searchParams.get('aiThreadId')
      // Only update URL if it's different from current active thread
      // This prevents loops while still keeping URL in sync
      if (currentThreadId !== active.id) {
        isUpdatingFromStateRef.current = true
        previousActiveIdRef.current = active.id
        
        const currentParams = new URLSearchParams(searchParams.toString())
        currentParams.set('aiThreadId', active.id)
        const newUrl = currentParams.toString() ? `?${currentParams.toString()}` : ''
        router.replace(`/tasks${newUrl}`, { scroll: false })
        
        // Reset flag after router update completes
        // Use requestAnimationFrame for immediate next frame, minimal delay
        requestAnimationFrame(() => {
          isUpdatingFromStateRef.current = false
        })
      } else {
        // URL is already in sync, just update the ref
        previousActiveIdRef.current = active.id
      }
    }
  }, [active?.id, isOpen, router])

  const handleNewChat = async () => {
    if (isCreating) return
    
    setIsCreating(true)
    
    // Create optimistic thread immediately for instant UI feedback
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const scope = initialScope === 'task' && taskId
      ? 'task' as const
      : initialScope === 'project' && projectId
      ? 'project' as const
      : 'global' as const
    
    const optimisticThread: AiThread = {
      id: tempId,
      scope,
      visibility: 'private',
      is_collaborative: scope !== 'global',
      title: scope === 'task' ? 'Task AI Assistant' : scope === 'project' ? 'Project chat' : 'New chat',
      created_at: new Date().toISOString(),
      last_message_at: null,
      is_deleted: false,
      ...(scope === 'task' && taskId ? { task_id: taskId } : {}),
      ...(scope === 'project' && projectId ? { project_id: projectId } : {}),
    }
    
    // Set flag before updating active to prevent URL effect loop
    isUpdatingFromStateRef.current = true
    previousActiveIdRef.current = optimisticThread.id
    
    // Add optimistic thread to tabs and set as active immediately
    setActive(optimisticThread)
    setOpenTabs(prev => {
      const exists = prev.some(tab => tab.id === optimisticThread.id)
      return exists ? prev : [...prev, optimisticThread]
    })
    
    // Reset flag after state update
    requestAnimationFrame(() => {
      isUpdatingFromStateRef.current = false
    })
    
    try {
      // Create real thread in the background
      const payload: Partial<AiThread> =
        initialScope === 'task' && taskId
          ? { scope: 'task', task_id: taskId, visibility: 'private' }
          : initialScope === 'project' && projectId
          ? { scope: 'project', project_id: projectId, visibility: 'private' }
          : { scope: 'global', visibility: 'private' }
      
      const newThread = await createThread(payload)
      
      // Replace optimistic thread with real thread
      isUpdatingFromStateRef.current = true
      previousActiveIdRef.current = newThread.id
      
      setActive(newThread)
      setOpenTabs(prev => prev.map(tab => 
        tab.id === tempId ? newThread : tab
      ))
      
      // Reset flag after state update
      requestAnimationFrame(() => {
        isUpdatingFromStateRef.current = false
      })
      
      // Auto-send message if content type is provided
      if (contentTypeTitle && newThread) {
        await sendAutoMessage(newThread.id, contentTypeTitle)
      }
    } catch (error) {
      console.error('Failed to create new chat:', error)
      // On error, remove the optimistic thread
      setOpenTabs(prev => prev.filter(tab => tab.id !== tempId))
      if (active?.id === tempId) {
        const remainingTabs = openTabs.filter(tab => tab.id !== tempId)
        setActive(remainingTabs.length > 0 ? remainingTabs[remainingTabs.length - 1] : null)
      }
      toast({
        title: 'Failed to create chat',
        description: 'Could not create a new chat thread',
        variant: 'destructive'
      })
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
    // Set flag before updating to prevent URL effect from triggering load
    isUpdatingFromStateRef.current = true
    previousActiveIdRef.current = thread.id
    
    // Update URL directly when selecting a thread to avoid race conditions
    const currentParams = new URLSearchParams(searchParams.toString())
    currentParams.set('aiThreadId', thread.id)
    const newUrl = currentParams.toString() ? `?${currentParams.toString()}` : ''
    router.replace(`/tasks${newUrl}`, { scroll: false })
    
    setActive(thread)
    // Add to tabs if not already there
    setOpenTabs(prev => {
      const exists = prev.some(tab => tab.id === thread.id)
      return exists ? prev : [...prev, thread]
    })
    
    // Reset flag after a brief delay
    requestAnimationFrame(() => {
      setTimeout(() => {
        isUpdatingFromStateRef.current = false
      }, 0)
    })
  }

  const handleTabClick = (tab: AiThread) => {
    // Set flag and previous ID before updating
    isUpdatingFromStateRef.current = true
    previousActiveIdRef.current = tab.id
    setActive(tab)
    
    // Reset flag after state update
    requestAnimationFrame(() => {
      setTimeout(() => {
        isUpdatingFromStateRef.current = false
      }, 0)
    })
  }

  const handleCloseTab = (threadId: string) => {
    // Check if we're closing the active tab
    const isClosingActive = active?.id === threadId
    
    // Calculate updated tabs
    const updatedTabs = openTabs.filter(tab => tab.id !== threadId)
    
    // Update tabs first
    setOpenTabs(updatedTabs)
    
    // If we're closing the active tab, switch to another or clear
    if (isClosingActive) {
      const newActive = updatedTabs.length > 0 ? updatedTabs[updatedTabs.length - 1] : null
      
      // Set flag to prevent URL effect from triggering load of the closed thread
      isUpdatingFromStateRef.current = true
      
      if (newActive) {
        previousActiveIdRef.current = newActive.id
        
        // Update URL to the new active tab
        const currentParams = new URLSearchParams(searchParams.toString())
        currentParams.set('aiThreadId', newActive.id)
        const newUrl = currentParams.toString() ? `?${currentParams.toString()}` : ''
        router.replace(`/tasks${newUrl}`, { scroll: false })
        
        setActive(newActive)
      } else {
        previousActiveIdRef.current = null
        
        // No tabs left, remove thread ID from URL
        const currentParams = new URLSearchParams(searchParams.toString())
        currentParams.delete('aiThreadId')
        const newUrl = currentParams.toString() ? `?${currentParams.toString()}` : ''
        router.replace(`/tasks${newUrl}`, { scroll: false })
        
        setActive(null)
      }
      
      // Reset flag after state update
      requestAnimationFrame(() => {
        isUpdatingFromStateRef.current = false
      })
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
                    onClick={() => handleTabClick(tab)}
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
                activeChannelId={
                  searchParams.get('activeChannelId') 
                    ? Number(searchParams.get('activeChannelId')) 
                    : activeChannelId
                }
                chatContext={{
                  componentId: searchParams.get('chatComponentId'),
                  briefingMode: searchParams.get('chatMode') === 'build_briefing',
                  preFillMessage: searchParams.get('chatPreFill') ? decodeURIComponent(searchParams.get('chatPreFill') || '') : undefined,
                  mode: (searchParams.get('chatMode') as "build_component" | "build_briefing") || null,
                  autoRun: searchParams.get('chatAutoRun') === 'true' // Default to false - only true if explicitly set
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
                      onClick={() => handleTabClick(tab)}
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



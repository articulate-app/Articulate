"use client"

import React, { useMemo, useState, useEffect, useRef, useCallback } from "react"
import type { AiScope, AiThread } from "./types"
import { ChatWindow } from "./ChatWindow"
import { HistoryDropdown } from "./HistoryDrawer"
import { ResizablePanel } from "../../app/components/ui/resizable-panel"
import { Plus, X, X as XIcon, MoreHorizontal, Edit2, Trash2, Maximize2, Minimize2, Copy, XCircle } from "lucide-react"
import { useCreateThread, useRenameThread, useSoftDeleteThread } from "./hooks"
import { getSupabaseBrowser } from "../../lib/supabase-browser"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { TASKS_SHALLOW_NAV_EVENT } from "../../app/lib/tasks-shallow-nav"
import { ensureProjectThread, ensureGlobalThread } from "./ai-utils"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../app/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogTitle, DialogFooter } from "../../app/components/ui/dialog"
import { Button } from "../../app/components/ui/button"
import { toast } from "../../app/components/ui/use-toast"
import { COMPACT_PANE_HEADER_ROW_CLASS } from "../../app/components/tasks/pane-header-tokens"
import { useQueryClient } from "@tanstack/react-query"
import { invokeEdgeFunctionFetch } from "@/lib/edge-functions"
import { resolveAutoThreadSelection } from "./thread-selection-guards"
import { logAiChatDebug } from "./debug"
import { AI_PANE_TAB_STRIP_CLASS } from "./tab-strip-tokens"
import { toPersistedAiThreadId } from "./thread-id"
import type { AiActiveFieldContext } from "./active-field-context"

interface AiPaneProps {
  isOpen: boolean
  onClose?: () => void
  /** Widen/focus the inline AI panel (tasks layout). */
  onExpand?: () => void
  initialScope?: AiScope
  projectId?: number
  taskId?: number
  inline?: boolean // New prop to render inline instead of as modal
  contentTypeTitle?: string // Content type context for AI generation
  activeChannelId?: number | null // Active channel ID for task context
  activeFieldContext?: AiActiveFieldContext
  externalThreadId?: string | null
  disableUrlSync?: boolean
  isExpanded?: boolean
  forceNewThread?: boolean
  onForceNewThreadConsumed?: () => void
}

function useSyncedTasksSearchParams(nextSearch: ReturnType<typeof useSearchParams>) {
  const [shallowSearch, setShallowSearch] = useState<string | null>(null)
  useEffect(() => {
    const onShallow = () => setShallowSearch(window.location.search.replace(/^\?/, ""))
    window.addEventListener(TASKS_SHALLOW_NAV_EVENT, onShallow)
    return () => window.removeEventListener(TASKS_SHALLOW_NAV_EVENT, onShallow)
  }, [])
  useEffect(() => {
    if (shallowSearch === null) return
    if (shallowSearch === nextSearch.toString()) setShallowSearch(null)
  }, [nextSearch, shallowSearch])
  return useMemo(() => {
    if (shallowSearch !== null) return new URLSearchParams(shallowSearch)
    return new URLSearchParams(nextSearch.toString())
  }, [shallowSearch, nextSearch])
}

type AiPaneTabStripProps = {
  openTabs: AiThread[]
  active: AiThread | null
  optimisticTab: OptimisticThreadTab | null
  activeOptimisticId: string | null
  displayTitleByThreadId?: Record<string, string>
  editingTabId: string | null
  editTitle: string
  setEditTitle: (value: string) => void
  onTabClick: (tab: AiThread) => void
  onStartEdit: (tab: AiThread) => void
  onRename: (threadId: string) => void
  onTitleKeyDown: (e: React.KeyboardEvent) => void
  onCloseTab: (threadId: string) => void
  onDeleteClick: (threadId: string) => void
}

type OptimisticThreadTab = {
  optimisticId: string
  scope: AiScope
  title: string | null
  created_at: string
}

type AiPaneTab = AiThread | OptimisticThreadTab

function isOptimisticThreadTab(tab: AiPaneTab): tab is OptimisticThreadTab {
  return "optimisticId" in tab
}

function AiPaneTabStrip({
  openTabs,
  active,
  optimisticTab,
  activeOptimisticId,
  displayTitleByThreadId,
  editingTabId,
  editTitle,
  setEditTitle,
  onTabClick,
  onStartEdit,
  onRename,
  onTitleKeyDown,
  onCloseTab,
  onDeleteClick,
}: AiPaneTabStripProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const allTabs = useMemo<AiPaneTab[]>(() => {
    if (!optimisticTab) return openTabs
    return [...openTabs, optimisticTab]
  }, [openTabs, optimisticTab])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return
      let deltaX = e.deltaX
      let deltaY = e.deltaY
      if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) {
        deltaX *= 16
        deltaY *= 16
      } else if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
        deltaX *= el.clientWidth
        deltaY *= el.clientHeight
      }
      const delta = e.shiftKey
        ? deltaY
        : Math.abs(deltaX) > Math.abs(deltaY)
          ? deltaX
          : deltaY
      if (delta === 0) return
      e.preventDefault()
      el.scrollLeft += delta
    }
    el.addEventListener('wheel', onWheel, { passive: false, capture: true })
    return () => el.removeEventListener('wheel', onWheel, true)
  }, [allTabs.length])

  if (allTabs.length === 0) return null

  return (
    <div
      ref={scrollRef}
      className="ai-chat-tabs-scroll min-h-0 min-w-0 flex-1 self-stretch overflow-x-auto overflow-y-hidden"
    >
      <div className={AI_PANE_TAB_STRIP_CLASS}>
        {allTabs.map((tab) => {
          const isOptimistic = isOptimisticThreadTab(tab)
          const tabId = isOptimistic ? tab.optimisticId : tab.id
          const isActive = isOptimistic
            ? activeOptimisticId === tab.optimisticId
            : active?.id === tab.id
          return (
          <div
            key={isOptimistic ? `optimistic-${tab.optimisticId}` : tab.id}
            className={`flex h-full min-h-14 shrink-0 cursor-pointer self-stretch border-r border-gray-200 bg-white ${
              isActive
                ? 'font-semibold text-gray-900'
                : 'font-normal text-gray-600'
            }`}
            onClick={() => {
              if (isOptimistic) return
              onTabClick(tab)
            }}
            onDoubleClick={() => {
              if (isOptimistic) return
              onStartEdit(tab)
            }}
          >
            <div className="flex h-full min-h-0 min-w-0 flex-1 items-center gap-1 px-3">
              {editingTabId === tabId && !isOptimistic ? (
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onKeyDown={onTitleKeyDown}
                  onBlur={() => onRename(tabId)}
                  className="text-sm bg-transparent border-none outline-none px-1 py-0.5 border border-gray-300 rounded min-w-0 flex-1"
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <>
                  {(() => {
                    const persistedDisplayTitle = isOptimistic
                      ? null
                      : displayTitleByThreadId?.[tab.id]
                    const displayTitle = persistedDisplayTitle ?? tab.title
                    const fallbackTitle = isOptimistic ? "Creating chat..." : "New chat"
                    return (
                      <span
                        className="text-sm truncate max-w-20 flex-1"
                        title={displayTitle || fallbackTitle}
                      >
                        {displayTitle || fallbackTitle}
                      </span>
                    )
                  })()}
                  {!isOptimistic ? (
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        onClick={(e) => e.stopPropagation()}
                        className="p-0.5 rounded text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                        title="More options"
                      >
                        <MoreHorizontal className="w-3 h-3" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation()
                          onStartEdit(tab)
                        }}
                      >
                        <Edit2 className="w-3 h-3 mr-2" />
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation()
                          onDeleteClick(tab.id)
                        }}
                        className="text-red-600"
                      >
                        <Trash2 className="w-3 h-3 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  ) : null}
                  {!isOptimistic ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onCloseTab(tabId)
                    }}
                    className="p-0.5 rounded text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                    title="Close tab"
                  >
                    <XIcon className="w-3 h-3" />
                  </button>
                  ) : null}
                </>
              )}
            </div>
          </div>
        )})}
      </div>
    </div>
  )
}

export function AiPane(props: AiPaneProps) {
  if (!props.isOpen) return null
  return <AiPaneInner {...props} />
}

function AiPaneInner({ isOpen, onClose, onExpand, initialScope = 'global', projectId, taskId, inline = false, contentTypeTitle, activeChannelId, activeFieldContext, externalThreadId, disableUrlSync = false, isExpanded = false, forceNewThread = false, onForceNewThreadConsumed }: AiPaneProps) {
  const pathname = usePathname()
  const nextSearchParams = useSearchParams()
  const searchParams = useSyncedTasksSearchParams(nextSearchParams)

  const [active, setActive] = useState<AiThread | null>(null)
  const [openTabs, setOpenTabs] = useState<AiThread[]>([])
  const [optimisticTab, setOptimisticTab] = useState<OptimisticThreadTab | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [editingTabId, setEditingTabId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [threadToDelete, setThreadToDelete] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [scopeOverride, setScopeOverride] = useState<{ scope: AiScope; projectId?: number | null } | null>(null)
  const [streamingThreadTitlesById, setStreamingThreadTitlesById] = useState<Record<string, string>>({})
  const createThread = useCreateThread()
  const renameThread = useRenameThread()
  const deleteThread = useSoftDeleteThread()
  const queryClient = useQueryClient()
  const router = useRouter()
  const isUpdatingFromStateRef = useRef(false)
  const previousActiveIdRef = useRef<string | null>(null)
  const bootstrapScopeReadyRef = useRef(false)
  const didAutoBootstrapRef = useRef(false)
  const effectiveScope: AiScope = scopeOverride?.scope ?? initialScope
  const effectiveProjectId = scopeOverride?.scope === 'project'
    ? (scopeOverride.projectId ?? null)
    : (effectiveScope === 'project' ? (projectId ?? null) : null)
  const effectiveTaskId = effectiveScope === 'task' ? taskId : undefined
  const resolvedActiveChannelId = useMemo(() => {
    const fromUrl = searchParams.get("activeChannelId")
    if (fromUrl && Number.isFinite(Number(fromUrl))) return Number(fromUrl)
    if (activeFieldContext?.channelId != null && Number.isFinite(activeFieldContext.channelId)) {
      return activeFieldContext.channelId
    }
    return activeChannelId ?? null
  }, [searchParams, activeFieldContext?.channelId, activeChannelId])
  const navigateToThreadId = useCallback(
    (threadId: string | null, reason: string) => {
      if (disableUrlSync) return
      const currentParams = new URLSearchParams(searchParams.toString())
      if (threadId) {
        currentParams.set("aiThreadId", threadId)
      } else {
        currentParams.delete("aiThreadId")
      }
      const newUrl = currentParams.toString() ? `?${currentParams.toString()}` : ""
      logAiChatDebug("router.replace", { reason, threadId, url: `${pathname}${newUrl}` })
      router.replace(`${pathname}${newUrl}`, { scroll: false })
    },
    [disableUrlSync, pathname, router, searchParams]
  )
  const clearThreadFromUrl = useCallback(() => {
    navigateToThreadId(null, "clearThreadFromUrl")
  }, [navigateToThreadId])
  const clearOptimisticThread = useCallback(() => {
    setOptimisticTab(null)
  }, [])

  const updateThreadTitleLocalState = useCallback((threadId: string, title: string) => {
    setOpenTabs((prev) => prev.map((tab) => (tab.id === threadId ? { ...tab, title } : tab)))
    setActive((prev) => (prev?.id === threadId ? { ...prev, title } : prev))
  }, [])

  const handleThreadTitlePreview = useCallback((threadId: string, title: string | null) => {
    setStreamingThreadTitlesById((prev) => {
      if (!title || title.trim().length === 0) {
        if (!(threadId in prev)) return prev
        const next = { ...prev }
        delete next[threadId]
        return next
      }
      return { ...prev, [threadId]: title }
    })
  }, [])

  const handleThreadTitlePersist = useCallback(
    (threadId: string, title: string) => {
      const normalizedTitle = title.trim()
      if (!normalizedTitle) return
      updateThreadTitleLocalState(threadId, normalizedTitle)
      setStreamingThreadTitlesById((prev) => {
        if (!(threadId in prev)) return prev
        const next = { ...prev }
        delete next[threadId]
        return next
      })
      queryClient.setQueryData(['ai-threads'], (old: AiThread[] | undefined) => {
        if (!Array.isArray(old)) return old
        return old.map((thread) => (thread.id === threadId ? { ...thread, title: normalizedTitle } : thread))
      })
    },
    [queryClient, updateThreadTitleLocalState]
  )

  const handleScopeModeChange = useCallback((scope: "task" | "global" | "project", projectScopeId?: number | null) => {
    setScopeOverride(scope === 'task' ? null : { scope, projectId: projectScopeId ?? null })
    setOpenTabs([])
    setActive(null)
    clearOptimisticThread()
    setStreamingThreadTitlesById({})
    clearThreadFromUrl()
  }, [clearOptimisticThread, clearThreadFromUrl])

  // Handle thread ID from URL parameters
  useEffect(() => {
    // Skip if we're currently updating the URL from state changes
    if (isUpdatingFromStateRef.current) {
      return
    }

    if (forceNewThread && isOpen && !active && !isCreating) {
      logAiChatDebug("thread.force-new.consume", { source: "url-flag" })
      onForceNewThreadConsumed?.()
      handleNewChat()
      return
    }

    const windowParams =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search)
        : null
    const urlRequestedThreadId = toPersistedAiThreadId(
      windowParams?.get("aiThreadId") ??
      searchParams.get("aiThreadId") ??
      null
    )
    const rightView = windowParams?.get("rightView") ?? searchParams.get("rightView")
    const taskAiOpen = (windowParams?.get("taskAiOpen") ?? searchParams.get("taskAiOpen")) === "true"
    const isAiPaneMode = rightView === "ai" && taskAiOpen
    const shouldCreateThread = isAiPaneMode && !urlRequestedThreadId && !externalThreadId
    const selectionResolution = resolveAutoThreadSelection({
      isOpen,
      isCreating,
      activeThreadId: active?.id ?? null,
      externalRequestedThreadId: toPersistedAiThreadId(externalThreadId),
      urlRequestedThreadId,
      disableUrlSync,
      openTabIds: openTabs.map((tab) => tab.id),
    })

    if (selectionResolution.type === "none") return

    if (selectionResolution.type === "load-requested-thread") {
      logAiChatDebug("thread.auto-select.load", {
        source: selectionResolution.source,
        threadId: selectionResolution.threadId,
        activeThreadId: active?.id ?? null,
      })
      loadThread(selectionResolution.threadId)
      return
    }

    if (selectionResolution.type === "activate-requested-open-tab") {
      logAiChatDebug("thread.auto-select.activate-open-tab", {
        source: selectionResolution.source,
        threadId: selectionResolution.threadId,
        activeThreadId: active?.id ?? null,
      })
      const tab = openTabs.find((candidate) => candidate.id === selectionResolution.threadId)
      if (!tab) return
      isUpdatingFromStateRef.current = true
      previousActiveIdRef.current = tab.id
      setActive(tab)
      requestAnimationFrame(() => {
        isUpdatingFromStateRef.current = false
      })
      return
    }

    if (!isAiPaneMode) {
      didAutoBootstrapRef.current = false
      return
    }

    if (!shouldCreateThread) {
      didAutoBootstrapRef.current = false
      return
    }

    // Prevent accidental bootstrap on transient param lag during route transitions.
    // We allow bootstrap only after one settled pass with no requested thread.
    if (!bootstrapScopeReadyRef.current) {
      bootstrapScopeReadyRef.current = true
      return
    }

    if (didAutoBootstrapRef.current) return
    didAutoBootstrapRef.current = true

    // For project/global scope, try to load existing thread first.
    if (effectiveScope === 'project' && effectiveProjectId) {
      loadProjectThread()
    } else if (effectiveScope === 'global') {
      loadGlobalThread()
    } else {
      // For task scope or other cases, create new chat.
      handleNewChat()
    }
  }, [isOpen, active?.id, isCreating, searchParams, openTabs, effectiveScope, effectiveProjectId, externalThreadId, disableUrlSync, forceNewThread, onForceNewThreadConsumed])

  useEffect(() => {
    if (!isOpen) {
      bootstrapScopeReadyRef.current = false
      didAutoBootstrapRef.current = false
    }
  }, [isOpen])
  
  // Load an existing thread
  const loadThread = async (threadId: string) => {
    if (isCreating) return
    const persistedThreadId = toPersistedAiThreadId(threadId)
    if (!persistedThreadId) {
      logAiChatDebug("thread.load.skip-invalid-id", { threadId })
      return
    }
    
    setIsCreating(true)
    try {
      const supabase = getSupabaseBrowser()
      const { data, error } = await supabase
        .from('ai_threads')
        .select('*')
        .eq('id', persistedThreadId)
        .single()
      
      if (error) throw error
      
      if (data) {
        // Set flag before updating active to prevent URL effect loop
        isUpdatingFromStateRef.current = true
        previousActiveIdRef.current = data.id
        
        clearOptimisticThread()
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
    if (isCreating || !effectiveProjectId) return
    
    setIsCreating(true)
    try {
      const threadId = await ensureProjectThread(effectiveProjectId)
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
    if (disableUrlSync) return
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
        navigateToThreadId(active.id, "active-thread-effect")
        
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
  }, [active?.id, disableUrlSync, isOpen, searchParams, navigateToThreadId])

  const handleNewChat = async () => {
    if (isCreating) return
    
    setIsCreating(true)
    const previousActive = active
    
    // Keep optimistic identifier local-only. Never use it as ai_threads.id.
    const optimisticId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
    const scope = effectiveScope === 'task' && effectiveTaskId
      ? 'task' as const
      : effectiveScope === 'project' && effectiveProjectId
      ? 'project' as const
      : 'global' as const

    const nextOptimisticTab: OptimisticThreadTab = {
      optimisticId,
      scope,
      title: null,
      created_at: new Date().toISOString(),
    }
    
    // Show optimistic tab immediately while waiting for persistence.
    isUpdatingFromStateRef.current = true
    previousActiveIdRef.current = null
    setOptimisticTab(nextOptimisticTab)
    setActive(null)
    navigateToThreadId(null, "new-chat-optimistic")
    
    // Reset flag after state update
    requestAnimationFrame(() => {
      isUpdatingFromStateRef.current = false
    })
    
    try {
      // Create real thread in the background
      const payload: Partial<AiThread> =
        effectiveScope === 'task' && effectiveTaskId
          ? { scope: 'task', task_id: effectiveTaskId, visibility: 'private' }
          : effectiveScope === 'project' && effectiveProjectId
          ? { scope: 'project', project_id: effectiveProjectId, visibility: 'private' }
          : { scope: 'global', visibility: 'private' }
      
      const newThread = await createThread(payload)
      
      // Replace optimistic tab with the persisted thread UUID from Supabase.
      isUpdatingFromStateRef.current = true
      previousActiveIdRef.current = newThread.id
      
      clearOptimisticThread()
      setActive(newThread)
      navigateToThreadId(newThread.id, "new-chat-created")
      setOpenTabs(prev => {
        if (prev.some((tab) => tab.id === newThread.id)) return prev
        return [...prev, newThread]
      })
      
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
      clearOptimisticThread()
      setActive(previousActive)
      navigateToThreadId(previousActive?.id ?? null, "new-chat-create-failed")
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
      
      const supabase = getSupabaseBrowser()
      const res = await invokeEdgeFunctionFetch({
        supabase,
        url: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ai-chat`,
        debugLabel: "ai-chat",
        init: {
          method: 'POST',
          body: JSON.stringify({
            thread_id: threadId,
            message: standardMessage,
            attachments: [],
            active_channel_id: activeChannelId ?? undefined
          }),
        },
        headers: {
          'Content-Type': 'application/json',
        },
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
    clearOptimisticThread()
    logAiChatDebug("thread.select.history", {
      nextThreadId: thread.id,
      previousThreadId: active?.id ?? null,
    })
    // Set flag before updating to prevent URL effect from triggering load
    isUpdatingFromStateRef.current = true
    previousActiveIdRef.current = thread.id
    
    // Update URL directly when selecting a thread to avoid race conditions
    navigateToThreadId(thread.id, "history-dropdown-select")
    
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
    clearOptimisticThread()
    logAiChatDebug("thread.select.tab-click", {
      nextThreadId: tab.id,
      previousThreadId: active?.id ?? null,
    })
    // Set flag and previous ID before updating
    isUpdatingFromStateRef.current = true
    previousActiveIdRef.current = tab.id
    navigateToThreadId(tab.id, "tab-click")
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
    setStreamingThreadTitlesById((prev) => {
      if (!(threadId in prev)) return prev
      const next = { ...prev }
      delete next[threadId]
      return next
    })
    
    // If we're closing the active tab, switch to another or clear
    if (isClosingActive) {
      const newActive = updatedTabs.length > 0 ? updatedTabs[updatedTabs.length - 1] : null
      
      // Set flag to prevent URL effect from triggering load of the closed thread
      isUpdatingFromStateRef.current = true
      
      if (newActive) {
        previousActiveIdRef.current = newActive.id
        navigateToThreadId(newActive.id, "close-tab-select-fallback")
        
        setActive(newActive)
      } else {
        previousActiveIdRef.current = null
        navigateToThreadId(null, "close-tab-clear-selection")
        
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
      setStreamingThreadTitlesById((prev) => {
        if (!threadToDelete || !(threadToDelete in prev)) return prev
        const next = { ...prev }
        delete next[threadToDelete]
        return next
      })
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
    logAiChatDebug("thread.close-all-tabs", { previousActiveThreadId: active?.id ?? null })
    setOpenTabs([])
    setActive(null)
    clearOptimisticThread()
    setStreamingThreadTitlesById({})
    navigateToThreadId(null, "close-all-tabs")
  }

  const handleCopyLink = () => {
    if (active) {
      const currentUrl = window.location.href
      const urlWithThread = new URL(currentUrl)
      urlWithThread.searchParams.set('aiThreadId', active.id)
      navigator.clipboard.writeText(urlWithThread.toString())
    }
  }

  useEffect(() => {
    logAiChatDebug("AiPaneInner.mount", {
      initialScope,
      externalThreadId: externalThreadId ?? null,
      disableUrlSync,
    })
    return () => {
      logAiChatDebug("AiPaneInner.unmount", {
        initialScope,
      })
    }
  }, [initialScope, externalThreadId, disableUrlSync])

  useEffect(() => {
    logAiChatDebug("thread.active.changed", {
      activeThreadId: active?.id ?? null,
      urlThreadId: searchParams.get("aiThreadId"),
      openTabCount: openTabs.length,
    })
  }, [active?.id, openTabs.length, searchParams])

  // Inline mode - render without modal overlay
  if (inline) {
    return (
      <div className="h-full flex flex-col bg-white">
        {/* Simplified header with tabs on left, controls on right */}
        <div className={`${COMPACT_PANE_HEADER_ROW_CLASS} !items-stretch border-b border-gray-200 bg-white pl-0 pr-3 shrink-0`}>
          {/* Left side: Tabs */}
          <div className="flex min-h-0 min-w-0 flex-1 items-stretch">
            <AiPaneTabStrip
              openTabs={openTabs}
              active={active}
              optimisticTab={optimisticTab}
              activeOptimisticId={optimisticTab?.optimisticId ?? null}
              displayTitleByThreadId={streamingThreadTitlesById}
              editingTabId={editingTabId}
              editTitle={editTitle}
              setEditTitle={setEditTitle}
              onTabClick={handleTabClick}
              onStartEdit={handleStartEdit}
              onRename={handleRename}
              onTitleKeyDown={handleTitleKeyDown}
              onCloseTab={handleCloseTab}
              onDeleteClick={handleDeleteClick}
            />
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
              type="button"
              onClick={() => onExpand?.()}
              className="p-2 hover:bg-gray-100 rounded-md transition-colors"
              title={isExpanded ? "Collapse" : "Expand"}
            >
              {isExpanded ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
            </button>
            {onClose && (
              <button
                type="button"
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
                taskId={effectiveTaskId} 
                activeChannelId={resolvedActiveChannelId}
                chatContext={{
                  componentId: searchParams.get('chatComponentId'),
                  briefingMode: searchParams.get('chatMode') === 'build_briefing',
                  preFillMessage: searchParams.get('chatPreFill') ? decodeURIComponent(searchParams.get('chatPreFill') || '') : undefined,
                  mode: (searchParams.get('chatMode') as "build_component" | "build_briefing") || null,
                  autoRun: searchParams.get('chatAutoRun') === 'true' // Default to false - only true if explicitly set
                }}
                activeFieldContext={activeFieldContext}
                onScopeModeChange={handleScopeModeChange}
                onThreadTitlePreview={handleThreadTitlePreview}
                onThreadTitlePersist={handleThreadTitlePersist}
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
          <div className={`${COMPACT_PANE_HEADER_ROW_CLASS} !items-stretch border-b border-gray-200 bg-white pl-0 pr-3 shrink-0`}>
            {/* Left side: Tabs */}
            <div className="flex min-h-0 min-w-0 flex-1 items-stretch">
              <AiPaneTabStrip
                openTabs={openTabs}
                active={active}
                optimisticTab={optimisticTab}
                activeOptimisticId={optimisticTab?.optimisticId ?? null}
                displayTitleByThreadId={streamingThreadTitlesById}
                editingTabId={editingTabId}
                editTitle={editTitle}
                setEditTitle={setEditTitle}
                onTabClick={handleTabClick}
                onStartEdit={handleStartEdit}
                onRename={handleRename}
                onTitleKeyDown={handleTitleKeyDown}
                onCloseTab={handleCloseTab}
                onDeleteClick={handleDeleteClick}
              />
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
                type="button"
                onClick={() => onExpand?.()}
                className="p-2 hover:bg-gray-100 rounded-md transition-colors"
                title={isExpanded ? "Collapse" : "Expand"}
              >
                {isExpanded ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
              </button>
              <button
                type="button"
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
              <ChatWindow
                thread={active}
                taskId={effectiveTaskId}
                activeChannelId={resolvedActiveChannelId}
                activeFieldContext={activeFieldContext}
                onScopeModeChange={handleScopeModeChange}
                onThreadTitlePreview={handleThreadTitlePreview}
                onThreadTitlePersist={handleThreadTitlePersist}
              />
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



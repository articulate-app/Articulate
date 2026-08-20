"use client"

import React, { useMemo, useState, useEffect, useRef, useCallback } from "react"
import type { AiScope, AiThread, AiVisibility } from "./types"
import { ChatWindow } from "./ChatWindow"
import { HistoryDropdown } from "./HistoryDrawer"
import { ResizablePanel } from "../../app/components/ui/resizable-panel"
import { Plus, X, X as XIcon, MoreHorizontal, Edit2, Trash2, Maximize2, Minimize2, Copy, XCircle, Users } from "lucide-react"
import { useCreateThread, useRenameThread, useSoftDeleteThread, useUpdateVisibility } from "./hooks"
import { getSupabaseBrowser } from "../../lib/supabase-browser"
import { useSearchParams } from "next/navigation"
import { TASKS_SHALLOW_NAV_EVENT } from "../../app/lib/tasks-shallow-nav"
import { mergeWorkspaceUrlState } from "../../app/lib/workspace-url-state"
import { ensureProjectThread, ensureGlobalThread } from "./ai-utils"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "../../app/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogTitle, DialogFooter } from "../../app/components/ui/dialog"
import { Button } from "../../app/components/ui/button"
import { toast } from "../../app/components/ui/use-toast"
import {
  PANE_CHROME_ICON_BUTTON_CLASS,
  PANE_CHROME_ICON_CLASS,
} from "../../app/components/tasks/pane-header-tokens"
import { useQueryClient } from "@tanstack/react-query"
import { invokeEdgeFunctionFetch } from "@/lib/edge-functions"
import { resolveAutoThreadSelection, shouldWriteActiveThreadToUrl } from "./thread-selection-guards"
import { logAiChatDebug } from "./debug"
import {
  AI_PANE_TAB_ACTIVE_CLASS,
  AI_PANE_TAB_CHIP_CLASS,
  AI_PANE_TAB_CHROME_CLASS,
  AI_PANE_TAB_INACTIVE_CLASS,
  AI_PANE_TAB_ROW_CLASS,
  AI_PANE_TAB_SCROLL_CLASS,
  AI_PANE_TAB_STRIP_CLASS,
} from "./tab-strip-tokens"
import { toPersistedAiThreadId, isPersistedAiThreadId } from "./thread-id"
import { AI_THREAD_CHROME_SELECT } from "./hydrate-orphaned-ai-run"
import { isPlaceholderAiThreadTitle } from "./ai-thread-title"
import type { AiActiveFieldContext } from "./active-field-context"
import { AiPaneThreadLibraryMenus } from "./AiPaneThreadLibraryMenus"
import { useAiPaneChromeStore, type AiChromeTab, type AiPaneChromeHandlers } from "./ai-pane-chrome-store"
import { buildLeftPaneTabKey, useLeftPaneTabsStore } from "../../app/store/left-pane-tabs"
import { buildCenterPaneTabKey, useCenterPaneTabsStore } from "../../app/store/center-pane-tabs"

interface AiPaneProps {
  isOpen: boolean
  onClose?: () => void
  /** Widen/focus the inline AI panel (tasks layout). */
  onExpand?: () => void
  initialScope?: AiScope
  projectId?: number
  taskId?: number
  inline?: boolean // New prop to render inline instead of as modal
  /**
   * When true, AI is a peer tab under the shared right-pane tab strip.
   * Hide the duplicate AI thread tab row; keep History / New Chat controls.
   */
  hideOuterTabStrip?: boolean
  contentTypeTitle?: string // Content type context for AI generation
  activeChannelId?: number | null // Active channel ID for task context
  activeFieldContext?: AiActiveFieldContext
  externalThreadId?: string | null
  disableUrlSync?: boolean
  isExpanded?: boolean
  forceNewThread?: boolean
  onForceNewThreadConsumed?: () => void
  /**
   * When set, overrides URL-based "AI is the active workspace view" detection.
   * Prefer this over assuming AI lives in the right pane (`rightView=ai`).
   */
  isActiveWorkspaceView?: boolean
}

/**
 * Prefer the live shallow URL (replaceState) until Next.js `useSearchParams` catches up.
 * Keep a stable URLSearchParams identity when the query string is unchanged — otherwise
 * consumers that depend on `searchParams` re-fire, rewrite the URL, and loop
 * (Maximum update depth via setShallowSearch).
 */
function useSyncedTasksSearchParams(nextSearch: ReturnType<typeof useSearchParams>) {
  const nextSearchString = nextSearch.toString()
  const [shallowOverride, setShallowOverride] = useState<string | null>(null)
  const paramsRef = useRef<URLSearchParams>(new URLSearchParams(nextSearchString))
  const lastStringRef = useRef(nextSearchString)

  useEffect(() => {
    const onShallow = () => {
      const live = window.location.search.replace(/^\?/, "")
      setShallowOverride((prev) => (prev === live ? prev : live))
    }
    window.addEventListener(TASKS_SHALLOW_NAV_EVENT, onShallow)
    return () => window.removeEventListener(TASKS_SHALLOW_NAV_EVENT, onShallow)
  }, [])

  useEffect(() => {
    if (shallowOverride === null) return
    // Next has the same query as the live bar — drop the override.
    if (shallowOverride === nextSearchString) {
      setShallowOverride(null)
    }
  }, [nextSearchString, shallowOverride])

  const effectiveString = shallowOverride !== null ? shallowOverride : nextSearchString
  if (lastStringRef.current !== effectiveString) {
    lastStringRef.current = effectiveString
    paramsRef.current = new URLSearchParams(effectiveString)
  }

  return paramsRef.current
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
    <div className="flex min-h-0 min-w-0 flex-1 items-stretch">
      <div ref={scrollRef} className={`${AI_PANE_TAB_SCROLL_CLASS} flex-1`}>
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
              className={`${AI_PANE_TAB_CHIP_CLASS} group/tab ${
                isActive ? AI_PANE_TAB_ACTIVE_CLASS : AI_PANE_TAB_INACTIVE_CLASS
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
              {editingTabId === tabId && !isOptimistic ? (
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onKeyDown={onTitleKeyDown}
                  onBlur={() => onRename(tabId)}
                  className="min-w-0 flex-1 rounded border border-gray-300 bg-transparent px-1 py-0.5 text-[13px] outline-none"
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
                    const fallbackTitle = "New chat"
                    return (
                      <span
                        className="min-w-0 flex-1 truncate"
                        title={displayTitle || fallbackTitle}
                      >
                        {displayTitle || fallbackTitle}
                      </span>
                    )
                  })()}
                  {!isOptimistic ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onCloseTab(tabId)
                      }}
                      className="rounded p-0.5 text-gray-400 opacity-0 hover:bg-black/5 hover:text-gray-700 group-hover/tab:opacity-100 focus-visible:opacity-100"
                      title="Close tab"
                    >
                      <XIcon className="h-3 w-3" />
                    </button>
                  ) : null}
                </>
              )}
            </div>
          )})}
        </div>
      </div>
      <div className="min-h-0 w-0 flex-none self-stretch" aria-hidden />
    </div>
  )
}

export function AiPane(props: AiPaneProps) {
  if (!props.isOpen) return null
  return <AiPaneInner {...props} />
}

function AiPaneInner({ isOpen, onClose, onExpand, initialScope = 'global', projectId, taskId, inline = false, hideOuterTabStrip = false, contentTypeTitle, activeChannelId, activeFieldContext, externalThreadId, disableUrlSync = false, isExpanded = false, forceNewThread = false, onForceNewThreadConsumed, isActiveWorkspaceView }: AiPaneProps) {
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
  const updateVisibility = useUpdateVisibility()
  const queryClient = useQueryClient()
  const isUpdatingFromStateRef = useRef(false)
  const previousActiveIdRef = useRef<string | null>(null)
  const bootstrapScopeReadyRef = useRef(false)
  const didAutoBootstrapRef = useRef(false)
  const creatingLockRef = useRef(false)
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
      // Patch live location instead of router.replace(searchParams). Next's searchParams
      // lag behind shallow prefs writes (settings=open), and a full replace would wipe them.
      logAiChatDebug("workspace-url.merge", { reason, threadId })
      mergeWorkspaceUrlState(
        {
          aiThreadId: threadId,
          ...(threadId ? { newAiThread: null } : {}),
        },
        { source: `ai-pane:${reason}`, mode: "replace" },
      )
    },
    [disableUrlSync],
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

  const clearStreamingThreadTitle = useCallback((threadId: string) => {
    setStreamingThreadTitlesById((prev) => {
      if (!(threadId in prev)) return prev
      const next = { ...prev }
      delete next[threadId]
      return next
    })
  }, [])

  const getLocalThreadTitle = useCallback(
    (threadId: string): string | null => {
      const fromActive = active?.id === threadId ? active.title : null
      const fromTab = openTabs.find((tab) => tab.id === threadId)?.title ?? null
      const local = (fromActive ?? fromTab ?? "").trim()
      // Treat "New chat" as unset so Protocol V2 titles can still apply.
      if (!local || isPlaceholderAiThreadTitle(local)) return null
      return local
    },
    [active, openTabs],
  )

  const getCachedThreadTitle = useCallback(
    (threadId: string): string | null => {
      const cachedLists = queryClient.getQueriesData<AiThread[]>({ queryKey: ["ai-threads"] })
      for (const [, list] of cachedLists) {
        if (!Array.isArray(list)) continue
        const match = list.find((thread) => thread.id === threadId)
        const title = match?.title != null ? String(match.title).trim() : ""
        if (title && !isPlaceholderAiThreadTitle(title)) return title
      }
      return null
    },
    [queryClient],
  )

  const handleThreadTitlePreview = useCallback((threadId: string, title: string | null) => {
    // Provisional titles only update the open-chat header; sidebar/list caches stay put.
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
      if (!normalizedTitle) {
        clearStreamingThreadTitle(threadId)
        return
      }

      // Never overwrite a non-empty title already set by the user.
      if (getLocalThreadTitle(threadId)) {
        clearStreamingThreadTitle(threadId)
        return
      }

      // Prefer a title already returned by a newer fetch; sync it into open tabs.
      const cachedTitle = getCachedThreadTitle(threadId)
      const titleToApply = cachedTitle || normalizedTitle

      updateThreadTitleLocalState(threadId, titleToApply)
      clearStreamingThreadTitle(threadId)
      queryClient.setQueriesData<AiThread[]>({ queryKey: ["ai-threads"] }, (old) => {
        if (!Array.isArray(old)) return old
        return old.map((thread) =>
          thread.id === threadId && isPlaceholderAiThreadTitle(thread.title)
            ? { ...thread, title: titleToApply }
            : thread,
        )
      })
      // Background reconcile with DB (backend persists the title); keep selection/scroll intact.
      void queryClient.invalidateQueries({ queryKey: ["ai-threads"], refetchType: "active" })
      void queryClient.invalidateQueries({
        queryKey: ["ai-thread-context", threadId],
        refetchType: "active",
      })
    },
    [
      clearStreamingThreadTitle,
      getCachedThreadTitle,
      getLocalThreadTitle,
      queryClient,
      updateThreadTitleLocalState,
    ],
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

    if (forceNewThread && isOpen) {
      logAiChatDebug("thread.force-new.start", { source: "url-flag" })
      if (!creatingLockRef.current) {
        void handleNewChat()
      }
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
    const centerView = windowParams?.get("centerView") ?? searchParams.get("centerView")
    const taskAiOpen = (windowParams?.get("taskAiOpen") ?? searchParams.get("taskAiOpen")) === "true"
    // AI identity is the thread — not the pane. Active when hosted in right OR middle.
    const isAiPaneMode =
      typeof isActiveWorkspaceView === "boolean"
        ? isActiveWorkspaceView
        : (rightView === "ai" && taskAiOpen) || centerView === "ai"
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

    if (forceNewThread || creatingLockRef.current || isCreating) {
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
  }, [isOpen, active?.id, isCreating, searchParams, openTabs, effectiveScope, effectiveProjectId, externalThreadId, disableUrlSync, forceNewThread, onForceNewThreadConsumed, isActiveWorkspaceView])

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
      const loadThreadChrome = () =>
        supabase
          .from('ai_threads')
          .select(AI_THREAD_CHROME_SELECT)
          .eq('id', persistedThreadId)
          .single()

      let { data, error } = await loadThreadChrome()
      if (error) {
        await new Promise((resolve) => window.setTimeout(resolve, 400))
        const retry = await loadThreadChrome()
        data = retry.data
        error = retry.error
      }

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
    // When the caller explicitly requested a new thread, do not let the
    // previous active chat win the URL race before the bootstrap effect runs.
    if (forceNewThread) return
    if (active && isOpen) {
      // Never put optimistic/temp ids in the URL.
      if (!isPersistedAiThreadId(active.id)) return

      // Skip if we're already updating from a state change
      if (isUpdatingFromStateRef.current && previousActiveIdRef.current === active.id) {
        return
      }
      
      const liveThreadId =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("aiThreadId")
          : searchParams.get("aiThreadId")
      // Only update URL when active is ahead of the address bar.
      // If the URL already requests a different persisted thread (search open),
      // leave it alone so the URL→state effect can switch selection.
      if (
        shouldWriteActiveThreadToUrl({
          activeThreadId: active.id,
          liveThreadId,
          isPersistedThreadId: isPersistedAiThreadId,
        })
      ) {
        isUpdatingFromStateRef.current = true
        previousActiveIdRef.current = active.id
        navigateToThreadId(active.id, "active-thread-effect")

        // Reset flag after URL update completes
        // Use requestAnimationFrame for immediate next frame, minimal delay
        requestAnimationFrame(() => {
          isUpdatingFromStateRef.current = false
        })
      } else {
        // URL is already in sync (or intentionally ahead), just update the ref
        previousActiveIdRef.current = active.id
      }
    }
  }, [active?.id, disableUrlSync, forceNewThread, isOpen, searchParams, navigateToThreadId])

  const handleNewChat = async () => {
    if (isCreating || creatingLockRef.current) return
    // Already sitting on an in-flight new chat — don't spawn a second tab.
    if (active && !isPersistedAiThreadId(active.id)) return

    creatingLockRef.current = true
    setIsCreating(true)
    const previousActive = active
    
    // Keep optimistic identifier local-only. Never use it as ai_threads.id.
    const optimisticId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
    const scope = effectiveScope === 'task' && effectiveTaskId
      ? 'task' as const
      : effectiveScope === 'project' && effectiveProjectId
      ? 'project' as const
      : 'global' as const

    const createdAt = new Date().toISOString()
    const nextOptimisticTab: OptimisticThreadTab = {
      optimisticId,
      scope,
      title: null,
      created_at: createdAt,
    }
    const optimisticThread: AiThread = {
      id: optimisticId,
      scope,
      visibility: "private",
      is_collaborative: false,
      title: null,
      created_at: createdAt,
      project_id: scope === "project" ? effectiveProjectId ?? null : null,
      task_id: scope === "task" ? effectiveTaskId ?? null : null,
    }
    
    // Show empty chat shell immediately (no blank loading pane).
    isUpdatingFromStateRef.current = true
    previousActiveIdRef.current = null
    setOptimisticTab(nextOptimisticTab)
    setActive(optimisticThread)
    
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
      onForceNewThreadConsumed?.()
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
      onForceNewThreadConsumed?.()
      clearOptimisticThread()
      setActive(previousActive)
      navigateToThreadId(previousActive?.id ?? null, "new-chat-create-failed")
      toast({
        title: 'Failed to create chat',
        description: 'Could not create a new chat thread',
        variant: 'destructive'
      })
    } finally {
      creatingLockRef.current = false
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

  const handleSetVisibility = async (visibility: AiVisibility) => {
    if (!active?.id) return
    const isCollaborative = visibility !== "private"
    try {
      const updated = await updateVisibility(active.id, visibility, isCollaborative)
      setOpenTabs((prev) =>
        prev.map((tab) =>
          tab.id === active.id
            ? { ...tab, visibility: updated.visibility, is_collaborative: updated.is_collaborative }
            : tab,
        ),
      )
      setActive((prev) =>
        prev?.id === active.id
          ? { ...prev, visibility: updated.visibility, is_collaborative: updated.is_collaborative }
          : prev,
      )
      void queryClient.invalidateQueries({ queryKey: ["ai-threads"], refetchType: "active" })
      toast({
        title: "Chat sharing updated",
        description:
          visibility === "private"
            ? "Only you can see this chat."
            : visibility === "project"
              ? "Project members can see this chat."
              : "Team members can see this chat.",
      })
    } catch (error: any) {
      toast({
        title: "Failed to update sharing",
        description: error?.message ?? "Could not update chat visibility.",
        variant: "destructive",
      })
    }
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

  useEffect(() => {
    const syncWorkspaceTabTitle = (threadId: string | null | undefined, rawTitle: string | null | undefined) => {
      const normalizedId = typeof threadId === "string" ? threadId.trim() : ""
      const normalizedTitle = typeof rawTitle === "string" ? rawTitle.trim() : ""
      if (!normalizedId || !normalizedTitle || isPlaceholderAiThreadTitle(normalizedTitle)) return
      useLeftPaneTabsStore
        .getState()
        .updateTitle(buildLeftPaneTabKey("ai", normalizedId), normalizedTitle)
      useCenterPaneTabsStore
        .getState()
        .updateTitle(buildCenterPaneTabKey("ai", normalizedId), normalizedTitle)
    }

    for (const tab of openTabs) {
      syncWorkspaceTabTitle(tab.id, streamingThreadTitlesById[tab.id] ?? tab.title ?? null)
    }
    syncWorkspaceTabTitle(active?.id, active?.title ?? null)
  }, [active?.id, active?.title, openTabs, streamingThreadTitlesById])

  // Peer right-pane mode: publish open AI chats into the shared tab strip.
  useEffect(() => {
    if (!hideOuterTabStrip) return
    const tabs: AiChromeTab[] = [
      ...openTabs.map((tab) => ({
        id: tab.id,
        title: streamingThreadTitlesById[tab.id] ?? tab.title ?? "New chat",
      })),
      ...(optimisticTab
        ? [
            {
              id: optimisticTab.optimisticId,
              title: optimisticTab.title ?? "New chat",
              isOptimistic: true,
            },
          ]
        : []),
    ]
    useAiPaneChromeStore.getState().sync({
      tabs,
      activeThreadId: active?.id ?? optimisticTab?.optimisticId ?? null,
      editingTabId,
      editTitle,
      activeVisibility: active?.visibility ?? null,
      activeProjectId: active?.project_id ?? null,
      isExpanded,
      isCreating,
    })
  }, [
    hideOuterTabStrip,
    openTabs,
    optimisticTab,
    active,
    editingTabId,
    editTitle,
    streamingThreadTitlesById,
    isExpanded,
    isCreating,
  ])

  // Peer right/left/middle chrome owns the AI tab strip — publish stable handlers once
  // while `hideOuterTabStrip` is on. Use a ref so callback identity changes do not
  // re-enter setHandlers → store update → parent re-render → infinite loop.
  const chromeHandlersRef = useRef<AiPaneChromeHandlers | null>(null)
  chromeHandlersRef.current = {
    selectThread: (threadId) => {
      const tab = openTabs.find((item) => item.id === threadId)
      if (tab) handleTabClick(tab)
    },
    closeThread: (threadId) => handleCloseTab(threadId),
    newChat: () => {
      void handleNewChat()
    },
    startEdit: (threadId) => {
      const tab = openTabs.find((item) => item.id === threadId)
      if (tab) handleStartEdit(tab)
    },
    rename: (threadId) => {
      void handleRename(threadId)
    },
    setEditTitle,
    titleKeyDown: handleTitleKeyDown,
    selectFromHistory: handleSelectThread,
    renameActive: () => {
      if (!active) return
      const next = window.prompt("Rename chat", active.title || "New chat")
      if (next == null) return
      setEditTitle(next)
      setEditingTabId(active.id)
      window.setTimeout(() => {
        void (async () => {
          try {
            setOpenTabs((prev) =>
              prev.map((tab) => (tab.id === active.id ? { ...tab, title: next } : tab)),
            )
            setActive((prev) => (prev?.id === active.id ? { ...prev, title: next } : prev))
            await renameThread(active.id, next)
            setEditingTabId(null)
            setEditTitle("")
          } catch (error) {
            console.error("Failed to rename thread:", error)
          }
        })()
      }, 0)
    },
    deleteActive: () => {
      if (active) handleDeleteClick(active.id)
    },
    setVisibility: (visibility) => {
      void handleSetVisibility(visibility)
    },
    closeAllAiTabs: handleCloseAllTabs,
    copyLink: handleCopyLink,
    reorderTabs: (orderedIds) => {
      setOpenTabs((prev) => {
        const byId = new Map(prev.map((tab) => [tab.id, tab]))
        const next: AiThread[] = []
        for (const id of orderedIds) {
          const tab = byId.get(id)
          if (!tab) continue
          next.push(tab)
          byId.delete(id)
        }
        for (const tab of byId.values()) next.push(tab)
        if (
          next.length === prev.length &&
          next.every((tab, index) => tab.id === prev[index]?.id)
        ) {
          return prev
        }
        return next
      })
    },
    expand: onExpand,
  }

  useEffect(() => {
    if (!hideOuterTabStrip) {
      useAiPaneChromeStore.getState().setHandlers(null)
      return
    }
    const stableHandlers: AiPaneChromeHandlers = {
      selectThread: (threadId) => chromeHandlersRef.current?.selectThread(threadId),
      closeThread: (threadId) => chromeHandlersRef.current?.closeThread(threadId),
      newChat: () => chromeHandlersRef.current?.newChat(),
      startEdit: (threadId) => chromeHandlersRef.current?.startEdit(threadId),
      rename: (threadId) => chromeHandlersRef.current?.rename(threadId),
      setEditTitle: (title) => chromeHandlersRef.current?.setEditTitle(title),
      titleKeyDown: (event) => chromeHandlersRef.current?.titleKeyDown(event),
      selectFromHistory: (thread) => chromeHandlersRef.current?.selectFromHistory(thread),
      renameActive: () => chromeHandlersRef.current?.renameActive(),
      deleteActive: () => chromeHandlersRef.current?.deleteActive(),
      setVisibility: (visibility) => chromeHandlersRef.current?.setVisibility(visibility),
      closeAllAiTabs: () => chromeHandlersRef.current?.closeAllAiTabs(),
      copyLink: () => chromeHandlersRef.current?.copyLink(),
      reorderTabs: (orderedIds) => chromeHandlersRef.current?.reorderTabs(orderedIds),
      expand: () => chromeHandlersRef.current?.expand?.(),
    }
    useAiPaneChromeStore.getState().setHandlers(stableHandlers)
    return () => {
      useAiPaneChromeStore.getState().setHandlers(null)
    }
  }, [hideOuterTabStrip])

  // Inline mode - render without modal overlay
  if (inline) {
    return (
      <div className="h-full flex flex-col overflow-hidden bg-white">
        {/* Peer right-pane mode: shared RightPaneTabBar owns AI chat + Browser tabs. */}
        {hideOuterTabStrip ? null : (
        <div className={`${AI_PANE_TAB_ROW_CLASS} shrink-0`}>
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
            />
          </div>
          
          {/* Right side: Essential controls only */}
          <div className={AI_PANE_TAB_CHROME_CLASS}>
            <HistoryDropdown 
              onSelectThread={handleSelectThread}
              activeThreadId={active?.id}
            />
            <button
              type="button"
              onClick={handleNewChat}
              disabled={isCreating}
              className={PANE_CHROME_ICON_BUTTON_CLASS}
              title="New Chat"
            >
              <Plus className={PANE_CHROME_ICON_CLASS} />
            </button>
            
            {/* More options menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={PANE_CHROME_ICON_BUTTON_CLASS}
                  title="More options"
                >
                  <MoreHorizontal className={PANE_CHROME_ICON_CLASS} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[180px]">
                <DropdownMenuItem
                  disabled={!active}
                  onClick={() => {
                    if (active) handleStartEdit(active)
                  }}
                >
                  <Edit2 className="mr-2 h-4 w-4" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!active}
                  className="text-red-600"
                  onClick={() => {
                    if (active) handleDeleteClick(active.id)
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <AiPaneThreadLibraryMenus threadId={toPersistedAiThreadId(active?.id)} />
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="gap-2" disabled={!active}>
                    <Users className="w-4 h-4" />
                    Share chat
                    {active?.visibility ? (
                      <span className="ml-auto text-[10px] capitalize text-muted-foreground">
                        {active.visibility}
                      </span>
                    ) : null}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="min-w-[180px]">
                    <DropdownMenuItem
                      onClick={() => void handleSetVisibility("private")}
                      disabled={active?.visibility === "private"}
                    >
                      Private (only you)
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => void handleSetVisibility("project")}
                      disabled={!active?.project_id || active?.visibility === "project"}
                    >
                      Project members
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => void handleSetVisibility("team")}
                      disabled={active?.visibility === "team"}
                    >
                      Team members
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
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
            
            {onExpand ? (
              <button
                type="button"
                onClick={() => onExpand()}
                className={PANE_CHROME_ICON_BUTTON_CLASS}
                title={isExpanded ? "Collapse" : "Expand"}
              >
                {isExpanded ? (
                  <Minimize2 className={PANE_CHROME_ICON_CLASS} />
                ) : (
                  <Maximize2 className={PANE_CHROME_ICON_CLASS} />
                )}
              </button>
            ) : null}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className={PANE_CHROME_ICON_BUTTON_CLASS}
                title="Close"
              >
                <X className={PANE_CHROME_ICON_CLASS} />
              </button>
            )}
          </div>
        </div>
        )}
        
        {/* Main chat area */}
        <div className="flex-1 min-h-0 overflow-hidden">
            {active ? (
              <ChatWindow 
                thread={active} 
                taskId={taskId ?? effectiveTaskId} 
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
        className="fixed right-0 top-0 z-50 flex h-full w-[600px] flex-col overflow-hidden border-l border-gray-200 bg-white shadow-lg"
        onClick={(e) => e.stopPropagation()}
        style={{ width: '600px', minWidth: '600px', maxWidth: '600px' }}
      >
        <div className="h-full flex flex-col overflow-hidden">
          {/* Simplified header with tabs on left, controls on right */}
          <div className={`${AI_PANE_TAB_ROW_CLASS} shrink-0`}>
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
            />
          </div>
          
          {/* Right side: Essential controls only */}
          <div className={AI_PANE_TAB_CHROME_CLASS}>
            <HistoryDropdown 
              onSelectThread={handleSelectThread}
              activeThreadId={active?.id}
            />
            <button
              type="button"
              onClick={handleNewChat}
              disabled={isCreating}
              className={PANE_CHROME_ICON_BUTTON_CLASS}
              title="New Chat"
            >
              <Plus className={PANE_CHROME_ICON_CLASS} />
            </button>
            
            {/* More options menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={PANE_CHROME_ICON_BUTTON_CLASS}
                  title="More options"
                >
                  <MoreHorizontal className={PANE_CHROME_ICON_CLASS} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[180px]">
                <DropdownMenuItem
                  disabled={!active}
                  onClick={() => {
                    if (active) handleStartEdit(active)
                  }}
                >
                  <Edit2 className="mr-2 h-4 w-4" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!active}
                  className="text-red-600"
                  onClick={() => {
                    if (active) handleDeleteClick(active.id)
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <AiPaneThreadLibraryMenus threadId={toPersistedAiThreadId(active?.id)} />
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="gap-2" disabled={!active}>
                    <Users className="w-4 h-4" />
                    Share chat
                    {active?.visibility ? (
                      <span className="ml-auto text-[10px] capitalize text-muted-foreground">
                        {active.visibility}
                      </span>
                    ) : null}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="min-w-[180px]">
                    <DropdownMenuItem
                      onClick={() => void handleSetVisibility("private")}
                      disabled={active?.visibility === "private"}
                    >
                      Private (only you)
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => void handleSetVisibility("project")}
                      disabled={!active?.project_id || active?.visibility === "project"}
                    >
                      Project members
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => void handleSetVisibility("team")}
                      disabled={active?.visibility === "team"}
                    >
                      Team members
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
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
            
            {onExpand ? (
              <button
                type="button"
                onClick={() => onExpand()}
                className={PANE_CHROME_ICON_BUTTON_CLASS}
                title={isExpanded ? "Collapse" : "Expand"}
              >
                {isExpanded ? (
                  <Minimize2 className={PANE_CHROME_ICON_CLASS} />
                ) : (
                  <Maximize2 className={PANE_CHROME_ICON_CLASS} />
                )}
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className={PANE_CHROME_ICON_BUTTON_CLASS}
              title="Close"
            >
              <X className={PANE_CHROME_ICON_CLASS} />
            </button>
          </div>
        </div>
          
          {/* Main chat area */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {active ? (
              <ChatWindow
                thread={active}
                taskId={taskId ?? effectiveTaskId}
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

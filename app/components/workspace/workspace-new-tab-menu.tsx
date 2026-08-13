"use client"

import { useState } from "react"
import {
  Bot,
  FolderKanban,
  Globe2,
  Inbox,
  LayoutTemplate,
  Lightbulb,
  ListTodo,
  MessageSquare,
  Plus,
  Users,
} from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover"
import { GlobalSearchPreviewPanel } from "../search/global-search-preview-panel"
import type { GlobalSearchDocument, GlobalSearchItemEntityType } from "../../lib/global-search-types"
import { openWorkspaceView } from "../../lib/open-workspace-view"
import { beginManualBrowserOpen } from "../../lib/open-browser-session"
import { probeLocalBridge } from "../../lib/local-browser-bridge"
import { openWorkspaceViewFromSearchDocument } from "../../lib/open-workspace-view-from-search"
import {
  WORKSPACE_NEW_TAB_LIST_ACTIONS,
  WORKSPACE_NEW_TAB_TOOL_ACTIONS,
} from "../../lib/workspace-new-tab-options"
import type { WorkspaceNewTabQuickActionType } from "../../lib/workspace-new-tab-options"
import { workspaceListViewLabel, type WorkspaceListViewType } from "../../lib/workspace-list-views"
import { type WorkspacePaneId } from "../../lib/workspace-view"
import { PANE_CHROME_ICON_BUTTON_CLASS, PANE_CHROME_ICON_CLASS } from "../tasks/pane-header-tokens"

export type WorkspaceNewTabMenuProps = {
  /** Destination pane for every option selected from this menu instance. */
  pane: WorkspacePaneId
  pathname?: string
  searchValue?: string
  onSearchChange?: (value: string) => void
  onSearchCommit?: (value?: string) => void
  onClearSearch?: () => void
  selectedTypeFilters?: GlobalSearchItemEntityType[]
  onToggleTypeFilter?: (type: GlobalSearchItemEntityType) => void
  onShowAll?: (value?: string) => void
  /** Optional side effects after a search result is opened (tracking, etc.). */
  onAfterResultOpen?: (item: GlobalSearchDocument) => void
  triggerTitle?: string
  triggerAriaLabel?: string
}

function quickActionIcon(type: WorkspaceNewTabQuickActionType) {
  if (type === "task-list") return <ListTodo className="h-3.5 w-3.5" aria-hidden />
  if (type === "project-list") return <FolderKanban className="h-3.5 w-3.5" aria-hidden />
  if (type === "template-list") return <LayoutTemplate className="h-3.5 w-3.5" aria-hidden />
  if (type === "mention-list") return <Inbox className="h-3.5 w-3.5" aria-hidden />
  if (type === "user-list") return <Users className="h-3.5 w-3.5" aria-hidden />
  if (type === "ai-thread-list") return <Bot className="h-3.5 w-3.5" aria-hidden />
  if (type === "research") return <Lightbulb className="h-3.5 w-3.5" aria-hidden />
  if (type === "browser") return <Globe2 className="h-3.5 w-3.5" aria-hidden />
  if (type === "message") return <MessageSquare className="h-3.5 w-3.5" aria-hidden />
  return <Bot className="h-3.5 w-3.5" aria-hidden />
}

/**
 * Canonical workspace `+` menu — same component for left, middle, and right.
 */
export function WorkspaceNewTabMenu({
  pane,
  pathname,
  searchValue = "",
  onSearchChange,
  onSearchCommit,
  onClearSearch,
  selectedTypeFilters = [],
  onToggleTypeFilter,
  onShowAll: _onShowAll,
  onAfterResultOpen,
  triggerTitle = "Open tab",
  triggerAriaLabel = "Open tab",
}: WorkspaceNewTabMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const queryClient = useQueryClient()

  const close = () => setIsOpen(false)

  const handleOpenList = (type: WorkspaceListViewType) => {
    openWorkspaceView(
      {
        type,
        title: workspaceListViewLabel(type),
      },
      {
        pane,
        pathname,
        source: `workspace-new-tab-${type}:${pane}`,
      },
    )
    close()
  }

  const handleOpenBrowser = () => {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `browser-${Date.now()}`
    // Start the session immediately on click — don't wait for BrowserSessionPane mount.
    beginManualBrowserOpen(id, {
      startUrl: "https://www.google.com/",
      source: "manual",
      profileKey: "manual-browser",
      autoPair: false,
    })
    openWorkspaceView(
      {
        type: "browser",
        id,
        title: "Browser",
        params: { browserTabId: id, keepAiOpen: true, phase: "provisioning" },
      },
      {
        pane,
        tabMode: "new",
        pathname,
        source: `workspace-new-tab-browser:${pane}`,
      },
    )
    close()
  }

  const handleOpenAiChat = () => {
    openWorkspaceView(
      {
        type: "ai",
        title: "New chat",
        params: { forceNewAiThread: true },
      },
      {
        pane,
        pathname,
        source: `workspace-new-tab-ai:${pane}`,
      },
    )
    close()
  }

  const handleOpenResearch = (query = "") => {
    openWorkspaceView(
      {
        type: "research",
        title: "Research",
        params: {
          researchQuery: query.trim() || null,
          researchTab: "keywords",
        },
      },
      {
        pane,
        pathname,
        source: `workspace-new-tab-research:${pane}`,
      },
    )
    close()
  }

  const handleOpenMessage = () => {
    openWorkspaceView(
      {
        type: "thread",
        id: "new",
        title: "New message",
        params: { compose: true },
      },
      {
        pane: pane === "left" ? "middle" : pane,
        tabMode: "new",
        pathname,
        source: `workspace-new-tab-message:${pane}`,
      },
    )
    close()
  }

  const handleSelectResult = (item: GlobalSearchDocument) => {
    const opened = openWorkspaceViewFromSearchDocument(item, {
      pane,
      pathname,
      source: `workspace-new-tab-result:${pane}`,
      queryClient,
    })
    if (opened) {
      onAfterResultOpen?.(item)
    }
    close()
  }

  const handleShowAllResults = (value?: string) => {
    const searchQuery = (value ?? searchValue).trim()
    if (!searchQuery) return
    openWorkspaceView(
      {
        type: "search-results",
        title: searchQuery,
        params: { searchQuery },
      },
      {
        pane,
        pathname,
        source: `workspace-new-tab-show-all:${pane}`,
      },
    )
    close()
  }

  const runAction = (type: WorkspaceNewTabQuickActionType) => {
    if (type === "browser") {
      handleOpenBrowser()
      return
    }
    if (type === "ai") {
      handleOpenAiChat()
      return
    }
    if (type === "research") {
      handleOpenResearch(searchValue)
      return
    }
    if (type === "message") {
      handleOpenMessage()
      return
    }
    handleOpenList(type)
  }

  const workspaceMenuSections = [
    {
      key: "lists",
      actions: WORKSPACE_NEW_TAB_LIST_ACTIONS.map((action) => ({
        key: action.type,
        label: action.label,
        icon: quickActionIcon(action.type),
        onSelect: () => runAction(action.type),
      })),
    },
    {
      key: "tools",
      actions: WORKSPACE_NEW_TAB_TOOL_ACTIONS.map((action) => ({
        key: action.type,
        label: action.label,
        icon: quickActionIcon(action.type),
        onSelect: () => runAction(action.type),
      })),
    },
  ]

  return (
    <Popover
      open={isOpen}
      onOpenChange={(next) => {
        setIsOpen(next)
        // Warm the local-helper probe while the menu is open so + → Browser skips cold latency.
        if (next) void probeLocalBridge()
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className={PANE_CHROME_ICON_BUTTON_CLASS}
          title={triggerTitle}
          aria-label={triggerAriaLabel}
          aria-expanded={isOpen}
        >
          <Plus className={PANE_CHROME_ICON_CLASS} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-[min(18rem,calc(100vw-2rem))] border-0 bg-transparent p-0 shadow-none"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
        }}
      >
        <GlobalSearchPreviewPanel
          enabled={isOpen}
          showInput
          autoFocusInput
          hideTypeFilters
          recentsMode="opened"
          compact
          searchValue={searchValue}
          onSearchChange={onSearchChange}
          onSearchCommit={onSearchCommit}
          onClearSearch={onClearSearch}
          selectedTypeFilters={selectedTypeFilters}
          onToggleTypeFilter={onToggleTypeFilter}
          onPreviewResultSelect={handleSelectResult}
          onShowAll={handleShowAllResults}
          onOpenResearch={handleOpenResearch}
          workspaceMenuSections={workspaceMenuSections}
          onRequestClose={close}
          className="shadow-xl"
        />
      </PopoverContent>
    </Popover>
  )
}

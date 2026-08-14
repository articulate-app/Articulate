"use client"

/**
 * Empty/new pane chooser — same surface as the workspace `+` menu
 * (search, recents, lists, tools), shown as full pane content when opening
 * via PaneOpenIcon (not via `+`).
 */

import { useEffect, useMemo, useState } from "react"
import {
  Bot,
  FolderKanban,
  Globe2,
  Inbox,
  LayoutTemplate,
  Lightbulb,
  ListTodo,
  MessageSquare,
  Users,
} from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import { GlobalSearchPreviewPanel } from "../search/global-search-preview-panel"
import type { GlobalSearchDocument } from "../../lib/global-search-types"
import {
  WORKSPACE_NEW_TAB_LIST_ACTIONS,
  WORKSPACE_NEW_TAB_TOOL_ACTIONS,
  type WorkspaceNewTabQuickActionType,
} from "../../lib/workspace-new-tab-options"
import {
  openWorkspaceNewTabResearch,
  openWorkspaceNewTabSearchResult,
  openWorkspaceNewTabShowAll,
  runWorkspaceNewTabAction,
} from "../../lib/workspace-new-tab-actions"
import type { WorkspacePaneId } from "../../lib/workspace-view"
import { probeLocalBridge } from "../../lib/local-browser-bridge"
import { WorkspacePageSearchInput, WorkspacePageShell } from "./workspace-page-shell"

export type WorkspaceStartPaneProps = {
  paneId: WorkspacePaneId
  pathname?: string
  /** @deprecated Close lives on the tab strip. */
  onClose?: () => void
}

function actionIcon(type: WorkspaceNewTabQuickActionType) {
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

export function WorkspaceStartPane({ paneId, pathname }: WorkspaceStartPaneProps) {
  const queryClient = useQueryClient()
  const [searchValue, setSearchValue] = useState("")

  // Warm local-helper probe so Browser opens without cold latency (same as `+` menu).
  useEffect(() => {
    void probeLocalBridge()
  }, [])

  const sharedArgs = {
    pane: paneId,
    pathname,
    queryClient,
    sourcePrefix: "workspace-start" as const,
  }

  const workspaceMenuSections = useMemo(
    () => [
      {
        key: "lists",
        actions: WORKSPACE_NEW_TAB_LIST_ACTIONS.map((action) => ({
          key: action.type,
          label: action.label,
          icon: actionIcon(action.type),
          onSelect: () => {
            runWorkspaceNewTabAction({
              type: action.type,
              pane: paneId,
              pathname,
              queryClient,
              searchQuery: searchValue,
              sourcePrefix: "workspace-start",
            })
          },
        })),
      },
      {
        key: "tools",
        actions: WORKSPACE_NEW_TAB_TOOL_ACTIONS.map((action) => ({
          key: action.type,
          label: action.label,
          icon: actionIcon(action.type),
          onSelect: () => {
            runWorkspaceNewTabAction({
              type: action.type,
              pane: paneId,
              pathname,
              queryClient,
              searchQuery: searchValue,
              sourcePrefix: "workspace-start",
            })
          },
        })),
      },
    ],
    [paneId, pathname, queryClient, searchValue],
  )

  const handleSelectResult = (item: GlobalSearchDocument) => {
    openWorkspaceNewTabSearchResult(item, sharedArgs)
  }

  const handleShowAll = (value?: string) => {
    openWorkspaceNewTabShowAll(value ?? searchValue, sharedArgs)
  }

  const handleOpenResearch = (query = "") => {
    openWorkspaceNewTabResearch({ ...sharedArgs, query })
  }

  return (
    <WorkspacePageShell
      title="Open something"
      subtitle="Search, pick a recent, or open a list or tool."
    >
      <WorkspacePageSearchInput
        value={searchValue}
        onChange={setSearchValue}
        placeholder="Search tasks, projects, people..."
        autoFocus
        onCommit={(value) => handleShowAll(value)}
      />
      <GlobalSearchPreviewPanel
        enabled
        showInput={false}
        hideTypeFilters
        pageLayout
        recentsMode="opened"
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        onClearSearch={() => setSearchValue("")}
        onSearchCommit={(value) => handleShowAll(value)}
        onShowAll={handleShowAll}
        onPreviewResultSelect={handleSelectResult}
        onOpenResearch={handleOpenResearch}
        workspaceMenuSections={workspaceMenuSections}
        className="shadow-none"
      />
    </WorkspacePageShell>
  )
}

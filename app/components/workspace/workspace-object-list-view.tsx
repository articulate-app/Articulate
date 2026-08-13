"use client"

/**
 * Non-task object list as a workspace tab (projects / mentions / users / AI chats / artifacts).
 * Users & projects use a directory layout (headers + ⋯ actions); scrollbar stays full-pane right.
 */

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { Search } from "lucide-react"
import { useGlobalSearchContext } from "../../contexts/global-search-context"
import { GlobalSearchFullResultsPane } from "../search/global-search-full-results-pane"
import { InlineSearchInput } from "../tasks/InlineSearchInput"
import { IconTooltip } from "../ui/icon-tooltip"
import {
  PANE_CHROME_ICON_BUTTON_CLASS,
  PANE_CHROME_ICON_CLASS,
} from "../tasks/pane-header-tokens"
import {
  listViewToSearchObjectRoute,
  workspaceListViewLabel,
  workspaceListViewSearchTab,
  type WorkspaceListViewType,
} from "../../lib/workspace-list-views"
import type { WorkspacePaneId } from "../../lib/workspace-view"
import { WorkspaceHostPaneProvider } from "./workspace-host-pane-context"
import { openWorkspaceViewFromSearchDocument } from "../../lib/open-workspace-view-from-search"
import type { GlobalSearchDocument } from "../../lib/global-search-types"
import { dispatchOpenHeaderCreate } from "../ui/sidebar-home-feed"
import { TASKS_SHALLOW_NAV_EVENT } from "../../lib/tasks-shallow-nav"

function readSelectedDirectoryEntityId(args: {
  listType: WorkspaceListViewType
  /** Pane that hosts the entity after click (not the list pane). */
  openPane: WorkspacePaneId
  searchParams: URLSearchParams
}): string | null {
  const { listType, openPane, searchParams } = args
  if (listType === "project-list") {
    if (openPane === "middle") return searchParams.get("centerProjectId")
    if (openPane === "right") return searchParams.get("rightProjectId")
    return searchParams.get("leftProjectId")
  }
  if (listType === "user-list") {
    if (openPane === "middle") return searchParams.get("centerUserId")
    if (openPane === "right") return searchParams.get("rightUserId")
    return searchParams.get("leftUserId")
  }
  return null
}

export type WorkspaceObjectListViewProps = {
  listType: Exclude<WorkspaceListViewType, "template-list">
  paneId: WorkspacePaneId
  /** Inline filter query (pane-local); falls back to empty (client filter). */
  query?: string
}

export function WorkspaceObjectListView({
  listType,
  paneId,
  query: queryProp,
}: WorkspaceObjectListViewProps) {
  const globalSearch = useGlobalSearchContext()
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()
  const [shallowEpoch, setShallowEpoch] = useState(0)
  const activeTab = workspaceListViewSearchTab(listType)
  const viewScope = listViewToSearchObjectRoute(listType)
  const [isInlineSearchOpen, setIsInlineSearchOpen] = useState(false)
  const [inlineSearchValue, setInlineSearchValue] = useState("")
  const listQuery =
    typeof queryProp === "string"
      ? queryProp
      : isInlineSearchOpen
        ? inlineSearchValue
        : ""

  useEffect(() => {
    const onShallow = () => setShallowEpoch((value) => value + 1)
    window.addEventListener(TASKS_SHALLOW_NAV_EVENT, onShallow)
    return () => window.removeEventListener(TASKS_SHALLOW_NAV_EVENT, onShallow)
  }, [])

  // Lists on the left keep the list visible; entities open in middle (default).
  // Lists on middle/right open entities in the same pane.
  const openPane: WorkspacePaneId = paneId === "left" ? "middle" : paneId

  const liveSearchParams =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : new URLSearchParams(searchParams.toString())
  void shallowEpoch
  const selectedEntityId = readSelectedDirectoryEntityId({
    listType,
    openPane,
    searchParams: liveSearchParams,
  })

  const handleResultSelect = (item: GlobalSearchDocument) => {
    const opened = openWorkspaceViewFromSearchDocument(item, {
      pane: openPane,
      source: `workspace-object-list:${listType}:${paneId}`,
      queryClient,
    })
    if (!opened) {
      globalSearch?.openSearchResult(item)
    }
  }

  if (!globalSearch) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-xs text-gray-500">
        Unable to load list.
      </div>
    )
  }

  const title = workspaceListViewLabel(listType)
  const searchPlaceholder = `Search ${title.toLowerCase()}...`
  const isDirectoryList = listType === "user-list" || listType === "project-list"
  const addLabel = listType === "user-list" ? "Add user" : listType === "project-list" ? "Add project" : null
  const addType = listType === "user-list" ? "user" : listType === "project-list" ? "project" : null

  return (
    <WorkspaceHostPaneProvider pane={paneId}>
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <div className="flex h-10 min-h-10 max-h-10 shrink-0 items-center gap-1 overflow-hidden border-b border-gray-200/80 bg-white pl-4 pr-1.5">
          {isInlineSearchOpen ? (
            <InlineSearchInput
              isOpen
              fullWidth
              value={inlineSearchValue}
              onChange={setInlineSearchValue}
              onClose={() => {
                setIsInlineSearchOpen(false)
                setInlineSearchValue("")
              }}
              placeholder={searchPlaceholder}
            />
          ) : (
            <>
              <div className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">
                {title}
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-0.5">
                {addLabel && addType ? (
                  <button
                    type="button"
                    className="inline-flex h-7 shrink-0 items-center rounded px-2 text-xs font-medium text-gray-700 hover:bg-gray-100"
                    onClick={() => dispatchOpenHeaderCreate(addType)}
                  >
                    {addLabel}
                  </button>
                ) : null}
                <IconTooltip label="Search">
                  <button
                    type="button"
                    className={PANE_CHROME_ICON_BUTTON_CLASS}
                    aria-label="Search"
                    onClick={() => setIsInlineSearchOpen(true)}
                  >
                    <Search className={PANE_CHROME_ICON_CLASS} />
                  </button>
                </IconTooltip>
              </div>
            </>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <GlobalSearchFullResultsPane
            query={listQuery}
            activeTab={activeTab}
            viewScope={viewScope}
            onResultSelect={handleResultSelect}
            getQueryKey={globalSearch.getFullResultsQueryKey}
            fetchPage={globalSearch.fetchFullResultsPage}
            directoryMode={isDirectoryList}
            selectedEntityId={selectedEntityId}
          />
        </div>
      </div>
    </WorkspaceHostPaneProvider>
  )
}

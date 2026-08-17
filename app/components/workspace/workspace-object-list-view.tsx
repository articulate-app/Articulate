"use client"

/**
 * Non-task object list as a workspace tab (projects / mentions / users / AI chats / artifacts).
 * Projects, Users, Inbox, and AI chats use the shared workspace page shell
 * (headline + single pane scroll); other lists keep the compact chrome header.
 */

import { useEffect, useRef, useState } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { Search } from "lucide-react"
import { cn } from "@/lib/utils"
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
import {
  shallowReplaceSearchParams,
  TASKS_SHALLOW_NAV_EVENT,
} from "../../lib/tasks-shallow-nav"
import {
  openWorkspaceNewTabAi,
  openWorkspaceNewTabMessage,
} from "../../lib/workspace-new-tab-actions"
import {
  WorkspacePageAddButton,
  WorkspacePageSearchInput,
  WorkspacePageShell,
} from "./workspace-page-shell"

type MentionsInboxTab = "received" | "sent" | "unseen"

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

function pageSubtitleForList(listType: WorkspaceListViewType): string {
  if (listType === "project-list") return "Search and open a project."
  if (listType === "user-list") return "Search and open a user."
  if (listType === "mention-list") return "Mentions and conversations across your work."
  if (listType === "ai-thread-list") return "Search and open an AI chat."
  if (listType === "artifact-list") return "Search and open an output."
  return `Search ${workspaceListViewLabel(listType).toLowerCase()}.`
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
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const pageScrollRef = useRef<HTMLDivElement | null>(null)
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

  const mentionsTab: MentionsInboxTab = (() => {
    const raw = liveSearchParams.get("mentionsTab")
    if (raw === "sent" || raw === "unseen") return raw
    return "received"
  })()

  const handleMentionsTabChange = (nextTab: MentionsInboxTab) => {
    const next = new URLSearchParams(liveSearchParams.toString())
    next.set("mentionsTab", nextTab)
    shallowReplaceSearchParams(pathname || "/tasks", next, "mentions-tab")
  }

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
  const usePageLayout =
    listType === "project-list" ||
    listType === "user-list" ||
    listType === "mention-list" ||
    listType === "ai-thread-list" ||
    listType === "artifact-list"

  const results = (
    <GlobalSearchFullResultsPane
      query={usePageLayout ? inlineSearchValue : listQuery}
      activeTab={activeTab}
      viewScope={viewScope}
      onResultSelect={handleResultSelect}
      getQueryKey={globalSearch.getFullResultsQueryKey}
      fetchPage={globalSearch.fetchFullResultsPage}
      directoryMode={isDirectoryList}
      selectedEntityId={selectedEntityId}
      embedInParentScroll={usePageLayout}
      scrollRootRef={usePageLayout ? pageScrollRef : null}
    />
  )

  if (usePageLayout) {
    return (
      <WorkspaceHostPaneProvider pane={paneId}>
        <WorkspacePageShell
          scrollRef={pageScrollRef}
          title={title}
          subtitle={pageSubtitleForList(listType)}
          actions={
            listType === "mention-list" ? (
              <WorkspacePageAddButton
                label="New message"
                onClick={() =>
                  openWorkspaceNewTabMessage({
                    pane: paneId,
                    pathname: pathname || undefined,
                    sourcePrefix: "workspace-inbox",
                  })
                }
              />
            ) : listType === "ai-thread-list" ? (
              <WorkspacePageAddButton
                label="New chat"
                onClick={() =>
                  openWorkspaceNewTabAi({
                    pane: paneId,
                    pathname: pathname || undefined,
                    sourcePrefix: "workspace-ai-list",
                  })
                }
              />
            ) : addLabel && addType ? (
              <WorkspacePageAddButton
                label={addLabel}
                onClick={() => dispatchOpenHeaderCreate(addType)}
              />
            ) : null
          }
        >
          <WorkspacePageSearchInput
            value={inlineSearchValue}
            onChange={setInlineSearchValue}
            placeholder={searchPlaceholder}
          />
          {listType === "mention-list" ? (
            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  { id: "received", label: "Received" },
                  { id: "sent", label: "Sent" },
                  { id: "unseen", label: "Unseen" },
                ] as const
              ).map((tab) => {
                const isActive = mentionsTab === tab.id
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => handleMentionsTabChange(tab.id)}
                    className={cn(
                      "inline-flex h-7 items-center rounded-full px-2.5 text-xs font-medium transition-colors",
                      isActive
                        ? "bg-gray-100 text-gray-900"
                        : "text-gray-500 hover:bg-gray-50 hover:text-gray-800",
                    )}
                  >
                    {tab.label}
                  </button>
                )
              })}
            </div>
          ) : null}
          {results}
        </WorkspacePageShell>
      </WorkspaceHostPaneProvider>
    )
  }

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
                  <WorkspacePageAddButton
                    label={addLabel}
                    onClick={() => dispatchOpenHeaderCreate(addType)}
                  />
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
        <div className="min-h-0 flex-1 overflow-hidden">{results}</div>
      </div>
    </WorkspaceHostPaneProvider>
  )
}

"use client"

/**
 * Full mixed search results as a workspace tab (opened via "+" → Show all).
 */

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useGlobalSearchContext } from "../../contexts/global-search-context"
import { fetchGlobalSearchAllTabItems } from "../../lib/services/global-search"
import {
  GLOBAL_SEARCH_ENTITY_TYPES,
  type GlobalSearchCountsMap,
  type GlobalSearchDocument,
} from "../../lib/global-search-types"
import { openWorkspaceView } from "../../lib/open-workspace-view"
import { openWorkspaceViewFromSearchDocument } from "../../lib/open-workspace-view-from-search"
import {
  workspaceListViewLabel,
  type WorkspaceListViewType,
} from "../../lib/workspace-list-views"
import type { WorkspacePaneId } from "../../lib/workspace-view"
import { GlobalSearchAllTabPane } from "../search/global-search-all-tab-pane"
import { objectPaneCenteredStateClass } from "../search/object-pane-content"
import { WorkspaceHostPaneProvider } from "./workspace-host-pane-context"

export type WorkspaceSearchResultsViewProps = {
  query: string
  paneId: WorkspacePaneId
}

const EMPTY_COUNTS: GlobalSearchCountsMap = {}

function entityTypeToListView(
  entityType: string | null | undefined,
): WorkspaceListViewType | null {
  if (entityType === "task") return "task-list"
  if (entityType === "project") return "project-list"
  if (entityType === "mention") return "mention-list"
  if (entityType === "user") return "user-list"
  if (entityType === "ai_thread") return "ai-thread-list"
  if (entityType === "artifact") return "artifact-list"
  return null
}

export function WorkspaceSearchResultsView({
  query,
  paneId,
}: WorkspaceSearchResultsViewProps) {
  const globalSearch = useGlobalSearchContext()
  const queryClient = useQueryClient()
  const trimmed = query.trim()

  const sectionsQuery = useQuery({
    queryKey: ["global-search", "all-tab-sections", "workspace-tab", trimmed],
    queryFn: ({ signal }) =>
      fetchGlobalSearchAllTabItems({
        query: trimmed,
        perTypeLimit: 10,
        signal,
      }),
    enabled: trimmed.length > 0,
  })

  const handleResultSelect = (item: GlobalSearchDocument) => {
    const openPane = paneId === "left" ? "middle" : paneId
    const opened = openWorkspaceViewFromSearchDocument(item, {
      pane: openPane,
      source: `workspace-search-results:${paneId}`,
      queryClient,
    })
    if (!opened) {
      globalSearch?.openSearchResult(item)
    }
  }

  if (!trimmed) {
    return (
      <div className={objectPaneCenteredStateClass()}>Enter a search query.</div>
    )
  }

  return (
    <WorkspaceHostPaneProvider pane={paneId}>
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <div className="flex h-10 min-h-10 max-h-10 shrink-0 items-center border-b border-gray-200/80 bg-white px-4">
          <div className="min-w-0 truncate text-sm font-medium text-gray-900">
            Results for “{trimmed}”
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <GlobalSearchAllTabPane
            sections={sectionsQuery.data ?? []}
            viewScope="all"
            visibleEntityTypes={[...GLOBAL_SEARCH_ENTITY_TYPES]}
            isLoading={sectionsQuery.isLoading}
            sectionCounts={EMPTY_COUNTS}
            isDiscoveryMode={false}
            hasCommittedTypeFilter={false}
            onResultSelect={handleResultSelect}
            onShowMore={(section) => {
              const listType = entityTypeToListView(section.entity_type)
              if (!listType) return
              openWorkspaceView(
                {
                  type: listType,
                  title: workspaceListViewLabel(listType),
                },
                {
                  pane: paneId,
                  source: `workspace-search-results-show-more:${paneId}`,
                },
              )
            }}
          />
        </div>
      </div>
    </WorkspaceHostPaneProvider>
  )
}

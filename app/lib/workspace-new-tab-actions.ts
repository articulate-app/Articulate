/**
 * Shared open handlers for the workspace `+` menu and the start-pane chooser.
 * Keep behavior identical — only the UI shell differs.
 */

import type { QueryClient } from "@tanstack/react-query"
import { beginManualBrowserOpen } from "./open-browser-session"
import { openWorkspaceView } from "./open-workspace-view"
import { openWorkspaceViewFromSearchDocument } from "./open-workspace-view-from-search"
import type { GlobalSearchDocument } from "./global-search-types"
import {
  workspaceListViewLabel,
  type WorkspaceListViewType,
} from "./workspace-list-views"
import type { WorkspaceNewTabQuickActionType } from "./workspace-new-tab-options"
import type { WorkspacePaneId } from "./workspace-view"

export type RunWorkspaceNewTabActionArgs = {
  type: WorkspaceNewTabQuickActionType
  pane: WorkspacePaneId
  pathname?: string
  /** Used for research when opening from a search field. */
  searchQuery?: string
  queryClient?: QueryClient
  sourcePrefix?: string
}

function source(prefix: string | undefined, action: string, pane: WorkspacePaneId): string {
  return `${prefix ?? "workspace-new-tab"}-${action}:${pane}`
}

export function openWorkspaceNewTabList(
  type: WorkspaceListViewType,
  args: Omit<RunWorkspaceNewTabActionArgs, "type">,
) {
  openWorkspaceView(
    {
      type,
      title: workspaceListViewLabel(type),
    },
    {
      pane: args.pane,
      pathname: args.pathname,
      source: source(args.sourcePrefix, type, args.pane),
    },
  )
}

export function openWorkspaceNewTabBrowser(args: Omit<RunWorkspaceNewTabActionArgs, "type">) {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `browser-${Date.now()}`
  beginManualBrowserOpen(id, {
    startUrl: "https://www.google.com/",
    source: "manual",
    profileKey: "manual-browser",
  })
  openWorkspaceView(
    {
      type: "browser",
      id,
      title: "Browser",
      params: { browserTabId: id, keepAiOpen: true, phase: "provisioning" },
    },
    {
      pane: args.pane,
      tabMode: "new",
      pathname: args.pathname,
      source: source(args.sourcePrefix, "browser", args.pane),
    },
  )
}

export function openWorkspaceNewTabAi(args: Omit<RunWorkspaceNewTabActionArgs, "type">) {
  // From a left list, open the chat in middle so the list stays visible.
  const pane = args.pane === "left" ? "middle" : args.pane
  openWorkspaceView(
    {
      type: "ai",
      title: "New chat",
      params: { forceNewAiThread: true },
    },
    {
      pane,
      pathname: args.pathname,
      source: source(args.sourcePrefix, "ai", args.pane),
    },
  )
}

export function openWorkspaceNewTabResearch(
  args: Omit<RunWorkspaceNewTabActionArgs, "type"> & { query?: string },
) {
  const query = (args.query ?? args.searchQuery ?? "").trim()
  openWorkspaceView(
    {
      type: "research",
      title: "Research",
      params: {
        researchQuery: query || null,
        researchTab: "keywords",
      },
    },
    {
      pane: args.pane,
      pathname: args.pathname,
      source: source(args.sourcePrefix, "research", args.pane),
    },
  )
}

export function openWorkspaceNewTabMessage(args: Omit<RunWorkspaceNewTabActionArgs, "type">) {
  openWorkspaceView(
    {
      type: "thread",
      id: "new",
      title: "New message",
      params: { compose: true },
    },
    {
      pane: args.pane === "left" ? "middle" : args.pane,
      tabMode: "new",
      pathname: args.pathname,
      source: source(args.sourcePrefix, "message", args.pane),
    },
  )
}

export function openWorkspaceNewTabSearchResult(
  item: GlobalSearchDocument,
  args: Omit<RunWorkspaceNewTabActionArgs, "type">,
): boolean {
  if (!args.queryClient) return false
  return openWorkspaceViewFromSearchDocument(item, {
    pane: args.pane,
    pathname: args.pathname,
    source: source(args.sourcePrefix, "result", args.pane),
    queryClient: args.queryClient,
  })
}

export function openWorkspaceNewTabShowAll(
  searchQuery: string,
  args: Omit<RunWorkspaceNewTabActionArgs, "type">,
) {
  const trimmed = searchQuery.trim()
  if (!trimmed) return
  openWorkspaceView(
    {
      type: "search-results",
      title: trimmed,
      params: { searchQuery: trimmed },
    },
    {
      pane: args.pane,
      pathname: args.pathname,
      source: source(args.sourcePrefix, "show-all", args.pane),
    },
  )
}

/** Run one quick action from the `+` menu or start pane. */
export function runWorkspaceNewTabAction(args: RunWorkspaceNewTabActionArgs) {
  const { type, ...rest } = args
  if (type === "browser") {
    openWorkspaceNewTabBrowser(rest)
    return
  }
  if (type === "ai") {
    openWorkspaceNewTabAi(rest)
    return
  }
  if (type === "research") {
    openWorkspaceNewTabResearch(rest)
    return
  }
  if (type === "message") {
    openWorkspaceNewTabMessage(rest)
    return
  }
  openWorkspaceNewTabList(type, rest)
}

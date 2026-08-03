"use client"

import { buildCenterPaneSelectionSearchParams } from "../../app/lib/center-pane-selection-url"
import { useCenterPaneTabsStore } from "../../app/store/center-pane-tabs"
import { shallowReplaceSearchParams } from "../../app/lib/tasks-shallow-nav"

/** Open or focus the reusable center-pane tab for a source (`source:<id>`). */
export function openSourceCenterTab(args: {
  sourceId: string
  title?: string | null
  pathname?: string
}): void {
  const sourceId = args.sourceId.trim()
  if (!sourceId) return
  useCenterPaneTabsStore.getState().upsertTab({
    kind: "source",
    id: sourceId,
    title: args.title,
  })
  const pathname =
    args.pathname ||
    (typeof window !== "undefined" ? window.location.pathname : "/")
  const current =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : new URLSearchParams()
  const next = buildCenterPaneSelectionSearchParams({
    currentSearchParams: current,
    entity: "source",
    id: sourceId,
  })
  const shellPath = pathname.startsWith("/sources") ? "/" : pathname
  shallowReplaceSearchParams(shellPath, next, "open-source-center-tab")
}

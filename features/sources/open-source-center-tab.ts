"use client"

import { openWorkspaceView } from "../../app/lib/open-workspace-view"
import type { WorkspacePaneId } from "../../app/lib/workspace-view"

/** Open or focus a source workspace tab (default: middle — established UX). */
export function openSourceCenterTab(args: {
  sourceId: string
  title?: string | null
  pathname?: string
  pane?: WorkspacePaneId
}): void {
  const sourceId = args.sourceId.trim()
  if (!sourceId) return
  const pathname =
    args.pathname ||
    (typeof window !== "undefined" ? window.location.pathname : "/")
  const shellPath = pathname.startsWith("/sources") ? "/" : pathname
  openWorkspaceView(
    {
      type: "source",
      sourceId,
      title: args.title,
    },
    {
      pane: args.pane ?? "middle",
      pathname: shellPath,
      source: "open-source-center-tab",
    },
  )
}

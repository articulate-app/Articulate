"use client"

import { buildCenterPaneSelectionSearchParams } from "../../app/lib/center-pane-selection-url"
import { useCenterPaneTabsStore } from "../../app/store/center-pane-tabs"
import { shallowReplaceSearchParams } from "../../app/lib/tasks-shallow-nav"

/** Open or focus the reusable center-pane tab for an artifact (`artifact:<id>`). */
export function openArtifactCenterTab(args: {
  artifactId: string
  title?: string | null
  version?: number | null
  /** Open the version history panel (restore older versions). */
  openHistory?: boolean
  pathname?: string
}): void {
  const artifactId = args.artifactId.trim()
  if (!artifactId) return
  useCenterPaneTabsStore.getState().upsertTab({
    kind: "artifact",
    id: artifactId,
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
    entity: "artifact",
    id: artifactId,
    version: args.version ?? null,
    openHistory: args.openHistory === true,
  })
  const shellPath = pathname.startsWith("/artifacts") ? "/" : pathname
  shallowReplaceSearchParams(shellPath, next, "open-artifact-center-tab")
}

"use client"

import { openWorkspaceView } from "../../app/lib/open-workspace-view"
import type { WorkspacePaneId } from "../../app/lib/workspace-view"

/** Open or focus an artifact workspace tab (default: middle — established UX). */
export function openArtifactCenterTab(args: {
  artifactId: string
  title?: string | null
  version?: number | null
  /** Open the version history panel (restore older versions). */
  openHistory?: boolean
  pathname?: string
  /** Target pane; defaults to middle to preserve existing UX. */
  pane?: WorkspacePaneId
}): void {
  const artifactId = args.artifactId.trim()
  if (!artifactId) return
  const pathname =
    args.pathname ||
    (typeof window !== "undefined" ? window.location.pathname : "/")
  const shellPath = pathname.startsWith("/artifacts") ? "/" : pathname
  openWorkspaceView(
    {
      type: "artifact",
      artifactId,
      title: args.title,
      params: {
        artifactVersion: args.version ?? null,
        openArtifactHistory: args.openHistory === true,
      },
    },
    {
      pane: args.pane ?? "middle",
      pathname: shellPath,
      source: "open-artifact-center-tab",
    },
  )
}

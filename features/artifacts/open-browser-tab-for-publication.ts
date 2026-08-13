"use client"

import { openWorkspaceView } from "../../app/lib/open-workspace-view"
import {
  findBrowserTabForPublication,
  useRightPaneTabsStore,
} from "../../app/store/right-pane-tabs"
import type { WorkspacePaneId } from "../../app/lib/workspace-view"

export function openBrowserTabForPublication(args: {
  publicationRunId: string
  liveViewUrl?: string | null
  destinationId?: string | null
  destinationName?: string | null
  artifactId?: string | null
  pathname?: string
  /** When false, associate the peer Browser tab but keep AI active (chat preview mode). */
  activate?: boolean
  phase?: string | null
  /** Target pane; defaults to right to preserve existing UX. */
  pane?: WorkspacePaneId
}): string {
  const activate = args.activate !== false
  const pane = args.pane ?? "right"
  const store = useRightPaneTabsStore.getState()
  const existing = findBrowserTabForPublication(store.tabs, {
    publicationRunId: args.publicationRunId,
    destinationId: args.destinationId,
  })
  const id =
    existing?.key.replace(/^browser:/, "") ||
    (typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `pub-${Date.now()}`)

  const key = store.upsertTab({
    kind: "browser",
    id,
    title: args.destinationName || "Browser",
    browser: {
      publicationRunId: args.publicationRunId,
      liveViewUrl: args.liveViewUrl ?? null,
      destinationId: args.destinationId ?? null,
      destinationName: args.destinationName ?? null,
      artifactId: args.artifactId ?? null,
      phase: args.phase ?? "running",
      intentionallyStopped: false,
    },
    activate,
  })

  if (activate) {
    openWorkspaceView(
      {
        type: "browser",
        id: key.replace(/^browser:/, ""),
        title: args.destinationName || "Browser",
        params: {
          browserTabId: key.replace(/^browser:/, ""),
          publicationRunId: args.publicationRunId,
          keepAiOpen: true,
          phase: args.phase ?? "running",
        },
      },
      {
        pane,
        pathname: args.pathname,
        source: "ai-publish-open-browser",
      },
    )
  } else {
    // Ensure AI remains the active peer tab while the Browser tab exists for later Open.
    store.upsertTab({ kind: "ai", activate: true })
  }
  return key
}

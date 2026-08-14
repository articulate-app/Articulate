/**
 * Open a URL in the in-app Browser workspace pane (Local/Cloud session).
 */

"use client"

import { beginManualBrowserOpen } from "./open-browser-session"
import { openWorkspaceView } from "./open-workspace-view"
import type { WorkspacePaneId } from "./workspace-view"

function browserTitleFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "") || "Browser"
  } catch {
    return "Browser"
  }
}

export function openUrlInWorkspaceBrowser(args: {
  url: string
  pane: WorkspacePaneId
  title?: string | null
  source?: string
}): string {
  const startUrl = args.url.trim()
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `browser-${Date.now()}`
  const title = args.title?.trim() || browserTitleFromUrl(startUrl)

  beginManualBrowserOpen(id, {
    startUrl,
    source: "manual",
    profileKey: "template-link",
  })

  openWorkspaceView(
    {
      type: "browser",
      id,
      title,
      params: {
        browserTabId: id,
        keepAiOpen: true,
        phase: "provisioning",
      },
    },
    {
      pane: args.pane,
      tabMode: "new",
      source: args.source ?? "template-link-browser",
    },
  )

  return id
}

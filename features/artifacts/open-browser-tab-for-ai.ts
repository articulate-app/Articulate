"use client"

import { openWorkspaceView } from "../../app/lib/open-workspace-view"
import {
  findBrowserTabForAiSession,
  useRightPaneTabsStore,
} from "../../app/store/right-pane-tabs"
import type { WorkspacePaneId } from "../../app/lib/workspace-view"

function keepExistingReadyPhase(current: string | null | undefined, next: string): string {
  if (current === "ready" || current === "desktop_ready") return current
  return next
}

export function openBrowserTabForAiSession(args: {
  browserSessionId: string
  browserId?: string | null
  sessionId?: string | null
  liveViewUrl?: string | null
  startUrl?: string | null
  currentUrl?: string | null
  title?: string | null
  provider?: string | null
  phase?: string | null
  activate?: boolean
  pane?: WorkspacePaneId
}): string {
  const activate = args.activate !== false
  const pane = args.pane ?? "right"
  const store = useRightPaneTabsStore.getState()
  const existing = findBrowserTabForAiSession(store.tabs, {
    browserSessionId: args.browserSessionId,
    browserId: args.browserId,
  })
  const id =
    existing?.key.replace(/^browser:/, "") ||
    args.browserSessionId ||
    (typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `ai-browser-${Date.now()}`)
  const desktop =
    args.provider === "articulate_desktop" || args.provider === "browser_use_local"
  const inferredPhase =
    args.phase
    ?? (args.liveViewUrl
      ? "ready"
      : desktop
        ? "provisioning"
        : args.browserId
          ? "ready"
          : "provisioning")
  const phase = keepExistingReadyPhase(existing?.browser?.phase, inferredPhase)
  const title = args.title?.trim() || existing?.title || "Browser"
  const currentUrl =
    args.currentUrl ?? args.startUrl ?? existing?.browser?.currentUrl ?? null

  const key = store.upsertTab({
    kind: "browser",
    id,
    title,
    browser: {
      aiOperationId: args.browserSessionId,
      browserId: args.browserId ?? existing?.browser?.browserId ?? null,
      sessionId: args.sessionId ?? existing?.browser?.sessionId ?? null,
      liveViewUrl: args.liveViewUrl ?? existing?.browser?.liveViewUrl ?? null,
      currentUrl,
      pageTitle: title,
      provider: args.provider ?? existing?.browser?.provider ?? null,
      source: "ai",
      phase,
      intentionallyStopped: false,
    },
    activate,
  })

  if (activate) {
    openWorkspaceView(
      {
        type: "browser",
        id: key.replace(/^browser:/, ""),
        title,
        params: {
          browserTabId: key.replace(/^browser:/, ""),
          keepAiOpen: true,
          phase,
        },
      },
      {
        pane,
        source: "ai-open-browser",
      },
    )
  } else if (store.activeKey !== key) {
    store.upsertTab({ kind: "ai", activate: true })
  }
  return key
}

import { applyWorkspaceViewToSearchParams } from "./workspace-pane-url"
import type { WorkspacePaneId } from "./workspace-view"

/**
 * URL helper: open an AI thread in a workspace pane (default: right — established UX).
 * Prefer `openWorkspaceView({ type: "ai", … }, { pane })` from UI call sites.
 */
export function applyAiThreadOpenParams(
  current: URLSearchParams,
  threadId: string,
  options?: { pane?: WorkspacePaneId },
): URLSearchParams {
  const pane = options?.pane ?? "right"
  const trimmed = typeof threadId === "string" ? threadId.trim() : ""
  return applyWorkspaceViewToSearchParams({
    current,
    pane,
    type: "ai",
    id: trimmed || undefined,
    params: trimmed
      ? { aiThreadId: trimmed }
      : { forceNewAiThread: true },
  })
}

export function buildNewAiThreadParams(
  current: URLSearchParams,
  options?: { pane?: WorkspacePaneId },
): URLSearchParams {
  return applyWorkspaceViewToSearchParams({
    current,
    pane: options?.pane ?? "right",
    type: "ai",
    params: { forceNewAiThread: true },
  })
}

/** URL helpers for first-class Browser tabs in the right pane (`rightView=browser`). */

function ensureRightPaneInLayout(searchParams: URLSearchParams): void {
  const layout = new Set((searchParams.get("layout") || "left,middle").split(",").filter(Boolean))
  layout.add("right")
  searchParams.set("layout", Array.from(layout).join(","))
}

export function isBrowserPaneOpen(searchParams: URLSearchParams): boolean {
  const view = searchParams.get("rightView")
  return view === "browser" || view === "publishing"
}

export function buildOpenBrowserPaneParams(
  current: URLSearchParams,
  options?: {
    browserTabId?: string | null
    publicationRunId?: string | null
    artifactId?: string | null
    keepAiOpen?: boolean
  },
): URLSearchParams {
  const next = new URLSearchParams(current.toString())
  ensureRightPaneInLayout(next)
  next.set("rightView", "browser")
  // Browser is a peer tab beside AI — not solo AI focus. Clear aiFocus so the
  // shell can show middle (artifact) + right (browser) instead of a full-bleed
  // black/empty right column.
  next.delete("aiFocus")
  if (options?.keepAiOpen) {
    next.set("taskAiOpen", "true")
  }
  if (options?.browserTabId) next.set("browserTabId", options.browserTabId)
  else if (options && "browserTabId" in options && options.browserTabId == null) {
    next.delete("browserTabId")
  }
  if (options?.publicationRunId) next.set("publicationRunId", options.publicationRunId)
  else if (options && "publicationRunId" in options && options.publicationRunId == null) {
    next.delete("publicationRunId")
  }
  if (options?.artifactId) {
    next.set("centerArtifactId", options.artifactId)
    next.set("object", next.get("object") || "artifact")
  }
  // Solo-right (AI focus or layout=right) → restore middle so the artifact stays visible
  // while the Browser tab provisions Live View.
  const layout = next.get("layout") || ""
  if (layout === "right" || next.get("focus") === "right") {
    next.set("layout", "middle,right")
    if (next.get("focus") === "right") next.delete("focus")
  }
  return next
}

export function buildCloseBrowserPaneParams(current: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(current.toString())
  next.delete("publicationRunId")
  next.delete("browserTabId")
  if (next.get("rightView") === "browser" || next.get("rightView") === "publishing") {
    next.set("rightView", next.get("taskAiOpen") === "true" ? "ai" : "details")
  }
  return next
}

export function setPublicationRunIdInBrowserParams(
  current: URLSearchParams,
  publicationRunId: string | null,
  browserTabId?: string | null,
): URLSearchParams {
  const next = new URLSearchParams(current.toString())
  if (publicationRunId) next.set("publicationRunId", publicationRunId)
  else next.delete("publicationRunId")
  if (browserTabId) next.set("browserTabId", browserTabId)
  if (publicationRunId || browserTabId) {
    ensureRightPaneInLayout(next)
    next.set("rightView", "browser")
  }
  return next
}

/** @deprecated Prefer browser pane helpers. Kept for callers still using publishing URLs. */
export {
  isBrowserPaneOpen as isPublishingPaneOpen,
  buildOpenBrowserPaneParams as buildOpenPublishingPaneParams,
  buildCloseBrowserPaneParams as buildClosePublishingPaneParams,
  setPublicationRunIdInBrowserParams as setPublicationRunIdInParams,
}

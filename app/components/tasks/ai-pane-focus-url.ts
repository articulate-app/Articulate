export function buildAiPaneFocusParams(current: URLSearchParams, shouldFocus: boolean): URLSearchParams {
  const next = shouldFocus
    ? migrateThreadSelectionToCenterPane(new URLSearchParams(current.toString()))
    : new URLSearchParams(current.toString())
  if (shouldFocus) {
    // Solo AI pane: hide left/middle columns in the layout param itself.
    next.set("layout", "right")
    next.set("rightView", "ai")
    next.set("taskAiOpen", "true")
    next.set("aiFocus", "true")
    return next
  }
  next.delete("aiFocus")
  // Restore a normal 3-pane shell when leaving focus if we were solo-right.
  if ((next.get("layout") || "") === "right") {
    next.set("layout", "left,middle,right")
  }
  return next
}

export function isAiPaneFocusMode(searchParams: URLSearchParams): boolean {
  return searchParams.get("aiFocus") === "true"
}

/** Task details expanded to fill the workspace (`focus=right`). */
export function isTaskDetailsFocusContext(searchParams: URLSearchParams): boolean {
  return searchParams.get("focus") === "right"
}

/** Focused task details only — no AI pane (`focus=right`, `rightView=details`). */
export function isTaskDetailsOnlyFocusMode(searchParams: URLSearchParams): boolean {
  return isTaskDetailsFocusContext(searchParams) && (searchParams.get("rightView") || "details") === "details"
}

/**
 * Middle (details) pane fills the workspace.
 * Prefer `focus=middle` so expanding does not rewrite `rightView` / destroy the right tool pane.
 * Legacy: `focus=right` + `rightView=details` (pre–multi-pane entity host).
 */
export function isMiddlePaneFocusMode(searchParams: URLSearchParams): boolean {
  if (searchParams.get("focus") === "middle") return true
  return isTaskDetailsOnlyFocusMode(searchParams)
}

/** Toggle middle-pane focus without mutating right-pane tool/entity params. */
export function buildMiddlePaneFocusParams(
  current: URLSearchParams,
  shouldFocus: boolean,
): URLSearchParams {
  const next = new URLSearchParams(current.toString())
  if (shouldFocus) {
    next.set("focus", "middle")
    // Ensure the middle column exists in layout; never clobber rightView / taskAiOpen.
    const layout = new Set((next.get("layout") || "left,middle").split(",").filter(Boolean))
    layout.add("middle")
    next.set("layout", Array.from(layout).join(","))
    return next
  }
  next.delete("focus")
  return next
}

/** Focused task details + AI split — hide task list, show details left and AI right. */
export function isTaskDetailsAiSplitMode(searchParams: URLSearchParams): boolean {
  return (
    isTaskDetailsFocusContext(searchParams)
    && searchParams.get("rightView") === "ai"
    && searchParams.get("taskAiOpen") === "true"
  )
}

export function hasTaskSelectionInUrl(searchParams: URLSearchParams): boolean {
  const id = searchParams.get("id") ?? searchParams.get("centerTaskId")
  return Boolean(id && id.trim().length > 0)
}

/**
 * AI chat is open as an active workspace view (right or middle).
 * Prefer this over assuming AI only lives in the right column.
 */
export function isTaskAiPaneOpen(searchParams: URLSearchParams): boolean {
  if (searchParams.get("centerView") === "ai") return true
  return searchParams.get("rightView") === "ai" && searchParams.get("taskAiOpen") === "true"
}

function ensureRightPaneInLayout(searchParams: URLSearchParams): void {
  const layout = new Set((searchParams.get("layout") || "left,middle").split(",").filter(Boolean))
  layout.add("right")
  searchParams.set("layout", Array.from(layout).join(","))
}

/**
 * Apply URL params after creating a task. Preserves AI pane state when it was already open.
 */
export function applyCreatedTaskSelectionUrlParams(
  current: URLSearchParams,
  taskId: string | number,
): URLSearchParams {
  const next = new URLSearchParams(current.toString())
  next.set("id", String(taskId))
  next.delete("itemKind")
  next.delete("detailType")
  next.delete("detailId")
  next.delete("briefingTypeId")

  if (isTaskAiPaneOpen(next)) {
    ensureRightPaneInLayout(next)
    return next
  }

  next.set("rightView", "details")
  next.set("taskAiOpen", "false")
  next.delete("aiThreadId")
  next.delete("chatMode")
  next.delete("chatPreFill")
  next.delete("chatComponentId")
  return next
}

/**
 * When AI owns the right column, thread details must live in center* params.
 * Migrates legacy `rightThreadId` / `rightMentionId` so the AI pane is not blocked.
 */
export function migrateThreadSelectionToCenterPane(current: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(current.toString())
  const rightThreadId = next.get("rightThreadId")?.trim()
  if (!rightThreadId) return next
  if (!next.get("centerThreadId")) {
    next.set("centerThreadId", rightThreadId)
  }
  const rightMentionId = next.get("rightMentionId")?.trim()
  if (rightMentionId && !next.get("centerMentionId")) {
    next.set("centerMentionId", rightMentionId)
  }
  next.delete("rightThreadId")
  next.delete("rightMentionId")
  return next
}

/** When opening AI from focused task details, keep `focus=right` for the details+AI split layout. */
export function preserveTaskDetailsFocusWhenOpeningAi(current: URLSearchParams): URLSearchParams {
  const next = migrateThreadSelectionToCenterPane(new URLSearchParams(current.toString()))
  const layout = new Set((next.get("layout") || "left,middle").split(",").filter(Boolean))
  layout.add("right")
  next.set("layout", Array.from(layout).join(","))
  next.set("taskAiOpen", "true")
  next.set("rightView", "ai")
  if (isTaskDetailsFocusContext(next) && hasTaskSelectionInUrl(next)) {
    next.set("focus", "right")
  }
  return next
}

export function buildAiPaneFocusParams(current: URLSearchParams, shouldFocus: boolean): URLSearchParams {
  const next = new URLSearchParams(current.toString())
  if (shouldFocus) {
    const layout = new Set((next.get("layout") || "left,middle").split(",").filter(Boolean))
    layout.add("right")
    next.set("layout", Array.from(layout).join(","))
    next.set("rightView", "ai")
    next.set("taskAiOpen", "true")
    next.set("aiFocus", "true")
    return next
  }
  next.delete("aiFocus")
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

/** Task AI pane is open in the right column (`rightView=ai` + `taskAiOpen=true`). */
export function isTaskAiPaneOpen(searchParams: URLSearchParams): boolean {
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

/** When opening AI from focused task details, keep `focus=right` for the details+AI split layout. */
export function preserveTaskDetailsFocusWhenOpeningAi(current: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(current.toString())
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

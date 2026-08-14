import type { TasksSplitOrientation } from "./tasks-split-orientation"

export type TasksMainViewMode = "list" | "calendar" | "kanban"

export type TasksSplitViewState = {
  primaryView: TasksMainViewMode
  isSplit: boolean
  secondaryView: TasksMainViewMode
  splitOrientation: TasksSplitOrientation
}

function isMainViewMode(value: string | null | undefined): value is TasksMainViewMode {
  return value === "list" || value === "calendar" || value === "kanban"
}

function getDefaultSecondaryView(primaryView: TasksMainViewMode): TasksMainViewMode {
  if (primaryView === "list") return "calendar"
  return "list"
}

function normalizeSecondaryView(
  primaryView: TasksMainViewMode,
  candidate: string | null | undefined,
): TasksMainViewMode {
  const parsed = isMainViewMode(candidate) ? candidate : getDefaultSecondaryView(primaryView)
  if (parsed === primaryView) return getDefaultSecondaryView(primaryView)
  return parsed
}

export { normalizeSecondaryView }

function parseSplitOrientation(
  params: URLSearchParams,
  layoutParam: string[],
): TasksSplitOrientation {
  const splitOrientationParam = params.get("splitOrientation")
  if (splitOrientationParam === "horizontal" || splitOrientationParam === "vertical") {
    return splitOrientationParam
  }
  if (layoutParam.join(",") === "left,right") return "horizontal"
  return "vertical"
}

/**
 * Parse tasks list|calendar|kanban split URL state.
 * Workspace shell `layout=left,middle,right` must not imply tasks-internal split.
 */
export function parseTasksSplitViewState(params: URLSearchParams): TasksSplitViewState {
  const tasksView = params.get("tasksView")
  const topView = params.get("topView")
  const bottomView = params.get("bottomView")
  const splitView = params.get("splitView")
  const rightSplitView = params.get("rightSplitView")
  const splitParam = params.get("split")
  const layoutParam = (params.get("layout") || "").split(",").filter(Boolean)
  const legacyMiddle = params.get("middleView")
  const splitOrientation = parseSplitOrientation(params, layoutParam)
  const layoutKey = layoutParam.join(",")

  const hasNewModelHints =
    isMainViewMode(tasksView) ||
    isMainViewMode(topView) ||
    splitParam === "true" ||
    layoutKey === "top,bottom" ||
    layoutKey === "left,right" ||
    isMainViewMode(bottomView) ||
    isMainViewMode(splitView) ||
    isMainViewMode(rightSplitView)

  if (hasNewModelHints) {
    const primaryView =
      (isMainViewMode(tasksView) && tasksView) || (isMainViewMode(topView) && topView) || "list"
    const isSplit =
      splitParam === "true" || layoutKey === "top,bottom" || layoutKey === "left,right"
    const secondaryView = normalizeSecondaryView(
      primaryView,
      rightSplitView || splitView || bottomView,
    )
    return { primaryView, isSplit, secondaryView, splitOrientation }
  }

  // Legacy planner URLs only: left+middle with an explicit middleView calendar/kanban.
  // Skip when modern workspace shell params are present (`leftPaneView`, `centerView`, etc.).
  if (
    layoutParam.includes("left") &&
    layoutParam.includes("middle") &&
    (legacyMiddle === "calendar" || legacyMiddle === "kanban") &&
    !params.get("leftPaneView") &&
    !params.get("centerView") &&
    !params.get("rightView")
  ) {
    return {
      primaryView: "list",
      isSplit: true,
      secondaryView: legacyMiddle,
      splitOrientation: "vertical",
    }
  }

  if (layoutParam.includes("middle") && !layoutParam.includes("left")) {
    const primaryView =
      legacyMiddle === "kanban" ? "kanban" : legacyMiddle === "calendar" ? "calendar" : "list"
    return {
      primaryView,
      isSplit: false,
      secondaryView: getDefaultSecondaryView(primaryView === "list" ? "list" : primaryView),
      splitOrientation: "vertical",
    }
  }

  return { primaryView: "list", isSplit: false, secondaryView: "calendar", splitOrientation: "vertical" }
}

/** Write tasks-internal split params without wiping a modern workspace shell layout. */
export function applyTasksSplitViewState(
  params: URLSearchParams,
  state: TasksSplitViewState,
): URLSearchParams {
  const next = new URLSearchParams(params.toString())
  next.set("tasksView", state.primaryView)
  next.set("topView", state.primaryView)
  next.delete("view")

  if (state.isSplit) {
    next.set("split", "true")
    next.set("splitView", state.secondaryView)
    next.set("splitOrientation", state.splitOrientation)

    if (state.splitOrientation === "horizontal") {
      next.set("layout", "left,right")
      next.set("leftView", state.primaryView)
      next.set("rightSplitView", state.secondaryView)
      next.delete("bottomView")
    } else {
      next.set("layout", "top,bottom")
      next.set("bottomView", state.secondaryView)
      next.delete("rightSplitView")
      next.delete("leftView")
    }
  } else {
    next.delete("split")
    next.delete("splitOrientation")
    next.delete("splitView")
    next.delete("rightSplitView")
    next.delete("bottomView")
    next.delete("topView")
    next.delete("leftView")
    const currentLayout = (params.get("layout") || "").split(",").filter(Boolean)
    const layoutKey = currentLayout.join(",")
    const isTasksSplitLayout = layoutKey === "top,bottom" || layoutKey === "left,right"
    if (isTasksSplitLayout) {
      const keepRight =
        next.get("taskAiOpen") === "true" ||
        Boolean(next.get("rightView") && next.get("rightView") !== "details")
      next.set("layout", keepRight ? "left,middle,right" : "left,middle")
    }
  }

  next.delete("middleView")
  return next
}

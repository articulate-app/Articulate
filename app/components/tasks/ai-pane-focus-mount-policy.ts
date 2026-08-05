export function getInitialSplitLayoutMountState(isAiFocusModeEnabled: boolean): boolean {
  return !isAiFocusModeEnabled
}

/**
 * Keep the 3-pane group mounted while AI focus is on so AiPane does not remount/refetch.
 * Focus is applied by resizing panels to 0/0/100 (see TasksLayout).
 */
export function shouldRenderSplitLayout(args: {
  isAiFocusModeEnabled: boolean
  hasMountedSplitLayout: boolean
}): boolean {
  return !args.isAiFocusModeEnabled || args.hasMountedSplitLayout
}

export function nextSplitLayoutMountStateOnToggle(args: {
  isAiFocusModeEnabled: boolean
  hasMountedSplitLayout: boolean
}): boolean {
  void args.isAiFocusModeEnabled
  // Always keep split mounted after the first mount — expand/collapse is size-only.
  return true
}

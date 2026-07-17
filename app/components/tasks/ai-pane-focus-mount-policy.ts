export function getInitialSplitLayoutMountState(isAiFocusModeEnabled: boolean): boolean {
  return !isAiFocusModeEnabled
}

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
  if (!args.isAiFocusModeEnabled) return true
  return true
}

type AiPaneFocusLayoutChromeArgs = {
  isAiFocusModeEnabled: boolean
  isTaskDetailsAiSplitMode?: boolean
  showDetailsPanel: boolean
  showAiPanel: boolean
}

export function getAiPaneFocusLayoutChrome({
  isAiFocusModeEnabled,
  isTaskDetailsAiSplitMode = false,
  showDetailsPanel,
  showAiPanel,
}: AiPaneFocusLayoutChromeArgs) {
  return {
    showPrimaryDivider:
      !isAiFocusModeEnabled
      && !isTaskDetailsAiSplitMode
      && (showDetailsPanel || showAiPanel),
    showSecondaryDivider:
      !isAiFocusModeEnabled && showDetailsPanel && showAiPanel,
    showAiPanelLeftBorder: !isAiFocusModeEnabled && !isTaskDetailsAiSplitMode,
  }
}

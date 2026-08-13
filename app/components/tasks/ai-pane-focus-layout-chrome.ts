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
    // Dividers use border-r on the preceding pane so scrollbars stay flush; no border-l on AI.
    showAiPanelLeftBorder: false,
  }
}

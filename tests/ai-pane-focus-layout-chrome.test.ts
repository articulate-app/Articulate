import { describe, expect, it } from "vitest"
import { getAiPaneFocusLayoutChrome } from "../app/components/tasks/ai-pane-focus-layout-chrome"

describe("ai-pane-focus-layout-chrome", () => {
  it("hides split dividers and ai border in focus mode", () => {
    const chrome = getAiPaneFocusLayoutChrome({
      isAiFocusModeEnabled: true,
      showDetailsPanel: true,
      showAiPanel: true,
    })

    expect(chrome.showPrimaryDivider).toBe(false)
    expect(chrome.showSecondaryDivider).toBe(false)
    expect(chrome.showAiPanelLeftBorder).toBe(false)
  })

  it("shows split chrome in regular mode", () => {
    const chrome = getAiPaneFocusLayoutChrome({
      isAiFocusModeEnabled: false,
      showDetailsPanel: true,
      showAiPanel: true,
    })

    expect(chrome.showPrimaryDivider).toBe(true)
    expect(chrome.showSecondaryDivider).toBe(true)
    expect(chrome.showAiPanelLeftBorder).toBe(false)
  })
})

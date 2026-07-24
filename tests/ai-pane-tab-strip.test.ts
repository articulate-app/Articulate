import { describe, expect, it } from "vitest"
import { AI_PANE_TAB_ACTIVE_CLASS, AI_PANE_TAB_FILLER_CLASS, AI_PANE_TAB_INACTIVE_CLASS, AI_PANE_TAB_STRIP_CLASS } from "../features/ai-chat/tab-strip-tokens"

describe("ai-pane-tab-strip", () => {
  it("does not include a duplicate left border class", () => {
    expect(AI_PANE_TAB_STRIP_CLASS).not.toContain("border-l")
  })

  it("keeps the bottom rule off active tabs", () => {
    expect(AI_PANE_TAB_ACTIVE_CLASS).toContain("border-b-transparent")
    expect(AI_PANE_TAB_ACTIVE_CLASS.split(/\s+/)).not.toContain("border-transparent")
    expect(AI_PANE_TAB_INACTIVE_CLASS).toContain("border-gray-200")
    expect(AI_PANE_TAB_FILLER_CLASS).toContain("border-gray-200")
  })
})

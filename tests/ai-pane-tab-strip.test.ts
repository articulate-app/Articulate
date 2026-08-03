import { describe, expect, it } from "vitest"
import {
  AI_PANE_TAB_ACTIVE_CLASS,
  AI_PANE_TAB_FILLER_CLASS,
  AI_PANE_TAB_INACTIVE_CLASS,
  AI_PANE_TAB_STRIP_CLASS,
} from "../features/ai-chat/tab-strip-tokens"

describe("ai-pane-tab-strip", () => {
  it("does not include a duplicate left border class", () => {
    expect(AI_PANE_TAB_STRIP_CLASS).not.toContain("border-l")
  })

  it("hides only the active tab bottom border while keeping side borders intact", () => {
    expect(AI_PANE_TAB_ACTIVE_CLASS).toContain("border-b-white")
    expect(AI_PANE_TAB_ACTIVE_CLASS).toContain("-mb-px")
    expect(AI_PANE_TAB_ACTIVE_CLASS.split(/\s+/)).not.toContain("border-white")
    expect(AI_PANE_TAB_INACTIVE_CLASS.split(/\s+/)).not.toContain("border-b")
    expect(AI_PANE_TAB_FILLER_CLASS.split(/\s+/)).not.toContain("border-b")
  })
})

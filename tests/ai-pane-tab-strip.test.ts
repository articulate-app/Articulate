import { describe, expect, it } from "vitest"
import { AI_PANE_TAB_STRIP_CLASS } from "../features/ai-chat/tab-strip-tokens"

describe("ai-pane-tab-strip", () => {
  it("does not include a duplicate left border class", () => {
    expect(AI_PANE_TAB_STRIP_CLASS).not.toContain("border-l")
  })
})

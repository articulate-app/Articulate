import { describe, expect, it } from "vitest"
import {
  AI_PANE_TAB_ACTIVE_CLASS,
  AI_PANE_TAB_CHIP_CLASS,
  AI_PANE_TAB_CHROME_CLASS,
  AI_PANE_TAB_FILLER_CLASS,
  AI_PANE_TAB_INACTIVE_CLASS,
  AI_PANE_TAB_ROW_CLASS,
  AI_PANE_TAB_SCROLL_CLASS,
  AI_PANE_TAB_STRIP_CLASS,
} from "../features/ai-chat/tab-strip-tokens"

describe("ai-pane-tab-strip", () => {
  it("keeps a minimal Cursor-like tab strip without heavy chrome borders", () => {
    expect(AI_PANE_TAB_STRIP_CLASS).not.toContain("border-l")
    expect(AI_PANE_TAB_ROW_CLASS).toContain("h-10")
    expect(AI_PANE_TAB_ROW_CLASS).toContain("border-b")
    expect(AI_PANE_TAB_SCROLL_CLASS).not.toContain("pb-px")
    expect(AI_PANE_TAB_SCROLL_CLASS).not.toContain("-mb-px")

    expect(AI_PANE_TAB_CHIP_CLASS).toContain("rounded-md")
    expect(AI_PANE_TAB_CHIP_CLASS.split(/\s+/)).not.toContain("border-r")
    expect(AI_PANE_TAB_ACTIVE_CLASS).toContain("bg-gray-100")
    expect(AI_PANE_TAB_ACTIVE_CLASS.split(/\s+/)).not.toContain("-mb-px")
    expect(AI_PANE_TAB_INACTIVE_CLASS).toContain("text-gray-500")
    expect(AI_PANE_TAB_FILLER_CLASS.split(/\s+/)).not.toContain("border-b")
    expect(AI_PANE_TAB_CHROME_CLASS.split(/\s+/)).not.toContain("border-b")
  })
})

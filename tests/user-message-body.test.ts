import { describe, expect, it } from "vitest"
import {
  shouldCollapseUserMessage,
  USER_MESSAGE_COLLAPSE_CHAR_THRESHOLD,
} from "../features/ai-chat/user-message-collapse"

describe("UserMessageBody collapse helpers", () => {
  it("collapses only messages above the threshold", () => {
    expect(shouldCollapseUserMessage("a".repeat(USER_MESSAGE_COLLAPSE_CHAR_THRESHOLD))).toBe(false)
    expect(shouldCollapseUserMessage("a".repeat(USER_MESSAGE_COLLAPSE_CHAR_THRESHOLD + 1))).toBe(true)
  })
})

import { describe, expect, it } from "vitest"
import {
  nextHoldEmptyComposer,
  shouldCenterAiComposer,
} from "../features/ai-chat/ai-composer-empty-state"

describe("shouldCenterAiComposer", () => {
  it("stays centered on a new draft with no messages", () => {
    expect(
      shouldCenterAiComposer({
        messageCount: 0,
        isMessagesLoading: false,
        hasPersistedThreadId: false,
        holdEmptyComposer: true,
      }),
    ).toBe(true)
  })

  it("stays centered after the thread is persisted but before the first send", () => {
    expect(
      shouldCenterAiComposer({
        messageCount: 0,
        isMessagesLoading: true,
        hasPersistedThreadId: true,
        holdEmptyComposer: true,
      }),
    ).toBe(true)
  })

  it("docks after the first message", () => {
    expect(
      shouldCenterAiComposer({
        messageCount: 1,
        isMessagesLoading: false,
        hasPersistedThreadId: true,
        holdEmptyComposer: true,
      }),
    ).toBe(false)
  })

  it("does not flash the empty composer while loading an existing thread", () => {
    expect(
      shouldCenterAiComposer({
        messageCount: 0,
        isMessagesLoading: true,
        hasPersistedThreadId: true,
        holdEmptyComposer: false,
      }),
    ).toBe(false)
  })
})

describe("nextHoldEmptyComposer", () => {
  it("keeps the hold when a draft is persisted", () => {
    expect(
      nextHoldEmptyComposer({
        previousThreadId: "temp-123",
        nextThreadId: "0834d7d5-6efd-44c4-b5fc-0b1cb6d6fa53",
        messageCount: 0,
        previousHold: true,
      }),
    ).toBe(true)
  })

  it("drops the hold when switching to another persisted thread", () => {
    expect(
      nextHoldEmptyComposer({
        previousThreadId: "0834d7d5-6efd-44c4-b5fc-0b1cb6d6fa53",
        nextThreadId: "1e2c1811-d13b-4875-9b03-48b89379c465",
        messageCount: 0,
        previousHold: true,
      }),
    ).toBe(false)
  })
})

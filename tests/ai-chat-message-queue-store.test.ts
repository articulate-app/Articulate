import { beforeEach, describe, expect, it } from "vitest"
import { useAiChatMessageQueueStore } from "../features/ai-chat/ai-chat-message-queue-store"

describe("ai-chat-message-queue-store", () => {
  beforeEach(() => {
    useAiChatMessageQueueStore.setState({ byThread: {} })
  })

  it("reorders with move and moveToIndex", () => {
    const threadId = "thread-a"
    const a = useAiChatMessageQueueStore.getState().enqueue({
      threadId,
      messageText: "first",
      messageTags: [],
      messageSegments: [],
    })
    const b = useAiChatMessageQueueStore.getState().enqueue({
      threadId,
      messageText: "second",
      messageTags: [],
      messageSegments: [],
    })
    const c = useAiChatMessageQueueStore.getState().enqueue({
      threadId,
      messageText: "third",
      messageTags: [],
      messageSegments: [],
    })

    useAiChatMessageQueueStore.getState().move(threadId, c, -1)
    expect(useAiChatMessageQueueStore.getState().byThread[threadId]?.map((m) => m.id)).toEqual([
      a,
      c,
      b,
    ])

    useAiChatMessageQueueStore.getState().moveToIndex(threadId, c, 0)
    expect(useAiChatMessageQueueStore.getState().byThread[threadId]?.map((m) => m.id)).toEqual([
      c,
      a,
      b,
    ])
  })

  it("inserts at a clamped index", () => {
    const threadId = "thread-insert"
    useAiChatMessageQueueStore.getState().enqueue({
      threadId,
      messageText: "first",
      messageTags: [],
      messageSegments: [],
    })
    useAiChatMessageQueueStore.getState().enqueue({
      threadId,
      messageText: "third",
      messageTags: [],
      messageSegments: [],
    })
    useAiChatMessageQueueStore.getState().insertAt(threadId, 1, {
      threadId,
      messageText: "second",
      messageTags: [],
      messageSegments: [],
    })
    expect(
      useAiChatMessageQueueStore.getState().byThread[threadId]?.map((m) => m.messageText),
    ).toEqual(["first", "second", "third"])
  })

  it("prepends a failed drain without duplicating", () => {
    const threadId = "thread-b"
    const id = useAiChatMessageQueueStore.getState().enqueue({
      threadId,
      messageText: "queued",
      messageTags: [],
      messageSegments: [],
    })
    const item = useAiChatMessageQueueStore.getState().shiftNext(threadId)
    expect(item?.id).toBe(id)
    expect(useAiChatMessageQueueStore.getState().byThread[threadId]).toBeUndefined()

    useAiChatMessageQueueStore.getState().prepend(item!)
    useAiChatMessageQueueStore.getState().prepend(item!)
    expect(useAiChatMessageQueueStore.getState().byThread[threadId]?.map((m) => m.id)).toEqual([id])
  })
})

import { describe, expect, it } from "vitest"
import { isPersistedAiThreadId, toPersistedAiThreadId } from "../features/ai-chat/thread-id"

describe("ai-thread-id guards", () => {
  it("accepts valid UUID thread ids", () => {
    const threadId = "550e8400-e29b-41d4-a716-446655440000"
    expect(isPersistedAiThreadId(threadId)).toBe(true)
    expect(toPersistedAiThreadId(threadId)).toBe(threadId)
  })

  it("rejects optimistic temp ids", () => {
    const tempId = "temp-1779703647177-tetkjr13k"
    expect(isPersistedAiThreadId(tempId)).toBe(false)
    expect(toPersistedAiThreadId(tempId)).toBeNull()
  })

  it("rejects empty or malformed ids", () => {
    expect(isPersistedAiThreadId("")).toBe(false)
    expect(isPersistedAiThreadId("thread-a")).toBe(false)
    expect(toPersistedAiThreadId(undefined)).toBeNull()
    expect(toPersistedAiThreadId(null)).toBeNull()
  })
})

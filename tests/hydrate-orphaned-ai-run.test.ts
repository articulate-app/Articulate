import { describe, expect, it } from "vitest"
import {
  buildHydratedFailedAssistantMessage,
  shouldHydrateOrphanedAiRun,
  terminalKindForOrphanedRunStatus,
  type OrphanedAiChatRunRow,
} from "../features/ai-chat/hydrate-orphaned-ai-run"

const USER_MESSAGE_ID = "1b85283c-6d64-4cdc-850c-417d37d2cc40"

function failedRun(overrides: Partial<OrphanedAiChatRunRow> = {}): OrphanedAiChatRunRow {
  return {
    id: "8bb7d358-ac53-4d4d-b9b1-a422a338d01b",
    status: "failed",
    error_code: "ai_chat_failed",
    error_message: "The AI request could not be completed.",
    user_message_id: USER_MESSAGE_ID,
    client_request_id: "e2143871-8722-4ede-b617-8268b6b1385d",
    assistant_message_id: null,
    ...overrides,
  }
}

describe("hydrate orphaned AI chat run", () => {
  it("hydrates when the last persisted message is the failed user turn", () => {
    expect(
      shouldHydrateOrphanedAiRun({
        lastMessage: { id: USER_MESSAGE_ID, role: "user" },
        hasInFlightAssistant: false,
        run: failedRun(),
      }),
    ).toBe(true)
  })

  it("skips when an assistant reply is already in flight", () => {
    expect(
      shouldHydrateOrphanedAiRun({
        lastMessage: { id: USER_MESSAGE_ID, role: "user" },
        hasInFlightAssistant: true,
        run: failedRun(),
      }),
    ).toBe(false)
  })

  it("skips when the last message is already an assistant reply", () => {
    expect(
      shouldHydrateOrphanedAiRun({
        lastMessage: { id: "assistant-1", role: "assistant" },
        hasInFlightAssistant: false,
        run: failedRun(),
      }),
    ).toBe(false)
  })

  it("skips when the orphaned run belongs to a different user message", () => {
    expect(
      shouldHydrateOrphanedAiRun({
        lastMessage: { id: USER_MESSAGE_ID, role: "user" },
        hasInFlightAssistant: false,
        run: failedRun({ user_message_id: "other-user-message" }),
      }),
    ).toBe(false)
  })

  it("treats a refresh-abandoned running run as interrupted", () => {
    expect(terminalKindForOrphanedRunStatus("running")).toBe("interrupted")
    const message = buildHydratedFailedAssistantMessage({
      threadId: "thread-1",
      run: failedRun({ status: "running", error_code: null, error_message: null }),
    })
    expect(message.terminal_state?.kind).toBe("interrupted")
    expect(message.terminal_state?.retryable).toBe(true)
    expect(message.terminal_state?.message).toMatch(/interrupted/i)
    expect(message.client_request_id).toBe("e2143871-8722-4ede-b617-8268b6b1385d")
  })

  it("builds a retryable failed card for a persisted failed run", () => {
    const message = buildHydratedFailedAssistantMessage({
      threadId: "thread-1",
      run: failedRun(),
    })
    expect(message.id).toBe("hydrated-run-8bb7d358-ac53-4d4d-b9b1-a422a338d01b")
    expect(message.status).toBe("failed")
    expect(message.terminal_state).toMatchObject({
      kind: "failed",
      run_id: "8bb7d358-ac53-4d4d-b9b1-a422a338d01b",
      code: "ai_chat_failed",
      retryable: true,
    })
  })
})

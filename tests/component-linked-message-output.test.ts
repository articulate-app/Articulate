import { describe, expect, it } from "vitest"
import {
  detectComponentLinkedMessageOutput,
  messageOutputHasClarificationRequest,
  shouldSuppressBuildAckChatBubble,
} from "../features/ai-chat/component-linked-message-output"

describe("messageOutputHasClarificationRequest", () => {
  it("detects clarification_request on content_json", () => {
    expect(
      messageOutputHasClarificationRequest({
        content_text: "Which structure?",
        content_json: {
          clarification_request: {
            type: "clarification_request",
            question: "Which structure?",
            options: [{ id: "a", label: "A" }],
          },
        },
        component_id: null,
        task_component_output_id: null,
      }),
    ).toBe(true)
  })

  it("detects nested message_output.clarification_request", () => {
    expect(
      messageOutputHasClarificationRequest({
        content_json: {
          message_output: {
            clarification_request: { question: "Pick one", options: [] },
          },
        },
      }),
    ).toBe(true)
  })

  it("is false for ordinary message_output", () => {
    expect(
      messageOutputHasClarificationRequest({
        content_text: "Done.",
        content_json: [{ type: "paragraph", text: "Done." }],
      }),
    ).toBe(false)
  })
})

describe("detectComponentLinkedMessageOutput", () => {
  it("never treats clarification message_output as component-linked", () => {
    const result = detectComponentLinkedMessageOutput(
      {
        task_id: 10,
        channel_id: 2,
        component_id: "comp-a",
        task_component_output_id: "output-1",
        content_text: "Which sections should I rewrite?",
        content_json: {
          clarification_request: {
            type: "clarification_request",
            question: "Which sections should I rewrite?",
            options: [{ id: "intro", label: "Introduction" }],
          },
        },
      },
      { hasExistingPreviewForMessage: true },
    )
    expect(result.isComponentLinked).toBe(false)
    expect(result.card).toBeNull()
  })

  it("does not treat full component identity alone as linked (message_output is chat)", () => {
    const result = detectComponentLinkedMessageOutput({
      task_id: 10,
      channel_id: 2,
      component_id: "comp-a",
      task_component_output_id: "output-1",
      component_title: "FAQ",
      operation: "replace",
      output_kind: "rich_text",
      content_text: "Full component body",
      content_json: [{ type: "paragraph", text: "Full component body" }],
    })
    expect(result.isComponentLinked).toBe(false)
    expect(result.card).toBeNull()
  })

  it("suppresses body only when an existing preview covers this turn", () => {
    const result = detectComponentLinkedMessageOutput(
      {
        task_id: 10,
        channel_id: 2,
        component_id: "comp-a",
        task_component_output_id: "output-1",
        content_text: "Full component body",
      },
      { hasExistingPreviewForMessage: true },
    )
    expect(result.isComponentLinked).toBe(true)
    expect(result.card).toMatchObject({
      taskId: 10,
      channelId: 2,
      componentId: "comp-a",
      taskComponentOutputId: "output-1",
      contentText: "Full component body",
    })
  })

  it("treats a message with existing preview events as component-linked", () => {
    const result = detectComponentLinkedMessageOutput(
      { content_text: "Body" },
      { hasExistingPreviewForMessage: true },
    )
    expect(result.isComponentLinked).toBe(true)
  })

  it("keys a card from task+channel+component even without an output id", () => {
    const result = detectComponentLinkedMessageOutput(
      { task_id: 1, channel_id: 2, component_id: "comp", content_text: "Body" },
      { hasExistingPreviewForMessage: true },
    )
    expect(result.isComponentLinked).toBe(true)
    expect(result.card?.componentId).toBe("comp")
    expect(result.card?.taskComponentOutputId).toBeNull()
  })

  it("does not treat a plain assistant message as component-linked", () => {
    const result = detectComponentLinkedMessageOutput({
      content_text: "Here is a normal answer.",
      content_json: [{ type: "paragraph", text: "Here is a normal answer." }],
    })
    expect(result.isComponentLinked).toBe(false)
    expect(result.card).toBeNull()
  })

  it("is not component-linked when only partial identity is present", () => {
    const result = detectComponentLinkedMessageOutput({
      task_id: 1,
      channel_id: 2,
      content_text: "Body",
    })
    expect(result.isComponentLinked).toBe(false)
  })
})

describe("shouldSuppressBuildAckChatBubble", () => {
  it("suppresses output_kind build_ack", () => {
    expect(shouldSuppressBuildAckChatBubble({ output_kind: "build_ack", content_text: "Started" })).toBe(true)
  })

  it("suppresses ui_visibility hidden", () => {
    expect(shouldSuppressBuildAckChatBubble({ ui_visibility: "hidden", content_text: "Ack" })).toBe(true)
  })

  it("suppresses persisted build_ack.suppress_chat_bubble", () => {
    expect(
      shouldSuppressBuildAckChatBubble({
        content_json: {
          build_ack: { suppress_chat_bubble: true },
          blocks: [{ type: "paragraph", text: "Build started" }],
        },
      }),
    ).toBe(true)
  })

  it("does not suppress ordinary assistant output", () => {
    expect(
      shouldSuppressBuildAckChatBubble({
        content_text: "Here is the answer.",
        output_kind: "rich_text",
      }),
    ).toBe(false)
  })
})

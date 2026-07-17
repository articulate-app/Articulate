import { describe, expect, it } from "vitest"
import { detectComponentLinkedMessageOutput } from "../features/ai-chat/component-linked-message-output"

describe("detectComponentLinkedMessageOutput", () => {
  it("treats a full component identity as component-linked and returns a card", () => {
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
    expect(result.isComponentLinked).toBe(true)
    expect(result.card).toMatchObject({
      taskId: 10,
      channelId: 2,
      componentId: "comp-a",
      taskComponentOutputId: "output-1",
      componentTitle: "FAQ",
      operation: "replace",
      outputKind: "rich_text",
      contentText: "Full component body",
    })
  })

  it("treats selected_context_type=component_output as component-linked", () => {
    const result = detectComponentLinkedMessageOutput({
      selected_context_type: "component_output",
      content_text: "Body",
    })
    expect(result.isComponentLinked).toBe(true)
    // No task/channel/component identity → cannot key a card.
    expect(result.card).toBeNull()
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

import { describe, expect, it } from "vitest"
import {
  componentEditPreviewGroupKey,
  parseComponentEditPreviewsFromMessage,
  pickLatestRenderableComponentEditPreview,
  pickLatestRenderableComponentEditPreviewsByGroup,
  buildPersistedPreviewDescriptorsFromMessages,
} from "../features/ai-chat/component-edit-previews-from-message"
import { previewDescriptorStreamKey } from "../features/ai-chat/hydrate-component-edit-previews"

describe("parseComponentEditPreviewsFromMessage", () => {
  it("reads component_edit_previews from enriched message content_json", () => {
    const previews = parseComponentEditPreviewsFromMessage({
      component_edit_previews: [
        {
          phase: "completed",
          task_id: 10,
          channel_id: 2,
          component_id: "comp-a",
          task_component_output_id: "output-a",
          component_title: "FAQ",
          operation: "replace",
          content_text: "Question 1",
        },
        {
          phase: "saved",
          task_id: 10,
          channel_id: 2,
          component_id: "comp-a",
          task_component_output_id: "output-a",
          component_title: "FAQ",
          operation: "replace",
          content_text: "Question 1 updated",
          updated_at: "2026-06-22T10:00:00.000Z",
        },
      ],
    })

    expect(previews).toHaveLength(2)
    expect(pickLatestRenderableComponentEditPreview(previews)?.phase).toBe("saved")
    expect(pickLatestRenderableComponentEditPreview(previews)?.content_text).toBe("Question 1 updated")
  })

  it("ignores incomplete previews with null component_id", () => {
    const previews = parseComponentEditPreviewsFromMessage({
      component_edit_previews: [
        {
          phase: "started",
          task_id: 10,
          channel_id: 2,
          component_id: null,
          content_text: "partial",
        },
        {
          phase: "saved",
          task_id: 10,
          channel_id: 2,
          component_id: "comp-a",
          content_text: "Saved content",
        },
      ],
    })
    expect(previews).toHaveLength(1)
    expect(previews[0]?.component_id).toBe("comp-a")
  })

  it("groups previews by message_id + task_id + channel_id + component_id", () => {
    const messageId = "assistant-1"
    const grouped = pickLatestRenderableComponentEditPreviewsByGroup(
      parseComponentEditPreviewsFromMessage({
        component_edit_previews: [
          {
            phase: "saved",
            message_id: messageId,
            task_id: 10,
            channel_id: 2,
            component_id: "intro",
            component_title: "Intro",
            content_text: "Intro saved",
          },
          {
            phase: "completed",
            message_id: messageId,
            task_id: 10,
            channel_id: 2,
            component_id: "intro",
            content_text: "Intro draft",
          },
          {
            phase: "saved",
            message_id: messageId,
            task_id: 10,
            channel_id: 2,
            component_id: "faq",
            component_title: "FAQ",
            content_text: "FAQ saved",
          },
        ],
      }),
      messageId,
    )
    expect(grouped).toHaveLength(2)
    expect(grouped.map((preview) => preview.component_id).sort()).toEqual(["faq", "intro"])
    expect(
      grouped.find((preview) => preview.component_id === "intro")?.content_text,
    ).toBe("Intro saved")
  })

  it("builds stable preview stream keys", () => {
    const preview = pickLatestRenderableComponentEditPreview(
      parseComponentEditPreviewsFromMessage({
        component_edit_previews: [
          {
            phase: "saved",
            task_id: 10,
            channel_id: 2,
            component_id: "comp-a",
            task_component_output_id: "output-a",
            component_title: "FAQ",
            content_text: "Saved content",
          },
        ],
      }),
    )
    expect(preview).not.toBeNull()
    if (!preview) return
    expect(previewDescriptorStreamKey(preview)).toBe("10:2:comp-a")
  })

  it("hydrates multiple previews for one assistant message", () => {
    const descriptors = buildPersistedPreviewDescriptorsFromMessages("thread-1", [
      {
        id: "assistant-1",
        role: "assistant",
        thread_id: "thread-1",
        content_json: {
          component_edit_previews: [
            {
              phase: "saved",
              task_id: 10,
              channel_id: 2,
              component_id: "intro",
              component_title: "Intro",
              content_text: "Intro body",
            },
            {
              phase: "saved",
              task_id: 10,
              channel_id: 2,
              component_id: "faq",
              component_title: "FAQ",
              content_text: "FAQ body",
            },
          ],
        },
      },
    ])
    expect(descriptors).toHaveLength(2)
    expect(descriptors.every((row) => row.messageId === "assistant-1")).toBe(true)
    expect(
      componentEditPreviewGroupKey({
        messageId: "assistant-1",
        taskId: 10,
        channelId: 2,
        componentId: "intro",
      }),
    ).toBe("assistant-1:10:2:intro")
  })
})

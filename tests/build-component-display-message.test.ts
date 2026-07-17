import { describe, expect, it } from "vitest"
import {
  BUILD_WITH_AI_DISPLAY_MESSAGE,
  buildBuildComponentDisplayMessage,
  buildBuildComponentUserMessageDisplay,
} from "../features/ai-chat/build-component-display-message"
import { resolveUserMessageDisplayContent } from "../features/ai-chat/resolve-user-message-display-content"
import {
  displayPartsToMessageSegments,
  parseUserMessageContentJson,
} from "../features/ai-chat/ai-chat-user-message-content"
import {
  buildPersistedPreviewDescriptorsFromMessages,
  enrichPersistedComponentEditPreviewFromChangeSetItem,
} from "../features/ai-chat/component-edit-previews-from-message"

describe("buildBuildComponentDisplayMessage", () => {
  it("returns the shared Build with AI label", () => {
    expect(buildBuildComponentDisplayMessage({ componentTitle: "Como escolher" })).toBe(
      BUILD_WITH_AI_DISPLAY_MESSAGE,
    )
    expect(
      buildBuildComponentDisplayMessage({
        componentTitle: "Como escolher",
        channelTitle: "Flexible materials",
      }),
    ).toBe(BUILD_WITH_AI_DISPLAY_MESSAGE)
  })
})

describe("buildBuildComponentUserMessageDisplay", () => {
  it("builds display_parts with a component context pill", () => {
    const payload = buildBuildComponentUserMessageDisplay({
      taskId: 13167,
      channelId: 11,
      componentId: "comp-1",
      componentTitle: "Que tipos existem?",
      channelName: "Blog",
      taskTitle: "Water-resistant materials",
      taskComponentOutputId: "output-1",
    })

    expect(payload.displayMessage).toBe(BUILD_WITH_AI_DISPLAY_MESSAGE)
    expect(payload.contentJson.display_parts).toEqual([
      { type: "text", text: "Build with AI for " },
      {
        type: "context_pill",
        entity_type: "component",
        label: "Que tipos existem?",
        subtitle: "Blog",
        task_id: 13167,
        channel_id: 11,
        component_id: "comp-1",
        task_component_output_id: "output-1",
        selected_context_type: "component_output",
        task_title: "Water-resistant materials",
      },
    ])
    expect(payload.taggedTaskComponentRefs).toEqual([
      {
        task_id: 13167,
        channel_id: 11,
        component_id: "comp-1",
        component_title: "Que tipos existem?",
        task_title: "Water-resistant materials",
        channel_name: "Blog",
      },
    ])
  })
})

describe("resolveUserMessageDisplayContent", () => {
  it("prefers content_json.display_message over full content", () => {
    expect(
      resolveUserMessageDisplayContent("Full internal build prompt with SEO rules", {
        display_message: "Build with AI",
      }),
    ).toBe("Build with AI")
  })

  it("prefers display_parts metadata over the internal build prompt", () => {
    const payload = buildBuildComponentUserMessageDisplay({
      taskId: 1,
      channelId: 2,
      componentId: "comp-1",
      componentTitle: "FAQ",
      channelName: "Blog",
      taskTitle: "Example task",
    })
    expect(
      resolveUserMessageDisplayContent("Build the component **FAQ** for task **Example**.", {
        ...payload.contentJson,
        internal_message: "Build the component **FAQ** for task **Example**.",
      }),
    ).toBe(BUILD_WITH_AI_DISPLAY_MESSAGE)
  })

  it("keeps full tagged content when mention metadata is present", () => {
    expect(
      resolveUserMessageDisplayContent("@Task / Channel / FAQ update this", {
        display_message: "Build with AI",
        mention_tags: [{ type: "task_component", id: "1", label: "FAQ", source: "selection" }],
      }),
    ).toBe("@Task / Channel / FAQ update this")
  })
})

describe("displayPartsToMessageSegments", () => {
  it("maps context pills to mention segments for history rendering", () => {
    const payload = buildBuildComponentUserMessageDisplay({
      taskId: 1,
      channelId: 2,
      componentId: "comp-1",
      componentTitle: "FAQ",
      channelName: "Blog",
      taskTitle: "Example task",
    })
    const parsed = parseUserMessageContentJson(payload.contentJson)
    const segments = displayPartsToMessageSegments(parsed.display_parts ?? [])
    expect(segments).toHaveLength(2)
    expect(segments[0]).toEqual({ type: "text", text: "Build with AI for " })
    expect(segments[1]?.type).toBe("mention")
    if (segments[1]?.type === "mention") {
      expect(segments[1].tag.type).toBe("task_component")
      expect(segments[1].tag.componentTitle).toBe("FAQ")
      expect(segments[1].tag.channelName).toBe("Blog")
    }
  })
})

describe("enrichPersistedComponentEditPreviewFromChangeSetItem", () => {
  it("fills missing base/after text from change set items", () => {
    const enriched = enrichPersistedComponentEditPreviewFromChangeSetItem(
      {
        phase: "saved",
        message_id: "assistant-1",
        task_id: 10,
        channel_id: 2,
        component_id: "intro",
        component_title: "Intro",
        task_component_output_id: null,
        operation: "replace",
        base_content_text: null,
        content_text: "After only",
        content_json: null,
        error_message: null,
        updated_at: null,
      },
      {
        component_id: "intro",
        task_id: 10,
        channel_id: 2,
        task_component_output_id: null,
        before_content_text: "Before body",
        after_content_text: "After body",
        operation: "replace",
      },
    )
    expect(enriched.base_content_text).toBe("Before body")
    expect(enriched.content_text).toBe("After only")
  })

  it("hydrates descriptors with change set before/after text", () => {
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
              content_text: "After body",
            },
          ],
          change_set: {
            id: "change-set-1",
            items: [
              {
                component_id: "intro",
                task_id: 10,
                channel_id: 2,
                before_content_text: "Before body",
                after_content_text: "After body",
              },
            ],
          },
        },
      },
    ])
    expect(descriptors[0]?.preview.base_content_text).toBe("Before body")
  })
})

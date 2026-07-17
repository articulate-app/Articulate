import { describe, expect, it } from "vitest"
import {
  blockMatchesPreviewDuplicate,
  buildAssistantClipboardText,
  buildAssistantMessagePreviewLayout,
  buildDuplicateMatchCandidates,
  getAssistantCopyableText,
  resolvePreviewContentDescriptor,
  resolvePreviewContentDescriptors,
  splitAssistantContentIntoBlocks,
  splitAssistantMessageAroundPreviewBlocks,
} from "../features/ai-chat/component-edit-preview-message"
import {
  buildDefaultPreviewContentHtml,
  buildMergedPreviewAfterText,
} from "../features/tasks/utils/component-content-diff"

function buildPreviewDescriptor(contentText: string, baseContentText = "Old intro paragraph") {
  const displayHtml = `<p>${contentText}</p>`
  return {
    componentTitle: "Intro",
    operation: "replace" as const,
    baseContentText,
    contentText,
    displayHtml,
    afterText: buildMergedPreviewAfterText({
      operation: "replace",
      beforeText: baseContentText,
      contentText,
      displayHtml,
    }),
    defaultContentHtml: buildDefaultPreviewContentHtml({
      operation: "replace",
      baseContentText,
      contentText,
      displayHtml,
    }).html,
    isRemovedState: false,
  }
}

describe("component-edit-preview-message", () => {
  it("strips duplicated preview content while keeping narration from persisted preview", () => {
    const duplicate = "Updated intro paragraph with all the new content."
    const msg = {
      role: "assistant" as const,
      content: `<p>A new paragraph has been added to the Intro.</p><p>${duplicate}</p><p>You can view the task here.</p>`,
      content_json: {
        component_edit_previews: [
          {
            phase: "saved",
            task_id: 1,
            channel_id: 2,
            component_id: "comp-a",
            task_component_output_id: "output-a",
            component_title: "Intro",
            operation: "replace",
            base_content_text: "Old intro paragraph",
            content_text: duplicate,
          },
        ],
      },
    }
    const preview = resolvePreviewContentDescriptor({
      message: msg,
      messageId: "assistant-1",
      editPreviewKey: null,
      editStreamEntries: {},
    })
    const layout = buildAssistantMessagePreviewLayout({
      messageContent: msg.content,
      previews: preview ? [preview] : [],
    })
    expect(layout.introHtml).toContain("A new paragraph has been added")
    expect(layout.outroHtml).toContain("You can view the task here")
    expect(layout.introHtml).not.toContain("Updated intro paragraph")
    expect(layout.outroHtml).not.toContain("Updated intro paragraph")
    expect(getAssistantCopyableText(msg, layout)).toContain("A new paragraph has been added")
    expect(getAssistantCopyableText(msg, layout)).toContain("You can view the task here")
  })

  it("preserves narration when one paragraph matches preview but others do not", () => {
    const previewText = "Furthermore, this section explains the updated positioning."
    const preview = buildPreviewDescriptor(previewText)
    const layout = buildAssistantMessagePreviewLayout({
      messageContent: `<p>I added a new paragraph to the Intro.</p><p>${previewText}</p><p>You can view the updated task here.</p>`,
      previews: [preview],
    })
    expect(layout.introHtml).toContain("I added a new paragraph")
    expect(layout.outroHtml).toContain("You can view the updated task here")
    expect(layout.introHtml).not.toContain("Furthermore")
    expect(layout.outroHtml).not.toContain("Furthermore")
  })

  it("does not treat a whole message as duplicate just because it contains preview text", () => {
    const previewText = "Furthermore, this section explains the updated positioning."
    const preview = buildPreviewDescriptor(previewText)
    const wholeMessage = `<p>I added a new paragraph. ${previewText} You can view the updated task here.</p>`
    const candidates = buildDuplicateMatchCandidates(preview)
    expect(blockMatchesPreviewDuplicate(wholeMessage, candidates)).toBe(false)
    const layout = buildAssistantMessagePreviewLayout({
      messageContent: wholeMessage,
      previews: [preview],
    })
    expect(layout.introHtml).toContain("I added a new paragraph")
    expect(layout.introHtml).toContain("You can view the updated task here")
  })

  it("matches hydrated and streaming descriptors consistently", () => {
    const duplicate = "Furthermore, this section explains the updated positioning."
    const messageContent = `<p>I added a new paragraph to the Intro.</p><p>${duplicate}</p><p>You can view the updated task here.</p>`
    const persistedPreview = resolvePreviewContentDescriptors({
      message: {
        role: "assistant",
        content_json: {
          component_edit_previews: [
            {
              phase: "saved",
              task_id: 1,
              channel_id: 2,
              component_id: "comp-a",
              task_component_output_id: "output-a",
              component_title: "Intro",
              operation: "replace",
              base_content_text: "Old intro paragraph",
              content_text: duplicate,
            },
          ],
        },
      },
      messageId: "assistant-1",
      editPreviewKeys: [],
      editStreamEntries: {},
    })
    const streamingPreview = [buildPreviewDescriptor(duplicate)]
    const hydratedLayout = buildAssistantMessagePreviewLayout({
      messageContent,
      previews: persistedPreview,
    })
    const streamingLayout = buildAssistantMessagePreviewLayout({
      messageContent,
      previews: streamingPreview,
    })
    expect(hydratedLayout.introHtml).toBe(streamingLayout.introHtml)
    expect(hydratedLayout.outroHtml).toBe(streamingLayout.outroHtml)
  })

  it("splits intro, duplicate, and footer blocks around preview placement", () => {
    const blocks = splitAssistantContentIntoBlocks(
      "<p>Intro</p><p>Duplicate body</p><p>Footer</p>",
    )
    const split = splitAssistantMessageAroundPreviewBlocks({
      blocks,
      duplicateBlockIndexes: [1],
    })
    expect(split.introHtml).toContain("Intro")
    expect(split.outroHtml).toContain("Footer")
    expect(split.introHtml).not.toContain("Duplicate body")
    expect(split.outroHtml).not.toContain("Duplicate body")
  })

  it("allows copy when assistant text exists without preview", () => {
    const msg = {
      role: "assistant" as const,
      content: "Here is a normal answer.",
      content_json: null,
    }
    const layout = buildAssistantMessagePreviewLayout({
      messageContent: msg.content,
      previews: [],
    })
    expect(getAssistantCopyableText(msg, layout)).toBe("Here is a normal answer.")
  })

  it("builds clipboard text with AI response and preview sections", () => {
    const previewText = "Updated intro paragraph with all the new content."
    const msg = {
      role: "assistant" as const,
      content: `<p>A new paragraph has been added to the Intro.</p><p>${previewText}</p>`,
      content_json: null,
    }
    const preview = buildPreviewDescriptor(previewText)
    const layout = buildAssistantMessagePreviewLayout({
      messageContent: msg.content,
      previews: [preview],
    })
    const copied = buildAssistantClipboardText({
      msg,
      layout,
      previews: [preview],
    })
    expect(copied).toContain("AI response:")
    expect(copied).toContain("A new paragraph has been added to the Intro.")
    expect(copied).toContain("Preview:")
    expect(copied).toContain("Updated intro paragraph with all the new content.")
  })
})

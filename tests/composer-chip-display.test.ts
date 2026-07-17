import { describe, it, expect } from "vitest"
import {
  chipDisplayText,
  composerTagDedupeKey,
} from "../features/ai-chat/composer-inline-editor"
import type { AiContextTag } from "../features/ai-chat/composer-inline-editor"

describe("composerTagDedupeKey", () => {
  it("uses structured keys for task, channel, and component tokens", () => {
    expect(
      composerTagDedupeKey({ type: "task", id: 13423, label: "Task", source: "mention", taskId: 13423 }),
    ).toBe("task:13423")
    expect(
      composerTagDedupeKey({
        type: "channel",
        id: 11,
        label: "Blog",
        source: "mention",
        channelId: 11,
      }),
    ).toBe("channel:11")
    expect(
      composerTagDedupeKey({
        type: "task_component",
        id: "comp-1",
        label: "Intro",
        source: "selection",
        taskId: 13423,
        channelId: 11,
        componentId: "comp-1",
      }),
    ).toBe("component:13423:11:comp-1")
  })
})

describe("chipDisplayText", () => {
  it("renders a standalone channel chip as `#Name`", () => {
    const tag: AiContextTag = {
      type: "channel",
      id: 11,
      label: "Blog",
      source: "mention",
      channelId: 11,
      channelName: "Blog",
    }
    expect(chipDisplayText(tag)).toBe("#Blog")
  })

  it("renders a component chip with only the component title", () => {
    const tag: AiContextTag = {
      type: "task_component",
      id: "635c0ae7-9d47-432c-8768-8f30d415376a",
      label: "Introduction",
      source: "mention",
      taskId: 13423,
      taskTitle: "Rubber alternatives: where cork composites replace synthetic elastomers",
      channelId: 11,
      channelName: "Blog",
      componentId: "635c0ae7-9d47-432c-8768-8f30d415376a",
      componentTitle: "Introduction",
    }
    // Short form — never the long combined `Task / Blog / Introduction` label.
    expect(chipDisplayText(tag)).toBe("@Introduction")
    expect(chipDisplayText(tag)).not.toContain("/")
  })

  it("renders a task chip as `@Title`", () => {
    const tag: AiContextTag = {
      type: "task",
      id: 13423,
      label: "Rubber alternatives",
      source: "mention",
    }
    expect(chipDisplayText(tag)).toBe("@Rubber alternatives")
  })
})

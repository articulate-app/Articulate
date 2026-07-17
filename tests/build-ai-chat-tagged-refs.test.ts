import { describe, it, expect } from "vitest"
import { buildAiChatTaggedRefs } from "../features/ai-chat/build-ai-chat-tagged-refs"
import type { AiContextTag } from "../features/ai-chat/composer-inline-editor"

describe("buildAiChatTaggedRefs", () => {
  it("maps task-only mention to tagged_task_ids", () => {
    const tags: AiContextTag[] = [
      { type: "task", id: 12629, label: "Investir", source: "mention" },
    ]
    const out = buildAiChatTaggedRefs(tags)
    expect(out.tagged_task_ids).toEqual([12629])
    expect(out.tagged_task_channel_refs).toEqual([])
    expect(out.tagged_task_component_refs).toEqual([])
  })

  it("maps task_channel mention to tagged_task_ids and tagged_task_channel_refs", () => {
    const tags: AiContextTag[] = [
      {
        type: "task_channel",
        id: "tc:12629:11",
        label: "Investir / blog",
        source: "mention",
        taskId: 12629,
        taskTitle: "Investir em platina",
        channelId: 11,
        channelName: "blog",
      },
    ]
    const out = buildAiChatTaggedRefs(tags)
    expect(out.tagged_task_ids).toEqual([12629])
    expect(out.tagged_task_channel_refs).toEqual([
      {
        task_id: 12629,
        channel_id: 11,
        task_title: "Investir em platina",
        channel_name: "blog",
      },
    ])
    expect(out.tagged_task_component_refs).toEqual([])
  })

  it("maps task_component mention to tagged_task_ids and tagged_task_component_refs", () => {
    const tags: AiContextTag[] = [
      {
        type: "task_component",
        id: "e92627a5-d0d5-49e1-b5b1-2bd940126f41",
        label: "Como fazer",
        source: "mention",
        taskId: 12629,
        taskTitle: "Investir em platina",
        channelId: 11,
        channelName: "blog",
        componentId: "e92627a5-d0d5-49e1-b5b1-2bd940126f41",
        componentTitle: "Como fazer",
      },
    ]
    const out = buildAiChatTaggedRefs(tags)
    expect(out.tagged_task_ids).toEqual([12629])
    expect(out.tagged_task_channel_refs).toEqual([])
    expect(out.tagged_task_component_refs).toEqual([
      {
        task_id: 12629,
        channel_id: 11,
        component_id: "e92627a5-d0d5-49e1-b5b1-2bd940126f41",
        component_title: "Como fazer",
        task_title: "Investir em platina",
        channel_name: "blog",
      },
    ])
  })

  it("drops briefing/global alias component ids from tagged_task_component_refs", () => {
    const tags: AiContextTag[] = [
      {
        type: "task_component",
        id: "g:5",
        label: "Main content",
        source: "mention",
        taskId: 12629,
        channelId: 11,
        componentId: "g:5",
        componentTitle: "Main content",
      },
      {
        type: "task_component",
        id: "17",
        label: "Numeric alias",
        source: "mention",
        taskId: 12629,
        channelId: 11,
        componentId: "17",
        componentTitle: "Numeric alias",
      },
    ]
    const out = buildAiChatTaggedRefs(tags)
    // The task is still referenced, but no alias-based component ref is emitted.
    expect(out.tagged_task_ids).toEqual([12629])
    expect(out.tagged_task_component_refs).toEqual([])
  })

  it("maps standalone channel tags to tagged_channel_ids without combined refs", () => {
    const tags: AiContextTag[] = [
      { type: "task", id: 13423, label: "Rubber alternatives", source: "mention" },
      {
        type: "channel",
        id: 11,
        label: "Blog",
        source: "mention",
        channelId: 11,
        channelName: "Blog",
        taskId: 13423,
      },
    ]
    const out = buildAiChatTaggedRefs(tags)
    expect(out.tagged_task_ids).toEqual([13423])
    expect(out.tagged_channel_ids).toEqual([11])
    expect(out.tagged_task_channel_refs).toEqual([])
    expect(out.tagged_task_component_refs).toEqual([])
  })

  it("derives tagged_channel_ids from an explicit component selection", () => {
    const tags: AiContextTag[] = [
      { type: "task", id: 13423, label: "Rubber alternatives", source: "selection", taskId: 13423 },
      {
        type: "channel",
        id: 11,
        label: "Blog",
        source: "selection",
        channelId: 11,
        channelName: "Blog",
        taskId: 13423,
      },
      {
        type: "task_component",
        id: "635c0ae7-9d47-432c-8768-8f30d415376a",
        label: "Introduction",
        source: "selection",
        taskId: 13423,
        channelId: 11,
        componentId: "635c0ae7-9d47-432c-8768-8f30d415376a",
        componentTitle: "Introduction",
      },
    ]
    const out = buildAiChatTaggedRefs(tags)
    expect(out.tagged_task_ids).toEqual([13423])
    expect(out.tagged_channel_ids).toEqual([11])
    expect(out.tagged_task_component_refs).toEqual([
      {
        task_id: 13423,
        channel_id: 11,
        component_id: "635c0ae7-9d47-432c-8768-8f30d415376a",
        component_title: "Introduction",
        task_title: undefined,
        channel_name: undefined,
      },
    ])
  })

  it("dedupes duplicate channel refs", () => {
    const tags: AiContextTag[] = [
      {
        type: "task_channel",
        id: "a",
        label: "x",
        source: "mention",
        taskId: 1,
        channelId: 2,
        channelName: "c",
      },
      {
        type: "task_channel",
        id: "b",
        label: "y",
        source: "mention",
        taskId: 1,
        channelId: 2,
        channelName: "c",
      },
    ]
    const out = buildAiChatTaggedRefs(tags)
    expect(out.tagged_task_channel_refs).toHaveLength(1)
  })
})

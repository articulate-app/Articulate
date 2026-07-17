import { describe, expect, it } from "vitest"
import {
  collectAiMessageChangeSetTaskChannelPairs,
  findAiMessageChangeSetItemForPreview,
  formatAiMessageChangeSetMetadata,
  parseAiMessageChangeSet,
  parseAiMessageChangeSetItems,
} from "../features/ai-chat/ai-message-change-set"
import { parseAiThreadTimelineRestoreResult } from "../features/ai-chat/ai-thread-timeline-restore-utils"

describe("parseAiMessageChangeSet", () => {
  it("parses change_set metadata from assistant message content_json", () => {
    const parsed = parseAiMessageChangeSet({
      change_set: {
        id: "change-set-1",
        has_restorable_changes: true,
        entity_count: 8,
        change_count: 8,
        summary: {
          components: [
            { component_title: "Intro", task_id: 13131, channel_id: 11 },
            { component_title: "Body", task_id: 13131, channel_id: 11 },
          ],
        },
      },
    })

    expect(parsed).toEqual({
      id: "change-set-1",
      has_restorable_changes: true,
      entity_count: 8,
      change_count: 8,
      status: null,
      restored_at: null,
      summary: {
        components: [
          { component_title: "Intro", task_id: 13131, channel_id: 11 },
          { component_title: "Body", task_id: 13131, channel_id: 11 },
        ],
      },
    })
  })

  it("returns null when change_set id is missing", () => {
    expect(parseAiMessageChangeSet({ change_set: { has_restorable_changes: true } })).toBeNull()
  })
})

describe("parseAiMessageChangeSetItems", () => {
  it("reads nested change_set.items with before/after aliases", () => {
    const items = parseAiMessageChangeSetItems({
      change_set: {
        id: "change-set-1",
        items: [
          {
            component_id: "comp-a",
            task_id: 10,
            channel_id: 2,
            before_content_text: "Old body",
            after_content_text: "New body",
          },
        ],
      },
    })
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      component_id: "comp-a",
      before_content_text: "Old body",
      after_content_text: "New body",
    })
  })

  it("matches preview rows by task/channel/component", () => {
    const items = parseAiMessageChangeSetItems({
      change_set_items: [
        {
          component_id: "intro",
          task_id: 10,
          channel_id: 2,
          base_content_text: "Before",
          content_text: "After",
        },
      ],
    })
    expect(
      findAiMessageChangeSetItemForPreview({
        items,
        taskId: 10,
        channelId: 2,
        componentId: "intro",
      }),
    ).toMatchObject({
      before_content_text: "Before",
      after_content_text: "After",
    })
  })
})

describe("formatAiMessageChangeSetMetadata", () => {
  it("prefers component count when summary components exist", () => {
    expect(
      formatAiMessageChangeSetMetadata({
        id: "1",
        summary: {
          components: [{ component_title: "Intro", task_id: 1, channel_id: 2 }],
        },
      }),
    ).toBe("1 component updated")
  })

  it("falls back to change count", () => {
    expect(
      formatAiMessageChangeSetMetadata({
        id: "1",
        change_count: 8,
      }),
    ).toBe("8 changes")
  })
})

describe("collectAiMessageChangeSetTaskChannelPairs", () => {
  it("collects unique task/channel pairs", () => {
    expect(
      collectAiMessageChangeSetTaskChannelPairs({
        id: "1",
        summary: {
          components: [
            { component_title: "Intro", task_id: 10, channel_id: 1 },
            { component_title: "Body", task_id: 10, channel_id: 1 },
            { component_title: "Footer", task_id: 10, channel_id: 2 },
          ],
        },
      }),
    ).toEqual([
      { taskId: 10, channelId: 1 },
      { taskId: 10, channelId: 2 },
    ])
  })
})

describe("parseAiThreadTimelineRestoreResult", () => {
  it("reads restored_item_count from object payloads", () => {
    const result = parseAiThreadTimelineRestoreResult({ ok: true, restored_item_count: 3 })
    expect(result.restoredItemCount).toBe(3)
    expect(result.ok).toBe(true)
    expect(result.restoredItems).toEqual([])
    expect(result.createdChatMessage).toBeNull()
  })

  it("reads numeric payloads directly", () => {
    const result = parseAiThreadTimelineRestoreResult(0)
    expect(result.restoredItemCount).toBe(0)
    expect(result.ok).toBe(false)
  })

  it("defaults to zero for empty payloads", () => {
    const result = parseAiThreadTimelineRestoreResult(null)
    expect(result.restoredItemCount).toBe(0)
    expect(result.restoredItems).toEqual([])
    expect(result.createdChatMessage).toBeNull()
  })

  it("parses restored items and created chat message", () => {
    const result = parseAiThreadTimelineRestoreResult({
      ok: true,
      restored_to_message_id: "msg-target",
      restore_message_id: "msg-restore",
      change_set_id: "cs-1",
      restored_item_count: 1,
      restored_items: [
        {
          task_id: 13342,
          channel_id: 11,
          component_id: "tc-1",
          task_component_output_id: "tco-1",
          component_title: "Intro",
          restored_content_text: "hello",
          restored_content_json: [{ type: "paragraph" }],
          content_format: "json",
        },
      ],
      created_chat_message: {
        id: "msg-restore",
        role: "assistant",
        content: "Restored the conversation to this point.",
        content_json: { type: "restore_confirmation" },
      },
    })
    expect(result.restoredToMessageId).toBe("msg-target")
    expect(result.restoreMessageId).toBe("msg-restore")
    expect(result.changeSetId).toBe("cs-1")
    expect(result.restoredItems).toHaveLength(1)
    expect(result.restoredItems[0]?.task_component_output_id).toBe("tco-1")
    expect(result.restoredItems[0]?.component_id).toBe("tc-1")
    expect(result.createdChatMessage?.id).toBe("msg-restore")
    expect(result.createdChatMessage?.role).toBe("assistant")
  })
})

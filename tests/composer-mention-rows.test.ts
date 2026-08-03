import { describe, it, expect } from "vitest"
import {
  buildLevel1MentionRows,
  buildLevel2MentionRows,
  buildChannelMentionRows,
  nextSelectableMentionIndex,
  mentionRowIsSelectable,
} from "../features/ai-chat/composer-mention-rows"

describe("buildChannelMentionRows", () => {
  it("filters channels by query token", () => {
    const rows = buildChannelMentionRows({
      tasks: [
        {
          id: 13423,
          title: "Rubber alternatives",
          channels: [
            { channel_id: 11, name: "Blog" },
            { channel_id: 12, name: "Instagram" },
          ],
        },
      ],
      query: "blog",
      loading: false,
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      kind: "channel_mention",
      channelId: 11,
      channelName: "Blog",
    })
  })
})

describe("buildLevel2MentionRows", () => {
  const task = { id: 12629, title: "Investir em platina" }

  it("lists channels without component rows", () => {
    const rows = buildLevel2MentionRows({
      task,
      channels: [
        { channel_id: 11, name: "blog" },
        { channel_id: 12, name: "instagram" },
      ],
      channelsLoading: false,
      query: "",
    })
    expect(rows.some((r) => r.kind === "channel" && r.channelName === "blog")).toBe(true)
    expect(rows.some((r) => r.kind === "channel" && r.channelName === "instagram")).toBe(true)
    expect(rows.filter((r) => r.kind === "channel")).toHaveLength(2)
  })

  it("filters channels by query tokens", () => {
    const rows = buildLevel2MentionRows({
      task,
      channels: [
        { channel_id: 11, name: "blog" },
        { channel_id: 12, name: "instagram" },
      ],
      channelsLoading: false,
      query: "platina blog",
    })
    expect(rows.some((r) => r.kind === "channel" && r.channelName === "blog")).toBe(true)
    expect(rows.some((r) => r.kind === "channel" && r.channelName === "instagram")).toBe(false)
  })

  it("shows loading while channels fetch", () => {
    const rows = buildLevel2MentionRows({
      task,
      channels: null,
      channelsLoading: true,
      query: "",
    })
    expect(rows.some((r) => r.kind === "loading")).toBe(true)
  })
})

describe("buildLevel1MentionRows", () => {
  it("includes current task row when center task is available", () => {
    const rows = buildLevel1MentionRows({
      mentionFilter: "all",
      mentionQuery: "",
      mentionSuggestionsFiltered: [],
      directCombined: [],
      currentTask: { task: { id: 42, title: "Blog draft" }, channelId: 11 },
    })
    expect(rows[0]).toMatchObject({
      kind: "current_task",
      task: { id: 42, title: "Blog draft" },
      channelId: 11,
    })
  })
})

describe("nextSelectableMentionIndex", () => {
  it("skips task_header", () => {
    const rows = [
      { kind: "back" as const, label: "Tasks" },
      { kind: "task_header" as const, task: { id: 1, title: "T" } },
      { kind: "channel" as const, task: { id: 1, title: "T" }, channelId: 1, channelName: "c" },
    ]
    expect(mentionRowIsSelectable(rows[1]!)).toBe(false)
    expect(nextSelectableMentionIndex(rows, 0, 1)).toBe(2)
  })
})

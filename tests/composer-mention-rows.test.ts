import { describe, it, expect } from "vitest"
import type { TaskChannelComponentsBucket } from "../features/ai-chat/mention-task-channel-components"
import {
  buildLevel1MentionRows,
  buildLevel2MentionRows,
  buildChannelMentionRows,
  nextSelectableMentionIndex,
  mentionRowIsSelectable,
} from "../features/ai-chat/composer-mention-rows"

function bucketLoaded(items: TaskChannelComponentsBucket["items"]): TaskChannelComponentsBucket {
  return { loading: false, loaded: true, error: null, items }
}

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

  it("shows channel only when loaded bucket has zero selected components", () => {
    const rows = buildLevel2MentionRows({
      task,
      channels: [{ channel_id: 11, name: "instagram" }],
      channelsLoading: false,
      componentsByTaskChannel: {
        "12629:11": bucketLoaded([]),
      },
      query: "",
    })
    expect(rows.some((r) => r.kind === "component")).toBe(false)
    expect(rows.some((r) => r.kind === "channel" && r.channelName === "instagram")).toBe(true)
  })

  it("lists inline components per channel from separate buckets (no cross-channel bleed)", () => {
    const rows = buildLevel2MentionRows({
      task,
      channels: [
        { channel_id: 11, name: "blog" },
        { channel_id: 12, name: "instagram" },
      ],
      channelsLoading: false,
      componentsByTaskChannel: {
        "12629:11": bucketLoaded([{ component_id: "a", title: "Como fazer" }]),
        "12629:12": bucketLoaded([]),
      },
      query: "",
    })
    expect(rows.some((r) => r.kind === "channel" && r.channelName === "blog")).toBe(true)
    expect(rows.some((r) => r.kind === "component" && r.componentTitle === "Como fazer")).toBe(true)
    expect(rows.some((r) => r.kind === "channel" && r.channelName === "instagram")).toBe(true)
    expect(rows.some((r) => r.kind === "component" && r.channelName === "instagram")).toBe(false)
  })

  it("filters by query tokens across channel and component titles", () => {
    const rows = buildLevel2MentionRows({
      task,
      channels: [
        { channel_id: 11, name: "blog" },
        { channel_id: 12, name: "instagram" },
      ],
      channelsLoading: false,
      componentsByTaskChannel: {
        "12629:11": bucketLoaded([
          { component_id: "x", title: "Erros comuns" },
          { component_id: "y", title: "Intro" },
        ]),
        "12629:12": bucketLoaded([]),
      },
      query: "platina blog erros",
    })
    expect(rows.some((r) => r.kind === "component" && r.componentTitle === "Erros comuns")).toBe(true)
    expect(rows.some((r) => r.kind === "component" && r.componentTitle === "Intro")).toBe(false)
  })

  it("does not show another channel's components under instagram", () => {
    const rows = buildLevel2MentionRows({
      task,
      channels: [
        { channel_id: 11, name: "blog" },
        { channel_id: 12, name: "instagram" },
      ],
      channelsLoading: false,
      componentsByTaskChannel: {
        "12629:11": bucketLoaded([{ component_id: "only-blog", title: "Blog only" }]),
        "12629:12": bucketLoaded([]),
      },
      query: "",
    })
    const underInstagram = rows.filter(
      (r) => r.kind === "component" && r.channelName === "instagram"
    )
    expect(underInstagram).toHaveLength(0)
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

import { describe, it, expect } from "vitest"
import {
  dedupeComponents,
  mapTcComponentsAllChannelsRpc,
} from "../features/ai-chat/mention-task-channel-components"

describe("dedupeComponents", () => {
  it("dedupes by task_component_id first", () => {
    const out = dedupeComponents([
      { component_id: "u1", task_component_id: "tc-1", title: "A" },
      { component_id: "u2", task_component_id: "tc-1", title: "A dup" },
    ])
    expect(out).toHaveLength(1)
  })

  it("dedupes by component_key when task_component_id is absent", () => {
    const out = dedupeComponents([
      { component_id: "x", component_key: "seo.title", title: "X" },
      { component_id: "y", component_key: "seo.title", title: "Y" },
    ])
    expect(out).toHaveLength(1)
  })
})

describe("mapTcComponentsAllChannelsRpc", () => {
  it("returns channel rows and keeps channel-only sentinel without fake components", () => {
    const out = mapTcComponentsAllChannelsRpc([
      {
        task_id: 12629,
        channel_id: 11,
        channel_name: "Instagram",
        channel_slug: "instagram",
        task_component_id: null,
        component_title: null,
      },
    ])
    expect(out.channels).toEqual([{ channel_id: 11, name: "Instagram", slug: "instagram" }])
    expect(out.componentsByTaskChannel["12629:11"]).toEqual([])
  })

  it("maps channel components and dedupes by required key order", () => {
    const out = mapTcComponentsAllChannelsRpc([
      {
        task_id: 12629,
        channel_id: 12,
        channel_name: "Blog",
        channel_slug: "blog",
        task_component_id: "tc-1",
        component_key: "seo.title",
        component_title: "Title",
      },
      {
        task_id: 12629,
        channel_id: 12,
        channel_name: "Blog",
        channel_slug: "blog",
        task_component_id: "tc-1",
        component_key: "seo.title",
        component_title: "Title duplicate",
      },
    ])
    expect(out.componentsByTaskChannel["12629:12"]).toHaveLength(1)
    expect(out.componentsByTaskChannel["12629:12"]?.[0]?.component_id).toBe("tc-1")
  })

  it("uses component_key when task_component_id is absent", () => {
    const out = mapTcComponentsAllChannelsRpc([
      {
        task_id: 12629,
        channel_id: 12,
        channel_name: "Blog",
        channel_slug: "blog",
        task_component_id: null,
        component_key: "seo.caption",
        component_title: "Legenda curta",
      },
    ])
    expect(out.componentsByTaskChannel["12629:12"]?.[0]?.component_id).toBe("seo.caption")
  })
})

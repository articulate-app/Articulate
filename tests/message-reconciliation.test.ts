import { describe, expect, it } from "vitest"
import { buildRenderableMessages, prunePendingMessagesAgainstServer } from "../features/ai-chat/message-reconciliation"
import { parseUserMessageContentJson } from "../features/ai-chat/ai-chat-user-message-content"
import type { AiMessage } from "../features/ai-chat/types"

describe("message reconciliation", () => {
  it("renders persisted messages immediately when opening existing thread", () => {
    const server: AiMessage[] = [
      {
        id: "b68cfc63-90b3-475e-9da8-613b0d29d9a7",
        thread_id: "625080db-a53f-4668-9288-6bae0709dade",
        role: "user",
        content: "2+2?",
        created_at: "2026-04-20T15:57:06.648724+00:00",
      },
      {
        id: "9d560b59-8456-47a4-8838-1fb064a77721",
        thread_id: "625080db-a53f-4668-9288-6bae0709dade",
        role: "assistant",
        content: "2 + 2 equals 4.",
        created_at: "2026-04-20T15:57:06.941277+00:00",
      },
    ]
    const renderable = buildRenderableMessages(server, [])
    expect(renderable).toHaveLength(2)
    expect(renderable[0].id).toBe("b68cfc63-90b3-475e-9da8-613b0d29d9a7")
    expect(renderable[1].id).toBe("9d560b59-8456-47a4-8838-1fb064a77721")
  })

  it("removes optimistic duplicates when persisted user+assistant arrive", () => {
    const server: AiMessage[] = [
      {
        id: "u1",
        thread_id: "t1",
        role: "user",
        content: "hello",
        created_at: "2026-01-01T00:00:00Z",
      },
      {
        id: "a1",
        thread_id: "t1",
        role: "assistant",
        content: "hi there",
        created_at: "2026-01-01T00:00:01Z",
      },
    ]
    const pending: AiMessage[] = [
      {
        id: "temp-user",
        thread_id: "t1",
        role: "user",
        content: "hello",
        status: "pending",
        created_at: "2026-01-01T00:00:00Z",
      },
      {
        id: "temp-assistant",
        thread_id: "t1",
        role: "assistant",
        content: "hi there",
        status: "complete",
        created_at: "2026-01-01T00:00:01Z",
      },
    ]

    const pruned = prunePendingMessagesAgainstServer(server, pending)
    expect(pruned).toEqual([])
    const renderable = buildRenderableMessages(server, pending)
    expect(renderable).toHaveLength(2)
    expect(renderable.map((m) => m.id)).toEqual(["u1", "a1"])
  })

  it("enriches persisted user messages with pending mention metadata", () => {
    const tag = {
      type: "task" as const,
      id: 42,
      label: "High tensile strength materials",
      source: "mention" as const,
    }
    const server: AiMessage[] = [
      {
        id: "u1",
        thread_id: "t1",
        role: "user",
        content: "@High tensile strength materials please review",
        created_at: "2026-01-01T00:00:00Z",
      },
    ]
    const pending: AiMessage[] = [
      {
        id: "temp-user",
        thread_id: "t1",
        role: "user",
        content: "@High tensile strength materials please review",
        content_json: { mention_tags: [tag] },
        status: "pending",
        created_at: "2026-01-01T00:00:00Z",
      },
    ]

    const renderable = buildRenderableMessages(server, pending)
    expect(renderable).toHaveLength(1)
    expect(parseUserMessageContentJson(renderable[0].content_json).mention_tags).toHaveLength(1)
  })

  it("reconciles build-component optimistic display labels with persisted internal prompts", () => {
    const internalPrompt = "Build the component **FAQ** for task **Example**.\n\nInstructions:\nWrite FAQs"
    const server: AiMessage[] = [
      {
        id: "u-build",
        thread_id: "t1",
        role: "user",
        content: internalPrompt,
        created_at: "2026-01-01T00:00:00Z",
      },
    ]
    const pending: AiMessage[] = [
      {
        id: "temp-build",
        thread_id: "t1",
        role: "user",
        content: "Build with AI",
        content_json: {
          display_message: "Build with AI",
          display_parts: [
            { type: "text", text: "Build with AI for " },
            {
              type: "context_pill",
              entity_type: "component",
              label: "FAQ",
              subtitle: "Blog",
              task_id: 1,
              channel_id: 2,
              component_id: "comp-1",
              selected_context_type: "component_output",
            },
          ],
          internal_message: internalPrompt,
        },
        status: "pending",
        created_at: "2026-01-01T00:00:00Z",
      },
    ]

    const pruned = prunePendingMessagesAgainstServer(server, pending)
    expect(pruned).toHaveLength(1)

    const renderable = buildRenderableMessages(server, pending)
    expect(renderable).toHaveLength(1)
    expect(renderable[0].id).toBe("u-build")
    expect(parseUserMessageContentJson(renderable[0].content_json).display_parts).toHaveLength(2)
    expect((renderable[0].content_json as { display_message?: string }).display_message).toBe(
      "Build with AI",
    )
  })

  it("keeps optimistic mention metadata in state until the persisted row has tags", () => {
    const internalContent = "@Task / Channel / FAQ please update"
    const mentionTag = {
      type: "task_component" as const,
      id: "comp-1",
      label: "FAQ",
      source: "selection" as const,
      taskId: 1,
      channelId: 2,
      componentId: "comp-1",
      componentTitle: "FAQ",
      taskTitle: "Task",
      channelName: "Channel",
    }
    const server: AiMessage[] = [
      {
        id: "u-tagged",
        thread_id: "t1",
        role: "user",
        content: internalContent,
        created_at: "2026-01-01T00:00:00Z",
      },
    ]
    const pending: AiMessage[] = [
      {
        id: "temp-tagged",
        thread_id: "t1",
        role: "user",
        content: internalContent,
        content_json: {
          mention_tags: [mentionTag],
          segments: [
            { type: "mention", tag: mentionTag },
            { type: "text", text: " please update" },
          ],
        },
        status: "pending",
        created_at: "2026-01-01T00:00:00Z",
      },
    ]

    expect(prunePendingMessagesAgainstServer(server, pending)).toHaveLength(1)

    const renderable = buildRenderableMessages(server, pending)
    expect(renderable).toHaveLength(1)
    expect(renderable[0].id).toBe("u-tagged")
    expect(parseUserMessageContentJson(renderable[0].content_json).mention_tags).toHaveLength(1)

    const serverWithMetadata: AiMessage[] = [
      {
        ...server[0],
        content_json: pending[0].content_json,
      },
    ]
    expect(prunePendingMessagesAgainstServer(serverWithMetadata, pending)).toEqual([])
  })
})

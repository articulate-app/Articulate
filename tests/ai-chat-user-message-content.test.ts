import { describe, expect, it } from "vitest"
import {
  buildSelectionPillsFromContexts,
  buildUserMessageContentJson,
  inferUserMessageSegments,
  parseUserMessageContentJson,
} from "../features/ai-chat/ai-chat-user-message-content"
import { chipDisplayText } from "../features/ai-chat/composer-inline-editor"

describe("buildUserMessageContentJson", () => {
  it("returns null when there are no tags or segments", () => {
    expect(buildUserMessageContentJson({ tags: [] })).toBeNull()
  })

  it("stores mention tags and segments", () => {
    const tag = {
      type: "task" as const,
      id: 42,
      label: "High tensile strength materials",
      source: "mention" as const,
    }
    const contentJson = buildUserMessageContentJson({
      tags: [tag],
      segments: [{ type: "mention", tag }],
    })
    expect(contentJson?.mention_tags).toHaveLength(1)
    expect(contentJson?.segments).toHaveLength(1)
  })
})

describe("inferUserMessageSegments", () => {
  it("uses persisted segments when available", () => {
    const tag = {
      type: "task" as const,
      id: 1,
      label: "Alpha",
      source: "mention" as const,
    }
    const segments = inferUserMessageSegments(chipDisplayText(tag), {
      mention_tags: [tag],
      segments: [{ type: "text", text: "Review " }, { type: "mention", tag }],
    })
    expect(segments).toEqual([{ type: "text", text: "Review " }, { type: "mention", tag }])
  })

  it("reconstructs mention chips from plain content and tag metadata", () => {
    const tag = {
      type: "task" as const,
      id: 42,
      label: "High tensile strength materials",
      source: "mention" as const,
    }
    const content = `Please review ${chipDisplayText(tag)} today`
    const segments = inferUserMessageSegments(content, { mention_tags: [tag] })
    expect(segments).toEqual([
      { type: "text", text: "Please review " },
      { type: "mention", tag },
      { type: "text", text: " today" },
    ])
  })

  it("falls back to plain text when metadata is missing", () => {
    expect(inferUserMessageSegments("Hello\n\nworld", null)).toEqual([
      { type: "text", text: "Hello\n\nworld" },
    ])
  })
})

describe("buildSelectionPillsFromContexts", () => {
  it("keeps a single artifact pill when the same passage is also in text context", () => {
    const pills = buildSelectionPillsFromContexts({
      artifactContext: {
        artifact_id: "art-1",
        title: "Brief",
        selected_text: "gestão de ativos",
      },
      artifactTooltip: "Brief · selected text",
      textContext: {
        selected_text: "gestão de ativos",
        source_type: "chat_message",
      },
      textTooltip: "Selected chat text",
    })
    expect(pills).toHaveLength(1)
    expect(pills[0]?.entity_type).toBe("artifact")
    expect(pills[0]?.selected_text).toBe("gestão de ativos")
  })

  it("keeps a separate text pill when the passage is different from the artifact selection", () => {
    const pills = buildSelectionPillsFromContexts({
      artifactContext: {
        artifact_id: "art-1",
        title: "Brief",
      },
      textContext: {
        selected_text: "from a chat message",
        source_type: "chat_message",
      },
    })
    expect(pills).toHaveLength(2)
    expect(pills.map((pill) => pill.entity_type)).toEqual(["artifact", "chat"])
  })
})

describe("parseUserMessageContentJson", () => {
  it("filters invalid mention metadata", () => {
    expect(
      parseUserMessageContentJson({
        mention_tags: [{ type: "task", id: 1 }],
        segments: [{ type: "invalid" }],
      }),
    ).toEqual({})
  })
})

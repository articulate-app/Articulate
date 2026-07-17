import { describe, expect, it } from "vitest"
import {
  buildAssistantContentJsonFromMarkdown,
  formatAssistantBlocksForDisplay,
  formatAssistantContentForDisplay,
  formatUserMessageForDisplay,
  groupAssistantBlocksForRender,
  markdownFromAssistantBlocks,
} from "../features/ai-chat/ai-chat-message-format"

describe("formatUserMessageForDisplay", () => {
  it("preserves internal newlines for pre-wrap rendering", () => {
    expect(formatUserMessageForDisplay("line 1\n\nline 2")).toBe("line 1\n\nline 2")
  })

  it("normalizes Windows line endings", () => {
    expect(formatUserMessageForDisplay("a\r\nb")).toBe("a\nb")
  })
})

describe("formatAssistantContentForDisplay", () => {
  it("splits double newlines into separate paragraphs", () => {
    const html = formatAssistantContentForDisplay("Here's a brief overview:\n\nIntro: details")
    expect(html).toContain("<p>")
    expect(html.match(/<p>/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
  })

  it("renders markdown links with anchor tags", () => {
    const html = formatAssistantContentForDisplay("See [Example](https://example.com) for more.")
    expect(html).toContain('<a href="https://example.com"')
  })

  it("renders bold markdown as strong tags", () => {
    const html = formatAssistantContentForDisplay("**Conclusão**")
    expect(html).toContain("<strong>Conclusão</strong>")
    expect(html).not.toContain("**Conclusão**")
  })

  it("renders numbered lists", () => {
    const markdown = "Here are updates:\n\n1. **Conclusão**: text\n2. **Que tipos existem?**: text"
    const html = formatAssistantContentForDisplay(markdown)
    expect(html).toContain("<ol>")
    expect(html).toContain("<li>")
    expect(html).toContain("<strong>Conclusão</strong>")
  })

  it("renders nested bullet lists", () => {
    const markdown = "1. **Conclusão**: text\n   - **Snippet**: quote"
    const html = formatAssistantContentForDisplay(markdown)
    expect(html).toContain("<ol>")
    expect(html).toContain("<ul>")
    expect(html).toContain("<strong>Snippet</strong>")
  })
})

describe("formatAssistantBlocksForDisplay", () => {
  it("merges escaped paragraph blocks into rich markdown output", () => {
    const blocks = [
      {
        type: "paragraph",
        text: "<p>1. **Conclusão**: text</p>",
      },
      {
        type: "paragraph",
        text: "<p>   - **Snippet**: quote</p>",
      },
    ]
    const html = formatAssistantBlocksForDisplay(blocks)
    expect(html).toContain("<strong>Conclusão</strong>")
    expect(html).toContain("<strong>Snippet</strong>")
    expect(html).not.toContain("**Conclusão**")
  })
})

describe("groupAssistantBlocksForRender", () => {
  it("groups consecutive text blocks for a single markdown render pass", () => {
    const segments = groupAssistantBlocksForRender([
      { type: "text", text: "Intro" },
      { type: "paragraph", text: "<p>More</p>" },
      { type: "table", headers: ["A"], rows: [["1"]] },
      { type: "text", text: "Outro" },
    ])
    expect(segments).toHaveLength(3)
    expect(segments[0]).toEqual({
      kind: "markdown",
      blocks: [
        { type: "text", text: "Intro" },
        { type: "paragraph", text: "<p>More</p>" },
      ],
    })
    expect(segments[1]?.kind).toBe("table")
    expect(segments[2]?.kind).toBe("markdown")
  })
})

describe("buildAssistantContentJsonFromMarkdown", () => {
  it("stores raw markdown in text blocks and preserves attachments", () => {
    const blocks = buildAssistantContentJsonFromMarkdown("**Hello**", [
      { type: "attachment", attachment_id: "a1" },
    ])
    expect(blocks).toEqual([
      { type: "text", text: "**Hello**" },
      { type: "attachment", attachment_id: "a1" },
    ])
  })
})

describe("markdownFromAssistantBlocks", () => {
  it("recovers markdown from escaped paragraph html", () => {
    const markdown = markdownFromAssistantBlocks([
      { type: "paragraph", text: "<p>**Bold** item</p>" },
    ])
    expect(markdown).toContain("**Bold**")
  })
})

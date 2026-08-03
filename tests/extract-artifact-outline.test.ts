import { describe, expect, it } from "vitest"
import { extractArtifactOutline } from "../features/artifacts/extract-artifact-outline"

describe("extractArtifactOutline", () => {
  it("reads heading blocks from content_json", () => {
    const outline = extractArtifactOutline({
      contentJson: {
        version: 1,
        blocks: [
          { id: "1", type: "heading", level: 1, text: "Intro" },
          { id: "2", type: "heading", level: 2, text: "Materials" },
          { id: "3", type: "paragraph", text: "Body copy" },
        ],
      },
      contentText: null,
    })
    expect(outline.map((row) => `${row.level}:${row.text}`)).toEqual([
      "1:Intro",
      "2:Materials",
    ])
  })

  it("falls back to markdown headings in content_text", () => {
    const outline = extractArtifactOutline({
      contentJson: null,
      contentText: "# Title\n\n## Section\n\nParagraph",
    })
    expect(outline.map((row) => `${row.level}:${row.text}`)).toEqual([
      "1:Title",
      "2:Section",
    ])
  })
})

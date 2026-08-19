import { describe, expect, it } from "vitest"
import { compareSeedDocuments } from "../app/lib/collaboration/seed-compare"
import { convertExistingArtifactToYDoc } from "../app/lib/collaboration/seed-existing-artifact"
import { yDocToPlainText } from "../app/lib/collaboration/ydoc-content"

const ARTICLE = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Launch plan" }] },
    {
      type: "paragraph",
      content: [
        { type: "text", marks: [{ type: "bold" }], text: "Bold" },
        { type: "text", text: " and " },
        { type: "text", marks: [{ type: "italic" }], text: "italic" },
        { type: "text", text: " with " },
        { type: "text", marks: [{ type: "underline" }], text: "underline" },
        { type: "text", text: " and " },
        { type: "text", marks: [{ type: "link", attrs: { href: "https://example.com" } }], text: "a link" },
        { type: "text", marks: [{ type: "highlight" }], text: " highlight" },
        {
          type: "text",
          marks: [{ type: "comment", attrs: { commentId: "c1" } }],
          text: " commented",
        },
      ],
    },
    {
      type: "bulletList",
      content: [
        { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "One" }] }] },
      ],
    },
    {
      type: "taskList",
      content: [
        {
          type: "taskItem",
          attrs: { checked: true },
          content: [{ type: "paragraph", content: [{ type: "text", text: "Done" }] }],
        },
      ],
    },
    {
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [
            {
              type: "tableHeader",
              attrs: { backgroundColor: "#fff3cd" },
              content: [{ type: "paragraph", content: [{ type: "text", text: "Head" }] }],
            },
            {
              type: "tableCell",
              attrs: { backgroundColor: "#d1e7dd" },
              content: [{ type: "paragraph", content: [{ type: "text", text: "Cell" }] }],
            },
          ],
        },
      ],
    },
    {
      type: "attachmentBlock",
      attrs: {
        attachmentId: "att-1",
        mediaType: "image",
        src: "https://hlszgarnpleikfkwujph.supabase.co/storage/v1/object/public/artifacts/img.png",
        fileName: "img.png",
        alt: "Hero",
        widthPct: 80,
      },
    },
  ],
}

describe("artifact collaboration seed (unit)", () => {
  it("preserves headings, marks, lists, tables, comments, and attachments", () => {
    const result = convertExistingArtifactToYDoc({
      contentJson: ARTICLE,
      contentText: "Launch plan",
    })
    expect(result.error).toBeUndefined()
    const text = yDocToPlainText(result.document)
    expect(text).toContain("Launch plan")
    expect(text).toContain("Bold")
    expect(text).toContain("a link")
    expect(text).toContain("commented")
    expect(text).toContain("Head")
    expect(text).toContain("Cell")
  })

  it("fails closed on an unknown node without emptying the source", () => {
    const original = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Keep me" }] },
        { type: "unknownWidget", attrs: { id: "x" } },
      ],
    }
    const compared = compareSeedDocuments({
      original,
      converted: { type: "doc", content: [{ type: "paragraph" }] },
      sourceWasEmpty: false,
    })
    expect(compared.ok).toBe(false)
    if (!compared.ok) {
      expect(compared.reason).toBe("unknown_node")
      expect(compared.nodes).toContain("unknownWidget")
    }
  })

  it("never treats an empty conversion of existing content as success", () => {
    const compared = compareSeedDocuments({
      original: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Existing article" }] }],
      },
      converted: { type: "doc", content: [{ type: "paragraph" }] },
      sourceWasEmpty: false,
    })
    expect(compared.ok).toBe(false)
    if (!compared.ok) expect(compared.reason).toBe("empty_overwrite")
  })
})

import { describe, expect, it } from "vitest"
import { normalizeComponentOutputToHtml, normalizeMixedRichText } from "../app/lib/rich-text-normalization"

describe("normalizeMixedRichText", () => {
  it("renders markdown bold in list items as HTML strong tags", () => {
    const markdown =
      "- **Material Composition**: High-strength materials are often made from specialized alloys or composites that enhance their performance characteristics."

    const html = normalizeMixedRichText(markdown)

    expect(html).toContain("<strong>Material Composition</strong>")
    expect(html).not.toContain("**Material Composition**")
  })
})

describe("normalizeComponentOutputToHtml", () => {
  it("preserves numbered h3 headings instead of ordered lists", () => {
    const html = normalizeComponentOutputToHtml("<h3>1. Enhanced Durability</h3><p>Body</p>", "Intro")
    expect(html).toContain("<h3")
    expect(html).toContain("Enhanced Durability")
    expect(html).not.toContain("<ol>")
  })
})

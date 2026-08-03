import { describe, expect, it } from "vitest"
import {
  buildArtifactTrackChangesHtml,
  resolveArtifactDiffHtml,
} from "../features/artifacts/artifact-rich-diff-html"

describe("artifact-rich-diff-html", () => {
  it("keeps unchanged rich blocks and marks inline word edits", () => {
    const before =
      "<h2>Materials</h2><p>For projects that need a broader material view, cork helps.</p>"
    const after =
      "<h2>Materials</h2><p>For a broader material view, cork helps.</p>"
    const html = buildArtifactTrackChangesHtml(before, after)
    expect(html).toContain("<h2>Materials</h2>")
    expect(html).toContain('class="artifact-diff-del"')
    expect(html).toContain("projects")
    expect(html).toContain("broader")
    expect(html).toMatch(/<p class="artifact-diff-inline">/)
  })

  it("marks inserted words inside a paragraph", () => {
    const before = "<p>The cork overview shows forms.</p>"
    const after = "<p>The cork overview shows calibrated forms.</p>"
    const html = buildArtifactTrackChangesHtml(before, after)
    expect(html).toContain('class="artifact-diff-ins"')
    expect(html).toContain("calibrated")
  })

  it("marks fully added paragraphs", () => {
    const before = "<p>One</p>"
    const after = "<p>One</p><p>Two</p>"
    const html = buildArtifactTrackChangesHtml(before, after)
    expect(html).toContain("artifact-diff-block-ins")
    expect(html).toContain("Two")
  })

  it("omits unchanged blocks when changedOnly", () => {
    const before =
      "<h2>Materials</h2><p>For projects that need cork.</p>"
    const after =
      "<h2>Materials</h2><p>For a broader material view.</p>"
    const html = buildArtifactTrackChangesHtml(before, after, { changedOnly: true })
    expect(html).not.toContain("<h2>Materials</h2>")
    expect(html).toContain("artifact-diff")
    expect(html).toContain("broader")
  })

  it("resolves html from content_json blocks", () => {
    const html = resolveArtifactDiffHtml({
      contentJson: {
        version: 1,
        blocks: [{ id: "body", type: "rich_text", html: "<p>Hello <strong>world</strong></p>" }],
      },
    })
    expect(html).toContain("<strong>world</strong>")
  })
})

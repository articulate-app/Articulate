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

  it("keeps a newly inserted table as one intact added block", () => {
    const before = "<h2>Compare</h2><p>Cork is useful.</p>"
    const after =
      "<h2>Compare</h2><table><tr><td><p>Cork</p></td><td><p>Wool</p></td></tr></table><p>Cork is useful.</p>"
    const html = buildArtifactTrackChangesHtml(before, after, { changedOnly: true })
    expect(html).toContain("<table")
    expect(html).toContain("artifact-diff-block-ins")
    expect(html).toContain("<td>")
    // Must not slice the table at nested </p>.
    expect(html).toMatch(/<table[\s\S]*<\/table>/i)
  })

  it("does not treat formatting-only SEO title churn as a full delete", () => {
    const before =
      "<p>SEO Meta Title: Acoustic insulation with cork: a primer for specifiers | Dimas &amp; Silva</p><p>Body stays.</p>"
    const after =
      "<p>SEO Meta Title: Acoustic insulation with cork: a primer for specifiers | Dimas & Silva</p><p>Body stays.</p><table><tr><td>Cork</td><td>Wool</td></tr></table>"
    const html = buildArtifactTrackChangesHtml(before, after, { changedOnly: true })
    expect(html).toContain("<table")
    expect(html).not.toMatch(/artifact-diff-block-del[^>]*>[\s\S]*SEO Meta Title/)
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

  it("keeps after-block anchors when nearby words change", () => {
    const before =
      "<p>Pode ser pedida uma colonoscopia para excluir outras causas.</p>"
    const after =
      '<p>Pode ser pedida uma <a href="https://www.jcs.pt/pt/blog-da-saude/colonoscopia-como-e-feita-e-quais-os-riscos/">colonoscopia</a> para excluir outras causas intestinais.</p>'
    const html = buildArtifactTrackChangesHtml(before, after)
    expect(html).toContain('href="https://www.jcs.pt/pt/blog-da-saude/colonoscopia-como-e-feita-e-quais-os-riscos/"')
    expect(html).toContain("colonoscopia")
    expect(html).toContain("intestinais")
  })

  it("keeps identical headings anchored when body paragraphs shift", () => {
    const before = [
      "<h2>Prevention in the workplace</h2>",
      "<p>Old advice one.</p>",
      "<p>Old advice two.</p>",
      "<h2>Common illnesses</h2>",
      "<p>Old illnesses.</p>",
    ].join("")
    const after = [
      "<h2>Prevention in the workplace</h2>",
      "<p>New advice one with more detail.</p>",
      "<p>New advice two with more detail.</p>",
      "<p>Extra paragraph inserted.</p>",
      "<h2>Common illnesses</h2>",
      "<p>Updated illnesses.</p>",
    ].join("")
    const html = buildArtifactTrackChangesHtml(before, after)
    expect(html).toContain("<h2>Prevention in the workplace</h2>")
    expect(html).toContain("<h2>Common illnesses</h2>")
    expect(html).not.toMatch(
      /<(h2)[^>]*artifact-diff-block-del[^>]*>\s*Prevention in the workplace/i,
    )
    expect(html).not.toMatch(
      /artifact-diff-block-del[^>]*>\s*<h2>\s*Prevention in the workplace/i,
    )
    expect(html).not.toMatch(
      /<(h2)[^>]*artifact-diff-block-del[^>]*>\s*Common illnesses/i,
    )
    expect(html).not.toMatch(
      /artifact-diff-block-del[^>]*>\s*<h2>\s*Common illnesses/i,
    )
  })
})

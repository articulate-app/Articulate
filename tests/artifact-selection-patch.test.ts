import { describe, expect, it } from "vitest"
import {
  applyArtifactPatches,
  buildHtmlFlatIndexMap,
  buildPatchedArtifactContent,
  ensureRichTextBlocksHaveHtml,
  finalizeArtifactUpdateContent,
  mergeArtifactSelection,
  preserveMediaFiguresInHtml,
  resolveHtmlExactSelection,
  resolveTextSelection,
  simpleMarkdownToHtml,
} from "../app/lib/artifact-selection-patch"

describe("artifact-selection-patch", () => {
  it("merges sparse model text_range with rich chat selection context", () => {
    const merged = mergeArtifactSelection(
      {
        text_range: { start: 10, end: 20 },
        artifact_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        version_number: 3,
      },
      {
        selected_text: "How to compare soundproofing materials",
        selection_before: "before",
        selection_after: "When evaluating acoustic materials",
        selection_start: 10,
        selection_end: 20,
        anchor_type: "text_range",
      },
    )
    expect(merged?.selected_text).toBe("How to compare soundproofing materials")
    expect(merged?.selection_after).toContain("When evaluating")
    expect(merged?.text_range).toEqual({ start: 10, end: 20 })
  })

  it("does not expand a heading-only selection into the following section", () => {
    const content =
      "Intro.How to compare soundproofing materialsWhen evaluating acoustic materials, include Performance and Design.Next topic starts here"
    const resolved = resolveTextSelection(content, {
      selected_text: "How to compare soundproofing materials",
      selection_start: 6,
      selection_end: 44,
      selection_after: "When evaluating acoustic materials, include Performance and Design.",
    })
    expect(resolved?.expanded).toBe(false)
    expect(resolved?.selectedText).toBe("How to compare soundproofing materials")
  })

  it("patches exact HTML prose selection and keeps surrounding headings/bold", () => {
    const html = [
      "<h1>Title</h1>",
      "<p><strong>Lead</strong></p>",
      "<p>That is why soundproofing specification should start with the outcome you want. More prose here.</p>",
      "<h2>What soundproofing actually means</h2>",
      "<p>Tail kept</p>",
    ].join("")
    const selected =
      "That is why soundproofing specification should start with the outcome you want. More prose here."
    const contentText =
      "TitleLeadThat is why soundproofing specification should start with the outcome you want. More prose here.What soundproofing actually meansTail kept"

    const patched = buildPatchedArtifactContent({
      contentText,
      contentJson: { version: 1, blocks: [{ id: "body", type: "rich_text", text: contentText, html }] },
      selection: {
        selected_text: selected,
        selection_start: contentText.indexOf(selected),
        selection_end: contentText.indexOf(selected) + selected.length,
      },
      replacementMarkdown: "Start with the outcome you want, then choose the material.",
    })
    expect(patched).not.toBeNull()
    if (!patched) throw new Error("expected patch")
    const nextHtml = String(patched.contentJson.blocks[0]?.html ?? "")
    expect(nextHtml).toContain("<h1>Title</h1>")
    expect(nextHtml).toContain("<strong>Lead</strong>")
    expect(nextHtml).toContain("<h2>What soundproofing actually means</h2>")
    expect(nextHtml).toContain("Start with the outcome you want")
    expect(nextHtml).not.toContain("More prose here")
    expect(patched.changeMeta.mode).toBe("html")
    expect(patched.changeMeta.expanded).toBe(false)
  })

  it("fails closed when HTML exists but selection cannot be mapped (never flattens doc)", () => {
    const html = "<h1>Title</h1><p>Body</p>"
    const patched = buildPatchedArtifactContent({
      contentText: "TitleBody",
      contentJson: { version: 1, blocks: [{ id: "body", type: "rich_text", html, text: "TitleBody" }] },
      selection: {
        selected_text: "this text is not in the document at all",
        selection_start: 0,
        selection_end: 10,
      },
      replacementMarkdown: "replacement",
    })
    expect(patched).toBeNull()
  })

  it("resolves exact selection offsets when flat plain matches content_text", () => {
    const html = "<h2>Heading</h2><p>Alpha beta gamma</p><h2>Next</h2>"
    const contentText = "HeadingAlpha beta gammaNext"
    const selected = "Alpha beta gamma"
    const resolved = resolveHtmlExactSelection(
      html,
      {
        selected_text: selected,
        selection_start: contentText.indexOf(selected),
        selection_end: contentText.indexOf(selected) + selected.length,
      },
      contentText,
    )
    expect(resolved?.mode).toBe("html")
    expect(resolved?.expanded).toBe(false)
    expect(resolved?.selectedText).toBe(selected)
    expect(resolved?.selectedHtml).toContain("Alpha beta gamma")
  })

  it("ensures rich_text blocks get html when missing", () => {
    const normalized = ensureRichTextBlocksHaveHtml(
      { version: 1, blocks: [{ id: "body", type: "rich_text", text: "Hello world" }] },
      "Hello world",
    )
    expect(String(normalized.blocks[0]?.html ?? "")).toContain("<p>Hello world</p>")
  })

  it("converts markdown headings in simpleMarkdownToHtml", () => {
    const html = simpleMarkdownToHtml("## Heading\n\nParagraph with **bold**.")
    expect(html).toContain("<h2>Heading</h2>")
    expect(html).toContain("<strong>bold</strong>")
  })

  it("reinserts missing media figures into regenerated HTML", () => {
    const previous = [
      "<h1>Title</h1>",
      '<p><strong>Lead</strong></p>',
      '<figure data-attachment-id="1331e7b4-aaaa-4bbb-8ccc-dddddddddddd" data-width-pct="100"><img src="https://example.com/a.jpg" alt="x" /></figure>',
      "<p>Body after image.</p>",
    ].join("")
    const next = "<h1>Title</h1><p><strong>Lead</strong></p><p>Body after image.</p>"
    const preserved = preserveMediaFiguresInHtml(previous, next)
    expect(preserved).toContain('data-attachment-id="1331e7b4-aaaa-4bbb-8ccc-dddddddddddd"')
    expect(preserved).toContain("<h1>Title</h1>")
  })

  it("finalizes update content by restoring dropped figures", () => {
    const previousHtml = [
      "<h1>Title</h1>",
      '<figure data-attachment-id="1331e7b4-aaaa-4bbb-8ccc-dddddddddddd"><img src="https://example.com/a.jpg" /></figure>',
      "<p>Keep me.</p>",
    ].join("")
    const finalized = finalizeArtifactUpdateContent({
      previousContentJson: {
        version: 1,
        blocks: [{ id: "body", type: "rich_text", html: previousHtml, text: "TitleKeep me." }],
      },
      contentText: "# Title\n\nKeep me.",
      contentJson: {
        version: 1,
        blocks: [{
          id: "body",
          type: "rich_text",
          html: "<h1>Title</h1><p>Keep me.</p>",
          text: "TitleKeep me.",
        }],
      },
    })
    expect(String(finalized.contentJson.blocks[0]?.html ?? "")).toContain(
      'data-attachment-id="1331e7b4-aaaa-4bbb-8ccc-dddddddddddd"',
    )
  })

  it("applies exact old_html patches without rewriting the rest of the document", () => {
    const html = [
      "<h1>Title</h1>",
      "<p>Alpha paragraph.</p>",
      "<h2>Strategy tips</h2>",
      "<p>Long tips body here.</p>",
      "<p>Tail kept.</p>",
    ].join("")
    const result = applyArtifactPatches({
      contentJson: { version: 1, blocks: [{ id: "body", type: "rich_text", html }] },
      patches: [{
        old_html: "<p>Long tips body here.</p>",
        new_html: "<p>Short tip.</p>",
      }],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("expected ok")
    const nextHtml = String(result.contentJson.blocks[0]?.html ?? "")
    expect(nextHtml).toContain("<h1>Title</h1>")
    expect(nextHtml).toContain("<h2>Strategy tips</h2>")
    expect(nextHtml).toContain("<p>Short tip.</p>")
    expect(nextHtml).toContain("<p>Tail kept.</p>")
    expect(nextHtml).not.toContain("Long tips body here")
    expect(result.applied).toBe(1)
  })

  it("rejects plain-range patches when expected_text does not match", () => {
    const html = "<h1>Title</h1><p>Hello world</p>"
    const result = applyArtifactPatches({
      contentJson: { version: 1, blocks: [{ id: "body", type: "rich_text", html }] },
      patches: [{
        plain_start: 5,
        plain_end: 10,
        expected_text: "WRONG",
        new_html: "<p>Nope</p>",
      }],
    })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected failure")
    expect(result.error).toBe("expected_text_mismatch")
  })

  it("applies verified plain-range patches and remove_attachment_id", () => {
    const html = [
      "<h1>Title</h1>",
      '<figure data-attachment-id="1331e7b4-aaaa-4bbb-8ccc-dddddddddddd"><img src="https://example.com/a.jpg" /></figure>',
      "<p>Hello world</p>",
    ].join("")
    const { plain } = buildHtmlFlatIndexMap(html)
    const start = plain.indexOf("Hello")
    const end = start + "Hello".length
    const result = applyArtifactPatches({
      contentJson: { version: 1, blocks: [{ id: "body", type: "rich_text", html }] },
      patches: [
        {
          plain_start: start,
          plain_end: end,
          expected_text: "Hello",
          new_html: "Hi",
        },
        {
          remove_attachment_id: "1331e7b4-aaaa-4bbb-8ccc-dddddddddddd",
        },
      ],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("expected ok")
    const nextHtml = String(result.contentJson.blocks[0]?.html ?? "")
    expect(nextHtml).toContain("Hi world")
    expect(nextHtml).not.toContain("data-attachment-id")
    expect(result.applied).toBe(2)
  })
})

import { describe, expect, it } from "vitest"
import {
  computeArtifactChangeStats,
  isSuspiciousFullRewriteStats,
  progressiveLiveAfterHtml,
  resolveArtifactChangeSides,
  resolveArtifactPreviewChangeInput,
  splitArtifactChangeSegments,
} from "../features/artifacts/resolve-artifact-change-diff"

describe("resolveArtifactChangeSides", () => {
  it("prefers baseline content_json over plain-only before text", () => {
    const beforeJson = {
      blocks: [
        {
          id: "body",
          type: "rich_text",
          html: "<h2>Specification checklist</h2><p>Keep this section.</p><p>Why it matters.</p>",
        },
      ],
    }
    const afterJson = {
      blocks: [
        {
          id: "body",
          type: "rich_text",
          html: "<h2>Specification checklist</h2><p>Keep this section.</p><p>It matters.</p>",
        },
      ],
    }
    const sides = resolveArtifactChangeSides({
      beforeText: "Specification checklist Keep this section. Why it matters.",
      beforeContentJson: null,
      afterText: null,
      afterContentJson: afterJson,
      baselineContentJson: beforeJson,
    })
    expect(sides.hasChanges).toBe(true)
    expect(sides.stats.removed).toBeGreaterThan(0)
    expect(sides.trackChangesHtml).toContain("artifact-diff")
    // Unchanged heading must not be painted as a full-block insert.
    expect(sides.trackChangesHtml).not.toMatch(
      /artifact-diff-block-ins[^>]*>[\s\S]*Specification checklist/,
    )
  })

  it("counts a single removed word in stats", () => {
    const stats = computeArtifactChangeStats(
      "<p>Why cork works for acoustic insulation</p>",
      "<p>cork works for acoustic insulation</p>",
    )
    expect(stats.removed).toBeGreaterThanOrEqual(3)
    expect(stats.added).toBe(0)
  })

  it("splits changed-only HTML into compact segments", () => {
    const before =
      "<h2>One</h2><p>Alpha old.</p><h2>Two</h2><p>Keep.</p><h2>Three</h2><p>Omega old.</p>"
    const after =
      "<h2>One</h2><p>Alpha new.</p><h2>Two</h2><p>Keep.</p><h2>Three</h2><p>Omega new.</p>"
    const segments = splitArtifactChangeSegments(before, after, {
      maxChars: 40,
      maxSegments: 6,
    })
    expect(segments.length).toBeGreaterThanOrEqual(2)
    for (const segment of segments) {
      expect(segment.html.trim().length).toBeGreaterThan(0)
    }
  })

  it("prioritizes an inserted table over noisy false deletions", () => {
    const seo =
      "SEO Meta Title: Acoustic insulation with cork: a primer for specifiers | Dimas & Silva"
    const before = [
      `<p>${seo}</p>`,
      "<p>Intro one.</p>",
      "<p>Intro two.</p>",
      "<p>Intro three.</p>",
      "<p>Intro four.</p>",
      "<p>Intro five.</p>",
      "<p>Intro six.</p>",
      "<p>Intro seven.</p>",
      "<p>Keep body.</p>",
    ].join("")
    const after = [
      `<p>${seo}</p>`,
      "<p>Intro one.</p>",
      "<p>Intro two.</p>",
      "<p>Intro three.</p>",
      "<p>Intro four.</p>",
      "<p>Intro five.</p>",
      "<p>Intro six.</p>",
      "<p>Intro seven.</p>",
      "<table><thead><tr><th>Cork</th><th>Mineral wool</th></tr></thead><tbody><tr><td>Warm</td><td>Dense</td></tr></tbody></table>",
      "<p>Keep body.</p>",
    ].join("")
    const segments = splitArtifactChangeSegments(before, after, { maxSegments: 8 })
    expect(segments.some((row) => /<table\b/i.test(row.html))).toBe(true)
    expect(
      segments.some((row) =>
        row.addedChars === 0
        && /SEO Meta Title/i.test(row.html)
      ),
    ).toBe(false)
  })

  it("does not report near-full-document removal for plain-before vs rich-after", () => {
    const body = Array.from({ length: 40 }, (_, index) =>
      `Paragraph ${index + 1} about occupational diseases and prevention in industrial workplaces.`,
    ).join(" ")
    const richAfter = [
      "<h2>Prevention in the workplace</h2>",
      `<p>${body}</p>`,
      "<h2>Common illnesses</h2>",
      "<p>Extra closing note.</p>",
    ].join("")
    const plainBefore = `Prevention in the workplace ${body} Common illnesses Extra closing note.`
    const sides = resolveArtifactChangeSides({
      beforeText: plainBefore,
      beforeContentJson: null,
      afterText: null,
      afterContentJson: {
        blocks: [{ id: "body", type: "rich_text", html: richAfter }],
      },
    })
    expect(
      isSuspiciousFullRewriteStats({
        beforeHtml: sides.beforeHtml,
        afterHtml: sides.afterHtml,
        beforePlain: sides.beforePlain,
        afterPlain: sides.afterPlain,
        stats: computeArtifactChangeStats(sides.beforeHtml, sides.afterHtml),
      }),
    ).toBe(true)
    // Guarded path: never claim almost the entire article was removed.
    expect(sides.stats.removed).toBeLessThan(plainBefore.length * 0.5)
    expect(sides.hasChanges).toBe(false)
    expect(sides.stats).toEqual({ added: 0, removed: 0 })
  })

  it("keeps a visible changed-only preview when plain-before vs rich-after has real edits", () => {
    const body = Array.from({ length: 40 }, (_, index) =>
      `Paragraph ${index + 1} about occupational diseases and prevention in industrial workplaces.`,
    ).join(" ")
    const richAfter = [
      "<h2>Prevention in the workplace</h2>",
      `<p>${body}</p>`,
      "<h2>Common illnesses</h2>",
      "<p>Extra closing note with a brand new sentence about yellow highlights.</p>",
    ].join("")
    const plainBefore = `Prevention in the workplace ${body} Common illnesses Extra closing note.`
    const sides = resolveArtifactChangeSides({
      beforeText: plainBefore,
      beforeContentJson: null,
      afterText: null,
      afterContentJson: {
        blocks: [{ id: "body", type: "rich_text", html: richAfter }],
      },
    })
    expect(sides.hasChanges).toBe(true)
    expect(sides.stats.added).toBeGreaterThan(0)
    expect(sides.trackChangesHtmlChangedOnly.trim()).not.toBe("")
    expect(sides.trackChangesHtmlChangedOnly.trim()).not.toBe("<p></p>")
    expect(sides.trackChangesHtmlChangedOnly).toMatch(/yellow highlights|artifact-diff/i)
  })

  it("does not treat section-only after as a full-document deletion in chat previews", () => {
    const beforeHtml = [
      "<h2>Cork Material: An Industrial Reader’s Guide</h2>",
      ...Array.from({ length: 20 }, (_, index) => `<p>Body paragraph ${index + 1} with industrial cork details.</p>`),
    ].join("")
    const afterHtml = `${beforeHtml}<p>Brand new closing paragraph about industrial readers.</p>`
    const sectionOnly = "<p>Brand new closing paragraph about industrial readers.</p>"
    const beforeJson = { blocks: [{ id: "body", type: "rich_text", html: beforeHtml }] }
    const afterJson = { blocks: [{ id: "body", type: "rich_text", html: afterHtml }] }

    const buggySides = resolveArtifactChangeSides({
      beforeText: null,
      beforeContentJson: beforeJson,
      afterText: sectionOnly,
      afterContentJson: afterJson,
      afterHtml: sectionOnly,
      baselineContentJson: beforeJson,
    })
    // Full-doc before vs section-only after invents a large deletion.
    expect(buggySides.stats.removed).toBeGreaterThan(500)
    expect(buggySides.stats.removed).toBeGreaterThan(buggySides.stats.added)

    const input = resolveArtifactPreviewChangeInput({
      phase: "saved",
      isBusy: false,
      beforeContentText: null,
      beforeContentJson: beforeJson,
      contentText: null,
      contentJson: afterJson,
      sectionHtml: sectionOnly,
      sectionBeforeHtml: null,
    })
    expect(input).not.toBeNull()
    expect(input?.afterHtml).toBeNull()
    const sides = resolveArtifactChangeSides(input!)
    expect(sides.stats.removed).toBe(0)
    expect(sides.stats.added).toBeGreaterThan(20)
    expect(sides.stats.added).toBeLessThan(200)
  })

  it("ignores unpersisted section HTML while busy and uses the live artifact instead", () => {
    const liveJson = { blocks: [{ id: "body", type: "rich_text", html: "<p>full before</p>" }] }
    const scoped = resolveArtifactPreviewChangeInput({
      phase: "preview",
      isBusy: true,
      beforeContentText: "full before",
      beforeContentJson: liveJson,
      contentText: "worker draft after",
      contentJson: { blocks: [{ id: "body", type: "rich_text", html: "<p>worker draft after</p>" }] },
      sectionHtml: "<p>new paragraph</p>",
      sectionBeforeHtml: "<p>old paragraph</p>",
      fallbackAfterText: "full before",
      fallbackAfterContentJson: liveJson,
    })
    expect(scoped?.beforeHtml).toBeNull()
    expect(scoped?.afterHtml).toBeNull()
    expect(scoped?.afterContentJson).toEqual(liveJson)
    expect(scoped?.afterText).toBe("full before")
  })

  it("does not invent an after document from section_html or stream snippets", () => {
    const progressive = resolveArtifactPreviewChangeInput({
      phase: "preview",
      isBusy: true,
      beforeContentText: null,
      beforeContentJson: null,
      contentText: null,
      contentJson: null,
      sectionHtml: "<p>Water-resistant materials draft…</p>",
      sectionBeforeHtml: null,
      streamSnippet: "Water-resistant materials draft…",
    })
    expect(progressive).toBeNull()
  })

  it("mirrors the live artifact while streaming instead of worker section_html", () => {
    const liveJson = { blocks: [{ id: "body", type: "rich_text", html: "<p>old</p>" }] }
    const progressive = resolveArtifactPreviewChangeInput({
      phase: "preview",
      isBusy: true,
      streaming: true,
      beforeContentText: "old",
      beforeContentJson: liveJson,
      contentText: "old",
      contentJson: liveJson,
      sectionHtml: "<table><tr><td>Newsletter draft…</td></tr></table>",
      sectionBeforeHtml: null,
      fallbackAfterText: "old",
      fallbackAfterContentJson: liveJson,
    })
    expect(progressive?.afterHtml).toBeNull()
    expect(progressive?.afterContentJson).toEqual(liveJson)
    expect(progressive?.afterText).toBe("old")
    const sides = resolveArtifactChangeSides(progressive!)
    expect(sides.hasChanges).toBe(false)
  })

  it("never treats worker stream HTML as the live artifact overlay", () => {
    expect(
      progressiveLiveAfterHtml({
        streaming: true,
        sectionHtml: "<p>ghost intro that was never saved</p>",
        streamSnippet: "ghost intro",
      }),
    ).toBeNull()
  })
})

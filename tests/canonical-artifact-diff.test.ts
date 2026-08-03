import { describe, expect, it } from "vitest"
import {
  artifactDiffPlainFromContent,
  canonicalArtifactDiffText,
} from "../app/lib/artifact-selection-patch"
import {
  buildComponentPreviewDiff,
  computeDiffCharStats,
  splitDiffIntoHunks,
} from "../features/tasks/utils/component-content-diff"

describe("canonicalArtifactDiffText", () => {
  it("treats identical title as unchanged across flat vs markdown representations", () => {
    const title = "The Best Soundproofing Materials for Better Acoustic Performance"
    const beforeHtml = `<h1>${title}</h1><p><strong>Discover how cork performs in soundproofing applications.</strong></p><p>Old intro paragraph that will change.</p>`
    const afterMarkdown = `# ${title}\n\n**Discover how cork performs in soundproofing applications.**\n\nNew shorter intro paragraph.`

    const before = artifactDiffPlainFromContent(
      "flat-unused",
      { blocks: [{ id: "body", type: "rich_text", html: beforeHtml }] },
    )
    const after = canonicalArtifactDiffText(afterMarkdown)

    expect(before.split("\n")[0]).toBe(title)
    expect(after.split("\n")[0]).toBe(title)

    const lines = buildComponentPreviewDiff({ operation: "replace", beforeText: before, afterText: after })
    const titleLine = lines.find((line) => line.text === title)
    expect(titleLine?.type).toBe("unchanged")
    expect(lines.filter((line) => line.text === title && line.type !== "unchanged")).toHaveLength(0)

    const hunks = splitDiffIntoHunks(lines)
    expect(hunks.length).toBeGreaterThanOrEqual(1)
    expect(hunks.every((hunk) => !hunk.lines.some((line) => line.text === title && line.type !== "unchanged"))).toBe(true)

    const stats = computeDiffCharStats(before, after)
    // Should not look like a full-document rewrite of ~10k chars.
    expect(stats.added + stats.removed).toBeLessThan(200)
  })

  it("strips markdown markers for comparison", () => {
    expect(canonicalArtifactDiffText("# Hello **world**")).toBe("Hello world")
    expect(canonicalArtifactDiffText("<h1>Hello</h1><p><strong>world</strong></p>")).toBe("Hello\nworld")
  })
})

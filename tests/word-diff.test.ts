import { describe, expect, it } from "vitest"
import {
  computeDiffCharStats,
  computeWordDiff,
  expandDiffLinesWithWordSpans,
  buildComponentPreviewDiff,
} from "../features/tasks/utils/component-content-diff"

describe("word-level artifact diffs", () => {
  it("highlights only changed words inside a paragraph", () => {
    const before = "Choosing the right material is a technical decision."
    const after = "Choosing the right material is an exciting technical decision."
    const tokens = computeWordDiff(before, after)
    const changed = tokens.filter((token) => token.type !== "unchanged")
    expect(changed.some((token) => token.text.includes("exciting"))).toBe(true)
    expect(tokens.some((token) => token.type === "unchanged" && token.text.includes("Choosing"))).toBe(true)
    const stats = computeDiffCharStats(before, after)
    expect(stats.added + stats.removed).toBeLessThan(before.length)
  })

  it("expands remove+add line pairs into word spans", () => {
    const lines = buildComponentPreviewDiff({
      operation: "replace",
      beforeText: "Hello world today",
      afterText: "Hello brave world today",
    })
    const rows = expandDiffLinesWithWordSpans(lines)
    expect(rows.some((row) => row.kind === "words")).toBe(true)
  })
})

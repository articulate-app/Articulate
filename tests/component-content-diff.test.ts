import { describe, expect, it } from "vitest"
import {
  buildComponentPreviewDiff,
  buildMergedPreviewAfterText,
  computeDiffCharStats,
  formatDiffCharStatsLabel,
} from "../features/tasks/utils/component-content-diff"

describe("component-content-diff", () => {
  it("computes removals for replace edits", () => {
    const lines = buildComponentPreviewDiff({
      operation: "replace",
      beforeText: "Intro paragraph\nRemove me",
      afterText: "Intro paragraph",
    })
    expect(lines.some((line) => line.type === "removed" && line.text.includes("Remove me"))).toBe(true)
  })

  it("computes append as before + delta with only additions", () => {
    const beforeText = "Existing intro"
    const afterText = buildMergedPreviewAfterText({
      operation: "append",
      beforeText,
      contentText: "New FAQ item",
    })
    const lines = buildComponentPreviewDiff({
      operation: "append",
      beforeText,
      afterText,
    })
    expect(lines.some((line) => line.type === "added" && line.text.includes("New FAQ"))).toBe(true)
    expect(lines.some((line) => line.type === "removed")).toBe(false)
  })

  it("formats diff stats for header", () => {
    const stats = computeDiffCharStats("Line one\nOld line", "Line one\nNew longer line")
    expect(formatDiffCharStatsLabel(stats)).toBe("+15 chars · -8 chars")
    expect(formatDiffCharStatsLabel(computeDiffCharStats("", "added only"))).toBe("+10 chars · -0 chars")
    expect(formatDiffCharStatsLabel(computeDiffCharStats("remove me", ""))).toBe("+0 chars · -9 chars")
  })
})

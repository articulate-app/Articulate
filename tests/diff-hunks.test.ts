import { describe, expect, it } from "vitest"
import {
  computeLineDiff,
  splitDiffIntoHunks,
} from "../features/tasks/utils/component-content-diff"

describe("splitDiffIntoHunks", () => {
  it("returns one hunk for a single contiguous change", () => {
    const lines = computeLineDiff(
      "Intro paragraph.\nOld title here.\nBody stays.",
      "Intro paragraph.\nNew title here.\nBody stays.",
    )
    const hunks = splitDiffIntoHunks(lines)
    expect(hunks).toHaveLength(1)
    expect(hunks[0].afterText).toContain("New title here")
    expect(hunks[0].beforeText).toContain("Old title here")
  })

  it("splits distant changes into multiple hunks", () => {
    const before = [
      "Alpha section one.",
      "Keep this A.",
      "Keep this B.",
      "Keep this C.",
      "Omega section two.",
    ].join("\n")
    const after = [
      "Alpha section revised.",
      "Keep this A.",
      "Keep this B.",
      "Keep this C.",
      "Omega section revised.",
    ].join("\n")
    const hunks = splitDiffIntoHunks(computeLineDiff(before, after), { maxUnchangedGap: 2 })
    expect(hunks.length).toBeGreaterThanOrEqual(2)
    expect(hunks[0].afterText).toContain("Alpha section revised")
    expect(hunks[hunks.length - 1].afterText).toContain("Omega section revised")
  })

  it("returns empty when texts match", () => {
    expect(splitDiffIntoHunks(computeLineDiff("Same", "Same"))).toEqual([])
  })
})

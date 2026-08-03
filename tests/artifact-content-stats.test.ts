import { describe, expect, it } from "vitest"
import {
  countWords,
  densityTone,
  formatCharCountLabel,
  formatWordCountLabel,
  keywordUtilizationPct,
} from "../features/artifacts/artifact-content-stats"

describe("artifact content stats", () => {
  it("counts words and formats labels", () => {
    expect(countWords("one two three")).toBe(3)
    expect(formatWordCountLabel(1200)).toBe("1,200 words")
    expect(formatCharCountLabel(15000)).toBe("15k chars")
  })

  it("computes utilization and density tone", () => {
    expect(keywordUtilizationPct(30, 1000)).toBeCloseTo(3)
    expect(densityTone(3)).toBe("ok")
    expect(densityTone(1.5)).toBe("warn")
    expect(densityTone(0.2)).toBe("bad")
    expect(densityTone(8)).toBe("warn")
    expect(densityTone(12)).toBe("bad")
  })
})

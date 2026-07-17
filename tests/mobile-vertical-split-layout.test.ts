import { describe, expect, it } from "vitest"
import {
  MOBILE_SPLIT_DEFAULT_TOP_PERCENT,
  MOBILE_SPLIT_MIN_PANE_PERCENT,
  clampMobileSplitTopPercent,
} from "../app/components/tasks/mobile-vertical-split-utils"

describe("clampMobileSplitTopPercent", () => {
  it("defaults to 55% top split", () => {
    expect(MOBILE_SPLIT_DEFAULT_TOP_PERCENT).toBe(55)
  })

  it("clamps below minimum top pane size", () => {
    expect(clampMobileSplitTopPercent(10)).toBe(MOBILE_SPLIT_MIN_PANE_PERCENT)
  })

  it("clamps above maximum top pane size", () => {
    expect(clampMobileSplitTopPercent(90)).toBe(100 - MOBILE_SPLIT_MIN_PANE_PERCENT)
  })

  it("passes through valid values", () => {
    expect(clampMobileSplitTopPercent(55)).toBe(55)
    expect(clampMobileSplitTopPercent(40)).toBe(40)
  })
})

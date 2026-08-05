import { describe, expect, it } from "vitest"
import {
  getPreviousPeriodRange,
  metricDelta,
} from "../app/lib/competition-previous-period"

describe("getPreviousPeriodRange", () => {
  it("returns an equal-length window ending the day before from", () => {
    const from = new Date(2026, 6, 6) // Jul 6
    const to = new Date(2026, 7, 4) // Aug 4 → 30 inclusive days
    const prev = getPreviousPeriodRange({ from, to })
    expect(prev.from).toEqual(new Date(2026, 5, 6)) // Jun 6
    expect(prev.to).toEqual(new Date(2026, 6, 5)) // Jul 5
  })

  it("handles a single-day range", () => {
    const day = new Date(2026, 7, 4)
    const prev = getPreviousPeriodRange({ from: day, to: day })
    expect(prev.from).toEqual(new Date(2026, 7, 3))
    expect(prev.to).toEqual(new Date(2026, 7, 3))
  })
})

describe("metricDelta", () => {
  it("subtracts previous from current", () => {
    expect(metricDelta(120, 100)).toBe(20)
    expect(metricDelta(80, 100)).toBe(-20)
    expect(metricDelta(0, 0)).toBe(0)
  })

  it("returns null when either side is missing", () => {
    expect(metricDelta(null, 10)).toBeNull()
    expect(metricDelta(10, null)).toBeNull()
    expect(metricDelta(undefined, undefined)).toBeNull()
  })
})

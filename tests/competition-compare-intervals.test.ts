import { describe, expect, it } from "vitest"
import {
  bucketDateKey,
  formatChartIntervalLabel,
} from "../app/components/projects/competition-chart-intervals"

describe("competition compare chart intervals", () => {
  it("buckets dates by day, week, and month", () => {
    expect(bucketDateKey("2026-07-15", "day")).toBe("2026-07-15")
    // Wednesday -> Monday week start
    expect(bucketDateKey("2026-07-15", "week")).toBe("2026-07-13")
    expect(bucketDateKey("2026-07-15", "month")).toBe("2026-07-01")
  })

  it("formats interval labels", () => {
    expect(formatChartIntervalLabel("2026-07-01", "month")).toContain("2026")
    expect(formatChartIntervalLabel("2026-07-13", "week")).toMatch(/^Week of /)
  })
})

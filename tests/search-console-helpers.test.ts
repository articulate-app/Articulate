import { describe, expect, it } from "vitest"
import { chunkDateRange } from "../supabase/functions/_shared/search-console/helpers"

describe("chunkDateRange", () => {
  it("splits a range into inclusive day chunks", () => {
    const chunks = chunkDateRange({
      startDate: "2026-01-01",
      endDate: "2026-01-10",
      chunkDays: 7,
    })
    expect(chunks).toEqual([
      { startDate: "2026-01-01", endDate: "2026-01-07" },
      { startDate: "2026-01-08", endDate: "2026-01-10" },
    ])
  })

  it("returns empty for inverted ranges", () => {
    expect(
      chunkDateRange({
        startDate: "2026-02-01",
        endDate: "2026-01-01",
        chunkDays: 7,
      }),
    ).toEqual([])
  })
})

import { describe, expect, it } from "vitest"
import {
  aggregateGoogleAnalyticsRows,
  normalizeGaPropertyId,
  parseGaDate,
  summarizeGoogleAnalyticsRows,
} from "../app/lib/google-analytics-data"

function row(date: string, channel: string, users: number, sessions: number, duration: number) {
  return {
    dimensionValues: [{ value: date }, { value: channel }],
    metricValues: [
      { value: String(users) },
      { value: String(sessions) },
      { value: String(duration) },
    ],
  }
}

describe("google analytics data helpers", () => {
  it("normalizes GA property ids", () => {
    expect(normalizeGaPropertyId("347260813")).toBe("properties/347260813")
    expect(normalizeGaPropertyId("properties/347260813")).toBe("properties/347260813")
    expect(normalizeGaPropertyId(" 347260813 ")).toBe("properties/347260813")
  })

  it("converts GA dates to ISO", () => {
    expect(parseGaDate("20260731")).toBe("2026-07-31")
    expect(parseGaDate("bad")).toBe("bad")
  })

  it("aggregates per channel and adds a Total Traffic row per date", () => {
    const rows = aggregateGoogleAnalyticsRows([
      row("20260731", "Organic Search", 10, 12, 60),
      row("20260731", "Direct", 5, 8, 30),
    ])

    expect(rows.filter((r) => r.date === "2026-07-31")).toHaveLength(3)
    const total = rows.find((r) => r.channelGroup === "Total Traffic")
    expect(total).toMatchObject({ activeUsers: 15, sessions: 20 })
    // Session-weighted average: (12*60 + 8*30) / 20
    expect(total?.avgSessionDuration).toBeCloseTo(48)
  })

  it("merges duplicate date/channel rows", () => {
    const rows = aggregateGoogleAnalyticsRows([
      row("20260731", "Organic Search", 10, 10, 40),
      row("20260731", "Organic Search", 2, 10, 60),
    ])
    const organic = rows.find((r) => r.channelGroup === "Organic Search")
    expect(organic).toMatchObject({ activeUsers: 12, sessions: 20 })
    expect(organic?.avgSessionDuration).toBeCloseTo(50)
  })

  it("summarizes totals from the Total Traffic rows only", () => {
    const rows = aggregateGoogleAnalyticsRows([
      row("20260730", "Organic Search", 4, 5, 10),
      row("20260731", "Direct", 6, 7, 20),
    ])
    const summary = summarizeGoogleAnalyticsRows(rows)
    expect(summary).toMatchObject({
      totalSessions: 12,
      totalActiveUsers: 10,
      firstDate: "2026-07-30",
      lastDate: "2026-07-31",
    })
    expect(summary.channels).toEqual(["Direct", "Organic Search"])
  })

  it("returns nothing for an empty report", () => {
    expect(aggregateGoogleAnalyticsRows([])).toEqual([])
  })
})

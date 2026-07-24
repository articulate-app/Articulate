import { describe, it, expect } from "vitest"
import { clampHomeRecentAt } from "../app/lib/services/home-sidebar-recents"

describe("clampHomeRecentAt", () => {
  it("keeps real recent timestamps", () => {
    const value = new Date().toISOString()
    expect(clampHomeRecentAt(value)).toBe(value)
  })

  it("drops future imported timestamps", () => {
    expect(clampHomeRecentAt("2027-07-03T16:36:00.000Z")).toBeNull()
  })

  it("handles nullish values", () => {
    expect(clampHomeRecentAt(null)).toBeNull()
    expect(clampHomeRecentAt(undefined)).toBeNull()
    expect(clampHomeRecentAt("not-a-date")).toBeNull()
  })
})

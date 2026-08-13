import { describe, expect, it } from "vitest"
import { moveItemBeforeKey } from "../app/lib/pane-tab-order"

describe("moveItemBeforeKey", () => {
  const tabs = [
    { key: "a", title: "A" },
    { key: "b", title: "B" },
    { key: "c", title: "C" },
  ]

  it("moves before a later tab", () => {
    expect(moveItemBeforeKey(tabs, "c", "a").map((t) => t.key)).toEqual(["c", "a", "b"])
  })

  it("moves before an earlier tab", () => {
    expect(moveItemBeforeKey(tabs, "a", "c").map((t) => t.key)).toEqual(["b", "a", "c"])
  })

  it("appends when beforeKey is null", () => {
    expect(moveItemBeforeKey(tabs, "a", null).map((t) => t.key)).toEqual(["b", "c", "a"])
  })

  it("no-ops for unknown key", () => {
    expect(moveItemBeforeKey(tabs, "z", "a")).toBe(tabs)
  })
})

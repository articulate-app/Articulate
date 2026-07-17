import { describe, expect, it } from "vitest"

import { getSplitViewOptions } from "../app/lib/split-pane-view"

describe("mobile split bottom view options", () => {
  it("offers calendar and kanban when primary is list", () => {
    expect(getSplitViewOptions("list")).toEqual(["calendar", "kanban"])
  })

  it("offers list and kanban when primary is calendar", () => {
    expect(getSplitViewOptions("calendar")).toEqual(["list", "kanban"])
  })

  it("offers list and calendar when primary is kanban", () => {
    expect(getSplitViewOptions("kanban")).toEqual(["list", "calendar"])
  })
})

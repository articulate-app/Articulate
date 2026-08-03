import { describe, expect, it } from "vitest"
import {
  buildCenterPaneTabKey,
  isCenterPaneTabPlaceholderTitle,
  listCenterPaneTabsNeedingTitleResolution,
} from "../app/store/center-pane-tabs"

describe("center pane tab title placeholders", () => {
  it("detects generated user/project placeholders", () => {
    expect(isCenterPaneTabPlaceholderTitle("User 40", "user", "40")).toBe(true)
    expect(isCenterPaneTabPlaceholderTitle("Raquel Cruz", "user", "40")).toBe(false)
    expect(isCenterPaneTabPlaceholderTitle("Project 12", "project", "12")).toBe(true)
  })

  it("lists only tabs that still need resolution", () => {
    const needing = listCenterPaneTabsNeedingTitleResolution([
      {
        key: buildCenterPaneTabKey("user", "40"),
        kind: "user",
        id: "40",
        title: "User 40",
      },
      {
        key: buildCenterPaneTabKey("user", "41"),
        kind: "user",
        id: "41",
        title: "Raquel Cruz",
      },
      {
        key: buildCenterPaneTabKey("research", "default"),
        kind: "research",
        id: "default",
        title: "Research",
      },
    ])
    expect(needing.map((tab) => tab.key)).toEqual(["user:40"])
  })
})

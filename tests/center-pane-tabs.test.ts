import { describe, expect, it } from "vitest"
import { resolveActiveCenterPaneTab } from "../app/lib/center-pane-tabs"
import { buildCenterPaneTabKey } from "../app/store/center-pane-tabs"

describe("resolveActiveCenterPaneTab", () => {
  it("prefers stacked team over user detail", () => {
    const active = resolveActiveCenterPaneTab({
      selectedTaskId: null,
      isSuggestion: false,
      selectedDetailTarget: {
        entityType: "user",
        entityId: "40",
        title: "Raquel Cruz",
      },
      stackTeamId: "7",
    })
    expect(active).toEqual({
      key: buildCenterPaneTabKey("team", "7"),
      kind: "team",
      id: "7",
      title: "Team",
    })
  })

  it("resolves task selection", () => {
    const active = resolveActiveCenterPaneTab({
      selectedTaskId: "12",
      isSuggestion: false,
      selectedTaskTitle: "Write brief",
      selectedDetailTarget: null,
    })
    expect(active?.key).toBe("task:12")
    expect(active?.title).toBe("Write brief")
  })

  it("resolves keyword research center view", () => {
    const active = resolveActiveCenterPaneTab({
      selectedTaskId: null,
      isSuggestion: false,
      selectedDetailTarget: null,
      centerView: "keyword-research",
    })
    expect(active).toEqual({
      key: buildCenterPaneTabKey("keyword-research", "default"),
      kind: "keyword-research",
      id: "default",
      title: "Keyword research",
    })
  })
})

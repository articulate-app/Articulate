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

  it("resolves research center view", () => {
    const active = resolveActiveCenterPaneTab({
      selectedTaskId: null,
      isSuggestion: false,
      selectedDetailTarget: null,
      centerView: "research",
    })
    expect(active).toEqual({
      key: buildCenterPaneTabKey("research", "default"),
      kind: "research",
      id: "default",
      title: "Research",
    })
  })

  it("resolves legacy keyword-research center view as research", () => {
    const active = resolveActiveCenterPaneTab({
      selectedTaskId: null,
      isSuggestion: false,
      selectedDetailTarget: null,
      centerView: "keyword-research",
    })
    expect(active).toEqual({
      key: buildCenterPaneTabKey("research", "default"),
      kind: "research",
      id: "default",
      title: "Research",
    })
  })

  it("resolves create center view", () => {
    const active = resolveActiveCenterPaneTab({
      selectedTaskId: null,
      isSuggestion: false,
      selectedDetailTarget: null,
      centerView: "create",
    })
    expect(active).toEqual({
      key: buildCenterPaneTabKey("create", "default"),
      kind: "create",
      id: "default",
      title: "Create",
    })
  })
})

import { describe, expect, it } from "vitest"
import { parseTasksSplitViewState } from "../app/lib/tasks-split-view-state"

describe("parseTasksSplitViewState", () => {
  it("does not treat workspace layout=left,middle,right as tasks list|calendar split", () => {
    const params = new URLSearchParams(
      "layout=right,middle,left&centerArtifactId=abc&rightView=ai&taskAiOpen=true&object=task&mode=grouped",
    )
    const state = parseTasksSplitViewState(params)
    expect(state.isSplit).toBe(false)
    expect(state.primaryView).toBe("list")
  })

  it("does not treat layout=left,middle as split without explicit middleView planner hint", () => {
    const params = new URLSearchParams("layout=left,middle&object=task&mode=grouped")
    expect(parseTasksSplitViewState(params).isSplit).toBe(false)
  })

  it("still enables split for legacy middleView=calendar with left+middle", () => {
    const params = new URLSearchParams("layout=left,middle&middleView=calendar")
    const state = parseTasksSplitViewState(params)
    expect(state.isSplit).toBe(true)
    expect(state.secondaryView).toBe("calendar")
  })

  it("does not treat workspace shell + middleView=calendar as tasks split", () => {
    const params = new URLSearchParams(
      "layout=left,middle,right&tasksView=list&middleView=calendar&leftPaneView=task-list&centerView=start&rightView=start",
    )
    const state = parseTasksSplitViewState(params)
    expect(state.isSplit).toBe(false)
    expect(state.primaryView).toBe("list")
  })

  it("respects explicit split=true", () => {
    const params = new URLSearchParams(
      "layout=left,middle,right&split=true&tasksView=list&splitView=calendar",
    )
    const state = parseTasksSplitViewState(params)
    expect(state.isSplit).toBe(true)
    expect(state.primaryView).toBe("list")
    expect(state.secondaryView).toBe("calendar")
  })
})

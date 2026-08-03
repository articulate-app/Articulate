import { beforeEach, describe, expect, it } from "vitest"
import {
  buildCenterPaneTabKey,
  useCenterPaneTabsStore,
} from "../app/store/center-pane-tabs"

describe("center pane tabs store closeTabs", () => {
  beforeEach(() => {
    useCenterPaneTabsStore.setState({ tabs: [] })
  })

  it("closes a contiguous selection and activates the tab after the range", () => {
    const keys = ["a", "b", "c", "d"].map((id) => buildCenterPaneTabKey("task", id))
    useCenterPaneTabsStore.setState({
      tabs: keys.map((key, index) => ({
        key,
        kind: "task" as const,
        id: String(index + 1),
        title: `Task ${index + 1}`,
      })),
    })

    const next = useCenterPaneTabsStore.getState().closeTabs([keys[1]!, keys[2]!])
    const remaining = useCenterPaneTabsStore.getState().tabs.map((tab) => tab.key)
    expect(remaining).toEqual([keys[0], keys[3]])
    expect(next?.key).toBe(keys[3])
  })

  it("falls back to the tab before the range when nothing remains to the right", () => {
    const keys = ["a", "b", "c"].map((id) => buildCenterPaneTabKey("task", id))
    useCenterPaneTabsStore.setState({
      tabs: keys.map((key, index) => ({
        key,
        kind: "task" as const,
        id: String(index + 1),
        title: `Task ${index + 1}`,
      })),
    })

    const next = useCenterPaneTabsStore.getState().closeTabs([keys[1]!, keys[2]!])
    expect(useCenterPaneTabsStore.getState().tabs.map((tab) => tab.key)).toEqual([keys[0]])
    expect(next?.key).toBe(keys[0])
  })
})

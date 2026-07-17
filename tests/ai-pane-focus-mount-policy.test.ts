import { describe, expect, it } from "vitest"
import {
  getInitialSplitLayoutMountState,
  nextSplitLayoutMountStateOnToggle,
  shouldRenderSplitLayout,
} from "../app/components/tasks/ai-pane-focus-mount-policy"

describe("ai pane focus mount policy", () => {
  it("expand from split keeps split layout mounted (no remount/refetch)", () => {
    const hasMounted = getInitialSplitLayoutMountState(false)
    const next = nextSplitLayoutMountStateOnToggle({
      isAiFocusModeEnabled: false,
      hasMountedSplitLayout: hasMounted,
    })
    expect(shouldRenderSplitLayout({ isAiFocusModeEnabled: true, hasMountedSplitLayout: next })).toBe(true)
  })

  it("collapse after expand keeps split layout mounted (reuse loaded data)", () => {
    const next = nextSplitLayoutMountStateOnToggle({
      isAiFocusModeEnabled: true,
      hasMountedSplitLayout: true,
    })
    expect(shouldRenderSplitLayout({ isAiFocusModeEnabled: false, hasMountedSplitLayout: next })).toBe(true)
  })

  it("direct-entry focused url defers split layout until collapse", () => {
    const initial = getInitialSplitLayoutMountState(true)
    expect(shouldRenderSplitLayout({ isAiFocusModeEnabled: true, hasMountedSplitLayout: initial })).toBe(false)
    const afterCollapse = nextSplitLayoutMountStateOnToggle({
      isAiFocusModeEnabled: true,
      hasMountedSplitLayout: initial,
    })
    expect(shouldRenderSplitLayout({ isAiFocusModeEnabled: false, hasMountedSplitLayout: afterCollapse })).toBe(true)
  })
})

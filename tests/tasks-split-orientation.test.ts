import { describe, expect, it } from "vitest"

import {
  DESKTOP_SPLIT_HORIZONTAL_MIN_WIDTH,
  getEffectiveSplitOrientation,
  getPreferredSplitOrientation,
} from "../app/lib/tasks-split-orientation"

describe("tasks split orientation", () => {
  it("prefers horizontal at or above the desktop threshold", () => {
    expect(getPreferredSplitOrientation(DESKTOP_SPLIT_HORIZONTAL_MIN_WIDTH)).toBe("horizontal")
    expect(getPreferredSplitOrientation(DESKTOP_SPLIT_HORIZONTAL_MIN_WIDTH + 1)).toBe("horizontal")
  })

  it("prefers vertical below the desktop threshold", () => {
    expect(getPreferredSplitOrientation(DESKTOP_SPLIT_HORIZONTAL_MIN_WIDTH - 1)).toBe("vertical")
  })

  it("forces vertical on mobile regardless of width", () => {
    expect(
      getEffectiveSplitOrientation({
        isMobile: true,
        isSplitEnabled: true,
        containerWidth: 2000,
        storedOrientation: "horizontal",
      }),
    ).toBe("vertical")
  })

  it("derives orientation from measured width while desktop split is open", () => {
    expect(
      getEffectiveSplitOrientation({
        isMobile: false,
        isSplitEnabled: true,
        containerWidth: 1200,
        storedOrientation: "vertical",
      }),
    ).toBe("horizontal")

    expect(
      getEffectiveSplitOrientation({
        isMobile: false,
        isSplitEnabled: true,
        containerWidth: 900,
        storedOrientation: "horizontal",
      }),
    ).toBe("vertical")
  })

  it("uses stored orientation until the container width is measured", () => {
    expect(
      getEffectiveSplitOrientation({
        isMobile: false,
        isSplitEnabled: true,
        containerWidth: null,
        storedOrientation: "vertical",
      }),
    ).toBe("vertical")
  })
})

import { describe, expect, it } from "vitest"
import { clipDesktopBrowserBounds } from "../app/lib/desktop-browser-bounds"

describe("clipDesktopBrowserBounds", () => {
  it("crops the native view below overlapping pane tab chrome", () => {
    const clipped = clipDesktopBrowserBounds(
      { x: 0, y: 20, width: 400, height: 300, visible: true },
      [{ left: 0, right: 400, bottom: 40 }],
    )
    expect(clipped).toEqual({
      x: 0,
      y: 40,
      width: 400,
      height: 280,
      visible: true,
    })
  })

  it("hides the view when almost fully covered by the tab bar", () => {
    const clipped = clipDesktopBrowserBounds(
      { x: 0, y: 0, width: 400, height: 36, visible: true },
      [{ left: 0, right: 400, bottom: 40 }],
    )
    expect(clipped.visible).toBe(false)
    expect(clipped.height).toBe(0)
  })
})

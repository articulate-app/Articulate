import { describe, expect, it } from "vitest"
import {
  fitContentRect,
  mapDisplayToBrowser,
  normalizeBrowserUrl,
} from "../app/lib/browser-coordinate"

describe("browser-coordinate", () => {
  it("fits content without stretching (letterbox)", () => {
    const fit = fitContentRect({ width: 800, height: 600 }, 1280, 720)
    expect(fit.scale).toBeCloseTo(800 / 1280)
    expect(fit.width).toBeCloseTo(800)
    expect(fit.height).toBeCloseTo(720 * (800 / 1280))
    expect(fit.x).toBeCloseTo(0)
    expect(fit.y).toBeGreaterThan(0)
  })

  it("maps center click 1:1 when display matches device", () => {
    const mapped = mapDisplayToBrowser(
      410,
      480,
      { width: 820, height: 960 },
      { deviceWidth: 820, deviceHeight: 960, pageScaleFactor: 1 },
    )
    expect(mapped.inside).toBe(true)
    expect(mapped.x).toBeCloseTo(410)
    expect(mapped.y).toBeCloseTo(480)
  })

  it("maps clicks through contain-fit scaling", () => {
    // Display 400×300, device 800×600 → scale 0.5, no letterbox
    const mapped = mapDisplayToBrowser(
      100,
      50,
      { width: 400, height: 300 },
      { deviceWidth: 800, deviceHeight: 600, pageScaleFactor: 1 },
    )
    expect(mapped.inside).toBe(true)
    expect(mapped.x).toBeCloseTo(200)
    expect(mapped.y).toBeCloseTo(100)
  })

  it("marks outside clicks when pointer is in letterbox margins", () => {
    const mapped = mapDisplayToBrowser(
      10,
      5,
      { width: 800, height: 600 },
      { deviceWidth: 1280, deviceHeight: 720, pageScaleFactor: 1 },
    )
    // Content is vertically centered; y=5 is in the top margin.
    expect(mapped.inside).toBe(false)
  })

  it("accounts for pageScaleFactor", () => {
    const mapped = mapDisplayToBrowser(
      100,
      100,
      { width: 200, height: 200 },
      { deviceWidth: 200, deviceHeight: 200, pageScaleFactor: 2 },
    )
    expect(mapped.x).toBeCloseTo(50)
    expect(mapped.y).toBeCloseTo(50)
  })

  it("normalizes URLs safely", () => {
    expect(normalizeBrowserUrl("example.com")).toBe("https://example.com")
    expect(normalizeBrowserUrl("https://example.com/a")).toBe("https://example.com/a")
    expect(normalizeBrowserUrl("//cdn.example/x")).toBe("https://cdn.example/x")
    expect(normalizeBrowserUrl("  ")).toBe("")
  })
})

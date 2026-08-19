import { describe, expect, it } from "vitest"
import {
  BROWSER_USE_SCREEN_HEIGHT,
  BROWSER_USE_SCREEN_WIDTH,
  buildPublishBrowserTabId,
  clampBrowserViewport,
  CLOUD_LIVE_VIEW_SCREEN_HEIGHT,
  CLOUD_LIVE_VIEW_SCREEN_WIDTH,
  defaultBrowserUseScreen,
  LIVE_VIEW_STREAM_HEIGHT,
  LIVE_VIEW_STREAM_WIDTH,
  liveViewCoverLayout,
  liveViewFitLayout,
  liveViewHostCoverLayout,
  liveViewLayoutForMode,
  planCloudBrowserViewport,
  remoteScreenForCloudBrowser,
  resolveBrowserRenderScale,
  withLiveViewEmbedParams,
} from "../app/lib/publishing/browser-viewport"

describe("browser-viewport", () => {
  it("clamps to Browser Use V4 screen limits", () => {
    expect(clampBrowserViewport({ width: 100, height: 50 })).toEqual({ width: 320, height: 320 })
    expect(clampBrowserViewport({ width: 9000, height: 5000 })).toEqual({ width: 6144, height: 3456 })
    expect(clampBrowserViewport({ width: 1400.4, height: 900.6 })).toEqual({ width: 1400, height: 901 })
  })

  it("uses a stable desktop remote screen (not pane-derived)", () => {
    expect(BROWSER_USE_SCREEN_WIDTH).toBe(1440)
    expect(BROWSER_USE_SCREEN_HEIGHT).toBe(900)
    expect(defaultBrowserUseScreen()).toEqual({ width: 1440, height: 900 })
  })

  it("aligns AI Chat Cloud sessions to the 16:9 Live View player", () => {
    expect(CLOUD_LIVE_VIEW_SCREEN_WIDTH / CLOUD_LIVE_VIEW_SCREEN_HEIGHT).toBeCloseTo(16 / 9, 5)
    expect(CLOUD_LIVE_VIEW_SCREEN_WIDTH).toBe(1920)
    expect(CLOUD_LIVE_VIEW_SCREEN_HEIGHT).toBe(1080)
  })

  it("hides Browser Use chrome so Articulate can draw its own", () => {
    expect(withLiveViewEmbedParams("https://live.example/view")).toBe(
      "https://live.example/view?ui=false",
    )
    expect(withLiveViewEmbedParams("https://live.example/view?wss=x")).toBe(
      "https://live.example/view?wss=x&ui=false",
    )
    expect(withLiveViewEmbedParams("https://live.example/view?ui=true&wss=x")).toBe(
      "https://live.example/view?ui=false&wss=x",
    )
  })

  it("Fit shows the full remote browser without cropping or distortion", () => {
    expect(
      liveViewFitLayout({
        hostWidth: 720,
        hostHeight: 900,
        remoteWidth: 1440,
        remoteHeight: 900,
      }),
    ).toEqual({ width: 720, height: 450, left: 0, top: 225 })

    const tallPane = liveViewFitLayout({
      hostWidth: 400,
      hostHeight: 1000,
      remoteWidth: 1440,
      remoteHeight: 900,
    })
    expect(tallPane.width).toBe(400)
    expect(tallPane.height).toBe(250)
    expect(tallPane.left).toBe(0)
    expect(tallPane.top).toBe(375)
  })

  it("pins cover overflow to the top so a bottom letterbox is cropped first", () => {
    const cover = liveViewCoverLayout({
      hostWidth: 1600,
      hostHeight: 600,
      remoteWidth: 16,
      remoteHeight: 9,
      verticalAlign: "top",
    })
    expect(cover.top).toBe(0)
    expect(cover.height).toBeGreaterThan(600)
  })

  it("covers a 16:10 chat card with the 16:9 Live View stream (no leftover host band)", () => {
    const cover = liveViewCoverLayout({
      hostWidth: 480,
      hostHeight: 300,
      remoteWidth: LIVE_VIEW_STREAM_WIDTH,
      remoteHeight: LIVE_VIEW_STREAM_HEIGHT,
    })
    expect(LIVE_VIEW_STREAM_WIDTH / LIVE_VIEW_STREAM_HEIGHT).toBeCloseTo(16 / 9, 5)
    expect(cover.height).toBeGreaterThanOrEqual(300)
    expect(cover.width).toBeGreaterThanOrEqual(480)
    expect(cover.width / cover.height).toBeCloseTo(16 / 9, 2)
  })

  it("Fill covers the host by cropping, never stretching", () => {
    const cover = liveViewCoverLayout({
      hostWidth: 400,
      hostHeight: 800,
      remoteWidth: 1440,
      remoteHeight: 900,
    })
    expect(cover.width).toBeGreaterThanOrEqual(400)
    expect(cover.height).toBeGreaterThanOrEqual(800)
    expect(cover.width / cover.height).toBeCloseTo(1440 / 900, 5)
  })

  it("viewer mode switches between Fit and Fill", () => {
    const args = {
      hostWidth: 400,
      hostHeight: 800,
      remoteWidth: 1440,
      remoteHeight: 900,
    }
    expect(liveViewLayoutForMode("fit", args)).toEqual(liveViewFitLayout(args))
    expect(liveViewLayoutForMode("fill", args)).toEqual(liveViewCoverLayout(args))
  })

  it("host cover at factor 1 is identity (no crop)", () => {
    expect(liveViewHostCoverLayout({ width: 500, height: 900 })).toEqual({
      width: 500,
      height: 900,
      left: 0,
      top: 0,
    })
  })

  it("ignores pane CSS size when planning remote screen", () => {
    expect(remoteScreenForCloudBrowser({ width: 760, height: 1000 }, 1)).toEqual({
      width: 1440,
      height: 900,
    })
    expect(remoteScreenForCloudBrowser({ width: 760, height: 1000 }, 2)).toEqual({
      width: 1440,
      height: 900,
    })
  })

  it("defaults to Cursor-like scale 1; explicit overrides", () => {
    expect(resolveBrowserRenderScale({ devicePixelRatio: 2 })).toBe(1)
    expect(resolveBrowserRenderScale({ explicit: 2, devicePixelRatio: 1 })).toBe(2)
    expect(resolveBrowserRenderScale({ explicit: 1.5 })).toBe(1.5)
  })

  it("plans cloud viewport with fixed desktop screen", () => {
    const plan = planCloudBrowserViewport(
      { width: 444, height: 828 },
      { explicitScale: 1.5, devicePixelRatio: 2 },
    )
    expect(plan.scale).toBe(1.5)
    expect(plan.screen).toEqual({ width: 1440, height: 900 })
    expect(plan.devicePixelRatio).toBe(2)
  })

  it("builds stable publish browser tab ids", () => {
    expect(
      buildPublishBrowserTabId({
        artifactId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        destinationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      }),
    ).toBe("pub-aaaaaaaa-bbbbbbbb")
    expect(buildPublishBrowserTabId({ artifactId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" })).toBe(
      "pub-artifact-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    )
  })
})

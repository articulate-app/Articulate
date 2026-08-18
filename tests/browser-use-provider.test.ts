import { afterEach, describe, expect, it, vi } from "vitest"
import {
  BrowserUseProvider,
  navigateViaCdp,
  resizeViaCdp,
} from "../supabase/functions/_shared/browser-agent/providers/browser-use"
import { createBrowserAgentProvider } from "../supabase/functions/_shared/browser-agent/index"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("BrowserUseProvider", () => {
  it("creates a profile via the v4 API", async () => {
    const spy = vi.fn(async () =>
      new Response(
        JSON.stringify({
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          name: "dest",
          userId: "project:1",
          createdAt: "2026-08-10T00:00:00.000Z",
          updatedAt: "2026-08-10T00:00:00.000Z",
        }),
        { status: 201 },
      ),
    )
    vi.stubGlobal("fetch", spy)

    const provider = new BrowserUseProvider({ apiKey: "bu_test_key", fetchImpl: spy as unknown as typeof fetch })
    const profile = await provider.createProfile({ name: "dest", userId: "project:1" })

    expect(profile.id).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
    expect(String(spy.mock.calls[0]?.[0])).toContain("/profiles")
    expect((spy.mock.calls[0]?.[1] as RequestInit).headers).toMatchObject({
      "X-Browser-Use-API-Key": "bu_test_key",
    })
  })

  it("uploads files through a presigned PUT URL", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4])
    const spy = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input)
      if (url.includes("/files/upload")) {
        return new Response(
          JSON.stringify({
            files: [
              {
                id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
                name: "hero.png",
                storedName: "hero.png",
                path: "uploads/hero.png",
                willOverride: false,
                uploadUrl: "https://upload.example/put",
              },
            ],
          }),
          { status: 200 },
        )
      }
      if (url.includes("upload.example")) {
        expect(init?.method).toBe("PUT")
        return new Response(null, { status: 200 })
      }
      throw new Error(`Unexpected fetch ${url}`)
    })

    const provider = new BrowserUseProvider({ apiKey: "bu_test", fetchImpl: spy as unknown as typeof fetch })
    const uploaded = await provider.uploadFile({
      workspaceId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      name: "hero.png",
      contentType: "image/png",
      bytes,
      purpose: "featured",
    })

    expect(uploaded.id).toBe("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")
    expect(uploaded.path).toBe("uploads/hero.png")
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it("reads live view URLs from the Cloud browser, not /runs events", async () => {
    const spy = vi.fn(async (input: unknown) => {
      const url = String(input)
      if (url.includes("/browsers/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")) {
        return new Response(
          JSON.stringify({
            id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            status: "active",
            liveUrl: "https://live.example/view",
          }),
          { status: 200 },
        )
      }
      throw new Error(`Unexpected fetch ${url}`)
    })

    const provider = new BrowserUseProvider({ apiKey: "bu_test", fetchImpl: spy as unknown as typeof fetch })
    const live = await provider.getLiveView("", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")
    expect(live.liveViewUrl).toBe("https://live.example/view")
    expect(live.source).toBe("browser")
    expect(String(spy.mock.calls[0]?.[0])).not.toContain("/runs")
  })

  it("sends allowResizing, proxy, and screen size when creating a browser", async () => {
    const spy = vi.fn(async () =>
      new Response(
        JSON.stringify({
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          status: "active",
          liveUrl: "https://live.example/b",
          cdpUrl: "wss://cdp.example/b",
          timeoutAt: "2026-08-10T01:00:00.000Z",
          startedAt: "2026-08-10T00:00:00.000Z",
        }),
        { status: 201 },
      ),
    )
    vi.stubGlobal("fetch", spy)

    const provider = new BrowserUseProvider({ apiKey: "bu_test", fetchImpl: spy as unknown as typeof fetch })
    const browser = await provider.createBrowser({
      screen: { width: 480, height: 900 },
      proxyCountryCode: "pt",
    })

    const body = JSON.parse(String((spy.mock.calls[0]?.[1] as RequestInit).body ?? "{}"))
    expect(body.allowResizing).toBe(false)
    expect(body.proxyCountryCode).toBe("pt")
    expect(body.browserScreenWidth).toBe(480)
    expect(body.browserScreenHeight).toBe(900)
    expect(browser.liveViewUrl).toBe("https://live.example/b")
  })

  it("allows proxyCountryCode null to disable residential proxy on createBrowser", async () => {
    const spy = vi.fn(async () =>
      new Response(
        JSON.stringify({
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          status: "active",
          liveUrl: "https://live.example/b",
        }),
        { status: 201 },
      ),
    )
    vi.stubGlobal("fetch", spy)

    const provider = new BrowserUseProvider({ apiKey: "bu_test", fetchImpl: spy as unknown as typeof fetch })
    await provider.createBrowser({
      proxyCountryCode: null,
      screen: { width: 800, height: 1000 },
    })

    const body = JSON.parse(String((spy.mock.calls[0]?.[1] as RequestInit).body ?? "{}"))
    expect(body.proxyCountryCode).toBeNull()
    expect(body.browserScreenWidth).toBe(800)
    expect(body.browserScreenHeight).toBe(1000)
    expect(String(spy.mock.calls[0]?.[0])).toContain("/browsers")
    expect(String(spy.mock.calls[0]?.[0])).not.toContain("/runs")
  })
})

describe("navigateViaCdp", () => {
  it("attaches to a page target and navigates", async () => {
    const sent: Array<Record<string, unknown>> = []

    class FakeWebSocket {
      static OPEN = 1
      readyState = FakeWebSocket.OPEN
      onopen: ((ev: unknown) => void) | null = null
      onmessage: ((ev: { data: string }) => void) | null = null
      onerror: ((ev: unknown) => void) | null = null
      constructor(_url: string) {
        queueMicrotask(() => this.onopen?.(null))
      }
      send(raw: string) {
        const msg = JSON.parse(raw) as { id: number; method: string; params?: Record<string, unknown> }
        sent.push(msg)
        queueMicrotask(() => {
          if (msg.method === "Target.getTargets") {
            this.onmessage?.({
              data: JSON.stringify({
                id: msg.id,
                result: {
                  targetInfos: [{ targetId: "page-1", type: "page", attached: true }],
                },
              }),
            })
          } else if (msg.method === "Target.attachToTarget") {
            this.onmessage?.({
              data: JSON.stringify({ id: msg.id, result: { sessionId: "sess-1" } }),
            })
          } else {
            this.onmessage?.({ data: JSON.stringify({ id: msg.id, result: {} }) })
          }
        })
      }
      close() {}
    }

    await navigateViaCdp("wss://cdp.example/session", "https://demo.example/admin", {
      webSocketCtor: FakeWebSocket as unknown as typeof WebSocket,
    })

    expect(sent.map((item) => item.method)).toEqual([
      "Target.getTargets",
      "Target.attachToTarget",
      "Page.enable",
      "Page.navigate",
    ])
    expect(sent.at(-1)?.params).toEqual({ url: "https://demo.example/admin" })
  })
})

describe("resizeViaCdp", () => {
  it("resizes the browser window without device-metrics letterboxing", async () => {
    const sent: Array<Record<string, unknown>> = []

    class FakeWebSocket {
      static OPEN = 1
      readyState = FakeWebSocket.OPEN
      onopen: ((ev: unknown) => void) | null = null
      onmessage: ((ev: { data: string }) => void) | null = null
      onerror: ((ev: unknown) => void) | null = null
      constructor(_url: string) {
        queueMicrotask(() => this.onopen?.(null))
      }
      send(raw: string) {
        const msg = JSON.parse(raw) as { id: number; method: string; params?: Record<string, unknown> }
        sent.push(msg)
        queueMicrotask(() => {
          if (msg.method === "Target.getTargets") {
            this.onmessage?.({
              data: JSON.stringify({
                id: msg.id,
                result: {
                  targetInfos: [{ targetId: "page-1", type: "page", attached: true }],
                },
              }),
            })
          } else if (msg.method === "Target.attachToTarget") {
            this.onmessage?.({
              data: JSON.stringify({ id: msg.id, result: { sessionId: "sess-1" } }),
            })
          } else if (msg.method === "Browser.getWindowForTarget") {
            this.onmessage?.({
              data: JSON.stringify({ id: msg.id, result: { windowId: 7 } }),
            })
          } else {
            this.onmessage?.({ data: JSON.stringify({ id: msg.id, result: {} }) })
          }
        })
      }
      close() {}
    }

    await resizeViaCdp(
      "wss://cdp.example/session",
      { width: 480, height: 900 },
      { webSocketCtor: FakeWebSocket as unknown as typeof WebSocket },
    )

    expect(sent.map((item) => item.method)).toEqual([
      "Target.getTargets",
      "Target.attachToTarget",
      "Emulation.clearDeviceMetricsOverride",
      "Browser.getWindowForTarget",
      "Browser.setWindowBounds",
    ])
    expect(sent.at(-1)?.params).toMatchObject({
      windowId: 7,
      bounds: { width: 480, height: 900, windowState: "normal" },
    })
  })
})

describe("createBrowserAgentProvider", () => {
  it("defaults to browser_use", () => {
    const provider = createBrowserAgentProvider({ apiKey: "bu_x" })
    expect(provider.name).toBe("browser_use")
  })

  it("rejects unimplemented providers", () => {
    expect(() => createBrowserAgentProvider({ provider: "browserbase_stagehand", apiKey: "x" })).toThrow(
      /not implemented/i,
    )
  })
})

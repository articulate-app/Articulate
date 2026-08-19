import { describe, expect, it } from "vitest"
import {
  browserPreviewToToolResult,
  discoverAiBrowserFromMessageContentJson,
} from "../features/ai-chat/discover-ai-browser"

describe("discoverAiBrowserFromMessageContentJson", () => {
  it("reads open_browser fields from persisted data_summary", () => {
    const found = discoverAiBrowserFromMessageContentJson({
      tool_results: [
        {
          ok: true,
          name: "open_browser",
          error: null,
          data_summary: {
            browser_session_id: "sess-1",
            browser_id: "bu-abc",
            live_view_url: "https://live.browser-use.com/?wss=example",
            start_url: "https://example.com",
            current_url: "https://example.com",
            provider: "browser_use",
            show_browser_preview: true,
            open_browser_tab: true,
          },
        },
      ],
    })
    expect(found).toHaveLength(1)
    expect(found[0]?.browserSessionId).toBe("sess-1")
    expect(found[0]?.browserId).toBe("bu-abc")
    expect(found[0]?.liveViewUrl).toContain("live.browser-use.com")
    expect(found[0]?.openBrowserTab).toBe(true)
    expect(found[0]?.showBrowserPreview).toBe(true)
    expect(found[0]?.provider).toBe("browser_use")
  })

  it("prefers the richest later use_browser update for the same session", () => {
    const found = discoverAiBrowserFromMessageContentJson({
      tool_results: [
        {
          ok: true,
          name: "open_browser",
          data_summary: {
            browser_session_id: "sess-1",
            start_url: "https://example.com",
            provider: "articulate_desktop",
            show_browser_preview: true,
            desktop_browser: { required: true, start_url: "https://example.com" },
          },
        },
        {
          ok: true,
          name: "use_browser",
          data_summary: {
            browser_session_id: "sess-1",
            browser_id: "desktop-1",
            current_url: "https://example.com/about",
            provider: "articulate_desktop",
            show_browser_preview: true,
            desktop_command: {
              required: true,
              command: "navigate",
              url: "https://example.com/about",
              browser_id: "desktop-1",
              browser_session_id: "sess-1",
            },
          },
        },
      ],
    })
    expect(found).toHaveLength(1)
    expect(found[0]?.currentUrl).toBe("https://example.com/about")
    expect(found[0]?.desktopCommand?.command).toBe("navigate")
    expect(found[0]?.desktopRequired).toBe(true)
  })

  it("reads a live-stream browser_preview before tool_results land", () => {
    const found = discoverAiBrowserFromMessageContentJson({
      browser_preview: {
        tool_name: "open_browser",
        ok: true,
        browser_session_id: "sess-live",
        live_view_url: "https://live.browser-use.com/?wss=live",
        show_browser_preview: true,
        open_browser_tab: true,
      },
    })
    expect(found).toHaveLength(1)
    expect(found[0]?.browserSessionId).toBe("sess-live")
    expect(found[0]?.openBrowserTab).toBe(true)
  })

  it("does not treat open_browser as an instruction to activate the pane", () => {
    const found = discoverAiBrowserFromMessageContentJson({
      tool_results: [
        {
          ok: true,
          name: "open_browser",
          data_summary: {
            browser_session_id: "sess-keep",
            provider: "browser_use",
            show_browser_preview: true,
          },
        },
      ],
    })
    expect(found[0]?.openBrowserTab).toBe(false)
  })
})

describe("browserPreviewToToolResult", () => {
  it("keeps session ids for in-flight message hydration", () => {
    const row = browserPreviewToToolResult({
      tool_name: "open_browser",
      browser_session_id: "sess-2",
      browser_id: "bu-2",
      live_view_url: "https://live.example",
      open_browser_tab: true,
    })
    expect(row.name).toBe("open_browser")
    expect((row.data_summary as { browser_session_id?: string }).browser_session_id).toBe("sess-2")
    expect((row.data_summary as { open_browser_tab?: boolean }).open_browser_tab).toBe(true)
  })
})

import { describe, expect, it } from "vitest"
import type { RightPaneTab } from "../app/store/right-pane-tabs"
import type { AiBrowserDiscovery } from "../features/ai-chat/discover-ai-browser"
import {
  canonicalizeAiBrowserDiscovery,
  findReusableAiBrowserTab,
} from "../features/ai-chat/resolve-ai-browser-session"

function discovery(overrides: Partial<AiBrowserDiscovery> = {}): AiBrowserDiscovery {
  return {
    browserSessionId: "sess-new",
    browserId: null,
    sessionId: null,
    liveViewUrl: null,
    startUrl: "https://www.publico.pt/",
    currentUrl: "https://www.publico.pt/",
    title: "Público",
    provider: "articulate_desktop",
    browserLabel: "Desktop",
    status: "desktop_ready",
    showBrowserPreview: true,
    openBrowserTab: true,
    desktopRequired: true,
    desktopCommand: null,
    ...overrides,
  }
}

function aiTab(overrides: Partial<RightPaneTab> = {}): RightPaneTab {
  return {
    key: "browser:sess-1",
    kind: "browser",
    id: "sess-1",
    title: "JN",
    browser: {
      aiOperationId: "sess-1",
      browserId: "sess-1",
      source: "ai",
      provider: "articulate_desktop",
      currentUrl: "https://www.jn.pt/",
      phase: "desktop_ready",
    },
    ...overrides,
  }
}

describe("findReusableAiBrowserTab", () => {
  it("prefers the exact AI session when it is still live", () => {
    const tabs = [aiTab(), aiTab({ key: "browser:sess-2", id: "sess-2", browser: { aiOperationId: "sess-2", source: "ai" } })]
    expect(findReusableAiBrowserTab(tabs, { browserSessionId: "sess-2" })?.id).toBe("sess-2")
  })

  it("falls back to the latest live AI-sourced tab", () => {
    const tabs = [
      aiTab(),
      { key: "browser:manual", kind: "browser" as const, id: "manual", title: "Manual", browser: { source: "manual" } },
    ]
    expect(findReusableAiBrowserTab(tabs, { browserSessionId: "sess-new" })?.id).toBe("sess-1")
  })
})

describe("canonicalizeAiBrowserDiscovery", () => {
  it("reuses the thread session and synthesizes navigate for a later open_browser", () => {
    const next = canonicalizeAiBrowserDiscovery(discovery(), [aiTab()])
    expect(next.browserSessionId).toBe("sess-1")
    expect(next.browserId).toBe("sess-1")
    expect(next.openBrowserTab).toBe(false)
    expect(next.desktopCommand?.command).toBe("navigate")
    expect(next.desktopCommand?.url).toBe("https://www.publico.pt/")
  })

  it("does not invent a second session when no AI tab exists yet", () => {
    const next = canonicalizeAiBrowserDiscovery(discovery(), [])
    expect(next.browserSessionId).toBe("sess-new")
    expect(next.openBrowserTab).toBe(false)
    expect(next.desktopCommand).toBeNull()
  })
})

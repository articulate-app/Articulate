import { describe, expect, it } from "vitest"
import { resolveBrowserProvider } from "../supabase/functions/_shared/browser-agent/resolve-browser-provider"

describe("resolveBrowserProvider", () => {
  it("prefers Desktop for immediate publication when Desktop is available", () => {
    const resolved = resolveBrowserProvider({
      operation: "immediate_publication",
      desktopAvailable: true,
      cloudConfigured: true,
    })
    expect(resolved.provider).toBe("articulate_desktop")
    expect(resolved.reason).toBe("desktop_available")
    expect(resolved.requiresDesktopClient).toBe(true)
    expect(resolved.requiresLocalClient).toBe(false)
  })

  it("falls back to cloud when Desktop is unavailable", () => {
    const resolved = resolveBrowserProvider({
      operation: "immediate_publication",
      desktopAvailable: false,
      cloudConfigured: true,
    })
    expect(resolved.provider).toBe("browser_use")
    expect(resolved.reason).toBe("desktop_unavailable_fallback_cloud")
  })

  it("ignores legacy local bridge health and does not select browser_use_local", () => {
    const resolved = resolveBrowserProvider({
      operation: "immediate_publication",
      desktopAvailable: false,
      localBridge: { available: true, chromeAvailable: true, forceLocal: true },
      cloudConfigured: true,
    })
    expect(resolved.provider).toBe("browser_use")
    expect(resolved.provider).not.toBe("browser_use_local")
  })

  it("honors explicit cloud preference even when Desktop is available", () => {
    const resolved = resolveBrowserProvider({
      operation: "immediate_publication",
      executionMode: "cloud",
      desktopAvailable: true,
    })
    expect(resolved.provider).toBe("browser_use")
    expect(resolved.reason).toBe("explicit_cloud")
  })

  it("forces cloud for unattended scheduled execution", () => {
    const resolved = resolveBrowserProvider({
      operation: "unattended_scheduled_execution",
      desktopAvailable: true,
    })
    expect(resolved.provider).toBe("browser_use")
    expect(resolved.reason).toBe("unattended_requires_cloud")
  })

  it("prefers Desktop for interactive browser tabs", () => {
    const resolved = resolveBrowserProvider({
      operation: "interactive_browser",
      desktopAvailable: true,
    })
    expect(resolved.provider).toBe("articulate_desktop")
    expect(resolved.reason).toBe("desktop_available")
  })
})

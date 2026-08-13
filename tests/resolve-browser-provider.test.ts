import { describe, expect, it } from "vitest"
import { resolveBrowserProvider } from "../supabase/functions/_shared/browser-agent/resolve-browser-provider"

describe("resolveBrowserProvider", () => {
  it("prefers local for immediate publication when bridge is healthy", () => {
    const resolved = resolveBrowserProvider({
      operation: "immediate_publication",
      localBridge: { available: true, chromeAvailable: true },
      cloudConfigured: true,
    })
    expect(resolved.provider).toBe("browser_use_local")
    expect(resolved.reason).toBe("local_available")
    expect(resolved.requiresLocalClient).toBe(true)
  })

  it("falls back to cloud when local bridge is unavailable", () => {
    const resolved = resolveBrowserProvider({
      operation: "immediate_publication",
      localBridge: { available: false },
      cloudConfigured: true,
    })
    expect(resolved.provider).toBe("browser_use")
    expect(resolved.reason).toBe("local_unavailable_fallback_cloud")
  })

  it("honors explicit cloud preference", () => {
    const resolved = resolveBrowserProvider({
      operation: "immediate_publication",
      executionMode: "cloud",
      localBridge: { available: true, chromeAvailable: true },
    })
    expect(resolved.provider).toBe("browser_use")
    expect(resolved.reason).toBe("explicit_cloud")
  })

  it("forces cloud for unattended scheduled execution", () => {
    const resolved = resolveBrowserProvider({
      operation: "unattended_scheduled_execution",
      localBridge: { available: true, chromeAvailable: true },
    })
    expect(resolved.provider).toBe("browser_use")
    expect(resolved.reason).toBe("unattended_requires_cloud")
  })

  it("prefers local for interactive/manual browser tabs when bridge is healthy", () => {
    const resolved = resolveBrowserProvider({
      operation: "interactive_browser",
      localBridge: { available: true, chromeAvailable: true },
    })
    expect(resolved.provider).toBe("browser_use_local")
    expect(resolved.reason).toBe("local_available")
  })
})

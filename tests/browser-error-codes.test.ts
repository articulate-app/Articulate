import { describe, expect, it } from "vitest"
import { BROWSER_ERROR_CODES } from "../supabase/functions/_shared/browser-agent/controller"

describe("BROWSER_ERROR_CODES", () => {
  it("covers generic session failures without publication language", () => {
    expect(BROWSER_ERROR_CODES.browser_session_not_found).toBe("browser_session_not_found")
    expect(BROWSER_ERROR_CODES.browser_session_expired).toBe("browser_session_expired")
    expect(BROWSER_ERROR_CODES.browser_navigation_failed).toBe("browser_navigation_failed")
    expect(BROWSER_ERROR_CODES.browser_action_failed).toBe("browser_action_failed")
    expect(Object.values(BROWSER_ERROR_CODES).join(" ")).not.toMatch(/publication/i)
  })
})

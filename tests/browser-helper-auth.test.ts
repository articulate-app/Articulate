import { describe, expect, it } from "vitest"
import {
  mintLocalBrowserAccessToken,
  verifyLocalBrowserAccessToken,
  ALL_LOCAL_BROWSER_SCOPES,
} from "../app/lib/browser-helper-auth"

describe("browser-helper-auth", () => {
  it("mints and verifies a short-lived local browser token", async () => {
    const minted = await mintLocalBrowserAccessToken({
      sub: "auth-user-1",
      user_id: 42,
      device_id: "device-abc",
      scope: ALL_LOCAL_BROWSER_SCOPES,
    })
    expect(minted.token.split(".")).toHaveLength(3)
    expect(minted.expiresIn).toBeGreaterThan(60)
    const payload = await verifyLocalBrowserAccessToken(minted.token)
    expect(payload.sub).toBe("auth-user-1")
    expect(payload.device_id).toBe("device-abc")
    expect(payload.user_id).toBe(42)
  })
})

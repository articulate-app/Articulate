import { describe, expect, it } from "vitest"
import { createHmac } from "crypto"

/**
 * Lightweight unit coverage for OAuth state signing without importing Next env helpers.
 * Mirrors app/lib/google-oauth.ts signing rules.
 */

function sign(payload: object, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")
  const sig = createHmac("sha256", secret).update(body).digest("base64url")
  return `${body}.${sig}`
}

function verify(state: string, secret: string): Record<string, unknown> {
  const [body, sig] = state.split(".")
  if (!body || !sig) throw new Error("Invalid OAuth state")
  const expected = createHmac("sha256", secret).update(body).digest("base64url")
  if (sig !== expected) throw new Error("Invalid OAuth state signature")
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"))
  if (Date.now() > Number(payload.exp)) throw new Error("OAuth state expired")
  return payload
}

describe("google oauth state", () => {
  const secret = "test-secret"

  it("round-trips project and user ids", () => {
    const payload = {
      projectId: 42,
      authUserId: "user-1",
      returnTo: "https://app.whyarticulate.com/projects/1",
      nonce: "abc",
      exp: Date.now() + 60_000,
    }
    const state = sign(payload, secret)
    expect(verify(state, secret)).toMatchObject({
      projectId: 42,
      authUserId: "user-1",
    })
  })

  it("rejects tampered signatures", () => {
    const state = sign(
      {
        projectId: 1,
        authUserId: "u",
        returnTo: "/",
        nonce: "n",
        exp: Date.now() + 60_000,
      },
      secret,
    )
    expect(() => verify(state.replace(/\.[^.]+$/, ".bad"), secret)).toThrow(
      /signature/,
    )
  })

  it("rejects expired state", () => {
    const state = sign(
      {
        projectId: 1,
        authUserId: "u",
        returnTo: "/",
        nonce: "n",
        exp: Date.now() - 1,
      },
      secret,
    )
    expect(() => verify(state, secret)).toThrow(/expired/)
  })
})

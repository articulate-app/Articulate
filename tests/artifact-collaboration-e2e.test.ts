import { describe, expect, it } from "vitest"

const enabled = process.env.ARTIFACT_COLLAB_E2E === "1"

describe.skipIf(!enabled)("artifact collaboration e2e (real browsers)", () => {
  it("is skipped unless two Supabase accounts and browser contexts are provided", () => {
    expect(process.env.ARTIFACT_COLLAB_E2E_USER_A).toBeTruthy()
    expect(process.env.ARTIFACT_COLLAB_E2E_USER_B).toBeTruthy()
  })
})

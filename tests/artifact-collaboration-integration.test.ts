import { describe, expect, it } from "vitest"

const enabled = process.env.ARTIFACT_COLLAB_INTEGRATION === "1"

describe.skipIf(!enabled)("artifact collaboration integration (live Supabase)", () => {
  it("requires explicit ARTIFACT_COLLAB_INTEGRATION=1 and project credentials", () => {
    expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBeTruthy()
  })
})

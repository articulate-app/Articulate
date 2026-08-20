import { describe, expect, it } from "vitest"
import { isArtifactLiveEditLocked } from "../features/artifacts/artifact-live-edit-lock"

describe("isArtifactLiveEditLocked", () => {
  const now = Date.parse("2026-08-06T10:00:00.000Z")

  it("never locks the current document, including while streaming", () => {
    expect(
      isArtifactLiveEditLocked(
        {
          phase: "preview",
          streaming: true,
          updatedAt: "2026-08-06T09:59:50.000Z",
        },
        now,
      ),
    ).toBe(false)
    expect(
      isArtifactLiveEditLocked(
        {
          phase: "started",
          streaming: false,
          updatedAt: "2026-08-06T09:59:30.000Z",
        },
        now,
      ),
    ).toBe(false)
    expect(isArtifactLiveEditLocked(null, now)).toBe(false)
  })
})

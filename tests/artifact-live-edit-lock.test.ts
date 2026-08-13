import { describe, expect, it } from "vitest"
import { isArtifactLiveEditLocked } from "../features/artifacts/artifact-live-edit-lock"

describe("isArtifactLiveEditLocked", () => {
  const now = Date.parse("2026-08-06T10:00:00.000Z")

  it("locks while streaming", () => {
    expect(
      isArtifactLiveEditLocked(
        {
          phase: "preview",
          streaming: true,
          updatedAt: "2026-08-06T09:59:50.000Z",
        },
        now,
      ),
    ).toBe(true)
  })

  it("does not lock saved or failed previews", () => {
    expect(
      isArtifactLiveEditLocked(
        { phase: "saved", streaming: false, updatedAt: "2026-08-06T09:59:50.000Z" },
        now,
      ),
    ).toBe(false)
    expect(
      isArtifactLiveEditLocked(
        { phase: "failed", streaming: false, updatedAt: "2026-08-06T09:59:50.000Z" },
        now,
      ),
    ).toBe(false)
  })

  it("unlocks stale non-streaming previews so manual edits work", () => {
    expect(
      isArtifactLiveEditLocked(
        {
          phase: "preview",
          streaming: false,
          updatedAt: "2026-08-06T09:50:00.000Z",
        },
        now,
      ),
    ).toBe(false)
  })

  it("locks fresh started/media/preview briefly", () => {
    expect(
      isArtifactLiveEditLocked(
        {
          phase: "started",
          streaming: false,
          updatedAt: "2026-08-06T09:59:30.000Z",
        },
        now,
      ),
    ).toBe(true)
  })
})

import { describe, expect, it } from "vitest"
import { isHistoricalArtifactVersion } from "../app/lib/artifact-selection-url"

describe("isHistoricalArtifactVersion", () => {
  it("is live when no version is pinned", () => {
    expect(isHistoricalArtifactVersion(null, 7)).toBe(false)
    expect(isHistoricalArtifactVersion(undefined, 7)).toBe(false)
  })

  it("treats a pinned older snapshot as historical", () => {
    expect(isHistoricalArtifactVersion(6, 7)).toBe(true)
  })

  it("treats a pin of the current version as live", () => {
    expect(isHistoricalArtifactVersion(7, 7)).toBe(false)
  })

  it("keeps a pin historical until the live head is known", () => {
    expect(isHistoricalArtifactVersion(6, null)).toBe(true)
  })
})

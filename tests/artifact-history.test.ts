import { describe, expect, it } from "vitest"
import {
  artifactHistoryActorType,
  artifactHistoryUserFacingSummary,
  formatArtifactHistoryDescription,
} from "../app/lib/artifacts/artifact-history"
import { plainTextDiffStats } from "../app/lib/collaboration/plain-text-diff-stats"

describe("artifact history", () => {
  it("labels AI and human edits like task activity", () => {
    expect(artifactHistoryActorType("ai", null)).toBe("agent")
    expect(formatArtifactHistoryDescription({
      actorName: "Ana",
      changeSource: "manual",
    })).toEqual({ name: "Ana", remainder: " edited this", actorType: "user" })
    expect(formatArtifactHistoryDescription({
      changeSource: "ai",
    })).toEqual({ name: "AI", remainder: " edited this", actorType: "agent" })
    expect(formatArtifactHistoryDescription({
      actorName: "Ana",
      changeSource: "restore",
    })).toEqual({ name: "Ana", remainder: " restored a previous version", actorType: "system" })
  })

  it("hides worker jargon from the history row", () => {
    expect(artifactHistoryUserFacingSummary("Idle editorial checkpoint")).toBeNull()
    expect(artifactHistoryUserFacingSummary("AI proposal applied")).toBeNull()
    expect(artifactHistoryUserFacingSummary("Rewrote the intro")).toBe("Rewrote the intro")
  })

  it("counts inserted and deleted words", () => {
    expect(plainTextDiffStats("Keep this intro. Old ending.", "Keep this intro. New ending.")).toEqual({
      insert_count: 1,
      delete_count: 1,
    })
  })
})

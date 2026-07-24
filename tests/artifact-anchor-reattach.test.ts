import { describe, expect, it } from "vitest"
import { reattachArtifactCommentAnchor } from "../app/lib/artifacts/artifact-anchor-reattach"
import type { TaskArtifact } from "../app/lib/artifacts/artifact-types"

function artifact(partial: Partial<TaskArtifact> & Pick<TaskArtifact, "id">): TaskArtifact {
  return {
    task_id: 1,
    ai_thread_id: null,
    artifact_type: "document",
    artifact_role: null,
    title: "Brief",
    status: "draft",
    channel_id: null,
    language_id: null,
    content_text: "",
    content_json: { blocks: [] },
    asset_data: { assets: [] },
    source_artifact_id: null,
    source_version_number: null,
    derivation_type: null,
    current_version: 1,
    metadata: null,
    ...partial,
  }
}

describe("reattachArtifactCommentAnchor", () => {
  it("reattaches text via exact offsets on the same version", () => {
    const doc = artifact({
      id: "a1",
      current_version: 2,
      content_text: "Hello selected world",
      content_json: { blocks: [{ id: "requirements", type: "paragraph", text: "Hello selected world" }] },
    })
    const result = reattachArtifactCommentAnchor({
      artifact: doc,
      anchor: {
        artifactId: "a1",
        artifactVersionNumber: 2,
        anchorType: "text_range",
        anchorStart: 6,
        anchorEnd: 14,
        anchorQuote: "selected",
        anchorBlockKey: "requirements",
      },
    })
    expect(result.attached).toBe(true)
    expect(result.versionDrift).toBe(false)
    expect(result.resolved.start).toBe(6)
    expect(result.resolved.end).toBe(14)
  })

  it("falls back to quote + before/after when offsets drift", () => {
    const doc = artifact({
      id: "a1",
      current_version: 4,
      content_text: "prefix Hello selected world suffix",
    })
    const result = reattachArtifactCommentAnchor({
      artifact: doc,
      anchor: {
        artifactId: "a1",
        artifactVersionNumber: 2,
        anchorType: "text_range",
        anchorStart: 0,
        anchorEnd: 8,
        anchorQuote: "selected",
        anchorContextBefore: "Hello ",
        anchorContextAfter: " world",
      },
    })
    expect(result.attached).toBe(true)
    expect(result.versionDrift).toBe(true)
    expect(result.driftLabel).toContain("version 2")
    expect(result.resolved.start).toBe(13)
  })

  it("labels original version when text cannot be reattached", () => {
    const doc = artifact({
      id: "a1",
      current_version: 5,
      content_text: "completely different document",
    })
    const result = reattachArtifactCommentAnchor({
      artifact: doc,
      anchor: {
        artifactId: "a1",
        artifactVersionNumber: 3,
        anchorType: "text_range",
        anchorStart: 10,
        anchorEnd: 20,
        anchorQuote: "missing quote",
      },
    })
    expect(result.attached).toBe(false)
    expect(result.driftLabel).toContain("version 3")
  })

  it("prefers stable block id", () => {
    const doc = artifact({
      id: "a1",
      current_version: 3,
      content_json: {
        blocks: [
          { id: "intro", type: "paragraph", text: "Intro" },
          { id: "requirements", type: "heading", text: "Requirements", level: 2 },
        ],
      },
    })
    const result = reattachArtifactCommentAnchor({
      artifact: doc,
      anchor: {
        artifactId: "a1",
        artifactVersionNumber: 1,
        anchorType: "block",
        anchorBlockKey: "requirements",
      },
    })
    expect(result.attached).toBe(true)
    expect(result.resolved.blockId).toBe("requirements")
    expect(result.versionDrift).toBe(true)
  })
})

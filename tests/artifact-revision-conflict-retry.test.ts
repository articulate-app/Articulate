import { describe, expect, it } from "vitest"
import {
  createInMemoryArtifactStore,
  decideArtifactRevisionConflictRetry,
  persistSnapshotWithoutStaleOverwrite,
  persistSnapshotWithUnsafeVersionBumpRetry,
} from "../supabase/functions/_shared/artifact-revision-conflict"

describe("artifact revision conflict retry", () => {
  it("rejects retrying an unchanged snapshot after artifact_revision_conflict", () => {
    expect(
      decideArtifactRevisionConflictRetry({
        freshVersion: 4,
        hasRebuiltSnapshotFromLatest: false,
      }),
    ).toEqual({
      action: "reject",
      reason: "stale_snapshot_must_not_overwrite",
    })
  })

  it("does not overwrite a concurrent user edit after artifact_revision_conflict", async () => {
    const { store, save } = createInMemoryArtifactStore({
      version: 1,
      contentText: "Original draft the AI read.",
      contentJson: { blocks: [{ id: "body", type: "rich_text", html: "<p>Original draft the AI read.</p>" }] },
    })

    // Concurrent human (or other agent) write lands first.
    const concurrent = await save(1, {
      contentText: "User typed this while the AI was working.",
      contentJson: {
        blocks: [{ id: "body", type: "rich_text", html: "<p>User typed this while the AI was working.</p>" }],
      },
    })
    expect(concurrent.ok).toBe(true)
    expect(store.version).toBe(2)
    expect(store.contentText).toBe("User typed this while the AI was working.")

    const staleAiSnapshot = {
      contentText: "AI full rewrite based on version 1.",
      contentJson: {
        blocks: [{ id: "body", type: "rich_text", html: "<p>AI full rewrite based on version 1.</p>" }],
      },
    }

    let saveCalls = 0
    const result = await persistSnapshotWithoutStaleOverwrite({
      expectedVersion: 1,
      snapshot: staleAiSnapshot,
      save: async (expectedVersion, snapshot) => {
        saveCalls += 1
        return save(expectedVersion, snapshot)
      },
    })

    expect(result.ok).toBe(false)
    expect(result.code).toBe("artifact_revision_conflict")
    expect(saveCalls).toBe(1)
    expect(store.version).toBe(2)
    expect(store.contentText).toBe("User typed this while the AI was working.")
  })

  it("documents that the old version-bump retry would have lost the concurrent edit", async () => {
    const { store, save } = createInMemoryArtifactStore({
      version: 2,
      contentText: "User typed this while the AI was working.",
      contentJson: {
        blocks: [{ id: "body", type: "rich_text", html: "<p>User typed this while the AI was working.</p>" }],
      },
    })

    const staleAiSnapshot = {
      contentText: "AI full rewrite based on version 1.",
      contentJson: {
        blocks: [{ id: "body", type: "rich_text", html: "<p>AI full rewrite based on version 1.</p>" }],
      },
    }

    const unsafe = await persistSnapshotWithUnsafeVersionBumpRetry({
      expectedVersion: 1,
      snapshot: staleAiSnapshot,
      save,
      fetchCurrentVersion: async () => store.version,
    })

    expect(unsafe.ok).toBe(true)
    expect(store.contentText).toBe("AI full rewrite based on version 1.")
    expect(store.version).toBe(3)
  })
})

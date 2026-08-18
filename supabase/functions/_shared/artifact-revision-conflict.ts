/**
 * Revision-conflict policy for AI artifact snapshot saves.
 *
 * The unsafe pattern was: on `artifact_revision_conflict`, fetch only
 * `current_version` and retry the same snapshot. That last-write-wins
 * overwrite silently drops concurrent user or agent edits.
 *
 * A retry is allowed only when the snapshot was rebuilt from the latest
 * persisted document (patches re-applied against fresh content). Bumping
 * `expected_version` while keeping a stale snapshot is never allowed.
 */

export function isArtifactRevisionConflictValue(value: unknown): boolean {
  if (value == null) return false
  if (typeof value === "object") {
    const row = value as Record<string, unknown>
    if (row.code === "artifact_revision_conflict") return true
    if (
      isArtifactRevisionConflictValue(row.error)
      || isArtifactRevisionConflictValue(row.message)
      || isArtifactRevisionConflictValue(row.data)
    ) {
      return true
    }
    return /revision_conflict|artifact_revision_conflict/i.test(
      String(row.error ?? row.message ?? ""),
    )
  }
  return /revision_conflict|artifact_revision_conflict/i.test(String(value))
}

export type ArtifactRevisionConflictDecision =
  | { action: "reject"; reason: "stale_snapshot_must_not_overwrite" }
  | { action: "retry"; expectedVersion: number }

export function decideArtifactRevisionConflictRetry(args: {
  freshVersion: number | null | undefined
  hasRebuiltSnapshotFromLatest: boolean
}): ArtifactRevisionConflictDecision {
  if (
    args.hasRebuiltSnapshotFromLatest === true
    && args.freshVersion != null
    && Number.isInteger(args.freshVersion)
  ) {
    return { action: "retry", expectedVersion: args.freshVersion }
  }
  return { action: "reject", reason: "stale_snapshot_must_not_overwrite" }
}

export type ArtifactSnapshotSaveResult = {
  ok: boolean
  code?: string
  error?: unknown
  message?: string
  current_version?: number | null
  [key: string]: unknown
}

export type InMemoryArtifactStore = {
  version: number
  contentText: string
  contentJson: unknown
}

/**
 * Persist a snapshot once. On revision conflict, do not bump
 * `expected_version` and rewrite the same snapshot.
 */
export async function persistSnapshotWithoutStaleOverwrite<TSnapshot>(args: {
  expectedVersion: number
  snapshot: TSnapshot
  save: (expectedVersion: number, snapshot: TSnapshot) => Promise<ArtifactSnapshotSaveResult>
  hasRebuiltSnapshotFromLatest?: boolean
}): Promise<ArtifactSnapshotSaveResult> {
  const result = await args.save(args.expectedVersion, args.snapshot)
  if (!isArtifactRevisionConflictValue(result)) return result

  const decision = decideArtifactRevisionConflictRetry({
    freshVersion:
      typeof result.current_version === "number" ? result.current_version : null,
    hasRebuiltSnapshotFromLatest: args.hasRebuiltSnapshotFromLatest === true,
  })
  if (decision.action === "reject") return result
  return args.save(decision.expectedVersion, args.snapshot)
}

/**
 * In-memory optimistic save used by the regression test. Mirrors
 * `ai_save_workspace_artifact_v2`: version must match or the write is refused.
 */
export function createInMemoryArtifactStore(initial: InMemoryArtifactStore): {
  store: InMemoryArtifactStore
  save: (
    expectedVersion: number,
    snapshot: { contentText: string; contentJson?: unknown },
  ) => Promise<ArtifactSnapshotSaveResult>
} {
  const store: InMemoryArtifactStore = {
    version: initial.version,
    contentText: initial.contentText,
    contentJson: initial.contentJson,
  }

  return {
    store,
    save: async (expectedVersion, snapshot) => {
      if (expectedVersion !== store.version) {
        return {
          ok: false,
          code: "artifact_revision_conflict",
          current_version: store.version,
          expected_version: expectedVersion,
          message: "artifact_revision_conflict",
        }
      }
      store.contentText = snapshot.contentText
      if (snapshot.contentJson !== undefined) store.contentJson = snapshot.contentJson
      store.version += 1
      return { ok: true, current_version: store.version }
    },
  }
}

/**
 * Historical last-write-wins retry. Kept only so the regression test can
 * prove why that path loses concurrent edits. Do not call from workers.
 */
export async function persistSnapshotWithUnsafeVersionBumpRetry<TSnapshot>(args: {
  expectedVersion: number
  snapshot: TSnapshot
  save: (expectedVersion: number, snapshot: TSnapshot) => Promise<ArtifactSnapshotSaveResult>
  fetchCurrentVersion: () => Promise<number | null>
}): Promise<ArtifactSnapshotSaveResult> {
  let result = await args.save(args.expectedVersion, args.snapshot)
  if (!isArtifactRevisionConflictValue(result)) return result
  const freshVersion = await args.fetchCurrentVersion()
  if (freshVersion == null || !Number.isInteger(freshVersion)) return result
  result = await args.save(freshVersion, args.snapshot)
  return result
}

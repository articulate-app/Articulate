import type * as Y from "yjs"

const INDEXEDDB_SYNC_TIMEOUT_MS = 400

export type CollabLocalCache = {
  destroy: () => void
  whenReady: Promise<void>
}

function waitForIndexedDbSynced(
  persistence: { synced?: boolean; once: (event: string, listener: () => void) => void },
  timeoutMs: number,
): Promise<void> {
  if (persistence.synced) return Promise.resolve()
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs)
    persistence.once("synced", () => {
      clearTimeout(timer)
      resolve()
    })
  })
}

/**
 * Short-offline cache. Postgres remains the durable source of truth.
 */
export async function bindArtifactYdocLocalCache(
  document: Y.Doc,
  artifactId: string,
): Promise<CollabLocalCache | null> {
  if (typeof indexedDB === "undefined") return null
  try {
    const { IndexeddbPersistence } = await import("y-indexeddb")
    const persistence = new IndexeddbPersistence(`artifact-ydoc:${artifactId}`, document)
    const whenReady = waitForIndexedDbSynced(persistence, INDEXEDDB_SYNC_TIMEOUT_MS)
    return {
      destroy: () => {
        void persistence.destroy()
      },
      whenReady,
    }
  } catch {
    return null
  }
}

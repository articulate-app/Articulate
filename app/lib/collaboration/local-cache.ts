import type * as Y from "yjs"

export type CollabLocalCache = {
  destroy: () => void
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
    return {
      destroy: () => {
        void persistence.destroy()
      },
    }
  } catch {
    return null
  }
}

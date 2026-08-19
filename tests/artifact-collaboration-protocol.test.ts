import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import * as Y from "yjs"
import { bytesEqual, decodeBroadcastPayload, encodeBroadcastUpdate } from "../app/lib/collaboration/binary"
import {
  canAutosaveArtifactSnapshot,
  canReplaceCollaborativeEditorContent,
  shouldLockArtifactDuringAiGeneration,
} from "../app/lib/collaboration/editor-sync"
import {
  createMemoryBroadcastBus,
  createMemoryCollabStore,
  createMemoryCollabTransport,
} from "../app/lib/collaboration/memory-store"
import {
  acquireArtifactCollabSession,
  peekArtifactCollabSession,
  releaseArtifactCollabSession,
  resetArtifactCollabRegistryForTests,
} from "../app/lib/collaboration/provider-registry"
import { createArtifactCollabProvider } from "../app/lib/collaboration/supabase-provider"
import { applyPersistedUpdate, COLLAB_REMOTE_ORIGIN } from "../app/lib/collaboration/sync-protocol"

async function waitFor(predicate: () => boolean, timeoutMs = 800): Promise<void> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return
    await new Promise((resolveWait) => setTimeout(resolveWait, 10))
  }
  throw new Error("timed out waiting for collaboration condition")
}

function linkedPair(options?: { readOnlyB?: boolean; delayLoadA?: () => Promise<void> }) {
  const store = createMemoryCollabStore()
  const bus = createMemoryBroadcastBus()
  const docA = new Y.Doc()
  const docB = new Y.Doc()
  const a = createArtifactCollabProvider({
    document: docA,
    clientId: "client-a",
    debounceMs: 0,
    transport: createMemoryCollabTransport({
      store,
      bus,
      delayLoad: options?.delayLoadA,
    }),
  })
  const b = createArtifactCollabProvider({
    document: docB,
    clientId: "client-b",
    debounceMs: 0,
    readOnly: options?.readOnlyB,
    transport: createMemoryCollabTransport({
      store,
      bus,
      readOnly: options?.readOnlyB,
    }),
  })
  return { store, bus, docA, docB, a, b }
}

describe("artifact collaboration protocol", () => {
  afterEach(() => {
    resetArtifactCollabRegistryForTests()
  })

  it("1-2. two clients write at once, including the same paragraph", async () => {
    const { docA, docB, a, b } = linkedPair()
    await a.connect()
    await b.connect()

    docA.getText("p1").insert(0, "alpha")
    docB.getText("p2").insert(0, "bravo")
    await Promise.all([a.flush(), b.flush()])
    await waitFor(() => docA.getText("p2").toString() === "bravo" && docB.getText("p1").toString() === "alpha")

    docA.getText("same").insert(0, "word")
    await a.flush()
    await waitFor(() => docB.getText("same").toString() === "word")
    docA.getText("same").insert(0, "AA")
    docB.getText("same").insert(4, "BB")
    await Promise.all([a.flush(), b.flush()])
    await waitFor(() => docA.getText("same").toString() === docB.getText("same").toString())
    expect(docA.getText("same").toString()).toContain("AA")
    expect(docA.getText("same").toString()).toContain("BB")
    a.destroy()
    b.destroy()
  })

  it("3-4. two views share one Y.Doc and unmounting one keeps the other", () => {
    const artifactId = "2f1c6b7a-3c4d-4e5f-a678-90abcedf1234"
    const first = acquireArtifactCollabSession({ artifactId })
    const second = acquireArtifactCollabSession({ artifactId })
    expect(second.document).toBe(first.document)
    first.document.getText("body").insert(0, "shared-view")
    expect(second.document.getText("body").toString()).toBe("shared-view")
    expect(releaseArtifactCollabSession(artifactId)).toBe(false)
    expect(peekArtifactCollabSession(artifactId)?.document.getText("body").toString()).toBe("shared-view")
    expect(releaseArtifactCollabSession(artifactId)).toBe(true)
  })

  it("5. a dropped Broadcast update is recovered from Postgres", async () => {
    const { store, bus, docA, docB, a, b } = linkedPair()
    await a.connect()
    await b.connect()
    bus.dropNext = 1
    docA.getText("body").insert(0, "durable")
    await a.flush()
    expect(docB.getText("body").toString()).toBe("")
    expect(store.updates).toHaveLength(1)
    b.disconnect()
    await b.connect()
    expect(docB.getText("body").toString()).toBe("durable")
    a.destroy()
    b.destroy()
  })

  it("6. reconnect fills a sequence gap", async () => {
    const { docA, docB, a, b } = linkedPair()
    await a.connect()
    await b.connect()
    docA.getText("body").insert(0, "one")
    await a.flush()
    await waitFor(() => docB.getText("body").toString() === "one")
    const seqAfterFirst = a.lastSeq
    b.disconnect()
    docA.getText("body").insert(3, " two")
    docA.getText("body").insert(7, " three")
    await a.flush()
    expect(a.lastSeq).toBeGreaterThan(seqAfterFirst)
    await b.connect()
    expect(docB.getText("body").toString()).toBe("one two three")
    a.destroy()
    b.destroy()
  })

  it("7. retries the same idempotency key without a second sequence", () => {
    const store = createMemoryCollabStore()
    const update = new Uint8Array([1, 2, 3, 4])
    const first = store.persist(update, "client-a:same")
    const second = store.persist(update, "client-a:same")
    expect(second).toEqual({ ...first, duplicate: true })
    expect(store.updates).toHaveLength(1)
  })

  it("8. applies updates received during the initial load", async () => {
    const store = createMemoryCollabStore()
    const bus = createMemoryBroadcastBus()
    const docA = new Y.Doc()
    const docB = new Y.Doc()
    let releaseLoad: (() => void) | undefined
    const loadGate = new Promise<void>((resolveLoad) => {
      releaseLoad = resolveLoad
    })
    const a = createArtifactCollabProvider({
      document: docA,
      clientId: "client-a",
      debounceMs: 0,
      transport: createMemoryCollabTransport({ store, bus, delayLoad: () => loadGate }),
    })
    const b = createArtifactCollabProvider({
      document: docB,
      clientId: "client-b",
      debounceMs: 0,
      transport: createMemoryCollabTransport({ store, bus }),
    })
    await b.connect()
    const connecting = a.connect()
    docB.getText("body").insert(0, "during-load")
    await b.flush()
    releaseLoad?.()
    await connecting
    expect(docA.getText("body").toString()).toBe("during-load")
    a.destroy()
    b.destroy()
  })

  it("9. replays a short offline edit after reconnect", async () => {
    const store = createMemoryCollabStore()
    const bus = createMemoryBroadcastBus()
    const docA = new Y.Doc()
    const docB = new Y.Doc()
    let offline = false
    const transportA = createMemoryCollabTransport({ store, bus })
    const a = createArtifactCollabProvider({
      document: docA,
      clientId: "client-a",
      debounceMs: 0,
      transport: {
        ...transportA,
        persistUpdate: async (update, key) => {
          if (offline) throw new Error("offline")
          return transportA.persistUpdate(update, key)
        },
      },
    })
    const b = createArtifactCollabProvider({
      document: docB,
      clientId: "client-b",
      debounceMs: 0,
      transport: createMemoryCollabTransport({ store, bus }),
    })
    await a.connect()
    await b.connect()
    offline = true
    docA.getText("body").insert(0, "queued")
    await a.flush().catch(() => undefined)
    expect(a.status).toBe("offline")
    expect(docB.getText("body").toString()).toBe("")
    offline = false
    await a.flush()
    await waitFor(() => docB.getText("body").toString() === "queued")
    expect(a.status).toBe("synced")
    a.destroy()
    b.destroy()
  })

  it("10. round-trips a binary Broadcast payload without corruption", () => {
    const bytes = new Uint8Array([0, 15, 128, 200, 255, 1, 7])
    const encoded = encodeBroadcastUpdate(bytes)
    const objectPayload = { key: "k1", seq: 3, update: encoded }
    const decoded = decodeBroadcastPayload(objectPayload)
    expect(decoded).not.toBeNull()
    expect(bytesEqual(decoded!, bytes)).toBe(true)
    expect(bytesEqual(decodeBroadcastPayload(bytes)!, bytes)).toBe(true)
    expect(bytesEqual(decodeBroadcastPayload(encoded.buffer)!, bytes)).toBe(true)
  })

  it("12. a read-only client cannot persist or broadcast edits", async () => {
    const { store, docB, a, b } = linkedPair({ readOnlyB: true })
    await a.connect()
    await b.connect()
    docB.getText("body").insert(0, "should-not-persist")
    await b.flush()
    expect(store.updates).toHaveLength(0)
    expect(a.document.getText("body").toString()).toBe("")
    a.destroy()
    b.destroy()
  })

  it("13-14. collaborative mode never replaces content or autosaves snapshots", () => {
    expect(canReplaceCollaborativeEditorContent(true)).toBe(false)
    expect(canReplaceCollaborativeEditorContent(false)).toBe(true)
    expect(canAutosaveArtifactSnapshot(true)).toBe(false)
    expect(canAutosaveArtifactSnapshot(false)).toBe(true)
    expect(shouldLockArtifactDuringAiGeneration(true)).toBe(false)
    const editorSource = readFileSync(
      resolve("app/components/editor/RichTextEditor.tsx"),
      "utf8",
    )
    expect(editorSource).toMatch(/canReplaceCollaborativeEditorContent/)
    expect(editorSource).toMatch(/editor\.commands\.setContent/)
    const hookSource = readFileSync(
      resolve("app/hooks/use-artifact-collaboration.ts"),
      "utf8",
    )
    expect(hookSource).toMatch(/hasEditorContent/)
    expect(hookSource).toMatch(/shouldHydrateEmptyYdocFromArtifact/)
    expect(hookSource).not.toMatch(/\[artifact\?\.content_json, artifact\?\.content_text, artifactId/)
  })

  it("15. Yjs converges after updates arrive in different orders", () => {
    const authorA = new Y.Doc()
    const authorB = new Y.Doc()
    authorA.getText("body").insert(0, "base")
    const bootstrap = Y.encodeStateAsUpdate(authorA)
    Y.applyUpdate(authorB, bootstrap)
    authorA.getText("body").insert(4, "-A")
    authorB.getText("body").insert(0, "B-")
    const updateA = Y.encodeStateAsUpdate(authorA, Y.encodeStateVector(authorB))
    const updateB = Y.encodeStateAsUpdate(authorB, Y.encodeStateVector(authorA))

    const left = new Y.Doc()
    const right = new Y.Doc()
    Y.applyUpdate(left, bootstrap)
    Y.applyUpdate(right, bootstrap)
    Y.applyUpdate(left, updateB, COLLAB_REMOTE_ORIGIN)
    Y.applyUpdate(left, updateA, COLLAB_REMOTE_ORIGIN)
    Y.applyUpdate(right, updateA, COLLAB_REMOTE_ORIGIN)
    Y.applyUpdate(right, updateB, COLLAB_REMOTE_ORIGIN)
    expect(left.getText("body").toString()).toBe(right.getText("body").toString())
    expect(left.getText("body").toString()).toContain("A")
    expect(left.getText("body").toString()).toContain("B")
  })

  it("16. compaction keeps updates that arrived after the closed sequence", () => {
    const store = createMemoryCollabStore()
    const first = new Y.Doc()
    first.getText("body").insert(0, "one")
    store.persist(Y.encodeStateAsUpdate(first), "k1")
    first.getText("body").insert(3, " two")
    store.persist(Y.encodeStateAsUpdate(first), "k2")
    first.getText("body").insert(7, " three")
    store.persist(Y.encodeStateAsUpdate(first), "k3")
    const compacted = store.compact(2)
    expect(compacted.deleted).toBe(2)
    expect(compacted.kept).toBe(1)
    expect(store.updates[0]?.idempotencyKey).toBe("k3")
    expect(store.lastIncludedSeq).toBe(2)
  })

  it("17. an AI update in another section does not overwrite the user", async () => {
    const { docA, docB, a, b } = linkedPair()
    await a.connect()
    await b.connect()
    docA.getText("intro").insert(0, "user intro")
    docB.getText("conclusion").insert(0, "ai conclusion")
    await Promise.all([a.flush(), b.flush()])
    await waitFor(() => (
      docA.getText("conclusion").toString() === "ai conclusion"
      && docB.getText("intro").toString() === "user intro"
    ))
    a.destroy()
    b.destroy()
  })

  it("19. Task Details and Artifact Pane see the same document instance", () => {
    const artifactId = "2f1c6b7a-3c4d-4e5f-a678-90abcedf1234"
    const details = acquireArtifactCollabSession({ artifactId })
    const pane = acquireArtifactCollabSession({ artifactId })
    details.document.getText("body").insert(0, "same-content")
    expect(pane.document).toBe(details.document)
    expect(pane.document.getText("body").toString()).toBe("same-content")
  })

  it("dedupes a buffered remote update by idempotency key", () => {
    const document = new Y.Doc()
    const applied = new Set<string>()
    const update = new Uint8Array(Y.encodeStateAsUpdate(new Y.Doc()))
    expect(applyPersistedUpdate(document, update, applied, "dup")).toBe(true)
    expect(applyPersistedUpdate(document, update, applied, "dup")).toBe(false)
  })
})

import * as Y from "yjs"
import { encodeBroadcastUpdate } from "./binary"
import {
  applyBufferedBroadcasts,
  applyCatchUpDocument,
  applyLoadedDocument,
  applyPersistedUpdate,
  createIdempotencyKey,
  shouldIgnoreLocalUpdate,
  type CollabOutboxItem,
  type LoadDocumentResult,
  type PersistUpdateResult,
  type SyncStatus,
} from "./sync-protocol"

export type ArtifactCollabTransport = {
  persistUpdate: (update: Uint8Array, idempotencyKey: string, baseSeq?: number) => Promise<PersistUpdateResult>
  loadDocument: (afterSeq: number) => Promise<LoadDocumentResult>
  subscribe: (
    onEvent: (payload: { key: string; update: Uint8Array; seq?: number }) => void,
  ) => Promise<() => void> | (() => void)
  broadcast?: (payload: { key: string; update: Uint8Array; seq: number }) => Promise<void> | void
}

export type ArtifactCollabProvider = {
  document: Y.Doc
  status: SyncStatus
  lastSeq: number
  readOnly: boolean
  connect: () => Promise<void>
  disconnect: () => void
  destroy: () => void
  flush: () => Promise<void>
  catchUp: () => Promise<void>
}

const LOCAL_DEBOUNCE_MS = 40
const CATCH_UP_FAST_MS = 2500
const CATCH_UP_IDLE_MS = 8000
const CATCH_UP_REST_MS = 20000

export function createArtifactCollabProvider(args: {
  document: Y.Doc
  clientId: string
  transport: ArtifactCollabTransport
  readOnly?: boolean
  debounceMs?: number
  onStatus?: (status: SyncStatus) => void
}): ArtifactCollabProvider {
  const appliedKeys = new Set<string>()
  const outbox: CollabOutboxItem[] = []
  const buffer: Array<{ key: string; update: Uint8Array; seq?: number }> = []
  let loaded = false
  let lastSeq = 0
  let status: SyncStatus = "connecting"
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let catchUpTimer: ReturnType<typeof setTimeout> | null = null
  let idleCatchUps = 0
  let unsubscribe: (() => void) | null = null
  let destroyed = false
  let flushing = false
  let catchingUp = false
  let visibilityHandler: (() => void) | null = null

  const setStatus = (next: SyncStatus) => {
    status = next
    args.onStatus?.(next)
  }

  const enqueueLocal = (update: Uint8Array) => {
    if (args.readOnly || destroyed) return
    outbox.push({
      idempotencyKey: createIdempotencyKey(args.clientId),
      update: new Uint8Array(update),
      attempts: 0,
    })
    setStatus("syncing")
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      void flush()
    }, args.debounceMs ?? LOCAL_DEBOUNCE_MS)
  }

  const handleIncoming = (payload: { key: string; update: Uint8Array; seq?: number }) => {
    if (!loaded) {
      buffer.push(payload)
      return
    }
    idleCatchUps = 0
    applyPersistedUpdate(args.document, payload.update, appliedKeys, payload.key)
    if (typeof payload.seq === "number" && payload.seq > lastSeq) lastSeq = payload.seq
  }

  const stopCatchUp = () => {
    if (catchUpTimer) {
      clearTimeout(catchUpTimer)
      catchUpTimer = null
    }
    if (visibilityHandler && typeof globalThis.document !== "undefined") {
      globalThis.document.removeEventListener("visibilitychange", visibilityHandler)
      visibilityHandler = null
    }
  }

  const catchUpDelay = () => {
    if (idleCatchUps <= 0) return CATCH_UP_FAST_MS
    if (idleCatchUps === 1) return CATCH_UP_IDLE_MS
    return CATCH_UP_REST_MS
  }

  const scheduleCatchUp = (delay = catchUpDelay()) => {
    if (catchUpTimer) clearTimeout(catchUpTimer)
    catchUpTimer = setTimeout(() => {
      void catchUp()
    }, delay)
  }

  const catchUp = async () => {
    if (!loaded || destroyed || catchingUp) return
    catchingUp = true
    const previousSeq = lastSeq
    try {
      const loadedDoc = await args.transport.loadDocument(lastSeq)
      lastSeq = applyCatchUpDocument(args.document, loadedDoc, appliedKeys, lastSeq)
      idleCatchUps = lastSeq === previousSeq ? idleCatchUps + 1 : 0
    } catch {
      // The next interval retries. Broadcast remains the fast path.
    } finally {
      catchingUp = false
      if (loaded && !destroyed) scheduleCatchUp()
    }
  }

  const startCatchUp = () => {
    stopCatchUp()
    idleCatchUps = 0
    scheduleCatchUp(CATCH_UP_FAST_MS)
    if (typeof globalThis.document !== "undefined") {
      visibilityHandler = () => {
        if (globalThis.document.visibilityState === "visible") {
          idleCatchUps = 0
          void catchUp()
        }
      }
      globalThis.document.addEventListener("visibilitychange", visibilityHandler)
    }
  }

  const flush = async () => {
    if (flushing || destroyed || args.readOnly) return
    flushing = true
    setStatus("syncing")
    try {
      while (outbox.length > 0 && !destroyed) {
        const item = outbox[0]
        item.attempts += 1
        const persisted = await args.transport.persistUpdate(item.update, item.idempotencyKey, lastSeq)
        appliedKeys.add(item.idempotencyKey)
        if (persisted.seq > lastSeq) lastSeq = persisted.seq
        try {
          await args.transport.broadcast?.({
            key: item.idempotencyKey,
            update: encodeBroadcastUpdate(item.update),
            seq: persisted.seq,
          })
        } catch {
          // Broadcast is best-effort; durable persist already succeeded.
        }
        outbox.shift()
      }
      setStatus(outbox.length === 0 ? "synced" : "syncing")
    } catch {
      setStatus("offline")
      const delay = Math.min(8000, 250 * 2 ** Math.max(0, (outbox[0]?.attempts ?? 1) - 1))
      debounceTimer = setTimeout(() => {
        void flush()
      }, delay)
    } finally {
      flushing = false
    }
  }

  const onDocUpdate = (update: Uint8Array, origin: unknown) => {
    if (shouldIgnoreLocalUpdate(origin)) return
    enqueueLocal(update)
  }

  args.document.on("update", onDocUpdate)

  return {
    document: args.document,
    get status() {
      return status
    },
    get lastSeq() {
      return lastSeq
    },
    get readOnly() {
      return args.readOnly === true
    },
    async connect() {
      if (destroyed) return
      try {
        setStatus("connecting")
        setStatus("syncing")
        const loadedDoc = await args.transport.loadDocument(lastSeq)
        lastSeq = applyLoadedDocument(args.document, loadedDoc, appliedKeys)
        loaded = true
        try {
          unsubscribe = await args.transport.subscribe(handleIncoming)
        } catch {
          unsubscribe = null
        }
        lastSeq = applyBufferedBroadcasts(args.document, buffer.splice(0), appliedKeys, lastSeq)
        startCatchUp()
        await flush()
        if (!destroyed && outbox.length === 0) setStatus("synced")
      } catch {
        setStatus("error")
        throw new Error("collab_connect_failed")
      }
    },
    disconnect() {
      stopCatchUp()
      unsubscribe?.()
      unsubscribe = null
      loaded = false
      setStatus("offline")
    },
    destroy() {
      destroyed = true
      if (debounceTimer) clearTimeout(debounceTimer)
      stopCatchUp()
      args.document.off("update", onDocUpdate)
      unsubscribe?.()
      unsubscribe = null
    },
    flush,
    catchUp,
  }
}

import {
  type LoadDocumentResult,
  type PersistUpdateResult,
  type PersistedCollabUpdate,
  compactUpdatesIntoSnapshot,
} from "./sync-protocol"

export type MemoryCollabStore = {
  lastIncludedSeq: number
  snapshot: Uint8Array | null
  updates: PersistedCollabUpdate[]
  persist: (
    update: Uint8Array,
    idempotencyKey: string,
    options?: { readOnly?: boolean },
  ) => PersistUpdateResult
  load: (afterSeq?: number) => LoadDocumentResult
  compact: (closedSeq: number) => { deleted: number; kept: number }
}

export function createMemoryCollabStore(): MemoryCollabStore {
  const state: {
    lastIncludedSeq: number
    snapshot: Uint8Array | null
    updates: PersistedCollabUpdate[]
  } = {
    lastIncludedSeq: 0,
    snapshot: null,
    updates: [],
  }

  return {
    get lastIncludedSeq() {
      return state.lastIncludedSeq
    },
    get snapshot() {
      return state.snapshot
    },
    get updates() {
      return state.updates
    },
    persist(update, idempotencyKey, options) {
      if (options?.readOnly) {
        throw new Error("artifact_forbidden")
      }
      const existing = state.updates.find((row) => row.idempotencyKey === idempotencyKey)
      if (existing) {
        return { id: existing.id, seq: existing.seq, duplicate: true }
      }
      const seq = (state.updates.at(-1)?.seq ?? state.lastIncludedSeq) + 1
      const row: PersistedCollabUpdate = {
        id: `upd-${seq}`,
        seq,
        update: new Uint8Array(update),
        idempotencyKey,
      }
      state.updates.push(row)
      return { id: row.id, seq, duplicate: false }
    },
    load(afterSeq = 0) {
      const floor = Math.max(afterSeq, state.lastIncludedSeq)
      return {
        snapshot: state.snapshot,
        lastIncludedSeq: state.lastIncludedSeq,
        updates: state.updates.filter((row) => row.seq > floor),
      }
    },
    compact(closedSeq) {
      const compacted = compactUpdatesIntoSnapshot({
        snapshot: state.snapshot,
        updates: state.updates,
        closedSeq,
      })
      const deleted = state.updates.filter((row) => row.seq <= closedSeq).length
      state.snapshot = compacted.snapshot
      state.lastIncludedSeq = Math.max(state.lastIncludedSeq, closedSeq)
      state.updates = compacted.kept
      return { deleted, kept: state.updates.length }
    },
  }
}

export type MemoryBroadcastBus = {
  subscribe: (listener: (payload: { key: string; update: Uint8Array; seq?: number }) => void) => () => void
  publish: (payload: { key: string; update: Uint8Array; seq?: number }) => void
  dropNext: number
}

export function createMemoryCollabTransport(args: {
  store: MemoryCollabStore
  bus: MemoryBroadcastBus
  readOnly?: boolean
  delayLoad?: () => Promise<void>
}): import("./supabase-provider").ArtifactCollabTransport {
  return {
    persistUpdate: (update, idempotencyKey) =>
      Promise.resolve(args.store.persist(update, idempotencyKey, { readOnly: args.readOnly })),
    loadDocument: async (afterSeq) => {
      await args.delayLoad?.()
      return args.store.load(afterSeq)
    },
    subscribe: (onEvent) => args.bus.subscribe(onEvent),
    broadcast: (payload) => {
      args.bus.publish(payload)
    },
  }
}

export function createMemoryBroadcastBus(): MemoryBroadcastBus {
  const listeners = new Set<(payload: { key: string; update: Uint8Array; seq?: number }) => void>()
  return {
    dropNext: 0,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    publish(payload) {
      if (this.dropNext > 0) {
        this.dropNext -= 1
        return
      }
      for (const listener of listeners) listener(payload)
    },
  }
}

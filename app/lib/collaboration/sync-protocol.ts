import * as Y from "yjs"
import { bytesToBase64 } from "./binary"

export const COLLAB_REMOTE_ORIGIN = "remote"
export const COLLAB_LOAD_ORIGIN = "load"

export type SyncStatus = "connecting" | "syncing" | "synced" | "offline" | "error"

export type PersistedCollabUpdate = {
  id: string
  seq: number
  update: Uint8Array
  idempotencyKey: string
}

export type CollabOutboxItem = {
  idempotencyKey: string
  update: Uint8Array
  attempts: number
}

export type PersistUpdateResult = {
  id: string
  seq: number
  duplicate: boolean
}

export type LoadDocumentResult = {
  snapshot?: Uint8Array | null
  lastIncludedSeq: number
  updates: PersistedCollabUpdate[]
}

export function createIdempotencyKey(clientId: string): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `${clientId}:${rand}`
}

export function shouldIgnoreLocalUpdate(origin: unknown): boolean {
  return origin === COLLAB_REMOTE_ORIGIN || origin === COLLAB_LOAD_ORIGIN
}

export function applyPersistedUpdate(
  document: Y.Doc,
  update: Uint8Array,
  appliedKeys: Set<string>,
  key: string,
): boolean {
  if (appliedKeys.has(key)) return false
  Y.applyUpdate(document, update, COLLAB_REMOTE_ORIGIN)
  appliedKeys.add(key)
  return true
}

export function applyLoadedDocument(
  document: Y.Doc,
  loaded: LoadDocumentResult,
  appliedKeys: Set<string>,
): number {
  if (loaded.snapshot && loaded.snapshot.byteLength > 0) {
    Y.applyUpdate(document, loaded.snapshot, COLLAB_LOAD_ORIGIN)
  }
  let lastSeq = loaded.lastIncludedSeq
  for (const update of loaded.updates) {
    applyPersistedUpdate(document, update.update, appliedKeys, update.idempotencyKey)
    if (update.seq > lastSeq) lastSeq = update.seq
  }
  return lastSeq
}

export function applyBufferedBroadcasts(
  document: Y.Doc,
  buffered: Array<{ key: string; update: Uint8Array; seq?: number }>,
  appliedKeys: Set<string>,
  lastSeq: number,
): number {
  let nextSeq = lastSeq
  for (const item of buffered) {
    applyPersistedUpdate(document, item.update, appliedKeys, item.key)
    if (typeof item.seq === "number" && item.seq > nextSeq) nextSeq = item.seq
  }
  return nextSeq
}

export function compactUpdatesIntoSnapshot(args: {
  snapshot: Uint8Array | null
  updates: PersistedCollabUpdate[]
  closedSeq: number
}): { snapshot: Uint8Array; kept: PersistedCollabUpdate[] } {
  const doc = new Y.Doc()
  if (args.snapshot && args.snapshot.byteLength > 0) {
    Y.applyUpdate(doc, args.snapshot, COLLAB_LOAD_ORIGIN)
  }
  const kept: PersistedCollabUpdate[] = []
  for (const update of args.updates) {
    if (update.seq <= args.closedSeq) {
      Y.applyUpdate(doc, update.update, COLLAB_LOAD_ORIGIN)
    } else {
      kept.push(update)
    }
  }
  return {
    snapshot: Y.encodeStateAsUpdate(doc),
    kept,
  }
}

export function encodeUpdateForRpc(update: Uint8Array): string {
  return bytesToBase64(update)
}

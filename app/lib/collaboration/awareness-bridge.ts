import * as Y from "yjs"
import { Awareness } from "y-protocols/awareness"
import type { ArtifactCollabPresence } from "./presence"

export type CollaborationCursorUser = {
  name: string
  color: string
}

function hashClientId(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0
  }
  return hash === 0 ? 1 : hash
}

const awarenessByDocument = new WeakMap<Y.Doc, Awareness>()

export function createArtifactAwareness(document: Y.Doc): Awareness {
  return new Awareness(document)
}

export function getOrCreateArtifactAwareness(document: Y.Doc): Awareness {
  const existing = awarenessByDocument.get(document)
  if (existing) return existing
  const awareness = new Awareness(document)
  awarenessByDocument.set(document, awareness)
  return awareness
}

export function setLocalAwarenessUser(
  awareness: Awareness,
  user: CollaborationCursorUser,
): void {
  awareness.setLocalStateField("user", user)
}

export function applyRemotePresenceToAwareness(
  awareness: Awareness,
  peers: ArtifactCollabPresence[],
): void {
  const keep = new Set<number>()
  for (const peer of peers) {
    const clientId = Number.isInteger(peer.userId) && peer.userId > 0
      ? hashClientId(peer.clientId || String(peer.userId))
      : hashClientId(peer.clientId || peer.name)
    keep.add(clientId)
    const cursor = peer.cursor ?? peer.selection
    awareness.states.set(clientId, {
      user: {
        name: peer.name,
        color: /^#[0-9a-fA-F]{6}$/.test(peer.color) ? peer.color : "#2563eb",
      },
      ...(cursor
        ? {
            cursor: {
              anchor: cursor.from,
              head: cursor.to,
            },
          }
        : {}),
    })
    awareness.meta.set(clientId, {
      clock: Date.now(),
      lastUpdated: Date.now(),
    })
  }
  const stale: number[] = []
  awareness.states.forEach((_state, clientId) => {
    if (clientId === awareness.clientID) return
    if (!keep.has(clientId)) stale.push(clientId)
  })
  for (const clientId of stale) {
    awareness.states.delete(clientId)
    awareness.meta.delete(clientId)
  }
  awareness.emit("update", [{ added: [], updated: [...keep], removed: stale }, "presence"])
}

export function collaborationCursorProvider(awareness: Awareness): { awareness: Awareness } {
  return { awareness }
}

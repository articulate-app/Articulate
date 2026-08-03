"use client"

import { create } from "zustand"
import type { AiContextTag, AiMessageSegment } from "./composer-inline-editor"

export type QueuedAiChatMessage = {
  id: string
  threadId: string
  messageText: string
  messageTags: AiContextTag[]
  messageSegments: AiMessageSegment[]
  /** In-memory only — File cannot be persisted to localStorage. */
  messageFiles?: File[]
  createdAt: number
}

type PersistedQueuedAiChatMessage = Omit<QueuedAiChatMessage, "messageFiles">

type AiChatMessageQueueState = {
  byThread: Record<string, QueuedAiChatMessage[]>
  enqueue: (item: Omit<QueuedAiChatMessage, "id" | "createdAt"> & { id?: string }) => string
  remove: (threadId: string, id: string) => void
  clearThread: (threadId: string) => void
  shiftNext: (threadId: string) => QueuedAiChatMessage | null
}

const STORAGE_KEY = "ai-chat-message-queue-v1"

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined"
}

function loadPersisted(): Record<string, QueuedAiChatMessage[]> {
  if (!canUseStorage()) return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, PersistedQueuedAiChatMessage[]>
    if (!parsed || typeof parsed !== "object") return {}
    const next: Record<string, QueuedAiChatMessage[]> = {}
    for (const [threadId, items] of Object.entries(parsed)) {
      if (!Array.isArray(items)) continue
      next[threadId] = items
        .filter((item) => item && typeof item.messageText === "string")
        .map((item) => ({
          id: String(item.id),
          threadId: String(item.threadId || threadId),
          messageText: String(item.messageText ?? ""),
          messageTags: Array.isArray(item.messageTags) ? item.messageTags : [],
          messageSegments: Array.isArray(item.messageSegments) ? item.messageSegments : [],
          createdAt: Number(item.createdAt) || Date.now(),
        }))
        .filter((item) => item.messageText.trim().length > 0)
    }
    return next
  } catch {
    return {}
  }
}

function persist(byThread: Record<string, QueuedAiChatMessage[]>) {
  if (!canUseStorage()) return
  try {
    const serializable: Record<string, PersistedQueuedAiChatMessage[]> = {}
    for (const [threadId, items] of Object.entries(byThread)) {
      if (!items.length) continue
      serializable[threadId] = items.map(({ messageFiles: _files, ...rest }) => rest)
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable))
  } catch {
    // Ignore quota / private mode failures.
  }
}

export const useAiChatMessageQueueStore = create<AiChatMessageQueueState>((set, get) => ({
  byThread: loadPersisted(),

  enqueue: (item) => {
    const id = item.id ?? `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const nextItem: QueuedAiChatMessage = {
      id,
      threadId: item.threadId,
      messageText: item.messageText,
      messageTags: item.messageTags ?? [],
      messageSegments: item.messageSegments ?? [],
      messageFiles: item.messageFiles?.length ? [...item.messageFiles] : undefined,
      createdAt: Date.now(),
    }
    set((state) => {
      const existing = state.byThread[item.threadId] ?? []
      const byThread = {
        ...state.byThread,
        [item.threadId]: [...existing, nextItem],
      }
      persist(byThread)
      return { byThread }
    })
    return id
  },

  remove: (threadId, id) => {
    set((state) => {
      const existing = state.byThread[threadId] ?? []
      const nextItems = existing.filter((item) => item.id !== id)
      const byThread = { ...state.byThread }
      if (nextItems.length === 0) delete byThread[threadId]
      else byThread[threadId] = nextItems
      persist(byThread)
      return { byThread }
    })
  },

  clearThread: (threadId) => {
    set((state) => {
      if (!state.byThread[threadId]) return state
      const byThread = { ...state.byThread }
      delete byThread[threadId]
      persist(byThread)
      return { byThread }
    })
  },

  shiftNext: (threadId) => {
    const existing = get().byThread[threadId] ?? []
    if (existing.length === 0) return null
    const [next, ...rest] = existing
    set((state) => {
      const byThread = { ...state.byThread }
      if (rest.length === 0) delete byThread[threadId]
      else byThread[threadId] = rest
      persist(byThread)
      return { byThread }
    })
    return next
  },
}))

/** Stable empty snapshot — never allocate a fresh `[]` in selectors (breaks useSyncExternalStore). */
export const EMPTY_QUEUED_MESSAGES: QueuedAiChatMessage[] = []

export function selectQueuedMessagesForThread(
  state: AiChatMessageQueueState,
  threadId: string | null | undefined,
): QueuedAiChatMessage[] {
  if (!threadId) return EMPTY_QUEUED_MESSAGES
  return state.byThread[threadId] ?? EMPTY_QUEUED_MESSAGES
}

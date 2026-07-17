"use client"

/**
 * Lightweight window-event bus so a thread restore triggered from a message footer can
 * tell the live ChatWindow (which owns local optimistic/pending messages) to drop any
 * in-flight messages that would otherwise remain visible after the restore point.
 */
export const AI_THREAD_RESTORED_EVENT = "articulate:ai-thread-restored"

export type AiThreadRestoredEventDetail = {
  threadId: string
  restoredToMessageId: string | null
  restoreMessageId: string | null
}

export function dispatchAiThreadRestored(detail: AiThreadRestoredEventDetail): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(AI_THREAD_RESTORED_EVENT, { detail }))
}

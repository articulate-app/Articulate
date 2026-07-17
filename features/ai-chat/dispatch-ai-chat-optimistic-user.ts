"use client"

export const AI_CHAT_OPTIMISTIC_USER_EVENT = "articulate:ai-chat-optimistic-user"

export type AiChatOptimisticUserDetail = {
  threadId: string
  displayMessage: string
  /** Full internal generation prompt — used to reconcile with persisted server rows. */
  internalMessage?: string | null
  /** Structured display metadata (display_parts, mention tags, etc.). */
  contentJson?: Record<string, unknown> | null
}

export function dispatchAiChatOptimisticUserMessage(detail: AiChatOptimisticUserDetail): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(AI_CHAT_OPTIMISTIC_USER_EVENT, { detail }))
}

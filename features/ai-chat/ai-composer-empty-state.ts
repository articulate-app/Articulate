import { isPersistedAiThreadId } from "./thread-id"

/** Desktop empty chats keep the composer centered until the first message. */
export function shouldCenterAiComposer(args: {
  messageCount: number
  isMessagesLoading: boolean
  hasPersistedThreadId: boolean
  holdEmptyComposer: boolean
}): boolean {
  if (args.messageCount > 0) return false
  if (args.holdEmptyComposer) return true
  if (!args.hasPersistedThreadId) return true
  return !args.isMessagesLoading
}

/**
 * Keep the empty-composer hold across optimistic → persisted promotion.
 * Drop it when switching to another persisted thread or after the first message.
 */
export function nextHoldEmptyComposer(args: {
  previousThreadId: string
  nextThreadId: string
  messageCount: number
  previousHold: boolean
}): boolean {
  if (args.messageCount > 0) return false
  if (!isPersistedAiThreadId(args.nextThreadId)) return true
  const promotedDraft =
    !isPersistedAiThreadId(args.previousThreadId) &&
    args.previousThreadId !== args.nextThreadId
  if (promotedDraft) return true
  if (args.previousThreadId !== args.nextThreadId) return false
  return args.previousHold
}

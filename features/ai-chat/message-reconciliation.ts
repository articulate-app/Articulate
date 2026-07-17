import { hasUserMessageDisplayParts, parseUserMessageContentJson } from "./ai-chat-user-message-content"
import type { AiMessage, InFlightAssistantMessage } from "./types"

function hasUserDisplayMetadata(contentJson: unknown): boolean {
  const parsed = parseUserMessageContentJson(contentJson)
  return (
    (parsed.mention_tags?.length ?? 0) > 0
    || (parsed.segments?.length ?? 0) > 0
    || hasUserMessageDisplayParts(contentJson)
  )
}

function readBuildDisplayFields(contentJson: unknown): {
  displayMessage?: string
  internalMessage?: string
} {
  if (!contentJson || typeof contentJson !== "object") return {}
  const row = contentJson as Record<string, unknown>
  const displayMessage = typeof row.display_message === "string" ? row.display_message.trim() : ""
  const internalMessage = typeof row.internal_message === "string" ? row.internal_message.trim() : ""
  return {
    ...(displayMessage ? { displayMessage } : {}),
    ...(internalMessage ? { internalMessage } : {}),
  }
}

function userPendingMatchesServerMessage(pending: AiMessage, server: AiMessage): boolean {
  if (pending.role !== "user" || server.role !== "user") return false

  const pendingContent = (pending.content ?? "").trim()
  const serverContent = (server.content ?? "").trim()
  if (pendingContent && pendingContent === serverContent) return true

  const pendingFields = readBuildDisplayFields(pending.content_json)
  if (pendingFields.internalMessage && pendingFields.internalMessage === serverContent) return true
  if (pendingFields.displayMessage && pendingFields.displayMessage === serverContent) return true

  const serverFields = readBuildDisplayFields(server.content_json)
  if (pendingFields.displayMessage && serverFields.internalMessage === serverContent) return true
  if (
    pendingFields.displayMessage
    && serverContent.length > 0
    && serverContent !== pendingFields.displayMessage
    && pendingFields.internalMessage
    && serverContent === pendingFields.internalMessage
  ) {
    return true
  }

  return false
}

function shouldRetainPendingUserDisplayMessage(messages: AiMessage[], pending: AiMessage): boolean {
  if (pending.role !== "user") return false
  if (!hasUserDisplayMetadata(pending.content_json)) return false

  const serverMatch = messages.find(
    (message) => message.role === "user" && userPendingMatchesServerMessage(pending, message),
  )
  if (!serverMatch) return false

  // Keep optimistic metadata in state until the persisted row also has display metadata.
  return !hasUserDisplayMetadata(serverMatch.content_json)
}

function enrichServerMessagesWithPendingUserMetadata(
  messages: AiMessage[],
  pending: AiMessage[],
): AiMessage[] {
  if (pending.length === 0) return messages

  return messages.map((message) => {
    if (message.role !== "user") return message

    const matchingPending = pending.find(
      (candidate) => candidate.role === "user" && userPendingMatchesServerMessage(candidate, message),
    )
    if (!matchingPending) return message

    const existing =
      message.content_json && typeof message.content_json === "object"
        ? (message.content_json as Record<string, unknown>)
        : {}
    const pendingParsed = parseUserMessageContentJson(matchingPending.content_json)
    const pendingFields = readBuildDisplayFields(matchingPending.content_json)
    const serverFields = readBuildDisplayFields(message.content_json)
    const serverContent = (message.content ?? "").trim()
    const displayMessage = pendingFields.displayMessage ?? serverFields.displayMessage
    const internalMessage =
      pendingFields.internalMessage
      ?? serverFields.internalMessage
      ?? (displayMessage && serverContent && serverContent !== displayMessage ? serverContent : undefined)

    const hasDisplayMerge = hasUserDisplayMetadata(matchingPending.content_json)
    if (!hasDisplayMerge && !displayMessage) return message

    return {
      ...message,
      content_json: {
        ...existing,
        ...(hasDisplayMerge ? pendingParsed : {}),
        ...(displayMessage ? { display_message: displayMessage } : {}),
        ...(internalMessage ? { internal_message: internalMessage } : {}),
      },
    }
  })
}

function hasMatchingPersistedMessage(messages: AiMessage[], pending: AiMessage): boolean {
  if (messages.some((message) => message.id === pending.id)) return true

  if (pending.role === "assistant") {
    const assistantPending = pending as InFlightAssistantMessage
    if (assistantPending.reconciled_message_id) {
      return messages.some((message) => message.id === assistantPending.reconciled_message_id)
    }
  }

  if (pending.role === "user") {
    const pendingFields = readBuildDisplayFields(pending.content_json)
    const normalizedPendingContent = (pending.content ?? "").trim()
    if (!normalizedPendingContent && !pendingFields.internalMessage && !pendingFields.displayMessage) {
      return false
    }
    return messages.some(
      (message) => message.role === "user" && userPendingMatchesServerMessage(pending, message),
    )
  }

  const normalizedPendingContent = (pending.content ?? "").trim()
  if (!normalizedPendingContent) return false
  return messages.some(
    (message) =>
      message.role === pending.role &&
      (message.content ?? "").trim() === normalizedPendingContent
  )
}

export function prunePendingMessagesAgainstServer(messages: AiMessage[], pending: AiMessage[]): AiMessage[] {
  return pending.filter((message) => {
    if (message.role === "assistant" && (message as InFlightAssistantMessage).status === "streaming") {
      return true
    }
    if (shouldRetainPendingUserDisplayMessage(messages, message)) {
      return true
    }
    return !hasMatchingPersistedMessage(messages, message)
  })
}

export function buildRenderableMessages(messages: AiMessage[], pending: AiMessage[]): AiMessage[] {
  const enrichedMessages = enrichServerMessagesWithPendingUserMetadata(messages, pending)
  const prunedPending = prunePendingMessagesAgainstServer(enrichedMessages, pending)
  const seen = new Set(enrichedMessages.map((message) => message.id))
  const dedupedPending = prunedPending.filter((message) => {
    if (seen.has(message.id)) return false
    seen.add(message.id)
    return true
  })
  return [...enrichedMessages, ...dedupedPending]
}

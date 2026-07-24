import {
  parseUserMessageContentJson,
  synthesizePlainTextFromDisplayParts,
} from "./ai-chat-user-message-content"
import { resolveClarificationUserDisplayMessage } from "./ai-clarification"

/** Prefer persisted display_message / display_parts over the full internal build prompt. */
export function resolveUserMessageDisplayContent(
  content: string,
  contentJson?: unknown | null,
): string {
  const parsed = parseUserMessageContentJson(contentJson)
  if (parsed.display_parts?.length) {
    if (parsed.display_message) return parsed.display_message
    return synthesizePlainTextFromDisplayParts(parsed.display_parts)
  }

  if (parsed.segments?.length || (parsed.mention_tags?.length ?? 0) > 0) {
    return content
  }

  if (contentJson && typeof contentJson === "object") {
    const row = contentJson as Record<string, unknown>
    const displayMessage = typeof row.display_message === "string" ? row.display_message.trim() : ""
    if (displayMessage) return displayMessage

    // Clarification answers are normal visible user bubbles — never hide them, and
    // never render internal option ids when a human-facing answer is available.
    if (row.clarification_response && typeof row.clarification_response === "object") {
      const clarificationDisplay = resolveClarificationUserDisplayMessage({
        content,
        contentJson,
      })
      if (clarificationDisplay) return clarificationDisplay
    }
  }

  return content
}

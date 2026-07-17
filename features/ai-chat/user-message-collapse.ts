/** Collapse user messages longer than this in chat history (display only). */
export const USER_MESSAGE_COLLAPSE_CHAR_THRESHOLD = 280

export function shouldCollapseUserMessage(content: string): boolean {
  return content.length > USER_MESSAGE_COLLAPSE_CHAR_THRESHOLD
}

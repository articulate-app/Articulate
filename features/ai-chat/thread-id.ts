const UUID_V4_LIKE_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isPersistedAiThreadId(value: unknown): value is string {
  return typeof value === "string" && UUID_V4_LIKE_REGEX.test(value)
}

export function toPersistedAiThreadId(value: unknown): string | null {
  return isPersistedAiThreadId(value) ? value : null
}

/** True for durable DB message ids — false for in-flight `temp-assistant-*` stream ids. */
export function isPersistedAiMessageId(value: unknown): value is string {
  return typeof value === "string" && UUID_V4_LIKE_REGEX.test(value)
}

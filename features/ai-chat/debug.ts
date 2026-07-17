export function logAiChatDebug(event: string, payload?: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "development") return
  if (payload) {
    console.debug(`[ai-chat] ${event}`, payload)
    return
  }
  console.debug(`[ai-chat] ${event}`)
}

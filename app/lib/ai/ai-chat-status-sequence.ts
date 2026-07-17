/**
 * Dedupes and orders `__AI_STATUS__` payloads by monotonic `sequence` within one response/run.
 * Legacy payloads without `sequence` are still processed.
 */
export type AiChatStatusSequenceGate = {
  shouldProcessStatusPayload: (parsed: Record<string, unknown>) => boolean
  highestSequence: () => number
}

export function createAiChatStatusSequenceGate(): AiChatStatusSequenceGate {
  let highestSequence = -1
  const seenSequences = new Set<number>()

  return {
    highestSequence: () => highestSequence,
    shouldProcessStatusPayload(parsed) {
      const raw = parsed.sequence
      if (typeof raw !== "number" || !Number.isFinite(raw)) {
        return true
      }
      const sequence = Math.trunc(raw)
      if (seenSequences.has(sequence)) {
        return false
      }
      if (sequence < highestSequence) {
        if (process.env.NODE_ENV === "development") {
          console.warn("[ai-chat] ignored out-of-order status event", {
            sequence,
            highestSequence,
            type: typeof parsed.type === "string" ? parsed.type : null,
          })
        }
        return false
      }
      seenSequences.add(sequence)
      if (sequence > highestSequence) highestSequence = sequence
      return true
    },
  }
}

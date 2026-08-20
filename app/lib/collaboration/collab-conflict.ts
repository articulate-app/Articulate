import {
  clipConflictSpan,
  CONFLICT_SPAN_MAX,
  localizeApplyConflict,
} from "./tiptap-json-to-yxml"

export type CollabConflictChoice = "keep" | "incoming" | "both"

export type CollabConflictSpan = {
  id: string
  current: string
  incoming: string
  expected?: string
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function readString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value
  }
  return ""
}

/** Turn a stored proposal conflict into an inline span, never a whole-article dump. */
export function parseCollabConflict(row: Record<string, unknown> | null | undefined): CollabConflictSpan | null {
  if (!row) return null
  const id = String(row.id ?? "").trim()
  if (!id) return null
  const payload = asRecord(row.conflict) ?? row
  const current = readString(payload.current, payload.current_text)
  const incoming = readString(payload.incoming, payload.incoming_text)
  const expected = readString(payload.expected, payload.expected_text)
  const looksLikeArticle = /[.!?…]/.test(current) && current.split(/[.!?…]/).filter((part) => part.trim()).length > 1
  const span = current.length > CONFLICT_SPAN_MAX || looksLikeArticle || (!incoming && expected)
    ? localizeApplyConflict({
      expectedText: expected,
      liveText: current,
      patchedText: incoming,
    })
    : {
      current: clipConflictSpan(current),
      incoming: clipConflictSpan(incoming),
      expected: expected ? clipConflictSpan(expected) : undefined,
    }
  if (!span.current && !span.incoming) return null
  return {
    id,
    current: span.current,
    incoming: span.incoming,
    expected: span.expected,
  }
}

export function parseCollabConflicts(rows: Array<Record<string, unknown>> | null | undefined): CollabConflictSpan[] {
  return (rows ?? []).map((row) => parseCollabConflict(row)).filter((row): row is CollabConflictSpan => Boolean(row))
}

import type { BrowserRunEvent } from "../browser-agent/types.ts"
import type { PublicationActivityEvent } from "./types.ts"

const EVENT_LABELS: Array<{ match: RegExp; label: string }> = [
  { match: /browser\.ready|navigat|open.*url|goto/i, label: "Opening destination" },
  { match: /editor|compose|create.*(post|article|page)|new.*(post|article)/i, label: "Finding content editor" },
  { match: /title|headline/i, label: "Adding title" },
  { match: /content|body|rich.?text|editor\.type|fill.*text/i, label: "Adding content" },
  { match: /upload|attach|image|media|file/i, label: "Uploading media" },
  { match: /meta|seo|slug|excerpt|description/i, label: "Configuring metadata" },
  { match: /awaiting|confirmation|ready.?to.?publish|human/i, label: "Waiting for confirmation" },
  { match: /publish|send|post|submit/i, label: "Publishing" },
  { match: /verif|success|external.?url|published/i, label: "Verifying publication" },
]

function labelFromText(text: string): string | null {
  for (const entry of EVENT_LABELS) {
    if (entry.match.test(text)) return entry.label
  }
  return null
}

/**
 * Map provider events into short operational labels. Never expose model chain-of-thought.
 */
export function deriveActivityFromEvents(
  events: BrowserRunEvent[],
  existing: PublicationActivityEvent[] = [],
): PublicationActivityEvent[] {
  const seen = new Set(existing.map((item) => item.label))
  const next = [...existing]

  for (const event of events) {
    if (/model\.|reasoning|thought|hidden/i.test(event.type)) continue
    const blob = `${event.type} ${JSON.stringify(event.data ?? {})}`
    if (/password|cookie|authorization|api[_-]?key|token/i.test(blob) && !/upload|file/i.test(blob)) {
      continue
    }
    const label = labelFromText(blob)
    if (!label || seen.has(label)) continue
    seen.add(label)
    next.push({
      id: `${event.runId}:${event.id}`,
      label,
      at: event.ts,
    })
  }

  return next.slice(-40)
}

export function appendActivity(
  existing: PublicationActivityEvent[],
  label: string,
  at = new Date().toISOString(),
): PublicationActivityEvent[] {
  if (existing.some((item) => item.label === label)) return existing
  return [
    ...existing,
    {
      id: `local:${existing.length + 1}:${label}`,
      label,
      at,
    },
  ].slice(-40)
}

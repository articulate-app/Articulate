export type TextWithUrlSegment =
  | { type: "text"; value: string }
  | { type: "url"; value: string; href: string }

const RAW_URL_PATTERN = /\bhttps?:\/\/[^\s<>"'`]+/gi

/**
 * Strip common trailing punctuation that is usually not part of the URL.
 */
export function cleanUrlMatch(raw: string): { url: string; trailing: string } {
  let url = raw
  let trailing = ""

  while (url.length > 0) {
    const last = url[url.length - 1]
    if (!/[.,!?;:)\]}'"]/.test(last)) break

    if (last === ")" || last === "]" || last === "}") {
      const open = last === ")" ? "(" : last === "]" ? "[" : "{"
      const opens = url.split(open).length - 1
      const closes = url.split(last).length - 1
      if (closes > opens) {
        trailing = last + trailing
        url = url.slice(0, -1)
        continue
      }
      break
    }

    trailing = last + trailing
    url = url.slice(0, -1)
  }

  return { url, trailing }
}

/**
 * Split plain text into text + URL segments for clickable rendering.
 */
export function splitTextWithUrls(text: string): TextWithUrlSegment[] {
  if (!text) return []

  const segments: TextWithUrlSegment[] = []
  RAW_URL_PATTERN.lastIndex = 0
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = RAW_URL_PATTERN.exec(text)) != null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", value: text.slice(lastIndex, match.index) })
    }

    const { url, trailing } = cleanUrlMatch(match[0])
    if (url) {
      segments.push({ type: "url", value: url, href: url })
    }
    if (trailing) {
      segments.push({ type: "text", value: trailing })
    }

    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    segments.push({ type: "text", value: text.slice(lastIndex) })
  }

  return segments.length > 0 ? segments : [{ type: "text", value: text }]
}

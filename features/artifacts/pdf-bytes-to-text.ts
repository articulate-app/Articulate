/**
 * Lightweight PDF text extract for dropped files.
 * Avoids bundling pdf.js / unpdf — Next 14's SWC cannot parse that build.
 */

function latin1(bytes: Uint8Array): string {
  let out = ""
  for (let i = 0; i < bytes.length; i += 1) out += String.fromCharCode(bytes[i]!)
  return out
}

function indexOfAscii(haystack: Uint8Array, needle: string, from = 0): number {
  const n = needle.length
  if (n === 0 || from >= haystack.length) return -1
  const first = needle.charCodeAt(0)
  for (let i = from; i <= haystack.length - n; i += 1) {
    if (haystack[i] !== first) continue
    let matched = true
    for (let j = 1; j < n; j += 1) {
      if (haystack[i + j] !== needle.charCodeAt(j)) {
        matched = false
        break
      }
    }
    if (matched) return i
  }
  return -1
}

async function inflateZlib(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof DecompressionStream === "undefined") return null
  for (const format of ["deflate", "deflate-raw"] as const) {
    try {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format))
      return new Uint8Array(await new Response(stream).arrayBuffer())
    } catch {
      // try the other wrapper
    }
  }
  return null
}

function decodePdfLiteral(inner: string): string {
  let out = ""
  for (let i = 0; i < inner.length; i += 1) {
    const ch = inner[i]
    if (ch !== "\\") {
      out += ch
      continue
    }
    const next = inner[i + 1]
    if (next == null) break
    if (next === "n") { out += "\n"; i += 1; continue }
    if (next === "r") { out += "\r"; i += 1; continue }
    if (next === "t") { out += "\t"; i += 1; continue }
    if (next === "b") { out += "\b"; i += 1; continue }
    if (next === "f") { out += "\f"; i += 1; continue }
    if (next === "(" || next === ")" || next === "\\") { out += next; i += 1; continue }
    if (next >= "0" && next <= "7") {
      let oct = next
      let consumed = 1
      const second = inner[i + 2]
      const third = inner[i + 3]
      if (second >= "0" && second <= "7") {
        oct += second
        consumed += 1
        if (third >= "0" && third <= "7") {
          oct += third
          consumed += 1
        }
      }
      out += String.fromCharCode(parseInt(oct, 8))
      i += consumed
      continue
    }
    i += 1
    out += next
  }
  if (out.charCodeAt(0) === 0xfe && out.charCodeAt(1) === 0xff) {
    let decoded = ""
    for (let i = 2; i + 1 < out.length; i += 2) {
      decoded += String.fromCharCode((out.charCodeAt(i) << 8) | out.charCodeAt(i + 1))
    }
    return decoded
  }
  return out
}

function collectLiterals(content: string): string[] {
  const parts: string[] = []
  const re = /\((?:\\.|[^\\)])*\)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(content)) != null) {
    const inner = match[0].slice(1, -1)
    const text = decodePdfLiteral(inner).replace(/\s+/g, " ").trim()
    if (text) parts.push(text)
  }
  return parts
}

async function collectContentStreams(bytes: Uint8Array): Promise<string[]> {
  const contents: string[] = []
  const source = latin1(bytes)
  contents.push(source)

  let cursor = 0
  while (cursor < bytes.length) {
    const streamAt = indexOfAscii(bytes, "stream", cursor)
    if (streamAt < 0) break
    let dataStart = streamAt + 6
    if (bytes[dataStart] === 0x0d) dataStart += 1
    if (bytes[dataStart] === 0x0a) dataStart += 1
    const endAt = indexOfAscii(bytes, "endstream", dataStart)
    if (endAt < 0) break
    const headerStart = Math.max(0, streamAt - 400)
    const header = source.slice(headerStart, streamAt)
    const payload = bytes.subarray(dataStart, endAt)
    if (/\/FlateDecode|\/Fl/i.test(header)) {
      const inflated = await inflateZlib(payload)
      if (inflated) contents.push(latin1(inflated))
    } else {
      contents.push(latin1(payload))
    }
    cursor = endAt + 9
  }
  return contents
}

export async function pdfBytesToPlainText(bytes: Uint8Array): Promise<string> {
  if (bytes.length < 8) return ""
  const header = latin1(bytes.subarray(0, 8))
  if (!header.startsWith("%PDF")) return ""
  const chunks = await collectContentStreams(bytes)
  const lines: string[] = []
  for (const chunk of chunks) {
    const literals = collectLiterals(chunk)
    if (literals.length > 0) lines.push(literals.join(" "))
  }
  return lines.join("\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim()
}

/**
 * Replace plain-text matches inside HTML without touching tag markup.
 * Walks text nodes only (browser DOMParser).
 */
export function replaceInHtmlTextNodes(
  html: string,
  find: string,
  replaceWith: string,
  opts?: { all?: boolean; caseSensitive?: boolean },
): { html: string; replacements: number } {
  const needle = String(find ?? "")
  if (!needle) return { html, replacements: 0 }
  const all = opts?.all !== false
  const caseSensitive = opts?.caseSensitive === true

  if (typeof DOMParser === "undefined") {
    // Node/test fallback: naive string replace on stripped-safe assumption.
    if (caseSensitive) {
      if (!all) {
        const at = html.indexOf(needle)
        if (at < 0) return { html, replacements: 0 }
        return {
          html: `${html.slice(0, at)}${replaceWith}${html.slice(at + needle.length)}`,
          replacements: 1,
        }
      }
      let count = 0
      let next = html
      let from = 0
      while (true) {
        const at = next.indexOf(needle, from)
        if (at < 0) break
        next = `${next.slice(0, at)}${replaceWith}${next.slice(at + needle.length)}`
        from = at + replaceWith.length
        count += 1
        if (!all) break
      }
      return { html: next, replacements: count }
    }
    const re = new RegExp(escapeRegExp(needle), all ? "gi" : "i")
    let replacements = 0
    const next = html.replace(re, () => {
      replacements += 1
      return replaceWith
    })
    return { html: next, replacements }
  }

  const doc = new DOMParser().parseFromString(`<div id="__root">${html}</div>`, "text/html")
  const root = doc.getElementById("__root")
  if (!root) return { html, replacements: 0 }

  let remaining = all ? Number.POSITIVE_INFINITY : 1
  let replacements = 0

  const visit = (node: Node) => {
    if (remaining <= 0) return
    if (node.nodeType === Node.TEXT_NODE) {
      const value = node.nodeValue ?? ""
      if (!value) return
      if (caseSensitive) {
        if (!value.includes(needle)) return
        if (!all) {
          const at = value.indexOf(needle)
          if (at < 0) return
          node.nodeValue = `${value.slice(0, at)}${replaceWith}${value.slice(at + needle.length)}`
          replacements += 1
          remaining -= 1
          return
        }
        let next = value
        let from = 0
        let local = 0
        while (true) {
          const at = next.indexOf(needle, from)
          if (at < 0) break
          next = `${next.slice(0, at)}${replaceWith}${next.slice(at + needle.length)}`
          from = at + replaceWith.length
          local += 1
        }
        if (local > 0) {
          node.nodeValue = next
          replacements += local
          remaining -= local
        }
        return
      }

      const re = new RegExp(escapeRegExp(needle), all ? "gi" : "i")
      if (!re.test(value)) return
      re.lastIndex = 0
      let local = 0
      node.nodeValue = value.replace(re, () => {
        if (remaining <= 0) return needle
        local += 1
        remaining -= 1
        return replaceWith
      })
      replacements += local
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const el = node as Element
    const tag = el.tagName.toLowerCase()
    if (tag === "script" || tag === "style") return
    Array.from(el.childNodes).forEach(visit)
  }

  visit(root)
  return { html: root.innerHTML, replacements }
}

export function countInHtmlTextNodes(
  html: string,
  find: string,
  opts?: { caseSensitive?: boolean },
): number {
  const needle = String(find ?? "")
  if (!needle) return 0
  const plain = htmlToPlainSearchText(html)
  if (!plain) return 0
  const caseSensitive = opts?.caseSensitive === true
  if (caseSensitive) {
    let count = 0
    let from = 0
    while (true) {
      const at = plain.indexOf(needle, from)
      if (at < 0) break
      count += 1
      from = at + Math.max(1, needle.length)
    }
    return count
  }
  const re = new RegExp(escapeRegExp(needle), "gi")
  return plain.match(re)?.length ?? 0
}

function htmlToPlainSearchText(html: string): string {
  if (typeof DOMParser === "undefined") {
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")
  }
  const doc = new DOMParser().parseFromString(html, "text/html")
  return (doc.body.textContent ?? "").replace(/\u00a0/g, " ")
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

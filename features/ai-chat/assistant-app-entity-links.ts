/**
 * Helpers for turning bare `app://…` URLs in assistant markdown into clickable
 * entity links (and resolving `ai-build` → artifact for navigation).
 */

import { artifactDocumentGlyphHtml } from "./artifact-context-chip-html"

const UUID =
  "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"

/** Bare app entity URLs that should become markdown links when the model pastes them raw. */
const BARE_APP_ENTITY_URL = new RegExp(
  String.raw`(?<!\]\()(?<!["'=])app://(?:ai-build|artifact|task|project|user|source|ai-agent-run)/(?:${UUID}|\d+)(?:/[^\s)<>\]"']*)?`,
  "gi",
)

const APP_ENTITY_HREF =
  /^app:\/\/(?:(?:task|project|user)\/\d+|ai-build\/[0-9a-f-]{36}|artifact\/[0-9a-f-]{36}(?:\/download(?:\?[^#]*)?)?(?:\?[^#]*)?|source\/[0-9a-f-]{36}|ai-agent-run\/[0-9a-f-]{36})$/i

export function isAppEntityHref(href: string | null | undefined): boolean {
  return !!href && APP_ENTITY_HREF.test(href.trim())
}

function defaultLabelForAppHref(href: string): string {
  const trimmed = href.trim()
  if (/^app:\/\/ai-build\//i.test(trimmed)) return "Artifact"
  if (/^app:\/\/artifact\//i.test(trimmed)) return "Artifact"
  if (/^app:\/\/source\//i.test(trimmed)) return "Source"
  if (/^app:\/\/ai-agent-run\//i.test(trimmed)) return "Agent run"
  const task = trimmed.match(/^app:\/\/task\/(\d+)$/i)
  if (task) return `Task ${task[1]}`
  const project = trimmed.match(/^app:\/\/project\/(\d+)$/i)
  if (project) return `Project ${project[1]}`
  const user = trimmed.match(/^app:\/\/user\/(\d+)$/i)
  if (user) return `User ${user[1]}`
  return "Open"
}

function entityBadgeLetter(href: string): string {
  if (/^app:\/\/artifact\//i.test(href) || /^app:\/\/ai-build\//i.test(href)) return "A"
  if (/^app:\/\/source\//i.test(href)) return "S"
  if (/^app:\/\/ai-agent-run\//i.test(href)) return "R"
  const m = href.match(/^app:\/\/(task|project|user)\//i)
  const t = (m?.[1] || "task").toLowerCase()
  if (t === "project") return "P"
  if (t === "user") return "U"
  return "T"
}

function entityKindAttr(href: string): string {
  if (/^app:\/\/ai-build\//i.test(href)) return "ai-build"
  if (/^app:\/\/artifact\//i.test(href)) return "artifact"
  if (/^app:\/\/source\//i.test(href)) return "source"
  if (/^app:\/\/ai-agent-run\//i.test(href)) return "ai-agent-run"
  const m = href.match(/^app:\/\/(task|project|user)\//i)
  return (m?.[1] || "task").toLowerCase()
}

/**
 * Wrap bare `app://…` URLs in markdown links so marked renders clickable anchors.
 * Skips URLs already used as markdown link destinations (`](app://…)`).
 */
export function linkifyBareAppEntityUrls(
  markdown: string,
  labelsByHref?: Record<string, string> | null,
): string {
  return String(markdown ?? "").replace(BARE_APP_ENTITY_URL, (href) => {
    const key = href.trim()
    const label = labelsByHref?.[key]?.trim() || defaultLabelForAppHref(key)
    return `[${label}](${key})`
  })
}

function flattenAppEntityLinkLabel(label: string): string {
  return String(label ?? "")
    // Newlines, Unicode line/paragraph separators, and HTML breaks models leave in labels.
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/[\u2028\u2029]/g, " ")
    .replace(/\s*\n+\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
}

/**
 * Models sometimes break link labels across lines:
 * `[Somengil\n\nCapacity…](app://artifact/…)` which marked won't chip-render.
 * Also tolerate whitespace between `]` and `(app://…)`.
 */
export function normalizeMultilineAppEntityMarkdownLinks(markdown: string): string {
  return String(markdown ?? "").replace(
    /\[([\s\S]*?)\]\s*\(\s*(app:\/\/[^)\s]+)\s*\)/g,
    (_match, label: string, href: string) => {
      const flat = flattenAppEntityLinkLabel(label)
      if (!flat) return `[${defaultLabelForAppHref(href)}](${href})`
      return `[${flat}](${href})`
    },
  )
}

/** True when visible text still contains a raw `[…](app://…)` markdown destination. */
export function htmlContainsRawAppEntityMarkdownLink(html: string): boolean {
  const source = String(html ?? "")
  if (!source) return false
  // Ignore destinations that are already real anchors.
  const withoutAnchors = source.replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, "")
  return /\]\s*\(\s*app:\/\//i.test(withoutAnchors)
}

/**
 * Collapse duplicate “Title” + “[Title](app://…)” pairs the model often emits
 * into a single markdown entity link.
 */
export function collapseRedundantAppEntityLinkLines(markdown: string): string {
  let out = normalizeMultilineAppEntityMarkdownLinks(String(markdown ?? ""))
  // Plain title line immediately followed by the same label as a markdown link.
  out = out.replace(
    /(^|\n)[ \t]*(?:\*\*|__)?([^\n\[\]]+?)(?:\*\*|__)?[ \t]*\n[ \t]*\[(\2)\]\((app:\/\/[^)\s]+)\)/g,
    "$1[$3]($4)",
  )
  // Same pattern with an optional bullet/number marker on the title / link lines.
  // Keep as a plain entity link (not a list item) so chips don't render with bullets.
  out = out.replace(
    /(^|\n)[ \t]*(?:[-*+]|\d+\.)[ \t]+(?:\*\*|__)?([^\n\[\]]+?)(?:\*\*|__)?[ \t]*\n[ \t]*(?:[-*+]|\d+\.)?[ \t]*\[(\2)\]\((app:\/\/[^)\s]+)\)/g,
    "$1[$3]($4)",
  )
  return out
}

/**
 * Models are often told to paste entity chips as list items (`- [Title](app://…)`).
 * Strip those markers when the line is only an app-entity link so chips aren't bulleted.
 */
export function stripListMarkersFromAppEntityOnlyLines(markdown: string): string {
  return String(markdown ?? "").replace(
    /(^|\n)[ \t]*(?:[-*+]|\d+\.)[ \t]+(\[[^\n\[\]]*\]\(app:\/\/[^)\s]+\))[ \t]*(?=\n|$)/g,
    "$1$2",
  )
}

const ENTITY_CHIP_CLASS =
  "ai-msg-entity-chip inline-flex max-w-[min(280px,100%)] cursor-pointer select-none items-center gap-1 align-baseline rounded-md border border-gray-200/90 bg-gray-100 px-1.5 py-0.5 text-xs font-medium leading-snug text-gray-800 shadow-sm no-underline transition-colors hover:border-gray-300 hover:bg-gray-200/95 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-1 focus-visible:ring-offset-white"

const ARTIFACT_FILE_CHIP_CLASS =
  "ai-msg-entity-chip ai-msg-artifact-file-chip my-1 inline-flex max-w-[260px] cursor-pointer select-none items-center gap-2.5 align-middle rounded-2xl border border-gray-200 bg-white px-2.5 py-2 text-left text-[13px] font-medium leading-snug text-gray-900 shadow-[0_1px_2px_rgba(0,0,0,0.04)] no-underline transition-colors hover:border-gray-300 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-1 focus-visible:ring-offset-white"

const ENTITY_BADGE_CLASS =
  "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded bg-white text-[9px] font-bold leading-none text-gray-600 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]"

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function renderEntityChipAnchor(href: string, label: string): string {
  const kind = entityKindAttr(href)
  const safeHref = escapeHtmlText(href)
  const safeLabel = escapeHtmlText(label)
  if (kind === "artifact" || kind === "ai-build") {
    return (
      `<a href="${safeHref}" data-app-entity="artifact" class="${ARTIFACT_FILE_CHIP_CLASS}">` +
      artifactDocumentGlyphHtml() +
      `<span class="min-w-0 flex-1 py-0.5">` +
      `<span class="block truncate text-[13px] font-medium leading-tight text-gray-900">${safeLabel}</span>` +
      `<span class="mt-0.5 block truncate text-[12px] font-normal leading-tight text-gray-500">Artifact</span>` +
      `</span></a>`
    )
  }
  const letter = entityBadgeLetter(href)
  return (
    `<a href="${safeHref}" data-app-entity="${kind}" class="${ENTITY_CHIP_CLASS}">` +
    `<span class="${ENTITY_BADGE_CLASS}" aria-hidden="true">${letter}</span>` +
    `<span class="min-w-0 flex-1 truncate">${safeLabel}</span></a>`
  )
}

/**
 * After HTML sanitize (which strips classes), restyle `app://` anchors as entity chips.
 * Also unwrap list wrappers when every item is only an entity chip (no leftover bullets).
 */
export function decorateAppEntityAnchorsAsChips(html: string): string {
  if (!html) return html

  if (typeof DOMParser !== "undefined") {
    const doc = new DOMParser().parseFromString(html, "text/html")
    doc.querySelectorAll("a[href]").forEach((anchor) => {
      const href = anchor.getAttribute("href")?.trim() ?? ""
      if (!isAppEntityHref(href)) return
      if (anchor.classList.contains("ai-msg-entity-chip")) return

      const label = (anchor.textContent ?? "").trim() || defaultLabelForAppHref(href)
      const letter = entityBadgeLetter(href)
      const kind = entityKindAttr(href)

      anchor.setAttribute("href", href)
      anchor.setAttribute("data-app-entity", kind)
      anchor.className = ENTITY_CHIP_CLASS
      anchor.replaceChildren()

      const badge = doc.createElement("span")
      badge.className = ENTITY_BADGE_CLASS
      badge.setAttribute("aria-hidden", "true")
      badge.textContent = letter

      const text = doc.createElement("span")
      text.className = "min-w-0 flex-1 truncate"
      text.textContent = label

      anchor.appendChild(badge)
      anchor.appendChild(text)
    })

    unwrapEntityChipOnlyLists(doc)
    return doc.body.innerHTML
  }

  // Node / SSR fallback (no DOMParser): rewrite simple anchors by regex.
  return html.replace(
    /<a\s+href="(app:\/\/[^"]+)"([^>]*)>([\s\S]*?)<\/a>/gi,
    (match, hrefRaw: string, attrs: string, body: string) => {
      const href = String(hrefRaw ?? "").trim()
      if (!isAppEntityHref(href)) return match
      if (/\bai-msg-entity-chip\b/.test(attrs) || /\bai-msg-entity-chip\b/.test(match)) return match
      const label =
        String(body ?? "")
          .replace(/<[^>]+>/g, "")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .trim() || defaultLabelForAppHref(href)
      return renderEntityChipAnchor(href, label)
    },
  )
}

function isEntityChipOnlyListItem(li: Element): boolean {
  const meaningful = Array.from(li.childNodes).filter((node) => {
    if (node.nodeType === Node.TEXT_NODE) return Boolean(node.textContent?.trim())
    return node.nodeType === Node.ELEMENT_NODE
  })
  if (meaningful.length === 0) return false

  return meaningful.every((node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return false
    const el = node as Element
    if (el.matches("a.ai-msg-entity-chip")) return true
    if (el.matches("p") || el.matches("span")) {
      const nested = Array.from(el.childNodes).filter((child) => {
        if (child.nodeType === Node.TEXT_NODE) return Boolean(child.textContent?.trim())
        return child.nodeType === Node.ELEMENT_NODE
      })
      return (
        nested.length > 0
        && nested.every(
          (child) =>
            child.nodeType === Node.ELEMENT_NODE
            && (child as Element).matches("a.ai-msg-entity-chip"),
        )
      )
    }
    return false
  })
}

/** Turn `<ul><li><a class="ai-msg-entity-chip">…</a></li></ul>` into plain chip paragraphs. */
function unwrapEntityChipOnlyLists(doc: Document): void {
  const lists = Array.from(doc.querySelectorAll("ul, ol"))
  for (const list of lists) {
    const items = Array.from(list.children).filter((child) => child.tagName === "LI")
    if (items.length === 0) continue
    if (!items.every((li) => isEntityChipOnlyListItem(li))) continue

    const fragment = doc.createDocumentFragment()
    for (const li of items) {
      const chips = Array.from(li.querySelectorAll("a.ai-msg-entity-chip"))
      if (chips.length === 0) continue
      const p = doc.createElement("p")
      for (const chip of chips) p.appendChild(chip.cloneNode(true))
      fragment.appendChild(p)
    }
    list.replaceWith(fragment)
  }
}

import { Marked, type Tokens } from "marked"

/** Match app entity links (task / project / user / artifact, including artifact downloads). */
const APP_ENTITY_HREF =
  /^app:\/\/(?:(?:task|project|user)\/\d+|artifact\/[0-9a-f-]{36}(?:\/download(?:\?[^#]*)?)?(?:\?[^#]*)?)$/i

function isAppEntityHref(href: string | undefined | null): boolean {
  return !!href && APP_ENTITY_HREF.test(href.trim())
}

function parseAppEntityKindForChip(href: string): "task" | "project" | "user" | "artifact" {
  const artifact = href.trim().match(/^app:\/\/artifact\//i)
  if (artifact) return "artifact"
  const m = href.trim().match(/^app:\/\/(task|project|user)\/\d+$/i)
  const t = (m?.[1] || "task").toLowerCase()
  if (t === "project" || t === "user") return t
  return "task"
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")
}

function entityBadgeLetter(href: string): string {
  if (/^app:\/\/artifact\//i.test(href.trim())) return "A"
  const m = href.trim().match(/^app:\/\/(task|project|user)\//i)
  const t = (m?.[1] || "task").toLowerCase()
  if (t === "project") return "P"
  if (t === "user") return "U"
  return "T"
}

/**
 * Markdown instance for assistant chat only (does not touch global `marked`).
 * Renders `app://task|project|user/...` links as inline chip-like anchors.
 */
export const assistantMarked = new Marked()

assistantMarked.use({
  renderer: {
    strong({ tokens }) {
      if (tokens?.length === 1 && tokens[0].type === "link") {
        const lt = tokens[0] as Tokens.Link
        if (isAppEntityHref(lt.href)) {
          return this.link(lt)
        }
      }
      return `<strong>${this.parser.parseInline(tokens)}</strong>`
    },
    em({ tokens }) {
      if (tokens?.length === 1 && tokens[0].type === "link") {
        const lt = tokens[0] as Tokens.Link
        if (isAppEntityHref(lt.href)) {
          return this.link(lt)
        }
      }
      return `<em>${this.parser.parseInline(tokens)}</em>`
    },
    link({ href, title, tokens }) {
      const h = href?.trim() ?? ""
      const body = this.parser.parseInline(tokens)
      if (!isAppEntityHref(h)) {
        const t = title ? ` title="${escapeAttr(title)}"` : ""
        return `<a href="${escapeAttr(h)}"${t}>${body}</a>`
      }

      const tAttr = title ? ` title="${escapeAttr(title)}"` : ""
      const kind = parseAppEntityKindForChip(h)
      const letter = entityBadgeLetter(h)

      // Visual language aligned with composer `ai-composer-tag`: inline flex, rounded, border, compact type badge + label.
      return (
        `<a href="${escapeAttr(h)}"${tAttr} data-app-entity="${kind}" class="ai-msg-entity-chip inline-flex max-w-[min(280px,100%)] cursor-pointer select-none items-center gap-1 align-baseline rounded-md border border-gray-200/90 bg-gray-100 px-1.5 py-0.5 text-xs font-medium leading-snug text-gray-800 shadow-sm no-underline transition-colors hover:border-gray-300 hover:bg-gray-200/95 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-1 focus-visible:ring-offset-white">` +
        `<span class="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded bg-white text-[9px] font-bold leading-none text-gray-600 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]" aria-hidden="true">${letter}</span>` +
        `<span class="min-w-0 flex-1 truncate">${body}</span></a>`
      )
    },
  },
})

assistantMarked.setOptions({ breaks: true, gfm: true })

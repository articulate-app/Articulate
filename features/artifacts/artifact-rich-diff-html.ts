/**
 * Build Word-style track-changes HTML from before/after artifact bodies.
 * Keeps unchanged blocks' rich HTML; marks inserts/deletes inline for edits.
 */

import {
  computeWordDiff,
  type DiffToken,
} from "../tasks/utils/component-content-diff"

function escapeHtml(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function plainFromHtml(html: string): string {
  if (typeof DOMParser === "undefined") {
    return html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|h[1-6]|li|tr|blockquote)>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  }
  const doc = new DOMParser().parseFromString(`<div id="__root">${html}</div>`, "text/html")
  const root = doc.getElementById("__root")
  return (root?.textContent ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function splitTopLevelBlocks(html: string): string[] {
  const source = String(html ?? "").trim()
  if (!source) return []

  if (typeof DOMParser !== "undefined") {
    const doc = new DOMParser().parseFromString(`<div id="__root">${source}</div>`, "text/html")
    const root = doc.getElementById("__root")
    if (root) {
      const blocks: string[] = []
      Array.from(root.childNodes).forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          const text = (node.textContent ?? "").trim()
          if (text) blocks.push(`<p>${escapeHtml(text)}</p>`)
          return
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return
        const el = node as Element
        blocks.push(el.outerHTML)
      })
      if (blocks.length > 0) return blocks
    }
  }

  // Node/test fallback: split on common block-level tags without a DOM.
  const parts = source.match(
    /<(?:p|h[1-6]|ul|ol|blockquote|pre|table|figure|hr|div)\b[\s\S]*?(?:<\/(?:p|h[1-6]|ul|ol|blockquote|pre|table|figure|div)>|\/>)/gi,
  )
  if (parts && parts.length > 0) return parts
  return [source]
}

function outerTagName(blockHtml: string): string {
  const match = String(blockHtml).trim().match(/^<([a-z0-9]+)\b/i)
  const tag = (match?.[1] ?? "p").toLowerCase()
  if (tag === "ul" || tag === "ol" || tag === "table" || tag === "figure" || tag === "hr") {
    return tag
  }
  return ["h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "div", "p"].includes(tag)
    ? tag
    : "p"
}

function tokensToHtml(tokens: DiffToken[]): string {
  return tokens
    .map((token) => {
      const text = escapeHtml(token.text)
      if (!text) return ""
      if (token.type === "added") {
        return `<span class="artifact-diff-ins">${text}</span>`
      }
      if (token.type === "removed") {
        return `<span class="artifact-diff-del">${text}</span>`
      }
      return text
    })
    .join("")
}

function wrapBlockWithClass(blockHtml: string, className: string): string {
  const trimmed = String(blockHtml).trim()
  if (!trimmed) return ""
  if (typeof DOMParser === "undefined") {
    return `<div class="${className}">${trimmed}</div>`
  }
  const doc = new DOMParser().parseFromString(`<div id="__root">${trimmed}</div>`, "text/html")
  const root = doc.getElementById("__root")
  const first = root?.firstElementChild
  if (!first) return `<div class="${className}">${trimmed}</div>`
  const existing = first.getAttribute("class") ?? ""
  first.setAttribute("class", `${existing} ${className}`.trim())
  return first.outerHTML
}

function lcsBlockTable(beforePlain: string[], afterPlain: string[]): number[][] {
  const rows = beforePlain.length + 1
  const cols = afterPlain.length + 1
  const table = Array.from({ length: rows }, () => Array<number>(cols).fill(0))
  for (let i = beforePlain.length - 1; i >= 0; i -= 1) {
    for (let j = afterPlain.length - 1; j >= 0; j -= 1) {
      if (beforePlain[i] === afterPlain[j]) {
        table[i][j] = table[i + 1][j + 1] + 1
      } else {
        table[i][j] = Math.max(table[i + 1][j], table[i][j + 1])
      }
    }
  }
  return table
}

type BlockOp =
  | { type: "unchanged"; after: string }
  | { type: "removed"; before: string }
  | { type: "added"; after: string }

function emitChangedBlock(beforeBlock: string, afterBlock: string): string {
  const beforePlain = plainFromHtml(beforeBlock)
  const afterPlain = plainFromHtml(afterBlock)
  if (!beforePlain && !afterPlain) return afterBlock || beforeBlock
  if (beforePlain === afterPlain) return afterBlock

  const tokens = computeWordDiff(beforePlain, afterPlain)
  const hasShared = tokens.some((token) => token.type === "unchanged")
  const tag = outerTagName(afterBlock || beforeBlock)

  if (
    tag === "ul"
    || tag === "ol"
    || tag === "table"
    || tag === "figure"
    || tag === "hr"
    || !hasShared
  ) {
    return [
      beforeBlock ? wrapBlockWithClass(beforeBlock, "artifact-diff-block-del") : "",
      afterBlock ? wrapBlockWithClass(afterBlock, "artifact-diff-block-ins") : "",
    ]
      .filter(Boolean)
      .join("")
  }

  return `<${tag} class="artifact-diff-inline">${tokensToHtml(tokens)}</${tag}>`
}

/**
 * Produce rich HTML with insert/delete marks, suitable for `rte-prose` rendering.
 * When `changedOnly`, omit unchanged blocks so chat previews show just the edit.
 */
export function buildArtifactTrackChangesHtml(
  beforeHtml: string | null | undefined,
  afterHtml: string | null | undefined,
  options?: { changedOnly?: boolean },
): string {
  const changedOnly = Boolean(options?.changedOnly)
  const before = String(beforeHtml ?? "").trim()
  const after = String(afterHtml ?? "").trim()
  if (!before && !after) return "<p></p>"
  if (!before) {
    return splitTopLevelBlocks(after)
      .map((block) => wrapBlockWithClass(block, "artifact-diff-block-ins"))
      .join("") || after
  }
  if (!after) {
    return splitTopLevelBlocks(before)
      .map((block) => wrapBlockWithClass(block, "artifact-diff-block-del"))
      .join("") || before
  }
  if (before === after) return changedOnly ? "<p></p>" : after

  const beforeBlocks = splitTopLevelBlocks(before)
  const afterBlocks = splitTopLevelBlocks(after)
  const beforePlain = beforeBlocks.map(plainFromHtml)
  const afterPlain = afterBlocks.map(plainFromHtml)
  const table = lcsBlockTable(beforePlain, afterPlain)

  const ops: BlockOp[] = []
  let i = 0
  let j = 0
  while (i < beforeBlocks.length && j < afterBlocks.length) {
    if (beforePlain[i] === afterPlain[j]) {
      ops.push({ type: "unchanged", after: afterBlocks[j] })
      i += 1
      j += 1
      continue
    }
    if (table[i + 1][j] >= table[i][j + 1]) {
      ops.push({ type: "removed", before: beforeBlocks[i] })
      i += 1
    } else {
      ops.push({ type: "added", after: afterBlocks[j] })
      j += 1
    }
  }
  while (i < beforeBlocks.length) {
    ops.push({ type: "removed", before: beforeBlocks[i] })
    i += 1
  }
  while (j < afterBlocks.length) {
    ops.push({ type: "added", after: afterBlocks[j] })
    j += 1
  }

  const out: string[] = []
  for (let index = 0; index < ops.length; index += 1) {
    const current = ops[index]
    const next = ops[index + 1]
    if (current.type === "unchanged") {
      if (!changedOnly) out.push(current.after)
      continue
    }
    if (current.type === "removed" && next?.type === "added") {
      out.push(emitChangedBlock(current.before, next.after))
      index += 1
      continue
    }
    if (current.type === "removed") {
      out.push(wrapBlockWithClass(current.before, "artifact-diff-block-del"))
      continue
    }
    out.push(wrapBlockWithClass(current.after, "artifact-diff-block-ins"))
  }

  const joined = out.filter(Boolean).join("")
  if (joined) return joined
  if (changedOnly) return "<p></p>"
  return after || before || "<p></p>"
}

/** Resolve HTML for track-changes from content_json / text / raw html. */
export function resolveArtifactDiffHtml(args: {
  contentText?: string | null
  contentJson?: unknown
  htmlHint?: string | null
}): string {
  const hint = String(args.htmlHint ?? "").trim()
  if (hint && /<[a-z][\s\S]*>/i.test(hint)) return hint

  if (args.contentJson && typeof args.contentJson === "object") {
    const blocks = Array.isArray((args.contentJson as { blocks?: unknown }).blocks)
      ? (args.contentJson as { blocks: Array<Record<string, unknown>> }).blocks
      : []
    const parts = blocks
      .map((block) => (typeof block?.html === "string" ? block.html.trim() : ""))
      .filter(Boolean)
    if (parts.length > 0) return parts.join("")
  }

  const text = String(args.contentText ?? "").trim()
  if (!text) return ""
  if (/<[a-z][\s\S]*>/i.test(text)) return text
  return text
    .split(/\n{2,}/)
    .map((para) => `<p>${escapeHtml(para).replace(/\n/g, "<br>")}</p>`)
    .join("")
}

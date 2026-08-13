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

/** Normalize block text for LCS equality — ignore formatting/whitespace churn. */
function normalizeBlockPlain(html: string): string {
  return plainFromHtml(html)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Split HTML into top-level blocks. Tables/lists must stay intact — a naive
 * non-greedy regex would close at the first nested </p> inside a <td>.
 */
export function splitTopLevelBlocks(html: string): string[] {
  const source = String(html ?? "").trim()
  if (!source) return []

  if (typeof DOMParser !== "undefined") {
    try {
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
    } catch {
      // fall through
    }
  }

  return splitTopLevelBlocksWithoutDom(source)
}

function splitTopLevelBlocksWithoutDom(source: string): string[] {
  const blocks: string[] = []
  const tagRe = /<(p|h[1-6]|ul|ol|blockquote|pre|table|figure|hr|div)\b[^>]*>/gi
  let match: RegExpExecArray | null
  let cursor = 0
  while ((match = tagRe.exec(source)) != null) {
    if (match.index > cursor) {
      const leading = source.slice(cursor, match.index).trim()
      if (leading) blocks.push(`<p>${escapeHtml(leading)}</p>`)
    }
    const tag = match[1].toLowerCase()
    const start = match.index
    if (tag === "hr") {
      const selfClose = source.slice(start).match(/^<hr\b[^>]*\/?>/i)
      const end = selfClose ? start + selfClose[0].length : start + match[0].length
      blocks.push(source.slice(start, end))
      cursor = end
      tagRe.lastIndex = end
      continue
    }
    const closeRe = new RegExp(`</${tag}\\s*>`, "i")
    const rest = source.slice(start + match[0].length)
    // For containers with nested same-tags (rare for table), find matching close
    // by depth when needed; tables/lists rarely nest same outer tag.
    if (tag === "table" || tag === "ul" || tag === "ol" || tag === "blockquote" || tag === "pre" || tag === "figure") {
      const closeMatch = rest.match(closeRe)
      if (closeMatch && closeMatch.index != null) {
        const end = start + match[0].length + closeMatch.index + closeMatch[0].length
        blocks.push(source.slice(start, end))
        cursor = end
        tagRe.lastIndex = end
        continue
      }
    }
    // Simple blocks: first matching close tag.
    const closeMatch = rest.match(closeRe)
    if (closeMatch && closeMatch.index != null) {
      const end = start + match[0].length + closeMatch.index + closeMatch[0].length
      blocks.push(source.slice(start, end))
      cursor = end
      tagRe.lastIndex = end
      continue
    }
    // Unclosed — take the opening tag only and continue.
    cursor = start + match[0].length
    tagRe.lastIndex = cursor
  }
  if (cursor < source.length) {
    const trailing = source.slice(cursor).trim()
    if (trailing) blocks.push(trailing.startsWith("<") ? trailing : `<p>${escapeHtml(trailing)}</p>`)
  }
  return blocks.length > 0 ? blocks : [source]
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

function isHeadingBlock(blockHtml: string): boolean {
  return /^<h[1-6]\b/i.test(String(blockHtml).trim())
}

/** Stable key for heading identity (level + normalized text). */
function headingBlockKey(blockHtml: string): string | null {
  const trimmed = String(blockHtml).trim()
  const match = trimmed.match(/^<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/i)
  if (!match) return null
  const plain = normalizeBlockPlain(match[2] ?? "")
  if (!plain) return null
  return `${match[1]}:${plain}`
}

/**
 * Align blocks using heading anchors first, then LCS inside each segment.
 * Prevents identical H2s from being painted as full-block deletes when body
 * paragraphs shift around them.
 */
function alignBlocksWithHeadingAnchors(
  beforeBlocks: string[],
  afterBlocks: string[],
): BlockOp[] {
  const beforePlain = beforeBlocks.map(normalizeBlockPlain)
  const afterPlain = afterBlocks.map(normalizeBlockPlain)

  type Anchor = { beforeIndex: number; afterIndex: number }
  const anchors: Anchor[] = [{ beforeIndex: -1, afterIndex: -1 }]

  let minAfter = 0
  for (let bi = 0; bi < beforeBlocks.length; bi += 1) {
    const key = headingBlockKey(beforeBlocks[bi])
    if (!key) continue
    let matchAj = -1
    for (let aj = minAfter; aj < afterBlocks.length; aj += 1) {
      if (headingBlockKey(afterBlocks[aj]) === key) {
        matchAj = aj
        break
      }
    }
    if (matchAj < 0) continue
    anchors.push({ beforeIndex: bi, afterIndex: matchAj })
    minAfter = matchAj + 1
  }
  anchors.push({ beforeIndex: beforeBlocks.length, afterIndex: afterBlocks.length })

  const ops: BlockOp[] = []
  for (let a = 0; a < anchors.length - 1; a += 1) {
    const start = anchors[a]
    const end = anchors[a + 1]

    const beforeSlice = beforeBlocks.slice(start.beforeIndex + 1, end.beforeIndex)
    const afterSlice = afterBlocks.slice(start.afterIndex + 1, end.afterIndex)
    const beforeSlicePlain = beforePlain.slice(start.beforeIndex + 1, end.beforeIndex)
    const afterSlicePlain = afterPlain.slice(start.afterIndex + 1, end.afterIndex)
    ops.push(...lcsBlockOps(beforeSlice, afterSlice, beforeSlicePlain, afterSlicePlain))

    if (end.beforeIndex < beforeBlocks.length && end.afterIndex < afterBlocks.length) {
      // Matched heading anchor — treat as unchanged (or inline edit if text drifted).
      const beforeHeading = beforeBlocks[end.beforeIndex]
      const afterHeading = afterBlocks[end.afterIndex]
      if (normalizeBlockPlain(beforeHeading) === normalizeBlockPlain(afterHeading)) {
        ops.push({ type: "unchanged", after: afterHeading })
      } else {
        ops.push({ type: "removed", before: beforeHeading })
        ops.push({ type: "added", after: afterHeading })
      }
    }
  }

  return ops
}

function lcsBlockOps(
  beforeBlocks: string[],
  afterBlocks: string[],
  beforePlain: string[],
  afterPlain: string[],
): BlockOp[] {
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
    // Prefer pairing near-identical same-kind blocks as a change rather than
    // delete+insert of unrelated neighbors. Never pair a heading with a body block.
    const beforeIsHeading = isHeadingBlock(beforeBlocks[i])
    const afterIsHeading = isHeadingBlock(afterBlocks[j])
    const similarity = blockSimilarity(beforeBlocks[i], afterBlocks[j])
    if (
      beforeIsHeading === afterIsHeading
      && (
        (beforeIsHeading && similarity >= 0.85)
        || (!beforeIsHeading && similarity >= 0.94)
      )
    ) {
      ops.push({ type: "removed", before: beforeBlocks[i] })
      ops.push({ type: "added", after: afterBlocks[j] })
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
  return ops
}

function emitChangedBlock(beforeBlock: string, afterBlock: string): string {
  const beforePlain = plainFromHtml(beforeBlock)
  const afterPlain = plainFromHtml(afterBlock)
  if (!beforePlain && !afterPlain) return afterBlock || beforeBlock
  if (beforePlain === afterPlain) return afterBlock
  // Formatting-only churn (entities, punctuation, whitespace) — keep after, no marks.
  if (normalizeBlockPlain(beforeBlock) === normalizeBlockPlain(afterBlock)) {
    return afterBlock
  }

  const tokens = computeWordDiff(beforePlain, afterPlain)
  const hasShared = tokens.some((token) => token.type === "unchanged")
  const tag = outerTagName(afterBlock || beforeBlock)
  const similarity = blockSimilarity(beforePlain, afterPlain)

  // Near-identical blocks should never become full red+green replacements —
  // that created false "SEO Meta Title…" removal cards for unchanged copy.
  if (similarity >= 0.9 && hasShared) {
    return `<${tag === "table" || tag === "ul" || tag === "ol" || tag === "figure" || tag === "hr" ? "div" : tag} class="artifact-diff-inline">${tokensToHtml(tokens)}</${tag === "table" || tag === "ul" || tag === "ol" || tag === "figure" || tag === "hr" ? "div" : tag}>`
  }

  if (
    tag === "ul"
    || tag === "ol"
    || tag === "table"
    || tag === "figure"
    || tag === "hr"
    || !hasShared
  ) {
    if (similarity >= 0.92) {
      // Still essentially the same block — show after without a false delete card.
      return afterBlock
    }
    return [
      beforeBlock ? wrapBlockWithClass(beforeBlock, "artifact-diff-block-del") : "",
      afterBlock ? wrapBlockWithClass(afterBlock, "artifact-diff-block-ins") : "",
    ]
      .filter(Boolean)
      .join("")
  }

  return `<${tag} class="artifact-diff-inline">${tokensToHtml(tokens)}</${tag}>`
}

function blockSimilarity(a: string, b: string): number {
  const left = normalizeBlockPlain(a)
  const right = normalizeBlockPlain(b)
  if (!left && !right) return 1
  if (!left || !right) return 0
  if (left === right) return 1
  const leftTokens = new Set(left.split(" ").filter(Boolean))
  const rightTokens = new Set(right.split(" ").filter(Boolean))
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0
  let shared = 0
  for (const token of leftTokens) {
    if (rightTokens.has(token)) shared += 1
  }
  return (2 * shared) / (leftTokens.size + rightTokens.size)
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
  const ops = alignBlocksWithHeadingAnchors(beforeBlocks, afterBlocks)

  const out: string[] = []
  for (let index = 0; index < ops.length; index += 1) {
    const current = ops[index]
    const next = ops[index + 1]
    if (current.type === "unchanged") {
      if (!changedOnly) out.push(current.after)
      continue
    }
    if (current.type === "removed" && next?.type === "added") {
      // Identical heading that survived reordering — never paint as delete+insert.
      if (
        isHeadingBlock(current.before)
        && isHeadingBlock(next.after)
        && normalizeBlockPlain(current.before) === normalizeBlockPlain(next.after)
      ) {
        if (!changedOnly) out.push(next.after)
        index += 1
        continue
      }
      out.push(emitChangedBlock(current.before, next.after))
      index += 1
      continue
    }
    if (current.type === "removed") {
      // Heading text still present later in after → LCS noise, skip the false delete.
      if (
        isHeadingBlock(current.before)
        && afterBlocks.some(
          (block) => normalizeBlockPlain(block) === normalizeBlockPlain(current.before),
        )
      ) {
        continue
      }
      out.push(wrapBlockWithClass(current.before, "artifact-diff-block-del"))
      continue
    }
    if (
      isHeadingBlock(current.after)
      && beforeBlocks.some(
        (block) => normalizeBlockPlain(block) === normalizeBlockPlain(current.after),
      )
    ) {
      if (!changedOnly) out.push(current.after)
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

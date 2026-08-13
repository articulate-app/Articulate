import { getMentionChipClassName } from "./mention-chip-styles"
import { ARTIFACT_FILE_CHIP_CLASS, artifactDocumentGlyphHtml } from "./artifact-context-chip-html"

export type AiTagType =
  | "project"
  | "task"
  | "user"
  | "component"
  | "channel"
  | "task_channel"
  | "task_component"
  | "artifact"
  | "source"
  | "brand_template"
export type AiTagSource = "mention" | "selection"

export type AiContextTag = {
  type: AiTagType
  id: number | string
  label: string
  source: AiTagSource
  color?: string | null
  logo?: string | null
  projectName?: string | null
  email?: string | null
  /** task_channel / task_component — structured ids for ai-chat (not inferred from label text). */
  taskId?: number
  taskTitle?: string | null
  channelId?: number
  channelName?: string | null
  componentId?: string
  componentTitle?: string | null
  taskComponentOutputId?: string | null
  /** artifact tag — factual context only; does not grant write authority. */
  artifactId?: string
  artifactVersionNumber?: number | null
  artifactTitle?: string | null
  projectId?: number | null
  /** source tag — factual input context only; does not grant write/attach/delete. */
  sourceId?: string
  sourceTitle?: string | null
  /** brand layout template from project Brand kit — factual layout reference. */
  brandTemplateId?: string
  brandTemplateTitle?: string | null
  /** When set, this tag may drive ai-chat write scope (maps to context_source). */
  contextSource?: string | null
}

export type AiMessageSegment =
  | { type: "text"; text: string }
  | { type: "mention"; tag: AiContextTag }

type WalkPiece =
  | { kind: "text"; node: Text; len: number }
  | { kind: "chip"; el: HTMLElement; len: number }

function flattenEditor(root: HTMLElement): WalkPiece[] {
  const out: WalkPiece[] = []
  const walk = (n: Node) => {
    if (n.nodeType === Node.TEXT_NODE) {
      const t = n as Text
      const len = t.length
      if (len > 0) out.push({ kind: "text", node: t, len })
      return
    }
    if (n.nodeType === Node.ELEMENT_NODE) {
      const el = n as HTMLElement
      if (el.dataset.aiTag === "1") {
        const len = (el.textContent ?? "").length
        out.push({ kind: "chip", el, len: Math.max(len, 1) })
        return
      }
      for (const c of Array.from(el.childNodes)) walk(c)
    }
  }
  walk(root)
  return out
}

export function getTextBeforeSelection(root: HTMLElement): string {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return root.innerText
  const range = sel.getRangeAt(0)
  if (!root.contains(range.commonAncestorContainer)) return root.innerText
  const pre = range.cloneRange()
  pre.selectNodeContents(root)
  pre.setEnd(range.startContainer, range.startOffset)
  return pre.toString()
}

export type AiMentionTrigger = "@" | "#"

/**
 * Active mention segment at the caret: the last `@` (tasks/users/projects/components) or `#`
 * (channels) in the plain text before the selection — whichever is closest to the caret — with a
 * valid boundary before the trigger (start, whitespace, punctuation, or chip remove "×") so a
 * second mention after an inline chip still matches.
 */
export function parseActiveMentionAtCaret(
  textBefore: string,
): { query: string; startPlainOffset: number; trigger: AiMentionTrigger } | null {
  const atIdx = textBefore.lastIndexOf("@")
  const hashIdx = textBefore.lastIndexOf("#")
  const triggerIdx = Math.max(atIdx, hashIdx)
  if (triggerIdx < 0) return null
  const trigger: AiMentionTrigger = triggerIdx === hashIdx ? "#" : "@"
  const prev = triggerIdx === 0 ? null : textBefore[triggerIdx - 1]
  const validBefore =
    triggerIdx === 0 ||
    (prev !== null &&
      (/\s/.test(prev) ||
        prev === "×" ||
        prev === "\u00d7" ||
        /[^A-Za-z0-9_]/.test(prev)))
  if (!validBefore) return null
  const tail = textBefore.slice(triggerIdx + 1)
  if (/[\s\n\r]/.test(tail)) return null
  return { query: tail, startPlainOffset: triggerIdx, trigger }
}

export function getPlainTextLength(root: HTMLElement): number {
  return flattenEditor(root).reduce((acc, p) => acc + p.len, 0)
}

function pointAtPlainOffset(root: HTMLElement, offset: number): { container: Node; offset: number } | null {
  const pieces = flattenEditor(root)
  if (pieces.length === 0) return { container: root, offset: 0 }

  let pos = 0
  for (let i = 0; i < pieces.length; i += 1) {
    const p = pieces[i]
    const end = pos + p.len

    if (offset < end || (offset === end && p.kind === "text")) {
      if (p.kind === "text") {
        return { container: p.node, offset: Math.min(Math.max(0, offset - pos), p.len) }
      }
      const parent = p.el.parentNode
      if (!parent) return null
      const idx = Array.prototype.indexOf.call(parent.childNodes, p.el)
      if (offset <= pos) return { container: parent, offset: idx }
      return { container: parent, offset: idx + 1 }
    }

    if (offset === end && p.kind === "chip" && i === pieces.length - 1) {
      const parent = p.el.parentNode
      if (!parent) return null
      const idx = Array.prototype.indexOf.call(parent.childNodes, p.el)
      return { container: parent, offset: idx + 1 }
    }

    pos = end
  }

  const last = pieces[pieces.length - 1]
  if (last.kind === "text") {
    return { container: last.node, offset: last.len }
  }
  const parent = last.el.parentNode
  if (!parent) return null
  const idx = Array.prototype.indexOf.call(parent.childNodes, last.el)
  return { container: parent, offset: idx + 1 }
}

export function replacePlainTextRangeWithChip(
  root: HTMLElement,
  startOffset: number,
  endOffset: number,
  chip: HTMLElement
): boolean {
  const start = pointAtPlainOffset(root, startOffset)
  const end = pointAtPlainOffset(root, endOffset)
  if (!start || !end) return false
  const r = document.createRange()
  try {
    r.setStart(start.container, start.offset)
    r.setEnd(end.container, end.offset)
  } catch {
    return false
  }
  r.deleteContents()
  r.insertNode(chip)
  const sel = window.getSelection()
  if (sel) {
    const after = document.createRange()
    after.setStartAfter(chip)
    after.collapse(true)
    sel.removeAllRanges()
    sel.addRange(after)
  }
  return true
}

export function insertPlainTextAtCaret(root: HTMLElement, text: string) {
  const sel = window.getSelection()
  if (!sel?.rangeCount) {
    root.appendChild(document.createTextNode(text))
    focusEnd(root)
    return
  }
  const r = sel.getRangeAt(0)
  if (!root.contains(r.commonAncestorContainer)) {
    root.appendChild(document.createTextNode(text))
    focusEnd(root)
    return
  }
  r.deleteContents()
  const node = document.createTextNode(text)
  r.insertNode(node)
  const after = document.createRange()
  after.setStart(node, node.length)
  after.collapse(true)
  sel.removeAllRanges()
  sel.addRange(after)
}

/** Insert an arbitrary node (e.g. a tag chip) at the caret and place the caret right after it. */
export function insertNodeAtCaret(root: HTMLElement, node: Node) {
  const sel = window.getSelection()
  if (!sel?.rangeCount) {
    root.appendChild(node)
    focusEnd(root)
    return
  }
  const r = sel.getRangeAt(0)
  if (!root.contains(r.commonAncestorContainer)) {
    root.appendChild(node)
    focusEnd(root)
    return
  }
  r.deleteContents()
  r.insertNode(node)
  const after = document.createRange()
  after.setStartAfter(node)
  after.collapse(true)
  sel.removeAllRanges()
  sel.addRange(after)
}

export function insertPlainTextWithLineBreaksAtCaret(root: HTMLElement, text: string) {
  const lines = text.split(/\r?\n/)
  const sel = window.getSelection()
  if (!sel?.rangeCount) {
    appendPlainTextWithLineBreaks(root, lines)
    focusEnd(root)
    return
  }
  const range = sel.getRangeAt(0)
  if (!root.contains(range.commonAncestorContainer)) {
    appendPlainTextWithLineBreaks(root, lines)
    focusEnd(root)
    return
  }
  range.deleteContents()
  for (let index = 0; index < lines.length; index += 1) {
    if (index > 0) {
      const br = document.createElement("br")
      range.insertNode(br)
      range.setStartAfter(br)
      range.collapse(true)
    }
    if (lines[index].length > 0) {
      const node = document.createTextNode(lines[index])
      range.insertNode(node)
      range.setStartAfter(node)
      range.collapse(true)
    }
  }
  sel.removeAllRanges()
  sel.addRange(range)
}

function appendPlainTextWithLineBreaks(root: HTMLElement, lines: string[]) {
  for (let index = 0; index < lines.length; index += 1) {
    if (index > 0) root.appendChild(document.createElement("br"))
    if (lines[index].length > 0) root.appendChild(document.createTextNode(lines[index]))
  }
}

/** Stable uniqueness key for composer tokens — used when inserting and syncing selection chips. */
export function composerTagDedupeKey(tag: AiContextTag): string {
  if (tag.type === "task") return `task:${tag.taskId ?? tag.id}`
  if (tag.type === "channel") return `channel:${tag.channelId ?? tag.id}`
  if (tag.type === "task_component") {
    return `component:${tag.taskId}:${tag.channelId}:${tag.componentId ?? tag.id}`
  }
  if (tag.type === "task_channel") return `task_channel:${tag.taskId}:${tag.channelId}`
  return `${tag.type}:${tag.id}`
}

export function chipDisplayText(tag: AiContextTag): string {
  if (tag.type === "project") return tag.label
  // Standalone channel chip — short, prefixed with `#` (e.g. `#Blog`).
  if (tag.type === "channel") {
    const name = (tag.channelName ?? tag.label).trim()
    return `#${name}`
  }
  // Legacy combined task+channel tag. New composer flows emit separate task + channel chips
  // instead, but historical messages may still carry this combined label — keep rendering it.
  if (tag.type === "task_channel") {
    const t = (tag.taskTitle ?? tag.label).trim()
    const c = (tag.channelName ?? "").trim()
    return c ? `@${t} / ${c}` : `@${t}`
  }
  // Component chip — short, only the component title (e.g. `@Introduction`). The task/channel
  // scope travels via separate chips + structured refs, never as one long combined label.
  if (tag.type === "task_component") {
    const co = (tag.componentTitle ?? tag.label).trim()
    return `@${co || tag.label}`
  }
  if (tag.type === "artifact") {
    const title = (tag.artifactTitle ?? tag.label).trim()
    return `@${title || "Artifact"}`
  }
  if (tag.type === "source") {
    const title = (tag.sourceTitle ?? tag.label).trim()
    return `@${title || "Source"}`
  }
  if (tag.type === "brand_template") {
    const title = (tag.brandTemplateTitle ?? tag.label).trim()
    return `@${title || "Template"}`
  }
  return `@${tag.label}`
}

/** Full, untruncated hover text for a chip — chips visually truncate, so this reveals the whole reference. */
export function chipTooltipText(tag: AiContextTag): string {
  const clean = (value: string | null | undefined): string => (value ?? "").trim()
  const lines: string[] = []

  if (tag.type === "channel") {
    const channel = clean(tag.channelName) || clean(tag.label)
    if (channel) lines.push(`Channel: ${channel}`)
    if (clean(tag.taskTitle)) lines.push(`Task: ${clean(tag.taskTitle)}`)
  } else if (tag.type === "task_channel") {
    const task = clean(tag.taskTitle) || clean(tag.label)
    if (task) lines.push(`Task: ${task}`)
    if (clean(tag.channelName)) lines.push(`Channel: ${clean(tag.channelName)}`)
  } else if (tag.type === "task_component") {
    if (clean(tag.taskTitle)) lines.push(`Task: ${clean(tag.taskTitle)}`)
    if (clean(tag.channelName)) lines.push(`Channel: ${clean(tag.channelName)}`)
    const component = clean(tag.componentTitle) || clean(tag.label)
    if (component) lines.push(`Component: ${component}`)
  } else if (tag.type === "task") {
    lines.push(`Task: ${clean(tag.label)}`)
    if (clean(tag.projectName)) lines.push(`Project: ${clean(tag.projectName)}`)
  } else if (tag.type === "project") {
    lines.push(`Project: ${clean(tag.label)}`)
  } else if (tag.type === "user") {
    lines.push(clean(tag.label))
    if (clean(tag.email) && clean(tag.email) !== clean(tag.label)) lines.push(clean(tag.email))
  } else if (tag.type === "artifact") {
    lines.push(`Artifact: ${clean(tag.artifactTitle) || clean(tag.label)}`)
    if (tag.artifactVersionNumber != null) lines.push(`Version: ${tag.artifactVersionNumber}`)
    if (tag.taskId != null) lines.push(`Task: ${tag.taskId}`)
    if (tag.projectId != null) lines.push(`Project: ${tag.projectId}`)
  } else if (tag.type === "source") {
    lines.push(`Source: ${clean(tag.sourceTitle) || clean(tag.label)}`)
    if (tag.taskId != null) lines.push(`Task: ${tag.taskId}`)
    if (tag.projectId != null) lines.push(`Project: ${tag.projectId}`)
  } else if (tag.type === "brand_template") {
    lines.push(`Brand template: ${clean(tag.brandTemplateTitle) || clean(tag.label)}`)
    if (tag.projectId != null) lines.push(`Project: ${tag.projectId}`)
  } else {
    lines.push(clean(tag.label))
  }

  return lines.filter(Boolean).join("\n") || chipDisplayText(tag).replace(/^@/, "")
}

export function createTagChip(tag: AiContextTag): HTMLSpanElement {
  const outer = document.createElement("span")
  outer.setAttribute("data-ai-tag", "1")
  outer.setAttribute("data-tag-type", tag.type)
  outer.setAttribute("data-tag-id", String(tag.id))
  outer.setAttribute("data-tag-source", tag.source)
  outer.setAttribute("data-tag-label", tag.label)
  if (tag.color) outer.setAttribute("data-tag-color", tag.color)
  if (tag.logo) outer.setAttribute("data-tag-logo", tag.logo)
  if (tag.projectName) outer.setAttribute("data-tag-project-name", tag.projectName)
  if (tag.email) outer.setAttribute("data-tag-email", tag.email)
  if (tag.taskId != null) outer.setAttribute("data-task-id", String(tag.taskId))
  if (tag.taskTitle) outer.setAttribute("data-task-title", tag.taskTitle)
  if (tag.channelId != null) outer.setAttribute("data-channel-id", String(tag.channelId))
  if (tag.channelName) outer.setAttribute("data-channel-name", tag.channelName)
  if (tag.componentId) outer.setAttribute("data-component-id", tag.componentId)
  if (tag.componentTitle) outer.setAttribute("data-component-title", tag.componentTitle)
  if (tag.taskComponentOutputId) outer.setAttribute("data-task-component-output-id", tag.taskComponentOutputId)
  if (tag.artifactId) outer.setAttribute("data-artifact-id", tag.artifactId)
  if (tag.artifactVersionNumber != null) {
    outer.setAttribute("data-artifact-version-number", String(tag.artifactVersionNumber))
  }
  if (tag.artifactTitle) outer.setAttribute("data-artifact-title", tag.artifactTitle)
  if (tag.sourceId) outer.setAttribute("data-source-id", tag.sourceId)
  if (tag.sourceTitle) outer.setAttribute("data-source-title", tag.sourceTitle)
  if (tag.brandTemplateId) outer.setAttribute("data-brand-template-id", tag.brandTemplateId)
  if (tag.brandTemplateTitle) outer.setAttribute("data-brand-template-title", tag.brandTemplateTitle)
  if (tag.projectId != null) outer.setAttribute("data-project-id", String(tag.projectId))
  if (tag.contextSource) outer.setAttribute("data-tag-context-source", tag.contextSource)

  outer.contentEditable = "false"
  if (tag.type === "artifact") {
    const title = (tag.artifactTitle ?? tag.label).trim() || "Artifact"
    outer.className = `${ARTIFACT_FILE_CHIP_CLASS} align-middle`
    outer.title = chipTooltipText(tag)

    const iconHost = document.createElement("span")
    iconHost.innerHTML = artifactDocumentGlyphHtml()
    const icon = iconHost.firstElementChild
    if (icon) outer.appendChild(icon)

    const textCol = document.createElement("span")
    textCol.className = "min-w-0 flex-1 py-0.5"

    const titleEl = document.createElement("span")
    titleEl.className = "block truncate text-[13px] font-medium leading-tight text-gray-900"
    titleEl.textContent = title

    const subtitleEl = document.createElement("span")
    subtitleEl.className = "mt-0.5 block truncate text-[12px] font-normal leading-tight text-gray-500"
    subtitleEl.textContent = "Artifact"

    textCol.appendChild(titleEl)
    textCol.appendChild(subtitleEl)
    outer.appendChild(textCol)

    const removeBtn = document.createElement("button")
    removeBtn.type = "button"
    removeBtn.setAttribute("data-ai-tag-remove", "1")
    removeBtn.setAttribute("aria-label", "Remove tag")
    removeBtn.className =
      "ml-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700"
    removeBtn.textContent = "×"
    removeBtn.contentEditable = "false"
    removeBtn.tabIndex = -1
    outer.appendChild(removeBtn)
    return outer
  }

  outer.className = getMentionChipClassName(tag)
  outer.title = chipTooltipText(tag)

  const labelEl = document.createElement("span")
  labelEl.className = "min-w-0 truncate whitespace-nowrap text-left"
  labelEl.textContent = chipDisplayText(tag)

  const removeBtn = document.createElement("button")
  removeBtn.type = "button"
  removeBtn.setAttribute("data-ai-tag-remove", "1")
  removeBtn.setAttribute("aria-label", "Remove tag")
  removeBtn.className =
    "inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-base leading-none text-gray-500 hover:bg-gray-200/90 hover:text-gray-800"
  removeBtn.textContent = "×"
  removeBtn.contentEditable = "false"
  removeBtn.tabIndex = -1

  outer.appendChild(labelEl)
  outer.appendChild(removeBtn)
  return outer
}

export function readTagFromChip(el: HTMLElement): AiContextTag | null {
  if (el.dataset.aiTag !== "1") return null
  const type = el.dataset.tagType as AiTagType
  const idRaw = el.dataset.tagId ?? ""
  const source = (el.dataset.tagSource as AiTagSource) || "mention"
  const label = el.dataset.tagLabel ?? ""
  if (!type || !idRaw) return null
  const id =
    type === "task" || type === "project" || type === "user"
      ? Number.isFinite(Number(idRaw))
        ? Number(idRaw)
        : idRaw
      : idRaw
  const taskIdRaw = el.dataset.taskId
  const channelIdRaw = el.dataset.channelId
  const base: AiContextTag = {
    type,
    id,
    label,
    source,
    color: el.dataset.tagColor ?? null,
    logo: el.dataset.tagLogo ?? null,
    projectName: el.dataset.tagProjectName ?? null,
    email: el.dataset.tagEmail ?? null,
  }
  if (taskIdRaw != null && taskIdRaw !== "") {
    const tid = Number(taskIdRaw)
    if (Number.isFinite(tid)) base.taskId = tid
  }
  if (el.dataset.taskTitle) base.taskTitle = el.dataset.taskTitle
  if (channelIdRaw != null && channelIdRaw !== "") {
    const cid = Number(channelIdRaw)
    if (Number.isFinite(cid)) base.channelId = cid
  }
  if (el.dataset.channelName) base.channelName = el.dataset.channelName
  if (el.dataset.componentId) base.componentId = el.dataset.componentId
  if (el.dataset.componentTitle) base.componentTitle = el.dataset.componentTitle
  if (el.dataset.taskComponentOutputId) base.taskComponentOutputId = el.dataset.taskComponentOutputId
  if (el.dataset.artifactId) base.artifactId = el.dataset.artifactId
  if (el.dataset.artifactVersionNumber) {
    const version = Number(el.dataset.artifactVersionNumber)
    if (Number.isFinite(version)) base.artifactVersionNumber = version
  }
  if (el.dataset.artifactTitle) base.artifactTitle = el.dataset.artifactTitle
  if (el.dataset.sourceId) base.sourceId = el.dataset.sourceId
  if (el.dataset.sourceTitle) base.sourceTitle = el.dataset.sourceTitle
  if (el.dataset.brandTemplateId) base.brandTemplateId = el.dataset.brandTemplateId
  if (el.dataset.brandTemplateTitle) base.brandTemplateTitle = el.dataset.brandTemplateTitle
  if (el.dataset.projectId) {
    const projectId = Number(el.dataset.projectId)
    if (Number.isFinite(projectId)) base.projectId = projectId
  }
  if (type === "artifact") {
    base.artifactId = base.artifactId ?? String(id)
  }
  if (type === "source") {
    base.sourceId = base.sourceId ?? String(id)
  }
  if (type === "brand_template") {
    base.brandTemplateId = base.brandTemplateId ?? String(id)
  }
  if (el.dataset.tagContextSource) base.contextSource = el.dataset.tagContextSource
  return base
}

export function serializeComposerEditor(root: HTMLElement): {
  messageText: string
  tags: AiContextTag[]
  segments: AiMessageSegment[]
} {
  const tags: AiContextTag[] = []
  const segments: AiMessageSegment[] = []
  let messageText = ""
  let textBuffer = ""

  const flushText = () => {
    if (!textBuffer) return
    segments.push({ type: "text", text: textBuffer })
    textBuffer = ""
  }

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const value = node.textContent ?? ""
      messageText += value
      textBuffer += value
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const el = node as HTMLElement
    if (el.tagName === "BR") {
      messageText += "\n"
      textBuffer += "\n"
      return
    }
    // Highlighted-text chip is visual-only context (carried via the store as selected_text_context);
    // it must never leak into the typed instruction or become a tag.
    if (el.dataset.aiSelectionChip === "1") {
      return
    }
    if (el.dataset.aiTag === "1") {
      const parsed = readTagFromChip(el)
      if (parsed) {
        flushText()
        tags.push(parsed)
        messageText += chipDisplayText(parsed)
        segments.push({ type: "mention", tag: parsed })
      }
      return
    }
    for (const child of Array.from(node.childNodes)) walk(child)
  }

  walk(root)
  flushText()

  const trimmedMessage = messageText.replace(/\u200b/g, "").trim()
  const trimmedSegments = trimSerializedSegments(segments)

  return {
    messageText: trimmedMessage,
    tags,
    segments: trimmedSegments,
  }
}

function trimSerializedSegments(segments: AiMessageSegment[]): AiMessageSegment[] {
  const next = [...segments]
  while (next.length > 0 && next[0]?.type === "text") {
    const first = next[0]
    if (first.type !== "text") break
    const trimmed = first.text.replace(/^\s+/, "")
    if (!trimmed) {
      next.shift()
      continue
    }
    next[0] = { type: "text", text: trimmed }
    break
  }
  while (next.length > 0 && next[next.length - 1]?.type === "text") {
    const lastIndex = next.length - 1
    const last = next[lastIndex]
    if (last.type !== "text") break
    const trimmed = last.text.replace(/\s+$/, "")
    if (!trimmed) {
      next.pop()
      continue
    }
    next[lastIndex] = { type: "text", text: trimmed }
    break
  }
  return next
}

export function clearComposerEditor(root: HTMLElement) {
  root.innerHTML = ""
}

export function setComposerPlainText(root: HTMLElement, value: string) {
  clearComposerEditor(root)
  if (!value) return
  root.appendChild(document.createTextNode(value))
}

export function focusEnd(root: HTMLElement) {
  root.focus()
  const range = document.createRange()
  range.selectNodeContents(root)
  range.collapse(false)
  const sel = window.getSelection()
  if (sel) {
    sel.removeAllRanges()
    sel.addRange(range)
  }
}

export function findSelectionChip(root: HTMLElement): HTMLElement | null {
  return root.querySelector('[data-ai-tag="1"][data-tag-source="selection"]')
}

export function findSelectionChips(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-ai-tag="1"][data-tag-source="selection"]'))
}

export function ensureSelectionChip(root: HTMLElement, tag: AiContextTag | null) {
  ensureSelectionChips(root, tag ? [tag] : null)
}

/**
 * Sync the composer's context-selection chips. A component selection renders as separate short
 * chips (task, channel, component) rather than one long combined label. All chips are marked
 * `data-tag-source="selection"` so they are replaced/removed together as context changes.
 */
export function ensureSelectionChips(root: HTMLElement, tags: AiContextTag[] | null) {
  const existing = findSelectionChips(root)
  // Remove old selection chips (and any whitespace-only text node immediately before them).
  for (const chip of existing) {
    const prev = chip.previousSibling
    chip.remove()
    if (prev && prev.nodeType === Node.TEXT_NODE && (prev.textContent ?? "").trim() === "") {
      prev.parentNode?.removeChild(prev)
    }
  }
  if (!tags || tags.length === 0) return

  // A component click implies task + channel + component, but skip tokens already present
  // as @/# mention chips so the composer never shows duplicate task/channel tags.
  const { tags: remainingTags } = serializeComposerEditor(root)
  const seenKeys = new Set(remainingTags.map(composerTagDedupeKey))

  for (const tag of tags) {
    const key = composerTagDedupeKey(tag)
    if (seenKeys.has(key)) continue
    seenKeys.add(key)
    root.appendChild(document.createTextNode(" "))
    root.appendChild(createTagChip(tag))
  }
}

/**
 * Inline chip for "Add to chat" highlighted text. Styled like an @-mention chip but marked with
 * `data-ai-selection-chip` so it is excluded from serialization (its payload travels as
 * `selected_text_context`). Shows only the selected words; full source is on hover.
 */
export function createTextSelectionChip(text: string, tooltip: string): HTMLSpanElement {
  const outer = document.createElement("span")
  outer.setAttribute("data-ai-selection-chip", "1")
  outer.contentEditable = "false"
  outer.className = getMentionChipClassName({ type: "task_component" })
  outer.title = tooltip

  const labelEl = document.createElement("span")
  labelEl.className = "min-w-0 flex-1 truncate whitespace-nowrap text-left"
  labelEl.textContent = text

  const removeBtn = document.createElement("button")
  removeBtn.type = "button"
  removeBtn.setAttribute("data-ai-selection-chip-remove", "1")
  removeBtn.setAttribute("aria-label", "Remove selected text")
  removeBtn.className =
    "inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-base leading-none text-gray-500 hover:bg-gray-200/90 hover:text-gray-800"
  removeBtn.textContent = "×"
  removeBtn.contentEditable = "false"
  removeBtn.tabIndex = -1

  outer.appendChild(labelEl)
  outer.appendChild(removeBtn)
  return outer
}

export function findTextSelectionChip(root: HTMLElement): HTMLElement | null {
  return root.querySelector('[data-ai-selection-chip="1"]')
}

/** Sync the highlighted-text chip at the very top of the composer input. */
export function ensureTextSelectionChip(
  root: HTMLElement,
  data: { text: string; tooltip: string } | null,
) {
  const existing = findTextSelectionChip(root)
  if (!data) {
    // Also drop a trailing space we may have inserted right after the chip.
    const trailing = existing?.nextSibling
    existing?.remove()
    if (trailing && trailing.nodeType === Node.TEXT_NODE && (trailing.textContent ?? "").trim() === "") {
      trailing.parentNode?.removeChild(trailing)
    }
    return
  }
  const next = createTextSelectionChip(data.text, data.tooltip)
  if (existing) {
    existing.replaceWith(next)
    return
  }
  if (root.firstChild) {
    root.insertBefore(next, root.firstChild)
    root.insertBefore(document.createTextNode(" "), next.nextSibling)
  } else {
    root.appendChild(next)
    root.appendChild(document.createTextNode(" "))
  }
}

export function getCaretClientRect(root: HTMLElement): { left: number; top: number } | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  const range = sel.getRangeAt(0)
  if (!root.contains(range.commonAncestorContainer)) return null
  const rects = range.getClientRects()
  if (rects.length > 0) {
    const r = rects[rects.length - 1]
    return { left: r.left, top: r.top }
  }
  const br = range.getBoundingClientRect()
  if (br.width === 0 && br.height === 0) return null
  return { left: br.left, top: br.top }
}

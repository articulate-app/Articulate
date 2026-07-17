import { normalizeComponentOutputToHtml, normalizeMixedRichText, sanitizeComponentOutputHtml } from "../../../app/lib/rich-text-normalization"
import {
  cleanClipboardHtml,
  htmlToExportStructuredNodes,
  htmlToSemanticExportHtml,
  renderStructuredNodesToClipboardHtml,
  wrapHtmlForClipboardPaste,
  type ClipboardCopyTarget,
  type ExportStructuredNode,
} from "./task-content-export-html"
import {
  clipboardSupportsRtfPayload,
  structuredNodesToRtfDocument,
} from "./task-content-export-rtf"
import type {
  TaskChannelBootstrapComponentRow,
  TaskChannelBootstrapComposedOutputRow,
  TaskChannelBootstrapResponse,
  TaskChannelBootstrapSeo,
} from "../../../app/lib/types/task-channel-bootstrap"
import {
  normalizeTaskComponentOutputAttachments,
  type TaskComponentOutputAttachment,
} from "../../../app/lib/types/task-component-output"

export const MAIN_BRIEFING_COMPONENT_ID = 80

export type ExportOutputBlock =
  | { type: "paragraph"; text: string }
  | {
      type: "attachment"
      attachment_id: string
      width_pct?: number
      attachment?: TaskComponentOutputAttachment | null
      signed_url?: string | null
      public_url?: string | null
      file_path?: string | null
      mime_type?: string | null
      media_type?: string | null
      alt_text?: string | null
      caption?: string | null
    }

export type ExportComponentOutput = {
  content?: ExportOutputBlock[] | null
  resolved_content_json?: ExportOutputBlock[] | null
  content_json?: ExportOutputBlock[] | null
  content_text?: string | null
  attachment_map?: Record<string, TaskComponentOutputAttachment> | null
  attachments?: TaskComponentOutputAttachment[]
}

export type TaskDocxExportComponent = {
  id: string
  title: string
  type: string | null
  html: string
  clipboardHtml: string
  plainText: string
  contentJson: ExportOutputBlock[]
  hasContent: boolean
  assets: TaskComponentOutputAttachment[]
}

export type TaskDocxExportKeywordRow = {
  keyword: string
  isPrimary: boolean
  searchVolume: number | null
  competition: number | null
}

export type TaskDocxExportSeo = {
  primaryKeyword: string | null
  secondaryKeywords: string[]
  metaTitle: string | null
  metaDescription: string | null
  keyword: string | null
  slug: string | null
  seoRequired: boolean | null
  keywordRows: TaskDocxExportKeywordRow[]
}

export type ComponentRenderOptions = {
  /** When true, prepends the internal UI component label to exported content. Default false. */
  includeComponentLabel?: boolean
  /** Clipboard paste target. Default wordpress (semantic HTML for Gutenberg). */
  clipboardTarget?: ClipboardCopyTarget
}

export const DEFAULT_DOCX_RENDER_OPTIONS: ComponentRenderOptions = {
  includeComponentLabel: false,
}

export const DEFAULT_CLIPBOARD_RENDER_OPTIONS: ComponentRenderOptions = {
  includeComponentLabel: false,
  clipboardTarget: "wordpress",
}

export type TaskDocxExportChannel = {
  channelId: number
  channelName: string
  components: TaskDocxExportComponent[]
  seo: TaskDocxExportSeo | null
}

export type TaskDocxExportModel = {
  taskTitle: string
  contentTypeTitle: string | null
  channels: TaskDocxExportChannel[]
}

export type TaskDocxExportLiveOverrides = {
  componentOutputs?: Map<string, ExportComponentOutput>
  outputTextByKey?: Map<string, string>
  outputJsonByKey?: Map<string, ExportOutputBlock[]>
  inFlightGenerations?: Map<string, { previewBlocks?: ExportOutputBlock[] | null; previewText?: string }>
  finalPreviews?: Map<string, { blocks: ExportOutputBlock[] }>
}

export type TaskDocxExportTaskMeta = {
  contentTypeTitle?: string | null
  metaTitle?: string | null
  metaDescription?: string | null
  keyword?: string | null
  slug?: string | null
}

type ExportComponentRow = {
  task_component_id: string | null
  briefing_component_id: number | null
  project_component_id?: number | null
  title: string
  custom_title?: string | null
  selected: boolean
  position: number | null
  kind?: string | null
}

function getOutputMapKeyFromTaskComponentId(taskComponentId: string): string {
  return `t:${taskComponentId}`
}

function getOutputMapKeyFromBriefingId(briefingComponentId: number): string {
  return `briefing:${briefingComponentId}`
}

function getStableComponentId(component: Pick<ExportComponentRow, "task_component_id" | "briefing_component_id" | "project_component_id">): string {
  if (component.task_component_id) return `tc:${component.task_component_id}`
  if (typeof component.briefing_component_id === "number") return `bc:${component.briefing_component_id}`
  if (typeof component.project_component_id === "number") return `pc:${component.project_component_id}`
  return "unknown"
}

function getComponentDisplayTitle(
  component: Pick<ExportComponentRow, "custom_title" | "title">,
  composedOutputTitle?: string | null,
): string {
  return (
    component.custom_title?.trim()
    || component.title?.trim()
    || composedOutputTitle?.trim()
    || "Untitled Component"
  )
}

function normalizeOutputContentJson(value: unknown): ExportOutputBlock[] | null {
  if (!Array.isArray(value)) return null
  const blocks: ExportOutputBlock[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue
    const row = raw as Record<string, unknown>
    if (row.type === "paragraph") {
      blocks.push({ type: "paragraph", text: typeof row.text === "string" ? row.text : "" })
      continue
    }
    if (row.type === "attachment") {
      const attachmentId = typeof row.attachment_id === "string" ? row.attachment_id : ""
      if (!attachmentId) continue
      const widthPctRaw = Number(row.width_pct)
      const width_pct = Number.isFinite(widthPctRaw) ? Math.max(20, Math.min(100, widthPctRaw)) : undefined
      blocks.push({
        type: "attachment",
        attachment_id: attachmentId,
        width_pct,
        attachment: normalizeTaskComponentOutputAttachments([row.attachment])[0] ?? null,
        signed_url: typeof row.signed_url === "string" ? row.signed_url : null,
        public_url: typeof row.public_url === "string" ? row.public_url : null,
        file_path: typeof row.file_path === "string" ? row.file_path : null,
        mime_type: typeof row.mime_type === "string" ? row.mime_type : null,
        media_type: typeof row.media_type === "string" ? row.media_type : null,
        alt_text: typeof row.alt_text === "string" ? row.alt_text : null,
        caption: typeof row.caption === "string" ? row.caption : null,
      })
    }
  }
  return blocks
}

function normalizeAttachmentMap(value: unknown): Record<string, TaskComponentOutputAttachment> | null {
  if (!value || typeof value !== "object") return null
  const map: Record<string, TaskComponentOutputAttachment> = {}
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const normalized = normalizeTaskComponentOutputAttachments([raw])[0]
    if (normalized) map[key] = normalized
  }
  return Object.keys(map).length > 0 ? map : null
}

function normalizeBootstrapOutputContent(row: TaskChannelBootstrapComposedOutputRow): {
  content: ExportOutputBlock[] | null
  resolved_content_json: ExportOutputBlock[] | null
  content_json: ExportOutputBlock[] | null
} {
  const contentJsonBlocks = normalizeOutputContentJson(row.content_json)
  const resolvedBlocks = normalizeOutputContentJson(row.resolved_content_json)
  const contentBlocks = normalizeOutputContentJson(row.content)

  const hasCanonicalContent = Array.isArray(contentJsonBlocks) && contentJsonBlocks.length > 0
  if (hasCanonicalContent) {
    return {
      content: contentJsonBlocks,
      resolved_content_json: contentJsonBlocks,
      content_json: contentJsonBlocks,
    }
  }

  return {
    content: contentBlocks,
    resolved_content_json: contentBlocks ?? resolvedBlocks,
    content_json: contentJsonBlocks ?? contentBlocks,
  }
}

function extractOutputContentBlocksFromHtml(html: string): ExportOutputBlock[] {
  if (typeof DOMParser === "undefined") {
    const trimmed = (html ?? "").trim()
    return trimmed ? [{ type: "paragraph", text: trimmed }] : []
  }
  const parser = new DOMParser()
  const doc = parser.parseFromString(html || "", "text/html")
  const blocks: ExportOutputBlock[] = []
  const children = Array.from(doc.body.children)
  for (const node of children) {
    if (!(node instanceof HTMLElement)) continue
    const attachmentId = node.getAttribute("data-attachment-id")
    if (attachmentId) {
      blocks.push({ type: "attachment", attachment_id: attachmentId })
      continue
    }
    const htmlValue = node.outerHTML ?? ""
    if (htmlValue || node.tagName.toLowerCase() === "p") {
      blocks.push({ type: "paragraph", text: htmlValue })
    }
  }
  if (blocks.length === 0) {
    const fallback = doc.body.innerHTML.trim()
    if (fallback) blocks.push({ type: "paragraph", text: fallback })
  }
  return blocks
}

function resolveAttachmentForBlock(
  block: ExportOutputBlock,
  output: ExportComponentOutput,
): TaskComponentOutputAttachment | null {
  if (block.type !== "attachment") return null
  return (
    output.attachment_map?.[block.attachment_id]
    ?? output.attachments?.find((attachment) => attachment.id === block.attachment_id)
    ?? block.attachment
    ?? null
  )
}

function getOutputBlocks(output: ExportComponentOutput | null | undefined): ExportOutputBlock[] {
  if (!output) return []
  const canonical = output.content
  if (Array.isArray(canonical) && canonical.length > 0) return canonical
  const resolved = output.resolved_content_json
  if (Array.isArray(resolved) && resolved.length > 0) return resolved
  const content = output.content_json
  if (Array.isArray(content) && content.length > 0) return content
  if (output.content_text) {
    const parsedFromHtml = extractOutputContentBlocksFromHtml(output.content_text)
    if (parsedFromHtml.length > 0) return parsedFromHtml
    return [{ type: "paragraph", text: output.content_text }]
  }
  return []
}

function contentJsonLooksDegraded(blocks: ExportOutputBlock[]): boolean {
  if (blocks.length === 0) return false
  return blocks.some(
    (block) =>
      block.type === "paragraph"
      && typeof block.text === "string"
      && (block.text.includes("&lt;") || /<p>\s*#{1,6}\s/m.test(block.text)),
  )
}

function decodeContentTextEntities(contentText: string): string {
  return contentText
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
}

function countSemanticHeadingsInBlocks(blocks: ExportOutputBlock[]): number {
  let count = 0
  for (const block of blocks) {
    if (block.type !== "paragraph" || typeof block.text !== "string") continue
    count += block.text.match(/<h[1-6][\s>]/gi)?.length ?? 0
  }
  return count
}

function contentTextHasSemanticHeadings(contentText: string): boolean {
  const decoded = decodeContentTextEntities(contentText)
  if (/<h[1-6][\s>]/i.test(decoded)) return true
  return /(?:^|\n)#{1,6}\s+\S+/m.test(decoded)
}

function shouldHydrateBlocksFromContentText(
  blocks: ExportOutputBlock[],
  contentText: string,
): boolean {
  if (contentJsonLooksDegraded(blocks)) return true
  if (!contentTextHasSemanticHeadings(contentText)) return false

  const blockHeadingCount = countSemanticHeadingsInBlocks(blocks)
  if (blockHeadingCount === 0) return true

  const decoded = decodeContentTextEntities(contentText)
  const contentTextHeadingCount =
    decoded.match(/<h[1-6][\s>]/gi)?.length
    ?? decoded.match(/(?:^|\n)#{1,6}\s+\S+/gm)?.length
    ?? 0
  return contentTextHeadingCount > blockHeadingCount
}

function hydrateOutputBlocksFromContentText(contentText: string, componentTitle?: string | null): ExportOutputBlock[] {
  const html = normalizeComponentOutputToHtml(contentText, componentTitle)
  if (!html.trim()) return []
  const parsed = extractOutputContentBlocksFromHtml(html)
  return parsed.length > 0 ? parsed : [{ type: "paragraph", text: html }]
}

export function resolveCanonicalOutputBlocks(
  output: ExportComponentOutput | null | undefined,
  componentTitle?: string | null,
): ExportOutputBlock[] {
  const blocks = getOutputBlocks(output)
  const hasAttachment = blocks.some((block) => block.type === "attachment")
  const contentText = output?.content_text ?? ""
  if (!hasAttachment && contentText.trim() && shouldHydrateBlocksFromContentText(blocks, contentText)) {
    return hydrateOutputBlocksFromContentText(contentText, componentTitle)
  }
  return blocks
}

// Matches bare http(s) URLs, stopping before trailing punctuation and closing brackets.
const RAW_URL_PATTERN = /(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]}])/g

/**
 * Convert bare URLs in text nodes into real anchors, leaving text that is already
 * inside an `<a>` untouched. Markdown links and existing anchors are handled upstream
 * by the rich-text normalizer; this only covers raw URLs typed as plain text.
 */
function autolinkRawUrlsInHtml(html: string): string {
  if (!html.trim()) return html
  if (!/https?:\/\//i.test(html)) return html
  if (typeof DOMParser === "undefined") return html

  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html")
  const container = doc.body.firstElementChild
  if (!container) return html

  const walk = (node: Node) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      if ((node as Element).tagName.toLowerCase() === "a") return
      Array.from(node.childNodes).forEach(walk)
      return
    }
    if (node.nodeType !== Node.TEXT_NODE) return
    const text = node.textContent ?? ""
    if (!RAW_URL_PATTERN.test(text)) return
    RAW_URL_PATTERN.lastIndex = 0

    const fragment = doc.createDocumentFragment()
    let lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = RAW_URL_PATTERN.exec(text)) !== null) {
      const url = match[0]
      if (match.index > lastIndex) {
        fragment.appendChild(doc.createTextNode(text.slice(lastIndex, match.index)))
      }
      const anchor = doc.createElement("a")
      anchor.setAttribute("href", url)
      anchor.textContent = url
      fragment.appendChild(anchor)
      lastIndex = match.index + url.length
    }
    if (lastIndex < text.length) {
      fragment.appendChild(doc.createTextNode(text.slice(lastIndex)))
    }
    node.parentNode?.replaceChild(fragment, node)
  }

  Array.from(container.childNodes).forEach(walk)
  return container.innerHTML
}

function paragraphTextToStructuredHtml(text: string): string {
  const trimmed = (text ?? "").trim()
  if (!trimmed) return "<p></p>"

  const normalized = trimmed.startsWith("<")
    ? sanitizeComponentOutputHtml(stripEditorArtifactsFromHtml(normalizeMixedRichText(trimmed) || trimmed))
    : sanitizeComponentOutputHtml(
        normalizeComponentOutputToHtml(trimmed, null)
        || normalizeMixedRichText(trimmed)
        || "",
      )

  if (normalized?.trim()) {
    return autolinkRawUrlsInHtml(normalized)
  }
  return `<p>${escapeHtmlText(trimmed).replace(/\n/g, "<br/>")}</p>`
}

export function renderExportBodyHtml(
  blocks: ExportOutputBlock[] | null | undefined,
  output: ExportComponentOutput,
): string {
  return exportBlocksToHtml(blocks, output)
}

export function renderExportBodyClipboardHtml(
  blocks: ExportOutputBlock[] | null | undefined,
  output: ExportComponentOutput,
): string {
  const docxHtml = exportBlocksToHtml(blocks, output)
  const structuredNodes = htmlToExportStructuredNodes(docxHtml)
  if (structuredNodes.length > 0) {
    return renderStructuredNodesToClipboardHtml(structuredNodes)
  }
  return htmlToSemanticExportHtml(docxHtml)
}

function renderAttachmentBlockToHtml(
  block: Extract<ExportOutputBlock, { type: "attachment" }>,
  output: ExportComponentOutput,
): string {
  const attachment = resolveAttachmentForBlock(block, output)
  const imageUrl =
    attachment?.media_type === "image" || (attachment?.mime_type ?? "").startsWith("image/")
      ? getStableAttachmentUrl(block, attachment)
      : null
  if (imageUrl) {
    const alt = attachment?.alt_text?.trim() || attachment?.caption?.trim() || attachment?.file_name?.trim() || "Image"
    const widthAttr = attachment?.width ? ` width="${Math.round(attachment.width)}"` : ""
    const heightAttr = attachment?.height ? ` height="${Math.round(attachment.height)}"` : ""
    return `<figure><img src="${imageUrl}" alt="${escapeHtmlText(alt)}"${widthAttr}${heightAttr} />${attachment?.caption?.trim() ? `<figcaption>${escapeHtmlText(attachment.caption.trim())}</figcaption>` : ""}</figure>`
  }
  const label =
    attachment?.caption?.trim()
    || attachment?.alt_text?.trim()
    || attachment?.file_name?.trim()
    || "Attachment"
  const mediaType = attachment?.media_type ?? block.media_type ?? "file"
  return `<p><em>[${mediaType}: ${escapeHtmlText(label)}]</em></p>`
}

export function exportBlocksToHtml(
  blocks: ExportOutputBlock[] | null | undefined,
  output: ExportComponentOutput,
): string {
  if (!blocks || blocks.length === 0) return ""
  const htmlParts: string[] = []
  for (const block of blocks) {
    if (block.type === "paragraph") {
      htmlParts.push(paragraphTextToStructuredHtml(block.text ?? ""))
      continue
    }
    htmlParts.push(renderAttachmentBlockToHtml(block, output))
  }
  return htmlParts.join("")
}

export function isMeaningfullyEmptyHtml(html?: string | null): boolean {
  if (!html) return true
  const normalized = html
    .replace(/<br\s*\/?>/gi, "")
    .replace(/<\/p>\s*<p>/gi, "")
    .replace(/<p>\s*<\/p>/gi, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/\u00a0/gi, " ")
    .replace(/<[^>]*>/g, "")
    .trim()
  return normalized.length === 0
}

function parseSecondaryKeywords(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean)
  }
  if (typeof value === "string") {
    return value.split(/[;,]/).map((item) => item.trim()).filter(Boolean)
  }
  return []
}

export function buildSeoFromBootstrap(
  seo: TaskChannelBootstrapSeo | null | undefined,
  taskMeta?: TaskDocxExportTaskMeta,
  keywordMetrics?: Map<string, { searchVolume: number | null; competition: number | null }>,
): TaskDocxExportSeo | null {
  const ov = seo?.override
  const eff = seo?.effective
  const primaryKeyword = (ov?.primary_keyword ?? taskMeta?.keyword ?? "").trim() || null
  const secondaryKeywords = parseSecondaryKeywords(ov?.secondary_keywords)
  const metaTitle = taskMeta?.metaTitle?.trim() || null
  const metaDescription = taskMeta?.metaDescription?.trim() || null
  const keyword = taskMeta?.keyword?.trim() || null
  const slug = taskMeta?.slug?.trim() || null
  const seoRequired = eff?.seo_required ?? null

  const keywordRows = buildKeywordRowsForExport(primaryKeyword, secondaryKeywords, keywordMetrics)

  const hasAny =
    !!primaryKeyword
    || secondaryKeywords.length > 0
    || !!metaTitle
    || !!metaDescription
    || !!keyword
    || !!slug
    || seoRequired != null
    || keywordRows.some((row) => row.searchVolume != null || row.competition != null)

  if (!hasAny) return null

  return {
    primaryKeyword,
    secondaryKeywords,
    metaTitle,
    metaDescription,
    keyword,
    slug,
    seoRequired,
    keywordRows,
  }
}

function normalizeKeywordKey(value: string): string {
  return value.trim().toLowerCase()
}

function buildKeywordRowsForExport(
  primaryKeyword: string | null,
  secondaryKeywords: string[],
  keywordMetrics?: Map<string, { searchVolume: number | null; competition: number | null }>,
): TaskDocxExportKeywordRow[] {
  const ordered: string[] = []
  const seen = new Set<string>()
  const pushKeyword = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return
    const key = normalizeKeywordKey(trimmed)
    if (seen.has(key)) return
    seen.add(key)
    ordered.push(trimmed)
  }
  if (primaryKeyword) pushKeyword(primaryKeyword)
  for (const keyword of secondaryKeywords) pushKeyword(keyword)

  return ordered.map((keyword, index) => {
    const metric = keywordMetrics?.get(normalizeKeywordKey(keyword))
    return {
      keyword,
      isPrimary: !!primaryKeyword && index === 0 && normalizeKeywordKey(keyword) === normalizeKeywordKey(primaryKeyword),
      searchVolume: metric?.searchVolume ?? null,
      competition: metric?.competition ?? null,
    }
  })
}

export function formatExportMetricValue(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—"
  return String(Math.round(value))
}

type KeywordMetricDbRow = {
  keyword?: unknown
  name?: unknown
  volume?: unknown
  competition?: unknown
  competition_index?: unknown
}

function toMetricNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

/** Loads persisted keyword search volume / competition for a task channel (download export only). */
export async function fetchChannelKeywordMetricsForExport(
  supabase: {
    rpc: (
      fn: string,
      args: Record<string, unknown>,
    ) => PromiseLike<{ data: unknown; error: unknown }>
  },
  taskId: number,
  channelId: number,
  keywords: string[],
): Promise<Map<string, { searchVolume: number | null; competition: number | null }>> {
  const result = new Map<string, { searchVolume: number | null; competition: number | null }>()
  const keywordKeySet = new Set(keywords.map((keyword) => normalizeKeywordKey(keyword)).filter(Boolean))
  if (keywordKeySet.size === 0) return result

  const { data, error } = await supabase.rpc("get_task_channel_keywords_with_metrics", {
    p_task_id: taskId,
    p_channel_id: channelId,
  })
  if (error) {
    console.warn("[task-docx-export] failed to load keyword metrics", error)
    return result
  }

  const rows = Array.isArray(data)
    ? data.filter((item): item is KeywordMetricDbRow => !!item && typeof item === "object")
    : []

  for (const row of rows) {
    const key = normalizeKeywordKey(String(row.keyword ?? row.name ?? ""))
    if (!key || !keywordKeySet.has(key)) continue
    result.set(key, {
      searchVolume: toMetricNumber(row.volume ?? null),
      competition: toMetricNumber(row.competition ?? row.competition_index ?? null),
    })
  }

  return result
}

export { mapHtmlHeadingTagToDocxLevel, htmlToExportStructuredNodes, renderStructuredNodesToClipboardHtml, type ClipboardCopyTarget } from "./task-content-export-html"
export type { ExportStructuredNode } from "./task-content-export-html"

export function renderComponentExportBodyHtml(
  component: { docxHtml?: string; html?: string; clipboardHtml?: string; contentHtml?: string },
): string {
  return component.docxHtml ?? component.html ?? component.clipboardHtml ?? component.contentHtml ?? ""
}

export function renderComponentToDocxHtml(
  component: { docxHtml?: string; html?: string; title: string },
  options: ComponentRenderOptions = DEFAULT_DOCX_RENDER_OPTIONS,
): string {
  const body = renderComponentExportBodyHtml(component)
  if (options.includeComponentLabel && component.title.trim()) {
    return `<h2>${escapeHtmlText(component.title.trim())}</h2>${body}`
  }
  return body
}

export function renderComponentToClipboardHtml(
  component: { docxHtml?: string; html?: string; clipboardHtml?: string; contentHtml?: string; title: string },
  options: ComponentRenderOptions = DEFAULT_CLIPBOARD_RENDER_OPTIONS,
): string {
  const target = options.clipboardTarget ?? "wordpress"
  const precomputed = target === "wordpress" ? component.clipboardHtml?.trim() : ""
  const body = precomputed || renderExportBodyFromDocxHtml(renderComponentExportBodyHtml(component), target)
  if (options.includeComponentLabel && component.title.trim()) {
    const label = escapeHtmlText(component.title.trim())
    if (target === "word") {
      return `<p class="MsoHeading2" style="mso-style-name:'Heading 2'; mso-style-id:Heading2; mso-outline-level:2; font-size:16pt; font-weight:bold; margin:16pt 0 7pt;">${label}</p>${body}`
    }
    return `<h2>${label}</h2>${body}`
  }
  return body
}

function renderExportBodyFromDocxHtml(docxHtml: string, target: ClipboardCopyTarget = "wordpress"): string {
  const structuredNodes = htmlToExportStructuredNodes(docxHtml)
  if (structuredNodes.length > 0) {
    return renderStructuredNodesToClipboardHtml(structuredNodes, target)
  }
  return htmlToSemanticExportHtml(docxHtml, target)
}

function mapBootstrapComponentRows(rows: TaskChannelBootstrapComponentRow[]): ExportComponentRow[] {
  return (rows || [])
    .filter((row) => !!row.selected)
    .map((row) => ({
      task_component_id: row.task_component_id ?? null,
      briefing_component_id: row.briefing_component_id ?? null,
      title: row.title || "",
      custom_title: null,
      selected: !!row.selected,
      position: row.position ?? null,
      kind: row.kind ?? null,
    }))
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
}

function mergeLiveComponentRows(
  bootstrapRows: ExportComponentRow[],
  liveRows?: ExportComponentRow[],
): ExportComponentRow[] {
  if (!liveRows || liveRows.length === 0) return bootstrapRows
  const liveByTaskId = new Map(
    liveRows
      .filter((row) => !!row.task_component_id)
      .map((row) => [row.task_component_id as string, row]),
  )
  return bootstrapRows.map((row) => {
    if (!row.task_component_id) return row
    const live = liveByTaskId.get(row.task_component_id)
    if (!live) return row
    return {
      ...row,
      custom_title: live.custom_title ?? row.custom_title,
      title: live.title || row.title,
    }
  })
}

function buildOutputRecordFromComposedRow(row: TaskChannelBootstrapComposedOutputRow): ExportComponentOutput {
  const attachments = normalizeTaskComponentOutputAttachments(row.attachments)
  const normalized = normalizeBootstrapOutputContent(row)
  return {
    content: normalized.content,
    resolved_content_json: normalized.resolved_content_json,
    content_json: normalized.content_json,
    content_text: row.content_text,
    attachment_map: normalizeAttachmentMap(row.attachment_map),
    attachments,
  }
}

function getOutputMapKeys(params: {
  taskComponentId?: string | null
  briefingComponentId?: number | null
}): string[] {
  const keys: string[] = []
  if (typeof params.briefingComponentId === "number") {
    keys.push(getOutputMapKeyFromBriefingId(params.briefingComponentId))
  }
  if (typeof params.taskComponentId === "string" && params.taskComponentId.length > 0) {
    keys.push(getOutputMapKeyFromTaskComponentId(params.taskComponentId))
  }
  return keys
}

function resolveLiveOutputForComponent(
  component: ExportComponentRow,
  overrides?: TaskDocxExportLiveOverrides,
): ExportComponentOutput | null {
  if (!overrides) return null

  const keys = getOutputMapKeys({
    taskComponentId: component.task_component_id,
    briefingComponentId: component.briefing_component_id,
  })

  let merged: ExportComponentOutput | null = null
  for (const key of keys) {
    const live = overrides.componentOutputs?.get(key)
    if (!live || typeof live !== "object") continue
    const liveOutput: ExportComponentOutput = live
    if (merged) {
      merged = {
        content: liveOutput.content ?? merged.content,
        resolved_content_json: liveOutput.resolved_content_json ?? merged.resolved_content_json,
        content_json: liveOutput.content_json ?? merged.content_json,
        content_text: liveOutput.content_text ?? merged.content_text,
        attachment_map: liveOutput.attachment_map ?? merged.attachment_map,
        attachments: liveOutput.attachments?.length ? liveOutput.attachments : merged.attachments,
      }
    } else {
      merged = { ...liveOutput }
    }
  }

  for (const key of keys) {
    const localJson = overrides.outputJsonByKey?.get(key)
    const localText = overrides.outputTextByKey?.get(key)
    if (localJson?.length) {
      merged = {
        ...(merged ?? {}),
        content_json: localJson,
        resolved_content_json: localJson,
        content: localJson,
        content_text: localText ?? merged?.content_text ?? null,
        attachments: merged?.attachments ?? [],
        attachment_map: merged?.attachment_map ?? null,
      }
    } else if (typeof localText === "string" && localText.trim()) {
      merged = {
        ...(merged ?? {}),
        content_text: localText,
        attachments: merged?.attachments ?? [],
        attachment_map: merged?.attachment_map ?? null,
      }
    }
  }

  const taskComponentId = component.task_component_id
  if (taskComponentId) {
    const preview = overrides.finalPreviews?.get(taskComponentId)
    if (preview?.blocks?.length) {
      merged = {
        ...(merged ?? {}),
        content: preview.blocks,
        content_json: preview.blocks,
        resolved_content_json: preview.blocks,
        attachments: merged?.attachments ?? [],
        attachment_map: merged?.attachment_map ?? null,
      }
    }

    const generation = overrides.inFlightGenerations?.get(taskComponentId)
    if (generation?.previewBlocks?.length) {
      merged = {
        ...(merged ?? {}),
        content: generation.previewBlocks,
        content_json: generation.previewBlocks,
        resolved_content_json: generation.previewBlocks,
        attachments: merged?.attachments ?? [],
        attachment_map: merged?.attachment_map ?? null,
      }
    } else if (generation?.previewText?.trim()) {
      merged = {
        ...(merged ?? {}),
        content_text: generation.previewText,
        attachments: merged?.attachments ?? [],
        attachment_map: merged?.attachment_map ?? null,
      }
    }
  }

  return merged
}

function indexComposedOutput(rows: TaskChannelBootstrapComposedOutputRow[]) {
  const byTaskComponentId = new Map<string, TaskChannelBootstrapComposedOutputRow>()
  const byBriefingComponentId = new Map<number, TaskChannelBootstrapComposedOutputRow>()

  for (const row of rows) {
    if (typeof row.task_component_id === "string" && row.task_component_id.length > 0) {
      byTaskComponentId.set(row.task_component_id, row)
    }
    if (typeof row.briefing_component_id === "number") {
      if (!byBriefingComponentId.has(row.briefing_component_id)) {
        byBriefingComponentId.set(row.briefing_component_id, row)
      }
    }
  }

  return { byTaskComponentId, byBriefingComponentId }
}

function resolveComposedRowForComponent(
  component: ExportComponentRow,
  indexes: ReturnType<typeof indexComposedOutput>,
): TaskChannelBootstrapComposedOutputRow | null {
  if (component.task_component_id) {
    const byTask = indexes.byTaskComponentId.get(component.task_component_id)
    if (byTask) return byTask
  }
  if (typeof component.briefing_component_id === "number") {
    return indexes.byBriefingComponentId.get(component.briefing_component_id) ?? null
  }
  return null
}

function resolveComponentExportContent(
  component: ExportComponentRow,
  composedRow: TaskChannelBootstrapComposedOutputRow | null,
  overrides?: TaskDocxExportLiveOverrides,
): {
  html: string
  clipboardHtml: string
  structuredNodes: ExportStructuredNode[]
  plainText: string
  blocks: ExportOutputBlock[]
  hasContent: boolean
  output: ExportComponentOutput | null
  assets: TaskComponentOutputAttachment[]
} {
  const title = getComponentDisplayTitle(component, composedRow?.title)
  const bootstrapOutput = composedRow ? buildOutputRecordFromComposedRow(composedRow) : null
  const liveOutput = resolveLiveOutputForComponent(component, overrides)

  const output: ExportComponentOutput | null = liveOutput
    ? {
        ...(bootstrapOutput ?? {}),
        ...liveOutput,
        content:
          liveOutput.content
          ?? liveOutput.content_json
          ?? liveOutput.resolved_content_json
          ?? bootstrapOutput?.content
          ?? null,
        resolved_content_json:
          liveOutput.resolved_content_json
          ?? liveOutput.content_json
          ?? liveOutput.content
          ?? bootstrapOutput?.resolved_content_json
          ?? null,
        content_json:
          liveOutput.content_json
          ?? liveOutput.content
          ?? bootstrapOutput?.content_json
          ?? null,
        attachments: liveOutput.attachments?.length
          ? liveOutput.attachments
          : bootstrapOutput?.attachments ?? [],
        attachment_map: liveOutput.attachment_map ?? bootstrapOutput?.attachment_map ?? null,
        content_text: liveOutput.content_text ?? bootstrapOutput?.content_text ?? null,
      }
    : bootstrapOutput

  const blocks = resolveCanonicalOutputBlocks(output, title)
  const html = exportBlocksToHtml(blocks, output ?? {})
  const structuredNodes = htmlToExportStructuredNodes(html)
  const clipboardHtml = structuredNodes.length > 0
    ? renderStructuredNodesToClipboardHtml(structuredNodes)
    : renderExportBodyClipboardHtml(blocks, output ?? {})
  const plainText = renderBlocksToPlainText(blocks, output ?? {})
  const assets = collectComponentAssets(output ?? {}, blocks)
  return {
    html,
    clipboardHtml,
    structuredNodes,
    plainText,
    blocks,
    hasContent: !isMeaningfullyEmptyHtml(html) && plainText.trim().length > 0,
    output,
    assets,
  }
}

export type NormalizedComponentExport = {
  id: string
  title: string
  type: string | null
  contentHtml: string
  contentText: string
  contentJson: ExportOutputBlock[]
  structuredNodes: ExportStructuredNode[]
  docxHtml: string
  clipboardHtml: string
  hasContent: boolean
  assets: TaskComponentOutputAttachment[]
}

export function normalizeComponentContent(params: {
  component: ExportComponentRow
  composedRow: TaskChannelBootstrapComposedOutputRow | null
  liveOverrides?: TaskDocxExportLiveOverrides
}): NormalizedComponentExport {
  const stableId = getStableComponentId(params.component)
  const title = getComponentDisplayTitle(params.component, params.composedRow?.title)
  const resolved = resolveComponentExportContent(params.component, params.composedRow, params.liveOverrides)
  return {
    id: stableId,
    title,
    type: params.component.kind ?? null,
    contentHtml: resolved.clipboardHtml,
    contentText: resolved.plainText,
    contentJson: resolved.blocks,
    structuredNodes: resolved.structuredNodes,
    docxHtml: resolved.html,
    clipboardHtml: resolved.clipboardHtml,
    hasContent: resolved.hasContent,
    assets: resolved.assets,
  }
}

export function buildSingleComponentExport(params: {
  component: ExportComponentRow
  bootstrap: TaskChannelBootstrapResponse
  liveOverrides?: TaskDocxExportLiveOverrides
}): NormalizedComponentExport | null {
  const indexes = indexComposedOutput(params.bootstrap.composed_output ?? [])
  const composedRow = resolveComposedRowForComponent(params.component, indexes)
  const normalized = normalizeComponentContent({
    component: params.component,
    composedRow,
    liveOverrides: params.liveOverrides,
  })
  return normalized.hasContent ? normalized : null
}

function collectComponentAssets(
  output: ExportComponentOutput,
  blocks: ExportOutputBlock[],
): TaskComponentOutputAttachment[] {
  const seen = new Set<string>()
  const assets: TaskComponentOutputAttachment[] = []
  const push = (attachment: TaskComponentOutputAttachment | null | undefined) => {
    if (!attachment || seen.has(attachment.id)) return
    seen.add(attachment.id)
    assets.push(attachment)
  }
  for (const attachment of output.attachments ?? []) push(attachment)
  for (const attachment of Object.values(output.attachment_map ?? {})) push(attachment)
  for (const block of blocks) {
    if (block.type !== "attachment") continue
    push(resolveAttachmentForBlock(block, output))
  }
  return assets
}

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

function getStableAttachmentUrl(
  block: Extract<ExportOutputBlock, { type: "attachment" }>,
  attachment: TaskComponentOutputAttachment | null,
): string | null {
  const candidates = [
    block.signed_url,
    attachment?.signed_url,
    attachment?.public_url,
    block.public_url,
    attachment?.metadata && typeof attachment.metadata === "object"
      ? (attachment.metadata as Record<string, unknown>).signed_url
      : null,
    attachment?.metadata && typeof attachment.metadata === "object"
      ? (attachment.metadata as Record<string, unknown>).public_url
      : null,
  ]
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue
    const trimmed = candidate.trim()
    if (!trimmed) continue
    if (trimmed.startsWith("blob:")) continue
    if (trimmed.startsWith("data:")) continue
    return trimmed
  }
  return null
}

function stripEditorArtifactsFromHtml(html: string): string {
  if (!html.trim()) return ""
  if (typeof window === "undefined") return html
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, "text/html")

  const stripFromElement = (el: Element) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase()
      if (
        name.startsWith("data-")
        || name === "contenteditable"
        || name === "class"
        || name === "style"
        || name.startsWith("on")
      ) {
        el.removeAttribute(attr.name)
      }
    }
  }

  const walk = (node: Node) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element
      stripFromElement(el)
      if (el.tagName.toLowerCase() === "script" || el.tagName.toLowerCase() === "style") {
        el.remove()
        return
      }
    }
    for (const child of Array.from(node.childNodes)) walk(child)
  }
  walk(doc.body)
  return doc.body.innerHTML.trim()
}

export function exportBlocksToClipboardHtml(
  blocks: ExportOutputBlock[] | null | undefined,
  output: ExportComponentOutput,
): string {
  return renderExportBodyClipboardHtml(blocks, output)
}

/**
 * Canonical serializer for a single component output → semantic clipboard HTML.
 *
 * Produces the exact same body used by the working "Copy component content" action:
 * `h1`–`h6`, `<p>`, `<ul>`/`<ol>`/`<li>`, `<strong>`, `<em>`, `<a href>`, and `<br/>`.
 * Markdown links (including inside HTML paragraph strings) and bare URLs are converted
 * to real anchors. Returns an empty string when the output has no meaningful content.
 */
export function serializeComponentOutputToClipboardHtml(
  output: ExportComponentOutput | null | undefined,
  title?: string | null,
): string {
  const blocks = resolveCanonicalOutputBlocks(output ?? null, title ?? null)
  const html = renderExportBodyClipboardHtml(blocks, output ?? {}).trim()
  if (!html || isMeaningfullyEmptyHtml(html)) return ""
  return html
}

export type TaskChannelOutputForSerialization = {
  output: ExportComponentOutput | null | undefined
  title?: string | null
  position?: number | null
}

/**
 * Canonical serializer for a whole task/channel → semantic clipboard HTML.
 *
 * 1. Sorts components by position (stable on ties).
 * 2. Skips empty outputs.
 * 3. Serializes each component with the same serializer as "Copy component content".
 * 4. Joins components with clean spacing (a single newline), never extra block wrappers
 *    that would break heading structure on paste.
 */
export function serializeTaskChannelOutputsToClipboardHtml(
  outputs: TaskChannelOutputForSerialization[],
): string {
  const ordered = outputs
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => (a.entry.position ?? 0) - (b.entry.position ?? 0) || a.index - b.index)

  const parts: string[] = []
  for (const { entry } of ordered) {
    const html = serializeComponentOutputToClipboardHtml(entry.output, entry.title)
    if (!html) continue
    parts.push(html)
  }
  return parts.join("\n")
}

/**
 * Canonical serializer for a single component output → an RTF document with Word Heading styles.
 *
 * Built from the exact same structured model as the HTML serializer (headings, paragraphs, lists,
 * bold/italic, links), then mapped to RTF `\s1`–`\s6` heading styles + `\outlinelevel`. Returns an
 * empty string when the output has no meaningful content.
 */
export function serializeComponentOutputToRtf(
  output: ExportComponentOutput | null | undefined,
  title?: string | null,
): string {
  const html = serializeComponentOutputToClipboardHtml(output, title)
  if (!html) return ""
  const nodes = htmlToExportStructuredNodes(html)
  if (nodes.length === 0) return ""
  return structuredNodesToRtfDocument(nodes)
}

/**
 * Canonical serializer for a whole task/channel → a single RTF document.
 *
 * Mirrors `serializeTaskChannelOutputsToClipboardHtml`: sorts by position, skips empty outputs, and
 * concatenates every component's structured nodes into one RTF document (with a blank separator
 * paragraph between components) so headings stay style-mapped across the whole paste.
 */
export function serializeTaskChannelOutputsToRtf(
  outputs: TaskChannelOutputForSerialization[],
): string {
  const ordered = outputs
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => (a.entry.position ?? 0) - (b.entry.position ?? 0) || a.index - b.index)

  const nodes: ExportStructuredNode[] = []
  for (const { entry } of ordered) {
    const html = serializeComponentOutputToClipboardHtml(entry.output, entry.title)
    if (!html) continue
    const componentNodes = htmlToExportStructuredNodes(html)
    if (componentNodes.length === 0) continue
    if (nodes.length > 0) nodes.push({ type: "paragraph", inlineHtml: "" })
    nodes.push(...componentNodes)
  }
  if (nodes.length === 0) return ""
  return structuredNodesToRtfDocument(nodes)
}

function htmlFragmentToPlainText(html: string): string {
  if (!html.trim()) return ""
  if (typeof window === "undefined") {
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
  }
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, "text/html")
  return (doc.body.textContent ?? "").replace(/\u00a0/g, " ").replace(/\s+\n/g, "\n").trim()
}

export function renderBlocksToPlainText(
  blocks: ExportOutputBlock[] | null | undefined,
  output: ExportComponentOutput,
): string {
  if (!blocks || blocks.length === 0) return ""
  const parts: string[] = []
  for (const block of blocks) {
    if (block.type === "paragraph") {
      const text = htmlFragmentToPlainText(
        block.text?.trim().startsWith("<")
          ? block.text
          : normalizeMixedRichText(block.text ?? "") || block.text || "",
      )
      if (text) parts.push(text)
      continue
    }
    const attachment = resolveAttachmentForBlock(block, output)
    const label =
      attachment?.caption?.trim()
      || attachment?.alt_text?.trim()
      || attachment?.file_name?.trim()
      || "Attachment"
    parts.push(`[Image: ${label}]`)
  }
  return parts.join("\n\n")
}

export function renderComponentToPlainText(component: NormalizedComponentExport): string {
  return component.contentText
}

export function renderComponentsToClipboardHtml(
  components: NormalizedComponentExport[],
  options: ComponentRenderOptions = DEFAULT_CLIPBOARD_RENDER_OPTIONS,
): string {
  const htmlParts = components
    .filter((component) => component.hasContent)
    .map((component) => renderComponentToClipboardHtml(component, options).trim())
    .filter(Boolean)
  // Join components with clean spacing only. Each component fragment is already a
  // sequence of block elements, so concatenating directly keeps heading structure
  // intact instead of injecting empty <p></p> wrappers between sections.
  return htmlParts.join("\n")
}

export function renderComponentsToPlainText(components: NormalizedComponentExport[]): string {
  return components
    .filter((component) => component.hasContent)
    .map((component) => renderComponentToPlainText(component).trim())
    .filter(Boolean)
    .join("\n\n")
}

export type CopyComponentContentResult =
  | { ok: true; mode: "rich" }
  | { ok: true; mode: "plain" }
  | { ok: false; reason: "empty" | "unsupported" | "failed"; message?: string }

async function readBackClipboardHtmlPayload(): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.read) return

  try {
    const items = await navigator.clipboard.read()
    const htmlItem = items.find((item) => item.types.includes("text/html"))

    if (htmlItem) {
      const html = await (await htmlItem.getType("text/html")).text()
      console.log("[copy-content-readback-types]", htmlItem.types)
      console.log("[copy-content-readback-html]", html)
      console.log("[copy-content-readback-has-headings]", {
        hasH1: /<h1[\s>]/i.test(html),
        hasH2: /<h2[\s>]/i.test(html),
        hasH3: /<h3[\s>]/i.test(html),
        startsWithCfHtmlHeader: /^Version:/i.test(html),
      })
    } else {
      console.warn("[copy-content-readback-no-html-item]", items.map((item) => item.types))
    }
  } catch (error) {
    console.warn("[copy-content-readback-failed]", error)
  }
}

/**
 * Copy semantic HTML through a native offscreen DOM selection.
 *
 * This mirrors how the browser's own copy pipeline (and apps like ChatGPT) preserve headings:
 * the semantic HTML is rendered into a real, contentEditable DOM node, its contents are selected,
 * and `document.execCommand("copy")` serializes that live selection to the clipboard. The browser
 * emits the platform-native clipboard flavors (CF_HTML on Windows, `public.html` on macOS) that
 * Word, Google Docs, and WordPress interpret as real `<h2>`/`<h3>` heading nodes.
 *
 * Runs fully synchronously so it stays inside the originating user-gesture (required for
 * `execCommand`). Returns false if the environment can't support it, so callers fall back to the
 * async `ClipboardItem` path.
 */
function copyHtmlViaOffscreenSelection(htmlFragment: string): boolean {
  if (typeof document === "undefined" || typeof window === "undefined") return false
  if (typeof document.execCommand !== "function") return false
  if (!htmlFragment.trim()) return false

  const selection = window.getSelection()
  if (!selection) return false

  const container = document.createElement("div")
  container.setAttribute("contenteditable", "true")
  container.setAttribute("aria-hidden", "true")
  container.style.position = "fixed"
  container.style.left = "-9999px"
  container.style.top = "0"
  container.style.width = "1px"
  container.style.height = "1px"
  container.style.overflow = "hidden"
  container.style.opacity = "0"
  container.style.whiteSpace = "pre-wrap"
  container.innerHTML = htmlFragment
  document.body.appendChild(container)

  // Diagnostic: confirm the offscreen DOM actually contains real heading nodes before copying.
  console.log("[copy-content-selection-headings]", {
    headingCount: container.querySelectorAll("h1,h2,h3,h4,h5,h6").length,
    hasH2: container.querySelector("h2") != null,
    hasH3: container.querySelector("h3") != null,
    anchorCount: container.querySelectorAll("a[href]").length,
  })

  // Preserve the user's existing selection so copying doesn't clobber it.
  const previousRanges: Range[] = []
  for (let i = 0; i < selection.rangeCount; i += 1) {
    previousRanges.push(selection.getRangeAt(i).cloneRange())
  }

  let copied = false
  try {
    const range = document.createRange()
    range.selectNodeContents(container)
    selection.removeAllRanges()
    selection.addRange(range)
    copied = document.execCommand("copy")
  } catch (error) {
    console.warn("[copy-content-selection-failed]", error)
    copied = false
  } finally {
    selection.removeAllRanges()
    for (const range of previousRanges) {
      selection.addRange(range)
    }
    if (container.parentNode) container.parentNode.removeChild(container)
  }

  return copied
}

async function writeStructuredContentToClipboard(params: {
  htmlDocument: string
  htmlFragment?: string
  plainText: string
  rtfDocument?: string | null
  target?: ClipboardCopyTarget
}): Promise<CopyComponentContentResult> {
  const { htmlDocument, htmlFragment, plainText, rtfDocument, target = "wordpress" } = params
  if (!htmlDocument.trim() && !plainText.trim()) {
    console.error("[copy-content-error]", { reason: "empty-payload" })
    return { ok: false, reason: "empty", message: "No content to copy" }
  }

  const hasNavigatorClipboardWrite = typeof navigator !== "undefined" && typeof navigator.clipboard?.write === "function"
  const hasClipboardItem = typeof ClipboardItem !== "undefined"
  const canUseAsyncClipboard = hasNavigatorClipboardWrite && hasClipboardItem
  // RTF is the only clipboard flavor that reliably maps into real Word/Google Docs Heading styles
  // (not just bold/large direct formatting). Only offer it when the browser actually supports the
  // text/rtf flavor via ClipboardItem.supports.
  const rtfSupported = canUseAsyncClipboard && clipboardSupportsRtfPayload() && !!rtfDocument?.trim()

  console.log("[copy-content-mode]", {
    target,
    hasNavigatorClipboardWrite,
    hasClipboardItem: typeof window !== "undefined" && Boolean(window.ClipboardItem),
    rtfSupported,
    hasRtfDocument: !!rtfDocument?.trim(),
  })

  // 1. Preferred path: multi-flavor async write with text/rtf first. Word/Google Docs pick RTF
  //    (real Heading styles), WordPress/browser editors pick text/html, everything else text/plain.
  if (rtfSupported && rtfDocument) {
    try {
      const clipboardPayload: Record<string, Blob> = {
        "text/rtf": new Blob([rtfDocument], { type: "text/rtf" }),
        "text/html": new Blob([htmlDocument], { type: "text/html;charset=utf-8" }),
        "text/plain": new Blob([plainText], { type: "text/plain;charset=utf-8" }),
      }
      await navigator.clipboard.write([new ClipboardItem(clipboardPayload)])
      console.log("[copy-content-success-rtf]", { target, includedRtf: true })
      await readBackClipboardHtmlPayload()
      return { ok: true, mode: "rich" }
    } catch (error) {
      console.warn("[copy-content-rtf-write-failed]", error)
      // Fall through to HTML-based paths below.
    }
  }

  // 2. Native offscreen DOM selection copy (semantic HTML). Runs synchronously so — when RTF is
  //    unsupported and this is reached without a prior await — it stays inside the user gesture.
  //    Preserves real <h2>/<h3> nodes for WordPress; Word keeps visual (not style-based) headings.
  const fragmentForSelection = htmlFragment?.trim() ? htmlFragment : htmlDocument
  if (copyHtmlViaOffscreenSelection(fragmentForSelection)) {
    if (!rtfSupported) {
      console.warn(
        "[copy-content-word-heading-styles-not-guaranteed]",
        "text/rtf clipboard flavor unsupported; Word may preserve heading formatting visually but not as Heading styles.",
      )
    }
    console.log("[copy-content-success-selection]", { target })
    return { ok: true, mode: "rich" }
  }
  console.warn("[copy-content-selection-unavailable]", "Falling back to ClipboardItem/text-html path")

  // 3. HTML-only async write (still preserves h2/h3 for WordPress/browser editors).
  if (canUseAsyncClipboard) {
    try {
      const clipboardPayload: Record<string, Blob> = {
        "text/html": new Blob([htmlDocument], { type: "text/html;charset=utf-8" }),
        "text/plain": new Blob([plainText], { type: "text/plain;charset=utf-8" }),
      }
      if (rtfSupported && rtfDocument) {
        clipboardPayload["text/rtf"] = new Blob([rtfDocument], { type: "text/rtf" })
      }
      await navigator.clipboard.write([new ClipboardItem(clipboardPayload)])
      console.log("[copy-content-success-html]", { target, includedRtf: rtfSupported })
      await readBackClipboardHtmlPayload()
      return { ok: true, mode: "rich" }
    } catch (error) {
      console.warn("[copy-content-fallback-plain-text]", error)
      // Fall through to plain text copy.
    }
  }

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(plainText)
      console.warn("[copy-content-fallback-plain-text]", "Rich HTML clipboard unavailable or failed; used writeText")
      return { ok: true, mode: "plain" }
    } catch (error) {
      console.error("[copy-content-error]", error)
      return {
        ok: false,
        reason: "failed",
        message: error instanceof Error ? error.message : "Clipboard copy failed",
      }
    }
  }

  console.error("[copy-content-error]", { reason: "unsupported", message: "Clipboard is not available" })
  return { ok: false, reason: "unsupported", message: "Clipboard is not available" }
}

function logCopyContentHeadingDiagnostics(htmlBody: string, htmlDocument: string): void {
  console.log("[copy-content-html-body]", htmlBody)
  console.log("[copy-content-html-document]", htmlDocument)
  console.log("[copy-content-has-headings]", {
    hasH1: /<h1[\s>]/i.test(htmlBody),
    hasH2: /<h2[\s>]/i.test(htmlBody),
    hasH3: /<h3[\s>]/i.test(htmlBody),
    hasStyledParagraphHeadings: /<p[^>]*(font-size|font-weight|class=.*heading)/i.test(htmlBody),
    documentStartsWithCfHtmlHeader: /^Version:0\.9/m.test(htmlDocument),
  })
}

function collectStructuredNodesForComponents(components: NormalizedComponentExport[]): ExportStructuredNode[] {
  const nodes: ExportStructuredNode[] = []
  for (const component of components.filter((entry) => entry.hasContent)) {
    const docxHtml = renderComponentExportBodyHtml(component)
    const componentNodes = htmlToExportStructuredNodes(docxHtml)
    if (componentNodes.length > 0) {
      if (nodes.length > 0) nodes.push({ type: "paragraph", inlineHtml: "" })
      nodes.push(...componentNodes)
    }
  }
  return nodes
}

export function buildComponentsClipboardHtmlDocument(
  components: NormalizedComponentExport[],
  options: ComponentRenderOptions = DEFAULT_CLIPBOARD_RENDER_OPTIONS,
): {
  htmlBody: string
  htmlDocument: string
  plainText: string
  rtfDocument: string | null
  target: ClipboardCopyTarget
} | null {
  const target = options.clipboardTarget ?? "wordpress"
  const withContent = components.filter((component) => component.hasContent)
  if (withContent.length === 0) return null

  const htmlBody = cleanClipboardHtml(renderComponentsToClipboardHtml(withContent, options))
  const htmlDocument = wrapHtmlForClipboardPaste(htmlBody, target)
  const plainText = renderComponentsToPlainText(withContent)
  const structuredNodes = collectStructuredNodesForComponents(withContent)
  // Always build RTF (regardless of target) so Word/Google Docs can receive real Heading styles
  // via the text/rtf clipboard flavor, while WordPress/browser editors still use text/html.
  const rtfDocument = structuredNodes.length > 0
    ? structuredNodesToRtfDocument(structuredNodes)
    : null

  return { htmlBody, htmlDocument, plainText, rtfDocument, target }
}

export async function copyComponentsToClipboard(
  components: NormalizedComponentExport[],
  options: ComponentRenderOptions = DEFAULT_CLIPBOARD_RENDER_OPTIONS,
): Promise<CopyComponentContentResult> {
  console.log("[copy-content-entry]", {
    target: options.clipboardTarget ?? "wordpress",
    componentCount: components?.length,
    componentIds: components?.map((component) => component.id),
    componentLabels: components?.map((component) => component.title),
  })

  const built = buildComponentsClipboardHtmlDocument(components, options)
  if (!built) {
    console.warn("[copy-content-error]", { reason: "no-content-components" })
    return { ok: false, reason: "empty", message: "No content to copy" }
  }

  logCopyContentHeadingDiagnostics(built.htmlBody, built.htmlDocument)
  return writeStructuredContentToClipboard({
    htmlDocument: built.htmlDocument,
    htmlFragment: built.htmlBody,
    plainText: built.plainText,
    rtfDocument: built.rtfDocument,
    target: built.target,
  })
}

export async function copyComponentContentToClipboard(
  component: NormalizedComponentExport,
  options: ComponentRenderOptions = DEFAULT_CLIPBOARD_RENDER_OPTIONS,
): Promise<CopyComponentContentResult> {
  return copyComponentsToClipboard([component], options)
}

export function buildTaskDocxExportChannelModel(params: {
  bootstrap: TaskChannelBootstrapResponse
  channelName: string
  liveComponents?: ExportComponentRow[]
  liveOverrides?: TaskDocxExportLiveOverrides
  taskMeta?: TaskDocxExportTaskMeta
  keywordMetrics?: Map<string, { searchVolume: number | null; competition: number | null }>
}): TaskDocxExportChannel {
  const { bootstrap, channelName, liveComponents, liveOverrides, taskMeta, keywordMetrics } = params
  const composed = bootstrap.composed_output ?? []
  const indexes = indexComposedOutput(composed)
  const componentRows = mergeLiveComponentRows(mapBootstrapComponentRows(bootstrap.components ?? []), liveComponents)
  const exportedIds = new Set<string>()
  const components: TaskDocxExportComponent[] = []

  for (const component of componentRows) {
    if (!component.task_component_id && !component.briefing_component_id) continue
    const stableId = getStableComponentId(component)
    if (exportedIds.has(stableId)) continue
    exportedIds.add(stableId)

    const composedRow = resolveComposedRowForComponent(component, indexes)
    const title = getComponentDisplayTitle(component, composedRow?.title)
    const resolved = resolveComponentExportContent(component, composedRow, liveOverrides)
    if (!resolved.hasContent) continue

    components.push({
      id: stableId,
      title,
      type: component.kind ?? null,
      html: resolved.html,
      clipboardHtml: resolved.clipboardHtml,
      plainText: resolved.plainText,
      contentJson: resolved.blocks,
      hasContent: resolved.hasContent,
      assets: resolved.assets,
    })
  }

  if (components.length === 0) {
    const mainRow = indexes.byBriefingComponentId.get(MAIN_BRIEFING_COMPONENT_ID) ?? null
    if (mainRow) {
      const mainComponent: ExportComponentRow = {
        task_component_id: mainRow.task_component_id,
        briefing_component_id: MAIN_BRIEFING_COMPONENT_ID,
        title: "Main content",
        selected: true,
        position: 0,
      }
      const resolved = resolveComponentExportContent(mainComponent, mainRow, liveOverrides)
      if (resolved.hasContent) {
        components.push({
          id: `bc:${MAIN_BRIEFING_COMPONENT_ID}`,
          title: "Main content",
          type: null,
          html: resolved.html,
          clipboardHtml: resolved.clipboardHtml,
          plainText: resolved.plainText,
          contentJson: resolved.blocks,
          hasContent: true,
          assets: resolved.assets,
        })
      }
    }
  }

  return {
    channelId: bootstrap.channel_id,
    channelName,
    components,
    seo: buildSeoFromBootstrap(bootstrap.seo, taskMeta, keywordMetrics),
  }
}

export function buildNormalizedExportFromLiveOutput(params: {
  component: ExportComponentRow
  output: ExportComponentOutput | null | undefined
}): NormalizedComponentExport | null {
  const title = getComponentDisplayTitle(params.component)
  const output = params.output ?? null
  const blocks = resolveCanonicalOutputBlocks(output, title)
  const outputRecord: ExportComponentOutput = output ?? {}
  const docxHtml = exportBlocksToHtml(blocks, outputRecord)
  const structuredNodes = htmlToExportStructuredNodes(docxHtml)
  const clipboardHtml = structuredNodes.length > 0
    ? renderStructuredNodesToClipboardHtml(structuredNodes)
    : renderExportBodyClipboardHtml(blocks, outputRecord)
  const plainText = renderBlocksToPlainText(blocks, outputRecord)
  const hasContent = !isMeaningfullyEmptyHtml(docxHtml) && plainText.trim().length > 0
  if (!hasContent) return null
  return {
    id: getStableComponentId(params.component),
    title,
    type: params.component.kind ?? null,
    contentHtml: clipboardHtml,
    contentText: plainText,
    contentJson: blocks,
    structuredNodes,
    docxHtml,
    clipboardHtml,
    hasContent: true,
    assets: collectComponentAssets(outputRecord, blocks),
  }
}

export function buildTaskDocxExportModel(params: {
  taskTitle: string
  taskMeta?: TaskDocxExportTaskMeta
  channels: Array<{
    bootstrap: TaskChannelBootstrapResponse
    channelName: string
    liveComponents?: ExportComponentRow[]
    liveOverrides?: TaskDocxExportLiveOverrides
    keywordMetrics?: Map<string, { searchVolume: number | null; competition: number | null }>
  }>
}): TaskDocxExportModel {
  return {
    taskTitle: params.taskTitle.trim() || "Untitled Task",
    contentTypeTitle: params.taskMeta?.contentTypeTitle?.trim() || null,
    channels: params.channels.map((channel) =>
      buildTaskDocxExportChannelModel({
        bootstrap: channel.bootstrap,
        channelName: channel.channelName,
        liveComponents: channel.liveComponents,
        liveOverrides: channel.liveOverrides,
        taskMeta: params.taskMeta,
        keywordMetrics: channel.keywordMetrics,
      }),
    ),
  }
}

export function logTaskDocxExportDebug(model: TaskDocxExportModel): void {
  if (typeof process !== "undefined" && process.env?.NODE_ENV === "production") return
  console.log("[task-docx-export]", {
    taskTitle: model.taskTitle,
    contentTypeTitle: model.contentTypeTitle,
    channelCount: model.channels.length,
    channels: model.channels.map((channel) => ({
      channelName: channel.channelName,
      componentCount: channel.components.length,
      components: channel.components.map((component) => ({
        id: component.id,
        title: component.title,
        hasContent: component.hasContent,
        htmlLength: component.html.length,
      })),
      seo: channel.seo
        ? {
            primaryKeyword: channel.seo.primaryKeyword,
            secondaryKeywords: channel.seo.secondaryKeywords,
            metaTitle: channel.seo.metaTitle,
            metaDescription: channel.seo.metaDescription,
            keyword: channel.seo.keyword,
            slug: channel.seo.slug,
            keywordRows: channel.seo.keywordRows.map((row) => ({
              keyword: row.keyword,
              searchVolume: row.searchVolume,
              competition: row.competition,
            })),
          }
        : null,
    })),
  })
}

/** @alias buildTaskDocxExportModel */
export const buildExportModel = buildTaskDocxExportModel

export type CurrentComponentExportContext<T extends { task_component_id: string | null }> = {
  components: T[]
  activeComponentId: string | null
  focusedCardKey: string | null
  isFocusedSingleOutputMode: boolean
  getCardKey: (component: T) => string
}

export function resolveCurrentComponentForExport<T extends { task_component_id: string | null }>(
  context: CurrentComponentExportContext<T>,
): T | null {
  const {
    components,
    activeComponentId,
    focusedCardKey,
    isFocusedSingleOutputMode,
    getCardKey,
  } = context

  if (isFocusedSingleOutputMode && focusedCardKey) {
    const focused = components.find((component) => getCardKey(component) === focusedCardKey) ?? null
    if (focused) return focused
  }

  if (activeComponentId) {
    const active = components.find((component) => component.task_component_id === activeComponentId) ?? null
    if (active) return active
  }

  return null
}

export function getCurrentComponentForExport<T extends { task_component_id: string | null }>(
  exportModel: { components?: T[] } | null | undefined,
  context: Omit<CurrentComponentExportContext<T>, "components"> & { components?: T[] },
): T | null {
  const components = context.components ?? exportModel?.components ?? []
  return resolveCurrentComponentForExport({
    ...context,
    components,
  })
}

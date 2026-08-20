import { htmlToTipTapDoc, tipTapJsonToPlainText } from "../../app/lib/collaboration/tiptap-json-to-yxml"
import { docxArrayBufferToHtml } from "../../app/lib/docx-to-html"
import type { ArtifactContentJson } from "../../app/lib/artifacts/artifact-types"
import { pdfBytesToPlainText } from "./pdf-bytes-to-text"

export type ImportedArtifactFile = {
  title: string
  html: string
  text: string
  contentJson: ArtifactContentJson
}

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
const DOC_MIME = "application/msword"

function fileExtension(name: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(name.trim())
  return (match?.[1] ?? "").toLowerCase()
}

function titleFromFileName(name: string): string {
  const trimmed = name.trim()
  const withoutExt = trimmed.replace(/\.[^.]+$/, "").trim()
  return withoutExt || trimmed || "Untitled"
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

function plainToHtml(text: string): string {
  const blocks = text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
  if (blocks.length === 0) return "<p></p>"
  return blocks
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("")
}

function buildContentJson(html: string): ImportedArtifactFile {
  const tipTap = htmlToTipTapDoc(html)
  const text = tipTapJsonToPlainText(tipTap).replace(/\s+/g, " ").trim()
  return {
    title: "",
    html,
    text,
    contentJson: {
      version: 1,
      editor_kind: "rich_text",
      content_format: "tiptap_json",
      tiptap: tipTap,
      blocks: [{ id: "body", type: "rich_text", html, text }],
    },
  }
}

export function isImportableArtifactFile(file: File): boolean {
  const ext = fileExtension(file.name)
  const mime = (file.type || "").toLowerCase()
  if (ext === "docx" || mime === DOCX_MIME) return true
  if (ext === "doc" || mime === DOC_MIME) return true
  if (ext === "pdf" || mime === "application/pdf") return true
  if (ext === "txt" || ext === "md" || mime.startsWith("text/")) return true
  if (ext === "html" || ext === "htm" || mime === "text/html") return true
  return false
}

export const OUTPUTS_FILE_ACCEPT = ".doc,.docx,.pdf,.txt,.md,.html,.htm"

export function filesFromFileList(list: FileList | File[] | null | undefined): File[] {
  if (!list) return []
  return Array.from(list).filter((file) => file.size > 0)
}

export function filesFromDataTransfer(dataTransfer: DataTransfer | null | undefined): File[] {
  if (!dataTransfer) return []
  const fromFiles = filesFromFileList(dataTransfer.files)
  if (fromFiles.length > 0) return fromFiles
  const items = dataTransfer.items
  if (!items) return []
  const fromItems: File[] = []
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i]
    if (item?.kind !== "file") continue
    const file = item.getAsFile()
    if (file && file.size > 0) fromItems.push(file)
  }
  return fromItems
}

export const OUTPUTS_DROPZONE_ATTR = "data-outputs-dropzone"

export function isFileImportDrag(dataTransfer: DataTransfer | null | undefined): boolean {
  if (!dataTransfer) return false
  const types = Array.from(dataTransfer.types ?? []).map((type) => String(type))
  if (types.includes("application/x-articulate-artifact-id")) return false
  if (
    types.includes("Files")
    || types.includes("application/x-moz-file")
    || types.includes("public.file-url")
  ) {
    return true
  }
  const items = dataTransfer.items
  if (items) {
    for (let i = 0; i < items.length; i += 1) {
      if (items[i]?.kind === "file") return true
    }
  }
  // Safari/WebKit often exposes no types until drop for Finder files.
  if (types.length === 0) return true
  return false
}

export function findOutputsDropzoneElement(event: {
  target?: EventTarget | null
  clientX?: number
  clientY?: number
}): HTMLElement | null {
  if (event.target instanceof Element) {
    const fromTarget = event.target.closest<HTMLElement>(`[${OUTPUTS_DROPZONE_ATTR}="true"]`)
    if (fromTarget) return fromTarget
  }
  if (typeof document === "undefined") return null
  const x = event.clientX
  const y = event.clientY
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  const el = document.elementFromPoint(x, y)
  return el instanceof Element
    ? el.closest<HTMLElement>(`[${OUTPUTS_DROPZONE_ATTR}="true"]`)
    : null
}

export function isOutputsDropzoneHit(
  root: HTMLElement | null | undefined,
  zone: HTMLElement | null | undefined,
): boolean {
  if (!root || !zone) return false
  return zone === root || zone.contains(root) || root.contains(zone)
}

export function isPointInsideElement(el: Element, x: number, y: number): boolean {
  const rect = el.getBoundingClientRect()
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
}

/** True when the cursor is over this workspace or a parent Outputs section. */
export function isPointInsideRelatedOutputsZone(
  root: HTMLElement | null | undefined,
  x: number,
  y: number,
): boolean {
  if (!root || typeof document === "undefined") return false
  if (isPointInsideElement(root, x, y)) return true
  const zones = document.querySelectorAll(`[${OUTPUTS_DROPZONE_ATTR}="true"]`)
  for (const zone of zones) {
    if (!(zone instanceof HTMLElement)) continue
    if (!isOutputsDropzoneHit(root, zone)) continue
    if (isPointInsideElement(zone, x, y)) return true
  }
  return false
}

async function pdfFileToHtml(file: File): Promise<string> {
  const text = await pdfBytesToPlainText(new Uint8Array(await file.arrayBuffer()))
  const html = plainToHtml(text)
  if (html === "<p></p>") {
    throw new Error("Could not read text from this PDF")
  }
  return html
}

export function importUrlToArtifactContent(url: string): ImportedArtifactFile {
  const safe = escapeHtml(url)
  const imported = buildContentJson(`<p><a href="${safe}">${safe}</a></p>`)
  let title = url
  try {
    title = new URL(url).hostname.replace(/^www\./, "") || url
  } catch {
    /* keep url */
  }
  return { ...imported, title }
}

export async function importFileToArtifactContent(file: File): Promise<ImportedArtifactFile> {
  const ext = fileExtension(file.name)
  const mime = (file.type || "").toLowerCase()
  let html = "<p></p>"

  if (ext === "docx" || mime === DOCX_MIME || ext === "doc" || mime === DOC_MIME) {
    html = await docxArrayBufferToHtml(await file.arrayBuffer())
  } else if (ext === "pdf" || mime === "application/pdf") {
    html = await pdfFileToHtml(file)
  } else if (ext === "html" || ext === "htm" || mime === "text/html") {
    const raw = (await file.text()).trim()
    html = raw || "<p></p>"
  } else {
    html = plainToHtml(await file.text())
  }

  const imported = buildContentJson(html)
  return { ...imported, title: titleFromFileName(file.name) }
}

import type { JSONContent } from "@tiptap/core"
import { generateHTML, generateJSON } from "@tiptap/html"
import { Node } from "@tiptap/pm/model"
import * as Y from "yjs"
import {
  prosemirrorJSONToYDoc,
  prosemirrorToYXmlFragment,
  yDocToProsemirrorJSON,
} from "y-prosemirror"
import {
  getCollaborativeTipTapExtensions,
  getCollaborativeTipTapSchema,
  TIPTAP_COLLAB_SCHEMA_VERSION,
} from "./tiptap-collab-schema"
import {
  editorialPlainText,
  hasLeftoverMarkdown,
  normalizeLeftoverMarkdownHtml,
} from "./tiptap-json-to-yxml"

export { TIPTAP_COLLAB_SCHEMA_VERSION }

export const YDOC_FRAGMENT_NAME = "default"

export type ArtifactTipTapDoc = JSONContent & { type: "doc" }

export function extractArtifactSeedJson(contentJson: unknown): ArtifactTipTapDoc | null {
  if (!contentJson || typeof contentJson !== "object") return null
  const row = contentJson as { type?: unknown; tiptap?: unknown }
  if (row.type === "doc" && Array.isArray((row as ArtifactTipTapDoc).content)) {
    return row as ArtifactTipTapDoc
  }
  const nested = row.tiptap
  if (nested && typeof nested === "object" && (nested as ArtifactTipTapDoc).type === "doc") {
    return nested as ArtifactTipTapDoc
  }
  return null
}

export function extractArtifactSeedHtml(contentJson: unknown): string | null {
  if (!contentJson || typeof contentJson !== "object") return null
  const blocks = Array.isArray((contentJson as { blocks?: unknown }).blocks)
    ? (contentJson as { blocks: Array<Record<string, unknown>> }).blocks
    : []
  const htmlParts = blocks
    .map((block) => (typeof block?.html === "string" ? block.html.trim() : ""))
    .filter(Boolean)
  return htmlParts.length > 0 ? htmlParts.join("") : null
}

export function htmlToTipTapJson(html: string): ArtifactTipTapDoc {
  const json = generateJSON(
    normalizeLeftoverMarkdownHtml(html),
    getCollaborativeTipTapExtensions(),
  ) as ArtifactTipTapDoc
  if (json?.type !== "doc") {
    return { type: "doc", content: [{ type: "paragraph" }] }
  }
  return json
}

export function tipTapJsonToHtml(json: JSONContent): string {
  return generateHTML(json, getCollaborativeTipTapExtensions())
}

export function tipTapJsonToYDoc(json: JSONContent): Y.Doc {
  const schema = getCollaborativeTipTapSchema()
  return prosemirrorJSONToYDoc(schema, json, YDOC_FRAGMENT_NAME)
}

export function yDocToTipTapJson(document: Y.Doc): ArtifactTipTapDoc {
  const json = yDocToProsemirrorJSON(document, YDOC_FRAGMENT_NAME) as ArtifactTipTapDoc
  if (json?.type !== "doc") return { type: "doc", content: [{ type: "paragraph" }] }
  return json
}

export function yDocToHtml(document: Y.Doc): string {
  return tipTapJsonToHtml(yDocToTipTapJson(document))
}

export function yDocToPlainText(document: Y.Doc): string {
  return tipTapJsonToPlainText(yDocToTipTapJson(document))
}

export function tipTapJsonToPlainText(node: JSONContent | null | undefined): string {
  if (!node) return ""
  if (node.type === "text") return String(node.text ?? "")
  if (node.type === "hardBreak") return "\n"
  const children = Array.isArray(node.content) ? node.content : []
  const joined = children.map((child) => tipTapJsonToPlainText(child)).join("")
  if (
    node.type === "paragraph"
    || node.type === "heading"
    || node.type === "listItem"
    || node.type === "taskItem"
    || node.type === "tableRow"
  ) {
    return joined ? `${joined}\n` : ""
  }
  return joined
}

export function encodeYDocSnapshot(document: Y.Doc): {
  snapshot: Uint8Array
  stateVector: Uint8Array
} {
  return {
    snapshot: Y.encodeStateAsUpdate(document),
    stateVector: Y.encodeStateVector(document),
  }
}

export function repairLeftoverMarkdownYDoc(document: Y.Doc, origin = "repair:markdown"): boolean {
  const html = yDocToHtml(document)
  if (!hasLeftoverMarkdown(html)) return false
  const next = htmlToTipTapJson(html)
  replaceYDocContent(document, next, origin)
  return true
}

function jsonHasLinkMark(node: JSONContent | null | undefined): boolean {
  if (!node) return false
  if (node.type === "text" && Array.isArray(node.marks) && node.marks.some((mark) => mark.type === "link")) {
    return true
  }
  return (node.content ?? []).some((child) => jsonHasLinkMark(child))
}

function jsonHasLiteralAnchor(node: JSONContent | null | undefined): boolean {
  if (!node) return false
  if (node.type === "text" && /<a\b[^>]*href\s*=/i.test(String(node.text ?? ""))) return true
  return (node.content ?? []).some((child) => jsonHasLiteralAnchor(child))
}

function unescapeEscapedAnchors(html: string): string {
  return String(html ?? "").replace(
    /&lt;a([\s\S]*?)&gt;([\s\S]*?)&lt;\/a&gt;/gi,
    (_match, attrs, text) => {
      const decoded = String(attrs ?? "")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, "&")
      return `<a${decoded}>${text}</a>`
    },
  )
}

/**
 * Promote leftover `<a href>` strings (or escaped `&lt;a href`) into TipTap
 * link marks without changing editorial text.
 */
export function repairLiteralHtmlAnchorsYDoc(document: Y.Doc, origin = "repair:html-anchors"): boolean {
  const json = yDocToTipTapJson(document)
  const html = yDocToHtml(document)
  if (!jsonHasLiteralAnchor(json) && !/&lt;a\b[^&]*href/i.test(html)) return false
  const next = htmlToTipTapJson(unescapeEscapedAnchors(html))
  if (!jsonHasLinkMark(next)) return false
  if (editorialPlainText(yDocToPlainText(document)) !== editorialPlainText(tipTapJsonToPlainText(next))) {
    return false
  }
  replaceYDocContent(document, next, origin)
  return true
}

export function replaceYDocContent(
  document: Y.Doc,
  json: JSONContent,
  origin: string,
): Uint8Array {
  const schema = getCollaborativeTipTapSchema()
  const node = Node.fromJSON(schema, json)
  const before = Y.encodeStateVector(document)
  const fragment = document.getXmlFragment(YDOC_FRAGMENT_NAME)
  document.transact(() => {
    if (fragment.length > 0) fragment.delete(0, fragment.length)
    prosemirrorToYXmlFragment(node, fragment)
  }, origin)
  return Y.encodeStateAsUpdate(document, before)
}

export function buildProjectedContentJson(args: {
  previous?: Record<string, unknown> | null
  html: string
  text: string
  tiptap: JSONContent
}): Record<string, unknown> {
  return {
    ...(args.previous ?? {}),
    version: Number(args.previous?.version ?? 1) || 1,
    editor_kind: "rich_text",
    content_format: "tiptap_json",
    tiptap: args.tiptap,
    blocks: [
      {
        id: "body",
        type: "rich_text",
        html: args.html,
        text: args.text,
      },
    ],
  }
}

export function htmlToYDoc(html: string): Y.Doc {
  return tipTapJsonToYDoc(htmlToTipTapJson(html))
}

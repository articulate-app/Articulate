import * as Y from "yjs"
import { resolveYdocSeedSource } from "./seed-policy"

export function seedEmptyRichTextYdoc(document: Y.Doc): void {
  document.getXmlFragment("default")
}

export function artifactHasExistingEditorContent(args: {
  contentJson?: unknown
  contentText?: string | null
}): boolean {
  const text = String(args.contentText ?? "").trim()
  if (text && text !== "<p></p>") return true
  const contentJson = args.contentJson && typeof args.contentJson === "object"
    ? args.contentJson as { blocks?: unknown }
    : null
  return Array.isArray(contentJson?.blocks) && contentJson.blocks.length > 0
}

export function resolveSeedHtml(args: {
  contentJson: unknown
  contentText: string | null | undefined
  extractHtml: (contentJson: unknown) => string | null
}): { source: "content_json" | "html" | "empty"; html: string } {
  return resolveYdocSeedSource({
    contentJsonHtml: args.extractHtml(args.contentJson),
    contentText: args.contentText,
  })
}

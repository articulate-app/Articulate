import type { JSONContent } from "@tiptap/core"
import { KNOWN_COLLAB_MARK_TYPES, KNOWN_COLLAB_NODE_TYPES } from "./tiptap-collab-schema"
import { tipTapJsonToPlainText } from "./ydoc-content"

export type SeedCompareFailure = {
  ok: false
  reason: "unknown_node" | "unknown_mark" | "binary_image" | "empty_overwrite" | "semantic_loss"
  nodes: string[]
  message: string
}

export type SeedCompareSuccess = {
  ok: true
}

export type SeedCompareResult = SeedCompareSuccess | SeedCompareFailure

function walk(
  node: JSONContent | null | undefined,
  visit: (node: JSONContent) => void,
): void {
  if (!node || typeof node !== "object") return
  visit(node)
  for (const child of node.content ?? []) walk(child, visit)
}

function collectUnknown(node: JSONContent): { nodes: string[]; marks: string[] } {
  const nodes: string[] = []
  const marks: string[] = []
  walk(node, (current) => {
    const type = String(current.type ?? "")
    if (type && !KNOWN_COLLAB_NODE_TYPES.has(type)) nodes.push(type)
    for (const mark of current.marks ?? []) {
      const markType = String(mark.type ?? "")
      if (markType && !KNOWN_COLLAB_MARK_TYPES.has(markType)) marks.push(markType)
    }
  })
  return { nodes: [...new Set(nodes)], marks: [...new Set(marks)] }
}

function collectAttachmentIds(node: JSONContent): string[] {
  const ids: string[] = []
  walk(node, (current) => {
    if (current.type !== "attachmentBlock") return
    const id = String(current.attrs?.attachmentId ?? "")
    if (id) ids.push(id)
  })
  return ids.sort()
}

function collectCommentIds(node: JSONContent): string[] {
  const ids: string[] = []
  walk(node, (current) => {
    for (const mark of current.marks ?? []) {
      if (mark.type !== "comment") continue
      const id = String(mark.attrs?.commentId ?? "")
      if (id) ids.push(id)
    }
  })
  return ids.sort()
}

function collectNodeSequence(node: JSONContent): string[] {
  const types: string[] = []
  walk(node, (current) => {
    if (current.type && current.type !== "text") types.push(current.type)
  })
  return types
}

function hasBinaryImageSrc(node: JSONContent): boolean {
  let found = false
  walk(node, (current) => {
    const src = String(current.attrs?.src ?? "")
    if (src.startsWith("data:")) found = true
  })
  return found
}

function normalizeText(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim()
}

export function compareSeedDocuments(args: {
  original: JSONContent
  converted: JSONContent
  sourceWasEmpty: boolean
}): SeedCompareResult {
  const unknownOriginal = collectUnknown(args.original)
  if (unknownOriginal.nodes.length > 0) {
    return {
      ok: false,
      reason: "unknown_node",
      nodes: unknownOriginal.nodes,
      message: `Unknown TipTap nodes cannot be seeded: ${unknownOriginal.nodes.join(", ")}`,
    }
  }
  const unknownConverted = collectUnknown(args.converted)
  if (unknownConverted.nodes.length > 0 || unknownConverted.marks.length > 0) {
    return {
      ok: false,
      reason: unknownConverted.nodes.length > 0 ? "unknown_node" : "unknown_mark",
      nodes: [...unknownConverted.nodes, ...unknownConverted.marks],
      message: `Converted document contains unsupported types: ${[...unknownConverted.nodes, ...unknownConverted.marks].join(", ")}`,
    }
  }
  if (hasBinaryImageSrc(args.original) || hasBinaryImageSrc(args.converted)) {
    return {
      ok: false,
      reason: "binary_image",
      nodes: ["attachmentBlock"],
      message: "Inline binary image data is not stored in Y.Doc. Keep files in Storage.",
    }
  }

  const originalText = normalizeText(tipTapJsonToPlainText(args.original))
  const convertedText = normalizeText(tipTapJsonToPlainText(args.converted))
  if (!args.sourceWasEmpty && originalText && !convertedText) {
    return {
      ok: false,
      reason: "empty_overwrite",
      nodes: ["doc"],
      message: "Seed conversion produced an empty document over existing content.",
    }
  }
  if (originalText !== convertedText) {
    return {
      ok: false,
      reason: "semantic_loss",
      nodes: ["text"],
      message: "Seed conversion lost or changed visible text.",
    }
  }
  if (collectAttachmentIds(args.original).join() !== collectAttachmentIds(args.converted).join()) {
    return {
      ok: false,
      reason: "semantic_loss",
      nodes: ["attachmentBlock"],
      message: "Seed conversion lost attachment references.",
    }
  }
  if (collectCommentIds(args.original).join() !== collectCommentIds(args.converted).join()) {
    return {
      ok: false,
      reason: "semantic_loss",
      nodes: ["comment"],
      message: "Seed conversion lost comment marks.",
    }
  }
  const originalSeq = collectNodeSequence(args.original).join(",")
  const convertedSeq = collectNodeSequence(args.converted).join(",")
  if (originalSeq !== convertedSeq) {
    return {
      ok: false,
      reason: "semantic_loss",
      nodes: ["structure"],
      message: "Seed conversion changed block structure.",
    }
  }
  return { ok: true }
}

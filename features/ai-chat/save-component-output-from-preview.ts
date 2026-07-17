import { getSupabaseBrowser } from "../../lib/supabase-browser"
import { normalizeMixedRichText } from "../../app/lib/rich-text-normalization"

export type ComponentOutputContentBlock =
  | { type: "paragraph"; text: string }
  | {
      type: "attachment"
      attachment_id: string
      width_pct?: number
      [key: string]: unknown
    }

export function extractOutputContentBlocksFromHtml(html: string): ComponentOutputContentBlock[] {
  if (typeof window === "undefined") return [{ type: "paragraph", text: html }]
  const parser = new DOMParser()
  const doc = parser.parseFromString(html || "", "text/html")
  const blocks: ComponentOutputContentBlock[] = []
  for (const node of Array.from(doc.body.children)) {
    if (!(node instanceof HTMLElement)) continue
    const attachmentId = node.getAttribute("data-attachment-id")
    if (attachmentId) {
      const styleWidth = node.style?.width ?? ""
      const widthMatch = styleWidth.match(/^(\d+(?:\.\d+)?)%$/)
      const widthValue = widthMatch ? Number(widthMatch[1]) : Number.NaN
      const width_pct = Number.isFinite(widthValue) ? Math.max(20, Math.min(100, widthValue)) : undefined
      blocks.push({
        type: "attachment",
        attachment_id: attachmentId,
        ...(width_pct != null ? { width_pct } : {}),
      })
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

export function contentBlocksToPlainText(blocks: ComponentOutputContentBlock[]): string {
  const toPlain = (value: string): string => {
    if (typeof window === "undefined") return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
    const parser = new DOMParser()
    const doc = parser.parseFromString(value, "text/html")
    return (doc.body.textContent ?? "").replace(/\s+/g, " ").trim()
  }
  return blocks
    .filter((block): block is { type: "paragraph"; text: string } => block.type === "paragraph")
    .map((block) => toPlain(block.text))
    .filter((text) => text.trim().length > 0)
    .join("\n")
}

export function sanitizeBlocksForSave(
  blocks: ComponentOutputContentBlock[],
): Array<{ type: "paragraph"; text: string } | { type: "attachment"; attachment_id: string; width_pct?: number }> {
  return blocks.map((block) => {
    if (block.type === "attachment") {
      const widthPctRaw = Number(block.width_pct)
      const width_pct = Number.isFinite(widthPctRaw) ? Math.max(20, Math.min(100, widthPctRaw)) : undefined
      return {
        type: "attachment",
        attachment_id: block.attachment_id,
        ...(width_pct != null ? { width_pct } : {}),
      }
    }
    return {
      type: "paragraph",
      text: block.text ?? "",
    }
  })
}

function wouldDropAttachments(
  previousBlocks: ComponentOutputContentBlock[],
  nextBlocks: ComponentOutputContentBlock[],
): boolean {
  const prevAttachmentIds = new Set(
    previousBlocks
      .filter((block): block is { type: "attachment"; attachment_id: string } => block.type === "attachment")
      .map((block) => block.attachment_id)
      .filter(Boolean),
  )
  if (prevAttachmentIds.size === 0) return false
  const nextAttachmentIds = new Set(
    nextBlocks
      .filter((block): block is { type: "attachment"; attachment_id: string } => block.type === "attachment")
      .map((block) => block.attachment_id)
      .filter(Boolean),
  )
  for (const attachmentId of Array.from(prevAttachmentIds)) {
    if (!nextAttachmentIds.has(attachmentId)) return true
  }
  return false
}

export function htmlToPreviewBlocks(html: string): Array<{ type: "paragraph"; text: string }> {
  const blocks = extractOutputContentBlocksFromHtml(html)
  const sanitized = sanitizeBlocksForSave(blocks) as Array<{ type: "paragraph"; text: string }>
  if (sanitized.length > 0) return sanitized
  const normalized = normalizeMixedRichText(html)
  if (!normalized.trim()) return []
  return [{ type: "paragraph", text: normalized }]
}

export async function saveComponentOutputFromPreview(args: {
  taskComponentOutputId: string
  html: string
  previousBlocks?: ComponentOutputContentBlock[]
}): Promise<{ ok: true; blocks: ComponentOutputContentBlock[]; contentText: string } | { ok: false }> {
  const outputId = args.taskComponentOutputId.trim()
  if (!outputId) return { ok: false }

  const nextBlocks = extractOutputContentBlocksFromHtml(args.html)
  const previousBlocks = args.previousBlocks ?? []
  if (wouldDropAttachments(previousBlocks, nextBlocks)) {
    console.error("[ComponentEditPreview] blocked save because attachment blocks would be dropped", {
      outputId,
    })
    return { ok: false }
  }

  const sanitizedBlocks = sanitizeBlocksForSave(nextBlocks)
  const contentText = contentBlocksToPlainText(sanitizedBlocks as ComponentOutputContentBlock[])
  const supabase = getSupabaseBrowser()
  const { error } = await supabase.rpc("save_task_component_output_content", {
    p_output_id: outputId,
    p_content_text: contentText,
    p_content_json: sanitizedBlocks,
  })
  if (error) {
    console.error("[ComponentEditPreview] save_task_component_output_content failed", { outputId, error })
    return { ok: false }
  }

  return {
    ok: true,
    blocks: sanitizedBlocks as ComponentOutputContentBlock[],
    contentText,
  }
}

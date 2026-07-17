import type { TaskChannelBootstrapComposedOutputRow } from "@/lib/types/task-channel-bootstrap"
import {
  renderComponentOutputPreviewHtml,
  type ComponentOutputPreviewBlock,
} from "./component-output-preview-render"

function rowHasRenderableOutput(row: TaskChannelBootstrapComposedOutputRow): boolean {
  if (typeof row.content_text === "string" && row.content_text.trim()) return true
  const candidates = [row.content_json, row.resolved_content_json, row.content]
  return candidates.some((value) => Array.isArray(value) && value.length > 0)
}

function blocksFromRow(row: TaskChannelBootstrapComposedOutputRow): ComponentOutputPreviewBlock[] | null {
  const raw = row.content_json ?? row.resolved_content_json ?? row.content
  if (!Array.isArray(raw)) return null
  return raw as ComponentOutputPreviewBlock[]
}

/** First composed_output row with generated content, ordered by position. */
export function findFirstChannelOutputRow(
  composedOutput: TaskChannelBootstrapComposedOutputRow[] | null | undefined,
): TaskChannelBootstrapComposedOutputRow | null {
  if (!Array.isArray(composedOutput) || composedOutput.length === 0) return null
  const sorted = [...composedOutput].sort(
    (a, b) => (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER),
  )
  return sorted.find(rowHasRenderableOutput) ?? null
}

export function previewHtmlFromChannelOutputRow(
  row: TaskChannelBootstrapComposedOutputRow,
): string {
  return renderComponentOutputPreviewHtml({
    phase: "saved",
    contentText: row.content_text ?? "",
    contentJson: blocksFromRow(row),
    componentTitle: row.title,
  })
}

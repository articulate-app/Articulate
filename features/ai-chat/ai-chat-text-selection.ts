"use client"

import { create } from "zustand"
import { hashPreviewContent } from "../../app/lib/component-edit-preview-lifecycle"

/**
 * "Ask/Edit selected text with AI" — shared model for text highlighted inside a component output
 * or a chat message. This travels to the backend as `selected_text_context` (source material, not
 * an automatic write instruction). The backend classifies the user instruction.
 */

export type AiTextSelectionSourceType = "component_output" | "chat_message"

/** Top-level `selected_context_type` for a text-selection request. */
export type AiTextSelectionContextType = "component_text_selection" | "chat_text_selection"

export type AiSelectedTextContext = {
  source_type: AiTextSelectionSourceType
  selected_text: string
  selection_before?: string
  selection_after?: string
  selection_start?: number
  selection_end?: number

  // component output selections only
  task_id?: number
  channel_id?: number
  component_id?: string
  task_component_output_id?: string
  component_title?: string
  task_title?: string
  channel_name?: string
  full_content_hash?: string

  // chat selections only
  message_id?: string
  role?: "user" | "assistant"
}

export function selectedContextTypeForSource(
  sourceType: AiTextSelectionSourceType,
): AiTextSelectionContextType {
  return sourceType === "component_output" ? "component_text_selection" : "chat_text_selection"
}

/** Chip label: component → task/channel/component title; chat → "Selected chat text". */
export function chipLabelForSelection(context: AiSelectedTextContext): string {
  if (context.source_type === "chat_message") return "Selected chat text"
  const parts = [context.task_title, context.channel_name, context.component_title]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
  return parts.length > 0 ? parts.join(" / ") : "Selected component text"
}

const SELECTION_CONTEXT_CHARS = 300

/** Compute selected text + ~300 char before/after context + offsets relative to `container` text. */
export function computeRangeTextParts(
  container: HTMLElement,
  range: Range,
): {
  selected_text: string
  selection_before: string
  selection_after: string
  selection_start: number
  selection_end: number
  full_text: string
} {
  const fullText = container.textContent ?? ""
  const preRange = range.cloneRange()
  preRange.selectNodeContents(container)
  preRange.setEnd(range.startContainer, range.startOffset)
  const before = preRange.toString()
  const selected = range.toString()
  const start = before.length
  const end = start + selected.length
  const after = fullText.slice(end)
  return {
    selected_text: selected,
    selection_before: before.slice(-SELECTION_CONTEXT_CHARS),
    selection_after: after.slice(0, SELECTION_CONTEXT_CHARS),
    selection_start: start,
    selection_end: end,
    full_text: fullText,
  }
}

export function computeFullContentHash(text: string): string {
  return hashPreviewContent(text)
}

export type PendingAiTextSelection = {
  context: AiSelectedTextContext
  /** Monotonic token so the composer can focus exactly once per attach. */
  token: number
}

type AiChatTextSelectionState = {
  pending: PendingAiTextSelection | null
  /** Attach a highlighted passage as free-form context. The user types the instruction themselves. */
  setPendingSelection: (context: AiSelectedTextContext) => void
  clearPendingSelection: () => void
}

let selectionToken = 0

export const useAiChatTextSelectionStore = create<AiChatTextSelectionState>((set) => ({
  pending: null,
  setPendingSelection: (context) => {
    selectionToken += 1
    set({ pending: { context, token: selectionToken } })
  },
  clearPendingSelection: () => set({ pending: null }),
}))

import type { ComponentEditStreamEntry } from "../../app/store/component-edit-stream"
import type { AiActiveFieldContext } from "./active-field-context"
import { isComponentOutputActiveFieldContext } from "./active-field-context"
import {
  buildStreamingPreviewBlocks,
  isComponentOutputStreamingPhase,
  renderComponentOutputPreviewHtml,
  renderFinalComponentOutputFromBlocks,
} from "../tasks/utils/component-output-preview-render"
import {
  componentEditStreamKey,
  isLiveComponentEditStreamPhase,
  type ComponentEditPreviewContentJsonBlock,
} from "../../app/store/component-edit-stream"

export { isLiveComponentEditStreamPhase, isTerminalComponentEditStreamPhase } from "../../app/store/component-edit-stream"

export type { ComponentEditPreviewContentJsonBlock }

export type ComponentEditStreamContext = {
  key: string
  taskId: number
  channelId: number
  componentId: string
  taskComponentOutputId: string | null
  componentTitle: string
  assistantTempId?: string | null
}

export function resolveComponentEditStreamContext(
  activeFieldContext: AiActiveFieldContext | undefined,
  taskId: number | undefined,
  activeChannelId: number | null | undefined,
): ComponentEditStreamContext | null {
  if (!isComponentOutputActiveFieldContext(activeFieldContext)) return null

  const resolvedTaskId =
    activeFieldContext.taskId != null && Number.isFinite(activeFieldContext.taskId)
      ? activeFieldContext.taskId
      : taskId
  const resolvedChannelId =
    activeFieldContext.channelId != null && Number.isFinite(activeFieldContext.channelId)
      ? activeFieldContext.channelId
      : activeChannelId
  const componentIdRaw = activeFieldContext.taskComponentId ?? activeFieldContext.componentId
  const componentId =
    typeof componentIdRaw === "string"
      ? componentIdRaw.trim()
      : componentIdRaw != null
        ? String(componentIdRaw)
        : ""

  if (resolvedTaskId == null || resolvedChannelId == null || !componentId) return null

  const componentTitle =
    (activeFieldContext.componentTitle ?? "").trim() ||
    (() => {
      const label = (activeFieldContext.label ?? "").trim()
      const prefix = "Component output · "
      if (label.startsWith(prefix)) return label.slice(prefix.length).trim()
      return label || "Component output"
    })()

  const taskComponentOutputId =
    typeof activeFieldContext.taskComponentOutputId === "string"
      ? activeFieldContext.taskComponentOutputId
      : null

  return {
    key: componentEditStreamKey(
      resolvedTaskId,
      resolvedChannelId,
      componentId,
      taskComponentOutputId,
    ),
    taskId: resolvedTaskId,
    channelId: resolvedChannelId,
    componentId,
    taskComponentOutputId,
    componentTitle,
  }
}

export function isLiveComponentEditStream(
  entry: Pick<ComponentEditStreamEntry, "phase"> | null | undefined,
): boolean {
  return !!entry && isLiveComponentEditStreamPhase(entry.phase)
}

export function normalizePreviewContentJson(value: unknown): ComponentEditPreviewContentJsonBlock[] | null {
  if (!Array.isArray(value)) return null
  const blocks: ComponentEditPreviewContentJsonBlock[] = []
  for (const item of value) {
    if (!item || typeof item !== "object") continue
    blocks.push(item as ComponentEditPreviewContentJsonBlock)
  }
  return blocks.length > 0 ? blocks : null
}

export function buildEditStreamMergedPlainText(
  entry: Pick<ComponentEditStreamEntry, "operation" | "baseContentText" | "contentText">,
): string {
  if (entry.operation === "append") {
    return [entry.baseContentText.trim(), entry.contentText.trim()].filter(Boolean).join("\n\n")
  }
  return entry.contentText.trim()
}

export function buildEditStreamDisplayHtml(
  entry: Pick<
    ComponentEditStreamEntry,
    "phase" | "operation" | "baseContentText" | "contentText" | "contentJson" | "componentTitle"
  >,
): string {
  return renderComponentOutputPreviewHtml({
    phase: entry.phase,
    operation: entry.operation,
    baseContentText: entry.baseContentText,
    contentText: entry.contentText,
    contentJson: entry.contentJson,
    componentTitle: entry.componentTitle,
  })
}

/** Pending append/replace blocks only (excludes captured base content). */
export function buildEditStreamPendingPreviewBlocks(
  entry: Pick<
    ComponentEditStreamEntry,
    "phase" | "operation" | "baseContentText" | "contentText" | "contentJson" | "displayHtml" | "componentTitle"
  >,
): Array<{ type: "paragraph"; text: string }> {
  if (isComponentOutputStreamingPhase(entry.phase)) {
    const text =
      entry.operation === "append"
        ? entry.contentText.trim()
        : buildEditStreamMergedPlainText(entry)
    return buildStreamingPreviewBlocks(text)
  }

  if (entry.contentJson?.length) {
    const html = renderFinalComponentOutputFromBlocks(entry.contentJson, entry.componentTitle)
    return html ? [{ type: "paragraph", text: html }] : []
  }

  const html = entry.displayHtml || buildEditStreamDisplayHtml(entry)
  if (html.trim()) return [{ type: "paragraph", text: html }]
  const pendingText = entry.contentText.trim()
  if (!pendingText) return []
  const finalHtml = renderComponentOutputPreviewHtml({
    phase: entry.phase,
    operation: entry.operation,
    baseContentText: entry.baseContentText,
    contentText: pendingText,
    componentTitle: entry.componentTitle,
  })
  return finalHtml ? [{ type: "paragraph", text: finalHtml }] : []
}

/** Full optimistic output snapshot for cache replace (base + pending append, or replacement). */
export function buildEditStreamOptimisticOutputBlocks(
  entry: Pick<
    ComponentEditStreamEntry,
    "phase" | "operation" | "baseContentText" | "contentText" | "contentJson" | "displayHtml" | "componentTitle"
  >,
): Array<{ type: "paragraph"; text: string }> {
  if (isComponentOutputStreamingPhase(entry.phase)) {
    return buildEditStreamPendingPreviewBlocks(entry)
  }

  if (entry.operation === "append") {
    const baseBlocks = streamTextToPreviewBlocks(entry.baseContentText, entry.componentTitle)
    const pendingBlocks = buildEditStreamPendingPreviewBlocks(entry)
    if (baseBlocks.length === 0) return pendingBlocks
    if (pendingBlocks.length === 0) return baseBlocks
    return [...baseBlocks, ...pendingBlocks]
  }
  return buildEditStreamPendingPreviewBlocks(entry)
}

/** Blocks for chat preview cards (merged display for append). */
export function buildEditStreamPreviewBlocks(
  entry: Pick<
    ComponentEditStreamEntry,
    "phase" | "operation" | "baseContentText" | "contentText" | "contentJson" | "displayHtml" | "componentTitle"
  >,
): Array<{ type: "paragraph"; text: string }> {
  if (isComponentOutputStreamingPhase(entry.phase)) {
    const merged =
      entry.operation === "append"
        ? [entry.baseContentText.trim(), entry.contentText.trim()].filter(Boolean).join("\n\n")
        : buildEditStreamMergedPlainText(entry)
    return buildStreamingPreviewBlocks(merged)
  }

  if (entry.contentJson?.length) {
    return buildEditStreamPendingPreviewBlocks(entry)
  }

  const html = entry.displayHtml || buildEditStreamDisplayHtml(entry)
  if (html.trim()) return [{ type: "paragraph", text: html }]
  const merged = buildEditStreamMergedPlainText(entry)
  if (!merged) return []
  const finalHtml = renderComponentOutputPreviewHtml({
    phase: entry.phase,
    operation: entry.operation,
    baseContentText: entry.baseContentText,
    contentText: merged,
    componentTitle: entry.componentTitle,
  })
  return finalHtml ? [{ type: "paragraph", text: finalHtml }] : []
}

/** @deprecated use buildEditStreamPreviewBlocks */
export function streamTextToPreviewBlocks(
  text: string,
  componentTitle?: string | null,
): Array<{ type: "paragraph"; text: string }> {
  const trimmed = (text ?? "").trim()
  if (!trimmed) return []
  const html = renderComponentOutputPreviewHtml({
    phase: "completed",
    contentText: trimmed,
    componentTitle,
  })
  return [{ type: "paragraph", text: html || trimmed }]
}

export function buildComponentEditStreamContext(args: {
  key: string
  taskId: number
  channelId: number
  componentId: string
  taskComponentOutputId?: string | null
  componentTitle?: string
  assistantTempId?: string | null
}): ComponentEditStreamContext {
  return {
    key: args.key,
    taskId: args.taskId,
    channelId: args.channelId,
    componentId: args.componentId,
    taskComponentOutputId: args.taskComponentOutputId ?? null,
    componentTitle: (args.componentTitle ?? "").trim() || "Component",
    assistantTempId: args.assistantTempId ?? null,
  }
}

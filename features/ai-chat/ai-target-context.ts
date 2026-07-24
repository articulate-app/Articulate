import type { AiContextTag } from "./composer-inline-editor"
import { type ComponentOutputAiChatPayload } from "./active-field-context"
import type { AiClarificationContext } from "./ai-clarification"

export type AiContextSource =
  | "none"
  | "user_selected_current_task"
  | "user_selected_task"
  | "user_selected_component"
  | "mention"
  | "clarification"
  | "component_action"
  | "explicit_click"
  | "thread_pinned"
  | "text_selection"
  | "ambient"

export type AiSelectedContextType =
  | "general"
  | "task"
  | "component_output"
  | "artifact_text_selection"
  | "artifact_block"
  | "artifact_document"
  | "artifact_asset"
  | "artifact_image_point"
  | "artifact_image_rect"
  | "artifact_video_time"
  | "artifact_video_region"

export type AiTargetContext = {
  selectedContextType: AiSelectedContextType
  contextSource?: AiContextSource | null
  taskId?: number | null
  channelId?: number | null
  componentId?: string | null
  taskComponentOutputId?: string | null
  taskTitle?: string | null
  channelName?: string | null
  componentTitle?: string | null
}

export type AiAmbientContext = {
  center_task_id?: number | null
  active_channel_id?: number | null
  taskTab?: string | null
}

export type ResolvedAiChatOutboundContext = {
  taskId: number | null
  channelId: number | null
  activeChannelId: number | null
  componentId: string | null
  taskComponentOutputId: string | null
  selectedContextType: AiSelectedContextType
  selectedComponentLabel: string | null
  contextSource: AiContextSource | null
  mode: "build_component" | "build_briefing" | "assistant_only" | null
}

export const GENERAL_AI_TARGET_CONTEXT: AiTargetContext = {
  selectedContextType: "general",
  contextSource: "none",
  taskId: null,
  channelId: null,
  componentId: null,
  taskComponentOutputId: null,
}

export function aiTargetContextFromComponentPayload(
  payload: ComponentOutputAiChatPayload,
  contextSource: AiContextSource,
  labels?: {
    taskTitle?: string | null
    channelName?: string | null
    componentTitle?: string | null
  },
): AiTargetContext {
  return {
    selectedContextType: payload.selectedContextType === "task" ? "task" : "component_output",
    contextSource,
    taskId: payload.taskId,
    channelId: payload.channelId,
    componentId: payload.componentId,
    taskComponentOutputId: payload.taskComponentOutputId,
    taskTitle: labels?.taskTitle ?? null,
    channelName: labels?.channelName ?? null,
    componentTitle: labels?.componentTitle ?? payload.selectedComponentLabel,
  }
}

export function aiTargetContextFromClarification(
  context: AiClarificationContext,
): AiTargetContext {
  return {
    selectedContextType: "component_output",
    contextSource: "clarification",
    taskId: context.task_id,
    channelId: context.channel_id,
    componentId: context.component_id,
    taskComponentOutputId: context.task_component_output_id ?? null,
    componentTitle: context.selected_component_label ?? null,
  }
}

export function buildAiTargetContextChipLabel(target: AiTargetContext | null | undefined): string {
  if (!target || target.selectedContextType === "general") return "No context"

  const taskTitle = target.taskTitle?.trim() || (target.taskId != null ? `Task ${target.taskId}` : "Task")
  const channelName = target.channelName?.trim() || (target.channelId != null ? `Channel ${target.channelId}` : null)

  if (target.selectedContextType === "component_output") {
    const componentTitle =
      target.componentTitle?.trim() ||
      (target.componentId ? `Component ${target.componentId.slice(0, 8)}` : "Component")
    if (channelName) return `${taskTitle} / ${channelName} / ${componentTitle}`
    return `${taskTitle} / ${componentTitle}`
  }

  if (target.selectedContextType === "task") {
    if (channelName) return `${taskTitle} / ${channelName}`
    return `Task: ${taskTitle}`
  }

  return "No context"
}

function resolveContextSourceFromComponentTag(tag: AiContextTag): AiContextSource {
  if (tag.contextSource === "clarification") return "clarification"
  if (tag.contextSource === "component_action") return "component_action"
  if (tag.contextSource === "explicit_click") return "explicit_click"
  if (tag.source === "selection") return "component_action"
  return "mention"
}

const GENERAL_OUTBOUND_CONTEXT: ResolvedAiChatOutboundContext = {
  taskId: null,
  channelId: null,
  activeChannelId: null,
  componentId: null,
  taskComponentOutputId: null,
  selectedContextType: "general",
  selectedComponentLabel: null,
  contextSource: "none",
  mode: null,
}

/**
 * Resolve the outbound ai-chat context.
 *
 * The frontend does NOT pre-resolve final write targets — the backend builds a request-local
 * writable target registry and validates all writes. The only case where the FE sends a resolved
 * top-level write target is an explicit per-component "Build with AI" action.
 *
 * For everything else (task/channel/component tags, general chat) the raw signals travel via
 * `tagged_*` refs + `ambient_context`. When the user explicitly tagged/acted on a component we
 * still flag `selected_context_type: "component_output"` (rule 3), but the real
 * `task_channel_components.id` UUID is carried only by `tagged_task_component_refs`.
 */
export function resolveAiChatOutboundContext(args: {
  messageTags?: AiContextTag[]
  explicitBuild?: {
    componentId: string
    taskId?: number | null
    channelId?: number | null
    taskComponentOutputId?: string | null
    componentTitle?: string | null
  } | null
}): ResolvedAiChatOutboundContext {
  const messageTags = args.messageTags ?? []
  const componentTags = messageTags.filter((tag) => tag.type === "task_component")

  if (args.explicitBuild?.componentId) {
    return {
      taskId: args.explicitBuild.taskId ?? null,
      channelId: args.explicitBuild.channelId ?? null,
      activeChannelId: args.explicitBuild.channelId ?? null,
      componentId: args.explicitBuild.componentId,
      taskComponentOutputId: args.explicitBuild.taskComponentOutputId ?? null,
      selectedContextType: "component_output",
      selectedComponentLabel: args.explicitBuild.componentTitle ?? null,
      contextSource: "component_action",
      mode: "build_component",
    }
  }

  // Explicit component tag/selection: flag component-output intent, but leave the write target
  // for the backend to resolve from tagged_task_component_refs (no FE-resolved component_id).
  if (componentTags.length >= 1) {
    const primary = componentTags[0]!
    return {
      ...GENERAL_OUTBOUND_CONTEXT,
      selectedContextType: "component_output",
      selectedComponentLabel: primary.componentTitle?.trim() || primary.label?.trim() || null,
      contextSource: resolveContextSourceFromComponentTag(primary),
    }
  }

  // Task tags, project tags, and general chat: no top-level write target, no forced context type.
  return GENERAL_OUTBOUND_CONTEXT
}

import type { TaggedTaskComponentRef } from "./build-ai-chat-tagged-refs"
import type { AiContextTag } from "./composer-inline-editor"
import type { AiContextSource } from "./ai-target-context"

export type AiSelectedContextType = "component_output" | "task"

/** How component output context was established. Absent/null = ambient/stale (must not be sent). */
export type AiComponentSelectionSource = "explicit_click" | "component_action"

export type AiActiveFieldContext = {
  fieldType: string
  label: string
  entityId?: string | number | null
  componentId?: string | number | null
  instructions?: string | null
  /** Owning task when context is scoped to content (e.g. component output). */
  taskId?: number | null
  /** Active Content tab channel id. */
  channelId?: number | null
  /** `task_channel_components.id` (UUID). Same as `componentId` for component output context. */
  taskComponentId?: string | null
  taskComponentOutputId?: string | null
  /** Display title without the "Component output · " prefix. */
  componentTitle?: string | null
  /** Parent task title for composer chips and tagged_task_component_refs. */
  taskTitle?: string | null
  /** Active channel name for composer chips and tagged_task_component_refs. */
  channelName?: string | null
  selectedContextType?: AiSelectedContextType | null
  /** Set only when the user explicitly focused output or invoked a component action. */
  componentSelectionSource?: AiComponentSelectionSource | null
  /** Explicit AI write target — never inferred from ambient UI visibility alone. */
  contextSource?: AiContextSource | null
  /** Current persisted output revision (`updated_at`) for V2 selected-output edits. */
  outputUpdatedAt?: string | null
}

export function isComponentOutputActiveFieldContext(
  context: AiActiveFieldContext | undefined | null,
): context is AiActiveFieldContext & { selectedContextType: "component_output" } {
  if (!context) return false
  if (context.selectedContextType === "component_output") return true
  return context.fieldType?.toLowerCase() === "component_output"
}

export function isExplicitComponentOutputSelection(
  context: AiActiveFieldContext | undefined | null,
): boolean {
  if (!isComponentOutputActiveFieldContext(context)) return false
  return (
    context.componentSelectionSource === "explicit_click" ||
    context.componentSelectionSource === "component_action"
  )
}

export function isTaskLevelActiveFieldContext(
  context: AiActiveFieldContext | undefined | null,
): boolean {
  if (!context) return true
  if (isExplicitComponentOutputSelection(context)) return false
  const fieldType = context.fieldType?.toLowerCase() ?? ""
  if (fieldType === "task") return true
  return !fieldType.includes("component")
}

export function buildComponentOutputActiveFieldContext(args: {
  taskId: number
  channelId: number | null | undefined
  taskComponentId: string | null
  taskComponentOutputId: string | null
  componentTitle: string
  entityId?: string | number | null
  instructions?: string | null
  selectionSource?: AiComponentSelectionSource
  taskTitle?: string | null
  channelName?: string | null
}): AiActiveFieldContext {
  const title = args.componentTitle.trim() || "Component output"
  const label = title === "Component output" ? title : `Component output · ${title}`
  const taskComponentId = args.taskComponentId?.trim() || null
  return {
    fieldType: "component_output",
    label,
    entityId: args.entityId ?? null,
    componentId: taskComponentId,
    taskId: args.taskId,
    channelId: args.channelId ?? null,
    taskComponentId,
    taskComponentOutputId: args.taskComponentOutputId?.trim() || null,
    componentTitle: title,
    taskTitle: args.taskTitle?.trim() || null,
    channelName: args.channelName?.trim() || null,
    selectedContextType: "component_output",
    instructions: args.instructions ?? null,
    componentSelectionSource: args.selectionSource ?? null,
  }
}

export type ComponentOutputSelectionDiagnostics = {
  selectedContextType: "component_output" | "task" | null
  selectedComponentLabel: string | null
  componentId: string | null
  taskComponentOutputId: string | null
  sourceOfSelection: string
}

export function resolveComponentOutputSelectionDiagnostics(
  context: AiActiveFieldContext | undefined | null,
  fallbacks: { activeChannelId?: number | null; taskId?: number | null } = {},
  options: { taggedComponentRefs?: TaggedTaskComponentRef[] } = {},
): ComponentOutputSelectionDiagnostics {
  const payload = buildAiChatSelectionPayload(
    context,
    options.taggedComponentRefs ?? [],
  )
  const rawComponentId = isComponentOutputActiveFieldContext(context)
    ? context.taskComponentId ?? context.componentId
    : null
  const ambientComponentId =
    typeof rawComponentId === "string"
      ? rawComponentId.trim() || null
      : rawComponentId != null
        ? String(rawComponentId)
        : null

  let sourceOfSelection = "none"
  if (payload?.selectedContextType === "component_output") {
    if (context?.componentSelectionSource === "explicit_click") {
      sourceOfSelection = "explicit_click"
    } else if (context?.componentSelectionSource === "component_action") {
      sourceOfSelection = "component_action"
    } else if ((options.taggedComponentRefs?.length ?? 0) > 0) {
      sourceOfSelection = "tagged_component"
    } else {
      sourceOfSelection = "explicit_component"
    }
  } else if (payload?.selectedContextType === "task") {
    sourceOfSelection = context?.contextSource ?? "task_level"
  } else if (isComponentOutputActiveFieldContext(context)) {
    sourceOfSelection = context.componentSelectionSource
      ? `blocked_${context.componentSelectionSource}`
      : ambientComponentId
        ? "ambient_stale"
        : "none"
  } else if (isTaskLevelActiveFieldContext(context)) {
    sourceOfSelection = "task_level"
  }

  return {
    selectedContextType: payload?.selectedContextType ?? null,
    selectedComponentLabel: payload?.selectedComponentLabel ?? null,
    componentId: payload?.componentId ?? null,
    taskComponentOutputId: payload?.taskComponentOutputId ?? null,
    sourceOfSelection,
  }
}

export type ComponentOutputAiChatPayload = {
  activeChannelId: number | null
  channelId: number | null
  taskId: number | null
  mode: "assistant_only" | null
  componentId: string | null
  taskComponentOutputId: string | null
  selectedContextType: "component_output" | "task" | null
  selectedComponentLabel: string | null
}

function resolveSelectedComponentLabel(context: AiActiveFieldContext): string | null {
  return (
    (context.componentTitle ?? "").trim() ||
    (() => {
      const prefix = "Component output · "
      const label = (context.label ?? "").trim()
      if (label.startsWith(prefix)) return label.slice(prefix.length).trim()
      return label || null
    })()
  )
}

/**
 * Merge selected component-output context into ai-chat request fields.
 * Only returns payload when the user explicitly selected a component output.
 */
export function buildComponentOutputAiChatPayload(
  context: AiActiveFieldContext | undefined | null,
): ComponentOutputAiChatPayload | null {
  if (!isComponentOutputActiveFieldContext(context)) return null
  if (!isExplicitComponentOutputSelection(context)) return null

  const rawComponentId = context.taskComponentId ?? context.componentId
  const componentId =
    typeof rawComponentId === "string"
      ? rawComponentId.trim() || null
      : rawComponentId != null
        ? String(rawComponentId)
        : null
  if (!componentId) return null

  const resolvedChannelId =
    context.channelId != null && Number.isFinite(context.channelId) ? context.channelId : null

  const resolvedTaskId =
    context.taskId != null && Number.isFinite(context.taskId) ? context.taskId : null

  const taskComponentOutputId =
    typeof context.taskComponentOutputId === "string" && context.taskComponentOutputId.trim()
      ? context.taskComponentOutputId.trim()
      : null

  return {
    activeChannelId: resolvedChannelId,
    channelId: resolvedChannelId,
    taskId: resolvedTaskId,
    mode: "assistant_only",
    componentId,
    taskComponentOutputId,
    selectedContextType: "component_output",
    selectedComponentLabel: resolveSelectedComponentLabel(context),
  }
}

export function buildTaggedComponentAiChatPayload(
  taggedComponentRefs: TaggedTaskComponentRef[],
): ComponentOutputAiChatPayload | null {
  if (taggedComponentRefs.length !== 1) return null
  const ref = taggedComponentRefs[0]
  if (!ref?.component_id?.trim()) return null

  return {
    activeChannelId: ref.channel_id,
    channelId: ref.channel_id,
    taskId: ref.task_id,
    mode: "assistant_only",
    componentId: ref.component_id,
    taskComponentOutputId: null,
    selectedContextType: "component_output",
    selectedComponentLabel: ref.component_title?.trim() || null,
  }
}

export function buildPayloadFromTaskComponentTag(
  tag: AiContextTag,
): ComponentOutputAiChatPayload | null {
  if (tag.type !== "task_component") return null
  if (tag.taskId == null || tag.channelId == null || !tag.componentId?.trim()) return null

  return {
    activeChannelId: tag.channelId,
    channelId: tag.channelId,
    taskId: tag.taskId,
    mode: "assistant_only",
    componentId: tag.componentId.trim(),
    taskComponentOutputId: tag.taskComponentOutputId?.trim() || null,
    selectedContextType: "component_output",
    selectedComponentLabel: tag.componentTitle?.trim() || tag.label?.trim() || null,
  }
}

export function buildTaggedTaskAiChatPayload(
  tags: AiContextTag[],
): { payload: ComponentOutputAiChatPayload; contextSource: "mention" | "user_selected_current_task" } | null {
  const taskTags = tags.filter((tag) => tag.type === "task")
  const componentTags = tags.filter((tag) => tag.type === "task_component")
  if (taskTags.length !== 1 || componentTags.length > 0) return null

  const taskTag = taskTags[0]!
  const taskId = Number(taskTag.id)
  if (!Number.isFinite(taskId)) return null

  const resolvedChannelId =
    taskTag.channelId != null && Number.isFinite(taskTag.channelId) ? taskTag.channelId : null

  const contextSource =
    taskTag.contextSource === "user_selected_current_task" ? "user_selected_current_task" : "mention"

  return {
    contextSource,
    payload: {
      activeChannelId: resolvedChannelId,
      channelId: resolvedChannelId,
      taskId,
      mode: "assistant_only",
      componentId: null,
      taskComponentOutputId: null,
      selectedContextType: "task",
      selectedComponentLabel: null,
    },
  }
}

export function buildTaskLevelAiChatPayload(
  context: AiActiveFieldContext | undefined | null,
): ComponentOutputAiChatPayload | null {
  if (!context) return null
  const contextSource = context.contextSource
  const isExplicitTaskTarget =
    contextSource === "user_selected_current_task" || contextSource === "user_selected_task"
  if (!isExplicitTaskTarget) return null

  const resolvedTaskId =
    context.taskId != null && Number.isFinite(context.taskId) ? context.taskId : null
  if (resolvedTaskId == null) return null

  const resolvedChannelId =
    context.channelId != null && Number.isFinite(context.channelId) ? context.channelId : null

  return {
    activeChannelId: resolvedChannelId,
    channelId: resolvedChannelId,
    taskId: resolvedTaskId,
    mode: "assistant_only",
    componentId: null,
    taskComponentOutputId: null,
    selectedContextType: "task",
    selectedComponentLabel: null,
  }
}

/**
 * Resolve outbound ai-chat selection fields from explicit component focus or @ tags only.
 */
export function buildAiChatSelectionPayload(
  context: AiActiveFieldContext | undefined | null,
  taggedComponentRefs: TaggedTaskComponentRef[] = [],
): ComponentOutputAiChatPayload | null {
  const explicit = buildComponentOutputAiChatPayload(context)
  if (explicit) return explicit

  const tagged = buildTaggedComponentAiChatPayload(taggedComponentRefs)
  if (tagged) return tagged

  return buildTaskLevelAiChatPayload(context)
}

import type { AiActiveFieldContext } from "./active-field-context"
import {
  isComponentOutputActiveFieldContext,
  isExplicitComponentOutputSelection,
} from "./active-field-context"
import type { AiContextTag, AiTagType } from "./composer-inline-editor"

export function buildComposerSelectionTag(
  activeFieldContext?: AiActiveFieldContext,
): AiContextTag | null {
  if (!activeFieldContext) return null
  const label = activeFieldContext.label?.trim()
  if (!label) return null

  if (isComponentOutputActiveFieldContext(activeFieldContext)) {
    if (!isExplicitComponentOutputSelection(activeFieldContext)) return null

    const taskId =
      activeFieldContext.taskId != null && Number.isFinite(activeFieldContext.taskId)
        ? activeFieldContext.taskId
        : undefined
    const channelId =
      activeFieldContext.channelId != null && Number.isFinite(activeFieldContext.channelId)
        ? activeFieldContext.channelId
        : undefined
    const componentIdRaw = activeFieldContext.taskComponentId ?? activeFieldContext.componentId
    const componentId =
      typeof componentIdRaw === "string"
        ? componentIdRaw.trim() || undefined
        : componentIdRaw != null
          ? String(componentIdRaw)
          : undefined
    if (taskId == null || channelId == null || !componentId) return null

    const componentTitle =
      (activeFieldContext.componentTitle ?? "").trim() ||
      (() => {
        const prefix = "Component output · "
        if (label.startsWith(prefix)) return label.slice(prefix.length).trim()
        return label
      })()

    return {
      type: "task_component",
      id: componentId,
      label: componentTitle || label,
      source: "selection",
      taskId,
      channelId,
      componentId,
      componentTitle: componentTitle || label,
      taskTitle: activeFieldContext.taskTitle?.trim() || null,
      channelName: activeFieldContext.channelName?.trim() || null,
      taskComponentOutputId: activeFieldContext.taskComponentOutputId?.trim() || null,
      contextSource:
        activeFieldContext.contextSource
        ?? (activeFieldContext.componentSelectionSource === "component_action"
          ? "component_action"
          : activeFieldContext.componentSelectionSource === "explicit_click"
            ? "explicit_click"
            : null),
    }
  }

  const hasExplicitBinding =
    activeFieldContext.entityId != null || activeFieldContext.componentId != null
  if (!hasExplicitBinding) return null

  const normalizedFieldType = activeFieldContext.fieldType?.toLowerCase() ?? "task"
  const inferredType: AiTagType = normalizedFieldType.includes("project")
    ? "project"
    : normalizedFieldType.includes("user") ||
        normalizedFieldType.includes("assignee") ||
        normalizedFieldType.includes("watcher")
      ? "user"
      : normalizedFieldType.includes("component")
        ? "component"
        : "task"
  const rawId =
    activeFieldContext.entityId ??
    (inferredType === "component" ? activeFieldContext.componentId : null) ??
    `${inferredType}:${normalizedFieldType}:${label.toLowerCase()}`
  return {
    type: inferredType,
    id: rawId,
    label,
    source: "selection",
  }
}

/**
 * Composer selection chips for a context. A component-output selection renders as separate short
 * chips (task, channel, component) instead of one long `Task / Channel / Component` label. All
 * other selections return a single chip (or none).
 */
export function buildComposerSelectionTags(
  activeFieldContext?: AiActiveFieldContext,
): AiContextTag[] {
  const primary = buildComposerSelectionTag(activeFieldContext)
  if (!primary) return []

  if (primary.type !== "task_component") return [primary]

  const tags: AiContextTag[] = []

  if (primary.taskId != null && Number.isFinite(primary.taskId)) {
    const taskTitle = (primary.taskTitle ?? "").trim()
    tags.push({
      type: "task",
      id: primary.taskId,
      label: taskTitle || `Task ${primary.taskId}`,
      source: "selection",
      taskId: primary.taskId,
      taskTitle: taskTitle || null,
    })
  }

  if (primary.channelId != null && Number.isFinite(primary.channelId)) {
    const channelName = (primary.channelName ?? "").trim()
    tags.push({
      type: "channel",
      id: primary.channelId,
      label: channelName || `Channel ${primary.channelId}`,
      source: "selection",
      channelId: primary.channelId,
      channelName: channelName || null,
      taskId: primary.taskId,
      taskTitle: primary.taskTitle ?? null,
    })
  }

  tags.push(primary)
  return tags
}

import {
  isComponentOutputActiveFieldContext,
  type AiActiveFieldContext,
} from "./active-field-context"
import type { AiClarificationContext } from "./ai-clarification"
import type {
  AiChatV2Scope,
  AiChatV2ScopeSource,
  AiRunTarget,
  AiRunTargetSource,
} from "../../app/lib/ai/ai-chat-v2-types"
import type { AiSelectedContextType, AiContextSource, AiAmbientContext, ResolvedAiChatOutboundContext } from "./ai-target-context"
import type { AiSelectedTextContext } from "./ai-chat-text-selection"
import type { AiContextTag } from "./composer-inline-editor"
import type { AiAttachmentMeta } from "./types"
import {
  isRealTaskComponentOutputId,
  isWritableComponentId,
  type TaggedTaskChannelRef,
  type TaggedTaskComponentRef,
} from "./build-ai-chat-tagged-refs"

export function positiveIntOrNull(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null
  return n
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function uuidOrNull(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : ""
  return UUID_RE.test(text) ? text : null
}

export type BuildAiRunTargetsArgs = {
  messageTags?: AiContextTag[]
  attachments?: AiAttachmentMeta[]
  activeFieldContext?: AiActiveFieldContext | null
  selectedTextContext?: AiSelectedTextContext | null
  explicitBuild?: {
    componentId: string
    taskId?: number | null
    channelId?: number | null
    taskComponentOutputId?: string | null
    componentTitle?: string | null
  } | null
  clarificationContext?: AiClarificationContext | null
  outboundContext?: ResolvedAiChatOutboundContext | null
  taggedTaskChannelRefs?: TaggedTaskChannelRef[]
  taggedTaskComponentRefs?: TaggedTaskComponentRef[]
  ambientContext?: AiAmbientContext | null
  visibleTaskId?: number | null
  visibleChannelId?: number | null
  threadScope?: {
    project_id?: number | null
    task_id?: number | null
    channel_id?: number | null
  } | null
  /** Structured UI only — never inferred from message wording. */
  isProjectWideOperation?: boolean
  outputRevision?: string | null
}

const SOURCE_PRECEDENCE: Record<AiRunTargetSource, number> = {
  user_confirmation: 0,
  explicit_tag: 1,
  explicit_click: 2,
  explicit_selection: 2,
  text_selection: 2,
  message_resolution: 3,
  ambient: 4,
  thread_read: 5,
}

export function canonicalTargetIdentityKey(target: AiRunTarget): string | null {
  switch (target.target_kind) {
    case "project":
      return target.project_id != null ? `project:${target.project_id}` : null
    case "task":
      return target.task_id != null ? `task:${target.task_id}` : null
    case "channel":
      return target.task_id != null && target.channel_id != null
        ? `channel:${target.task_id}:${target.channel_id}`
        : null
    case "component":
      return target.task_id != null && target.channel_id != null && target.component_id
        ? `component:${target.task_id}:${target.channel_id}:${target.component_id}`
        : null
    case "output":
      return target.task_id != null && target.channel_id != null && target.output_id
        ? `output:${target.task_id}:${target.channel_id}:${target.output_id}`
        : null
    case "user":
      return target.user_id != null ? `user:${target.user_id}` : null
    case "attachment":
      return target.attachment_id ? `attachment:${target.attachment_id}` : null
    case "artifact":
      return target.artifact_id
        ? `artifact:${target.artifact_id}${
            target.artifact_version_number != null ? `:v${target.artifact_version_number}` : ""
          }`
        : null
    case "source":
      return target.source_id ? `source:${target.source_id}` : null
    default:
      return null
  }
}

function isStructurallyCompleteTarget(target: AiRunTarget): boolean {
  return canonicalTargetIdentityKey(target) != null
}

function mergeTargetLabel(
  retained: string | null | undefined,
  incoming: string | null | undefined,
): string | null {
  const kept = retained?.trim() || null
  const next = incoming?.trim() || null
  if (!kept) return next
  if (!next) return kept
  return kept.length >= next.length ? kept : next
}

export function dedupeCanonicalAiRunTargets(targets: AiRunTarget[]): AiRunTarget[] {
  const byKey = new Map<string, AiRunTarget>()

  for (const target of targets) {
    if (!isStructurallyCompleteTarget(target)) continue
    const key = canonicalTargetIdentityKey(target)!
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, { ...target, allow_write: false })
      continue
    }

    const keepIncoming =
      SOURCE_PRECEDENCE[target.source] < SOURCE_PRECEDENCE[existing.source]
    if (keepIncoming) {
      byKey.set(key, {
        ...target,
        allow_write: false,
        label: mergeTargetLabel(target.label, existing.label),
        allow_descendants: target.allow_descendants ?? existing.allow_descendants,
      })
    } else {
      byKey.set(key, {
        ...existing,
        allow_write: false,
        label: mergeTargetLabel(existing.label, target.label),
      })
    }
  }

  return Array.from(byKey.values())
}

function tagSourceToTargetSource(tag: AiContextTag): AiRunTargetSource {
  if (tag.contextSource === "explicit_click") return "explicit_click"
  if (tag.source === "selection") return "explicit_selection"
  return "explicit_tag"
}

function pushTarget(rawTargets: AiRunTarget[], target: AiRunTarget): void {
  rawTargets.push({ ...target, allow_write: false })
}

function resolveVisibleComponentTargetSource(
  activeFieldContext: AiActiveFieldContext,
  selectedTextContext?: AiSelectedTextContext | null,
): AiRunTargetSource {
  if (selectedTextContext?.source_type === "component_output") return "text_selection"
  if (activeFieldContext.componentSelectionSource === "explicit_click") return "explicit_click"
  if (activeFieldContext.componentSelectionSource === "component_action") return "explicit_selection"
  return "ambient"
}

function isExplicitOrTaggedTarget(target: AiRunTarget): boolean {
  return (
    target.source === "explicit_click"
    || target.source === "explicit_selection"
    || target.source === "explicit_tag"
    || target.source === "text_selection"
    || target.source === "user_confirmation"
  )
}

function ambientConflictsWithExplicit(
  explicitTargets: AiRunTarget[],
  candidate: {
    target_kind: AiRunTarget["target_kind"]
    task_id?: number | null
    channel_id?: number | null
    component_id?: string | null
  },
): boolean {
  for (const target of explicitTargets) {
    if (!isExplicitOrTaggedTarget(target)) continue
    if (
      candidate.target_kind === "task"
      && target.target_kind === "task"
      && candidate.task_id != null
      && target.task_id != null
      && target.task_id !== candidate.task_id
    ) {
      return true
    }
    if (
      candidate.target_kind === "channel"
      && target.target_kind === "channel"
      && candidate.channel_id != null
      && target.channel_id != null
      && target.channel_id !== candidate.channel_id
    ) {
      return true
    }
    if (
      candidate.target_kind === "component"
      && target.target_kind === "component"
      && candidate.component_id
      && target.component_id
      && target.component_id !== candidate.component_id
    ) {
      return true
    }
  }
  return false
}

function pushVisibleComponentAndOutput(
  rawTargets: AiRunTarget[],
  args: {
    taskId?: number | null
    channelId?: number | null
    componentId: string
    outputId?: string | null
    source: AiRunTargetSource
    label?: string | null
  },
): void {
  pushTarget(rawTargets, {
    target_kind: "component",
    task_id: args.taskId ?? null,
    channel_id: args.channelId ?? null,
    component_id: args.componentId,
    source: args.source,
    label: args.label ?? null,
  })
  if (isRealTaskComponentOutputId(args.outputId)) {
    pushTarget(rawTargets, {
      target_kind: "output",
      task_id: args.taskId ?? null,
      channel_id: args.channelId ?? null,
      component_id: args.componentId,
      output_id: args.outputId,
      source: args.source,
      label: args.label ?? null,
    })
  }
}

export function buildAiRunTargets(args: BuildAiRunTargetsArgs): AiRunTarget[] {
  const {
    messageTags = [],
    attachments = [],
    activeFieldContext,
    selectedTextContext,
    explicitBuild,
    clarificationContext,
    outboundContext,
    taggedTaskChannelRefs = [],
    taggedTaskComponentRefs = [],
    ambientContext,
    visibleTaskId,
    visibleChannelId,
    threadScope,
    isProjectWideOperation = false,
  } = args

  const rawTargets: AiRunTarget[] = []

  // 1. Current visible/selected component and output.
  if (explicitBuild?.componentId && isWritableComponentId(explicitBuild.componentId)) {
    pushVisibleComponentAndOutput(rawTargets, {
      taskId: explicitBuild.taskId,
      channelId: explicitBuild.channelId,
      componentId: explicitBuild.componentId,
      outputId: explicitBuild.taskComponentOutputId,
      source: "explicit_click",
      label: explicitBuild.componentTitle ?? null,
    })
  } else if (
    isComponentOutputActiveFieldContext(activeFieldContext)
    && isWritableComponentId(activeFieldContext.taskComponentId ?? activeFieldContext.componentId?.toString())
  ) {
    const componentId = String(activeFieldContext.taskComponentId ?? activeFieldContext.componentId)
    pushVisibleComponentAndOutput(rawTargets, {
      taskId: activeFieldContext.taskId,
      channelId: activeFieldContext.channelId,
      componentId,
      outputId: activeFieldContext.taskComponentOutputId,
      source: resolveVisibleComponentTargetSource(activeFieldContext, selectedTextContext),
      label: activeFieldContext.componentTitle ?? activeFieldContext.label ?? null,
    })
  } else if (
    isWritableComponentId(outboundContext?.componentId) &&
    outboundContext?.contextSource === "component_action"
  ) {
    pushVisibleComponentAndOutput(rawTargets, {
      taskId: outboundContext.taskId,
      channelId: outboundContext.channelId,
      componentId: outboundContext.componentId!,
      outputId: outboundContext.taskComponentOutputId,
      source: "explicit_click",
      label: outboundContext.selectedComponentLabel,
    })
  }

  // 2. Current visible task and channel.
  const visibleTask =
    activeFieldContext?.taskId
    ?? visibleTaskId
    ?? ambientContext?.center_task_id
    ?? null
  const visibleChannel =
    activeFieldContext?.channelId
    ?? visibleChannelId
    ?? ambientContext?.active_channel_id
    ?? null

  if (visibleTask != null) {
    const source: AiRunTargetSource =
      activeFieldContext?.componentSelectionSource === "explicit_click"
        ? "explicit_click"
        : "ambient"
    pushTarget(rawTargets, {
      target_kind: "task",
      task_id: visibleTask,
      source,
      label: activeFieldContext?.taskTitle ?? null,
    })
  }
  if (visibleChannel != null && visibleTask != null) {
    pushTarget(rawTargets, {
      target_kind: "channel",
      task_id: visibleTask,
      channel_id: visibleChannel,
      source: "ambient",
      label: activeFieldContext?.channelName ?? null,
    })
  }

  // 3. Selected text source identity.
  if (selectedTextContext?.source_type === "component_output") {
    const componentId =
      selectedTextContext.component_id && isWritableComponentId(selectedTextContext.component_id)
        ? selectedTextContext.component_id
        : null
    if (componentId) {
      pushVisibleComponentAndOutput(rawTargets, {
        taskId: selectedTextContext.task_id,
        channelId: selectedTextContext.channel_id,
        componentId,
        outputId: selectedTextContext.task_component_output_id,
        source: "text_selection",
        label: selectedTextContext.component_title ?? null,
      })
    }
  }

  if (clarificationContext?.component_id) {
    pushVisibleComponentAndOutput(rawTargets, {
      taskId: clarificationContext.task_id ?? null,
      channelId: clarificationContext.channel_id ?? null,
      componentId: clarificationContext.component_id,
      outputId: clarificationContext.task_component_output_id,
      source: "explicit_click",
      label: clarificationContext.selected_component_label ?? null,
    })
  }

  // 4. Every tagged entity.
  for (const tag of messageTags) {
    if (tag.type === "project" && Number.isFinite(Number(tag.id))) {
      pushTarget(rawTargets, {
        target_kind: "project",
        project_id: Number(tag.id),
        source: tagSourceToTargetSource(tag),
        allow_descendants: isProjectWideOperation ? true : false,
        label: tag.label ?? null,
      })
    }
    if (tag.type === "task" && Number.isFinite(Number(tag.id))) {
      pushTarget(rawTargets, {
        target_kind: "task",
        task_id: Number(tag.id),
        source: tagSourceToTargetSource(tag),
        label: tag.label ?? null,
      })
    }
    if (tag.type === "user" && Number.isFinite(Number(tag.id))) {
      pushTarget(rawTargets, {
        target_kind: "user",
        user_id: Number(tag.id),
        source: tagSourceToTargetSource(tag),
        label: tag.label ?? null,
      })
    }
    if (tag.type === "channel") {
      const channelId = Number(tag.channelId ?? tag.id)
      if (Number.isFinite(channelId) && tag.taskId != null) {
        pushTarget(rawTargets, {
          target_kind: "channel",
          task_id: tag.taskId,
          channel_id: channelId,
          source: tagSourceToTargetSource(tag),
          label: tag.label ?? null,
        })
      }
    }
    if (tag.type === "task_component") {
      if (
        tag.taskId != null &&
        tag.channelId != null &&
        tag.componentId &&
        isWritableComponentId(tag.componentId)
      ) {
        pushVisibleComponentAndOutput(rawTargets, {
          taskId: tag.taskId,
          channelId: tag.channelId,
          componentId: tag.componentId,
          outputId: tag.taskComponentOutputId,
          source: tagSourceToTargetSource(tag),
          label: tag.componentTitle ?? tag.label ?? null,
        })
        pushTarget(rawTargets, {
          target_kind: "channel",
          task_id: tag.taskId,
          channel_id: tag.channelId,
          source: tagSourceToTargetSource(tag),
          label: tag.channelName ?? null,
        })
        pushTarget(rawTargets, {
          target_kind: "task",
          task_id: tag.taskId,
          source: tagSourceToTargetSource(tag),
          label: tag.taskTitle ?? null,
        })
      }
    }
    if (tag.type === "artifact") {
      const artifactId = String(tag.artifactId ?? tag.id).trim()
      if (artifactId) {
        pushTarget(rawTargets, {
          target_kind: "artifact",
          artifact_id: artifactId,
          artifact_version_number: positiveIntOrNull(tag.artifactVersionNumber),
          task_id: positiveIntOrNull(tag.taskId),
          project_id: positiveIntOrNull(tag.projectId),
          source: tagSourceToTargetSource(tag),
          allow_write: false,
          label: tag.artifactTitle ?? tag.label ?? null,
        })
      }
    }
    if (tag.type === "source") {
      const sourceId = String(tag.sourceId ?? tag.id).trim()
      if (sourceId) {
        pushTarget(rawTargets, {
          target_kind: "source",
          source_id: sourceId,
          task_id: positiveIntOrNull(tag.taskId),
          project_id: positiveIntOrNull(tag.projectId),
          source: tagSourceToTargetSource(tag),
          allow_write: false,
          label: tag.sourceTitle ?? tag.label ?? null,
        })
      }
    }
    if (tag.type === "brand_template") {
      const projectId = positiveIntOrNull(tag.projectId)
      if (projectId != null) {
        pushTarget(rawTargets, {
          target_kind: "project",
          project_id: projectId,
          source: tagSourceToTargetSource(tag),
          allow_write: false,
          label: tag.projectName ?? tag.brandTemplateTitle ?? tag.label ?? null,
        })
      }
    }
  }

  for (const ref of taggedTaskChannelRefs) {
    pushTarget(rawTargets, {
      target_kind: "channel",
      task_id: ref.task_id,
      channel_id: ref.channel_id,
      source: "explicit_tag",
      label: ref.channel_name ?? null,
    })
  }

  for (const ref of taggedTaskComponentRefs) {
    if (!isWritableComponentId(ref.component_id)) continue
    pushVisibleComponentAndOutput(rawTargets, {
      taskId: ref.task_id,
      channelId: ref.channel_id,
      componentId: ref.component_id,
      source: "explicit_tag",
      label: ref.component_title ?? null,
    })
  }

  for (const attachment of attachments) {
    // Only real attachment UUIDs may become run targets. Storage paths are not authz identifiers.
    const attachmentId = uuidOrNull(attachment.id)
    if (!attachmentId) continue
    pushTarget(rawTargets, {
      target_kind: "attachment",
      attachment_id: attachmentId,
      source: "explicit_selection",
      label: attachment.file_name ?? null,
    })
  }

  const explicitTargets = rawTargets.filter(isExplicitOrTaggedTarget)

  // 6. Ambient component/task/channel only when not conflicting with explicit targets.
  if (ambientContext) {
    const centerTaskId = ambientContext.center_task_id ?? null
    const activeChannelId = ambientContext.active_channel_id ?? null
    if (
      centerTaskId != null
      && !ambientConflictsWithExplicit(explicitTargets, {
        target_kind: "task",
        task_id: centerTaskId,
      })
    ) {
      pushTarget(rawTargets, {
        target_kind: "task",
        task_id: centerTaskId,
        source: "ambient",
        label: null,
      })
    }
    if (
      centerTaskId != null
      && activeChannelId != null
      && !ambientConflictsWithExplicit(explicitTargets, {
        target_kind: "channel",
        task_id: centerTaskId,
        channel_id: activeChannelId,
      })
    ) {
      pushTarget(rawTargets, {
        target_kind: "channel",
        task_id: centerTaskId,
        channel_id: activeChannelId,
        source: "ambient",
        label: null,
      })
    }
  }

  // 7. Old thread entities — always read-only factual context.
  if (threadScope) {
    if (threadScope.project_id != null) {
      pushTarget(rawTargets, {
        target_kind: "project",
        project_id: threadScope.project_id,
        source: "thread_read",
        allow_descendants: false,
        label: null,
      })
    }
    if (threadScope.task_id != null) {
      pushTarget(rawTargets, {
        target_kind: "task",
        task_id: threadScope.task_id,
        source: "thread_read",
        label: null,
      })
    }
    if (threadScope.channel_id != null && threadScope.task_id != null) {
      pushTarget(rawTargets, {
        target_kind: "channel",
        task_id: threadScope.task_id,
        channel_id: threadScope.channel_id,
        source: "thread_read",
        label: null,
      })
    }
  }

  return dedupeCanonicalAiRunTargets(rawTargets)
}

export function buildAiChatV2Scope(args: {
  targets: AiRunTarget[]
  activeFieldContext?: AiActiveFieldContext | null
  selectedTextContext?: AiSelectedTextContext | null
  outputRevision?: string | null
  ambientContext?: AiAmbientContext | null
  visibleTaskId?: number | null
  visibleChannelId?: number | null
  threadScope?: {
    project_id?: number | null
    task_id?: number | null
    channel_id?: number | null
  } | null
}): AiChatV2Scope {
  const noneScope: AiChatV2Scope = {
    source: "none",
    project_id: null,
    task_id: null,
    channel_id: null,
    component_id: null,
    task_component_output_id: null,
    output_revision: null,
  }

  const selectedComponentOrOutput = args.targets.find(
    (t) =>
      (t.target_kind === "output" || t.target_kind === "component")
      && (t.source === "text_selection"
        || t.source === "explicit_click"
        || t.source === "explicit_selection"
        || t.source === "ambient"),
  )
  if (selectedComponentOrOutput) {
    const outputTarget = args.targets.find(
      (target) =>
        target.target_kind === "output"
        && target.task_id === selectedComponentOrOutput.task_id
        && target.channel_id === selectedComponentOrOutput.channel_id
        && (
          target.component_id === selectedComponentOrOutput.component_id
          || selectedComponentOrOutput.target_kind === "output"
        ),
    )
    return {
      source:
        selectedComponentOrOutput.source === "text_selection"
          ? "text_selection"
          : selectedComponentOrOutput.source === "explicit_click"
            ? "explicit_click"
            : selectedComponentOrOutput.source === "ambient"
              ? "ambient"
              : "explicit_tag",
      project_id: selectedComponentOrOutput.project_id ?? null,
      task_id: selectedComponentOrOutput.task_id ?? null,
      channel_id: selectedComponentOrOutput.channel_id ?? null,
      component_id: selectedComponentOrOutput.component_id ?? outputTarget?.component_id ?? null,
      task_component_output_id:
        selectedComponentOrOutput.target_kind === "output"
          ? selectedComponentOrOutput.output_id ?? null
          : outputTarget?.output_id ?? null,
      output_revision: args.outputRevision ?? null,
    }
  }

  if (args.selectedTextContext?.source_type === "component_output") {
    return {
      source: "text_selection",
      project_id: null,
      task_id: args.selectedTextContext.task_id ?? null,
      channel_id: args.selectedTextContext.channel_id ?? null,
      component_id:
        args.selectedTextContext.component_id && isWritableComponentId(args.selectedTextContext.component_id)
          ? args.selectedTextContext.component_id
          : null,
      task_component_output_id: isRealTaskComponentOutputId(
        args.selectedTextContext.task_component_output_id,
      )
        ? args.selectedTextContext.task_component_output_id
        : null,
      output_revision: args.outputRevision ?? null,
    }
  }

  const firstExplicitTagged = args.targets.find(
    (t) =>
      t.source === "explicit_tag"
      || t.source === "explicit_selection"
      || t.source === "explicit_click",
  )
  if (firstExplicitTagged) {
    const source: AiChatV2ScopeSource =
      firstExplicitTagged.source === "explicit_click" ? "explicit_click" : "explicit_tag"
    return {
      source,
      project_id: positiveIntOrNull(firstExplicitTagged.project_id),
      task_id: positiveIntOrNull(firstExplicitTagged.task_id),
      channel_id: positiveIntOrNull(firstExplicitTagged.channel_id),
      component_id: firstExplicitTagged.component_id ?? null,
      task_component_output_id: firstExplicitTagged.output_id ?? null,
      output_revision: args.outputRevision ?? null,
    }
  }

  // Ambient center-pane task/channel is UI context only — never ownership scope.
  // Ownership comes from explicit tags/clicks, writable component context, or the thread itself.
  if (args.threadScope) {
    return {
      source: "thread",
      project_id: args.threadScope.project_id ?? null,
      task_id: args.threadScope.task_id ?? null,
      channel_id: args.threadScope.task_id != null ? args.threadScope.channel_id ?? null : null,
      component_id: null,
      task_component_output_id: null,
      output_revision: null,
    }
  }

  return noneScope
}

export function resolveFactualLegacySendContext(args: {
  activeFieldContext?: AiActiveFieldContext | null
  selectedTextContext?: AiSelectedTextContext | null
  outboundContext: ResolvedAiChatOutboundContext
  clarificationContext?: AiClarificationContext | null
  visibleTaskId?: number | null
  visibleChannelId?: number | null
}): {
  taskId: number | null
  channelId: number | null
  activeChannelId: number | null
  componentId: string | null
  taskComponentOutputId: string | null
  selectedContextType: AiSelectedContextType
  selectedComponentLabel: string | null
  contextSource: AiContextSource | null
} {
  if (args.clarificationContext?.component_id) {
    return {
      taskId: args.clarificationContext.task_id ?? null,
      channelId: args.clarificationContext.channel_id ?? null,
      activeChannelId: args.clarificationContext.channel_id ?? null,
      componentId: args.clarificationContext.component_id,
      taskComponentOutputId: args.clarificationContext.task_component_output_id ?? null,
      selectedContextType: "component_output",
      selectedComponentLabel: args.clarificationContext.selected_component_label ?? null,
      contextSource: "clarification",
    }
  }

  if (args.outboundContext.componentId && args.outboundContext.mode === "build_component") {
    return {
      taskId: args.outboundContext.taskId,
      channelId: args.outboundContext.channelId,
      activeChannelId: args.outboundContext.activeChannelId,
      componentId: args.outboundContext.componentId,
      taskComponentOutputId: args.outboundContext.taskComponentOutputId,
      selectedContextType: "component_output",
      selectedComponentLabel: args.outboundContext.selectedComponentLabel,
      contextSource: args.outboundContext.contextSource ?? "component_action",
    }
  }

  if (
    isComponentOutputActiveFieldContext(args.activeFieldContext)
    && isWritableComponentId(
      args.activeFieldContext.taskComponentId ?? args.activeFieldContext.componentId?.toString(),
    )
  ) {
    const componentId = String(
      args.activeFieldContext.taskComponentId ?? args.activeFieldContext.componentId,
    )
    const contextSource: AiContextSource =
      args.selectedTextContext?.source_type === "component_output"
        ? "text_selection"
        : args.activeFieldContext.componentSelectionSource === "explicit_click"
          ? "explicit_click"
          : args.activeFieldContext.componentSelectionSource === "component_action"
            ? "component_action"
            : "ambient"
    return {
      taskId: args.activeFieldContext.taskId ?? args.visibleTaskId ?? null,
      channelId: args.activeFieldContext.channelId ?? args.visibleChannelId ?? null,
      activeChannelId: args.activeFieldContext.channelId ?? args.visibleChannelId ?? null,
      componentId,
      taskComponentOutputId: args.activeFieldContext.taskComponentOutputId ?? null,
      selectedContextType: "component_output",
      selectedComponentLabel: args.activeFieldContext.componentTitle ?? null,
      contextSource,
    }
  }

  return {
    // Visible/open center-pane task is ambient only — do not treat it as a write/ownership target.
    taskId: args.outboundContext.taskId,
    channelId: args.outboundContext.channelId,
    activeChannelId: args.outboundContext.activeChannelId ?? args.visibleChannelId ?? null,
    componentId: args.outboundContext.componentId,
    taskComponentOutputId: args.outboundContext.taskComponentOutputId,
    selectedContextType: args.outboundContext.selectedContextType,
    selectedComponentLabel: args.outboundContext.selectedComponentLabel,
    contextSource: args.outboundContext.contextSource,
  }
}

export function buildAiChatV2RequestFields(args: BuildAiRunTargetsArgs & {
  clientRequestId: string
}): import("../../app/lib/ai/ai-chat-v2-types").AiChatV2RequestFields {
  const targets = buildAiRunTargets(args)
  const scope = buildAiChatV2Scope({
    targets,
    activeFieldContext: args.activeFieldContext,
    selectedTextContext: args.selectedTextContext,
    outputRevision: args.outputRevision,
    ambientContext: args.ambientContext,
    visibleTaskId: args.visibleTaskId,
    visibleChannelId: args.visibleChannelId,
    threadScope: args.threadScope,
  })
  const attachment_ids = (args.attachments ?? [])
    .map((a) => uuidOrNull(a.id) ?? "")
    .filter(Boolean)

  return {
    protocol_version: 2,
    client_request_id: args.clientRequestId,
    scope,
    targets,
    attachment_ids,
  }
}

export function buildRunTargetProgressKey(args: {
  run_id: string
  target_kind?: string | null
  project_id?: number | null
  task_id?: number | null
  channel_id?: number | null
  component_id?: string | null
  output_id?: string | null
  tool_call_id?: string | null
  group_id?: string | null
}): string {
  return [
    args.run_id,
    args.target_kind ?? "",
    args.project_id ?? "",
    args.task_id ?? "",
    args.channel_id ?? "",
    args.component_id ?? "",
    args.output_id ?? "",
    args.tool_call_id ?? "",
    args.group_id ?? "",
  ].join(":")
}

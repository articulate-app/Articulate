import type { TaggedTaskComponentRef } from "./build-ai-chat-tagged-refs"
import type { AiUserMessageDisplayPart } from "./ai-chat-user-message-content"

export const BUILD_WITH_AI_DISPLAY_MESSAGE = "Build with AI"

/**
 * Short user-facing label for per-component Build with AI chat bubbles.
 * Full build instructions stay in the ai-chat `message` payload only.
 */
export function buildBuildComponentDisplayMessage(_args?: {
  componentTitle?: string
  channelTitle?: string | null
}): string {
  return BUILD_WITH_AI_DISPLAY_MESSAGE
}

export type BuildComponentUserMessageDisplayPayload = {
  displayMessage: string
  contentJson: Record<string, unknown>
  taggedTaskComponentRefs: TaggedTaskComponentRef[]
}

/** Structured display metadata for per-component Build with AI user messages. */
export function buildBuildComponentUserMessageDisplay(args: {
  taskId: number
  channelId: number
  componentId: string
  componentTitle: string
  channelName?: string | null
  taskTitle?: string | null
  taskComponentOutputId?: string | null
  /** When true, prefix text reads "Build with AI for " instead of a standalone label line. */
  inlinePill?: boolean
}): BuildComponentUserMessageDisplayPayload {
  const componentTitle = args.componentTitle.trim() || "Component"
  const channelName = args.channelName?.trim() || null
  const taskTitle = args.taskTitle?.trim() || null
  const displayParts: AiUserMessageDisplayPart[] = args.inlinePill === false
    ? [
        { type: "text", text: BUILD_WITH_AI_DISPLAY_MESSAGE },
        { type: "text", text: "\n" },
        {
          type: "context_pill",
          entity_type: "component",
          label: componentTitle,
          subtitle: channelName,
          task_id: args.taskId,
          channel_id: args.channelId,
          component_id: args.componentId,
          ...(args.taskComponentOutputId ? { task_component_output_id: args.taskComponentOutputId } : {}),
          selected_context_type: "component_output",
          ...(taskTitle ? { task_title: taskTitle } : {}),
        },
      ]
    : [
        { type: "text", text: `${BUILD_WITH_AI_DISPLAY_MESSAGE} for ` },
        {
          type: "context_pill",
          entity_type: "component",
          label: componentTitle,
          subtitle: channelName,
          task_id: args.taskId,
          channel_id: args.channelId,
          component_id: args.componentId,
          ...(args.taskComponentOutputId ? { task_component_output_id: args.taskComponentOutputId } : {}),
          selected_context_type: "component_output",
          ...(taskTitle ? { task_title: taskTitle } : {}),
        },
      ]

  const taggedTaskComponentRefs: TaggedTaskComponentRef[] = [
    {
      task_id: args.taskId,
      channel_id: args.channelId,
      component_id: args.componentId,
      component_title: componentTitle,
      ...(taskTitle ? { task_title: taskTitle } : {}),
      ...(channelName ? { channel_name: channelName } : {}),
    },
  ]

  return {
    displayMessage: BUILD_WITH_AI_DISPLAY_MESSAGE,
    contentJson: {
      display_message: BUILD_WITH_AI_DISPLAY_MESSAGE,
      display_parts: displayParts,
      internal_action: "build_component",
      component_title: componentTitle,
      ...(channelName ? { channel_name: channelName } : {}),
      ...(taskTitle ? { task_title: taskTitle } : {}),
    },
    taggedTaskComponentRefs,
  }
}

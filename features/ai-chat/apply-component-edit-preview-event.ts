import type { AiChatComponentEditPreviewEvent } from "../../app/lib/ai/chat"
import {
  componentEditStreamKey,
  useComponentEditStreamStore,
} from "../../app/store/component-edit-stream"
import {
  buildComponentEditStreamContext,
  normalizePreviewContentJson,
  type ComponentEditStreamContext,
} from "./component-edit-stream-utils"
import { shouldAcceptComponentEditPreviewEvent } from "./component-edit-preview-guards"

export { buildComponentEditStreamContext } from "./component-edit-stream-utils"

export function applyComponentEditPreviewEvent(
  event: AiChatComponentEditPreviewEvent,
  assistantTempId: string | null,
  options?: {
    baseContentText?: string | null
    threadId?: string | null
    activeChannelId?: number | null
    allowedChannelIds?: number[]
  },
): ComponentEditStreamContext | null {
  if (
    !shouldAcceptComponentEditPreviewEvent(event, {
      activeChannelId: options?.activeChannelId,
      allowedChannelIds: options?.allowedChannelIds,
    })
  ) {
    console.log("[ComponentEditPreview] ignored unsafe preview event", {
      phase: event.phase,
      componentId: event.component_id,
      taskId: event.task_id,
      channelId: event.channel_id,
      activeChannelId: options?.activeChannelId ?? null,
    })
    return null
  }

  console.log("[ComponentEditPreview] event", {
    phase: event.phase,
    componentId: event.component_id,
    assistantTempId,
    contentTextLength: event.content_text?.length ?? 0,
    contentTextDeltaLength: event.content_text_delta?.length ?? 0,
  })
  const key = componentEditStreamKey(
    event.task_id,
    event.channel_id,
    event.component_id,
    event.task_component_output_id ?? null,
    event.preview_key ?? null,
  )
  const beforeContentText =
    typeof event.before_content_text === "string"
      ? event.before_content_text
      : typeof event.base_content_text === "string"
        ? event.base_content_text
        : options?.baseContentText ?? undefined
  useComponentEditStreamStore.getState().upsertFromPreviewEvent({
    threadId: options?.threadId ?? null,
    previewKey: event.preview_key ?? null,
    taskId: event.task_id,
    channelId: event.channel_id,
    componentId: event.component_id,
    taskComponentOutputId: event.task_component_output_id ?? null,
    componentTitle: event.component_title,
    assistantTempId,
    operation: event.operation ?? null,
    phase: event.phase,
    beforeContentText,
    baseContentText: beforeContentText,
    afterContentText: event.after_content_text,
    contentText: event.after_content_text ?? event.content_text,
    contentTextDelta: event.content_text_delta,
    contentJson: normalizePreviewContentJson(event.after_content_json ?? event.content_json),
    editStrategy: event.edit_strategy ?? null,
    patches: event.patches ?? null,
    errorMessage: event.error_message ?? null,
  })

  if (assistantTempId) {
    useComponentEditStreamStore.getState().assignAssistantTempId(key, assistantTempId)
  }

  const stream = useComponentEditStreamStore.getState().getStream(key)
  return buildComponentEditStreamContext({
    key,
    taskId: event.task_id,
    channelId: event.channel_id,
    componentId: event.component_id,
    taskComponentOutputId: stream?.taskComponentOutputId ?? event.task_component_output_id ?? null,
    componentTitle: stream?.componentTitle ?? event.component_title,
    assistantTempId: stream?.assistantTempId ?? assistantTempId,
  })
}

export function clearComponentEditStreamEntry(key: string): void {
  useComponentEditStreamStore.getState().clearStream(key)
}

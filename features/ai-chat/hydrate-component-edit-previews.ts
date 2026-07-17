import type { PersistedComponentEditPreview } from "./component-edit-previews-from-message"
import {
  componentEditStreamKey,
  useComponentEditStreamStore,
  type ComponentEditPreviewContentJsonBlock,
} from "../../app/store/component-edit-stream"
import { normalizeMixedRichText } from "../../app/lib/rich-text-normalization"

function buildDisplayHtmlFromPersistedPreview(preview: PersistedComponentEditPreview): string {
  if (preview.content_json?.length) {
    const paragraphText = preview.content_json
      .filter((block) => block.type === "paragraph" || block.type === "text")
      .map((block) => (typeof block.text === "string" ? block.text : ""))
      .join("\n")
      .trim()
    if (paragraphText) return normalizeMixedRichText(paragraphText) || paragraphText
  }
  if (preview.content_text.trim()) {
    return normalizeMixedRichText(preview.content_text) || preview.content_text
  }
  return ""
}

export function hydrateComponentEditPreviewFromMessage(args: {
  threadId: string
  messageId: string
  preview: PersistedComponentEditPreview
}): string {
  const contentJson = (args.preview.content_json ?? null) as ComponentEditPreviewContentJsonBlock[] | null
  const contentText =
    args.preview.content_text.trim()
    || buildDisplayHtmlFromPersistedPreview(args.preview).replace(/<[^>]+>/g, " ").trim()

  return useComponentEditStreamStore.getState().hydratePersistedPreviewForMessage({
    threadId: args.threadId,
    previewKey: args.preview.preview_key,
    messageId: args.messageId,
    taskId: args.preview.task_id,
    channelId: args.preview.channel_id,
    componentId: args.preview.component_id,
    taskComponentOutputId: args.preview.task_component_output_id,
    componentTitle: args.preview.component_title,
    operation: args.preview.operation,
    phase: args.preview.phase,
    baseContentText: args.preview.base_content_text ?? undefined,
    contentText,
    contentJson,
    errorMessage: args.preview.error_message,
    updatedAt: args.preview.updated_at,
  })
}

export function hydrateComponentEditPreviewsFromMessages(
  descriptors: Array<{ threadId: string; messageId: string; preview: PersistedComponentEditPreview }>,
): void {
  for (const descriptor of descriptors) {
    hydrateComponentEditPreviewFromMessage(descriptor)
  }
}

export function previewDescriptorStreamKey(preview: PersistedComponentEditPreview): string {
  return componentEditStreamKey(
    preview.task_id,
    preview.channel_id,
    preview.component_id,
    preview.task_component_output_id,
    preview.preview_key,
  )
}

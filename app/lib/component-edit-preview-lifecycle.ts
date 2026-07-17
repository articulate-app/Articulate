export function hashPreviewContent(text: string): string {
  const normalized = text ?? ""
  let hash = 5381
  for (let index = 0; index < normalized.length; index += 1) {
    hash = (hash * 33) ^ normalized.charCodeAt(index)
  }
  return (hash >>> 0).toString(36)
}

export function buildComponentEditPreviewIdentityKey(args: {
  threadId?: string | null
  assistantMessageId?: string | null
  round?: number | null
  taskId: number
  channelId: number
  componentId: string
  taskComponentOutputId?: string | null
  operation?: string | null
  contentText?: string | null
  contentTextDelta?: string | null
}): string {
  const contentForHash = (args.contentText ?? args.contentTextDelta ?? "").trim()
  const contentHash = hashPreviewContent(contentForHash)
  const componentRef = args.componentId || args.taskComponentOutputId || ""

  if (args.assistantMessageId || args.threadId) {
    return [
      args.threadId ?? "",
      args.assistantMessageId ?? "",
      args.round ?? "",
      args.taskId,
      args.channelId,
      componentRef,
      args.operation ?? "",
      contentHash,
    ].join(":")
  }

  return `${args.round ?? 0}:${args.taskId}:${args.channelId}:${componentRef}:${args.operation ?? ""}:${contentHash}`
}

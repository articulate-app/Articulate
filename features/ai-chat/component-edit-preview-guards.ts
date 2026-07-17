import type { AiChatComponentEditPreviewEvent } from "../../app/lib/ai/chat"

export function shouldAcceptComponentEditPreviewEvent(
  event: AiChatComponentEditPreviewEvent,
  ctx: {
    activeChannelId?: number | null
    allowedChannelIds?: number[]
  } = {},
): boolean {
  if (!event.component_id?.trim()) return false
  if (!Number.isFinite(event.task_id) || !Number.isFinite(event.channel_id)) return false

  const allowed = new Set<number>()
  if (ctx.activeChannelId != null && Number.isFinite(ctx.activeChannelId)) {
    allowed.add(ctx.activeChannelId)
  }
  for (const channelId of ctx.allowedChannelIds ?? []) {
    if (Number.isFinite(channelId)) allowed.add(channelId)
  }

  if (allowed.size > 0 && !allowed.has(event.channel_id)) return false
  return true
}

export function isGenericComponentPreviewTitle(title: string | null | undefined): boolean {
  const normalized = (title ?? "").trim().toLowerCase()
  return normalized.length === 0 || normalized === "component" || normalized === "component output"
}

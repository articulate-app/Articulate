import type { AiContextTag } from "./composer-inline-editor"

export type TaggedTaskChannelRef = {
  task_id: number
  channel_id: number
  task_title?: string
  channel_name?: string
}

export type TaggedTaskComponentRef = {
  task_id: number
  channel_id: number
  component_id: string
  component_title?: string
  task_title?: string
  channel_name?: string
}

export type AiChatTaggedRefsPayload = {
  tagged_task_ids: number[]
  tagged_project_ids: number[]
  tagged_user_ids: number[]
  tagged_channel_ids: number[]
  tagged_task_channel_refs: TaggedTaskChannelRef[]
  tagged_task_component_refs: TaggedTaskComponentRef[]
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Briefing/global template aliases (`g:5`, `p:12`, `t:<uuid>`, `global:5`, …) are never write targets. */
const COMPONENT_ID_ALIAS_PATTERN = /^(?:g|p|t|global|project|briefing|component):/i

/**
 * A component id is only a valid AI write target when it is a real `task_channel_components.id`
 * (a UUID). Briefing/global aliases like `g:5` and bare numeric ids are display metadata only and
 * must never be sent as `component_id` / `tagged_task_component_refs[].component_id`.
 */
export function isWritableComponentId(value: string | null | undefined): value is string {
  if (typeof value !== "string") return false
  const trimmed = value.trim()
  if (!trimmed) return false
  if (COMPONENT_ID_ALIAS_PATTERN.test(trimmed)) return false
  if (/^\d+$/.test(trimmed)) return false
  return true
}

/** Only real `task_component_outputs.id` UUIDs may be sent as `task_component_output_id`. */
export function isRealTaskComponentOutputId(value: string | null | undefined): value is string {
  if (typeof value !== "string") return false
  return UUID_PATTERN.test(value.trim())
}

/**
 * Maps composer chips to ai-chat tagged_* fields. Task ids include tasks referenced only via channel/component tags.
 */
export function buildAiChatTaggedRefs(tags: AiContextTag[]): AiChatTaggedRefsPayload {
  const tagged_project_ids = Array.from(
    new Set(
      tags
        .filter((t) => t.type === "project")
        .map((t) => Number(t.id))
        .filter((id) => Number.isFinite(id))
    )
  )
  const tagged_user_ids = Array.from(
    new Set(
      tags
        .filter((t) => t.type === "user")
        .map((t) => Number(t.id))
        .filter((id) => Number.isFinite(id))
    )
  )

  const taskIdSet = new Set<number>()
  for (const t of tags) {
    if (t.type === "task" && Number.isFinite(Number(t.id))) {
      taskIdSet.add(Number(t.id))
    }
    if (t.type === "task_channel" && t.taskId != null && Number.isFinite(t.taskId)) {
      taskIdSet.add(t.taskId)
    }
    if (t.type === "task_component" && t.taskId != null && Number.isFinite(t.taskId)) {
      taskIdSet.add(t.taskId)
    }
  }

  // Standalone channel chips (`#Blog`) are the preferred channel signal. Legacy `task_channel`
  // tags and explicit component selections also imply a channel, so collect their ids too.
  const channelIdSet = new Set<number>()
  for (const t of tags) {
    if (t.type === "channel") {
      const cid = Number(t.channelId ?? t.id)
      if (Number.isFinite(cid)) channelIdSet.add(cid)
      continue
    }
    if ((t.type === "task_channel" || t.type === "task_component") && t.channelId != null) {
      if (Number.isFinite(t.channelId)) channelIdSet.add(t.channelId)
    }
  }

  const tagged_task_channel_refs: TaggedTaskChannelRef[] = []
  const seenChannel = new Set<string>()
  for (const t of tags) {
    if (t.type !== "task_channel") continue
    if (t.taskId == null || t.channelId == null) continue
    const key = `${t.taskId}:${t.channelId}`
    if (seenChannel.has(key)) continue
    seenChannel.add(key)
    tagged_task_channel_refs.push({
      task_id: t.taskId,
      channel_id: t.channelId,
      task_title: t.taskTitle ?? undefined,
      channel_name: t.channelName ?? undefined,
    })
  }

  const tagged_task_component_refs: TaggedTaskComponentRef[] = []
  const seenComp = new Set<string>()
  for (const t of tags) {
    if (t.type !== "task_component") continue
    if (t.taskId == null || t.channelId == null || !t.componentId) continue
    // Never emit briefing/global aliases (`g:5`) as a write-oriented component ref.
    if (!isWritableComponentId(t.componentId)) continue
    const key = `${t.taskId}:${t.channelId}:${t.componentId}`
    if (seenComp.has(key)) continue
    seenComp.add(key)
    tagged_task_component_refs.push({
      task_id: t.taskId,
      channel_id: t.channelId,
      component_id: t.componentId,
      component_title: t.componentTitle ?? undefined,
      task_title: t.taskTitle ?? undefined,
      channel_name: t.channelName ?? undefined,
    })
  }

  return {
    tagged_task_ids: Array.from(taskIdSet).sort((a, b) => a - b),
    tagged_project_ids,
    tagged_user_ids,
    tagged_channel_ids: Array.from(channelIdSet).sort((a, b) => a - b),
    tagged_task_channel_refs,
    tagged_task_component_refs,
  }
}

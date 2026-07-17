/**
 * Per (task_id, channel_id) state for @ menu — never merge across keys.
 * Source: `tc_components_for_task_all_channels` only; no `available_components` fallback.
 */

export type MentionTaskChannelComponentItem = {
  /** Tag payload id: task_component_id || component_key */
  component_id: string
  task_component_id?: string
  component_key?: string
  title: string
  description?: string | null
}

export type TaskChannelComponentsBucket = {
  loading: boolean
  loaded: boolean
  error: string | null
  items: MentionTaskChannelComponentItem[]
}

export function taskChannelCompositeKey(taskId: number, channelId: number): string {
  return `${taskId}:${channelId}`
}

export type MentionChannel = {
  channel_id: number
  name: string
  slug: string | null
}

function stableDedupeKey(c: MentionTaskChannelComponentItem): string {
  if (c.task_component_id) return `tc:${c.task_component_id}`
  if (c.component_key) return `key:${c.component_key}`
  return `title:${c.title.trim().toLowerCase()}`
}

/**
 * Dedupe by strongest id first (task_component_id > component_key > component_title).
 */
export function dedupeComponents(items: MentionTaskChannelComponentItem[]): MentionTaskChannelComponentItem[] {
  const byKey = new Map<string, MentionTaskChannelComponentItem>()
  for (const c of items) {
    const k = stableDedupeKey(c)
    if (!byKey.has(k)) byKey.set(k, c)
  }
  return Array.from(byKey.values())
}

/**
 * Map `tc_components_for_task_all_channels` rows.
 * Includes channels even when they currently have no components selected.
 */
export function mapTcComponentsAllChannelsRpc(data: unknown): {
  channels: MentionChannel[]
  componentsByTaskChannel: Record<string, MentionTaskChannelComponentItem[]>
} {
  const rows = (data as Array<Record<string, unknown>> | null) ?? []
  const channelsById = new Map<number, MentionChannel>()
  const componentsByTaskChannel: Record<string, MentionTaskChannelComponentItem[]> = {}

  for (const r of rows) {
    const channelId = Number(r.channel_id)
    if (!Number.isFinite(channelId)) continue

    const channelName = String(r.channel_name ?? `Channel ${channelId}`).trim() || `Channel ${channelId}`
    const channelSlugRaw = r.channel_slug
    const channelSlug = channelSlugRaw == null ? null : String(channelSlugRaw)
    channelsById.set(channelId, { channel_id: channelId, name: channelName, slug: channelSlug })

    const key = taskChannelCompositeKey(Number(r.task_id), channelId)
    if (!componentsByTaskChannel[key]) componentsByTaskChannel[key] = []

    const taskComponentIdRaw = r.task_component_id
    const titleRaw = r.component_title
    if (taskComponentIdRaw == null && titleRaw == null) {
      // Explicit "channel has no selected components" sentinel row.
      continue
    }

    const title = String(titleRaw ?? "").trim()
    if (!title) continue

    const taskComponentId = taskComponentIdRaw == null ? undefined : String(taskComponentIdRaw)
    const componentKeyRaw = r.component_key
    const componentKey = componentKeyRaw == null ? undefined : String(componentKeyRaw)
    const componentId = taskComponentId || componentKey
    if (!componentId) continue

    componentsByTaskChannel[key].push({
      component_id: componentId,
      task_component_id: taskComponentId,
      component_key: componentKey,
      title,
      description: (r.component_description as string | null | undefined) ?? null,
    })
  }

  for (const key of Object.keys(componentsByTaskChannel)) {
    const deduped = dedupeComponents(componentsByTaskChannel[key])
    componentsByTaskChannel[key] = deduped.sort((a, b) => a.title.localeCompare(b.title))
  }

  const channels = Array.from(channelsById.values()).sort((a, b) => a.name.localeCompare(b.name))

  return { channels, componentsByTaskChannel }
}

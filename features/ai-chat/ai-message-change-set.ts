export type AiMessageChangeSetComponentSummary = {
  component_title: string
  task_id: number
  channel_id: number
}

export type AiMessageChangeSetSummary = {
  components?: AiMessageChangeSetComponentSummary[]
}

export type AiMessageChangeSet = {
  id: string
  has_restorable_changes?: boolean
  entity_count?: number
  change_count?: number
  status?: string | null
  restored_at?: string | null
  summary?: AiMessageChangeSetSummary
}

export type AiMessageChangeSetPair = {
  taskId: number
  channelId: number
}

export type AiMessageChangeSetItem = {
  component_id: string | null
  task_id: number | null
  channel_id: number | null
  task_component_output_id: string | null
  before_content_text: string | null
  after_content_text: string | null
  operation: "append" | "replace" | null
}

function toTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function normalizeChangeSetOperation(value: unknown): "append" | "replace" | null {
  if (value === "append" || value === "replace") return value
  return null
}

function normalizeChangeSetItem(value: unknown): AiMessageChangeSetItem | null {
  if (!value || typeof value !== "object") return null
  const row = value as Record<string, unknown>
  const componentId = toTrimmedString(row.component_id)
  const taskId = toFiniteNumber(row.task_id)
  const channelId = toFiniteNumber(row.channel_id)
  const beforeContentText =
    toTrimmedString(row.before_content_text)
    ?? toTrimmedString(row.base_content_text)
  const afterContentText =
    toTrimmedString(row.after_content_text)
    ?? toTrimmedString(row.content_text)
  if (!componentId && beforeContentText == null && afterContentText == null) return null
  return {
    component_id: componentId,
    task_id: taskId,
    channel_id: channelId,
    task_component_output_id: toTrimmedString(row.task_component_output_id),
    before_content_text: beforeContentText,
    after_content_text: afterContentText,
    operation: normalizeChangeSetOperation(row.operation),
  }
}

export function parseAiMessageChangeSetItems(contentJson: unknown): AiMessageChangeSetItem[] {
  if (!contentJson || typeof contentJson !== "object") return []
  const root = contentJson as Record<string, unknown>

  const topLevelItems = Array.isArray(root.change_set_items) ? root.change_set_items : []
  const nestedItems =
    root.change_set && typeof root.change_set === "object"
      ? (() => {
          const changeSet = root.change_set as Record<string, unknown>
          return Array.isArray(changeSet.items) ? changeSet.items : []
        })()
      : []

  const merged = [...topLevelItems, ...nestedItems]
  return merged
    .map((row) => normalizeChangeSetItem(row))
    .filter((row): row is AiMessageChangeSetItem => row != null)
}

export function changeSetItemGroupKey(item: Pick<AiMessageChangeSetItem, "component_id" | "task_id" | "channel_id">): string | null {
  if (!item.component_id || item.task_id == null || item.channel_id == null) return null
  return `${item.task_id}:${item.channel_id}:${item.component_id}`
}

export function findAiMessageChangeSetItemForPreview(args: {
  items: AiMessageChangeSetItem[]
  taskId: number
  channelId: number
  componentId: string
  taskComponentOutputId?: string | null
}): AiMessageChangeSetItem | null {
  const outputId = args.taskComponentOutputId?.trim() || null
  const exactOutputMatch = outputId
    ? args.items.find(
        (item) =>
          item.task_component_output_id === outputId
          && (item.before_content_text != null || item.after_content_text != null),
      )
    : null
  if (exactOutputMatch) return exactOutputMatch

  const groupKey = `${args.taskId}:${args.channelId}:${args.componentId}`
  return (
    args.items.find((item) => changeSetItemGroupKey(item) === groupKey) ?? null
  )
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function normalizeComponentSummary(value: unknown): AiMessageChangeSetComponentSummary | null {
  if (!value || typeof value !== "object") return null
  const row = value as Record<string, unknown>
  const taskId = toFiniteNumber(row.task_id)
  const channelId = toFiniteNumber(row.channel_id)
  const componentTitle = typeof row.component_title === "string" ? row.component_title.trim() : ""
  if (taskId == null || channelId == null || !componentTitle) return null
  return {
    component_title: componentTitle,
    task_id: taskId,
    channel_id: channelId,
  }
}

export function parseAiMessageChangeSet(contentJson: unknown): AiMessageChangeSet | null {
  if (!contentJson || typeof contentJson !== "object") return null
  const root = contentJson as Record<string, unknown>
  const raw = root.change_set
  if (!raw || typeof raw !== "object") return null

  const changeSet = raw as Record<string, unknown>
  const id = typeof changeSet.id === "string" ? changeSet.id.trim() : ""
  if (!id) return null

  const summaryRaw =
    changeSet.summary && typeof changeSet.summary === "object"
      ? (changeSet.summary as Record<string, unknown>)
      : null
  const componentsRaw = Array.isArray(summaryRaw?.components) ? summaryRaw.components : []
  const components = componentsRaw
    .map((row) => normalizeComponentSummary(row))
    .filter((row): row is AiMessageChangeSetComponentSummary => row != null)

  return {
    id,
    has_restorable_changes:
      typeof changeSet.has_restorable_changes === "boolean"
        ? changeSet.has_restorable_changes
        : undefined,
    entity_count: toFiniteNumber(changeSet.entity_count) ?? undefined,
    change_count: toFiniteNumber(changeSet.change_count) ?? undefined,
    status: typeof changeSet.status === "string" ? changeSet.status : null,
    restored_at: typeof changeSet.restored_at === "string" ? changeSet.restored_at : null,
    summary: components.length > 0 ? { components } : undefined,
  }
}

export function isAiMessageChangeSetRestored(changeSet: AiMessageChangeSet | null | undefined): boolean {
  if (!changeSet) return false
  return (changeSet.status ?? "").trim().toLowerCase() === "restored"
}

export function formatAiMessageChangeSetMetadata(changeSet: AiMessageChangeSet): string | null {
  const componentCount = changeSet.summary?.components?.length ?? 0
  if (componentCount > 0) {
    return componentCount === 1 ? "1 component updated" : `${componentCount} components updated`
  }

  const changeCount = changeSet.change_count ?? changeSet.entity_count ?? 0
  if (changeCount > 0) {
    return changeCount === 1 ? "1 change" : `${changeCount} changes`
  }

  return null
}

export function collectAiMessageChangeSetTaskChannelPairs(
  changeSet: AiMessageChangeSet,
): AiMessageChangeSetPair[] {
  const pairs = new Map<string, AiMessageChangeSetPair>()
  for (const component of changeSet.summary?.components ?? []) {
    pairs.set(`${component.task_id}:${component.channel_id}`, {
      taskId: component.task_id,
      channelId: component.channel_id,
    })
  }
  return Array.from(pairs.values())
}

export function patchAiMessageChangeSetRestored(
  contentJson: unknown,
  restoredAt?: string | null,
): unknown {
  if (!contentJson || typeof contentJson !== "object") return contentJson
  const root = { ...(contentJson as Record<string, unknown>) }
  const raw = root.change_set
  if (!raw || typeof raw !== "object") return contentJson

  const changeSet = { ...(raw as Record<string, unknown>) }
  changeSet.status = "restored"
  changeSet.has_restorable_changes = false
  if (restoredAt) changeSet.restored_at = restoredAt

  return {
    ...root,
    change_set: changeSet,
  }
}

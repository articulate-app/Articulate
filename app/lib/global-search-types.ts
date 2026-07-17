"use client"

export const GLOBAL_SEARCH_ENTITY_TYPES = [
  "task",
  "project",
  "mention",
  "project_briefing",
  "user",
  "team",
] as const

export type GlobalSearchEntityType = (typeof GLOBAL_SEARCH_ENTITY_TYPES)[number]
export type GlobalSearchItemEntityType = GlobalSearchEntityType | "ai_thread"
export type GlobalSearchResultTab = "all" | GlobalSearchItemEntityType

export type GlobalSearchDisplayPayload = {
  title: string
  subtitle?: string
  preview?: string
  logo?: string
  color?: string
  photo?: string
  left?: {
    type?: "project" | "user" | "team" | "icon"
    logo?: string
    color?: string
    photo?: string
    label?: string
  } | null
  watcher_photos?: string[]
  avatars?: Array<{
    id?: number | string | null
    name?: string | null
    photo?: string | null
  }>
  meta?: Array<{
    label?: string
    value?: string
  }>
  badges?: Array<{
    label?: string
    color?: string
  }>
}

export const GLOBAL_SEARCH_ENTITY_LABELS: Record<GlobalSearchItemEntityType, string> = {
  task: "Tasks",
  project: "Projects",
  mention: "Mentions",
  project_briefing: "Briefings",
  user: "Users",
  team: "Teams",
  ai_thread: "AI chats",
}

export type GlobalSearchHistoryItem = {
  id?: number | string | null
  term: string
  created_at?: string | null
  raw: Record<string, unknown>
}

export type GlobalSearchDocument = {
  entity_type: GlobalSearchItemEntityType
  entity_id: string | null
  title: string
  subtitle: string | null
  preview: string | null
  created_at: string | null
  score: number | null
  url: string | null
  project_id: number | null
  task_id: number | null
  thread_id: number | null
  display_payload: GlobalSearchDisplayPayload | null
  raw: Record<string, unknown>
}

export type GlobalSearchDetailTarget = {
  entityType: GlobalSearchEntityType
  entityId: string | null
  projectId?: string | number | null
  taskId?: string | number | null
  threadId?: string | number | null
  mentionId?: string | number | null
  briefingTypeId?: number | null
  title?: string | null
}

export type GlobalSearchCountsMap = Partial<Record<GlobalSearchItemEntityType, number>> & Record<string, number | undefined>

export type GlobalSearchSection = {
  type: string
  entity_type: GlobalSearchItemEntityType | null
  label: string
  total_count: number | null
  items: GlobalSearchDocument[]
  sections?: GlobalSearchSection[]
}

export function isGlobalSearchItemEntityType(value: unknown): value is GlobalSearchItemEntityType {
  return value === "ai_thread" || isGlobalSearchEntityType(value)
}

export function isGlobalSearchEntityType(value: unknown): value is GlobalSearchEntityType {
  return typeof value === "string" && (GLOBAL_SEARCH_ENTITY_TYPES as readonly string[]).includes(value)
}

export function getGlobalSearchEntityLabel(type: GlobalSearchItemEntityType): string {
  return GLOBAL_SEARCH_ENTITY_LABELS[type]
}

export function getGlobalSearchResultKey(item: GlobalSearchDocument): string {
  const idPart =
    item.entity_id ??
    item.task_id ??
    item.project_id ??
    item.thread_id ??
    item.url ??
    item.display_payload?.title ??
    item.title
  return `${item.entity_type}:${String(idPart)}`
}

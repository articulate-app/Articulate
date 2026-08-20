"use client"

import { getSupabaseBrowser } from "../../../lib/supabase-browser"
import {
  type GlobalSearchCountsMap,
  type GlobalSearchDisplayPayload,
  type GlobalSearchDocument,
  type GlobalSearchEntityType,
  type GlobalSearchHistoryItem,
  type GlobalSearchItemEntityType,
  type GlobalSearchSection,
  getGlobalSearchEntityLabel,
  isGlobalSearchItemEntityType,
} from "../global-search-types"

type RpcRow = Record<string, unknown>
export type MentionsInboxMode = "received" | "sent"
export type MentionsInboxSeenFilter = "all" | "unseen" | "seen"
export type MentionsInboxCounts = {
  received: number
  sent: number
  unseen: number
  seen: number
}

function asRecord(value: unknown): RpcRow | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as RpcRow)
    : null
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function asId(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  if (typeof value === "string" && value.trim().length > 0) return value.trim()
  return null
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function asBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value
  if (typeof value === "number") return value !== 0
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase()
    if (normalized === "true" || normalized === "t" || normalized === "1" || normalized === "yes") return true
    if (normalized === "false" || normalized === "f" || normalized === "0" || normalized === "no") return false
  }
  return null
}

function stringFromUnknown(value: unknown): string | null {
  if (typeof value === "string") return value
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  if (typeof value === "boolean") return value ? "true" : "false"
  return null
}

function pickEntityType(row: RpcRow): GlobalSearchItemEntityType | null {
  const directType = row.entity_type
  if (isGlobalSearchItemEntityType(directType)) return directType
  const fallbackType = row.type
  if (isGlobalSearchItemEntityType(fallbackType)) return fallbackType
  return null
}

function pickCountsKey(row: RpcRow): string | null {
  return (
    asString(row.section_type) ??
    asString(row.section) ??
    asString(row.type) ??
    asString(row.entity_type)
  )
}

function pickEntityId(row: RpcRow): string | null {
  const task = asRecord(row.task)
  const project = asRecord(row.project)
  const thread = asRecord(row.thread)
  const user = asRecord(row.user)
  const team = asRecord(row.team)

  return (
    asId(row.entity_id) ??
    asId(row.id) ??
    asId(task?.id) ??
    asId(project?.id) ??
    asId(thread?.id) ??
    asId(user?.id) ??
    asId(team?.id) ??
    asId(row.task_id) ??
    asId(row.project_id) ??
    asId(row.user_id) ??
    asId(row.team_id) ??
    asId(row.briefing_id)
  )
}

function pickUrl(row: RpcRow): string | null {
  return asString(row.url) ?? asString(row.href) ?? asString(row.link) ?? asString(row.path)
}

function normalizeMentionInboxDocument(value: unknown): GlobalSearchDocument | null {
  const row = asRecord(value)
  if (!row) return null

  const mentionId = asId(row.mention_id) ?? asId(row.id)
  if (!mentionId) return null
  const threadId = asNumber(row.thread_id) ?? asNumber(row.threadId)
  const createdAt = asString(row.created_at)
  const senderRecord =
    asRecord(row.sender) ?? asRecord(row.user) ?? asRecord(row.created_by_user) ?? asRecord(row.author)
  // list_mentions_inbox returns created_by_name / created_by_photo (not sender_*).
  const senderName =
    asString(row.created_by_name) ??
    asString(row.sender_name) ??
    asString(senderRecord?.full_name) ??
    asString(senderRecord?.name) ??
    asString(senderRecord?.email)
  const senderPhoto =
    asString(row.created_by_photo) ??
    asString(row.sender_photo) ??
    asString(senderRecord?.photo)
  const rowAvatars = asArray(row.avatars)
    .map((entry) => asRecord(entry))
    .filter(Boolean)
    .map((avatar, index) => ({
      id: asId(avatar?.id) ?? `mention-avatar:${index}`,
      name: asString(avatar?.name) ?? asString(avatar?.full_name) ?? null,
      photo: asString(avatar?.photo) ?? null,
    }))
    .filter((avatar) => avatar.name || avatar.photo)
  // Prefer the message sender for the left avatar; watcher_avatars are participants (not the author).
  const avatars =
    senderName || senderPhoto
      ? [
          {
            id: asId(row.created_by) ?? `sender:${mentionId}`,
            name: senderName,
            photo: senderPhoto,
          },
        ]
      : rowAvatars

  const comment = asString(row.comment) ?? asString(row.message) ?? asString(row.preview)
  const attachment = asString(row.attachment) ?? asString(row.attachment_url)
  const primaryText = comment || (attachment ? "Attachment" : "Mention")

  const isSeen =
    asBoolean(row.is_seen) ??
    (asString(row.seen_at) ? true : null) ??
    false

  return {
    entity_type: "mention",
    entity_id: mentionId,
    title: senderName ?? "Mention",
    subtitle: null,
    preview: primaryText,
    created_at: createdAt,
    score: null,
    url: pickUrl(row),
    project_id: asNumber(row.project_id),
    task_id: asNumber(row.task_id),
    thread_id: threadId,
    display_payload: {
      title: senderName ?? "Mention",
      preview: primaryText,
      avatars,
      meta: [
        { label: "created_at", value: createdAt ?? undefined },
        { label: "is_unread", value: isSeen ? "false" : "true" },
        { label: "is_seen", value: isSeen ? "true" : "false" },
      ],
    },
    raw: {
      ...row,
      mention_id: mentionId,
      thread_id: threadId,
      is_seen: isSeen,
    },
  }
}

function pickMentionsCount(row: RpcRow, keys: string[]): number | null {
  for (const key of keys) {
    const value = asNumber(row[key])
    if (value != null) return value
  }
  return null
}

function normalizeDisplayPayload(value: unknown): GlobalSearchDisplayPayload | null {
  const payload = asRecord(value)
  if (!payload) return null

  const left = asRecord(payload.left)
  const avatars = asArray(payload.avatars)
    .map((value) => asRecord(value))
    .filter(Boolean)
    .map((avatar) => ({
      id: avatar?.id as number | string | null | undefined,
      name: asString(avatar?.name) ?? null,
      photo: asString(avatar?.photo) ?? null,
    }))
    .filter((avatar) => avatar.name || avatar.photo)
  const metaRecord = asRecord(payload.meta)
  const meta = metaRecord
    ? Object.entries(metaRecord)
        .map(([label, rawValue]) => ({
          label,
          value: stringFromUnknown(rawValue) ?? undefined,
        }))
        .filter((entry) => entry.label || entry.value)
    : asArray(payload.meta)
        .map((value) => asRecord(value))
        .filter(Boolean)
        .map((entry) => ({
          label: asString(entry?.label) ?? undefined,
          value: asString(entry?.value) ?? undefined,
        }))
        .filter((entry) => entry.label || entry.value)
  const badges = asArray(payload.badges)
    .map((value) => asRecord(value))
    .filter(Boolean)
    .map((entry) => ({
      label: asString(entry?.label) ?? "",
      color: asString(entry?.color) ?? undefined,
    }))
    .filter((entry) => entry.label)

  return {
    title: asString(payload.title) ?? "Untitled",
    subtitle: asString(payload.subtitle) ?? undefined,
    preview: asString(payload.preview) ?? undefined,
    logo: asString(payload.logo) ?? undefined,
    color: asString(payload.color) ?? undefined,
    photo: asString(payload.photo) ?? undefined,
    left: left
      ? {
          type:
            left.type === "project" || left.type === "user" || left.type === "team" || left.type === "icon"
              ? left.type
              : "icon",
          logo: asString(left.logo) ?? undefined,
          color: asString(left.color) ?? undefined,
          photo: asString(left.photo) ?? undefined,
          label: asString(left.label) ?? undefined,
        }
      : null,
    watcher_photos: asArray(payload.watcher_photos)
      .map((value) => asString(value))
      .filter(Boolean) as string[],
    avatars,
    meta,
    badges,
  }
}

export function normalizeGlobalSearchDocument(
  value: unknown,
  fallbackEntityType?: GlobalSearchItemEntityType | null,
): GlobalSearchDocument | null {
  const row = asRecord(value)
  if (!row) return null

  const entityType = pickEntityType(row) ?? fallbackEntityType ?? null
  if (!entityType) return null
  const task = asRecord(row.task)
  const project = asRecord(row.project)
  const thread = asRecord(row.thread)
  const displayPayload = normalizeDisplayPayload(row.display_payload ?? row)

  return {
    entity_type: entityType,
    entity_id: pickEntityId(row),
    title: displayPayload?.title ?? "Untitled",
    subtitle: displayPayload?.subtitle ?? null,
    preview: displayPayload?.preview ?? null,
    created_at: asString(row.created_at),
    score: asNumber(row.score),
    url: pickUrl(row),
    project_id: asNumber(row.project_id) ?? asNumber(project?.id),
    task_id: asNumber(row.task_id) ?? asNumber(task?.id),
    thread_id: asNumber(row.thread_id) ?? asNumber(thread?.id),
    display_payload: displayPayload,
    raw: row,
  }
}

function normalizeHistoryItem(value: unknown): GlobalSearchHistoryItem | null {
  const row = asRecord(value)
  if (!row) return null

  const term =
    asString(row.term) ??
    asString(row.search_term) ??
    asString(row.query) ??
    asString(row.title)
  if (!term) return null

  return {
    id: (row.id as number | string | null | undefined) ?? null,
    term,
    created_at: asString(row.created_at) ?? asString(row.searched_at),
    raw: row,
  }
}

async function runRpc<T>(
  rpcName: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  const supabase = getSupabaseBrowser()
  let query: any = supabase.rpc(rpcName, body)
  if (signal && query && typeof query.abortSignal === "function") {
    query = query.abortSignal(signal)
  }

  const { data, error } = await query
  if (error) throw error
  return data as T
}


export async function fetchGlobalSearchHistoryRecent(
  limit: number,
  signal?: AbortSignal,
): Promise<GlobalSearchHistoryItem[]> {
  const rows = await runRpc<unknown[]>("search_history_recent", { p_limit: limit }, signal)
  return ((Array.isArray(rows) ? rows : []).map(normalizeHistoryItem).filter(Boolean) as GlobalSearchHistoryItem[]).sort(
    (left, right) => {
      const leftTime = left.created_at ? new Date(left.created_at).getTime() : 0
      const rightTime = right.created_at ? new Date(right.created_at).getTime() : 0
      return rightTime - leftTime
    },
  )
}

export async function addGlobalSearchHistory(term: string): Promise<void> {
  await runRpc("search_history_add", { p_term: term })
}

export async function trackGlobalObjectOpen(args: {
  entityType: string
  entityId: string
}): Promise<void> {
  await runRpc("track_global_object_open", {
    p_entity_type: args.entityType,
    p_entity_id: args.entityId,
  })
}

export async function fetchGlobalSearchPreviewItems(args: {
  query: string
  entityTypes: GlobalSearchItemEntityType[] | null
  limit: number
  signal?: AbortSignal
}): Promise<GlobalSearchDocument[]> {
  const rows = await runRpc<unknown[]>(
    "search_global_preview_items",
    {
      p_query: args.query,
      p_entity_types: args.entityTypes,
      p_limit: args.limit,
    },
    args.signal,
  )

  return (Array.isArray(rows) ? rows : [])
    .map((row) => normalizeGlobalSearchDocument(row))
    .filter(Boolean) as GlobalSearchDocument[]
}

export async function fetchGlobalSearchPreviewCounts(args: {
  query: string
  entityTypes: GlobalSearchItemEntityType[] | null
  signal?: AbortSignal
}): Promise<GlobalSearchCountsMap> {
  const rows = await runRpc<unknown[]>(
    "search_global_preview_counts",
    {
      p_query: args.query,
      p_entity_types: args.entityTypes,
    },
    args.signal,
  )

  const counts: GlobalSearchCountsMap = {}
  for (const value of Array.isArray(rows) ? rows : []) {
    const row = asRecord(value)
    if (!row) continue
    const entityType = pickEntityType(row)
    if (!entityType) continue
    counts[entityType] =
      asNumber(row.total_count) ??
      asNumber(row.count) ??
      asNumber(row.total) ??
      0
  }
  return counts
}

export async function fetchGlobalSearchSections(args: {
  query: string
  entityTypes: GlobalSearchItemEntityType[] | null
  perTypeLimit: number
  signal?: AbortSignal
}): Promise<GlobalSearchSection[]> {
  const rows = await runRpc<unknown>(
    "search_global_sections",
    {
      p_query: args.query,
      p_limit_per_type: args.perTypeLimit,
    },
    args.signal,
  )

  return normalizeGlobalSearchSections(rows)
}

export async function fetchGlobalSearchAllTabItems(args: {
  query: string
  perTypeLimit: number
  signal?: AbortSignal
}): Promise<GlobalSearchSection[]> {
  const rows = await runRpc<unknown>(
    "search_global_all_tab_items",
    {
      p_query: args.query,
      p_per_type_limit: args.perTypeLimit,
    },
    args.signal,
  )

  return normalizeGlobalSearchSections(rows)
}

export async function fetchGlobalSearchCounts(args: {
  query: string
  entityTypes: GlobalSearchItemEntityType[] | null
  signal?: AbortSignal
}): Promise<GlobalSearchCountsMap> {
  const rows = await runRpc<unknown[]>(
    "search_global_counts",
    {
      p_query: args.query,
    },
    args.signal,
  )

  const counts: GlobalSearchCountsMap = {}
  for (const value of Array.isArray(rows) ? rows : []) {
    const row = asRecord(value)
    if (!row) continue
    const entityType = pickEntityType(row)
    if (!entityType) continue
    counts[entityType] =
      asNumber(row.total_count) ??
      asNumber(row.count) ??
      asNumber(row.total) ??
      0
  }

  return counts
}

export async function fetchGlobalSearchAllTabCounts(args: {
  query: string
  signal?: AbortSignal
}): Promise<GlobalSearchCountsMap> {
  const rows = await runRpc<unknown[]>(
    "search_global_all_tab_counts",
    {
      p_query: args.query,
    },
    args.signal,
  )

  const counts: GlobalSearchCountsMap = {}
  for (const value of Array.isArray(rows) ? rows : []) {
    const row = asRecord(value)
    if (!row) continue
    const countValue =
      asNumber(row.total_count) ??
      asNumber(row.count) ??
      asNumber(row.total) ??
      0
    const sectionKey = pickCountsKey(row)
    if (sectionKey) {
      counts[sectionKey] = countValue
    }
    const entityType = pickEntityType(row)
    if (entityType) {
      counts[entityType] = countValue
    }
  }

  return counts
}

export async function fetchGlobalSearchDiscoveryCounts(args: {
  entityTypes: GlobalSearchItemEntityType[] | null
  signal?: AbortSignal
}): Promise<GlobalSearchCountsMap> {
  const rows = await runRpc<unknown[]>(
    "search_global_discovery_counts",
    {
      p_entity_types: args.entityTypes,
    },
    args.signal,
  )

  const counts: GlobalSearchCountsMap = {}
  for (const value of Array.isArray(rows) ? rows : []) {
    const row = asRecord(value)
    if (!row) continue
    const countValue =
      asNumber(row.total_count) ??
      asNumber(row.count) ??
      asNumber(row.total) ??
      0
    const sectionKey = pickCountsKey(row)
    if (sectionKey) {
      counts[sectionKey] = countValue
    }
    const entityType = pickEntityType(row)
    if (entityType) {
      counts[entityType] = countValue
    }
  }
  return counts
}

function normalizeGlobalSearchSection(value: unknown): GlobalSearchSection | null {
  const row = asRecord(value)
  if (!row) return null
  const sectionType = asString(row.type) ?? asString(row.section_type) ?? pickEntityType(row) ?? "unknown"
  const sectionEntityType = pickEntityType(row) ?? (isGlobalSearchItemEntityType(sectionType) ? sectionType : null)
  const nestedSections = asArray(row.sections)
    .map((section) => normalizeGlobalSearchSection(section))
    .filter(Boolean) as GlobalSearchSection[]
  const items = asArray(row.items)
    .map((item) => normalizeGlobalSearchDocument(item, sectionEntityType))
    .filter(Boolean) as GlobalSearchDocument[]
  const entityType = sectionEntityType ?? items[0]?.entity_type ?? nestedSections[0]?.entity_type ?? null

  const label = entityType ? asString(row.label) ?? getGlobalSearchEntityLabel(entityType) : (asString(row.label) ?? sectionType)
  const totalCount =
    asNumber(row.total_count) ??
    asNumber(row.count) ??
    asNumber(row.total) ??
    null

  return {
    type: sectionType,
    entity_type: entityType,
    label,
    total_count: totalCount,
    items,
    sections: nestedSections,
  }
}

function normalizeGlobalSearchSections(value: unknown): GlobalSearchSection[] {
  const record = asRecord(value)
  const sections = record ? asArray(record.sections) : asArray(value)
  const flatRows = sections
    .map((entry) => asRecord(entry))
    .filter(Boolean) as RpcRow[]
  const isFlatAllTabItemsPayload =
    flatRows.length > 0 &&
    flatRows.every((row) => {
      const hasNestedShape = Object.prototype.hasOwnProperty.call(row, "items") || Object.prototype.hasOwnProperty.call(row, "sections")
      return !hasNestedShape && pickEntityType(row) != null
    })
  if (isFlatAllTabItemsPayload) {
    const fallbackOrder: Record<GlobalSearchItemEntityType, number> = {
      task: 0,
      mention: 1,
      ai_thread: 2,
      artifact: 3,
      project: 4,
      user: 5,
      team: 6,
      project_briefing: 7,
    }
    const groups = new Map<
      GlobalSearchItemEntityType,
      {
        rank: number
        items: GlobalSearchDocument[]
      }
    >()
    for (const row of flatRows) {
      const entityType = pickEntityType(row)
      if (!entityType) continue
      const normalized = normalizeGlobalSearchDocument(row, entityType)
      if (!normalized) continue
      const rank = asNumber(row.type_rank) ?? fallbackOrder[entityType] ?? 999
      const existing = groups.get(entityType)
      if (existing) {
        existing.rank = Math.min(existing.rank, rank)
        existing.items.push(normalized)
      } else {
        groups.set(entityType, { rank, items: [normalized] })
      }
    }
    return Array.from(groups.entries())
      .sort((left, right) => left[1].rank - right[1].rank)
      .map(([entityType, grouped]) => ({
        type: entityType,
        entity_type: entityType,
        label: getGlobalSearchEntityLabel(entityType),
        total_count: grouped.items.length,
        items: grouped.items,
        sections: [],
      }))
  }
  return sections.map(normalizeGlobalSearchSection).filter(Boolean) as GlobalSearchSection[]
}

type DirectoryDiscoveryCacheEntry = {
  items: GlobalSearchDocument[]
  fetchedLimit: number
  exhausted: boolean
}

const directoryDiscoveryCache = new Map<string, DirectoryDiscoveryCacheEntry>()

function pickDiscoverySection(
  sections: GlobalSearchSection[],
  entityType: GlobalSearchItemEntityType,
): GlobalSearchSection | undefined {
  return (
    sections.find((entry) => entry.type === entityType) ??
    sections.find((entry) => entry.entity_type === entityType) ??
    sections.find((entry) =>
      entityType === "ai_thread"
        ? entry.type === "ai_threads" || entry.entity_type === "ai_thread"
        : false,
    )
  )
}

/**
 * Paginated discovery slice. First page fetches only `limit` rows (fast).
 * Later pages grow the same result set and reuse cache so we do not re-download
 * 500 rows every time the list asks for the next 25.
 */
export async function fetchDiscoveryDirectorySlice(args: {
  entityType: GlobalSearchItemEntityType
  offset: number
  limit: number
  signal?: AbortSignal
}): Promise<GlobalSearchDocument[]> {
  const needed = Math.max(1, args.offset + args.limit)
  const cached = directoryDiscoveryCache.get(args.entityType)
  if (cached && (cached.exhausted || cached.fetchedLimit >= needed)) {
    return cached.items.slice(args.offset, args.offset + args.limit)
  }

  const sections = await fetchGlobalSearchDiscoverySections({
    entityTypes: [args.entityType],
    perTypeLimit: needed,
    signal: args.signal,
  })
  const items = pickDiscoverySection(sections, args.entityType)?.items ?? []
  directoryDiscoveryCache.set(args.entityType, {
    items,
    fetchedLimit: needed,
    exhausted: items.length < needed,
  })
  return items.slice(args.offset, args.offset + args.limit)
}

export async function fetchGlobalSearchDiscoverySections(args: {
  entityTypes: GlobalSearchItemEntityType[] | null
  perTypeLimit: number
  signal?: AbortSignal
}): Promise<GlobalSearchSection[]> {
  const data = await runRpc<unknown>(
    "search_global_discovery_sections_v2",
    {
      p_limit_per_type: args.perTypeLimit,
      p_entity_types: args.entityTypes,
    },
    args.signal,
  )

  return normalizeGlobalSearchSections(data)
}

export async function fetchGlobalRecentlyOpened(args: {
  limit: number
  entityTypes?: GlobalSearchItemEntityType[] | null
  signal?: AbortSignal
}): Promise<GlobalSearchDocument[]> {
  const sections = await fetchGlobalSearchDiscoverySections({
    entityTypes: args.entityTypes ?? null,
    perTypeLimit: Math.max(1, args.limit),
    signal: args.signal,
  })

  const recentlyOpenedSection = sections.find((section) => section.type === "recently_opened")
  if (!recentlyOpenedSection) return []

  return recentlyOpenedSection.items.slice(0, Math.max(1, args.limit))
}

export async function fetchMentionsInbox(args: {
  mode: MentionsInboxMode
  seenFilter: MentionsInboxSeenFilter
  limit: number
  offset: number
  signal?: AbortSignal
}): Promise<GlobalSearchDocument[]> {
  const rows = await runRpc<unknown[]>(
    "list_mentions_inbox",
    {
      p_mode: args.mode,
      p_seen_filter: args.mode === "sent" ? "all" : args.seenFilter,
      p_limit: args.limit,
      p_offset: args.offset,
    },
    args.signal,
  )

  return (Array.isArray(rows) ? rows : [])
    .map((row) => normalizeMentionInboxDocument(row))
    .filter(Boolean) as GlobalSearchDocument[]
}

export async function fetchMentionsInboxCounts(signal?: AbortSignal): Promise<MentionsInboxCounts> {
  const rows = await runRpc<unknown>("list_mentions_inbox_counts", {}, signal)
  const root = asRecord(rows)
  const row = root ?? asRecord(asArray(rows)[0]) ?? {}

  return {
    received: pickMentionsCount(row, ["received", "received_count", "inbox_received_count"]) ?? 0,
    sent: pickMentionsCount(row, ["sent", "sent_count", "inbox_sent_count"]) ?? 0,
    unseen: pickMentionsCount(row, ["unseen", "unseen_count", "inbox_unseen_count"]) ?? 0,
    seen: pickMentionsCount(row, ["seen", "seen_count", "inbox_seen_count"]) ?? 0,
  }
}

export async function fetchGlobalSearchDocumentsByType(args: {
  query: string
  entityType: GlobalSearchItemEntityType
  limit: number
  offset: number
  signal?: AbortSignal
}): Promise<GlobalSearchDocument[]> {
  const rows = await runRpc<unknown[]>(
    "search_global_documents_by_type",
    {
      p_query: args.query,
      p_entity_type: args.entityType,
      p_limit: args.limit,
      p_offset: args.offset,
    },
    args.signal,
  )

  return (Array.isArray(rows) ? rows : [])
    .map((row) => normalizeGlobalSearchDocument(row))
    .filter(Boolean) as GlobalSearchDocument[]
}

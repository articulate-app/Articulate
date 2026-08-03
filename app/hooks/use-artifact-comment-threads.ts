"use client"

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { ArtifactAnchorType, ArtifactCommentAnchor } from "../lib/artifacts/artifact-types"

export type ArtifactCommentWatcher = {
  id: number
  full_name: string | null
  email: string | null
  photo: string | null
}

export type ArtifactCommentMention = {
  id: number
  thread_id: number
  comment: string | null
  created_at: string | null
  created_by: number | null
  users?: {
    id: number
    full_name: string | null
    email: string | null
    photo: string | null
  } | null
}

export type ArtifactCommentThread = {
  threadId: number
  threadType: string | null
  taskId: number | null
  projectId: number | null
  createdBy: number | null
  createdAt: string | null
  resolvedAt: string | null
  resolvedBy: number | null
  mentionCount: number
  watchers: ArtifactCommentWatcher[]
  firstComment: ArtifactCommentMention | null
  latestComment: ArtifactCommentMention | null
  mentions: ArtifactCommentMention[]
  previewComment: ArtifactCommentMention | null
  replyCount: number
  target: ArtifactCommentAnchor
}

export type ArtifactCommentCreateInput = {
  taskId?: number | null
  projectId?: number | null
  artifactId: string
  artifactVersionNumber: number
  comment: string
  anchorType: ArtifactAnchorType
  anchorStart?: number | null
  anchorEnd?: number | null
  anchorBlockKey?: string | null
  anchorQuote?: string | null
  anchorContextBefore?: string | null
  anchorContextAfter?: string | null
  attachmentId?: string | null
  anchorX?: number | null
  anchorY?: number | null
  anchorWidth?: number | null
  anchorHeight?: number | null
  anchorTimeStart?: number | null
  anchorTimeEnd?: number | null
  anchorData?: unknown
  watcherIds: number[]
  createdBy: number
}

const ARTIFACT_THREAD_QUERY_KEY = "artifact-comment-threads"

function toNumberOrNull(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function toTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null
}

function uniqueNumberList(values: number[]): number[] {
  return [...new Set(values.filter((value) => Number.isFinite(value)))]
}

function normalizeWatcher(row: any): ArtifactCommentWatcher | null {
  const user = row?.users ?? row ?? null
  const id = toNumberOrNull(user?.id)
  if (id == null) return null
  return {
    id,
    full_name: user?.full_name ?? null,
    email: user?.email ?? null,
    photo: user?.photo ?? null,
  }
}

function normalizeMention(row: any): ArtifactCommentMention | null {
  const id = toNumberOrNull(row?.id)
  if (id == null) return null
  return {
    id,
    thread_id: toNumberOrNull(row?.thread_id) ?? 0,
    comment: typeof row?.comment === "string" ? row.comment : null,
    created_at: toTrimmedString(row?.created_at),
    created_by: toNumberOrNull(row?.created_by),
    users: row?.users
      ? {
          id: toNumberOrNull(row.users.id) ?? 0,
          full_name: row.users.full_name ?? null,
          email: row.users.email ?? null,
          photo: row.users.photo ?? null,
        }
      : null,
  }
}

function normalizeThreadFromRow(row: any): ArtifactCommentThread | null {
  const threadId = toNumberOrNull(row?.thread_id ?? row?.id)
  const artifactId = toTrimmedString(row?.artifact_id ?? row?.target?.artifact_id)
  if (threadId == null || !artifactId) return null
  const mentions = Array.isArray(row?.mentions)
    ? (row.mentions.map(normalizeMention).filter(Boolean) as ArtifactCommentMention[])
    : []
  const watchers = Array.isArray(row?.watchers)
    ? (row.watchers.map(normalizeWatcher).filter(Boolean) as ArtifactCommentWatcher[])
    : []
  return {
    threadId,
    threadType: toTrimmedString(row?.thread_type),
    taskId: toNumberOrNull(row?.task_id),
    projectId: toNumberOrNull(row?.project_id),
    createdBy: toNumberOrNull(row?.created_by),
    createdAt: toTrimmedString(row?.created_at),
    resolvedAt: toTrimmedString(row?.resolved_at),
    resolvedBy: toNumberOrNull(row?.resolved_by),
    mentionCount: mentions.length,
    watchers,
    firstComment: mentions[0] ?? null,
    latestComment: mentions[mentions.length - 1] ?? null,
    mentions,
    previewComment: mentions[0] ?? null,
    replyCount: Math.max(0, mentions.length - 1),
    target: {
      artifactId,
      artifactVersionNumber: toNumberOrNull(row?.artifact_version_number) ?? 0,
      anchorType: (toTrimmedString(row?.anchor_type) as ArtifactAnchorType) ?? "document",
      attachmentId: toTrimmedString(row?.attachment_id),
      anchorStart: toNumberOrNull(row?.anchor_start),
      anchorEnd: toNumberOrNull(row?.anchor_end),
      anchorBlockKey: toTrimmedString(row?.anchor_block_key),
      anchorQuote: toTrimmedString(row?.anchor_quote),
      anchorContextBefore: toTrimmedString(row?.anchor_context_before),
      anchorContextAfter: toTrimmedString(row?.anchor_context_after),
      anchorX: toNumberOrNull(row?.anchor_x),
      anchorY: toNumberOrNull(row?.anchor_y),
      anchorWidth: toNumberOrNull(row?.anchor_width),
      anchorHeight: toNumberOrNull(row?.anchor_height),
      anchorTimeStart: toNumberOrNull(row?.anchor_time_start),
      anchorTimeEnd: toNumberOrNull(row?.anchor_time_end),
      anchorData: row?.anchor_data ?? null,
    },
  }
}

async function listArtifactCommentThreads(artifactIds: string[]): Promise<ArtifactCommentThread[]> {
  const ids = [...new Set(artifactIds.map((id) => id.trim()).filter(Boolean))]
  if (ids.length === 0) return []
  const supabase = createClientComponentClient()
  const { data, error } = await supabase
    .from("thread_targets")
    .select(
      `
      thread_id,
      entity_type,
      artifact_id,
      artifact_version_number,
      anchor_type,
      anchor_start,
      anchor_end,
      anchor_block_key,
      anchor_quote,
      anchor_context_before,
      anchor_context_after,
      attachment_id,
      anchor_x,
      anchor_y,
      anchor_width,
      anchor_height,
      anchor_time_start,
      anchor_time_end,
      anchor_data,
      threads (
        id,
        thread_type,
        task_id,
        project_id,
        created_by,
        created_at,
        resolved_at,
        resolved_by,
        thread_watchers (
          watcher_id,
          users:watcher_id(id, full_name, email, photo)
        )
      )
    `,
    )
    .eq("entity_type", "artifact")
    .in("artifact_id", ids)

  if (error) throw error

  const threadIds = ((data ?? []) as any[])
    .map((row) => toNumberOrNull(row?.thread_id ?? row?.threads?.id))
    .filter((id): id is number => id != null)

  let mentionsByThread = new Map<number, ArtifactCommentMention[]>()
  if (threadIds.length > 0) {
    const { data: mentionRows, error: mentionError } = await supabase
      .from("mentions")
      .select("id, thread_id, comment, created_at, created_by, users:created_by(id, full_name, email, photo)")
      .in("thread_id", threadIds)
      .order("created_at", { ascending: true })
    if (mentionError) throw mentionError
    mentionsByThread = new Map()
    for (const row of (mentionRows ?? []) as any[]) {
      const mention = normalizeMention(row)
      if (!mention) continue
      const list = mentionsByThread.get(mention.thread_id) ?? []
      list.push(mention)
      mentionsByThread.set(mention.thread_id, list)
    }
  }

  return ((data ?? []) as any[])
    .map((row) => {
      const thread = row.threads ?? {}
      const threadId = toNumberOrNull(row.thread_id ?? thread.id)
      const watchers = Array.isArray(thread?.thread_watchers)
        ? thread.thread_watchers
            .map((tw: any) => normalizeWatcher(tw?.users ? { ...tw.users, id: tw.watcher_id ?? tw.users.id } : tw))
            .filter(Boolean)
        : []
      return normalizeThreadFromRow({
        ...row,
        ...thread,
        thread_id: threadId,
        watchers,
        mentions: threadId != null ? mentionsByThread.get(threadId) ?? [] : [],
      })
    })
    .filter(Boolean) as ArtifactCommentThread[]
}

/**
 * Create a regular comment thread, then insert one `thread_targets` row for the artifact anchor.
 * Mentions use the existing mentions flow (unrelated to AI chat threads).
 */
async function createArtifactCommentThread(input: ArtifactCommentCreateInput): Promise<number> {
  const artifactId = input.artifactId.trim()
  if (!artifactId) throw new Error("artifact_id is required")

  const supabase = createClientComponentClient()
  const watcherIds = uniqueNumberList([input.createdBy, ...(input.watcherIds ?? [])])

  const { data: thread, error: threadError } = await supabase
    .from("threads")
    .insert({
      thread_type: "artifact_comment",
      task_id: input.taskId ?? null,
      project_id: input.projectId ?? null,
      created_by: input.createdBy,
    })
    .select("id")
    .single()
  if (threadError) throw threadError

  const threadId = toNumberOrNull(thread?.id)
  if (threadId == null) throw new Error("Failed to create artifact comment thread.")

  const { error: targetError } = await supabase.from("thread_targets").insert({
    thread_id: threadId,
    entity_type: "artifact",
    artifact_id: artifactId,
    artifact_version_number: input.artifactVersionNumber,
    anchor_type: input.anchorType,
    anchor_start: input.anchorStart ?? null,
    anchor_end: input.anchorEnd ?? null,
    anchor_block_key: input.anchorBlockKey ?? null,
    anchor_quote: input.anchorQuote ?? null,
    anchor_context_before: input.anchorContextBefore ?? null,
    anchor_context_after: input.anchorContextAfter ?? null,
    attachment_id: input.attachmentId ?? null,
    anchor_x: input.anchorX ?? null,
    anchor_y: input.anchorY ?? null,
    anchor_width: input.anchorWidth ?? null,
    anchor_height: input.anchorHeight ?? null,
    anchor_time_start: input.anchorTimeStart ?? null,
    anchor_time_end: input.anchorTimeEnd ?? null,
    anchor_data: input.anchorData ?? null,
  })
  if (targetError) throw targetError

  const { error: mentionError } = await supabase.from("mentions").insert({
    thread_id: threadId,
    comment: input.comment,
    created_by: input.createdBy,
  })
  if (mentionError) throw mentionError

  if (watcherIds.length > 0) {
    await supabase.from("thread_watchers").insert(
      watcherIds.map((watcherId) => ({
        thread_id: threadId,
        watcher_id: watcherId,
        added_by: input.createdBy,
      })),
    )
  }

  return threadId
}

async function replyToArtifactCommentThread(input: {
  threadId: number
  comment: string
  createdBy: number
}) {
  const supabase = createClientComponentClient()
  const { error } = await supabase.from("mentions").insert({
    thread_id: input.threadId,
    comment: input.comment,
    created_by: input.createdBy,
  })
  if (error) throw error
}

export function useArtifactCommentThreads(artifactIds: string[], options?: { enabled?: boolean }) {
  const normalized = [...new Set(artifactIds.map((id) => id.trim()).filter(Boolean))].sort()
  const enabled = (options?.enabled ?? true) && normalized.length > 0
  return useQuery({
    queryKey: [ARTIFACT_THREAD_QUERY_KEY, normalized.join("|")],
    queryFn: () => listArtifactCommentThreads(normalized),
    enabled,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  })
}

export function groupThreadsByArtifactId(
  threads: ArtifactCommentThread[],
): Map<string, ArtifactCommentThread[]> {
  const map = new Map<string, ArtifactCommentThread[]>()
  for (const thread of threads) {
    const id = thread.target.artifactId
    if (!id) continue
    const next = map.get(id) ?? []
    next.push(thread)
    map.set(id, next)
  }
  return map
}

export function useCreateArtifactCommentThread() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createArtifactCommentThread,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [ARTIFACT_THREAD_QUERY_KEY] })
    },
  })
}

export function useReplyToArtifactCommentThread() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: replyToArtifactCommentThread,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [ARTIFACT_THREAD_QUERY_KEY] })
    },
  })
}

async function deleteArtifactCommentThread(threadId: number) {
  const supabase = createClientComponentClient()
  const { error } = await supabase.from("threads").delete().eq("id", threadId)
  if (error) throw error
}

async function setArtifactCommentThreadResolved(input: {
  threadId: number
  resolvedAt: string | null
  resolvedBy: number | null
}) {
  const supabase = createClientComponentClient()
  const { error } = await supabase
    .from("threads")
    .update({
      resolved_at: input.resolvedAt,
      resolved_by: input.resolvedBy,
    })
    .eq("id", input.threadId)
  if (error) throw error
}

export function useDeleteArtifactCommentThread() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteArtifactCommentThread,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [ARTIFACT_THREAD_QUERY_KEY] })
    },
  })
}

export function useResolveArtifactCommentThread() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: setArtifactCommentThreadResolved,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [ARTIFACT_THREAD_QUERY_KEY] })
    },
  })
}

export type ArtifactNotifyUser = {
  id: number
  full_name: string | null
  email: string | null
  photo: string | null
}

/**
 * Default "We'll notify" pool for a new artifact comment thread:
 * task watchers → project watchers → shared AI thread audience.
 */
export async function loadArtifactNotifyPool(artifact: {
  task_id?: number | null
  project_id?: number | null
  ai_thread_id?: string | null
}): Promise<ArtifactNotifyUser[]> {
  const supabase = createClientComponentClient()

  if (artifact.task_id != null && artifact.task_id > 0) {
    const { data, error } = await supabase
      .from("task_watchers")
      .select("user_id, users:user_id(id, full_name, email, photo)")
      .eq("task_id", artifact.task_id)
      .eq("is_deleted", false)
    if (error) throw error
    return ((data ?? []) as any[])
      .map((row) => {
        const user = row?.users
        const id = toNumberOrNull(user?.id ?? row?.user_id)
        if (id == null) return null
        return {
          id,
          full_name: user?.full_name ?? null,
          email: user?.email ?? null,
          photo: user?.photo ?? null,
        } satisfies ArtifactNotifyUser
      })
      .filter(Boolean) as ArtifactNotifyUser[]
  }

  if (artifact.project_id != null && artifact.project_id > 0) {
    const { data, error } = await supabase
      .from("project_watchers")
      .select("user_id, users:user_id(id, full_name, email, photo)")
      .eq("project_id", artifact.project_id)
    if (error) throw error
    return ((data ?? []) as any[])
      .map((row) => {
        const user = row?.users
        const id = toNumberOrNull(user?.id ?? row?.user_id)
        if (id == null) return null
        return {
          id,
          full_name: user?.full_name ?? null,
          email: user?.email ?? null,
          photo: user?.photo ?? null,
        } satisfies ArtifactNotifyUser
      })
      .filter(Boolean) as ArtifactNotifyUser[]
  }

  const aiThreadId = toTrimmedString(artifact.ai_thread_id)
  if (!aiThreadId) return []

  const { data: thread, error: threadError } = await supabase
    .from("ai_threads")
    .select("id, created_by, visibility, is_collaborative, project_id, team_id")
    .eq("id", aiThreadId)
    .maybeSingle()
  if (threadError) throw threadError
  if (!thread) return []

  const visibility = String(thread.visibility ?? "private")
  const isShared = visibility === "project" || visibility === "team" || thread.is_collaborative === true
  if (!isShared || visibility === "private") {
    const creatorId = toNumberOrNull(thread.created_by)
    if (creatorId == null) return []
    const { data: user } = await supabase
      .from("users")
      .select("id, full_name, email, photo")
      .eq("id", creatorId)
      .maybeSingle()
    if (!user) return []
    return [{
      id: creatorId,
      full_name: user.full_name ?? null,
      email: user.email ?? null,
      photo: user.photo ?? null,
    }]
  }

  if (visibility === "project" && thread.project_id) {
    const { data, error } = await supabase
      .from("project_watchers")
      .select("user_id, users:user_id(id, full_name, email, photo)")
      .eq("project_id", thread.project_id)
    if (error) throw error
    return ((data ?? []) as any[])
      .map((row) => {
        const user = row?.users
        const id = toNumberOrNull(user?.id ?? row?.user_id)
        if (id == null) return null
        return {
          id,
          full_name: user?.full_name ?? null,
          email: user?.email ?? null,
          photo: user?.photo ?? null,
        } satisfies ArtifactNotifyUser
      })
      .filter(Boolean) as ArtifactNotifyUser[]
  }

  // Team-visible threads: fall back to project watchers when project_id is set.
  if (thread.project_id) {
    const { data, error } = await supabase
      .from("project_watchers")
      .select("user_id, users:user_id(id, full_name, email, photo)")
      .eq("project_id", thread.project_id)
    if (error) throw error
    return ((data ?? []) as any[])
      .map((row) => {
        const user = row?.users
        const id = toNumberOrNull(user?.id ?? row?.user_id)
        if (id == null) return null
        return {
          id,
          full_name: user?.full_name ?? null,
          email: user?.email ?? null,
          photo: user?.photo ?? null,
        } satisfies ArtifactNotifyUser
      })
      .filter(Boolean) as ArtifactNotifyUser[]
  }

  return []
}

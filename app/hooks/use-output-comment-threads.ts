"use client"

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

export type OutputCommentAnchorType =
  | "text_range"
  | "block"
  | "document"
  | "asset"
  | "image_point"

export interface OutputCommentAnchor {
  taskComponentOutputId: string
  anchorType: OutputCommentAnchorType
  attachmentId?: string | null
  anchorStart: number | null
  anchorEnd: number | null
  anchorQuote: string | null
  anchorX?: number | null
  anchorY?: number | null
  anchorWidth?: number | null
  anchorHeight?: number | null
  anchorTimeStart?: number | null
  anchorTimeEnd?: number | null
  anchorData?: unknown
}

export interface OutputCommentWatcher {
  id: number
  full_name: string | null
  email: string | null
  photo: string | null
}

export interface OutputCommentMention {
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

export interface OutputCommentThread {
  threadId: number
  threadType: string | null
  taskId: number | null
  projectId: number | null
  createdBy: number | null
  createdAt: string | null
  resolvedAt: string | null
  resolvedBy: number | null
  mentionCount: number
  watchers: OutputCommentWatcher[]
  firstComment: OutputCommentMention | null
  latestComment: OutputCommentMention | null
  mentions: OutputCommentMention[]
  previewComment: OutputCommentMention | null
  replyCount: number
  target: OutputCommentAnchor
}

export interface OutputCommentCreateInput {
  taskId: number
  projectId?: number | null
  channelId?: number | null
  taskComponentId?: string | null
  briefingComponentId?: number | null
  taskComponentOutputId?: string | null
  comment: string
  anchorType: OutputCommentAnchorType
  anchorStart?: number | null
  anchorEnd?: number | null
  anchorQuote?: string | null
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

interface UseOutputCommentThreadsBatchOptions {
  enabled?: boolean
}

const OUTPUT_THREAD_BATCH_QUERY_KEY = "output-comment-threads-batch"

function toNumberOrNull(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function normalizeWatcher(row: any): OutputCommentWatcher | null {
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

function normalizeMention(row: any): OutputCommentMention | null {
  const id = toNumberOrNull(row?.id)
  if (id == null) return null
  return {
    id,
    thread_id: toNumberOrNull(row?.thread_id) ?? 0,
    comment: row?.comment ?? null,
    created_at: row?.created_at ?? null,
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

function uniqueNumberList(values: number[]): number[] {
  return Array.from(new Set(values.filter((v) => Number.isFinite(v))))
}

function normalizeOutputIdList(outputIds: string[]): string[] {
  const normalized = outputIds
    .map((id) => (typeof id === "string" ? id.trim() : ""))
    .filter(Boolean)
  return Array.from(new Set(normalized)).sort()
}

function firstNonEmptyString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== "string") continue
    const trimmed = value.trim()
    if (trimmed) return trimmed
  }
  return null
}

function normalizeThreadFromRow(row: any): OutputCommentThread | null {
  const threadId = toNumberOrNull(row?.thread_id ?? row?.id)
  const taskComponentOutputId = typeof row?.task_component_output_id === "string" ? row.task_component_output_id : null
  if (threadId == null || !taskComponentOutputId) return null

  const mentions = Array.isArray(row?.mentions)
    ? row.mentions.map(normalizeMention).filter(Boolean) as OutputCommentMention[]
    : []
  const sortedMentions = [...mentions].sort(
    (a, b) => new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime()
  )
  const previewCommentId = toNumberOrNull(
    row?.preview_comment_id
      ?? row?.latest_comment_id
      ?? row?.preview?.comment_id
      ?? row?.preview_comment?.id
  )
  const previewAuthorId = toNumberOrNull(
    row?.preview_author_id
      ?? row?.preview?.author_id
      ?? row?.preview_author?.id
      ?? row?.created_by
  )
  const previewAuthorName = firstNonEmptyString(
    row?.preview_author_name,
    row?.preview_author_email,
    row?.preview_author_full_name,
    row?.preview?.author_name,
    row?.preview_author?.full_name,
    row?.preview_comment?.users?.full_name
  )
  const previewAuthorEmail = firstNonEmptyString(
    row?.preview_author_email,
    row?.preview?.author_email,
    row?.preview_author?.email,
    row?.preview_comment?.users?.email
  )
  const previewAuthorPhoto = firstNonEmptyString(
    row?.preview_author_photo,
    row?.preview?.author_photo,
    row?.preview_author?.photo,
    row?.preview_comment?.users?.photo
  )
  const previewCommentText = firstNonEmptyString(
    row?.preview_comment_text,
    row?.latest_comment_text,
    row?.preview?.comment_text,
    row?.preview_comment?.comment
  )
  const previewCommentCreatedAt =
    firstNonEmptyString(
      row?.preview_comment_created_at,
      row?.latest_comment_created_at,
      row?.preview?.comment_created_at,
      row?.preview_comment?.created_at
    ) ?? row?.created_at ?? null
  const previewComment: OutputCommentMention | null =
    previewCommentId != null || previewCommentText != null || previewAuthorName != null
      ? {
          id: previewCommentId ?? threadId,
          thread_id: threadId,
          comment: previewCommentText ?? null,
          created_at: previewCommentCreatedAt,
          created_by: previewAuthorId,
          users: previewAuthorId != null || previewAuthorName || previewAuthorPhoto
            ? {
                id: previewAuthorId ?? 0,
                full_name: previewAuthorName ?? null,
                email: previewAuthorEmail ?? null,
                photo: previewAuthorPhoto ?? null,
              }
            : null,
        }
      : null
  const watchers = Array.isArray(row?.watchers)
    ? row.watchers.map(normalizeWatcher).filter(Boolean) as OutputCommentWatcher[]
    : []

  return {
    threadId,
    threadType: firstNonEmptyString(row?.thread_type),
    taskId: toNumberOrNull(row?.task_id),
    projectId: toNumberOrNull(row?.project_id),
    createdBy: toNumberOrNull(row?.created_by),
    createdAt: row?.created_at ?? null,
    resolvedAt: row?.resolved_at ?? null,
    resolvedBy: toNumberOrNull(row?.resolved_by),
    mentionCount: Number.isFinite(Number(row?.mention_count))
      ? Math.max(0, Number(row.mention_count))
      : sortedMentions.length,
    watchers,
    firstComment: sortedMentions[0] ?? null,
    latestComment: sortedMentions[sortedMentions.length - 1] ?? null,
    mentions: sortedMentions,
    previewComment: previewComment ?? sortedMentions[sortedMentions.length - 1] ?? null,
    replyCount: Number.isFinite(Number(row?.reply_count))
      ? Math.max(0, Number(row.reply_count))
      : Math.max(0, sortedMentions.length - 1),
    target: {
      taskComponentOutputId,
      anchorType: (row?.anchor_type ?? "document") as OutputCommentAnchorType,
      attachmentId: typeof row?.attachment_id === "string" ? row.attachment_id : null,
      anchorStart: toNumberOrNull(row?.anchor_start),
      anchorEnd: toNumberOrNull(row?.anchor_end),
      anchorQuote: row?.anchor_quote ?? null,
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

async function listOutputCommentThreadsBatch(outputIds: string[]): Promise<OutputCommentThread[]> {
  const normalizedOutputIds = normalizeOutputIdList(outputIds)
  if (normalizedOutputIds.length === 0) return []
  const supabase = createClientComponentClient()
  const { data, error } = await supabase.rpc("get_output_comment_threads_batch", {
    p_output_ids: normalizedOutputIds,
  })
  if (error) throw error
  return ((data ?? []) as any[])
    .map(normalizeThreadFromRow)
    .filter(Boolean) as OutputCommentThread[]
}

async function createOutputCommentThread(input: OutputCommentCreateInput): Promise<number> {
  const supabase = createClientComponentClient()
  const taskComponentOutputId =
    typeof input.taskComponentOutputId === "string" ? input.taskComponentOutputId.trim() : ""
  if (!taskComponentOutputId) throw new Error("Could not resolve task_component_output id for this output.")

  const watcherIds = uniqueNumberList([input.createdBy, ...(input.watcherIds ?? [])])
  const { data: rpcData, error: rpcError } = await supabase.rpc("create_output_comment_thread", {
    p_task_component_output_id: taskComponentOutputId,
    p_created_by: input.createdBy,
    p_comment: input.comment,
    p_anchor_type: input.anchorType,
    p_anchor_start: input.anchorStart ?? null,
    p_anchor_end: input.anchorEnd ?? null,
    p_anchor_quote: input.anchorQuote ?? null,
    p_attachment_id: input.attachmentId ?? null,
    p_anchor_x: input.anchorX ?? null,
    p_anchor_y: input.anchorY ?? null,
    p_anchor_width: input.anchorWidth ?? null,
    p_anchor_height: input.anchorHeight ?? null,
    p_anchor_time_start: input.anchorTimeStart ?? null,
    p_anchor_time_end: input.anchorTimeEnd ?? null,
    p_anchor_data: input.anchorData ?? null,
    p_watcher_ids: watcherIds,
  })
  if (!rpcError) {
    if (typeof rpcData === "number") return rpcData
    if (Array.isArray(rpcData) && rpcData.length > 0) {
      const row = rpcData[0] as any
      const threadId = toNumberOrNull(row?.thread_id ?? row?.id)
      if (threadId != null) return threadId
    }
    if (rpcData && typeof rpcData === "object") {
      const threadId = toNumberOrNull((rpcData as any).thread_id ?? (rpcData as any).id)
      if (threadId != null) return threadId
    }
    throw new Error("create_output_comment_thread returned no thread id")
  }

  const { data: thread, error: threadError } = await supabase
    .from("threads")
    .insert({
      thread_type: "output_comment",
      task_id: input.taskId,
      project_id: input.projectId ?? null,
      created_by: input.createdBy,
    })
    .select("id")
    .single()
  if (threadError) throw threadError

  const threadId = toNumberOrNull(thread?.id)
  if (threadId == null) throw new Error("Failed to create output comment thread.")

  const { error: targetError } = await supabase.from("thread_targets").insert({
    thread_id: threadId,
    entity_type: "task_component_output",
    task_component_output_id: taskComponentOutputId,
    anchor_type: input.anchorType,
    anchor_start: input.anchorStart ?? null,
    anchor_end: input.anchorEnd ?? null,
    anchor_quote: input.anchorQuote ?? null,
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

  return threadId
}

async function replyToOutputCommentThread(input: { threadId: number; comment: string; createdBy: number }) {
  const supabase = createClientComponentClient()
  const { error } = await supabase.from("mentions").insert({
    thread_id: input.threadId,
    comment: input.comment,
    created_by: input.createdBy,
  })
  if (error) throw error
}

async function updateOutputCommentThreadResolution(input: {
  threadId: number
  createdBy: number
  resolved: boolean
}) {
  const supabase = createClientComponentClient()
  const patch = input.resolved
    ? { resolved_at: new Date().toISOString(), resolved_by: input.createdBy }
    : { resolved_at: null, resolved_by: null }
  const { error } = await supabase.from("threads").update(patch).eq("id", input.threadId)
  if (error) throw error
}

export function useOutputCommentThreadsBatch(outputIds: string[], options?: UseOutputCommentThreadsBatchOptions) {
  const normalizedOutputIds = normalizeOutputIdList(outputIds)
  const enabled = (options?.enabled ?? true) && normalizedOutputIds.length > 0
  return useQuery({
    queryKey: [OUTPUT_THREAD_BATCH_QUERY_KEY, normalizedOutputIds.join("|")],
    queryFn: () => listOutputCommentThreadsBatch(normalizedOutputIds),
    enabled,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  })
}

export function groupThreadsByOutputId(threads: OutputCommentThread[]): Map<string, OutputCommentThread[]> {
  const map = new Map<string, OutputCommentThread[]>()
  for (const thread of threads) {
    const outputId = thread.target.taskComponentOutputId
    if (!outputId) continue
    const next = map.get(outputId) ?? []
    next.push(thread)
    map.set(outputId, next)
  }
  return map
}

export function useCreateOutputCommentThread() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createOutputCommentThread,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [OUTPUT_THREAD_BATCH_QUERY_KEY] })
    },
  })
}

export function useReplyToOutputCommentThread() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: replyToOutputCommentThread,
    onSuccess: async (_result, vars) => {
      await queryClient.invalidateQueries({ queryKey: ["thread-mentions-batch"] })
      await queryClient.invalidateQueries({ queryKey: [OUTPUT_THREAD_BATCH_QUERY_KEY] })
    },
  })
}

export function useResolveOutputCommentThread() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { threadId: number; createdBy: number }) =>
      updateOutputCommentThreadResolution({ ...input, resolved: true }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [OUTPUT_THREAD_BATCH_QUERY_KEY] })
    },
  })
}

export function useReopenOutputCommentThread() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { threadId: number; createdBy: number }) =>
      updateOutputCommentThreadResolution({ ...input, resolved: false }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [OUTPUT_THREAD_BATCH_QUERY_KEY] })
    },
  })
}


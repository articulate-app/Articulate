"use client"

import type { QueryClient } from "@tanstack/react-query"
import { getSupabaseBrowser } from "../../lib/supabase-browser"
import { taskChannelBootstrapQueryKey } from "../../app/hooks/use-task-channel-bootstrap"
import type { TaskChannelBootstrapResponse } from "../../app/lib/types/task-channel-bootstrap"
import { tcComponentsForTaskChannelQueryKey } from "./apply-content-saved-action"
import { useComponentEditStreamStore } from "../../app/store/component-edit-stream"
import {
  collectAiMessageChangeSetTaskChannelPairs,
  type AiMessageChangeSet,
} from "./ai-message-change-set"
import {
  parseAiThreadTimelineRestoreResult,
  type AiThreadRestoreCreatedMessage,
  type AiThreadRestoredItem,
  type AiThreadTimelineRestoreResult,
} from "./ai-thread-timeline-restore-utils"
import type { AiMessage } from "./types"

export const CONTENT_VERSION_HISTORY_REFRESH_EVENT = "articulate:content-version-history-refresh"

export type ContentVersionHistoryRefreshDetail = {
  taskId?: number
  channelId?: number
  taskComponentOutputId?: string
}

export function dispatchContentVersionHistoryRefresh(detail: ContentVersionHistoryRefreshDetail): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(
    new CustomEvent(CONTENT_VERSION_HISTORY_REFRESH_EVENT, { detail }),
  )
}

export async function restoreAiThreadToMessage(args: {
  threadId: string
  targetMessageId: string
  restoredBy?: number | null
}): Promise<AiThreadTimelineRestoreResult> {
  const supabase = getSupabaseBrowser()
  const rpcArgs: Record<string, unknown> = {
    p_thread_id: args.threadId,
    p_target_message_id: args.targetMessageId,
  }
  if (args.restoredBy != null) {
    rpcArgs.p_restored_by = args.restoredBy
  }

  const { data, error } = await supabase.rpc("ai_restore_thread_to_message", rpcArgs)
  if (error) throw error

  return parseAiThreadTimelineRestoreResult(data)
}

/**
 * Optimistically patch the component-output caches (bootstrap composed_output and the
 * standalone composed-output query) with the restored content returned by the RPC.
 *
 * Mirrors the react-query patch used by the AI stream + component-output restore so the
 * Content tab reflects the restored state immediately, without waiting for a refetch.
 */
export function applyAiThreadRestoreOptimisticOutputs(
  queryClient: QueryClient,
  items: AiThreadRestoredItem[],
): void {
  if (!items || items.length === 0) return

  const pairs = new Map<string, { taskId: number; channelId: number }>()
  for (const item of items) {
    if (item.task_id != null && item.channel_id != null) {
      pairs.set(`${item.task_id}:${item.channel_id}`, { taskId: item.task_id, channelId: item.channel_id })
    }
  }
  if (pairs.size === 0) return

  const now = new Date().toISOString()

  const patchRow = (row: Record<string, unknown>): Record<string, unknown> | null => {
    const rowOutputId = typeof row.task_component_output_id === "string" ? row.task_component_output_id : null
    const rowTaskComponentId = typeof row.task_component_id === "string" ? row.task_component_id : null
    const match = items.find((item) => {
      if (item.task_component_output_id && rowOutputId === item.task_component_output_id) return true
      const candidate = item.task_component_id ?? item.component_id
      if (candidate && rowTaskComponentId && rowTaskComponentId === candidate) return true
      return false
    })
    if (!match) return null

    const blocks = Array.isArray(match.restored_content_json) ? match.restored_content_json : null
    return {
      ...row,
      content_text: match.restored_content_text,
      content: blocks ?? row.content,
      content_json: blocks ?? row.content_json,
      resolved_content_json: blocks ?? row.resolved_content_json,
      content_format: match.content_format ?? row.content_format ?? (blocks ? "json" : "text"),
      task_component_output_id: match.task_component_output_id ?? rowOutputId,
      updated_at: now,
    }
  }

  for (const { taskId, channelId } of pairs.values()) {
    const bootstrapKey = [...taskChannelBootstrapQueryKey(taskId, channelId)]
    queryClient.setQueryData<TaskChannelBootstrapResponse | undefined>(bootstrapKey, (old) => {
      if (!old) return old
      let touched = false
      const composed_output = (old.composed_output ?? []).map((row) => {
        const patched = patchRow(row as unknown as Record<string, unknown>)
        if (!patched) return row
        touched = true
        return patched as unknown as typeof row
      })
      if (!touched) return old
      return { ...old, composed_output, meta: { ...old.meta, fetched_at: now } }
    })

    queryClient.setQueryData<unknown>(["task-channel-composed-output", taskId, channelId], (old: unknown) => {
      if (!Array.isArray(old)) return old
      let touched = false
      const next = old.map((row) => {
        if (!row || typeof row !== "object") return row
        const patched = patchRow(row as Record<string, unknown>)
        if (!patched) return row
        touched = true
        return patched
      })
      return touched ? next : old
    })
  }
}

/**
 * Optimistically trim the visible thread timeline to the restore point and append the
 * restore confirmation message, matching what `v_ai_messages_enriched` will return on
 * the next fetch/reload.
 */
export function truncateThreadMessagesAfterRestore(
  queryClient: QueryClient,
  args: {
    threadId: string
    pageSize?: number
    publicUserId?: number | null
    restoredToMessageId: string | null
    createdChatMessage: AiThreadRestoreCreatedMessage | null
  },
): void {
  const { threadId, pageSize = 200, publicUserId = null, restoredToMessageId, createdChatMessage } = args
  if (!restoredToMessageId) return
  const messagesKey = ["ai-messages", threadId, pageSize, publicUserId] as const

  queryClient.setQueryData<AiMessage[] | undefined>(messagesKey, (old) => {
    if (!old || old.length === 0) return old
    const target = old.find((message) => message.id === restoredToMessageId)
    if (!target) return old
    const targetCreatedAt = target.created_at ?? ""

    const kept = old.filter((message) => {
      if (message.id === restoredToMessageId) return true
      if (createdChatMessage && message.id === createdChatMessage.id) return false
      return (message.created_at ?? "") <= targetCreatedAt
    })

    if (!createdChatMessage) return kept

    const confirmation: AiMessage = {
      id: createdChatMessage.id,
      thread_id: createdChatMessage.thread_id ?? threadId,
      role: createdChatMessage.role === "user" || createdChatMessage.role === "system" ? createdChatMessage.role : "assistant",
      content: createdChatMessage.content,
      content_json: createdChatMessage.content_json,
      created_at: createdChatMessage.created_at ?? new Date().toISOString(),
      created_by: createdChatMessage.created_by ?? null,
      attachments: [],
    }
    return [...kept, confirmation]
  })
}

async function refetchTaskChannelBootstrapPair(
  queryClient: QueryClient,
  taskId: number,
  channelId: number,
): Promise<void> {
  const bootstrapKey = [...taskChannelBootstrapQueryKey(taskId, channelId)]
  await queryClient.refetchQueries({ queryKey: bootstrapKey, type: "active" })
  void queryClient.invalidateQueries({
    queryKey: ["task-channel-composed-output", taskId, channelId],
  })
  void queryClient.invalidateQueries({
    queryKey: [...tcComponentsForTaskChannelQueryKey(taskId, channelId)],
  })
  dispatchContentVersionHistoryRefresh({ taskId, channelId })
}

export async function refreshUiAfterAiThreadTimelineRestore(args: {
  queryClient: QueryClient
  threadId: string
  pageSize?: number
  publicUserId?: number | null
  taskId?: number | null
  channelId?: number | null
  changeSet?: AiMessageChangeSet | null
}): Promise<void> {
  const {
    queryClient,
    threadId,
    pageSize = 200,
    publicUserId = null,
    taskId,
    channelId,
    changeSet,
  } = args

  const messagesKey = ["ai-messages", threadId, pageSize, publicUserId] as const

  useComponentEditStreamStore.getState().clearAllPreviewStreams()

  const pairs = new Map<string, { taskId: number; channelId: number }>()
  if (taskId != null && channelId != null) {
    pairs.set(`${taskId}:${channelId}`, { taskId, channelId })
  }
  if (changeSet) {
    for (const pair of collectAiMessageChangeSetTaskChannelPairs(changeSet)) {
      pairs.set(`${pair.taskId}:${pair.channelId}`, pair)
    }
  }

  await Promise.all(
    Array.from(pairs.values()).map(({ taskId: tid, channelId: cid }) =>
      refetchTaskChannelBootstrapPair(queryClient, tid, cid),
    ),
  )

  await queryClient.refetchQueries({ queryKey: messagesKey, type: "active" })
  void queryClient.invalidateQueries({ queryKey: ["ai-threads"] })
}

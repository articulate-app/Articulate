"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { getSupabaseBrowser } from "../../lib/supabase-browser"
import type { AiMessage, AiThread, AiThreadContextLive, AiVisibility } from "./types"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useCurrentUserStore } from "../../app/store/current-user"
import { logAiChatDebug } from "./debug"
import { toPersistedAiThreadId } from "./thread-id"

// Helpers
const THREADS_PAGE_SIZE = 50
export const MESSAGES_PAGE_SIZE_DEFAULT = 200

function normalizeMessageAttachments(value: unknown): AiMessage["attachments"] {
  if (Array.isArray(value)) return value as AiMessage["attachments"]
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? (parsed as AiMessage["attachments"]) : []
    } catch {
      return []
    }
  }
  return []
}

export function useThreads() {
  const supabase = getSupabaseBrowser()
  const queryClient = useQueryClient()
  const publicUserId = useCurrentUserStore((s) => s.publicUserId)

  const fetchThreads = useCallback(async ({ pageParam = 0 }) => {
    logAiChatDebug("query.trigger.v_ai_threads_visible", {
      source: "useThreads.fetchThreads",
      pageParam,
    })
    const { data, error } = await supabase
      .from('v_ai_threads_visible')
      .select('*')
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .range(pageParam, pageParam + THREADS_PAGE_SIZE - 1)

    if (error) throw error
    return data as AiThread[]
  }, [supabase])

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['ai-threads', publicUserId],
    enabled: publicUserId != null,
    queryFn: () => fetchThreads({ pageParam: 0 }),
    refetchOnWindowFocus: false,
  })

  // Realtime subscription to ai_threads (INSERT/UPDATE/DELETE)
  // Avoid refetching thread list for message-only updates (last_message_at churn).
  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    const scheduleThreadListInvalidation = () => {
      if (debounceTimer != null) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        debounceTimer = null
        logAiChatDebug("query.invalidate.ai-threads", {
          source: "ai_threads.realtime",
        })
        queryClient.invalidateQueries({ queryKey: ['ai-threads'] })
      }, 120)
    }

    const shouldInvalidateThreadList = (payload: any): boolean => {
      const eventType = payload?.eventType as string | undefined
      if (eventType === "INSERT" || eventType === "DELETE") return true
      if (eventType !== "UPDATE") return true

      const next = (payload?.new ?? {}) as Record<string, unknown>
      const prev = (payload?.old ?? {}) as Record<string, unknown>
      const ignoredKeys = new Set(["last_message_at", "updated_at"])
      const keys = new Set([...Object.keys(next), ...Object.keys(prev)])
      for (const key of Array.from(keys)) {
        if (ignoredKeys.has(key)) continue
        if ((next as any)[key] !== (prev as any)[key]) return true
      }
      return false
    }

    const channel = supabase
      .channel('ai-threads')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ai_threads' }, (payload) => {
        if (!shouldInvalidateThreadList(payload)) return
        scheduleThreadListInvalidation()
      })
      .subscribe()
    return () => {
      if (debounceTimer != null) clearTimeout(debounceTimer)
      supabase.removeChannel(channel)
    }
  }, [supabase, queryClient])

  return {
    threads: data ?? [],
    isLoading,
    isError,
    refetch,
  }
}

// Hook for content types realtime updates
export function useContentTypesRealtime(taskId?: number) {
  const supabase = getSupabaseBrowser()
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!taskId) return

    const channel = supabase
      .channel(`content-types-${taskId}`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'content_types_tasks',
        filter: `task_id=eq.${taskId}`
      }, () => {
        // Invalidate any content type related queries
        queryClient.invalidateQueries({ queryKey: ['content-types-for-task', taskId] })
        // Also invalidate task details to refresh the content types section
        queryClient.invalidateQueries({ queryKey: ['task', taskId] })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [supabase, queryClient, taskId])
}

export function useThreadContext(threadId?: string) {
  const supabase = getSupabaseBrowser()
  const publicUserId = useCurrentUserStore((s) => s.publicUserId)
  const persistedThreadId = toPersistedAiThreadId(threadId)
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['ai-thread-context', threadId, publicUserId],
    enabled: publicUserId != null && !!persistedThreadId,
    queryFn: async () => {
      if (!persistedThreadId) return null
      const { data, error } = await supabase
        .from('v_ai_thread_context_live')
        .select('*')
        .eq('thread_id', persistedThreadId)
        .single()
      if (error) throw error
      return data as AiThreadContextLive
    },
  })
  return { context: data ?? null, isLoading, isError, refetch }
}

export function useMessages(threadId?: string, pageSize: number = MESSAGES_PAGE_SIZE_DEFAULT) {
  const supabase = getSupabaseBrowser()
  const queryClient = useQueryClient()
  const publicUserId = useCurrentUserStore((s) => s.publicUserId)
  const persistedThreadId = toPersistedAiThreadId(threadId)
  const isEnabled = publicUserId != null && !!persistedThreadId
  useEffect(() => {
    logAiChatDebug("query.ai-messages.state", {
      threadId: threadId ?? null,
      pageSize,
      publicUserId,
      enabled: isEnabled,
      queryKey: ['ai-messages', threadId ?? null, pageSize, publicUserId ?? null],
    })
  }, [threadId, pageSize, publicUserId, isEnabled])

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['ai-messages', threadId, pageSize, publicUserId],
    enabled: isEnabled,
    queryFn: async () => {
      if (!persistedThreadId) return [] as AiMessage[]
      const { data, error } = await supabase
        .from('v_ai_messages_enriched')
        .select('*')
        .eq('thread_id', persistedThreadId)
        .order('created_at', { ascending: true })
        .limit(pageSize)
      if (error) throw error
      logAiChatDebug("query.ai-messages.success", {
        threadId: persistedThreadId,
        pageSize,
        rows: (data ?? []).length,
      })
      return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        ...(row as unknown as AiMessage),
        attachments: normalizeMessageAttachments((row as { attachments?: unknown }).attachments),
      }))
    },
  })

  // Realtime for ai_messages
  useEffect(() => {
    if (!persistedThreadId) return
    const channel = supabase
      .channel('ai-messages-' + persistedThreadId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ai_messages', filter: `thread_id=eq.${persistedThreadId}` }, () => {
        logAiChatDebug("query.invalidate.ai-messages", { threadId: persistedThreadId, pageSize, source: "realtime" })
        queryClient.invalidateQueries({ queryKey: ['ai-messages', persistedThreadId, pageSize, publicUserId] })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [supabase, queryClient, persistedThreadId, pageSize, publicUserId])

  return { messages: data ?? [], isLoading, isError, refetch }
}

export function useCreateThread() {
  const supabase = getSupabaseBrowser()
  return useCallback(async (payload: Partial<AiThread>) => {
    const { id: _ignoredId, ...payloadWithoutId } = payload
    // Apply sensible defaults per scope to satisfy RLS and UX
    const scope = payloadWithoutId.scope ?? 'global'
    const withDefaults: Partial<AiThread> = {
      ...payloadWithoutId,
      visibility: payloadWithoutId.visibility ?? (scope === 'task' ? 'private' : scope === 'project' ? 'project' : 'private'),
      is_collaborative: payloadWithoutId.is_collaborative ?? (scope === 'global' ? false : true),
      title: payloadWithoutId.title ?? null,
    }

    const { data, error } = await supabase
      .from('ai_threads')
      .insert(withDefaults)
      .select('*')
      .single()
    if (error) throw error
    return data as AiThread
  }, [supabase])
}

export function useRenameThread() {
  const supabase = getSupabaseBrowser()
  return useCallback(async (threadId: string, title: string) => {
    const persistedThreadId = toPersistedAiThreadId(threadId)
    if (!persistedThreadId) {
      throw new Error("Cannot rename thread before persistence completes")
    }
    const { data, error } = await supabase
      .from('ai_threads')
      .update({ title })
      .eq('id', persistedThreadId)
      .select('*')
      .single()
    if (error) throw error
    return data as AiThread
  }, [supabase])
}

export function useSoftDeleteThread() {
  const supabase = getSupabaseBrowser()
  return useCallback(async (threadId: string) => {
    const persistedThreadId = toPersistedAiThreadId(threadId)
    if (!persistedThreadId) {
      throw new Error("Cannot delete thread before persistence completes")
    }
    const { data, error } = await supabase
      .from('ai_threads')
      .update({ is_deleted: true })
      .eq('id', persistedThreadId)
      .select('id')
      .single()
    if (error) throw error
    return data
  }, [supabase])
}

export function useUpdateVisibility() {
  const supabase = getSupabaseBrowser()
  return useCallback(async (threadId: string, visibility: AiVisibility, isCollaborative: boolean) => {
    const persistedThreadId = toPersistedAiThreadId(threadId)
    if (!persistedThreadId) {
      throw new Error("Cannot update thread visibility before persistence completes")
    }
    const { data, error } = await supabase
      .from('ai_threads')
      .update({ visibility, is_collaborative: isCollaborative })
      .eq('id', persistedThreadId)
      .select('*')
      .single()
    if (error) throw error
    return data as AiThread
  }, [supabase])
}

export function useSearchMessages() {
  const supabase = getSupabaseBrowser()
  return useCallback(async (q: string) => {
    const { data, error } = await supabase
      .from('v_ai_messages_visible')
      .select('*')
      .textSearch('search_vector', q, { type: 'plain' })
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) throw error
    return data as AiMessage[]
  }, [supabase])
}


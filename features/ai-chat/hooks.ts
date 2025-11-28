"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { getSupabaseBrowser } from "../../lib/supabase-browser"
import type { AiMessage, AiThread, AiThreadContextLive, AiVisibility } from "./types"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useCurrentUserStore } from "../../app/store/current-user"

// Helpers
const THREADS_PAGE_SIZE = 50
const MESSAGES_PAGE_SIZE_DEFAULT = 200

export function useThreads() {
  const supabase = getSupabaseBrowser()
  const queryClient = useQueryClient()

  const fetchThreads = useCallback(async ({ pageParam = 0 }) => {
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
    queryKey: ['ai-threads'],
    queryFn: () => fetchThreads({ pageParam: 0 }),
  })

  // Realtime subscription to ai_threads (INSERT/UPDATE/DELETE)
  useEffect(() => {
    const channel = supabase
      .channel('ai-threads')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ai_threads' }, () => {
        queryClient.invalidateQueries({ queryKey: ['ai-threads'] })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
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
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['ai-thread-context', threadId],
    enabled: !!threadId,
    queryFn: async () => {
      if (!threadId) return null
      const { data, error } = await supabase
        .from('v_ai_thread_context_live')
        .select('*')
        .eq('thread_id', threadId)
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

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['ai-messages', threadId, pageSize],
    enabled: !!threadId,
    queryFn: async () => {
      if (!threadId) return [] as AiMessage[]
      const { data, error } = await supabase
        .from('v_ai_messages_enriched')
        .select('*')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true })
        .limit(pageSize)
      if (error) throw error
      return (data ?? []) as AiMessage[]
    },
  })

  // Realtime for ai_messages
  useEffect(() => {
    if (!threadId) return
    const channel = supabase
      .channel('ai-messages-' + threadId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ai_messages', filter: `thread_id=eq.${threadId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['ai-messages', threadId, pageSize] })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [supabase, queryClient, threadId, pageSize])

  return { messages: data ?? [], isLoading, isError, refetch }
}

export function useCreateThread() {
  const supabase = getSupabaseBrowser()
  return useCallback(async (payload: Partial<AiThread>) => {
    // Apply sensible defaults per scope to satisfy RLS and UX
    const scope = payload.scope ?? 'global'
    const withDefaults: Partial<AiThread> = {
      ...payload,
      visibility: payload.visibility ?? (scope === 'task' ? 'private' : scope === 'project' ? 'project' : 'private'),
      is_collaborative: payload.is_collaborative ?? (scope === 'global' ? false : true),
      title: payload.title ?? (scope === 'global' ? 'New chat' : scope === 'project' ? 'Project chat' : 'Task chat'),
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
    const { data, error } = await supabase
      .from('ai_threads')
      .update({ title })
      .eq('id', threadId)
      .select('*')
      .single()
    if (error) throw error
    return data as AiThread
  }, [supabase])
}

export function useSoftDeleteThread() {
  const supabase = getSupabaseBrowser()
  return useCallback(async (threadId: string) => {
    const { data, error } = await supabase
      .from('ai_threads')
      .update({ is_deleted: true })
      .eq('id', threadId)
      .select('id')
      .single()
    if (error) throw error
    return data
  }, [supabase])
}

export function useUpdateVisibility() {
  const supabase = getSupabaseBrowser()
  return useCallback(async (threadId: string, visibility: AiVisibility, isCollaborative: boolean) => {
    const { data, error } = await supabase
      .from('ai_threads')
      .update({ visibility, is_collaborative: isCollaborative })
      .eq('id', threadId)
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

/**
 * Hook for building AI content for components
 * Uses the new ai-chat Edge Function contract with modes
 */
export function useAiBuildContent() {
  const supabase = getSupabaseBrowser()
  const queryClient = useQueryClient()
  
  return useCallback(async ({
    taskId,
    channelId,
    taskChannelComponentId,
    isFullBriefing = false,
  }: {
    taskId: number
    channelId: number
    taskChannelComponentId?: string | null  // task_channel_components.id
    isFullBriefing?: boolean
  }) => {
    const { ensureAiThread } = await import('./ai-utils')
    const { callAiChat } = await import('../../app/lib/ai/chat')
    
    // Ensure we have a thread for this task
    const threadId = await ensureAiThread({ taskId, channelId })
    
    // Call AI with appropriate mode
    // Message is null - let the Edge Function build the instruction
    const response = await callAiChat({
      supabase: supabase as any,
      threadId,
      message: null,  // Let server build the instruction (null, not empty string)
      activeChannelId: channelId,
      mode: isFullBriefing ? "build_briefing" : "build_component",
      componentId: isFullBriefing ? null : taskChannelComponentId,
      autoRun: false,  // Manual usage - no DB writes from server
    })
    
    // Invalidate relevant queries
    queryClient.invalidateQueries({ queryKey: ['ai-messages', threadId] })
    queryClient.invalidateQueries({ queryKey: ['ai-threads'] })
    
    return {
      threadId,
      response: response.message,
    }
  }, [supabase, queryClient])
}



"use client"

import { create } from "zustand"
import {
  normalizeComponentLibraryTrace,
  normalizeComponentPlanTrace,
  type ComponentLibraryTrace,
  type ComponentPlanTrace,
} from "../../features/ai-chat/component-plan-trace"

/**
 * Stores AI component-planning trace cards ("Component sources checked" / "Structure decision")
 * scoped by thread + assistant message. While a response is in flight, traces live in a provisional
 * bucket keyed by the streaming temp assistant id; once the real assistant message id arrives, the
 * bucket is migrated — mirroring how component preview cards are handled.
 */
export type ComponentTraceBucket = {
  threadId: string | null
  assistantMessageId: string
  taskId: number | null
  channelId: number | null
  libraryTrace: ComponentLibraryTrace | null
  planTrace: ComponentPlanTrace | null
  updatedAt: string
}

type ComponentPlanTraceState = {
  buckets: Record<string, ComponentTraceBucket>
  upsertLibraryTrace: (args: {
    threadId?: string | null
    assistantMessageId: string
    payload: unknown
  }) => void
  upsertPlanTrace: (args: {
    threadId?: string | null
    assistantMessageId: string
    payload: unknown
  }) => void
  /** Store already-normalized traces (used for hydrating persisted assistant messages). */
  setTracesForMessage: (args: {
    threadId?: string | null
    assistantMessageId: string
    libraryTrace?: ComponentLibraryTrace | null
    planTrace?: ComponentPlanTrace | null
  }) => void
  /** Migrate a provisional streaming bucket to the persisted assistant message id. */
  aliasAssistantMessageId: (fromMessageId: string, toMessageId: string) => void
  getBucket: (assistantMessageId: string) => ComponentTraceBucket | null
  clearBucketsExceptThread: (threadId: string | null) => void
}

function emptyBucket(assistantMessageId: string, threadId: string | null): ComponentTraceBucket {
  return {
    threadId: threadId ?? null,
    assistantMessageId,
    taskId: null,
    channelId: null,
    libraryTrace: null,
    planTrace: null,
    updatedAt: new Date().toISOString(),
  }
}

export const useComponentPlanTraceStore = create<ComponentPlanTraceState>((set, get) => ({
  buckets: {},

  upsertLibraryTrace: (args) => {
    const libraryTrace = normalizeComponentLibraryTrace(args.payload)
    if (!libraryTrace) return
    set((state) => {
      const prev = state.buckets[args.assistantMessageId] ?? emptyBucket(args.assistantMessageId, args.threadId ?? null)
      return {
        buckets: {
          ...state.buckets,
          [args.assistantMessageId]: {
            ...prev,
            threadId: args.threadId ?? prev.threadId,
            taskId: libraryTrace.taskId ?? prev.taskId,
            channelId: libraryTrace.channelId ?? prev.channelId,
            libraryTrace,
            updatedAt: new Date().toISOString(),
          },
        },
      }
    })
  },

  upsertPlanTrace: (args) => {
    const planTrace = normalizeComponentPlanTrace(args.payload)
    if (!planTrace) return
    set((state) => {
      const prev = state.buckets[args.assistantMessageId] ?? emptyBucket(args.assistantMessageId, args.threadId ?? null)
      return {
        buckets: {
          ...state.buckets,
          [args.assistantMessageId]: {
            ...prev,
            threadId: args.threadId ?? prev.threadId,
            taskId: planTrace.taskId ?? prev.taskId,
            channelId: planTrace.channelId ?? prev.channelId,
            planTrace,
            updatedAt: new Date().toISOString(),
          },
        },
      }
    })
  },

  setTracesForMessage: (args) => {
    if (!args.libraryTrace && !args.planTrace) return
    set((state) => {
      const prev = state.buckets[args.assistantMessageId] ?? emptyBucket(args.assistantMessageId, args.threadId ?? null)
      // Never overwrite a live streamed trace with an (equivalent) persisted one.
      const libraryTrace = prev.libraryTrace ?? args.libraryTrace ?? null
      const planTrace = prev.planTrace ?? args.planTrace ?? null
      if (libraryTrace === prev.libraryTrace && planTrace === prev.planTrace) return state
      return {
        buckets: {
          ...state.buckets,
          [args.assistantMessageId]: {
            ...prev,
            threadId: args.threadId ?? prev.threadId,
            taskId: libraryTrace?.taskId ?? planTrace?.taskId ?? prev.taskId,
            channelId: libraryTrace?.channelId ?? planTrace?.channelId ?? prev.channelId,
            libraryTrace,
            planTrace,
          },
        },
      }
    })
  },

  aliasAssistantMessageId: (fromMessageId, toMessageId) => {
    if (!fromMessageId || !toMessageId || fromMessageId === toMessageId) return
    set((state) => {
      const source = state.buckets[fromMessageId]
      if (!source) return state
      const existing = state.buckets[toMessageId]
      const merged: ComponentTraceBucket = {
        ...source,
        ...(existing ?? {}),
        assistantMessageId: toMessageId,
        threadId: existing?.threadId ?? source.threadId,
        taskId: existing?.taskId ?? source.taskId,
        channelId: existing?.channelId ?? source.channelId,
        libraryTrace: existing?.libraryTrace ?? source.libraryTrace,
        planTrace: existing?.planTrace ?? source.planTrace,
        updatedAt: new Date().toISOString(),
      }
      const nextBuckets = { ...state.buckets, [toMessageId]: merged }
      delete nextBuckets[fromMessageId]
      return { buckets: nextBuckets }
    })
  },

  getBucket: (assistantMessageId) => get().buckets[assistantMessageId] ?? null,

  clearBucketsExceptThread: (threadId) => {
    set((state) => {
      if (!threadId) return { buckets: {} }
      const next: Record<string, ComponentTraceBucket> = {}
      for (const [key, bucket] of Object.entries(state.buckets)) {
        // Keep provisional (thread-less) streaming buckets and buckets on this thread.
        if (bucket.threadId == null || bucket.threadId === threadId) next[key] = bucket
      }
      return { buckets: next }
    })
  },
}))

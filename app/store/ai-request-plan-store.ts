"use client"

import { create } from "zustand"
import {
  mergeRequestPlan,
  normalizeRequestPlan,
  normalizeRequestPlanStreamEvent,
  type AiRequestPlan,
} from "../../features/ai-chat/request-plan"

/**
 * Stores Request Plan V3 cards scoped by assistant message id.
 * While streaming, plans live under the temp assistant id; on reconcile they are aliased
 * to the persisted message id (same pattern as component plan traces).
 */
export type AiRequestPlanBucket = {
  threadId: string | null
  assistantMessageId: string
  plan: AiRequestPlan
  updatedAt: string
}

type AiRequestPlanState = {
  buckets: Record<string, AiRequestPlanBucket>
  upsertFromStreamEvent: (args: {
    threadId?: string | null
    assistantMessageId: string
    payload: unknown
  }) => void
  /** Hydrate from persisted `content_json.request_plan` without clobbering a live stream. */
  setPlanForMessage: (args: {
    threadId?: string | null
    assistantMessageId: string
    plan: AiRequestPlan | null
  }) => void
  aliasAssistantMessageId: (fromMessageId: string, toMessageId: string) => void
  getBucket: (assistantMessageId: string) => AiRequestPlanBucket | null
  clearBucketsExceptThread: (threadId: string | null) => void
}

export const useAiRequestPlanStore = create<AiRequestPlanState>((set, get) => ({
  buckets: {},

  upsertFromStreamEvent: (args) => {
    const event = normalizeRequestPlanStreamEvent(args.payload)
    const plan = event?.plan ?? normalizeRequestPlan(args.payload)
    if (!plan) return
    set((state) => {
      const prev = state.buckets[args.assistantMessageId]
      const merged = mergeRequestPlan(prev?.plan ?? null, plan)
      return {
        buckets: {
          ...state.buckets,
          [args.assistantMessageId]: {
            threadId: args.threadId ?? prev?.threadId ?? null,
            assistantMessageId: args.assistantMessageId,
            plan: merged,
            updatedAt: new Date().toISOString(),
          },
        },
      }
    })
  },

  setPlanForMessage: (args) => {
    const plan = args.plan
    if (!plan) return
    set((state) => {
      const prev = state.buckets[args.assistantMessageId]
      // Never overwrite a live streamed plan with an equivalent persisted snapshot.
      if (prev?.plan) return state
      return {
        buckets: {
          ...state.buckets,
          [args.assistantMessageId]: {
            threadId: args.threadId ?? prev?.threadId ?? null,
            assistantMessageId: args.assistantMessageId,
            plan,
            updatedAt: new Date().toISOString(),
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
      const mergedPlan = mergeRequestPlan(existing?.plan ?? null, source.plan)
      const nextBuckets = { ...state.buckets }
      delete nextBuckets[fromMessageId]
      nextBuckets[toMessageId] = {
        threadId: existing?.threadId ?? source.threadId,
        assistantMessageId: toMessageId,
        plan: mergedPlan,
        updatedAt: new Date().toISOString(),
      }
      return { buckets: nextBuckets }
    })
  },

  getBucket: (assistantMessageId) => get().buckets[assistantMessageId] ?? null,

  clearBucketsExceptThread: (threadId) => {
    set((state) => {
      if (!threadId) return { buckets: {} }
      const next: Record<string, AiRequestPlanBucket> = {}
      for (const [key, bucket] of Object.entries(state.buckets)) {
        if (bucket.threadId == null || bucket.threadId === threadId) next[key] = bucket
      }
      return { buckets: next }
    })
  },
}))

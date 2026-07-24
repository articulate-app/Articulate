"use client"

import { create } from "zustand"
import {
  executionTraceEventToStep,
  findStepIdForIncomingPreview,
  mapBuildEventToExecutionTraceSteps,
  mergeExecutionTraceStep,
  normalizeExecutionTraceEvent,
  orderExecutionTraceSteps,
  type AiExecutionTraceStep,
} from "../../features/ai-chat/execution-trace"
import type { AiOrchestratedBuildEvent } from "../lib/ai/ai-orchestrated-build-types"

export type AiExecutionTraceBucket = {
  threadId: string | null
  assistantMessageId: string
  stepsById: Record<string, AiExecutionTraceStep>
  /** Tracks which build event sequences were already applied. */
  appliedBuildEventKeys: Record<string, true>
  updatedAt: string
}

type AiExecutionTraceState = {
  buckets: Record<string, AiExecutionTraceBucket>
  upsertFromStreamEvent: (args: {
    threadId?: string | null
    assistantMessageId: string
    payload: unknown
  }) => void
  upsertBuildEvents: (args: {
    threadId?: string | null
    assistantMessageId: string
    buildId: string
    events: AiOrchestratedBuildEvent[]
  }) => void
  attachPreviewToActiveStep: (args: {
    assistantMessageId: string
    previewKey?: string | null
    editStreamKey?: string | null
    stepId?: string | null
  }) => void
  aliasAssistantMessageId: (fromMessageId: string, toMessageId: string) => void
  getOrderedSteps: (assistantMessageId: string) => AiExecutionTraceStep[]
  hasSteps: (assistantMessageId: string) => boolean
  clearBucketsExceptThread: (threadId: string | null) => void
}

function emptyBucket(args: {
  threadId?: string | null
  assistantMessageId: string
}): AiExecutionTraceBucket {
  return {
    threadId: args.threadId ?? null,
    assistantMessageId: args.assistantMessageId,
    stepsById: {},
    appliedBuildEventKeys: {},
    updatedAt: new Date().toISOString(),
  }
}

function mergeBuckets(
  target: AiExecutionTraceBucket,
  source: AiExecutionTraceBucket,
): AiExecutionTraceBucket {
  const stepsById = { ...target.stepsById }
  for (const [stepId, step] of Object.entries(source.stepsById)) {
    stepsById[stepId] = mergeExecutionTraceStep(stepsById[stepId] ?? null, step)
  }
  return {
    threadId: target.threadId ?? source.threadId,
    assistantMessageId: target.assistantMessageId,
    stepsById,
    appliedBuildEventKeys: {
      ...source.appliedBuildEventKeys,
      ...target.appliedBuildEventKeys,
    },
    updatedAt: new Date().toISOString(),
  }
}

export const useAiExecutionTraceStore = create<AiExecutionTraceState>((set, get) => ({
  buckets: {},

  upsertFromStreamEvent: (args) => {
    const event = normalizeExecutionTraceEvent(args.payload)
    if (!event) return
    const step = executionTraceEventToStep(event, "stream")
    set((state) => {
      const prev = state.buckets[args.assistantMessageId] ?? emptyBucket(args)
      const merged = mergeExecutionTraceStep(prev.stepsById[step.stepId] ?? null, step)
      return {
        buckets: {
          ...state.buckets,
          [args.assistantMessageId]: {
            ...prev,
            threadId: args.threadId ?? prev.threadId,
            stepsById: {
              ...prev.stepsById,
              [step.stepId]: merged,
            },
            updatedAt: new Date().toISOString(),
          },
        },
      }
    })
  },

  upsertBuildEvents: (args) => {
    if (!args.events.length) return
    set((state) => {
      const prev = state.buckets[args.assistantMessageId] ?? emptyBucket(args)
      const stepsById = { ...prev.stepsById }
      const appliedBuildEventKeys = { ...prev.appliedBuildEventKeys }
      let changed = false

      for (const event of args.events) {
        // Deduplicate by build_id + sequence (one application per durable event).
        const key = `${args.buildId}:${event.sequence}`
        if (appliedBuildEventKeys[key]) continue
        const mapped = mapBuildEventToExecutionTraceSteps(event)
        if (mapped.length === 0) {
          appliedBuildEventKeys[key] = true
          continue
        }
        for (const step of mapped) {
          stepsById[step.stepId] = mergeExecutionTraceStep(stepsById[step.stepId] ?? null, step)
        }
        appliedBuildEventKeys[key] = true
        changed = true
      }

      if (!changed) return state
      return {
        buckets: {
          ...state.buckets,
          [args.assistantMessageId]: {
            ...prev,
            threadId: args.threadId ?? prev.threadId,
            stepsById,
            appliedBuildEventKeys,
            updatedAt: new Date().toISOString(),
          },
        },
      }
    })
  },

  attachPreviewToActiveStep: (args) => {
    const previewKey = args.previewKey?.trim() || null
    const editStreamKey = args.editStreamKey?.trim() || null
    if (!previewKey && !editStreamKey) return

    set((state) => {
      const prev = state.buckets[args.assistantMessageId]
      if (!prev) return state
      const ordered = orderExecutionTraceSteps(prev.stepsById)
      const stepId = args.stepId?.trim() || findStepIdForIncomingPreview(ordered)
      if (!stepId || !prev.stepsById[stepId]) return state
      const current = prev.stepsById[stepId]
      const next: AiExecutionTraceStep = {
        ...current,
        previewKeys: previewKey
          ? (current.previewKeys.includes(previewKey)
            ? current.previewKeys
            : [...current.previewKeys, previewKey])
          : current.previewKeys,
        editStreamKeys: editStreamKey
          ? (current.editStreamKeys.includes(editStreamKey)
            ? current.editStreamKeys
            : [...current.editStreamKeys, editStreamKey])
          : current.editStreamKeys,
      }
      return {
        buckets: {
          ...state.buckets,
          [args.assistantMessageId]: {
            ...prev,
            stepsById: {
              ...prev.stepsById,
              [stepId]: next,
            },
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
      const nextBuckets = { ...state.buckets }
      delete nextBuckets[fromMessageId]
      nextBuckets[toMessageId] = existing
        ? mergeBuckets({ ...existing, assistantMessageId: toMessageId }, source)
        : {
            ...source,
            assistantMessageId: toMessageId,
            updatedAt: new Date().toISOString(),
          }
      return { buckets: nextBuckets }
    })
  },

  getOrderedSteps: (assistantMessageId) => {
    const bucket = get().buckets[assistantMessageId]
    if (!bucket) return []
    return orderExecutionTraceSteps(bucket.stepsById)
  },

  hasSteps: (assistantMessageId) => {
    const bucket = get().buckets[assistantMessageId]
    return Boolean(bucket && Object.keys(bucket.stepsById).length > 0)
  },

  clearBucketsExceptThread: (threadId) => {
    set((state) => {
      if (!threadId) return { buckets: {} }
      const next: Record<string, AiExecutionTraceBucket> = {}
      for (const [key, bucket] of Object.entries(state.buckets)) {
        if (bucket.threadId == null || bucket.threadId === threadId) next[key] = bucket
      }
      return { buckets: next }
    })
  },
}))

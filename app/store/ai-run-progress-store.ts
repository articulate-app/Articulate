"use client"

import { create } from "zustand"
import type { AiChatRunTargetProgress, AiTargetKind } from "../lib/ai/ai-chat-v2-types"
import { buildRunTargetProgressKey } from "../../features/ai-chat/build-ai-run-targets"

type AiRunProgressStoreState = {
  entriesByKey: Record<string, AiChatRunTargetProgress>
  activeRunId: string | null
  upsertTargetProgress: (entry: Omit<AiChatRunTargetProgress, "updated_at">) => void
  hydrateFromReconciliation: (runId: string, targets: AiChatRunTargetProgress[]) => void
  clearRun: (runId: string) => void
  clearAll: () => void
  getEntriesForRun: (runId: string) => AiChatRunTargetProgress[]
  getActiveSummaryLine: (runId: string) => string | null
}

function normalizeProgressStatus(
  status: string | null | undefined,
): AiChatRunTargetProgress["status"] {
  const value = (status ?? "").trim().toLowerCase()
  if (value === "active" || value === "running" || value === "in_progress") return "active"
  if (value === "completed" || value === "done" || value === "saved") return "completed"
  if (value === "failed" || value === "error") return "failed"
  if (value === "waiting_confirmation" || value === "ambiguous") return "waiting_confirmation"
  return "pending"
}

export const useAiRunProgressStore = create<AiRunProgressStoreState>((set, get) => ({
  entriesByKey: {},
  activeRunId: null,

  upsertTargetProgress: (entry) => {
    const key = entry.key
    set((state) => ({
      activeRunId: entry.run_id,
      entriesByKey: {
        ...state.entriesByKey,
        [key]: {
          ...entry,
          status: normalizeProgressStatus(entry.status),
          updated_at: new Date().toISOString(),
        },
      },
    }))
  },

  hydrateFromReconciliation: (runId, targets) => {
    set((state) => {
      const next = { ...state.entriesByKey }
      for (const [existingKey, existing] of Object.entries(next)) {
        if (existing.run_id === runId) delete next[existingKey]
      }
      for (const target of targets) {
        next[target.key] = target
      }
      return { entriesByKey: next, activeRunId: runId }
    })
  },

  clearRun: (runId) => {
    set((state) => {
      const next = { ...state.entriesByKey }
      for (const [key, entry] of Object.entries(next)) {
        if (entry.run_id === runId) delete next[key]
      }
      return {
        entriesByKey: next,
        activeRunId: state.activeRunId === runId ? null : state.activeRunId,
      }
    })
  },

  clearAll: () => set({ entriesByKey: {}, activeRunId: null }),

  getEntriesForRun: (runId) =>
    Object.values(get().entriesByKey)
      .filter((entry) => entry.run_id === runId)
      .sort((a, b) => a.updated_at.localeCompare(b.updated_at)),

  getActiveSummaryLine: (runId) => {
    const entries = get().getEntriesForRun(runId)
    if (entries.length === 0) return null
    const active = [...entries].reverse().find((entry) => entry.status === "active")
    if (active?.detail) return active.detail
    if (active?.label) {
      const verb =
        active.status === "waiting_confirmation"
          ? "Waiting for target confirmation"
          : active.target_kind === "component" || active.target_kind === "output"
            ? "Updating"
            : "Reading"
      return `${verb} ${active.label}…`
    }
    const completed = entries.filter((entry) => entry.status === "completed").length
    if (completed > 0 && completed < entries.length) {
      return `Saved ${completed} of ${entries.length} targets.`
    }
    return entries[entries.length - 1]?.detail ?? null
  },
}))

export function targetProgressFromV2Event(event: {
  run_id: string
  target_kind?: AiTargetKind | null
  label?: string | null
  status?: string | null
  detail?: string | null
  project_id?: number | null
  task_id?: number | null
  channel_id?: number | null
  component_id?: string | null
  output_id?: string | null
  tool_call_id?: string | null
  group_id?: string | null
}): AiChatRunTargetProgress {
  const key = buildRunTargetProgressKey(event)
  return {
    key,
    run_id: event.run_id,
    target_kind: event.target_kind ?? "task",
    label: event.label ?? null,
    status: normalizeProgressStatus(event.status ?? event.detail ? "active" : "pending"),
    detail: event.detail ?? null,
    project_id: event.project_id ?? null,
    task_id: event.task_id ?? null,
    channel_id: event.channel_id ?? null,
    component_id: event.component_id ?? null,
    output_id: event.output_id ?? null,
    updated_at: new Date().toISOString(),
  }
}

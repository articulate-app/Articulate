"use client"

import { create } from "zustand"

export type AiBuildComponentPreviewPhase = "preview" | "saved" | "failed"

export type AiBuildComponentPreviewEntry = {
  /** `${buildId}:${unitId}:${componentId}` */
  key: string
  buildId: string
  unitId: string
  componentId: string
  taskId: number | null
  channelId: number | null
  title: string | null
  position: number | null
  contentText: string
  contentJson: unknown
  phase: AiBuildComponentPreviewPhase
  sequence: number
  threadId: string | null
  assistantMessageIds: Record<string, true>
  updatedAt: string
}

type AiBuildComponentPreviewState = {
  previews: Record<string, AiBuildComponentPreviewEntry>
  upsertPreview: (args: {
    buildId: string
    unitId: string
    componentId: string
    sequence: number
    taskId?: number | null
    channelId?: number | null
    title?: string | null
    position?: number | null
    contentText?: string | null
    contentJson?: unknown
    threadId?: string | null
    assistantMessageId?: string | null
  }) => string
  markSaved: (args: {
    buildId: string
    unitId?: string | null
    componentId: string
    sequence: number
    title?: string | null
    contentText?: string | null
    contentJson?: unknown
  }) => void
  clearForBuild: (buildId: string) => void
  clearExceptThread: (threadId: string | null) => void
  getPreview: (key: string) => AiBuildComponentPreviewEntry | null
  listForAssistantMessage: (assistantMessageId: string) => AiBuildComponentPreviewEntry[]
  listLiveForTaskChannel: (taskId: number, channelId: number) => AiBuildComponentPreviewEntry[]
}

export function buildComponentPreviewKey(
  buildId: string,
  unitId: string,
  componentId: string,
): string {
  return `${buildId.trim()}:${unitId.trim() || "unit"}:${componentId.trim()}`
}

function toTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

export const useAiBuildComponentPreviewStore = create<AiBuildComponentPreviewState>((set, get) => ({
  previews: {},

  upsertPreview: ({
    buildId,
    unitId,
    componentId,
    sequence,
    taskId,
    channelId,
    title,
    position,
    contentText,
    contentJson,
    threadId,
    assistantMessageId,
  }) => {
    const key = buildComponentPreviewKey(buildId, unitId, componentId)
    if (!componentId.trim()) return key
    set((state) => {
      const prev = state.previews[key] ?? null
      // Sequence is the final tie-breaker — ignore older/out-of-order events.
      if (prev && sequence < prev.sequence) return state
      const next: AiBuildComponentPreviewEntry = {
        key,
        buildId: buildId.trim(),
        unitId: unitId.trim() || "unit",
        componentId: componentId.trim(),
        taskId: taskId ?? prev?.taskId ?? null,
        channelId: channelId ?? prev?.channelId ?? null,
        title: title?.trim() || prev?.title || null,
        position: position ?? prev?.position ?? null,
        contentText: contentText?.trim() || prev?.contentText || "",
        contentJson: contentJson ?? prev?.contentJson ?? null,
        phase: "preview",
        sequence,
        threadId: threadId ?? prev?.threadId ?? null,
        assistantMessageIds: { ...(prev?.assistantMessageIds ?? {}) },
        updatedAt: new Date().toISOString(),
      }
      if (assistantMessageId) next.assistantMessageIds[assistantMessageId] = true
      return { previews: { ...state.previews, [key]: next } }
    })
    return key
  },

  markSaved: ({ buildId, unitId, componentId, sequence, title, contentText, contentJson }) => {
    const id = componentId.trim()
    if (!id) return
    set((state) => {
      const matches = Object.values(state.previews).filter((row) => {
        if (row.buildId !== buildId.trim()) return false
        if (row.componentId !== id) return false
        if (unitId?.trim() && row.unitId !== unitId.trim()) return false
        return true
      })
      if (matches.length === 0) {
        // No live preview — nothing to replace in place.
        return state
      }
      const next = { ...state.previews }
      for (const match of matches) {
        if (sequence < match.sequence) continue
        next[match.key] = {
          ...match,
          phase: "saved",
          sequence,
          title: title?.trim() || match.title,
          contentText: contentText?.trim() || match.contentText,
          contentJson: contentJson ?? match.contentJson,
          updatedAt: new Date().toISOString(),
        }
      }
      return { previews: next }
    })
  },

  clearForBuild: (buildId) => {
    const id = buildId.trim()
    if (!id) return
    set((state) => {
      const next: Record<string, AiBuildComponentPreviewEntry> = {}
      for (const [key, entry] of Object.entries(state.previews)) {
        if (entry.buildId !== id) next[key] = entry
      }
      return { previews: next }
    })
  },

  clearExceptThread: (threadId) => {
    set((state) => {
      if (!threadId) return { previews: {} }
      const next: Record<string, AiBuildComponentPreviewEntry> = {}
      for (const [key, entry] of Object.entries(state.previews)) {
        if (entry.threadId === threadId) next[key] = entry
      }
      return { previews: next }
    })
  },

  getPreview: (key) => get().previews[key] ?? null,

  listForAssistantMessage: (assistantMessageId) =>
    Object.values(get().previews)
      .filter((row) => row.assistantMessageIds[assistantMessageId])
      .sort((a, b) => a.sequence - b.sequence || (a.position ?? 0) - (b.position ?? 0)),

  listLiveForTaskChannel: (taskId, channelId) =>
    Object.values(get().previews).filter(
      (row) =>
        row.phase === "preview"
        && row.taskId === taskId
        && row.channelId === channelId
        && row.contentText.trim().length > 0,
    ),
}))

/** Parse a durable `work_unit.preview` / `component.saved` payload into preview fields. */
export function parseBuildComponentPreviewPayload(payload: Record<string, unknown> | null | undefined): {
  componentId: string | null
  taskId: number | null
  channelId: number | null
  title: string | null
  position: number | null
  contentText: string | null
  contentJson: unknown
} {
  const record = payload ?? {}
  return {
    componentId:
      toTrimmedString(record.component_id)
      ?? toTrimmedString(record.componentId)
      ?? toTrimmedString(record.task_component_id),
    taskId: toFiniteNumber(record.task_id) ?? toFiniteNumber(record.taskId),
    channelId: toFiniteNumber(record.channel_id) ?? toFiniteNumber(record.channelId),
    title:
      toTrimmedString(record.title)
      ?? toTrimmedString(record.component_title)
      ?? toTrimmedString(record.name),
    position: toFiniteNumber(record.position),
    contentText:
      toTrimmedString(record.content_text)
      ?? toTrimmedString(record.contentText)
      ?? toTrimmedString(record.snippet),
    contentJson: record.content_json ?? record.contentJson ?? null,
  }
}

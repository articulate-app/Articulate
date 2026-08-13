"use client"

import { create } from "zustand"
import { resolvePreviewRegistryKey } from "../../features/ai-chat/ai-preview-registry"

/** Write-action preview phases. Terminal phases (saved/failed) keep the card visible. */
export type AiChangePreviewPhase = "started" | "delta" | "completed" | "saved" | "failed"

export type AiChangePreviewChange = {
  field: string
  label?: string | null
  before?: unknown
  after?: unknown
}

/**
 * Human-readable, grouped summary of a structure/change (preferred over raw `changes`).
 * e.g. `{ label: "Updated sections", count: 1, values: ["Pros of rubber"] }`.
 */
export type AiChangePreviewItem = {
  label: string
  count?: number | null
  values?: string[] | null
}

/**
 * Compact write-action preview emitted by ai-chat via `__AI_CHANGE_PREVIEW__`.
 * Separate from the long component body preview (`__AI_COMPONENT_EDIT_PREVIEW__`).
 */
export type AiChangePreview = {
  type: "ai_change_preview"
  phase: AiChangePreviewPhase
  ok?: boolean | null
  change_id: string
  /** Backend-supplied stable card key (preferred fallback when `change_id` is absent). */
  preview_key?: string | null
  /** Related structure/change cards sharing this id collapse into one compact group. */
  group_id?: string | null
  tool_name?: string | null
  round?: number | null
  entity_type: string
  entity_id?: string | number | null
  task_id?: number | null
  channel_id?: number | null
  project_id?: number | null
  component_id?: string | null
  task_component_output_id?: string | null
  operation?: string | null
  title?: string | null
  summary?: string | null
  reason?: string | null
  error?: string | null
  /** Orchestrated build: distinct task count (not channel count). */
  task_count?: number | null
  /** Orchestrated build: distinct channel count across tasks. */
  channel_count?: number | null
  task_ids?: number[] | null
  /**
   * Skipped preflight (`ai_start_orchestrated_build` with requires_clarification /
   * no_build_created). Card shows "Waiting for input" — never Queued/running build.
   */
  requires_clarification?: boolean | null
  no_build_created?: boolean | null
  clarification_reason?: string | null
  /** Preferred display payload — clean, grouped summary rows. */
  preview_items?: AiChangePreviewItem[]
  /** Raw technical field changes; shown only behind a "Technical details" disclosure. */
  changes?: AiChangePreviewChange[]
}

export type AiChangePreviewEntry = AiChangePreview & {
  /** Stable card identity: `change_id`, or a derived fallback key. */
  key: string
  threadId: string | null
  updatedAt: string
  /** Assistant message ids (temp + persisted) this card renders under. */
  assistantMessageIds: Record<string, true>
}

/** Fallback identity when the backend omits both `change_id` and `preview_key`. */
export function aiChangePreviewFallbackKey(
  preview: Pick<AiChangePreview, "entity_type" | "entity_id" | "tool_name">,
): string {
  return `${preview.tool_name ?? "?"}:${preview.entity_type}:${preview.entity_id ?? "?"}`
}

/** Card identity: `group_id` → `preview_key` → `change_id` → derived fallback. */
export function resolveAiChangePreviewKey(
  preview: Pick<
    AiChangePreview,
    "change_id" | "preview_key" | "group_id" | "entity_type" | "entity_id" | "tool_name"
  >,
): string {
  return resolvePreviewRegistryKey({
    group_id: preview.group_id,
    preview_key: preview.preview_key,
    fallbackKey:
      (typeof preview.change_id === "string" && preview.change_id.trim().length > 0
        ? preview.change_id.trim()
        : null) ?? aiChangePreviewFallbackKey(preview),
  })
}

export function isTerminalAiChangePreviewPhase(phase: AiChangePreviewPhase): boolean {
  return phase === "saved" || phase === "failed"
}

export function isLiveAiChangePreviewPhase(phase: AiChangePreviewPhase): boolean {
  return phase === "started" || phase === "delta" || phase === "completed"
}

/**
 * Merge an incoming event onto the previous entry. The `saved`/`failed` events
 * are compact (usually only `phase`/`ok`/`summary`/`error`), so we preserve the
 * richer `changes`/`reason`/`title` captured on `started`.
 */
function mergePreview(
  prev: AiChangePreviewEntry | null,
  incoming: AiChangePreview,
  args: { key: string; threadId: string | null; assistantMessageId: string | null },
): AiChangePreviewEntry {
  const base: AiChangePreviewEntry = prev ?? {
    ...incoming,
    key: args.key,
    threadId: args.threadId,
    updatedAt: new Date().toISOString(),
    assistantMessageIds: {},
  }

  const next: AiChangePreviewEntry = {
    ...base,
    ...incoming,
    key: args.key,
    threadId: args.threadId ?? base.threadId,
    // Preserve descriptive fields when a terminal event omits them.
    preview_key: incoming.preview_key ?? base.preview_key ?? null,
    group_id: incoming.group_id ?? base.group_id ?? null,
    tool_name: incoming.tool_name ?? base.tool_name ?? null,
    round: incoming.round ?? base.round ?? null,
    entity_type: incoming.entity_type || base.entity_type,
    entity_id: incoming.entity_id ?? base.entity_id ?? null,
    task_id: incoming.task_id ?? base.task_id ?? null,
    channel_id: incoming.channel_id ?? base.channel_id ?? null,
    project_id: incoming.project_id ?? base.project_id ?? null,
    component_id: incoming.component_id ?? base.component_id ?? null,
    task_component_output_id:
      incoming.task_component_output_id ?? base.task_component_output_id ?? null,
    operation: incoming.operation ?? base.operation ?? null,
    title: incoming.title ?? base.title ?? null,
    summary: incoming.summary ?? base.summary ?? null,
    reason: incoming.reason ?? base.reason ?? null,
    error: incoming.error ?? (incoming.phase === "failed" ? base.error ?? null : null),
    task_count: incoming.task_count ?? base.task_count ?? null,
    channel_count: incoming.channel_count ?? base.channel_count ?? null,
    task_ids:
      incoming.task_ids && incoming.task_ids.length > 0
        ? incoming.task_ids
        : base.task_ids ?? null,
    requires_clarification:
      incoming.requires_clarification === true
        ? true
        : incoming.requires_clarification === false
          ? false
          : base.requires_clarification ?? null,
    no_build_created:
      incoming.no_build_created === true
        ? true
        : incoming.no_build_created === false
          ? false
          : base.no_build_created ?? null,
    clarification_reason:
      incoming.clarification_reason ?? base.clarification_reason ?? null,
    preview_items:
      incoming.preview_items && incoming.preview_items.length > 0
        ? incoming.preview_items
        : base.preview_items ?? undefined,
    changes:
      incoming.changes && incoming.changes.length > 0 ? incoming.changes : base.changes ?? undefined,
    ok: incoming.ok ?? (isTerminalAiChangePreviewPhase(incoming.phase) ? base.ok : null),
    updatedAt: new Date().toISOString(),
    assistantMessageIds: { ...base.assistantMessageIds },
  }

  if (args.assistantMessageId) {
    next.assistantMessageIds[args.assistantMessageId] = true
  }

  return next
}

type AiChangePreviewStreamState = {
  previews: Record<string, AiChangePreviewEntry>
  /** Create or update a card, attaching it to the given assistant message bucket. */
  upsertAiChangePreview: (args: {
    threadId?: string | null
    assistantMessageId?: string | null
    preview: AiChangePreview
  }) => string
  /** Hydrate a persisted card from assistant message `content_json.ai_change_previews`. */
  hydrateAiChangePreviewForMessage: (args: {
    threadId: string
    messageId: string
    preview: AiChangePreview
  }) => string
  /** Migrate previews from a temporary assistant id to the persisted message id. */
  aliasAssistantMessageId: (fromId: string, toId: string) => void
  /** Remove not-yet-terminal previews (used defensively; terminal cards stay visible). */
  clearInFlightAiChangePreviews: (threadId: string | null) => void
  /** Drop previews that belong to a different thread. */
  clearPreviewsExceptThread: (threadId: string | null) => void
  getPreview: (key: string) => AiChangePreviewEntry | null
}

export const useAiChangePreviewStreamStore = create<AiChangePreviewStreamState>((set, get) => ({
  previews: {},

  upsertAiChangePreview: ({ threadId, assistantMessageId, preview }) => {
    const key = resolveAiChangePreviewKey(preview)
    set((state) => {
      const prev = state.previews[key] ?? null
      const next = mergePreview(prev, { ...preview, change_id: key }, {
        key,
        threadId: threadId ?? null,
        assistantMessageId: assistantMessageId ?? null,
      })
      return { previews: { ...state.previews, [key]: next } }
    })
    return key
  },

  hydrateAiChangePreviewForMessage: ({ threadId, messageId, preview }) => {
    const key = resolveAiChangePreviewKey(preview)
    set((state) => {
      const prev = state.previews[key] ?? null
      // Do not clobber a live in-flight card that already points at this message.
      if (prev && isLiveAiChangePreviewPhase(prev.phase) && prev.assistantMessageIds[messageId]) {
        return state
      }
      // History hydrate is idempotent — avoid store churn (and React update loops)
      // when ChatWindow re-runs layout effects with the same persisted snapshot.
      if (
        prev
        && prev.assistantMessageIds[messageId]
        && prev.phase === preview.phase
        && prev.ok === (preview.ok ?? prev.ok)
        && (prev.summary ?? null) === (preview.summary ?? prev.summary ?? null)
        && (prev.title ?? null) === (preview.title ?? prev.title ?? null)
        && (prev.error ?? null) === (preview.error ?? prev.error ?? null)
      ) {
        return state
      }
      const next = mergePreview(prev, { ...preview, change_id: key }, {
        key,
        threadId,
        assistantMessageId: messageId,
      })
      return { previews: { ...state.previews, [key]: next } }
    })
    return key
  },

  aliasAssistantMessageId: (fromId, toId) => {
    if (!fromId || !toId || fromId === toId) return
    set((state) => {
      let changed = false
      const next = { ...state.previews }
      for (const [key, entry] of Object.entries(state.previews)) {
        if (!entry.assistantMessageIds[fromId]) continue
        next[key] = {
          ...entry,
          assistantMessageIds: { ...entry.assistantMessageIds, [toId]: true },
        }
        changed = true
      }
      return changed ? { previews: next } : state
    })
  },

  clearInFlightAiChangePreviews: (threadId) => {
    set((state) => {
      let changed = false
      const next: Record<string, AiChangePreviewEntry> = {}
      for (const [key, entry] of Object.entries(state.previews)) {
        const sameThread = threadId != null && entry.threadId === threadId
        if (sameThread && !isTerminalAiChangePreviewPhase(entry.phase)) {
          changed = true
          continue
        }
        next[key] = entry
      }
      return changed ? { previews: next } : state
    })
  },

  clearPreviewsExceptThread: (threadId) => {
    set((state) => {
      if (!threadId) return { previews: {} }
      const next: Record<string, AiChangePreviewEntry> = {}
      for (const [key, entry] of Object.entries(state.previews)) {
        if (entry.threadId === threadId) next[key] = entry
      }
      return { previews: next }
    })
  },

  getPreview: (key) => get().previews[key] ?? null,
}))

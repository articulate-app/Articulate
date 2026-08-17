"use client"

import { useCallback, useSyncExternalStore } from "react"
import { getSupabaseBrowser } from "../../lib/supabase-browser"
import { invokeEdgeFunctionFetch } from "../../app/lib/edge-functions"

/** Friendly model key sent to ai-chat. Normal UI values come from the authenticated model catalog. */
export type AiChatModelKey = string

export type AiChatModelTier = "economy" | "balanced" | "premium"

export type AiChatCatalogModel = {
  key: string
  label: string
  provider: string
  external_id: string | null
  tier: AiChatModelTier
  context_limit: number | null
  recommended: boolean
  selectable: boolean
  lab_only: boolean
  input_price_per_million: number | null
  output_price_per_million: number | null
}

export type AiChatAutoStrategy = {
  key: "balanced" | "quality" | "savings" | "speed" | string
  label: string
  description: string
}

export type AiChatModelCatalog = {
  default_key: string
  auto_strategies: AiChatAutoStrategy[]
  models: AiChatCatalogModel[]
}

export type AiChatModelOption = {
  key: AiChatModelKey
  label: string
}

/** Offline fallback. Only models executable by ai-chat belong here. */
export const AI_CHAT_MODEL_OPTIONS: AiChatModelOption[] = [
  { key: "auto", label: "Auto" },
  { key: "openai.gpt-5.5", label: "OpenAI GPT-5.5" },
  { key: "openai.gpt-5.4-mini", label: "OpenAI GPT-5.4 Mini" },
]

export const DEFAULT_AI_CHAT_MODEL_KEY: AiChatModelKey = "auto"

const STORAGE_KEY = "ai-chat-model-key-v3"
const SAFE_MODEL_KEY = /^(auto|[a-z0-9._:-]{2,220})$/i

function normalizeModelKey(value: string | null | undefined): AiChatModelKey {
  const trimmed = value?.trim() ?? ""
  if (trimmed && SAFE_MODEL_KEY.test(trimmed)) return trimmed
  return DEFAULT_AI_CHAT_MODEL_KEY
}

let currentModelKey: AiChatModelKey = DEFAULT_AI_CHAT_MODEL_KEY
let hasHydrated = false
const listeners = new Set<() => void>()
let catalogPromise: Promise<AiChatModelCatalog> | null = null

function hydrateOnce(): void {
  if (hasHydrated || typeof window === "undefined") return
  hasHydrated = true
  try {
    currentModelKey = normalizeModelKey(window.localStorage.getItem(STORAGE_KEY))
  } catch {
    currentModelKey = DEFAULT_AI_CHAT_MODEL_KEY
  }
}

export async function fetchAiChatModelCatalog(options?: { force?: boolean }): Promise<AiChatModelCatalog> {
  if (catalogPromise && !options?.force) return catalogPromise
  catalogPromise = (async () => {
    const supabase = getSupabaseBrowser()
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ai-model-catalog`
    const response = await invokeEdgeFunctionFetch({
      supabase,
      url,
      debugLabel: "ai-model-catalog",
      init: { method: "GET" },
      headers: { "Content-Type": "application/json" },
    })
    if (!response.ok) throw new Error((await response.text()) || "Failed to load AI model catalog")
    const payload = (await response.json()) as Partial<AiChatModelCatalog>
    return {
      default_key: typeof payload.default_key === "string" ? payload.default_key : "auto",
      auto_strategies: Array.isArray(payload.auto_strategies) ? payload.auto_strategies : [],
      models: Array.isArray(payload.models) ? payload.models : [],
    }
  })().catch((error) => {
    catalogPromise = null
    throw error
  })
  return catalogPromise
}

/** Non-hook read of the persisted selection (safe outside React, e.g. auto-run build calls). */
export function getAiChatModelKey(): AiChatModelKey {
  hydrateOnce()
  return currentModelKey
}

export function setAiChatModelKey(next: AiChatModelKey): void {
  const normalized = normalizeModelKey(next)
  hasHydrated = true
  if (normalized === currentModelKey) return
  currentModelKey = normalized
  try {
    window.localStorage.setItem(STORAGE_KEY, normalized)
  } catch {
    /* ignore quota / private mode */
  }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  hydrateOnce()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getAiChatModelLabel(key: AiChatModelKey): string {
  return AI_CHAT_MODEL_OPTIONS.find((option) => option.key === key)?.label ?? (key === "auto" ? "Auto" : key)
}

/** Shared, persisted model selection kept in sync across every AI chat surface. */
export function useAiChatModelSelection(): {
  modelKey: AiChatModelKey
  setModelKey: (key: AiChatModelKey) => void
} {
  const modelKey = useSyncExternalStore(
    subscribe,
    getAiChatModelKey,
    () => DEFAULT_AI_CHAT_MODEL_KEY,
  )
  const setModelKey = useCallback((next: AiChatModelKey) => setAiChatModelKey(next), [])
  return { modelKey, setModelKey }
}

"use client"

import { useCallback, useSyncExternalStore } from "react"

/**
 * Friendly model keys sent to the ai-chat Edge Function. The backend maps these to concrete
 * provider/model ids using Edge Function secrets — the frontend never knows raw API model ids.
 */
export type AiChatModelKey =
  | "auto"
  | "openai.gpt-5.5"
  | "openai.gpt-5.4-mini"
  | "claude.sonnet"
  | "claude.haiku"

export type AiChatModelOption = {
  key: AiChatModelKey
  label: string
}

export const AI_CHAT_MODEL_OPTIONS: AiChatModelOption[] = [
  { key: "auto", label: "Auto" },
  { key: "openai.gpt-5.5", label: "OpenAI GPT-5.5" },
  { key: "openai.gpt-5.4-mini", label: "OpenAI GPT-5.4 Mini" },
  { key: "claude.sonnet", label: "Claude Sonnet" },
  { key: "claude.haiku", label: "Claude Haiku" },
]

export const DEFAULT_AI_CHAT_MODEL_KEY: AiChatModelKey = "auto"

const STORAGE_KEY = "ai-chat-model-key-v2"
const VALID_KEYS = new Set<AiChatModelKey>(AI_CHAT_MODEL_OPTIONS.map((option) => option.key))

function normalizeModelKey(value: string | null | undefined): AiChatModelKey {
  if (value && VALID_KEYS.has(value as AiChatModelKey)) return value as AiChatModelKey
  return DEFAULT_AI_CHAT_MODEL_KEY
}

let currentModelKey: AiChatModelKey = DEFAULT_AI_CHAT_MODEL_KEY
let hasHydrated = false
const listeners = new Set<() => void>()

function hydrateOnce(): void {
  if (hasHydrated || typeof window === "undefined") return
  hasHydrated = true
  try {
    currentModelKey = normalizeModelKey(window.localStorage.getItem(STORAGE_KEY))
  } catch {
    currentModelKey = DEFAULT_AI_CHAT_MODEL_KEY
  }
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
  return AI_CHAT_MODEL_OPTIONS.find((option) => option.key === key)?.label ?? "Auto"
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

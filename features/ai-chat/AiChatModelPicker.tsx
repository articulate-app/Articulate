"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { Check, ChevronDown, Pin, Search } from "lucide-react"
import {
  AI_CHAT_MODEL_OPTIONS,
  fetchAiChatModelCatalog,
  getAiChatModelLabel,
  getPinnedAiChatModelKeys,
  getRecentAiChatModelKeys,
  togglePinnedAiChatModelKey,
  type AiChatCatalogModel,
  type AiChatModelKey,
} from "./ai-chat-model-selection"

type AiChatModelPickerProps = {
  modelKey: AiChatModelKey
  onModelKeyChange: (key: AiChatModelKey) => void
  disabled?: boolean
}

function formatPrice(value: number | null): string | null {
  if (value == null || !Number.isFinite(value)) return null
  if (value < 0.1) return `$${value.toFixed(3)}`
  if (value < 1) return `$${value.toFixed(2)}`
  if (value < 10) return `$${value.toFixed(1)}`
  return `$${Math.round(value)}`
}

function formatContext(value: number | null): string | null {
  if (!value || !Number.isFinite(value)) return null
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M`
  return `${Math.round(value / 1_000)}k`
}

export function AiChatModelPicker({ modelKey, onModelKeyChange, disabled }: AiChatModelPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [models, setModels] = useState<AiChatCatalogModel[]>([])
  const [catalogError, setCatalogError] = useState(false)
  const [query, setQuery] = useState("")
  const [pinnedKeys, setPinnedKeys] = useState<string[]>([])
  const [recentKeys, setRecentKeys] = useState<string[]>([])
  const rootRef = useRef<HTMLDivElement | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setPinnedKeys(getPinnedAiChatModelKeys())
    setRecentKeys(getRecentAiChatModelKeys())
    let cancelled = false
    void fetchAiChatModelCatalog()
      .then((catalog) => { if (!cancelled) setModels(catalog.models) })
      .catch(() => { if (!cancelled) setCatalogError(true) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!isOpen) return
    setQuery("")
    requestAnimationFrame(() => searchRef.current?.focus())
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setIsOpen(false) }
    document.addEventListener("mousedown", handlePointerDown, true)
    document.addEventListener("keydown", handleKeyDown, true)
    return () => {
      document.removeEventListener("mousedown", handlePointerDown, true)
      document.removeEventListener("keydown", handleKeyDown, true)
    }
  }, [isOpen])

  const availableModels = useMemo(() => {
    if (models.length > 0) return models.filter((model) => model.selectable !== false)
    return AI_CHAT_MODEL_OPTIONS.filter((option) => option.key !== "auto").map((option) => ({
      key: option.key, label: option.label, provider: "openai", external_id: null,
      tier: "balanced" as const, context_limit: null, recommended: true,
      recommendation_tag: null, selectable: true, lab_only: false, supports_tools: true,
      supported_parameters: ["tools"], input_price_per_million: null, output_price_per_million: null,
    }))
  }, [models])

  const modelByKey = useMemo(() => new Map(availableModels.map((model) => [model.key, model])), [availableModels])
  const pinned = useMemo(() => pinnedKeys.map((key) => modelByKey.get(key)).filter(Boolean) as AiChatCatalogModel[], [modelByKey, pinnedKeys])
  const recent = useMemo(() => recentKeys.map((key) => modelByKey.get(key)).filter((model) => model && !pinnedKeys.includes(model.key)).slice(0, 3) as AiChatCatalogModel[], [modelByKey, pinnedKeys, recentKeys])
  const recommended = useMemo(() => availableModels.filter((model) => model.recommended && !pinnedKeys.includes(model.key)), [availableModels, pinnedKeys])

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return availableModels.filter((model) => !model.recommended && !pinnedKeys.includes(model.key) && !recentKeys.includes(model.key))
    return availableModels.filter((model) => `${model.label} ${model.external_id ?? ""} ${model.provider}`.toLowerCase().includes(q))
  }, [availableModels, pinnedKeys, query, recentKeys])

  const currentLabel = useMemo(() => {
    if (modelKey === "auto") return "Auto"
    return models.find((model) => model.key === modelKey)?.label ?? getAiChatModelLabel(modelKey)
  }, [modelKey, models])

  const choose = (key: string) => {
    onModelKeyChange(key)
    setRecentKeys(getRecentAiChatModelKeys())
    setIsOpen(false)
  }

  const togglePin = (event: React.MouseEvent, key: string) => {
    event.stopPropagation()
    setPinnedKeys(togglePinnedAiChatModelKey(key))
  }

  const renderModel = (model: AiChatCatalogModel) => {
    const isSelected = model.key === modelKey
    const isPinned = pinnedKeys.includes(model.key)
    const input = formatPrice(model.input_price_per_million)
    const output = formatPrice(model.output_price_per_million)
    const context = formatContext(model.context_limit)
    return (
      <button
        key={model.key}
        type="button"
        onClick={() => choose(model.key)}
        className={`group flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs transition-colors hover:bg-gray-50 ${isSelected ? "font-medium text-gray-900" : "text-gray-600"}`}
      >
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate">{model.label}</span>
            {model.recommendation_tag ? <span className="shrink-0 rounded bg-gray-100 px-1 py-0.5 text-[9px] font-medium text-gray-500">{model.recommendation_tag}</span> : null}
          </span>
          <span className="mt-0.5 block truncate text-[10px] font-normal text-gray-400">
            {[context ? `${context} context` : null, input && output ? `Input ${input} · Output ${output} / 1M` : null, model.supports_tools === false ? "Chat only" : null].filter(Boolean).join(" · ")}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <span
            role="button"
            tabIndex={0}
            aria-label={isPinned ? "Unpin model" : "Pin model"}
            title={isPinned ? "Unpin model" : "Pin model"}
            onClick={(event) => togglePin(event, model.key)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault()
                togglePin(event as unknown as React.MouseEvent, model.key)
              }
            }}
            className={`rounded p-1 transition-colors ${isPinned ? "text-gray-700" : "text-gray-300 opacity-0 group-hover:opacity-100"}`}
          >
            <Pin className="h-3.5 w-3.5" fill={isPinned ? "currentColor" : "none"} aria-hidden />
          </span>
          {isSelected ? <Check className="h-3.5 w-3.5" aria-hidden /> : null}
        </span>
      </button>
    )
  }

  const section = (title: string, items: AiChatCatalogModel[]) => items.length ? (
    <div className="px-1.5 pb-1.5">
      <div className="px-2 pb-1 pt-1.5 text-[10px] font-medium text-gray-400">{title}</div>
      {items.map(renderModel)}
    </div>
  ) : null

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button type="button" onClick={() => setIsOpen((prev) => !prev)} disabled={disabled}
        className="inline-flex h-7 max-w-full min-w-0 items-center gap-1 rounded-sm px-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100/80 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
        aria-haspopup="dialog" aria-expanded={isOpen} aria-label="Select AI model" title="Select AI model">
        <span className="max-w-[7.5rem] truncate sm:max-w-[150px]">{currentLabel}</span>
        <ChevronDown className="h-3 w-3" aria-hidden />
      </button>

      {isOpen ? (
        <div role="dialog" aria-label="AI model picker" className="fixed inset-x-3 bottom-3 z-[9999] max-h-[75vh] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl md:absolute md:inset-x-auto md:bottom-full md:left-0 md:mb-1 md:w-[390px] md:rounded-lg md:shadow-lg">
          <div className="p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" aria-hidden />
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search models"
                className="h-9 w-full rounded-md border-0 bg-gray-50 pl-8 pr-3 text-xs outline-none placeholder:text-gray-400 focus:bg-gray-100/80"
              />
            </div>
          </div>

          <div className="max-h-[calc(75vh-56px)] overflow-y-auto px-0.5 pb-1.5 md:max-h-[420px]">
            {query.trim() ? (
              <div className="px-1.5 pb-1.5">
                <div className="flex items-center justify-between px-2 pb-1 pt-1 text-[10px] font-medium text-gray-400">
                  <span>Search results</span>
                  <span>{searchResults.length}</span>
                </div>
                {catalogError ? <div className="px-2.5 py-3 text-xs text-gray-400">Could not load the model catalog.</div>
                  : searchResults.length === 0 ? <div className="px-2.5 py-3 text-xs text-gray-400">No matching models.</div>
                  : searchResults.map(renderModel)}
              </div>
            ) : (
              <>
                <div className="px-1.5 pb-1.5">
                  <button type="button" onClick={() => choose("auto")}
                    className={`flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-xs transition-colors hover:bg-gray-50 ${modelKey === "auto" ? "font-medium text-gray-900" : "text-gray-600"}`}>
                    <span><span className="block">Auto</span><span className="block text-[10px] font-normal text-gray-400">Balanced routing</span></span>
                    {modelKey === "auto" ? <Check className="h-3.5 w-3.5" aria-hidden /> : null}
                  </button>
                </div>
                {section("Pinned", pinned)}
                {section("Recent", recent)}
                {section("Recommended", recommended)}
                {searchResults.length ? section("More models", searchResults) : null}
                {catalogError ? <div className="px-4 py-2 text-xs text-gray-400">Could not load the complete model catalog.</div> : null}
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

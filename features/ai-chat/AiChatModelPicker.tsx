"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { Check, ChevronDown, Search } from "lucide-react"
import {
  AI_CHAT_MODEL_OPTIONS,
  fetchAiChatModelCatalog,
  getAiChatModelLabel,
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
  return `$${value.toFixed(1)}`
}

function formatContext(value: number | null): string | null {
  if (!value || !Number.isFinite(value)) return null
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M`
  return `${Math.round(value / 1_000)}k`
}

/** Compact model selector backed by the authenticated server-side catalog. */
export function AiChatModelPicker({ modelKey, onModelKeyChange, disabled }: AiChatModelPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [models, setModels] = useState<AiChatCatalogModel[]>([])
  const [catalogError, setCatalogError] = useState(false)
  const [query, setQuery] = useState("")
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetchAiChatModelCatalog()
      .then((catalog) => {
        if (!cancelled) setModels(catalog.models)
      })
      .catch(() => {
        if (!cancelled) setCatalogError(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!isOpen) return
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false)
    }
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
      key: option.key,
      label: option.label,
      provider: "openai",
      external_id: null,
      tier: "balanced" as const,
      context_limit: null,
      recommended: true,
      selectable: true,
      lab_only: false,
      supports_tools: true,
      supported_parameters: ["tools"],
      input_price_per_million: null,
      output_price_per_million: null,
    }))
  }, [models])

  const recommended = useMemo(() => availableModels.filter((model) => model.recommended), [availableModels])

  const allModels = useMemo(() => {
    const q = query.trim().toLowerCase()
    return availableModels
      .filter((model) => !model.recommended)
      .filter((model) => !q || `${model.label} ${model.external_id ?? ""} ${model.provider}`.toLowerCase().includes(q))
      .sort((a, b) => {
        const aProvider = a.provider === "openrouter" ? 0 : 1
        const bProvider = b.provider === "openrouter" ? 0 : 1
        if (aProvider !== bProvider) return aProvider - bProvider
        const aPrice = (a.input_price_per_million ?? 1e9) + (a.output_price_per_million ?? 1e9)
        const bPrice = (b.input_price_per_million ?? 1e9) + (b.output_price_per_million ?? 1e9)
        return aPrice - bPrice || a.label.localeCompare(b.label)
      })
  }, [availableModels, query])

  const currentLabel = useMemo(() => {
    if (modelKey === "auto") return "Auto"
    return models.find((model) => model.key === modelKey)?.label ?? getAiChatModelLabel(modelKey)
  }, [modelKey, models])

  const choose = (key: string) => {
    onModelKeyChange(key)
    setIsOpen(false)
  }

  const renderModel = (model: AiChatCatalogModel) => {
    const isSelected = model.key === modelKey
    const inputPrice = formatPrice(model.input_price_per_million)
    const outputPrice = formatPrice(model.output_price_per_million)
    const context = formatContext(model.context_limit)
    const supportsTools = model.supports_tools !== false && (model.provider !== "openrouter" || model.supported_parameters?.includes("tools") !== false)
    return (
      <button
        key={model.key}
        type="button"
        onClick={() => choose(model.key)}
        className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-gray-50 ${isSelected ? "font-medium text-gray-900" : "text-gray-600"}`}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate">{model.label}</span>
          <span className="mt-0.5 block truncate text-[10px] font-normal text-gray-400">
            {[
              model.provider === "openrouter" ? "OpenRouter" : model.provider,
              model.tier,
              context ? `${context} context` : null,
              inputPrice && outputPrice ? `${inputPrice} in / ${outputPrice} out per 1M` : null,
            ].filter(Boolean).join(" · ")}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${supportsTools ? "bg-gray-100 text-gray-500" : "bg-amber-50 text-amber-700"}`}>
            {supportsTools ? "Tools" : "Chat only"}
          </span>
          {isSelected ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
        </span>
      </button>
    )
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        disabled={disabled}
        className="inline-flex h-7 items-center gap-1 rounded-sm px-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100/80 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label="Select AI model"
        title="Select AI model"
      >
        <span className="max-w-[150px] truncate">{currentLabel}</span>
        <ChevronDown className="h-3 w-3 shrink-0" aria-hidden />
      </button>

      {isOpen ? (
        <div
          role="dialog"
          aria-label="AI model picker"
          className="absolute bottom-full left-0 z-[9999] mb-1 w-[380px] overflow-hidden rounded-md border border-gray-200 bg-white shadow-lg"
        >
          <div className="p-1.5">
            <div className="px-1.5 pb-1 text-[10px] font-medium uppercase tracking-wide text-gray-400">Auto</div>
            <button
              type="button"
              onClick={() => choose("auto")}
              className={`flex w-full items-start justify-between gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-gray-50 ${modelKey === "auto" ? "font-medium text-gray-900" : "text-gray-600"}`}
            >
              <span>
                <span className="block">Auto · Balanced</span>
                <span className="mt-0.5 block text-[10px] font-normal text-gray-400">Articulate chooses the model automatically.</span>
              </span>
              {modelKey === "auto" ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
            </button>
          </div>

          {recommended.length > 0 ? (
            <div className="border-t border-gray-100 p-1.5">
              <div className="px-1.5 pb-1 text-[10px] font-medium uppercase tracking-wide text-gray-400">Recommended</div>
              {recommended.map(renderModel)}
            </div>
          ) : null}

          <div className="border-t border-gray-100 p-1.5">
            <div className="flex items-center justify-between px-1.5 pb-1">
              <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400">All OpenRouter models</span>
              <span className="text-[10px] text-gray-400">{allModels.length} shown</span>
            </div>
            <div className="relative mb-1.5">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-gray-400" aria-hidden />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search Claude, Gemini, Qwen, Kimi…"
                className="h-7 w-full rounded border border-gray-200 bg-white pl-7 pr-2 text-xs outline-none placeholder:text-gray-400 focus:border-gray-300"
              />
            </div>
            <div className="max-h-64 overflow-y-auto">
              {catalogError ? (
                <div className="px-2 py-2 text-xs text-gray-400">Could not load the OpenRouter catalog.</div>
              ) : allModels.length === 0 ? (
                <div className="px-2 py-2 text-xs text-gray-400">No matching models.</div>
              ) : (
                allModels.map(renderModel)
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

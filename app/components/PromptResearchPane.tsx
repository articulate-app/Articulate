"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import {
  AlertCircle,
  Check,
  Clock,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { toast } from "./ui/use-toast"
import {
  usePromptResearch,
  type PromptResearchFilters,
} from "../hooks/usePromptResearch"
import { usePromptSearchHistory } from "../hooks/usePromptSearchHistory"
import { AddPromptToProjectPopover } from "./add-prompt-to-project-popover"
import { SavePromptListPopover } from "./save-prompt-list-popover"
import { stripMarkdownNoise } from "../lib/ai-overview-text"
import { PROMPT_RESEARCH_QUERY_PARAM, RESEARCH_QUERY_PARAM } from "../lib/center-pane-selection-url"
import { languageCodeFromRegionId } from "../lib/research-region-language"
import {
  TASK_PANE_HEADER_ROW_CLASS,
  TASK_PANE_HEADER_SHELL_CLASS,
} from "./tasks/pane-header-tokens"

interface PromptResearchPaneProps {
  isOpen: boolean
  onClose: () => void
  variant?: "overlay" | "inline"
  initialPrompt?: string | null
  embedded?: boolean
  hideSharedControls?: boolean
  /** Hide the Get AI results CTA (parent ResearchPane owns the shared CTA). */
  hideSubmitButton?: boolean
  sharedQuery?: string
  onSharedQueryChange?: (query: string) => void
  sharedRegionId?: string
  /** Increment to force a search from the parent shared query field. */
  autoSearchKey?: number
}

const LANGUAGE_LABELS: Record<string, string> = {
  pt: "Portuguese",
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
}

function faviconForUrl(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const href = url.startsWith("http") ? url : `https://${url}`
    const hostname = new URL(href).hostname
    if (!hostname) return null
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=32`
  } catch {
    return null
  }
}

export function PromptResearchPane({
  isOpen,
  onClose,
  variant = "overlay",
  initialPrompt = null,
  embedded = false,
  hideSharedControls = false,
  hideSubmitButton = false,
  sharedQuery,
  onSharedQueryChange,
  sharedRegionId,
  autoSearchKey = 0,
}: PromptResearchPaneProps) {
  const searchParams = useSearchParams()
  const derivedLanguageCode = languageCodeFromRegionId(sharedRegionId)
  const [filters, setFilters] = useState<PromptResearchFilters>({
    prompt: "",
    languageCode: derivedLanguageCode,
    regionId: sharedRegionId || "",
  })
  const [hasSearched, setHasSearched] = useState(false)
  const [lastSearchedPrompt, setLastSearchedPrompt] = useState<string | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [isPromptHistoryOpen, setIsPromptHistoryOpen] = useState(false)
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSeededQueryRef = useRef<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const promptFieldRef = useRef<HTMLDivElement>(null)

  const { searchHistory, logSearch } = usePromptSearchHistory()

  const centerProjectId = useMemo(() => {
    const raw = searchParams.get("centerProjectId")
    if (!raw) return null
    const id = Number(raw)
    return Number.isFinite(id) && id > 0 ? id : null
  }, [searchParams])

  const {
    data,
    aiOverview,
    isLoading,
    isLoadingRelated,
    isLoadingAiOverview,
    aiOverviewError,
    error,
    triggerSearch,
    canSearch,
    hasResults,
  } = usePromptResearch(filters, {
    enabled: hasSearched && filters.prompt.trim().length > 0,
  })

  const historySuggestions = useMemo(() => {
    const query = filters.prompt.trim().toLowerCase()
    const seen = new Set<string>()
    const items: typeof searchHistory = []
    for (const item of searchHistory) {
      const term = typeof item.term === "string" ? item.term.trim() : ""
      if (!term) continue
      const key = term.toLowerCase()
      if (seen.has(key)) continue
      if (query && !key.includes(query)) continue
      seen.add(key)
      items.push(item)
      if (items.length >= 8) break
    }
    return items
  }, [filters.prompt, searchHistory])

  useEffect(() => {
    if (!isOpen) return
    const fromUrl = (
      searchParams.get(RESEARCH_QUERY_PARAM) ||
      searchParams.get(PROMPT_RESEARCH_QUERY_PARAM) ||
      ""
    ).trim()
    const seed = (
      (typeof sharedQuery === "string" ? sharedQuery : null)?.trim() ||
      initialPrompt?.trim() ||
      fromUrl
    ).trim()
    if (!seed || lastSeededQueryRef.current === seed) return
    lastSeededQueryRef.current = seed
    setFilters((prev) => ({ ...prev, prompt: seed }))
  }, [initialPrompt, isOpen, searchParams, sharedQuery])

  useEffect(() => {
    if (typeof sharedQuery !== "string") return
    setFilters((prev) => (prev.prompt === sharedQuery ? prev : { ...prev, prompt: sharedQuery }))
  }, [sharedQuery])

  useEffect(() => {
    const regionId = typeof sharedRegionId === "string" ? sharedRegionId : ""
    const languageCode = languageCodeFromRegionId(regionId)
    setFilters((prev) => {
      if (prev.regionId === regionId && prev.languageCode === languageCode) return prev
      return { ...prev, regionId, languageCode }
    })
  }, [sharedRegionId])

  useEffect(() => {
    if (!isOpen || hideSharedControls) return
    const id = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(id)
  }, [hideSharedControls, isOpen])

  useEffect(() => {
    return () => {
      if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current)
    }
  }, [])

  useEffect(() => {
    if (!isPromptHistoryOpen) return
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (!target) return
      if (promptFieldRef.current?.contains(target)) return
      setIsPromptHistoryOpen(false)
    }
    document.addEventListener("mousedown", onPointerDown)
    return () => document.removeEventListener("mousedown", onPointerDown)
  }, [isPromptHistoryOpen])

  const handleSubmit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault()
      if (!canSearch) return
      const searched = filters.prompt.trim()
      setHasSearched(true)
      setLastSearchedPrompt(searched)
      setIsPromptHistoryOpen(false)
      void logSearch(searched, filters.languageCode)
      triggerSearch(searched)
    },
    [canSearch, filters.languageCode, filters.prompt, logSearch, triggerSearch],
  )

  const beginSearch = useCallback(
    (searchedRaw: string) => {
      const searched = searchedRaw.trim()
      if (!searched) return
      setFilters((prev) =>
        prev.prompt === searched ? prev : { ...prev, prompt: searched },
      )
      setHasSearched(true)
      setLastSearchedPrompt(searched)
      setIsPromptHistoryOpen(false)
      void logSearch(searched, filters.languageCode)
      triggerSearch(searched)
    },
    [filters.languageCode, logSearch, triggerSearch],
  )

  const lastAutoSearchKeyRef = useRef(0)
  useEffect(() => {
    if (!autoSearchKey || autoSearchKey === lastAutoSearchKeyRef.current) return
    lastAutoSearchKeyRef.current = autoSearchKey
    const searched = (
      typeof sharedQuery === "string" ? sharedQuery : filters.prompt
    ).trim()
    if (!searched) return
    beginSearch(searched)
  }, [autoSearchKey, beginSearch, filters.prompt, sharedQuery])

  const handleCopy = useCallback(async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current)
      setCopiedKey(key)
      copiedTimeoutRef.current = setTimeout(() => {
        setCopiedKey((current) => (current === key ? null : current))
      }, 1500)
    } catch {
      toast({
        title: "Copy failed",
        description: "Could not copy to the clipboard.",
        variant: "destructive",
      })
    }
  }, [])

  const applyHistoryItem = useCallback(
    (item: (typeof searchHistory)[number]) => {
      setFilters((prev) => ({
        ...prev,
        prompt: item.term,
        languageCode: item.language_code || prev.languageCode,
      }))
      onSharedQueryChange?.(item.term)
      setIsPromptHistoryOpen(false)
      requestAnimationFrame(() => inputRef.current?.focus())
    },
    [onSharedQueryChange],
  )

  const runRelatedPrompt = useCallback(
    (prompt: string) => {
      const next = prompt.trim()
      if (!next) return
      setFilters((prev) => ({ ...prev, prompt: next }))
      onSharedQueryChange?.(next)
      setHasSearched(true)
      setLastSearchedPrompt(next)
      setIsPromptHistoryOpen(false)
      void logSearch(next, filters.languageCode)
    },
    [filters.languageCode, logSearch, onSharedQueryChange],
  )

  if (!isOpen) return null

  const shellClass = embedded
    ? "w-full bg-white"
    : variant === "overlay"
      ? "fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l border-gray-200 bg-white shadow-xl"
      : "flex h-full min-h-0 w-full flex-col bg-white"

  return (
    <div className={shellClass}>
      {!embedded ? (
      <div className={TASK_PANE_HEADER_SHELL_CLASS}>
        <div className={TASK_PANE_HEADER_ROW_CLASS}>
          <div className="flex min-w-0 items-center gap-2">
            <Sparkles className="h-4 w-4 shrink-0 text-gray-500" />
            <h2 className="truncate text-sm font-semibold text-gray-900">
              Prompt research
            </h2>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onClose}
            aria-label="Close prompt research"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
      ) : null}

      <div className={cn(embedded ? "px-4 pb-6" : "min-h-0 flex-1 overflow-y-auto px-4 pb-6", hideSharedControls ? "pt-0" : "pt-3")}>
        {hideSharedControls && hideSubmitButton ? null : (
        <form onSubmit={handleSubmit} className="space-y-2">
          {!hideSharedControls ? (
          <div ref={promptFieldRef} className="relative min-w-0">
            <Input
              ref={inputRef}
              value={filters.prompt}
              onChange={(event) => {
                setFilters((prev) => ({ ...prev, prompt: event.target.value }))
                setIsPromptHistoryOpen(true)
              }}
              onFocus={() => setIsPromptHistoryOpen(true)}
              placeholder="e.g. melhores bancos privados em portugal"
              className="h-10"
              autoComplete="off"
            />
            {isPromptHistoryOpen && historySuggestions.length > 0 ? (
              <div className="absolute left-0 right-0 top-[calc(100%+0.25rem)] z-30 overflow-hidden rounded-md border border-gray-200 bg-white shadow-lg">
                <div className="max-h-56 overflow-y-auto py-1">
                  {historySuggestions.map((item, index) => {
                    const languageLabel = item.language_code
                      ? LANGUAGE_LABELS[item.language_code] || item.language_code
                      : null
                    return (
                      <button
                        key={item.id ?? `${item.term}:${item.searched_at}:${index}`}
                        type="button"
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => applyHistoryItem(item)}
                      >
                        <Clock className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium text-gray-900">
                            {item.term}
                          </span>
                          {languageLabel ? (
                            <span className="block truncate text-xs text-gray-500">
                              {languageLabel}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : null}
          </div>
          ) : null}
          {!hideSubmitButton ? (
          <div className={cn(hideSharedControls ? "mt-4" : "mt-0")}>
            <Button
              type="submit"
              variant="outline"
              disabled={!canSearch || isLoading}
              className="h-9 w-full border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Researching…
                </>
              ) : (
                <>
                  <Search className="mr-1.5 h-3.5 w-3.5" />
                  Get AI results
                </>
              )}
            </Button>
          </div>
          ) : null}
        </form>
        )}

        {error ? (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-medium text-red-800">
                  Error loading prompt research
                </h3>
                <p className="mt-0.5 text-sm text-red-700">
                  {(error as Error).message}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2 h-8 text-xs"
                  onClick={() => triggerSearch()}
                >
                  <RefreshCw className="mr-1 h-3.5 w-3.5" />
                  Retry
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {isLoading ? (
          <div className="mt-4 space-y-1">
            {[...Array(6)].map((_, index) => (
              <div key={index} className="h-12 animate-pulse rounded-md bg-gray-100" />
            ))}
          </div>
        ) : null}

        {!isLoading && !error && hasSearched && !hasResults && lastSearchedPrompt ? (
          <div className="mt-8 text-center">
            <Search className="mx-auto mb-2 h-7 w-7 text-gray-400" />
            <p className="text-sm text-gray-500">
              No ranked brands found for “{lastSearchedPrompt}”
            </p>
          </div>
        ) : null}

        {data?.answerSummary ? (
          <div className="mt-4 rounded-md border border-gray-100 bg-gray-50 px-3 py-2">
            <div className="mb-1 flex items-center justify-between gap-2">
              <div className="text-xs font-medium uppercase tracking-wide text-gray-400">
                Summary
              </div>
              <span className="rounded-md border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                {(data.metadata?.toolName as string | undefined) || "ChatGPT"}
              </span>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-5 text-gray-700">
              {data.answerSummary}
            </p>
          </div>
        ) : null}

        {hasResults ? (
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-400">
                  Top brands
                </div>
                <span className="rounded-md border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                  {(data?.metadata?.toolName as string | undefined) || "ChatGPT"}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <SavePromptListPopover
                  prompt={lastSearchedPrompt || filters.prompt}
                  languageCode={filters.languageCode}
                  regionId={filters.regionId}
                  className="h-8 w-8"
                />
                <AddPromptToProjectPopover
                  prompt={lastSearchedPrompt || filters.prompt}
                  languageCode={filters.languageCode}
                  preferredProjectId={centerProjectId}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-gray-500"
                  title="Copy prompt"
                  aria-label="Copy prompt"
                  onClick={() =>
                    void handleCopy(
                      "prompt",
                      lastSearchedPrompt || filters.prompt,
                    )
                  }
                >
                  {copiedKey === "prompt" ? (
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            </div>
            <ul className="border-t border-gray-100">
              {data?.results.map((entity) => {
                const favicon = faviconForUrl(entity.url)
                return (
                <li
                  key={`${entity.position}-${entity.name}`}
                  className="border-b border-gray-100 py-2"
                >
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gray-100 text-xs font-medium text-gray-600">
                      {entity.position}
                    </span>
                    {favicon ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={favicon}
                        alt=""
                        width={16}
                        height={16}
                        className="mt-1 h-4 w-4 shrink-0 rounded-sm"
                        loading="lazy"
                      />
                    ) : (
                      <span className="mt-1 h-4 w-4 shrink-0 rounded-sm bg-gray-200" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="break-words text-sm font-medium text-gray-900">
                            {entity.name}
                          </div>
                          {entity.snippet ? (
                            <p className="mt-0.5 break-words text-xs leading-4 text-gray-500">
                              {entity.snippet}
                            </p>
                          ) : null}
                          {entity.url ? (
                            <a
                              href={entity.url}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-1 inline-flex max-w-full items-center gap-1 break-all text-xs text-sky-700 hover:underline"
                            >
                              <ExternalLink className="h-3 w-3 shrink-0" />
                              <span className="truncate">{entity.url}</span>
                            </a>
                          ) : null}
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-gray-500"
                          title="Copy brand name"
                          aria-label={`Copy ${entity.name}`}
                          onClick={() =>
                            void handleCopy(`entity-${entity.position}`, entity.name)
                          }
                        >
                          {copiedKey === `entity-${entity.position}` ? (
                            <Check className="h-3.5 w-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                </li>
                )
              })}
            </ul>
          </div>
        ) : null}

        {!isLoading && hasSearched ? (
          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-400">
                  AI Overview
                </div>
                <span className="rounded-md border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                  Google AI Overview
                </span>
              </div>
              {aiOverview?.checkUrl ? (
                <a
                  href={aiOverview.checkUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-sky-700 hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  Open SERP
                </a>
              ) : null}
            </div>

            {isLoadingAiOverview ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading Google AI Overview…
                </div>
                <div className="h-16 animate-pulse rounded-md bg-gray-100" />
                <div className="h-10 animate-pulse rounded-md bg-gray-100" />
              </div>
            ) : aiOverviewError ? (
              <p className="text-xs text-gray-500">
                Could not load AI Overview ({aiOverviewError}). ChatGPT results above are
                unaffected.
              </p>
            ) : aiOverview?.present ? (
              <div className="space-y-3">
                {aiOverview.answerSummary ? (
                  <div className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2">
                    <div className="space-y-2 text-sm leading-5 text-gray-700">
                      {stripMarkdownNoise(aiOverview.answerSummary)
                        .split(/\n{2,}/)
                        .map((paragraph) => paragraph.trim())
                        .filter(Boolean)
                        .map((paragraph, index) => (
                          <p key={index} className="whitespace-pre-wrap">
                            {paragraph}
                          </p>
                        ))}
                    </div>
                  </div>
                ) : null}
                {aiOverview.results.length > 0 ? (
                  <ul className="border-t border-gray-100">
                    {aiOverview.results.map((entity) => (
                      <li
                        key={`aio-${entity.position}-${entity.name}`}
                        className="border-b border-gray-100 py-2"
                      >
                        <div className="flex items-start gap-2">
                          <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gray-100 text-xs font-medium text-gray-600">
                            {entity.position}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="break-words text-sm font-medium text-gray-900">
                              {entity.name}
                            </div>
                            {entity.snippet ? (
                              <p className="mt-0.5 break-words text-xs leading-4 text-gray-500">
                                {entity.snippet}
                              </p>
                            ) : null}
                            {entity.url ? (
                              <a
                                href={entity.url}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-1 inline-flex max-w-full items-center gap-1 break-all text-xs text-sky-700 hover:underline"
                              >
                                <ExternalLink className="h-3 w-3 shrink-0" />
                                <span className="truncate">{entity.url}</span>
                              </a>
                            ) : null}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : (
              <p className="text-xs text-gray-500">
                No AI Overview appeared for this query in Google (for the selected language
                market).
              </p>
            )}
          </div>
        ) : null}

        {data?.relatedPrompts && data.relatedPrompts.length > 0 ? (
          <div className="mt-6">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
              Related prompts
            </div>
            <ul className="space-y-1">
              {data.relatedPrompts.map((related) => (
                <li key={related} className="flex items-start gap-1">
                  <button
                    type="button"
                    className={cn(
                      "flex min-w-0 flex-1 items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50",
                    )}
                    onClick={() => runRelatedPrompt(related)}
                  >
                    <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
                    <span className="min-w-0 flex-1 break-words">{related}</span>
                  </button>
                  <SavePromptListPopover
                    prompt={related}
                    languageCode={filters.languageCode}
                    regionId={filters.regionId}
                    className="mt-0.5"
                  />
                </li>
              ))}
            </ul>
          </div>
        ) : isLoadingRelated && hasResults ? (
          <div className="mt-6 flex items-center gap-2 text-xs text-gray-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading related prompts…
          </div>
        ) : null}
      </div>
    </div>
  )
}

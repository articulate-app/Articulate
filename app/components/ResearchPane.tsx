"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Clock, Lightbulb, Loader2, Search, Sparkles, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select"
import { KeywordPlannerPane } from "./KeywordPlannerPane"
import { PromptResearchPane } from "./PromptResearchPane"
import { SavedKeywordsModal } from "./SavedKeywordsModal"
import { SavedPromptsModal } from "./SavedPromptsModal"
import { SavePromptListPopover } from "./save-prompt-list-popover"
import { regions, languages } from "../lib/geoLanguageMaps"
import { languageCodeFromRegionId } from "../lib/research-region-language"
import {
  getResearchQueryFromParams,
  getResearchTabFromParams,
  RESEARCH_QUERY_PARAM,
  RESEARCH_REGION_PARAM,
  type ResearchTab,
} from "../lib/center-pane-selection-url"
import { TASK_DETAILS_HEADER_ROW_CLASS } from "./tasks/pane-header-tokens"
import { useKeywordListsApi } from "../store/keyword-lists-api"
import { usePromptSearchHistory } from "../hooks/usePromptSearchHistory"

type ResearchScope = ResearchTab | "both"

const RESEARCH_SCOPE_OPTIONS: Array<{ id: ResearchScope; label: string }> = [
  { id: "keywords", label: "Keywords" },
  { id: "prompts", label: "Prompts" },
  { id: "both", label: "Keywords + Prompts" },
]

const ANY_VALUE = "__any__"

const REGION_FLAGS: Record<string, string> = {
  "": "🌐",
  "2840": "🇺🇸",
  "2826": "🇬🇧",
  "2620": "🇵🇹",
  "2724": "🇪🇸",
  "2076": "🇧🇷",
  "2276": "🇩🇪",
  "2250": "🇫🇷",
}

const LANGUAGE_FLAGS: Record<string, string> = {
  "": "🌐",
  "1000": "🇬🇧",
  "1014": "🇵🇹",
  "1003": "🇪🇸",
  "1002": "🇫🇷",
  "1001": "🇩🇪",
}

const selectTriggerClassName =
  "h-10 min-h-10 w-full min-w-0 rounded-md border-gray-200 text-sm leading-none"

function toSelectValue(id: string | number | null | undefined): string {
  const normalized = id == null ? "" : String(id).trim()
  return normalized ? normalized : ANY_VALUE
}

function fromSelectValue(value: string): string {
  return value === ANY_VALUE ? "" : value
}

function FlagMark({ flag }: { flag: string }) {
  return (
    <span
      className="inline-flex h-4 w-5 shrink-0 items-center justify-center text-[13px] leading-none"
      aria-hidden
    >
      {flag}
    </span>
  )
}

export type ResearchPaneProps = {
  isOpen: boolean
  onClose: () => void
  variant?: "overlay" | "inline"
  initialQuery?: string | null
  initialTab?: ResearchTab | null
  onTabChange?: (tab: ResearchTab) => void
}

export function ResearchPane({
  isOpen,
  onClose,
  variant = "overlay",
  initialQuery = null,
  initialTab = null,
  onTabChange,
}: ResearchPaneProps) {
  const searchParams = useSearchParams()
  const seedQuery = useMemo(() => {
    const fromProp = initialQuery?.trim() || ""
    if (fromProp) return fromProp
    return getResearchQueryFromParams(searchParams)
  }, [initialQuery, searchParams])

  const seedTab = useMemo(() => {
    if (initialTab === "keywords" || initialTab === "prompts") return initialTab
    return getResearchTabFromParams(searchParams)
  }, [initialTab, searchParams])

  const seedRegion = useMemo(
    () => (searchParams.get(RESEARCH_REGION_PARAM) || "").trim(),
    [searchParams],
  )

  const [researchScope, setResearchScope] = useState<ResearchScope>(seedTab)
  const [resultsTab, setResultsTab] = useState<ResearchTab>(seedTab)
  const [hasSearched, setHasSearched] = useState(false)
  const [sharedQuery, setSharedQuery] = useState(seedQuery)
  const [sharedRegionId, setSharedRegionId] = useState(seedRegion)
  const [sharedLanguageId, setSharedLanguageId] = useState("")
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [isListsOpen, setIsListsOpen] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [keywordAutoSearchKey, setKeywordAutoSearchKey] = useState(0)
  const [promptAutoSearchKey, setPromptAutoSearchKey] = useState(0)
  const lastSeededQueryRef = useRef<string | null>(null)
  const lastAppliedSeedTabRef = useRef<ResearchTab | null>(null)
  const queryFieldRef = useRef<HTMLDivElement>(null)
  const queryInputRef = useRef<HTMLInputElement>(null)

  const includesKeywords = researchScope === "keywords" || researchScope === "both"
  const includesPrompts = researchScope === "prompts" || researchScope === "both"
  const activeResultsTab: ResearchTab =
    researchScope === "both" ? resultsTab : researchScope
  const listsTab: ResearchTab = activeResultsTab

  const { searchHistory: keywordHistory, fetchSearchHistory } = useKeywordListsApi()
  const {
    searchHistory: promptHistory,
    fetchSearchHistory: fetchPromptSearchHistory,
  } = usePromptSearchHistory()

  useEffect(() => {
    if (!isOpen) return
    if (!seedQuery || lastSeededQueryRef.current === seedQuery) return
    lastSeededQueryRef.current = seedQuery
    setSharedQuery(seedQuery)
  }, [isOpen, seedQuery])

  useEffect(() => {
    if (!isOpen) {
      lastAppliedSeedTabRef.current = null
      return
    }
    // Only adopt URL/tab seeds when they actually change — never reset local
    // "both" (or an in-progress choice) just because `onTabChange` identity changed.
    if (lastAppliedSeedTabRef.current === seedTab) return
    lastAppliedSeedTabRef.current = seedTab
    setResearchScope((prev) => (prev === "both" ? prev : seedTab))
    setResultsTab(seedTab)
  }, [isOpen, seedTab])

  useEffect(() => {
    if (!isOpen || !seedRegion) return
    setSharedRegionId(seedRegion)
  }, [isOpen, seedRegion])

  useEffect(() => {
    if (!isOpen) return
    // Prefetch Google Ads OAuth token so the first keyword search skips the token RTT.
    void fetch("/api/keyword-ideas/warm", { method: "POST" }).catch(() => {})
    void fetchSearchHistory()
    void fetchPromptSearchHistory()
  }, [fetchPromptSearchHistory, fetchSearchHistory, isOpen])

  useEffect(() => {
    if (!isOpen || !queryInputRef.current) return
    const timer = window.setTimeout(() => queryInputRef.current?.focus(), 80)
    return () => window.clearTimeout(timer)
  }, [isOpen, researchScope])

  useEffect(() => {
    if (!isHistoryOpen) return
    const onPointerDown = (event: MouseEvent) => {
      if (!queryFieldRef.current?.contains(event.target as Node)) {
        setIsHistoryOpen(false)
      }
    }
    document.addEventListener("mousedown", onPointerDown)
    return () => document.removeEventListener("mousedown", onPointerDown)
  }, [isHistoryOpen])

  useEffect(() => {
    if (variant !== "overlay") return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isOpen) {
        if (isHistoryOpen) {
          setIsHistoryOpen(false)
          return
        }
        onClose()
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [isHistoryOpen, isOpen, onClose, variant])

  const selectScope = useCallback(
    (scope: ResearchScope) => {
      setResearchScope(scope)
      setIsHistoryOpen(false)
      if (scope === "both") {
        // "both" is local UI state only — keep the current results tab / URL seed.
        return
      }
      lastAppliedSeedTabRef.current = scope
      setResultsTab(scope)
      onTabChange?.(scope)
    },
    [onTabChange],
  )

  const selectResultsTab = useCallback(
    (tab: ResearchTab) => {
      lastAppliedSeedTabRef.current = tab
      setResultsTab(tab)
      onTabChange?.(tab)
    },
    [onTabChange],
  )

  const requestActiveSearch = useCallback(() => {
    const q = sharedQuery.trim()
    if (!q) return
    setHasSearched(true)
    setIsSearching(true)
    if (includesKeywords) {
      setKeywordAutoSearchKey((key) => key + 1)
    }
    if (includesPrompts) {
      setPromptAutoSearchKey((key) => key + 1)
    }
    if (researchScope === "both") {
      setResultsTab((prev) => prev || "keywords")
    } else {
      setResultsTab(researchScope)
      onTabChange?.(researchScope)
    }
    window.setTimeout(() => setIsSearching(false), 600)
  }, [includesKeywords, includesPrompts, onTabChange, researchScope, sharedQuery])

  const historySuggestions = useMemo(() => {
    const query = sharedQuery.trim().toLowerCase()
    const seen = new Set<string>()
    const items: Array<{
      key: string
      term: string
      meta: string | null
    }> = []

    const pushKeyword = (item: (typeof keywordHistory)[number]) => {
      const term = typeof item.term === "string" ? item.term.trim() : ""
      if (!term) return false
      const key = term.toLowerCase()
      if (seen.has(key)) return false
      if (query && !key.includes(query)) return false
      seen.add(key)
      const regionName = item.region_id
        ? regions.find((r) => r.id === item.region_id)?.name
        : null
      items.push({
        key: `k:${item.id ?? `${term}:${item.searched_at}`}`,
        term,
        meta: regionName || null,
      })
      return true
    }

    const pushPrompt = (item: (typeof promptHistory)[number]) => {
      const term = typeof item.term === "string" ? item.term.trim() : ""
      if (!term) return false
      const key = term.toLowerCase()
      if (seen.has(key)) return false
      if (query && !key.includes(query)) return false
      seen.add(key)
      items.push({
        key: `p:${item.id ?? `${term}:${item.searched_at}`}`,
        term,
        meta: null,
      })
      return true
    }

    if (includesKeywords) {
      for (const item of keywordHistory) {
        if (pushKeyword(item) && items.length >= 8) break
      }
    }
    if (includesPrompts && items.length < 8) {
      for (const item of promptHistory) {
        if (pushPrompt(item) && items.length >= 8) break
      }
      if (items.length === 0 && query && !includesKeywords) {
        seen.clear()
        for (const item of promptHistory) {
          const term = typeof item.term === "string" ? item.term.trim() : ""
          if (!term) continue
          const key = term.toLowerCase()
          if (seen.has(key)) continue
          seen.add(key)
          items.push({
            key: `p:${item.id ?? `${term}:${item.searched_at}`}`,
            term,
            meta: null,
          })
          if (items.length >= 8) break
        }
      }
    }
    return items
  }, [includesKeywords, includesPrompts, keywordHistory, promptHistory, sharedQuery])

  const selectedRegionLabel = useMemo(() => {
    const match = regions.find((r) => r.id === sharedRegionId)
    if (!match || match.name === "Any") return "Any country"
    return match.name
  }, [sharedRegionId])

  const selectedLanguageLabel = useMemo(() => {
    const match = languages.find((l) => l.id === sharedLanguageId)
    if (!match || match.name === "Any") return "Any language"
    return match.name
  }, [sharedLanguageId])

  const selectedScopeLabel =
    RESEARCH_SCOPE_OPTIONS.find((option) => option.id === researchScope)?.label ||
    "Keywords"

  const queryLabel =
    researchScope === "prompts"
      ? "Prompt"
      : researchScope === "both"
        ? "Query"
        : "Keyword"

  const regionLabel = includesPrompts && !includesKeywords ? "Market" : "Country"
  const canSearch = sharedQuery.trim().length > 0
  const showResultTabs = researchScope === "both" && hasSearched

  if (!isOpen) return null

  const shellClass =
    variant === "overlay"
      ? "fixed inset-x-0 bottom-0 z-50 flex h-[88dvh] w-full flex-col overflow-y-auto rounded-t-2xl border-t border-gray-200 bg-white shadow-lg md:inset-x-auto md:top-0 md:right-0 md:bottom-auto md:h-screen md:w-[1100px] md:max-w-[95vw] md:rounded-t-none md:border-t-0 md:border-l"
      : "flex h-full min-h-0 w-full flex-col overflow-y-auto bg-white"

  return (
    <div className={shellClass}>
      <div className={cn(TASK_DETAILS_HEADER_ROW_CLASS, "sticky top-0 z-30")}>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h1 className="min-w-0 truncate text-[13px] font-medium text-gray-800">
            Research
          </h1>
        </div>
        {variant === "overlay" ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      <div className="relative z-20 overflow-visible px-4 pt-3 pb-0">
        <div className="grid grid-cols-[max-content_minmax(0,1fr)] items-start gap-x-6 gap-y-2">
          <label
            className="self-center justify-self-start text-left text-sm font-normal text-gray-400"
            htmlFor="research-shared-query"
          >
            {queryLabel}
          </label>
          <div ref={queryFieldRef} className="relative min-w-0">
            <div className="relative">
              <Input
                ref={queryInputRef}
                id="research-shared-query"
                type="text"
                value={sharedQuery}
                onChange={(event) => {
                  setSharedQuery(event.target.value)
                  setIsHistoryOpen(true)
                }}
                onFocus={() => setIsHistoryOpen(true)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    setIsHistoryOpen(false)
                    requestActiveSearch()
                  }
                }}
                placeholder={
                  includesPrompts && !includesKeywords
                    ? "e.g. melhores bancos privados em portugal"
                    : "Enter keyword or topic…"
                }
                className={cn(
                  "h-10 min-h-10 w-full min-w-0 rounded-md border-gray-200 text-sm",
                  includesPrompts && "pr-10",
                )}
                autoComplete="off"
              />
              {includesPrompts ? (
                <div className="absolute inset-y-0 right-1 flex items-center">
                  <SavePromptListPopover
                    prompt={sharedQuery}
                    languageCode={languageCodeFromRegionId(sharedRegionId)}
                    regionId={sharedRegionId}
                    className="h-8 w-8"
                  />
                </div>
              ) : null}
            </div>
            {isHistoryOpen && historySuggestions.length > 0 ? (
              <div className="absolute left-0 right-0 top-[calc(100%+0.25rem)] z-40 overflow-hidden rounded-md border border-gray-200 bg-white shadow-lg">
                <div className="max-h-56 overflow-y-auto py-1">
                  {historySuggestions.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setSharedQuery(item.term)
                        setIsHistoryOpen(false)
                        requestAnimationFrame(() => {
                          queryInputRef.current?.focus()
                        })
                      }}
                    >
                      <Clock className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-gray-900">
                          {item.term}
                        </span>
                        {item.meta ? (
                          <span className="block truncate text-xs text-gray-500">
                            {item.meta}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <label
            className="self-center justify-self-start text-left text-sm font-normal text-gray-400"
            htmlFor="research-shared-scope"
          >
            Type
          </label>
          <Select
            value={researchScope}
            onValueChange={(value) => selectScope(value as ResearchScope)}
          >
            <SelectTrigger id="research-shared-scope" className={selectTriggerClassName}>
              <SelectValue>
                <span className="flex min-w-0 items-center gap-2">
                  {researchScope === "prompts" ? (
                    <Sparkles className="h-3.5 w-3.5 shrink-0 text-gray-500" />
                  ) : (
                    <Lightbulb className="h-3.5 w-3.5 shrink-0 text-gray-500" />
                  )}
                  <span className="truncate">{selectedScopeLabel}</span>
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="w-[min(90vw,24rem)] max-w-full">
              {RESEARCH_SCOPE_OPTIONS.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  <span className="flex items-center gap-2">
                    {option.id === "prompts" ? (
                      <Sparkles className="h-3.5 w-3.5 text-gray-500" />
                    ) : (
                      <Lightbulb className="h-3.5 w-3.5 text-gray-500" />
                    )}
                    <span>{option.label}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <label
            className="self-center justify-self-start text-left text-sm font-normal text-gray-400"
            htmlFor="research-shared-region"
          >
            {regionLabel}
          </label>
          <Select
            value={toSelectValue(sharedRegionId)}
            onValueChange={(value) => setSharedRegionId(fromSelectValue(value))}
          >
            <SelectTrigger id="research-shared-region" className={selectTriggerClassName}>
              <SelectValue>
                <span className="flex min-w-0 items-center gap-2">
                  <FlagMark flag={REGION_FLAGS[sharedRegionId] ?? "🌐"} />
                  <span className="truncate">{selectedRegionLabel}</span>
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="w-[min(90vw,24rem)] max-w-full">
              {regions.map((region) => {
                const value = toSelectValue(region.id)
                const label = region.name === "Any" ? "Any country" : region.name
                return (
                  <SelectItem key={value} value={value}>
                    <span className="flex items-center gap-2">
                      <FlagMark flag={REGION_FLAGS[region.id] ?? "🌐"} />
                      <span>{label}</span>
                    </span>
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>

          {includesKeywords ? (
            <>
              <label
                className="self-center justify-self-start text-left text-sm font-normal text-gray-400"
                htmlFor="research-shared-language"
              >
                Language
              </label>
              <Select
                value={toSelectValue(sharedLanguageId)}
                onValueChange={(value) => setSharedLanguageId(fromSelectValue(value))}
              >
                <SelectTrigger id="research-shared-language" className={selectTriggerClassName}>
                  <SelectValue>
                    <span className="flex min-w-0 items-center gap-2">
                      <FlagMark flag={LANGUAGE_FLAGS[sharedLanguageId] ?? "🌐"} />
                      <span className="truncate">{selectedLanguageLabel}</span>
                    </span>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="w-[min(90vw,24rem)] max-w-full">
                  {languages.map((language) => {
                    const value = toSelectValue(language.id)
                    const label = language.name === "Any" ? "Any language" : language.name
                    return (
                      <SelectItem key={value} value={value}>
                        <span className="flex items-center gap-2">
                          <FlagMark flag={LANGUAGE_FLAGS[language.id] ?? "🌐"} />
                          <span>{label}</span>
                        </span>
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </>
          ) : null}

          <div className="col-span-2 pt-2">
            <Button
              type="button"
              variant="outline"
              disabled={!canSearch || isSearching}
              className="h-9 w-full border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900"
              onClick={() => {
                setIsHistoryOpen(false)
                requestActiveSearch()
              }}
            >
              {isSearching ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Getting ideas…
                </>
              ) : (
                <>
                  <Search className="mr-1.5 h-3.5 w-3.5" />
                  Get ideas
                </>
              )}
            </Button>
            <div className="mt-2 flex items-center justify-center">
              <button
                type="button"
                className="text-xs text-gray-400 transition-colors hover:text-gray-600"
                onClick={() => setIsListsOpen(true)}
              >
                View lists
              </button>
            </div>
          </div>
        </div>

        {showResultTabs ? (
          <div className="mt-3 flex min-w-0 gap-1 border-b border-gray-100" role="tablist" aria-label="Research results">
            <button
              type="button"
              role="tab"
              aria-selected={resultsTab === "keywords"}
              className={cn(
                "inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                resultsTab === "keywords"
                  ? "border-gray-900 text-gray-900"
                  : "border-transparent text-gray-500 hover:text-gray-800",
              )}
              onClick={() => selectResultsTab("keywords")}
            >
              <Lightbulb className="h-3.5 w-3.5" />
              Keywords
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={resultsTab === "prompts"}
              className={cn(
                "inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                resultsTab === "prompts"
                  ? "border-gray-900 text-gray-900"
                  : "border-transparent text-gray-500 hover:text-gray-800",
              )}
              onClick={() => selectResultsTab("prompts")}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Prompts
            </button>
          </div>
        ) : null}
      </div>

      <div className="w-full">
        {includesKeywords ? (
          <div className={activeResultsTab === "keywords" ? "block" : "hidden"}>
            <KeywordPlannerPane
              isOpen={isOpen}
              onClose={onClose}
              variant="inline"
              embedded
              sharedQuery={sharedQuery}
              sharedRegionId={sharedRegionId}
              sharedLanguageId={sharedLanguageId}
              hideSharedControls
              hideListsButton
              hideSubmitButton
              autoSearchKey={keywordAutoSearchKey}
            />
          </div>
        ) : null}
        {includesPrompts ? (
          <div className={activeResultsTab === "prompts" ? "block" : "hidden"}>
            <PromptResearchPane
              isOpen={isOpen}
              onClose={onClose}
              variant="inline"
              embedded
              sharedQuery={sharedQuery}
              onSharedQueryChange={setSharedQuery}
              sharedRegionId={sharedRegionId}
              hideSharedControls
              hideSubmitButton
              autoSearchKey={promptAutoSearchKey}
            />
          </div>
        ) : null}
      </div>

      {listsTab === "keywords" ? (
        <SavedKeywordsModal isOpen={isListsOpen} onClose={() => setIsListsOpen(false)} />
      ) : (
        <SavedPromptsModal isOpen={isListsOpen} onClose={() => setIsListsOpen(false)} />
      )}

      {/* Keep URL query param discoverable for shallow seeds without owning URL writes here. */}
      <span className="sr-only" data-research-query-param={RESEARCH_QUERY_PARAM} />
    </div>
  )
}

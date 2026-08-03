"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import {
  AlertCircle,
  Bookmark,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  Loader2,
  RefreshCw,
  Search,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { toast } from "./ui/use-toast"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select"
import { useKeywordPlanner, type KeywordIdea, type KeywordPlannerFilters } from "../hooks/useKeywordPlanner"
import { regions, languages } from "../lib/geoLanguageMaps"
import { useKeywordListsApi } from "../store/keyword-lists-api"
import { useTopResults } from "../hooks/useTopResults"
import { TopResultsSection } from "./TopResultsSection"
import { SavedKeywordsModal } from "./SavedKeywordsModal"
import { SaveKeywordListPopover } from "./save-keyword-list-popover"
import { AddKeywordToProjectPopover } from "./add-keyword-to-project-popover"
import { KeywordVolumeSparkline } from "./keyword-volume-sparkline"
import {
  KeywordDifficultyBadge,
  KeywordExpandedMetrics,
} from "./keyword-expanded-metrics"
import { KEYWORD_RESEARCH_QUERY_PARAM, RESEARCH_QUERY_PARAM } from "../lib/center-pane-selection-url"
import {
  TASK_PANE_HEADER_ROW_CLASS,
  TASK_PANE_HEADER_SHELL_CLASS,
} from "./tasks/pane-header-tokens"
import {
  KeywordMetricStat,
} from "../../features/tasks/components/keyword-metric-stat"

interface KeywordPlannerPaneProps {
  isOpen: boolean
  onClose: () => void
  /** Overlay = fixed drawer/sheet. Inline = fill the middle-pane tab content. */
  variant?: "overlay" | "inline"
  /** Optional seed keyword (e.g. from top search). Falls back to URL `krQuery` / `rQuery`. */
  initialKeyword?: string | null
  /** When true, render results/controls only (parent ResearchPane owns chrome + shared query/country). */
  embedded?: boolean
  hideSharedControls?: boolean
  /** Hide the local Lists button (ResearchPane hosts the shared Lists control). */
  hideListsButton?: boolean
  sharedQuery?: string
  sharedRegionId?: string
  sharedLanguageId?: string
  /** Increment to force a Get ideas search from the parent shared query field. */
  autoSearchKey?: number
}

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

function normalizeKeywordKey(value: string): string {
  return value.trim().toLowerCase()
}

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

function searchVolumeClassName(volume: number): string {
  if (volume >= 10000) return "text-emerald-600"
  if (volume >= 1000) return "text-sky-600"
  if (volume >= 100) return "text-gray-600"
  return "text-gray-400"
}

function formatCompactVolume(volume: number): string {
  const value = Number.isFinite(volume) ? Math.max(0, volume) : 0
  if (value >= 1_000_000) {
    const millions = value / 1_000_000
    const rounded = millions >= 10 ? Math.round(millions) : Math.round(millions * 10) / 10
    return `${rounded}M`
  }
  if (value >= 1_000) {
    const thousands = value / 1_000
    const rounded = thousands >= 10 ? Math.round(thousands) : Math.round(thousands * 10) / 10
    return `${rounded}k`
  }
  return String(Math.round(value))
}

export function KeywordPlannerPane({
  isOpen,
  onClose,
  variant = "overlay",
  initialKeyword = null,
  embedded = false,
  hideSharedControls = false,
  hideListsButton = false,
  sharedQuery,
  sharedRegionId,
  sharedLanguageId,
  autoSearchKey = 0,
}: KeywordPlannerPaneProps) {
  const searchParams = useSearchParams()
  const [filters, setFilters] = useState<KeywordPlannerFilters>({
    keyword: "",
    regionId: "",
    languageId: "",
  })
  const [showErrorDetails, setShowErrorDetails] = useState(false)
  const [expandedKeyword, setExpandedKeyword] = useState<string | null>(null)
  const [isSavedKeywordsOpen, setIsSavedKeywordsOpen] = useState(false)
  const [lastSearchedKeyword, setLastSearchedKeyword] = useState<string | null>(null)
  const [isKeywordHistoryOpen, setIsKeywordHistoryOpen] = useState(false)
  const [copiedKeyword, setCopiedKeyword] = useState<string | null>(null)
  const copiedKeywordTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSeededQueryRef = useRef<string | null>(null)
  const resultsIdentityRef = useRef<string | null>(null)
  const autoExpandedForRef = useRef<string | null>(null)
  const keywordInputRef = useRef<HTMLInputElement>(null)
  const keywordFieldRef = useRef<HTMLDivElement>(null)

  const centerProjectId = useMemo(() => {
    const raw = searchParams.get("centerProjectId")
    if (!raw) return null
    const id = Number(raw)
    return Number.isFinite(id) && id > 0 ? id : null
  }, [searchParams])

  const { logSearch, searchHistory, fetchSearchHistory } = useKeywordListsApi()

  const {
    fetchTopResults,
    getTopResults,
    isLoading: isTopResultsLoading,
    getError: getTopResultsError,
    retryTopResults,
  } = useTopResults()

  const getLanguageName = useCallback((languageId: string) => {
    if (!languageId) return ""
    return languages.find((l) => l.id === languageId)?.name || ""
  }, [])

  const getRegionName = useCallback((regionId: string) => {
    if (!regionId) return ""
    return regions.find((r) => r.id === regionId)?.name || ""
  }, [])

  const {
    data,
    isLoading,
    error,
    triggerSearch,
    canSearch,
    hasResults,
    isEnriching,
  } = useKeywordPlanner(filters, {
    enabled: false,
  })

  const seedFromUrl = (
    searchParams.get(RESEARCH_QUERY_PARAM) ||
    searchParams.get(KEYWORD_RESEARCH_QUERY_PARAM) ||
    ""
  ).trim()
  const seedKeyword = (
    (typeof sharedQuery === "string" ? sharedQuery : null)?.trim() ||
    initialKeyword?.trim() ||
    seedFromUrl ||
    ""
  ).trim()

  useEffect(() => {
    if (!isOpen || !seedKeyword) return
    if (lastSeededQueryRef.current === seedKeyword) return
    lastSeededQueryRef.current = seedKeyword
    setFilters((prev) => ({ ...prev, keyword: seedKeyword }))
    setLastSearchedKeyword(null)
    setExpandedKeyword(null)
    resultsIdentityRef.current = null
  }, [isOpen, seedKeyword])

  useEffect(() => {
    if (typeof sharedQuery !== "string") return
    setFilters((prev) => (prev.keyword === sharedQuery ? prev : { ...prev, keyword: sharedQuery }))
  }, [sharedQuery])

  useEffect(() => {
    if (typeof sharedRegionId !== "string") return
    setFilters((prev) =>
      prev.regionId === sharedRegionId ? prev : { ...prev, regionId: sharedRegionId },
    )
  }, [sharedRegionId])

  useEffect(() => {
    if (typeof sharedLanguageId !== "string") return
    setFilters((prev) =>
      prev.languageId === sharedLanguageId ? prev : { ...prev, languageId: sharedLanguageId },
    )
  }, [sharedLanguageId])

  useEffect(() => {
    if (!isOpen || hideSharedControls || !keywordInputRef.current) return
    const timer = window.setTimeout(() => keywordInputRef.current?.focus(), 80)
    return () => window.clearTimeout(timer)
  }, [hideSharedControls, isOpen, seedKeyword])

  useEffect(() => {
    if (!isOpen) return
    void fetchSearchHistory()
  }, [fetchSearchHistory, isOpen])

  useEffect(() => {
    if (!isKeywordHistoryOpen) return
    const handlePointerDown = (event: MouseEvent) => {
      if (!keywordFieldRef.current?.contains(event.target as Node)) {
        setIsKeywordHistoryOpen(false)
      }
    }
    document.addEventListener("mousedown", handlePointerDown)
    return () => document.removeEventListener("mousedown", handlePointerDown)
  }, [isKeywordHistoryOpen])

  useEffect(() => {
    if (variant !== "overlay") return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        if (isKeywordHistoryOpen) {
          setIsKeywordHistoryOpen(false)
          return
        }
        onClose()
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [isKeywordHistoryOpen, isOpen, onClose, variant])

  const pendingSearchTermRef = useRef<string | null>(null)
  const [pendingSearchTerm, setPendingSearchTerm] = useState<string | null>(null)

  const beginSearch = useCallback(
    (searched: string) => {
      pendingSearchTermRef.current = searched
      setPendingSearchTerm(searched)
      // Show the seed row immediately (perceived speed) — metrics fill in when Ads returns.
      setLastSearchedKeyword(searched)
      autoExpandedForRef.current = null
      resultsIdentityRef.current = null
      setExpandedKeyword(null)
      triggerSearch(searched)
    },
    [triggerSearch],
  )

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      if (!canSearch) return
      beginSearch(filters.keyword.trim())
    },
    [beginSearch, canSearch, filters.keyword],
  )

  const lastAutoSearchKeyRef = useRef(0)
  useEffect(() => {
    if (!autoSearchKey || autoSearchKey === lastAutoSearchKeyRef.current) return
    lastAutoSearchKeyRef.current = autoSearchKey
    const searched = (
      typeof sharedQuery === "string" ? sharedQuery : filters.keyword
    ).trim()
    if (!searched) return
    setFilters((prev) =>
      prev.keyword === searched ? prev : { ...prev, keyword: searched },
    )
    beginSearch(searched)
  }, [autoSearchKey, beginSearch, filters.keyword, sharedQuery])

  // Log history only after primary results land (don't block the Ads request).
  useEffect(() => {
    const pending = pendingSearchTermRef.current
    if (!pending) return
    if (isLoading) return
    if (!data && !error) return
    pendingSearchTermRef.current = null
    setPendingSearchTerm(null)
    void logSearch(pending, filters.regionId, filters.languageId)
  }, [data, error, filters.languageId, filters.regionId, isLoading, logSearch])

  const handleInputChange = useCallback((field: keyof KeywordPlannerFilters, value: string) => {
    setFilters((prev) => ({ ...prev, [field]: value }))
  }, [])

  const handleCopyKeyword = useCallback(async (keyword: string) => {
    try {
      await navigator.clipboard.writeText(keyword)
      if (copiedKeywordTimeoutRef.current) {
        clearTimeout(copiedKeywordTimeoutRef.current)
      }
      setCopiedKeyword(keyword)
      copiedKeywordTimeoutRef.current = setTimeout(() => {
        setCopiedKeyword((current) => (current === keyword ? null : current))
      }, 1500)
    } catch {
      toast({
        title: "Copy failed",
        description: "Could not copy the keyword to the clipboard.",
        variant: "destructive",
      })
    }
  }, [])

  useEffect(() => {
    return () => {
      if (copiedKeywordTimeoutRef.current) {
        clearTimeout(copiedKeywordTimeoutRef.current)
      }
    }
  }, [])

  // Auto-expand top results only for the "You searched" row — never for related.
  // Scoped once per search so enrichment (full phase) doesn't re-open a user collapse.
  useEffect(() => {
    const seed = (lastSearchedKeyword || "").trim()
    if (!seed || !data?.results?.length) return
    const seedKey = normalizeKeywordKey(seed)
    if (autoExpandedForRef.current === seedKey) return
    autoExpandedForRef.current = seedKey
    setExpandedKeyword(`searched:${seedKey}`)
  }, [data?.results, lastSearchedKeyword])

  const sortedResults = useMemo(() => {
    if (!data?.results) return []
    return [...data.results].sort((a, b) => b.avgMonthlySearches - a.avgMonthlySearches)
  }, [data?.results])

  const searchedKeyword = useMemo(() => {
    const seed = (lastSearchedKeyword || pendingSearchTerm || "").trim()
    if (!seed) return null
    const match = sortedResults.find(
      (row) => normalizeKeywordKey(row.keyword) === normalizeKeywordKey(seed),
    )
    return (
      match ?? {
        keyword: seed,
        avgMonthlySearches: 0,
        competitionIndex: 0,
      }
    )
  }, [lastSearchedKeyword, pendingSearchTerm, sortedResults])

  const historySuggestions = useMemo(() => {
    const query = filters.keyword.trim().toLowerCase()
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
  }, [filters.keyword, searchHistory])

  const formatNumber = useCallback((num: number) => formatCompactVolume(num), [])

  const toggleExpanded = useCallback((expandKey: string) => {
    setExpandedKeyword((current) => (current === expandKey ? null : expandKey))
  }, [])

  const applyHistoryItem = useCallback(
    (item: (typeof searchHistory)[number]) => {
      setFilters((prev) => ({
        ...prev,
        keyword: item.term,
        regionId:
          item.region_id == null || item.region_id === ""
            ? prev.regionId
            : String(item.region_id),
        languageId:
          item.language_id == null || item.language_id === ""
            ? prev.languageId
            : String(item.language_id),
      }))
      setIsKeywordHistoryOpen(false)
      requestAnimationFrame(() => keywordInputRef.current?.focus())
    },
    [],
  )

  if (!isOpen) return null

  const topResultsLanguage = getLanguageName(filters.languageId)
  const topResultsRegion = getRegionName(filters.regionId)
  const selectedRegionFlag = REGION_FLAGS[filters.regionId] ?? "🌐"
  const selectedLanguageFlag = LANGUAGE_FLAGS[filters.languageId] ?? "🌐"
  const selectedRegionLabel =
    regions.find((r) => r.id === filters.regionId)?.name === "Any"
      ? "Any country"
      : regions.find((r) => r.id === filters.regionId)?.name || "Any country"
  const selectedLanguageLabel =
    languages.find((l) => l.id === filters.languageId)?.name === "Any"
      ? "Any language"
      : languages.find((l) => l.id === filters.languageId)?.name || "Any language"

  return (
    <div
      className={
        embedded
          ? "w-full bg-white"
          : variant === "inline"
            ? "flex h-full min-h-0 w-full flex-col bg-white"
            : "fixed inset-x-0 bottom-0 z-50 flex h-[88dvh] w-full flex-col rounded-t-2xl border-t border-gray-200 bg-white shadow-lg md:inset-x-auto md:top-0 md:right-0 md:bottom-auto md:h-screen md:w-[1100px] md:max-w-[95vw] md:rounded-t-none md:border-t-0 md:border-l"
      }
    >
      {!embedded ? (
      <div className={cn(TASK_PANE_HEADER_SHELL_CLASS, "border-b-0")}>
        <div className={TASK_PANE_HEADER_ROW_CLASS}>
          <div className="mr-4 min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold text-gray-900">
              Keyword research
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs text-gray-600"
              onClick={() => setIsSavedKeywordsOpen(true)}
            >
              <Bookmark className="mr-1 h-3.5 w-3.5" />
              Lists
            </Button>
            {variant === "overlay" ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={onClose}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        </div>
      </div>
      ) : hideListsButton ? null : (
        <div className="flex shrink-0 items-center justify-end gap-1 border-b border-gray-100 px-4 py-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs text-gray-600"
            onClick={() => setIsSavedKeywordsOpen(true)}
          >
            <Bookmark className="mr-1 h-3.5 w-3.5" />
            Lists
          </Button>
        </div>
      )}

      <div className={embedded ? "w-full" : "min-h-0 flex-1 overflow-auto"}>
        <section className={cn("px-4 pb-4", hideSharedControls ? "pt-0" : "pt-4")}>
          <form
            onSubmit={handleSubmit}
            className="grid grid-cols-[max-content_minmax(0,1fr)] items-start gap-x-6 gap-y-2"
          >
            {!hideSharedControls ? (
              <>
            <label
              className="self-center justify-self-start text-left text-sm font-normal text-gray-400"
              htmlFor="keyword-research-keyword"
            >
              Keyword
            </label>
            <div ref={keywordFieldRef} className="relative min-w-0">
              <Input
                ref={keywordInputRef}
                id="keyword-research-keyword"
                type="text"
                value={filters.keyword}
                onChange={(e) => {
                  handleInputChange("keyword", e.target.value)
                  setIsKeywordHistoryOpen(true)
                }}
                onFocus={() => setIsKeywordHistoryOpen(true)}
                placeholder="Enter keyword…"
                className="h-10 min-h-10 w-full min-w-0 rounded-md border-gray-200 text-sm"
                required
                autoComplete="off"
              />
              {isKeywordHistoryOpen && historySuggestions.length > 0 ? (
                <div className="absolute left-0 right-0 top-[calc(100%+0.25rem)] z-30 overflow-hidden rounded-md border border-gray-200 bg-white shadow-lg">
                  <div className="max-h-56 overflow-y-auto py-1">
                    {historySuggestions.map((item, index) => {
                      const regionName = item.region_id
                        ? regions.find((r) => r.id === item.region_id)?.name
                        : null
                      const languageName = item.language_id
                        ? languages.find((l) => l.id === item.language_id)?.name
                        : null
                      const meta = [regionName, languageName].filter(Boolean).join(" · ")
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
                            {meta ? (
                              <span className="block truncate text-xs text-gray-500">{meta}</span>
                            ) : null}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : null}
            </div>

            <label
              className="self-center justify-self-start text-left text-sm font-normal text-gray-400"
              htmlFor="keyword-research-region"
            >
              Country
            </label>
            <Select
              value={toSelectValue(filters.regionId)}
              onValueChange={(value) => handleInputChange("regionId", fromSelectValue(value))}
            >
              <SelectTrigger id="keyword-research-region" className={selectTriggerClassName}>
                <SelectValue>
                  <span className="flex min-w-0 items-center gap-2">
                    <FlagMark flag={selectedRegionFlag} />
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
              </>
            ) : null}

            {!hideSharedControls ? (
              <>
                <label
                  className="self-center justify-self-start text-left text-sm font-normal text-gray-400"
                  htmlFor="keyword-research-language"
                >
                  Language
                </label>
                <Select
                  value={toSelectValue(filters.languageId)}
                  onValueChange={(value) => handleInputChange("languageId", fromSelectValue(value))}
                >
                  <SelectTrigger id="keyword-research-language" className={selectTriggerClassName}>
                    <SelectValue>
                      <span className="flex min-w-0 items-center gap-2">
                        <FlagMark flag={selectedLanguageFlag} />
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

            <div className={cn("col-span-2", hideSharedControls ? "pt-2" : "pt-1")}>
              <Button
                type="submit"
                variant="outline"
                disabled={!canSearch || isLoading}
                className="h-9 w-full border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900"
              >
                {isLoading ? (
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
            </div>
          </form>

          {error ? (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-medium text-red-800">
                    Error loading keyword ideas
                  </h3>
                  <p className="mt-0.5 text-sm text-red-700">{error.message}</p>
                  {showErrorDetails ? (
                    <pre className="mt-2 whitespace-pre-wrap text-xs text-red-600">
                      {JSON.stringify(error, null, 2)}
                    </pre>
                  ) : null}
                  <div className="mt-2 flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => setShowErrorDetails((v) => !v)}
                    >
                      {showErrorDetails ? "Hide" : "View"} details
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => triggerSearch()}
                    >
                      <RefreshCw className="mr-1 h-3.5 w-3.5" />
                      Retry
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {isLoading || hasResults || searchedKeyword ? (
            <div className="mt-4 space-y-4">
              {isEnriching ? (
                <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Expanding related ideas…
                </div>
              ) : null}
              {searchedKeyword ? (
                <div>
                  <div className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
                    You searched
                  </div>
                  <ul className="rounded-md border border-gray-200 bg-gray-50/70">
                    {renderKeywordRow(searchedKeyword, { emphasize: true })}
                  </ul>
                </div>
              ) : null}

              {isLoading && !hasResults ? (
                <div className="space-y-1">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="h-11 animate-pulse rounded-md bg-gray-100" />
                  ))}
                </div>
              ) : null}

              {hasResults ? (
              <div>
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
                  Related keywords
                </div>
                <ul className="border-t border-gray-100">
                  {sortedResults.map((result) => renderKeywordRow(result))}
                </ul>
              </div>
              ) : null}
            </div>
          ) : null}

          {!isLoading && !error && !hasResults && lastSearchedKeyword ? (
            <div className="mt-8 text-center">
              <Search className="mx-auto mb-2 h-7 w-7 text-gray-400" />
              <p className="text-sm text-gray-500">
                No keyword ideas found for “{lastSearchedKeyword}”
              </p>
              <p className="mt-1 text-xs text-gray-400">
                Try a different keyword or adjust country / language
              </p>
            </div>
          ) : null}
        </section>
      </div>

      <SavedKeywordsModal
        isOpen={isSavedKeywordsOpen}
        onClose={() => setIsSavedKeywordsOpen(false)}
      />
    </div>
  )

  function renderKeywordRow(
    result: KeywordIdea,
    options: { emphasize?: boolean } = {},
  ) {
    const expandKey = `${options.emphasize ? "searched" : "related"}:${normalizeKeywordKey(result.keyword)}`
    const isExpanded = expandedKeyword === expandKey
    const topResultsData = isExpanded
      ? getTopResults(result.keyword, topResultsLanguage, topResultsRegion)
      : undefined
    const topResultsError = isExpanded
      ? getTopResultsError(result.keyword, topResultsLanguage, topResultsRegion)
      : undefined
    const isTopLoading = isExpanded
      ? isTopResultsLoading(result.keyword, topResultsLanguage, topResultsRegion)
      : false
    const isSeed =
      !!lastSearchedKeyword &&
      normalizeKeywordKey(result.keyword) === normalizeKeywordKey(lastSearchedKeyword)

    return (
      <li
        key={expandKey}
        className={cn(!options.emphasize && "border-b border-gray-100")}
      >
        <div
          className={cn(
            "group flex items-center gap-1 rounded-md py-1.5 transition-colors hover:bg-gray-50",
            isExpanded && "bg-gray-50",
            options.emphasize && "px-1",
            isSeed && !options.emphasize && "bg-gray-50/80",
          )}
        >
          <button
            type="button"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900"
            aria-label={isExpanded ? "Hide top results" : "Show top results"}
            aria-expanded={isExpanded}
            onClick={() => toggleExpanded(expandKey)}
          >
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>

          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-3 py-1 text-left"
            onClick={() => toggleExpanded(expandKey)}
          >
            <span
              className={cn(
                "min-w-0 flex-1 whitespace-normal break-words text-sm leading-5 text-gray-900",
                options.emphasize && "font-medium",
              )}
              title={result.keyword}
            >
              {result.keyword}
            </span>
            <span className="inline-flex shrink-0 items-center gap-2">
              <KeywordVolumeSparkline volumes={result.monthlySearchVolumes} />
              <span className="inline-flex w-[3.25rem] justify-end">
                <KeywordMetricStat
                  metric="volume"
                  valueClassName={searchVolumeClassName(result.avgMonthlySearches)}
                >
                  {formatNumber(result.avgMonthlySearches)}
                </KeywordMetricStat>
              </span>
              <KeywordDifficultyBadge competitionIndex={result.competitionIndex} />
            </span>
          </button>

          <div className="flex shrink-0 items-center gap-0.5 pr-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
              aria-label={
                copiedKeyword === result.keyword
                  ? "Keyword copied"
                  : `Copy keyword ${result.keyword}`
              }
              title={copiedKeyword === result.keyword ? "Copied" : "Copy keyword"}
              onClick={(event) => {
                event.stopPropagation()
                void handleCopyKeyword(result.keyword)
              }}
            >
              {copiedKeyword === result.keyword ? (
                <Check className="h-3.5 w-3.5 text-emerald-600" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </Button>
            <AddKeywordToProjectPopover
              keyword={result}
              languageId={filters.languageId}
              regionId={filters.regionId}
              preferredProjectId={centerProjectId}
            />
            <SaveKeywordListPopover keyword={result} />
          </div>
        </div>

        {isExpanded ? (
          <div className="space-y-3 pb-3 pl-7 pr-1">
            <KeywordExpandedMetrics
              avgMonthlySearches={result.avgMonthlySearches}
              competitionIndex={result.competitionIndex}
              volumes={result.monthlySearchVolumes}
            />
            <TopResultsSection
              keyword={result.keyword}
              languageId={topResultsLanguage}
              regionId={topResultsRegion}
              results={topResultsData?.results}
              isLoading={isTopLoading}
              error={topResultsError}
              deferFetch
              onRetry={() =>
                retryTopResults(result.keyword, topResultsLanguage, topResultsRegion)
              }
              onFetch={() => {
                if (
                  !getTopResults(result.keyword, topResultsLanguage, topResultsRegion) &&
                  !isTopResultsLoading(result.keyword, topResultsLanguage, topResultsRegion)
                ) {
                  void fetchTopResults(
                    result.keyword,
                    topResultsLanguage,
                    topResultsRegion,
                  )
                }
              }}
            />
          </div>
        ) : null}
      </li>
    )
  }
}

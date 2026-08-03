"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { Check, ChevronDown, Loader2, Star, X } from "lucide-react"
import { Button } from "../../app/components/ui/button"
import { Input } from "../../app/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "../../app/components/ui/popover"
import { AddDashedButton } from "../../app/components/ui/add-dashed-button"
import { TopResultsSection } from "../../app/components/TopResultsSection"
import {
  KeywordDifficultyBadge,
  KeywordExpandedMetrics,
} from "../../app/components/keyword-expanded-metrics"
import { useTopResults } from "../../app/hooks/useTopResults"
import { regions } from "../../app/lib/geoLanguageMaps"
import { cn } from "../../app/lib/utils"
import { useCurrentUserStore } from "../../app/store/current-user"
import {
  formatSecondaryKeywords,
  parseKeywordTokens,
  taskSeoQueryKey,
  type TaskSeoKeywords,
} from "../../app/lib/task-seo"
import { SeoKeywordResearchInline } from "../tasks/components/seo-keyword-research-inline"
import { KeywordMetricSeparator, KeywordMetricStat } from "../tasks/components/keyword-metric-stat"
import { useKeywordIdeasMetrics } from "../tasks/hooks/use-keyword-ideas-metrics"

const SEO_REGION_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0, label: "All countries" },
  ...regions
    .map((region) => {
      const parsedId = Number(region.id)
      if (!Number.isFinite(parsedId)) return null
      if (region.name.trim().toLowerCase() === "any") return null
      return { value: parsedId, label: region.name }
    })
    .filter((region): region is { value: number; label: string } => region !== null),
]

const DEFAULT_SEO_REGION_ID = 0

type ArtifactSeoPanelProps = {
  taskId: number | null | undefined
  /** @deprecated Task SEO is task-level; channel is ignored. */
  channelId?: number | null | undefined
  contentText?: string | null | undefined
  className?: string
  /** Compact artifact guidance vs full overview editor. */
  variant?: "artifact" | "overview"
  readOnly?: boolean
  /**
   * Seed from task-details-bootstrap (keyword / secondary_keywords / language).
   * When provided, skips the extra `tasks` REST fetch.
   */
  seedSeo?: {
    primaryKeyword?: string | null
    secondaryKeywords?: string | string[] | null
    updatedAt?: string | null
    languageCode?: string | null
    languageName?: string | null
  } | null
}

function normalizeKeywordKey(value: string): string {
  return value.trim().toLowerCase()
}

function formatMetricValue(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—"
  return value.toLocaleString()
}

function seedToSeoData(
  seed: NonNullable<ArtifactSeoPanelProps["seedSeo"]>,
): TaskSeoKeywords & { languageCode: string | null; languageName: string | null } {
  const primary =
    typeof seed.primaryKeyword === "string" ? seed.primaryKeyword.trim() : ""
  const secondary =
    Array.isArray(seed.secondaryKeywords)
      ? seed.secondaryKeywords.map((token) => String(token).trim()).filter(Boolean)
      : parseKeywordTokens(
          typeof seed.secondaryKeywords === "string" ? seed.secondaryKeywords : "",
        )
  return {
    primaryKeyword: primary,
    secondaryKeywords: secondary,
    updatedAt: typeof seed.updatedAt === "string" ? seed.updatedAt : null,
    languageCode: typeof seed.languageCode === "string" ? seed.languageCode : null,
    languageName: typeof seed.languageName === "string" ? seed.languageName : null,
  }
}

/**
 * Task-level SEO panel: edits `tasks.keyword` / `tasks.secondary_keywords`.
 * Keyword rows + expand match the Research tool (volumes, difficulty, top results).
 */
export function ArtifactSeoPanel({
  taskId,
  className,
  readOnly = false,
  seedSeo = null,
}: ArtifactSeoPanelProps) {
  const supabase = createClientComponentClient()
  const queryClient = useQueryClient()
  const enabled = taskId != null && taskId > 0
  const currentPublicUserId = useCurrentUserStore((state) => state.publicUserId)
  const [seoRegionId, setSeoRegionId] = useState(DEFAULT_SEO_REGION_ID)
  const [isCountryDropdownOpen, setIsCountryDropdownOpen] = useState(false)
  const [expandedKeyword, setExpandedKeyword] = useState<string | null>(null)
  const [newKeywordValue, setNewKeywordValue] = useState("")
  const [isKeywordSuggestionsOpen, setIsKeywordSuggestionsOpen] = useState(false)
  const [addKeywordMode, setAddKeywordMode] = useState<"type" | "research">("type")
  const [editingOriginalValue, setEditingOriginalValue] = useState("")
  const [editingKeywordValue, setEditingKeywordValue] = useState("")
  const [isEditingSelectedKeyword, setIsEditingSelectedKeyword] = useState(false)
  const addKeywordInputRef = useRef<HTMLInputElement | null>(null)
  const {
    fetchTopResults,
    getTopResults,
    isLoading: isTopResultsLoading,
    getError: getTopResultsError,
    retryTopResults,
  } = useTopResults()

  const seededSeo = useMemo(
    () => (seedSeo ? seedToSeoData(seedSeo) : null),
    [seedSeo],
  )
  const hasBootstrapSeed = seededSeo != null

  const seoQuery = useQuery({
    queryKey: taskSeoQueryKey(taskId),
    enabled: enabled && !hasBootstrapSeed,
    staleTime: 15_000,
    initialData: seededSeo ?? undefined,
    queryFn: async (): Promise<TaskSeoKeywords & { languageCode: string | null; languageName: string | null }> => {
      const { data, error } = await supabase
        .from("tasks")
        .select("keyword, secondary_keywords, updated_at, language_id, languages:language_id(code, long_name)")
        .eq("id", taskId!)
        .maybeSingle()
      if (error) throw error
      const primary =
        typeof data?.keyword === "string" ? data.keyword.trim() : ""
      const secondaryRaw =
        typeof data?.secondary_keywords === "string" ? data.secondary_keywords : ""
      const language = Array.isArray((data as any)?.languages)
        ? (data as any).languages[0]
        : (data as any)?.languages
      return {
        primaryKeyword: primary,
        secondaryKeywords: parseKeywordTokens(secondaryRaw),
        updatedAt: typeof data?.updated_at === "string" ? data.updated_at : null,
        languageCode: typeof language?.code === "string" ? language.code : null,
        languageName:
          typeof language?.long_name === "string"
            ? language.long_name
            : typeof language?.name === "string"
              ? language.name
              : null,
      }
    },
  })

  useEffect(() => {
    if (!hasBootstrapSeed || !seededSeo || !enabled) return
    const key = taskSeoQueryKey(taskId)
    // Seed once per task — do not overwrite local edits on parent re-render.
    if (queryClient.getQueryData(key) != null) return
    queryClient.setQueryData(key, seededSeo)
  }, [enabled, hasBootstrapSeed, queryClient, seededSeo, taskId])
  useEffect(() => {
    if (!enabled) return
    const channel = supabase
      .channel(`task-seo-${taskId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "tasks",
          filter: `id=eq.${taskId}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: taskSeoQueryKey(taskId) })
          void queryClient.invalidateQueries({ queryKey: ["task", String(taskId)] })
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [enabled, queryClient, supabase, taskId])

  const allKeywords = useMemo(() => {
    const primary = seoQuery.data?.primaryKeyword?.trim() ?? ""
    const secondary = seoQuery.data?.secondaryKeywords ?? []
    const seen = new Set<string>()
    const out: Array<{ keyword: string; isPrimary: boolean }> = []
    for (const value of primary ? [primary, ...secondary] : secondary) {
      const key = normalizeKeywordKey(value)
      if (!key || seen.has(key)) continue
      seen.add(key)
      out.push({ keyword: value, isPrimary: key === normalizeKeywordKey(primary) })
    }
    return out
  }, [seoQuery.data])

  const keywordList = useMemo(() => allKeywords.map((row) => row.keyword), [allKeywords])
  const existingKeywordsSet = useMemo(
    () => new Set(keywordList.map((keyword) => normalizeKeywordKey(keyword))),
    [keywordList],
  )

  const inferredTaskLanguage = useMemo(
    () => seoQuery.data?.languageCode ?? seoQuery.data?.languageName ?? null,
    [seoQuery.data],
  )

  const {
    syncKeywordKeys,
    getKeywordMetric,
    fetchKeywordMetricsForKeyword,
  } = useKeywordIdeasMetrics({
    inferredTaskLanguage,
    regionId: seoRegionId > 0 ? seoRegionId : null,
    taskId: enabled ? taskId! : null,
    channelId: null,
    userId: currentPublicUserId,
  })

  useEffect(() => {
    syncKeywordKeys(keywordList)
  }, [keywordList, syncKeywordKeys])

  useEffect(() => {
    if (keywordList.length === 0) return
    for (const keyword of keywordList) {
      void fetchKeywordMetricsForKeyword(keyword)
    }
  }, [keywordList, seoRegionId, fetchKeywordMetricsForKeyword])

  useEffect(() => {
    if (!expandedKeyword) return
    if (!keywordList.some((keyword) => keyword === expandedKeyword)) {
      setExpandedKeyword(null)
    }
  }, [keywordList, expandedKeyword])

  const updateKeywords = useMutation({
    mutationFn: async (args: { primaryKeyword: string; secondaryKeywords: string[] }) => {
      const { error } = await supabase
        .from("tasks")
        .update({
          keyword: args.primaryKeyword.trim() || null,
          secondary_keywords: formatSecondaryKeywords(args.secondaryKeywords) || null,
        })
        .eq("id", taskId!)
      if (error) throw error
      return args
    },
    onSuccess: async (args) => {
      const previous = queryClient.getQueryData(
        taskSeoQueryKey(taskId),
      ) as (TaskSeoKeywords & { languageCode: string | null; languageName: string | null }) | undefined
      queryClient.setQueryData(taskSeoQueryKey(taskId), {
        primaryKeyword: args.primaryKeyword.trim(),
        secondaryKeywords: args.secondaryKeywords,
        updatedAt: new Date().toISOString(),
        languageCode: previous?.languageCode ?? seededSeo?.languageCode ?? null,
        languageName: previous?.languageName ?? seededSeo?.languageName ?? null,
      })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["task", String(taskId)] }),
        queryClient.invalidateQueries({ queryKey: ["task", taskId] }),
      ])
    },
  })

  const persistKeywords = useCallback(
    async (primaryKeyword: string, secondaryKeywords: string[]) => {
      if (!enabled || readOnly) return
      const nextPrimary = primaryKeyword.trim()
      const nextSecondary = secondaryKeywords
        .map((token) => token.trim())
        .filter(Boolean)
        .filter((token) => normalizeKeywordKey(token) !== normalizeKeywordKey(nextPrimary))
      const currentPrimary = seoQuery.data?.primaryKeyword ?? ""
      const currentSecondary = seoQuery.data?.secondaryKeywords ?? []
      if (
        nextPrimary === currentPrimary
        && formatSecondaryKeywords(nextSecondary) === formatSecondaryKeywords(currentSecondary)
      ) {
        return
      }
      await updateKeywords.mutateAsync({
        primaryKeyword: nextPrimary,
        secondaryKeywords: nextSecondary,
      })
    },
    [enabled, readOnly, seoQuery.data, updateKeywords],
  )

  const handleAddKeyword = useCallback(
    async (keywordInput?: string) => {
      const tokens = parseKeywordTokens(keywordInput ?? newKeywordValue)
      if (tokens.length === 0 || !enabled || readOnly) return false
      const currentPrimary = (seoQuery.data?.primaryKeyword || "").trim()
      const currentSecondary = [...(seoQuery.data?.secondaryKeywords ?? [])]
      const merged = [...currentSecondary]
      for (const token of tokens) {
        if (existingKeywordsSet.has(normalizeKeywordKey(token))) continue
        merged.push(token)
      }
      const nextPrimary = currentPrimary || tokens[0] || ""
      const nextSecondary = nextPrimary
        ? merged.filter((k) => normalizeKeywordKey(k) !== normalizeKeywordKey(nextPrimary))
        : merged
      setNewKeywordValue("")
      setIsKeywordSuggestionsOpen(false)
      setAddKeywordMode("type")
      await persistKeywords(nextPrimary, nextSecondary)
      return true
    },
    [enabled, readOnly, newKeywordValue, seoQuery.data, existingKeywordsSet, persistKeywords],
  )

  const handleRemoveKeyword = useCallback(
    (keyword: string) => {
      const key = normalizeKeywordKey(keyword)
      const currentPrimary = seoQuery.data?.primaryKeyword ?? ""
      const currentSecondary = seoQuery.data?.secondaryKeywords ?? []
      if (normalizeKeywordKey(currentPrimary) === key) {
        const [nextPrimary = "", ...rest] = currentSecondary
        void persistKeywords(nextPrimary, rest)
        return
      }
      void persistKeywords(
        currentPrimary,
        currentSecondary.filter((item) => normalizeKeywordKey(item) !== key),
      )
    },
    [seoQuery.data, persistKeywords],
  )

  const handleMakePrimary = useCallback(
    (keyword: string) => {
      const key = normalizeKeywordKey(keyword)
      const currentPrimary = seoQuery.data?.primaryKeyword ?? ""
      if (normalizeKeywordKey(currentPrimary) === key) return
      const others = [currentPrimary, ...(seoQuery.data?.secondaryKeywords ?? [])]
        .map((item) => item.trim())
        .filter(Boolean)
        .filter((item) => normalizeKeywordKey(item) !== key)
      void persistKeywords(keyword, others)
    },
    [seoQuery.data, persistKeywords],
  )

  const commitKeywordEdit = useCallback(
    (oldKeyword: string, nextKeywordInput: string) => {
      setIsEditingSelectedKeyword(false)
      const next = nextKeywordInput.trim()
      if (!next || normalizeKeywordKey(next) === normalizeKeywordKey(oldKeyword)) return
      if (existingKeywordsSet.has(normalizeKeywordKey(next))) return
      const currentPrimary = seoQuery.data?.primaryKeyword ?? ""
      const currentSecondary = seoQuery.data?.secondaryKeywords ?? []
      if (normalizeKeywordKey(currentPrimary) === normalizeKeywordKey(oldKeyword)) {
        void persistKeywords(next, currentSecondary)
        return
      }
      void persistKeywords(
        currentPrimary,
        currentSecondary.map((item) =>
          normalizeKeywordKey(item) === normalizeKeywordKey(oldKeyword) ? next : item,
        ),
      )
    },
    [existingKeywordsSet, seoQuery.data, persistKeywords],
  )

  const researchRegionId = seoRegionId > 0 ? String(seoRegionId) : ""
  const selectedCountryLabel =
    SEO_REGION_OPTIONS.find((option) => option.value === seoRegionId)?.label ?? "All countries"

  if (!enabled) {
    return (
      <div className={cn("rounded-md border border-gray-200 bg-gray-50/50 p-3", className)}>
        <p className="text-xs text-gray-500">
          Link this artifact to a task to inherit and edit shared task keywords.
        </p>
      </div>
    )
  }

  const addKeywordComposer = readOnly ? null : (
    <Popover
      open={isKeywordSuggestionsOpen}
      onOpenChange={(open) => {
        setIsKeywordSuggestionsOpen(open)
        if (open) {
          setAddKeywordMode("type")
          requestAnimationFrame(() => addKeywordInputRef.current?.focus())
        } else {
          setNewKeywordValue("")
          setAddKeywordMode("type")
        }
      }}
    >
      <PopoverTrigger asChild>
        <AddDashedButton
          label="Add keyword or prompt"
          className="mt-0"
          disabled={updateKeywords.isPending}
        />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-[var(--radix-popover-trigger-width)] rounded-lg border border-gray-200 bg-white p-0 shadow-lg"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          addKeywordInputRef.current?.focus()
        }}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <div className={addKeywordMode === "type" ? "block" : "hidden"}>
          <div className="space-y-3 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-medium text-gray-900">Add keyword or prompt</div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setAddKeywordMode("research")}
              >
                Search for keywords
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Input
                ref={addKeywordInputRef}
                placeholder="Type a keyword or prompt"
                value={newKeywordValue}
                onChange={(event) => setNewKeywordValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    void handleAddKeyword()
                  }
                  if (event.key === "Escape") {
                    event.preventDefault()
                    setIsKeywordSuggestionsOpen(false)
                    setNewKeywordValue("")
                  }
                }}
                className="h-8 min-w-0 flex-1 text-sm"
                disabled={updateKeywords.isPending}
              />
              <Button
                type="button"
                size="sm"
                className="h-8 shrink-0 px-3 text-xs"
                disabled={updateKeywords.isPending || !newKeywordValue.trim()}
                onClick={() => {
                  void handleAddKeyword()
                }}
              >
                Add
              </Button>
            </div>
          </div>
        </div>
        <div className={addKeywordMode === "research" ? "block" : "hidden"}>
          <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-3 py-2">
            <div className="text-sm font-medium text-gray-900">Keyword research</div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setAddKeywordMode("type")}
            >
              Type instead
            </Button>
          </div>
          <SeoKeywordResearchInline
            initialRegionId={researchRegionId}
            existingKeywords={existingKeywordsSet}
            onSelectKeyword={async (keyword) => {
              await handleAddKeyword(keyword)
            }}
            disabled={updateKeywords.isPending}
            autoFocus={addKeywordMode === "research"}
          />
        </div>
      </PopoverContent>
    </Popover>
  )

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex w-full items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {updateKeywords.isPending ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-gray-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              Saving…
            </span>
          ) : null}
        </div>
        <Popover open={isCountryDropdownOpen} onOpenChange={setIsCountryDropdownOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
            >
              <span className="max-w-[9rem] truncate">{selectedCountryLabel}</span>
              <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-56 p-1">
            <div className="max-h-64 overflow-y-auto">
              {SEO_REGION_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                  onClick={() => {
                    setSeoRegionId(option.value)
                    setIsCountryDropdownOpen(false)
                  }}
                >
                  <span className="truncate">{option.label}</span>
                  {seoRegionId === option.value ? (
                    <Check className="h-3.5 w-3.5 text-gray-500" />
                  ) : null}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {seoQuery.isLoading ? (
        <p className="text-xs text-gray-500">Loading keywords…</p>
      ) : allKeywords.length === 0 ? (
        addKeywordComposer
      ) : (
        <div className="space-y-1.5">
          <ul className="rounded-md border border-gray-200 bg-white">
            {allKeywords.map((row) => {
              const metric = getKeywordMetric(row.keyword)
              const isExpanded = expandedKeyword === row.keyword
              const isEditingRow =
                isEditingSelectedKeyword && editingOriginalValue === row.keyword
              const topResultsLanguage = inferredTaskLanguage ?? undefined
              const topResultsRegion = researchRegionId || undefined
              const topResultsData = isExpanded
                ? getTopResults(row.keyword, topResultsLanguage, topResultsRegion)
                : undefined
              const topResultsError = isExpanded
                ? getTopResultsError(row.keyword, topResultsLanguage, topResultsRegion)
                : undefined
              const isTopLoading = isExpanded
                ? isTopResultsLoading(row.keyword, topResultsLanguage, topResultsRegion)
                : false
              const volume = metric?.volume ?? null
              const competition = metric?.competition ?? null

              return (
                <li
                  key={row.keyword}
                  className={cn(
                    "border-b border-gray-100 last:border-b-0",
                    isExpanded && "bg-gray-50/80",
                  )}
                >
                  <div className="group flex items-center gap-1 px-1 py-1.5">
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                      aria-label={isExpanded ? "Hide keyword details" : "Show keyword details"}
                      aria-expanded={isExpanded}
                      onClick={() =>
                        setExpandedKeyword((prev) => (prev === row.keyword ? null : row.keyword))
                      }
                    >
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 transition-transform duration-150",
                          isExpanded ? "rotate-0" : "-rotate-90",
                        )}
                      />
                    </button>
                    <div
                      className="flex h-8 min-w-0 flex-1 items-center"
                      onDoubleClick={() => {
                        if (readOnly) return
                        setEditingOriginalValue(row.keyword)
                        setEditingKeywordValue(row.keyword)
                        setIsEditingSelectedKeyword(true)
                      }}
                    >
                      {isEditingRow ? (
                        <Input
                          value={editingKeywordValue}
                          onChange={(event) => setEditingKeywordValue(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault()
                              commitKeywordEdit(editingOriginalValue || row.keyword, editingKeywordValue)
                            }
                            if (event.key === "Escape") {
                              event.preventDefault()
                              setIsEditingSelectedKeyword(false)
                            }
                          }}
                          onBlur={() => {
                            commitKeywordEdit(editingOriginalValue || row.keyword, editingKeywordValue)
                          }}
                          className="h-8 min-h-0 w-full border-0 bg-transparent px-0 py-0 text-sm shadow-none focus-visible:ring-0"
                          autoFocus
                        />
                      ) : (
                        <span className="block truncate text-sm text-gray-900">{row.keyword}</span>
                      )}
                    </div>
                    {!isEditingRow ? (
                      <div className="flex shrink-0 items-center gap-1.5 pr-1">
                        {metric?.isLoading ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-300" />
                        ) : (
                          <>
                            <KeywordMetricStat metric="volume">
                              {formatMetricValue(volume)}
                            </KeywordMetricStat>
                            {typeof competition === "number" ? (
                              <KeywordDifficultyBadge competitionIndex={competition} />
                            ) : (
                              <KeywordMetricStat metric="difficulty">—</KeywordMetricStat>
                            )}
                          </>
                        )}
                        {!readOnly ? (
                          <button
                            type="button"
                            className="rounded p-1 text-gray-400 opacity-50 transition-opacity hover:text-red-500 group-hover:opacity-100"
                            title="Remove keyword"
                            aria-label="Remove keyword"
                            onClick={(event) => {
                              event.stopPropagation()
                              handleRemoveKeyword(row.keyword)
                            }}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  {isExpanded ? (
                    <div className="space-y-3 border-t border-gray-100 px-3 pb-3 pt-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <KeywordMetricStat metric="volume">
                          {formatMetricValue(volume)}
                        </KeywordMetricStat>
                        <KeywordMetricSeparator />
                        <KeywordMetricStat metric="difficulty">
                          {formatMetricValue(competition)}
                        </KeywordMetricStat>
                        {!readOnly ? (
                          <button
                            type="button"
                            className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                            onClick={() => handleMakePrimary(row.keyword)}
                          >
                            <Star
                              className={cn(
                                "h-3.5 w-3.5",
                                row.isPrimary ? "fill-gray-600 text-gray-600" : "text-gray-300",
                              )}
                            />
                            {row.isPrimary ? "Primary" : "Make primary"}
                          </button>
                        ) : null}
                      </div>
                      {typeof volume === "number" && typeof competition === "number" ? (
                        <KeywordExpandedMetrics
                          avgMonthlySearches={volume}
                          competitionIndex={competition}
                        />
                      ) : null}
                      <TopResultsSection
                        keyword={row.keyword}
                        languageId={topResultsLanguage}
                        regionId={topResultsRegion}
                        results={topResultsData?.results}
                        isLoading={isTopLoading}
                        error={topResultsError}
                        deferFetch
                        onRetry={() =>
                          retryTopResults(row.keyword, topResultsLanguage, topResultsRegion)
                        }
                        onFetch={() => {
                          if (
                            !getTopResults(row.keyword, topResultsLanguage, topResultsRegion)
                            && !isTopResultsLoading(row.keyword, topResultsLanguage, topResultsRegion)
                          ) {
                            void fetchTopResults(
                              row.keyword,
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
            })}
          </ul>
          {addKeywordComposer}
        </div>
      )}
    </div>
  )
}

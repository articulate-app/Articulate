"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Loader2, Search } from "lucide-react"
import { Button } from "../../../app/components/ui/button"
import { Input } from "../../../app/components/ui/input"
import { regions, languages } from "../../../app/lib/geoLanguageMaps"
import {
  useKeywordPlanner,
  type KeywordIdea,
  type KeywordPlannerFilters,
} from "../../../app/hooks/useKeywordPlanner"
import { KeywordMetricSeparator, KeywordMetricStat } from "./keyword-metric-stat"

type SeoKeywordResearchInlineProps = {
  initialRegionId?: string
  initialLanguageId?: string
  existingKeywords?: Set<string>
  onSelectKeyword: (keyword: string) => void | Promise<void>
  disabled?: boolean
  autoFocus?: boolean
}

function formatMetricValue(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—"
  return value.toLocaleString()
}

export function SeoKeywordResearchInline({
  initialRegionId = "",
  initialLanguageId = "",
  existingKeywords,
  onSelectKeyword,
  disabled = false,
  autoFocus = false,
}: SeoKeywordResearchInlineProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [formFilters, setFormFilters] = useState<KeywordPlannerFilters>({
    keyword: "",
    regionId: initialRegionId,
    languageId: initialLanguageId,
  })
  const [searchFilters, setSearchFilters] = useState<KeywordPlannerFilters>({
    keyword: "",
    regionId: initialRegionId,
    languageId: initialLanguageId,
  })
  const [hasSearched, setHasSearched] = useState(false)
  const [addingKeyword, setAddingKeyword] = useState<string | null>(null)

  const {
    data,
    isLoading,
    error,
    isFetching,
    triggerSearch,
  } = useKeywordPlanner(searchFilters, {
    enabled: hasSearched && searchFilters.keyword.trim().length > 0,
    pageSize: 30,
  })

  useEffect(() => {
    if (!autoFocus) return
    const id = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(id)
  }, [autoFocus])

  const handleInputChange = useCallback((field: keyof KeywordPlannerFilters, value: string) => {
    setFormFilters((prev) => ({ ...prev, [field]: value }))
  }, [])

  const handleSubmit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault()
      event.stopPropagation()
      const keyword = formFilters.keyword.trim()
      if (!keyword || disabled) return
      const nextFilters = { ...formFilters, keyword }
      const isSameSearch =
        hasSearched &&
        searchFilters.keyword === nextFilters.keyword &&
        searchFilters.regionId === nextFilters.regionId &&
        searchFilters.languageId === nextFilters.languageId
      setSearchFilters(nextFilters)
      setHasSearched(true)
      if (isSameSearch) {
        void triggerSearch()
      }
    },
    [disabled, formFilters, hasSearched, searchFilters, triggerSearch],
  )

  const results = useMemo(() => {
    const rows = data?.results ?? []
    if (!existingKeywords || existingKeywords.size === 0) return rows
    return rows.filter((row) => !existingKeywords.has(row.keyword.trim().toLowerCase()))
  }, [data?.results, existingKeywords])

  const handleSelect = useCallback(
    async (idea: KeywordIdea) => {
      setAddingKeyword(idea.keyword)
      try {
        await onSelectKeyword(idea.keyword)
      } finally {
        setAddingKeyword(null)
      }
    },
    [onSelectKeyword],
  )

  const canSubmit = formFilters.keyword.trim().length > 0 && !disabled

  return (
    <div className="space-y-3">
      <form onSubmit={handleSubmit} className="space-y-2 px-3 pt-3">
        <Input
          ref={inputRef}
          value={formFilters.keyword}
          onChange={(event) => handleInputChange("keyword", event.target.value)}
          placeholder="Search keyword ideas…"
          className="h-8 text-sm"
          disabled={disabled}
        />
        <div className="grid grid-cols-2 gap-2">
          <select
            value={formFilters.regionId}
            onChange={(event) => handleInputChange("regionId", event.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            disabled={disabled}
            aria-label="Region"
          >
            {regions.map((region) => (
              <option key={region.id || "any-region"} value={region.id}>
                {region.name}
              </option>
            ))}
          </select>
          <select
            value={formFilters.languageId}
            onChange={(event) => handleInputChange("languageId", event.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            disabled={disabled}
            aria-label="Language"
          >
            {languages.map((language) => (
              <option key={language.id || "any-language"} value={language.id}>
                {language.name}
              </option>
            ))}
          </select>
        </div>
        <Button
          type="submit"
          size="sm"
          className="h-8 w-full text-xs"
          disabled={!canSubmit || isLoading}
        >
          {isLoading || isFetching ? (
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
      </form>

      {error ? (
        <p className="px-3 pb-3 text-xs text-red-600">
          {(error as Error)?.message || "Failed to load keyword ideas."}
        </p>
      ) : null}

      {results.length > 0 ? (
        <div className="max-h-56 overflow-y-auto border-t border-gray-100 py-1">
          {results.map((idea) => {
            const isAdding = addingKeyword === idea.keyword
            return (
              <button
                key={idea.keyword}
                type="button"
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
                disabled={disabled || isAdding}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => void handleSelect(idea)}
              >
                <span className="min-w-0 flex-1 truncate">{idea.keyword}</span>
                <span className="inline-flex shrink-0 items-center gap-1 text-xs text-gray-500">
                  <KeywordMetricStat metric="volume">
                    {formatMetricValue(idea.avgMonthlySearches)}
                  </KeywordMetricStat>
                  <KeywordMetricSeparator />
                  <KeywordMetricStat metric="difficulty">
                    {formatMetricValue(idea.competitionIndex)}
                  </KeywordMetricStat>
                </span>
                {isAdding ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-gray-400" /> : null}
              </button>
            )
          })}
        </div>
      ) : hasSearched && !isLoading && !isFetching && data?.results && data.results.length > 0 ? (
        <p className="px-3 pb-3 text-xs text-gray-500">
          All matching ideas are already added to this channel.
        </p>
      ) : hasSearched && !isLoading && !isFetching && (!data?.results || data.results.length === 0) ? (
        <p className="px-3 pb-3 text-xs text-gray-500">No keyword ideas found.</p>
      ) : null}
    </div>
  )
}

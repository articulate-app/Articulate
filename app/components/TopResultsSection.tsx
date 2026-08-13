"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { AlertCircle, ChevronRight, Loader2, RefreshCw } from "lucide-react"
import { Button } from "./ui/button"
import { type TopResult } from "../hooks/useTopResults"
import { fetchCompetitorStructure } from "../lib/services/seo-competitor-snapshot"
import type {
  CompetitorFlatHeading,
  CompetitorStructureResponse,
} from "../lib/types/seo-competitor-snapshot"
import { cn } from "../lib/utils"

interface TopResultsSectionProps {
  keyword: string
  languageId?: string | number
  regionId?: string | number
  results?: TopResult[]
  isLoading: boolean
  error?: string
  /** Defer the SERP fetch until after paint so keyword volumes aren't delayed. */
  deferFetch?: boolean
  onRetry: () => void
  onFetch: () => void
}

function faviconForResult(result: TopResult): string | null {
  try {
    const href = result.link || (result.displayLink ? `https://${result.displayLink}` : "")
    if (!href) return null
    const hostname = new URL(href.startsWith("http") ? href : `https://${href}`).hostname
    if (!hostname) return null
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=32`
  } catch {
    return null
  }
}

function ResultStructureOutline({
  headings,
  isLoading,
  error,
}: {
  headings: CompetitorFlatHeading[]
  isLoading: boolean
  error: string | null
}) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
        Analyzing structure…
      </div>
    )
  }
  if (error) {
    return <p className="text-xs text-amber-600">{error}</p>
  }
  if (headings.length === 0) {
    return <p className="text-xs text-gray-500">No heading structure available for this page.</p>
  }
  return (
    <div className="space-y-1">
      {headings.map((row, index) => (
        <div
          key={`${row.tag}-${index}-${row.text}`}
          className={cn(
            "flex items-start gap-2",
            row.level === 2 ? "pl-3" : row.level === 3 ? "pl-6" : "pl-0",
          )}
        >
          <span className="mt-0.5 inline-flex min-w-7 items-center justify-center rounded border border-gray-200 bg-gray-100 px-1 text-[10px] font-semibold text-gray-600">
            H{row.level}
          </span>
          <p
            className={cn(
              "min-w-0 flex-1 truncate",
              row.level === 1
                ? "text-xs font-semibold text-gray-900"
                : row.level === 2
                  ? "text-xs text-gray-800"
                  : "text-[11px] text-gray-500",
            )}
          >
            {row.text}
          </p>
        </div>
      ))}
    </div>
  )
}

type StructureState = {
  headings: CompetitorFlatHeading[]
  isLoading: boolean
  error: string | null
}

export function TopResultsSection({
  keyword,
  languageId,
  regionId,
  results,
  isLoading,
  error,
  deferFetch = false,
  onRetry,
  onFetch,
}: TopResultsSectionProps) {
  // Keep a stable fetch callback so parent inline handlers don't abort/restart SERP requests.
  const onFetchRef = useRef(onFetch)
  onFetchRef.current = onFetch

  const [expandedLink, setExpandedLink] = useState<string | null>(null)
  const [structureByLink, setStructureByLink] = useState<Record<string, StructureState>>({})
  const structureByLinkRef = useRef(structureByLink)
  structureByLinkRef.current = structureByLink

  useEffect(() => {
    if (results || isLoading || error) return

    if (!deferFetch) {
      onFetchRef.current()
      return
    }

    // Let keyword volumes paint first; SERP fetch is secondary.
    let idleId: number | null = null
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    const start = () => onFetchRef.current()

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      idleId = window.requestIdleCallback(start, { timeout: 600 })
    } else {
      timeoutId = setTimeout(start, 120)
    }

    return () => {
      if (idleId != null && typeof window !== "undefined" && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleId)
      }
      if (timeoutId != null) clearTimeout(timeoutId)
    }
    // Re-trigger only when the SERP identity or fetch state changes — not when onFetch identity flips.
  }, [keyword, languageId, regionId, results, isLoading, error, deferFetch])

  useEffect(() => {
    setExpandedLink(null)
  }, [keyword, languageId, regionId])

  useEffect(() => {
    if (!expandedLink) return
    const cached = structureByLinkRef.current[expandedLink]
    if (cached && !cached.isLoading && (cached.headings.length > 0 || cached.error)) {
      return
    }

    let cancelled = false
    setStructureByLink((prev) => ({
      ...prev,
      [expandedLink]: { headings: [], isLoading: true, error: null },
    }))

    void fetchCompetitorStructure({ url: expandedLink })
      .then((response: CompetitorStructureResponse) => {
        if (cancelled) return
        const headings = (response.flatHeadings ?? []).filter((row) => row.text?.trim())
        setStructureByLink((prev) => ({
          ...prev,
          [expandedLink]: {
            headings,
            isLoading: false,
            error: response.error || (!response.available && headings.length === 0
              ? "Structure not available for this page"
              : null),
          },
        }))
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setStructureByLink((prev) => ({
          ...prev,
          [expandedLink]: {
            headings: [],
            isLoading: false,
            error: err instanceof Error ? err.message : "Failed to load structure",
          },
        }))
      })

    return () => {
      cancelled = true
    }
  }, [expandedLink])

  const hasResults = Boolean(results && results.length > 0)
  const hasError = Boolean(error && error.length > 0)
  // Treat “not fetched yet” as pending so we never flash “No results found” before loading starts.
  const isPending = isLoading || (results === undefined && !hasError)
  const isEmpty = Array.isArray(results) && results.length === 0 && !isLoading && !hasError

  const rows = useMemo(
    () =>
      (results ?? []).map((result) => ({
        result,
        favicon: faviconForResult(result),
      })),
    [results],
  )

  return (
    <div>
      {isPending ? (
        <div className="space-y-2 py-1">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="flex items-start gap-2.5 animate-pulse">
              <div className="mt-0.5 h-4 w-4 shrink-0 rounded-sm bg-gray-200" />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="h-3.5 w-3/4 rounded bg-gray-200" />
                <div className="h-3 w-1/2 rounded bg-gray-200" />
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {hasError ? (
        <div className="py-2">
          <div className="flex items-start gap-2 text-xs text-red-600">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 flex-1">{error}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            className="mt-2 h-7 px-2 text-[11px]"
          >
            <RefreshCw className="mr-1 h-3 w-3" />
            Retry
          </Button>
        </div>
      ) : null}

      {hasResults && !isPending && !hasError ? (
        <ul className="space-y-1.5 py-1">
          {rows.map(({ result, favicon }, index) => {
            const isExpanded = expandedLink === result.link
            const structure = structureByLink[result.link]
            return (
              <li
                key={`${result.link}:${index}`}
                className={cn(
                  "overflow-hidden rounded-md border transition-colors",
                  isExpanded ? "border-gray-200 bg-gray-50/70" : "border-transparent",
                )}
              >
                <button
                  type="button"
                  className="group flex w-full min-w-0 items-start gap-2.5 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-gray-50"
                  aria-expanded={isExpanded}
                  onClick={() => {
                    setExpandedLink((prev) => (prev === result.link ? null : result.link))
                  }}
                >
                  {favicon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={favicon}
                      alt=""
                      width={16}
                      height={16}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded-sm"
                      loading="lazy"
                    />
                  ) : (
                    <span className="mt-0.5 h-4 w-4 shrink-0 rounded-sm bg-gray-200" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-normal text-gray-800 group-hover:text-gray-950">
                      {result.title}
                    </span>
                    {result.displayLink ? (
                      <span className="mt-0.5 block truncate text-xs text-gray-500">
                        {result.displayLink}
                      </span>
                    ) : null}
                  </span>
                  <ChevronRight
                    className={cn(
                      "mt-1 h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform",
                      isExpanded && "rotate-90",
                    )}
                  />
                </button>
                {isExpanded ? (
                  <div className="border-t border-gray-100 px-2.5 py-2">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                        Structure
                      </p>
                      <a
                        href={result.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-blue-600 hover:underline"
                        onClick={(event) => event.stopPropagation()}
                      >
                        Open
                      </a>
                    </div>
                    <ResultStructureOutline
                      headings={structure?.headings ?? []}
                      isLoading={structure?.isLoading ?? true}
                      error={structure?.error ?? null}
                    />
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : null}

      {isEmpty ? (
        <div className="py-2 text-xs text-gray-500">No results found</div>
      ) : null}
    </div>
  )
}

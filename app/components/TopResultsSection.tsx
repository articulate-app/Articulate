"use client"

import React, { useEffect, useMemo } from "react"
import { AlertCircle, RefreshCw } from "lucide-react"
import { Button } from "./ui/button"
import { type TopResult } from "../hooks/useTopResults"

interface TopResultsSectionProps {
  keyword: string
  languageId?: string | number
  regionId?: string | number
  results?: TopResult[]
  isLoading: boolean
  error?: string
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

export function TopResultsSection({
  results,
  isLoading,
  error,
  onRetry,
  onFetch,
}: TopResultsSectionProps) {
  useEffect(() => {
    if (!results && !isLoading && !error) {
      onFetch()
    }
  }, [results, isLoading, error, onFetch])

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
    <div className="pl-7">
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
        <ul className="space-y-3 py-1">
          {rows.map(({ result, favicon }, index) => (
            <li key={`${result.link}:${index}`}>
              <a
                href={result.link}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex min-w-0 items-center gap-2.5 rounded-md py-0.5 text-left transition-colors hover:bg-gray-50"
              >
                {favicon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={favicon}
                    alt=""
                    width={16}
                    height={16}
                    className="h-4 w-4 shrink-0 rounded-sm"
                    loading="lazy"
                  />
                ) : (
                  <span className="h-4 w-4 shrink-0 rounded-sm bg-gray-200" />
                )}
                <span className="min-w-0 flex-1 truncate text-sm font-normal text-gray-800 group-hover:text-gray-950">
                  {result.title}
                </span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}

      {isEmpty ? (
        <div className="py-2 text-xs text-gray-500">No results found</div>
      ) : null}
    </div>
  )
}

"use client"

import React, { useMemo, useState } from "react"
import { cn } from "../../app/lib/utils"
import {
  buildPresenceHeatmap,
  scrollArtifactPaneToQuote,
  scrollArtifactPaneToUrl,
  splitPreviewByQuery,
  type PresenceMatchMode,
} from "./keyword-presence-heatmap"

type KeywordPresenceHeatmapProps = {
  plainText: string
  /** Keyword phrase or URL / substring to locate. */
  keyword: string
  /** `keyword` uses word boundaries; `substring` matches URLs / free text. */
  matchMode?: PresenceMatchMode
  className?: string
}

function segmentTone(hitCount: number, maxHits: number): string {
  if (hitCount <= 0) return "bg-gray-100 hover:bg-gray-200"
  if (maxHits <= 1) return "bg-amber-400 hover:bg-amber-500"
  const ratio = hitCount / maxHits
  if (ratio >= 0.75) return "bg-amber-600 hover:bg-amber-700"
  if (ratio >= 0.4) return "bg-amber-500 hover:bg-amber-600"
  return "bg-amber-300 hover:bg-amber-400"
}

/**
 * Compact article presence map for an expanded keyword/link row:
 * strip of cells + clickable snippets that jump into the artifact pane.
 */
export function KeywordPresenceHeatmap({
  plainText,
  keyword,
  matchMode = "keyword",
  className,
}: KeywordPresenceHeatmapProps) {
  const segments = useMemo(
    () => buildPresenceHeatmap(plainText, keyword, matchMode),
    [plainText, keyword, matchMode],
  )
  const [activeId, setActiveId] = useState<string | null>(null)

  const maxHits = useMemo(
    () => segments.reduce((max, segment) => Math.max(max, segment.hitCount), 0),
    [segments],
  )
  const hitSegments = useMemo(
    () => segments.filter((segment) => segment.hitCount > 0),
    [segments],
  )

  if (segments.length === 0) {
    return (
      <p className={cn("text-[11px] text-gray-500", className)}>
        No article text to map yet.
      </p>
    )
  }

  const focusSegment = (id: string) => {
    const segment = segments.find((row) => row.id === id)
    if (!segment) return
    setActiveId(id)
    if (matchMode === "substring") {
      scrollArtifactPaneToUrl(keyword, segment.text)
      return
    }
    scrollArtifactPaneToQuote(segment.text)
  }

  const label = matchMode === "substring" ? "Link" : "Keyword"

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
          Presence in article
        </p>
        <p className="text-[11px] tabular-nums text-gray-500">
          {hitSegments.length}/{segments.length} sections
        </p>
      </div>

      <div
        className="flex h-8 w-full overflow-hidden rounded-md border border-gray-200 bg-gray-50"
        role="img"
        aria-label={`${label} heatmap for ${keyword}`}
      >
        {segments.map((segment) => (
          <button
            key={segment.id}
            type="button"
            title={
              segment.hitCount > 0
                ? `${segment.hitCount}× — ${segment.preview}`
                : segment.preview
            }
            aria-label={
              segment.hitCount > 0
                ? `${segment.hitCount} matches in section`
                : "No matches in section"
            }
            className={cn(
              "min-w-[3px] flex-1 border-r border-white/70 last:border-r-0 transition-colors",
              segmentTone(segment.hitCount, maxHits),
              activeId === segment.id && "ring-2 ring-inset ring-sky-500",
            )}
            onClick={() => focusSegment(segment.id)}
          />
        ))}
      </div>

      {hitSegments.length === 0 ? (
        <p className="text-[11px] text-gray-500">
          This {matchMode === "substring" ? "link" : "keyword"} does not appear in the
          current article text.
        </p>
      ) : (
        <ul className="max-h-40 space-y-1.5 overflow-y-auto">
          {hitSegments.slice(0, 8).map((segment) => {
            const parts = splitPreviewByQuery(segment.preview, keyword, matchMode)
            return (
              <li key={segment.id}>
                <button
                  type="button"
                  className={cn(
                    "w-full rounded-md border border-transparent px-2 py-1.5 text-left text-[11px] leading-relaxed text-gray-700 hover:border-gray-200 hover:bg-gray-50",
                    activeId === segment.id && "border-amber-200 bg-amber-50/70",
                  )}
                  onClick={() => focusSegment(segment.id)}
                >
                  <span className="mb-0.5 inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-amber-700">
                    {segment.hitCount}×
                  </span>{" "}
                  <span>
                    {parts.map((part, index) =>
                      part.hit ? (
                        <mark
                          key={`${segment.id}-${index}`}
                          className="rounded bg-amber-200/90 px-0.5 text-gray-900"
                        >
                          {part.text}
                        </mark>
                      ) : (
                        <span key={`${segment.id}-${index}`}>{part.text}</span>
                      ),
                    )}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

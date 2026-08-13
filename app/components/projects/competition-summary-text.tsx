"use client"

import { useMemo } from "react"
import { cn } from "@/lib/utils"
import {
  buildCompetitiveOverviewInsights,
  type SocialCompetitiveSummary,
} from "@/lib/project-social-summary"

type CompetitionSummaryTextProps = {
  summary: SocialCompetitiveSummary
  compact?: boolean
  className?: string
}

/**
 * Plain-language read-out of the competitive summary, so the period can be
 * understood without interpreting the radar, table and timeseries charts.
 */
export function CompetitionSummaryText({
  summary,
  compact = false,
  className,
}: CompetitionSummaryTextProps) {
  const insights = useMemo(
    () => buildCompetitiveOverviewInsights(summary),
    [summary],
  )

  const points = compact ? insights.points.slice(0, 3) : insights.points

  return (
    <div
      className={cn(
        "rounded-lg border border-gray-100 bg-white px-4 py-3",
        className,
      )}
    >
      <h3 className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
        Summary
      </h3>
      <p className="mt-1.5 text-sm font-medium text-gray-900">
        {insights.headline}
      </p>
      {points.length > 0 ? (
        <ul className="mt-2 space-y-1.5">
          {points.map((point) => (
            <li
              key={point}
              className="flex gap-2 text-xs leading-relaxed text-gray-600"
            >
              <span
                aria-hidden
                className="mt-[0.45rem] h-1 w-1 shrink-0 rounded-full bg-gray-300"
              />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

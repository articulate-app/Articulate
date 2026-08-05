"use client"

import { useMemo } from "react"
import { AlertCircle, Loader2 } from "lucide-react"
import { Card } from "../ui/card"
import type { ProjectSocialCompetitiveSummary } from "@/lib/services/project-social-analytics"
import { CompetitionTimeseriesChart } from "./competition-timeseries-chart"

const ENTITY_COLORS = [
  "#2563eb",
  "#059669",
  "#d97706",
  "#dc2626",
  "#0891b2",
  "#4b5563",
  "#7c2d12",
]

function formatCount(value: number | null | undefined): string {
  if (value == null) return "—"
  return new Intl.NumberFormat("en-US").format(Math.round(value))
}

type CompetitionCompareDashboardProps = {
  summary: ProjectSocialCompetitiveSummary | undefined
  isLoading: boolean
  error: Error | null
  onRetry?: () => void
}

export function CompetitionCompareDashboard({
  summary,
  isLoading,
  error,
  onRetry,
}: CompetitionCompareDashboardProps) {
  const entityMeta = useMemo(() => {
    const entities = summary?.entities ?? []
    return entities.map((entity, index) => ({
      ...entity,
      color: ENTITY_COLORS[index % ENTITY_COLORS.length]!,
      key: entity.entity_id.replace(/[^a-zA-Z0-9]/g, "_"),
    }))
  }, [summary])

  if (isLoading) {
    return (
      <div className="flex h-28 items-center justify-center text-sm text-gray-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading comparison…
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          Failed to load comparison.{" "}
          {onRetry ? (
            <button className="underline" onClick={onRetry}>
              Retry
            </button>
          ) : null}
        </div>
      </div>
    )
  }

  if (!summary) return null

  const hasPosts = summary.totals.posts_count > 0
  const hasTimeseries =
    summary.post_timeseries.length > 0 || summary.follower_timeseries.length > 0

  return (
    <div className="space-y-5">
      <Card className="overflow-x-auto p-0">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2">Entity</th>
              <th className="px-3 py-2">Posts</th>
              <th className="px-3 py-2">Likes</th>
              <th className="px-3 py-2">Comments</th>
              <th className="px-3 py-2">Shares</th>
              <th className="px-3 py-2">Median int.</th>
              <th className="px-3 py-2">Followers</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {entityMeta.map((entity) => {
              const delta = entity.followers_delta
              const followersLabel =
                entity.followers_latest == null && delta == null
                  ? "Insufficient data"
                  : [
                      entity.followers_latest != null
                        ? formatCount(entity.followers_latest)
                        : null,
                      delta != null
                        ? `${delta > 0 ? "+" : ""}${formatCount(delta)}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")

              return (
                <tr key={entity.entity_id}>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: entity.color }}
                      />
                      <span className="font-medium text-gray-900">
                        {entity.entity_name}
                      </span>
                      {entity.is_owned ? (
                        <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[11px] font-medium text-sky-700">
                          Our brand
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-3 py-3">{formatCount(entity.posts_count)}</td>
                  <td className="px-3 py-3">{formatCount(entity.reactions_total)}</td>
                  <td className="px-3 py-3">{formatCount(entity.comments_total)}</td>
                  <td className="px-3 py-3">{formatCount(entity.shares_total)}</td>
                  <td className="px-3 py-3">{formatCount(entity.interactions_median)}</td>
                  <td className="px-3 py-3 whitespace-nowrap tabular-nums">
                    {followersLabel}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>

      {!hasPosts && !hasTimeseries ? (
        <Card className="p-4 text-sm text-gray-500">
          No posts in this period to chart. Sync brand and competitor profiles first.
        </Card>
      ) : (
        <CompetitionTimeseriesChart
          summary={summary}
          defaultMetric="interactions"
          defaultInterval="week"
        />
      )}
    </div>
  )
}

"use client"

import { useMemo, useState } from "react"
import { AlertCircle, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { metricDelta } from "@/lib/competition-previous-period"
import { rankEntitiesByEngagement } from "@/lib/project-social-summary"
import { faviconUrlForSite } from "@/lib/favicon"
import type { ProjectSocialCompetitiveSummary } from "@/lib/services/project-social-analytics"
import type { ProjectSocialPost } from "@/lib/services/project-brand-social"
import { Switch } from "../ui/switch"
import { Label } from "../ui/label"
import { CompetitionRadarChart } from "./competition-radar-chart"
import { CompetitionTimeseriesChart } from "./competition-timeseries-chart"
import { CompetitionPostsFeed } from "./competition-posts-feed"
import type { ProjectCompetitorWithProfiles } from "@/lib/services/project-competitors"

function formatCount(value: number | null | undefined): string | null {
  if (value == null) return null
  return new Intl.NumberFormat("en-US").format(Math.round(value))
}

function DeltaHint({ delta }: { delta: number | null }) {
  if (delta == null) return null
  const isPositive = delta > 0
  const isNegative = delta < 0
  return (
    <span
      className={cn(
        "mt-0.5 block text-[10px] tabular-nums leading-tight",
        isPositive && "text-emerald-700",
        isNegative && "text-red-600",
        !isPositive && !isNegative && "text-gray-400",
      )}
    >
      {isPositive ? "+" : ""}
      {formatCount(delta)}
    </span>
  )
}

function MetricValue({
  value,
  delta = null,
  align = "right",
  showDelta = false,
}: {
  value: string | null
  delta?: number | null
  align?: "left" | "right"
  showDelta?: boolean
}) {
  if (value == null) {
    return (
      <span
        className={cn(
          "block text-xs text-gray-300",
          align === "right" ? "text-right" : "text-left",
        )}
      >
        –
      </span>
    )
  }
  return (
    <div className={cn(align === "right" ? "text-right" : "text-left")}>
      <span className="block text-xs font-medium tabular-nums text-gray-800">
        {value}
      </span>
      {showDelta ? <DeltaHint delta={delta} /> : null}
    </div>
  )
}

/** Whole-number followers + optional period delta (no fractional % chrome). */
function FollowersCell({
  entity,
  periodDelta,
  showPeriodDelta,
  align = "right",
}: {
  entity: {
    followers_latest: number | null
    followers_delta: number | null
  }
  periodDelta?: number | null
  showPeriodDelta?: boolean
  align?: "left" | "right"
}) {
  const latest = formatCount(entity.followers_latest)
  const delta = showPeriodDelta ? (periodDelta ?? null) : entity.followers_delta

  if (latest == null && delta == null) {
    return <MetricValue value={null} align={align} />
  }

  return (
    <div className={cn(align === "right" ? "text-right" : "text-left")}>
      {latest != null ? (
        <span className="block text-xs font-medium tabular-nums text-gray-800">
          {latest}
        </span>
      ) : null}
      <DeltaHint delta={delta} />
    </div>
  )
}

const ENTITY_COLORS = [
  "#2563eb",
  "#059669",
  "#d97706",
  "#dc2626",
  "#0891b2",
  "#4b5563",
]

type CompetitionOverviewPanelProps = {
  summary: ProjectSocialCompetitiveSummary | undefined
  isLoading: boolean
  error: Error | null
  compact?: boolean
  onRetry?: () => void
  recentPosts?: ProjectSocialPost[]
  recentPostsLoading?: boolean
  recentPostsError?: Error | null
  ownedEntityId?: string
  competitors?: ProjectCompetitorWithProfiles[]
  /** When provided with the toggle on, table shows deltas vs this period. */
  previousSummary?: ProjectSocialCompetitiveSummary | undefined
  previousSummaryLoading?: boolean
  comparePreviousPeriod?: boolean
  onComparePreviousPeriodChange?: (enabled: boolean) => void
}

export function CompetitionOverviewPanel({
  summary,
  isLoading,
  error,
  compact = false,
  onRetry,
  recentPosts = [],
  recentPostsLoading = false,
  recentPostsError = null,
  ownedEntityId = "",
  competitors = [],
  previousSummary,
  previousSummaryLoading = false,
  comparePreviousPeriod = false,
  onComparePreviousPeriodChange,
}: CompetitionOverviewPanelProps) {
  const [localCompare, setLocalCompare] = useState(false)
  const isCompareControlled = typeof onComparePreviousPeriodChange === "function"
  const showVsPrevious = isCompareControlled
    ? comparePreviousPeriod
    : localCompare

  const setShowVsPrevious = (enabled: boolean) => {
    if (isCompareControlled) onComparePreviousPeriodChange?.(enabled)
    else setLocalCompare(enabled)
  }

  const previousById = useMemo(() => {
    const map = new Map<
      string,
      ProjectSocialCompetitiveSummary["entities"][number]
    >()
    for (const entity of previousSummary?.entities ?? []) {
      map.set(entity.entity_id, entity)
    }
    return map
  }, [previousSummary])

  const faviconByEntityId = useMemo(() => {
    const map = new Map<string, string | null>()
    for (const competitor of competitors) {
      map.set(`competitor:${competitor.id}`, faviconUrlForSite(competitor.website_url))
    }
    return map
  }, [competitors])

  const entities = useMemo(() => {
    if (!summary) return []
    return rankEntitiesByEngagement(summary.entities).map((entity, index) => ({
      ...entity,
      color: ENTITY_COLORS[index % ENTITY_COLORS.length]!,
      favicon: faviconByEntityId.get(entity.entity_id) ?? null,
    }))
  }, [summary, faviconByEntityId])

  if (isLoading) {
    return (
      <div className="flex h-28 items-center justify-center text-sm text-gray-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading overview…
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          Failed to load competitive summary.{" "}
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

  const totalsPosts = summary.totals.posts_count
  const visibleEntities = entities.slice(0, compact ? 4 : undefined)
  const hasTimeseries =
    summary.post_timeseries.length > 0 || summary.follower_timeseries.length > 0
  const showDeltas = showVsPrevious && !previousSummaryLoading

  return (
    <div className={cn("space-y-4", compact && "space-y-3")}>
      <div
        className={cn(
          "min-w-0 overflow-hidden rounded-lg border border-gray-100 bg-white",
        )}
      >
        <div
          className={cn(
            "grid gap-0",
            compact
              ? "grid-cols-1"
              : "grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]",
          )}
        >
          <CompetitionRadarChart
            entities={summary.entities}
            totalsPosts={totalsPosts}
            compact={compact}
            bare
            showTitle={false}
            showLegend={false}
            faviconByEntityId={faviconByEntityId}
            className={cn(!compact && "xl:border-r xl:border-gray-100")}
          />

          <div className="min-w-0">
            {!compact ? (
              <div className="flex items-center justify-end gap-2 border-b border-gray-50 px-3 py-2">
                <Label
                  htmlFor="competition-vs-previous"
                  className="cursor-pointer text-[11px] font-normal text-gray-500"
                >
                  vs previous period
                </Label>
                <Switch
                  id="competition-vs-previous"
                  checked={showVsPrevious}
                  onCheckedChange={setShowVsPrevious}
                  className="scale-90"
                />
              </div>
            ) : null}

            {visibleEntities.length === 0 || totalsPosts === 0 ? (
              <p className="px-3 py-5 text-xs text-gray-500">
                No tracked posts in this period yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-[10px] font-medium uppercase tracking-wide text-gray-400">
                      <th className="px-3 py-2 font-medium">Brand</th>
                      <th className="px-2 py-2 text-right font-medium">Posts</th>
                      <th className="px-2 py-2 text-right font-medium">Likes</th>
                      <th className="px-2 py-2 text-right font-medium">
                        Comments
                      </th>
                      <th className="px-2 py-2 text-right font-medium">Shares</th>
                      <th className="px-3 py-2 text-right font-medium">
                        Followers
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleEntities.map((entity) => {
                      const prev = previousById.get(entity.entity_id)
                      return (
                        <tr
                          key={entity.entity_id}
                          className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60"
                        >
                          <td className="px-3 py-2">
                            <div className="flex min-w-0 items-center gap-2">
                              <span
                                className="h-1.5 w-1.5 shrink-0 rounded-full"
                                style={{ backgroundColor: entity.color }}
                              />
                              {entity.favicon ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={entity.favicon}
                                  alt=""
                                  width={16}
                                  height={16}
                                  loading="lazy"
                                  className="h-4 w-4 shrink-0 rounded-sm"
                                />
                              ) : null}
                              <span className="truncate font-medium text-gray-800">
                                {entity.entity_name}
                              </span>
                              {entity.is_owned ? (
                                <span className="shrink-0 text-[10px] font-normal text-sky-700">
                                  You
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-2 py-2">
                            <MetricValue
                              value={formatCount(entity.posts_count)}
                              showDelta={showDeltas}
                              delta={metricDelta(
                                entity.posts_count,
                                prev?.posts_count,
                              )}
                            />
                          </td>
                          <td className="px-2 py-2">
                            <MetricValue
                              value={formatCount(entity.reactions_total)}
                              showDelta={showDeltas}
                              delta={metricDelta(
                                entity.reactions_total,
                                prev?.reactions_total,
                              )}
                            />
                          </td>
                          <td className="px-2 py-2">
                            <MetricValue
                              value={formatCount(entity.comments_total)}
                              showDelta={showDeltas}
                              delta={metricDelta(
                                entity.comments_total,
                                prev?.comments_total,
                              )}
                            />
                          </td>
                          <td className="px-2 py-2">
                            <MetricValue
                              value={formatCount(entity.shares_total)}
                              showDelta={showDeltas}
                              delta={metricDelta(
                                entity.shares_total,
                                prev?.shares_total,
                              )}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <FollowersCell
                              entity={entity}
                              showPeriodDelta={showDeltas}
                              periodDelta={metricDelta(
                                entity.followers_latest,
                                prev?.followers_latest,
                              )}
                            />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {showVsPrevious && previousSummaryLoading ? (
                  <p className="px-3 py-2 text-[10px] text-gray-400">
                    Loading previous period…
                  </p>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>

      {!compact && hasTimeseries ? (
        <CompetitionTimeseriesChart
          summary={summary}
          defaultMetric="interactions"
          defaultInterval="week"
        />
      ) : null}

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-gray-900">Recent posts</h3>
        </div>
        <CompetitionPostsFeed
          projectId={summary.project_id}
          ownedEntityId={ownedEntityId}
          competitors={competitors}
          posts={recentPosts}
          isLoading={recentPostsLoading}
          error={recentPostsError}
          dateRange={{}}
          onDateRangeChange={() => {}}
          filterEntityId="all"
          onFilterEntityIdChange={() => {}}
          filterNetwork="all"
          onFilterNetworkChange={() => {}}
          getDefaultDateRange={() => ({})}
          hideFilters
          limitCards={compact ? 4 : 8}
        />
      </div>
    </div>
  )
}

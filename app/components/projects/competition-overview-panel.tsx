"use client"

import { useMemo, useState } from "react"
import { format } from "date-fns"
import { AlertCircle, ArrowRight, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { metricDelta, metricDeltaPct } from "@/lib/competition-previous-period"
import { rankEntitiesByEngagement } from "@/lib/project-social-summary"
import { faviconUrlForSite } from "@/lib/favicon"
import type { ProjectSocialCompetitiveSummary } from "@/lib/services/project-social-analytics"
import type { ProjectSocialPost } from "@/lib/services/project-brand-social"
import { Switch } from "../ui/switch"
import { Label } from "../ui/label"
import { CompetitionRadarChart } from "./competition-radar-chart"
import { CompetitionTimeseriesChart } from "./competition-timeseries-chart"
import { CompetitionPostsFeed } from "./competition-posts-feed"
import { CompetitionArticlesFeed } from "./competition-articles-feed"
import { CompetitionSummaryText } from "./competition-summary-text"
import type { ProjectCompetitorWithProfiles } from "@/lib/services/project-competitors"
import type {
  ArticleImpactSort,
  ProjectCompetitiveArticleImpact,
} from "@/lib/services/project-competitive-content"

function formatCount(value: number | null | undefined): string | null {
  if (value == null) return null
  return new Intl.NumberFormat("en-US").format(Math.round(value))
}

function formatPct(value: number): string {
  return `${Math.round(value)}%`
}

/**
 * Relative change vs the previous period. Growth from zero has no percentage,
 * so it reads as "new"; the absolute change stays available on hover.
 */
function DeltaHint({
  delta,
  deltaPct,
}: {
  delta: number | null
  deltaPct: number | null
}) {
  const hasPct = deltaPct != null
  const isNew = !hasPct && delta != null && delta > 0
  if (!hasPct && !isNew) return null

  const isPositive = hasPct ? deltaPct > 0 : true
  const isNegative = hasPct ? deltaPct < 0 : false

  return (
    <span
      title={
        delta != null
          ? `${delta > 0 ? "+" : ""}${formatCount(delta)} vs previous period`
          : undefined
      }
      className={cn(
        "mt-0.5 block text-[10px] tabular-nums leading-tight",
        isPositive && "text-emerald-700",
        isNegative && "text-red-600",
        !isPositive && !isNegative && "text-gray-400",
      )}
    >
      {isNew
        ? "new"
        : `${deltaPct! > 0 ? "+" : ""}${formatPct(deltaPct!)}`}
    </span>
  )
}

function MetricValue({
  value,
  current,
  previous,
  align = "right",
  showDelta = false,
}: {
  value: string | null
  current?: number | null
  previous?: number | null
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
      {showDelta ? (
        <DeltaHint
          delta={metricDelta(current, previous)}
          deltaPct={metricDeltaPct(current, previous)}
        />
      ) : null}
    </div>
  )
}

/** Whole-number followers + growth, either in-period or vs the previous period. */
function FollowersCell({
  entity,
  previousFollowers,
  showPeriodDelta,
  align = "right",
}: {
  entity: {
    followers_latest: number | null
    followers_delta: number | null
    followers_delta_pct: number | null
  }
  previousFollowers?: number | null
  showPeriodDelta?: boolean
  align?: "left" | "right"
}) {
  const latest = formatCount(entity.followers_latest)
  const delta = showPeriodDelta
    ? metricDelta(entity.followers_latest, previousFollowers)
    : entity.followers_delta
  const deltaPct = showPeriodDelta
    ? metricDeltaPct(entity.followers_latest, previousFollowers)
    : entity.followers_delta_pct

  if (latest == null && delta == null && deltaPct == null) {
    return <MetricValue value={null} align={align} />
  }

  return (
    <div className={cn(align === "right" ? "text-right" : "text-left")}>
      {latest != null ? (
        <span className="block text-xs font-medium tabular-nums text-gray-800">
          {latest}
        </span>
      ) : null}
      <DeltaHint delta={delta} deltaPct={deltaPct} />
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
  /** Jump to the Competition posts sub-tab from the recent posts strip. */
  onSeeAllPosts?: () => void
  recentArticles?: ProjectCompetitiveArticleImpact[]
  recentArticlesLoading?: boolean
  recentArticlesError?: Error | null
  onSeeAllArticles?: () => void
  articlesSort?: ArticleImpactSort
  onArticlesSortChange?: (value: ArticleImpactSort) => void
  /** Shared Competition period — drives the timeseries "over …" picker. */
  dateRange?: { from?: Date; to?: Date }
  onDateRangeChange?: (value: { from?: Date; to?: Date }) => void
  /** Shared network filter (header + recent posts). Refetches summary when changed. */
  filterNetwork?: string
  onFilterNetworkChange?: (value: string) => void
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
  onSeeAllPosts,
  recentArticles = [],
  recentArticlesLoading = false,
  recentArticlesError = null,
  onSeeAllArticles,
  articlesSort = "recent",
  onArticlesSortChange,
  dateRange,
  onDateRangeChange,
  filterNetwork = "all",
  onFilterNetworkChange,
}: CompetitionOverviewPanelProps) {
  const [localCompare, setLocalCompare] = useState(false)
  const [postsFilterEntityId, setPostsFilterEntityId] = useState("all")
  const [localFilterNetwork, setLocalFilterNetwork] = useState("all")
  const [localArticlesSort, setLocalArticlesSort] =
    useState<ArticleImpactSort>("recent")
  const articlesSortValue = onArticlesSortChange ? articlesSort : localArticlesSort
  const setArticlesSortValue = onArticlesSortChange ?? setLocalArticlesSort
  const isCompareControlled = typeof onComparePreviousPeriodChange === "function"
  const showVsPrevious = isCompareControlled
    ? comparePreviousPeriod
    : localCompare
  const isNetworkControlled = typeof onFilterNetworkChange === "function"
  const postsFilterNetwork = isNetworkControlled ? filterNetwork : localFilterNetwork
  const setPostsFilterNetwork = isNetworkControlled
    ? onFilterNetworkChange!
    : setLocalFilterNetwork

  const setShowVsPrevious = (enabled: boolean) => {
    if (isCompareControlled) onComparePreviousPeriodChange?.(enabled)
    else setLocalCompare(enabled)
  }

  const previousPeriodLabel = useMemo(() => {
    if (!previousSummary?.date_from || !previousSummary?.date_to) return null
    const from = new Date(previousSummary.date_from)
    const to = new Date(previousSummary.date_to)
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null
    return `${format(from, "d MMM")} – ${format(to, "d MMM")}`
  }, [previousSummary])

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
      <CompetitionSummaryText summary={summary} compact={compact} />

      <div className="min-w-0 overflow-hidden rounded-lg border border-gray-100 bg-white">
        <CompetitionRadarChart
          entities={summary.entities}
          totalsPosts={totalsPosts}
          compact={compact}
          bare
          showTitle={false}
          showLegend={false}
          faviconByEntityId={faviconByEntityId}
          className="border-b border-gray-100"
        />

        <div className="min-w-0">
          {!compact ? (
            <div className="flex items-center justify-end gap-2 border-b border-gray-50 px-3 py-2">
              <Label
                htmlFor="competition-vs-previous"
                className="cursor-pointer text-[11px] font-normal text-gray-500"
              >
                % vs previous period
                {previousPeriodLabel ? (
                  <span className="ml-1 text-gray-400">({previousPeriodLabel})</span>
                ) : null}
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
                    <th className="px-2 py-2 text-right font-medium">Comments</th>
                    <th className="px-2 py-2 text-right font-medium">Shares</th>
                    <th className="px-3 py-2 text-right font-medium">Followers</th>
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
                            current={entity.posts_count}
                            previous={prev?.posts_count}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <MetricValue
                            value={formatCount(entity.reactions_total)}
                            showDelta={showDeltas}
                            current={entity.reactions_total}
                            previous={prev?.reactions_total}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <MetricValue
                            value={formatCount(entity.comments_total)}
                            showDelta={showDeltas}
                            current={entity.comments_total}
                            previous={prev?.comments_total}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <MetricValue
                            value={formatCount(entity.shares_total)}
                            showDelta={showDeltas}
                            current={entity.shares_total}
                            previous={prev?.shares_total}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <FollowersCell
                            entity={entity}
                            showPeriodDelta={showDeltas}
                            previousFollowers={prev?.followers_latest}
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
              {showDeltas && !previousSummary ? (
                <p className="px-3 py-2 text-[10px] text-gray-400">
                  No comparable previous period for this date range.
                </p>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {!compact && hasTimeseries ? (
        <CompetitionTimeseriesChart
          summary={summary}
          defaultMetric="interactions"
          defaultInterval="week"
          dateRange={dateRange}
          onDateRangeChange={onDateRangeChange}
        />
      ) : null}

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-gray-900">Recent posts</h3>
          {onSeeAllPosts ? (
            <button
              type="button"
              onClick={onSeeAllPosts}
              className="inline-flex shrink-0 items-center gap-1 text-xs text-blue-600 hover:underline"
            >
              See all posts
              <ArrowRight className="h-3 w-3" />
            </button>
          ) : null}
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
          filterEntityId={postsFilterEntityId}
          onFilterEntityIdChange={setPostsFilterEntityId}
          filterNetwork={postsFilterNetwork}
          onFilterNetworkChange={setPostsFilterNetwork}
          getDefaultDateRange={() => ({})}
          hideFilters={false}
          hideDateRange
          hideSort={false}
          limitCards={compact ? 4 : 8}
        />
      </div>

      {!compact ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium text-gray-900">Recent articles</h3>
            {onSeeAllArticles ? (
              <button
                type="button"
                onClick={onSeeAllArticles}
                className="inline-flex shrink-0 items-center gap-1 text-xs text-blue-600 hover:underline"
              >
                See all articles
                <ArrowRight className="h-3 w-3" />
              </button>
            ) : null}
          </div>
          <CompetitionArticlesFeed
            projectId={summary.project_id}
            ownedEntityId={ownedEntityId}
            competitors={competitors}
            articles={recentArticles}
            isLoading={recentArticlesLoading}
            error={recentArticlesError}
            dateRange={{}}
            onDateRangeChange={() => {}}
            filterEntityId="all"
            onFilterEntityIdChange={() => {}}
            filterSourceType="all"
            onFilterSourceTypeChange={() => {}}
            sort={articlesSortValue}
            onSortChange={setArticlesSortValue}
            getDefaultDateRange={() => ({})}
            hideFilters
            hideDateRange
            limitCards={6}
            compact
          />
        </div>
      ) : null}
    </div>
  )
}

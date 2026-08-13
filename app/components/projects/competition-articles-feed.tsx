"use client"

import { useMemo } from "react"
import { format } from "date-fns"
import { AlertCircle, ExternalLink, Loader2 } from "lucide-react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Label } from "../ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip"
import {
  CONTENT_SOURCE_TYPE_LABELS,
  type ContentSourceType,
} from "@/lib/competitive-content"
import type {
  ArticleImpactSort,
  ArticleKeywordMetric,
  ProjectCompetitiveArticleImpact,
} from "@/lib/services/project-competitive-content"
import type { ProjectCompetitorWithProfiles } from "@/lib/services/project-competitors"
import { CHART_LINE_STROKE } from "./chart-date-range-footer"
import { cn } from "@/lib/utils"

const SORT_OPTIONS: { value: ArticleImpactSort; label: string }[] = [
  { value: "recent", label: "Most recent" },
  { value: "updated_oldest", label: "Last update (oldest)" },
  { value: "updated_newest", label: "Last update (newest)" },
  { value: "gsc_clicks", label: "GSC clicks" },
  { value: "gsc_impressions", label: "GSC impressions" },
  { value: "ga_views", label: "GA pageviews" },
  { value: "ga_sessions", label: "GA sessions" },
]

const numberFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
})

function formatMetric(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—"
  return numberFormatter.format(value)
}

function formatPosition(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—"
  return value.toFixed(1)
}

function formatDateLabel(value: string | null | undefined): string {
  if (!value) return "—"
  try {
    return format(new Date(value), "dd MMM yyyy")
  } catch {
    return "—"
  }
}

function shortTitle(title: string | null | undefined, fallback: string): string {
  const text = (title?.trim() || fallback).replace(/\s+/g, " ")
  return text.length > 28 ? `${text.slice(0, 28)}…` : text
}

function KeywordCell({
  keywords,
  primaryKeyword,
}: {
  keywords: ArticleKeywordMetric[]
  primaryKeyword: string | null
}) {
  const ordered =
    keywords.length > 0
      ? keywords
      : primaryKeyword
        ? [
            {
              keyword: primaryKeyword,
              keyword_type: "inferred_primary",
              search_volume: null,
              competition: null,
              ranking_position: null,
              clicks: null,
              impressions: null,
            } satisfies ArticleKeywordMetric,
          ]
        : []

  const primary =
    ordered.find((item) => item.keyword_type === "inferred_primary") ?? ordered[0]
  if (!primary) return <span className="text-gray-400">—</span>

  const extras = ordered.filter((item) => item.keyword !== primary.keyword)
  const hoverLines = ordered.map((item) => {
    const sv = formatMetric(item.search_volume)
    const kd =
      item.competition != null && Number.isFinite(item.competition)
        ? String(Math.round(item.competition))
        : "—"
    return `${item.keyword} · SV ${sv} · KD ${kd}`
  })

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="min-w-0 cursor-default">
            <div className="truncate text-xs text-gray-900" title={primary.keyword}>
              {primary.keyword}
              {extras.length > 0 ? (
                <span className="ml-1 text-[11px] text-gray-400">+{extras.length}</span>
              ) : null}
            </div>
            <div className="text-[11px] tabular-nums text-gray-500">
              SV {formatMetric(primary.search_volume)}
              {primary.competition != null
                ? ` · KD ${Math.round(primary.competition)}`
                : ""}
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          className="max-w-xs border border-gray-200 bg-white px-3 py-2 text-xs text-gray-800 shadow-md"
        >
          <div className="space-y-1">
            {hoverLines.map((line) => (
              <div key={line}>{line}</div>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function ArticlesImpactCharts({
  articles,
}: {
  articles: ProjectCompetitiveArticleImpact[]
}) {
  const owned = articles.filter((article) => article.is_owned)
  const clicksData = useMemo(
    () =>
      [...owned]
        .sort((a, b) => (b.gsc_clicks ?? 0) - (a.gsc_clicks ?? 0))
        .slice(0, 8)
        .map((article) => ({
          name: shortTitle(article.title, article.canonical_url),
          clicks: Number(article.gsc_clicks ?? 0),
          impressions: Number(article.gsc_impressions ?? 0),
        })),
    [owned],
  )
  const viewsData = useMemo(
    () =>
      [...owned]
        .sort((a, b) => (b.ga_pageviews ?? 0) - (a.ga_pageviews ?? 0))
        .slice(0, 8)
        .map((article) => ({
          name: shortTitle(article.title, article.canonical_url),
          views: Number(article.ga_pageviews ?? 0),
          sessions: Number(article.ga_sessions ?? 0),
        })),
    [owned],
  )

  if (owned.length === 0) return null

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <div className="rounded-md border border-gray-200 p-3">
        <div className="mb-2">
          <h4 className="text-sm font-semibold text-gray-900">Search clicks</h4>
          <p className="text-[11px] text-gray-500">
            Top owned articles by Google Search Console clicks in the selected period.
          </p>
        </div>
        <div className="h-52">
          {clicksData.every((row) => row.clicks === 0) ? (
            <div className="flex h-full items-center justify-center text-xs text-gray-500">
              No Search Console clicks for these articles in this period.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={clicksData} margin={{ top: 8, right: 8, left: 0, bottom: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="name"
                  stroke="#6b7280"
                  style={{ fontSize: "10px" }}
                  interval={0}
                  angle={-20}
                  textAnchor="end"
                  height={48}
                />
                <YAxis width={36} stroke="#6b7280" style={{ fontSize: "11px" }} />
                <RechartsTooltip
                  formatter={(value: number, name: string) => [
                    formatMetric(value),
                    name === "clicks" ? "Clicks" : "Impressions",
                  ]}
                />
                <Bar dataKey="clicks" fill={CHART_LINE_STROKE} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="rounded-md border border-gray-200 p-3">
        <div className="mb-2">
          <h4 className="text-sm font-semibold text-gray-900">Analytics pageviews</h4>
          <p className="text-[11px] text-gray-500">
            Top owned articles by Google Analytics pageviews in the selected period.
          </p>
        </div>
        <div className="h-52">
          {viewsData.every((row) => row.views === 0) ? (
            <div className="flex h-full items-center justify-center text-xs text-gray-500">
              No Analytics pageviews for these articles in this period.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={viewsData} margin={{ top: 8, right: 8, left: 0, bottom: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="name"
                  stroke="#6b7280"
                  style={{ fontSize: "10px" }}
                  interval={0}
                  angle={-20}
                  textAnchor="end"
                  height={48}
                />
                <YAxis width={36} stroke="#6b7280" style={{ fontSize: "11px" }} />
                <RechartsTooltip
                  formatter={(value: number, name: string) => [
                    formatMetric(value),
                    name === "views" ? "Pageviews" : "Sessions",
                  ]}
                />
                <Bar dataKey="views" fill={CHART_LINE_STROKE} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  )
}

export function CompetitionArticlesFeed({
  ownedEntityId,
  competitors,
  articles,
  isLoading,
  error,
  filterEntityId,
  onFilterEntityIdChange,
  filterSourceType,
  onFilterSourceTypeChange,
  sort,
  onSortChange,
  hideFilters = false,
  limitCards,
  compact = false,
}: {
  projectId: number
  ownedEntityId: string
  competitors: ProjectCompetitorWithProfiles[]
  articles: ProjectCompetitiveArticleImpact[]
  isLoading: boolean
  error: Error | null
  /** @deprecated Period is controlled by the Competition tab header DateRangePicker. */
  dateRange?: { from?: Date; to?: Date }
  onDateRangeChange?: (value: { from?: Date; to?: Date }) => void
  filterEntityId: string
  onFilterEntityIdChange: (value: string) => void
  filterSourceType: string
  onFilterSourceTypeChange: (value: string) => void
  sort: ArticleImpactSort
  onSortChange: (value: ArticleImpactSort) => void
  getDefaultDateRange?: () => { from?: Date; to?: Date }
  hideFilters?: boolean
  hideDateRange?: boolean
  limitCards?: number
  compact?: boolean
}) {
  const visibleArticles =
    typeof limitCards === "number" ? articles.slice(0, limitCards) : articles

  const sortSelect = (
    <div className="min-w-[160px] flex-1 basis-[180px] sm:max-w-[220px] sm:flex-none">
      <Label className="text-xs text-gray-500">Sort by</Label>
      <Select
        value={sort === "impact" ? "gsc_clicks" : sort}
        onValueChange={(value) => onSortChange(value as ArticleImpactSort)}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Sort" />
        </SelectTrigger>
        <SelectContent>
          {SORT_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )

  return (
    <div className="space-y-4">
      {!hideFilters ? (
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[140px] flex-1 basis-[160px] sm:max-w-[200px] sm:flex-none">
            <Label className="text-xs text-gray-500">Entity</Label>
            <Select value={filterEntityId} onValueChange={onFilterEntityIdChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Entity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All entities</SelectItem>
                <SelectItem value={ownedEntityId}>Our brand</SelectItem>
                {competitors.map((competitor) => (
                  <SelectItem key={competitor.id} value={`competitor:${competitor.id}`}>
                    {competitor.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[120px] flex-1 basis-[140px] sm:max-w-[160px] sm:flex-none">
            <Label className="text-xs text-gray-500">Source type</Label>
            <Select value={filterSourceType} onValueChange={onFilterSourceTypeChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                {Object.entries(CONTENT_SOURCE_TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {sortSelect}
        </div>
      ) : (
        <div className="flex justify-end">{sortSelect}</div>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading articles…
        </div>
      ) : error ? (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error.message || "Failed to load articles."}</span>
        </div>
      ) : visibleArticles.length === 0 ? (
        <div className="rounded-md border border-dashed border-gray-200 px-4 py-10 text-center text-sm text-gray-500">
          No articles found in this period.
          <p className="mt-1 text-xs text-gray-400">
            Confirm editorial sources and run a content sync to populate the feed.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <ArticlesImpactCharts articles={visibleArticles} />

          <div className="overflow-x-auto rounded-md border border-gray-200">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Article</th>
                  <th className="px-3 py-2 font-medium">Published</th>
                  <th className="px-3 py-2 font-medium">Updated</th>
                  <th className="px-3 py-2 font-medium">Keywords</th>
                  {!compact ? (
                    <>
                      <th className="px-3 py-2 font-medium tabular-nums">GSC clicks</th>
                      <th className="px-3 py-2 font-medium tabular-nums">GSC impr.</th>
                      <th className="px-3 py-2 font-medium tabular-nums">Pos.</th>
                      <th className="px-3 py-2 font-medium tabular-nums">GA views</th>
                      <th className="px-3 py-2 font-medium tabular-nums">Sessions</th>
                    </>
                  ) : (
                    <>
                      <th className="px-3 py-2 font-medium tabular-nums">Clicks</th>
                      <th className="px-3 py-2 font-medium tabular-nums">Views</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visibleArticles.map((article) => {
                  const hasPublished = Boolean(article.published_at)
                  const publishedLabel = hasPublished
                    ? formatDateLabel(article.published_at)
                    : "—"
                  const updatedLabel = article.modified_at
                    ? formatDateLabel(article.modified_at)
                    : "—"
                  const sourceLabel = article.content_source_type
                    ? CONTENT_SOURCE_TYPE_LABELS[
                        article.content_source_type as ContentSourceType
                      ] ?? article.content_source_type
                    : null

                  return (
                    <tr key={article.id} className="align-top hover:bg-gray-50/80">
                      <td className="px-3 py-2.5">
                        <div className="flex min-w-[260px] max-w-[360px] gap-3">
                          <div className="relative h-14 w-20 shrink-0 overflow-hidden rounded bg-gray-100">
                            {article.image_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={article.image_url}
                                alt=""
                                className="absolute inset-0 h-full w-full object-cover"
                              />
                            ) : null}
                          </div>
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-medium text-gray-900">
                                {article.entity_name ?? "—"}
                              </span>
                              {article.is_owned ? (
                                <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700">
                                  Our brand
                                </span>
                              ) : null}
                            </div>
                            <a
                              href={article.url}
                              target="_blank"
                              rel="noreferrer"
                              className="group inline-flex items-start gap-1 font-semibold text-gray-900 hover:underline"
                            >
                              <span className="line-clamp-2">
                                {article.title?.trim() || article.canonical_url}
                              </span>
                              <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 opacity-0 transition group-hover:opacity-60" />
                            </a>
                            <div className="text-[11px] text-gray-500">
                              {[sourceLabel, article.language_code]
                                .filter(Boolean)
                                .join(" · ")}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-gray-600">
                        {publishedLabel}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-gray-600">
                        {updatedLabel}
                      </td>
                      <td className="px-3 py-2.5">
                        <KeywordCell
                          keywords={article.keywords}
                          primaryKeyword={article.primary_keyword}
                        />
                      </td>
                      {!compact ? (
                        <>
                          <td
                            className={cn(
                              "px-3 py-2.5 tabular-nums",
                              article.is_owned ? "text-gray-900" : "text-gray-400",
                            )}
                          >
                            {article.is_owned ? formatMetric(article.gsc_clicks) : "—"}
                          </td>
                          <td
                            className={cn(
                              "px-3 py-2.5 tabular-nums",
                              article.is_owned ? "text-gray-900" : "text-gray-400",
                            )}
                          >
                            {article.is_owned
                              ? formatMetric(article.gsc_impressions)
                              : "—"}
                          </td>
                          <td
                            className={cn(
                              "px-3 py-2.5 tabular-nums",
                              article.is_owned ? "text-gray-900" : "text-gray-400",
                            )}
                          >
                            {article.is_owned
                              ? formatPosition(article.gsc_position)
                              : "—"}
                          </td>
                          <td
                            className={cn(
                              "px-3 py-2.5 tabular-nums",
                              article.is_owned ? "text-gray-900" : "text-gray-400",
                            )}
                          >
                            {article.is_owned
                              ? formatMetric(article.ga_pageviews)
                              : "—"}
                          </td>
                          <td
                            className={cn(
                              "px-3 py-2.5 tabular-nums",
                              article.is_owned ? "text-gray-900" : "text-gray-400",
                            )}
                          >
                            {article.is_owned ? formatMetric(article.ga_sessions) : "—"}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-2.5 tabular-nums text-gray-900">
                            {article.is_owned ? formatMetric(article.gsc_clicks) : "—"}
                          </td>
                          <td className="px-3 py-2.5 tabular-nums text-gray-900">
                            {article.is_owned
                              ? formatMetric(article.ga_pageviews)
                              : "—"}
                          </td>
                        </>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p className="border-t border-gray-100 px-3 py-2 text-[11px] text-gray-500">
              GSC and Analytics metrics apply to your own articles (URL match) for the
              selected period. Competitor rows show content and keywords only.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

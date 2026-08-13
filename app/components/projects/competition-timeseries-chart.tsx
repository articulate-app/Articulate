"use client"

import { useMemo, useState } from "react"
import { ChevronDown } from "lucide-react"
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Card } from "../ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select"
import { Label } from "../ui/label"
import { cn } from "@/lib/utils"
import type { ProjectSocialCompetitiveSummary } from "@/lib/services/project-social-analytics"
import {
  buildGroupedSeries,
  formatChartIntervalLabel,
  type ChartInterval,
} from "./competition-chart-intervals"
import { CompetitionPeriodSelect } from "./competition-period-select"

const ENTITY_COLORS = [
  "#2563eb",
  "#059669",
  "#d97706",
  "#dc2626",
  "#0891b2",
  "#4b5563",
  "#7c2d12",
]

export type CompetitionTimeseriesMetric =
  | "posts"
  | "interactions"
  | "impressions"
  | "followers"

const METRIC_LABELS: Record<CompetitionTimeseriesMetric, string> = {
  posts: "Posts",
  interactions: "Interactions",
  impressions: "Impressions",
  followers: "Followers",
}

type DateRangeValue = {
  from?: Date
  to?: Date
}

type CompetitionTimeseriesChartProps = {
  summary: ProjectSocialCompetitiveSummary
  compact?: boolean
  className?: string
  /** When false, omit outer card chrome (for embedding). */
  bordered?: boolean
  defaultMetric?: CompetitionTimeseriesMetric
  defaultInterval?: ChartInterval
  showLegend?: boolean
  /** Chart-local period control (dashed "over …" picker). */
  dateRange?: DateRangeValue
  onDateRangeChange?: (value: DateRangeValue) => void
}

export function CompetitionTimeseriesChart({
  summary,
  compact = false,
  className,
  bordered = true,
  defaultMetric = "interactions",
  defaultInterval = "week",
  showLegend = true,
  dateRange,
  onDateRangeChange,
}: CompetitionTimeseriesChartProps) {
  const [metric, setMetric] = useState<CompetitionTimeseriesMetric>(defaultMetric)
  const [interval, setInterval] = useState<ChartInterval>(defaultInterval)

  const entityMeta = useMemo(
    () =>
      summary.entities.map((entity, index) => ({
        ...entity,
        color: ENTITY_COLORS[index % ENTITY_COLORS.length]!,
        key: entity.entity_id.replace(/[^a-zA-Z0-9]/g, "_"),
      })),
    [summary.entities],
  )

  const chartData = useMemo(() => {
    if (metric === "followers") {
      return buildGroupedSeries({
        points: summary.follower_timeseries.map((point) => ({
          date: String(point.date),
          entity_id: point.entity_id,
          value: point.followers_count,
        })),
        entityMeta,
        interval,
        mode: "last",
      })
    }

    return buildGroupedSeries({
      points: summary.post_timeseries.map((point) => ({
        date: String(point.date),
        entity_id: point.entity_id,
        value:
          metric === "posts"
            ? point.posts_count
            : metric === "impressions"
              ? point.views_total
              : point.interactions_total,
      })),
      entityMeta,
      interval,
      mode: "sum",
    })
  }, [summary, entityMeta, interval, metric])

  // Owned-brand snapshots are sparser than competitor ones, so a series can end
  // up with a single bucket — which a dot-less line renders as nothing at all.
  const pointCountByKey = useMemo(() => {
    const counts = new Map<string, number>()
    for (const row of chartData) {
      for (const entity of entityMeta) {
        if (typeof row[entity.key] !== "number") continue
        counts.set(entity.key, (counts.get(entity.key) ?? 0) + 1)
      }
    }
    return counts
  }, [chartData, entityMeta])

  const tickFormatter = (value: string) => formatChartIntervalLabel(value, interval)
  const emptyLabel =
    metric === "followers"
      ? "Insufficient follower snapshot data."
      : metric === "interactions"
        ? "No interaction metrics available."
        : metric === "impressions"
          ? "No impression metrics available for these networks."
          : "No posts in this period."

  const showPeriodControl = Boolean(dateRange && onDateRangeChange)

  const body = (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm font-medium text-gray-900">
          <Select
            value={metric}
            onValueChange={(value) => setMetric(value as CompetitionTimeseriesMetric)}
          >
            <SelectTrigger
              id="competition-ts-metric"
              aria-label="Change metric"
              title="Change metric"
              hideDropdownIcon
              className="group h-auto w-auto gap-1 rounded-sm border-0 bg-transparent p-0 text-sm font-medium text-gray-900 ring-offset-0 focus:ring-0 focus:ring-offset-0 focus-visible:ring-2 focus-visible:ring-gray-300 [&>span]:line-clamp-none"
            >
              <span className="underline decoration-gray-400 decoration-dashed underline-offset-4 transition-colors group-hover:decoration-gray-700">
                {METRIC_LABELS[metric]}
              </span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400 transition-colors group-hover:text-gray-600" />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(METRIC_LABELS) as CompetitionTimeseriesMetric[]).map(
                (key) => (
                  <SelectItem key={key} value={key}>
                    {METRIC_LABELS[key]}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
          {showPeriodControl ? (
            <>
              <span className="text-gray-500">over</span>
              <CompetitionPeriodSelect
                variant="dashed"
                value={dateRange!}
                onChange={onDateRangeChange!}
              />
            </>
          ) : (
            <span className="text-gray-500">over time</span>
          )}
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor="competition-ts-interval" className="sr-only">
            Interval
          </Label>
          <Select
            value={interval}
            onValueChange={(value) => setInterval(value as ChartInterval)}
          >
            <SelectTrigger id="competition-ts-interval" className="h-8 w-[110px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Day</SelectItem>
              <SelectItem value="week">Week</SelectItem>
              <SelectItem value="month">Month</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className={cn(compact ? "h-64" : "h-72 md:h-80")}>
        {chartData.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-500">
            {emptyLabel}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="date"
                tickFormatter={tickFormatter}
                tick={{ fontSize: 11 }}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11 }}
                tickFormatter={(value) =>
                  typeof value === "number"
                    ? new Intl.NumberFormat("en-US", {
                        notation: value >= 1000 ? "compact" : "standard",
                        maximumFractionDigits: 0,
                      }).format(value)
                    : String(value)
                }
              />
              <RechartsTooltip
                labelFormatter={tickFormatter}
                formatter={(value: number, name: string) => [
                  new Intl.NumberFormat("en-US").format(Math.round(value)),
                  name,
                ]}
              />
              {showLegend ? <Legend /> : null}
              {entityMeta.map((entity) => {
                const pointCount = pointCountByKey.get(entity.key) ?? 0
                return (
                  <Line
                    key={entity.key}
                    type="monotone"
                    dataKey={entity.key}
                    name={
                      entity.is_owned
                        ? `${entity.entity_name} (you)`
                        : entity.entity_name
                    }
                    stroke={entity.color}
                    strokeWidth={entity.is_owned ? 2.5 : 2}
                    connectNulls
                    dot={pointCount <= 2 ? { r: 3, fill: entity.color } : false}
                    activeDot={{ r: 4 }}
                  />
                )
              })}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </>
  )

  if (!bordered) {
    return <div className={cn("min-w-0", className)}>{body}</div>
  }

  return <Card className={cn("p-4", className)}>{body}</Card>
}

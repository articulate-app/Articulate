"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { format, subDays } from "date-fns"
import { Loader2 } from "lucide-react"
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Button } from "../ui/button"
import { Card } from "../ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select"
import { ProjectGoogleIntegrationsSection } from "./project-google-integrations-section"
import {
  getProjectSearchOverview,
  searchMetricDeltas,
  syncProjectSearchConsole,
  type SearchOverviewResponse,
} from "@/lib/services/project-search-console"
import { toast } from "../ui/use-toast"

type PeriodKey = "7" | "28" | "30" | "90" | "365"
type MetricKey = "clicks" | "impressions" | "ctr" | "position_avg"

const numberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 })
const percentFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 1,
})
const positionFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 })

function formatMetric(key: MetricKey, value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—"
  if (key === "ctr") return percentFormatter.format(value)
  if (key === "position_avg") return positionFormatter.format(value)
  return numberFormatter.format(value)
}

function DeltaText({
  delta,
  pct,
  invert = false,
}: {
  delta: number | null
  pct: number | null
  invert?: boolean
}) {
  if (delta == null) return <span className="text-xs text-gray-400">vs prior —</span>
  const improved = invert ? delta < 0 : delta > 0
  const worsened = invert ? delta > 0 : delta < 0
  const color = improved
    ? "text-green-700"
    : worsened
    ? "text-red-700"
    : "text-gray-500"
  const sign = delta > 0 ? "+" : ""
  return (
    <span className={`text-xs ${color}`}>
      {sign}
      {numberFormatter.format(Math.round(delta))}
      {pct != null ? ` (${sign}${Math.round(pct)}%)` : ""} vs prior
    </span>
  )
}

function MetricCard({
  label,
  metricKey,
  value,
  delta,
  pct,
  tooltip,
}: {
  label: string
  metricKey: MetricKey
  value: number | null | undefined
  delta: number | null
  pct: number | null
  tooltip: string
}) {
  return (
    <div className="rounded-md border border-gray-200 bg-white p-3" title={tooltip}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold text-gray-900">
        {formatMetric(metricKey, value)}
      </p>
      <div className="mt-1">
        <DeltaText
          delta={delta}
          pct={pct}
          invert={metricKey === "position_avg"}
        />
      </div>
    </div>
  )
}

function CompactTable({
  title,
  rows,
  labelKey,
}: {
  title: string
  rows: Array<Record<string, unknown>>
  labelKey: "query" | "page"
}) {
  return (
    <div className="rounded-md border border-gray-200">
      <div className="border-b bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700">
        {title}
      </div>
      {rows.length === 0 ? (
        <p className="px-3 py-6 text-center text-xs text-gray-500">No data for this period.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="text-[11px] uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2">{labelKey === "query" ? "Query" : "Page"}</th>
                <th className="px-3 py-2 text-right">Clicks</th>
                <th className="px-3 py-2 text-right">Impr.</th>
                <th className="px-3 py-2 text-right">CTR</th>
                <th className="px-3 py-2 text-right">Pos.</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={String(row[labelKey])} className="border-t">
                  <td className="max-w-[220px] truncate px-3 py-2 text-gray-900" title={String(row[labelKey])}>
                    {String(row[labelKey])}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {formatMetric("clicks", Number(row.clicks))}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {formatMetric("impressions", Number(row.impressions))}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {formatMetric("ctr", row.ctr == null ? null : Number(row.ctr))}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {formatMetric(
                      "position_avg",
                      row.position_avg == null ? null : Number(row.position_avg),
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export function ProjectSearchOverviewSection({
  projectId,
  variant = "full",
  onOpenSeoTab,
  onOpenIntegrations,
}: {
  projectId: number
  variant?: "full" | "preview"
  onOpenSeoTab?: () => void
  onOpenIntegrations?: () => void
}) {
  const [period, setPeriod] = useState<PeriodKey>("28")
  const [metric, setMetric] = useState<MetricKey>("clicks")
  const [isSyncingBackfill, setIsSyncingBackfill] = useState(false)

  const range = useMemo(() => {
    const to = subDays(new Date(), 1)
    const days = Number(period)
    const from = subDays(to, days - 1)
    return { from, to }
  }, [period])

  const overviewQuery = useQuery<SearchOverviewResponse>({
    queryKey: [
      "project-search-overview",
      projectId,
      format(range.from, "yyyy-MM-dd"),
      format(range.to, "yyyy-MM-dd"),
    ],
    queryFn: () =>
      getProjectSearchOverview({
        projectId,
        dateFrom: range.from,
        dateTo: range.to,
        searchType: "web",
        limit: variant === "preview" ? 5 : 10,
      }),
  })

  const data = overviewQuery.data
  const deltas = searchMetricDeltas(data?.current, data?.previous)

  if (overviewQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading organic search…
      </div>
    )
  }

  if (overviewQuery.error) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
        Could not load Search Console overview. Deploy the latest migrations if this persists.
      </div>
    )
  }

  if (!data?.connected) {
    return (
      <Card className="space-y-3 border-dashed p-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Organic search performance</h3>
          <p className="mt-1 text-sm text-gray-600">
            Connect Google Search Console to track impressions, clicks, queries, pages and
            indexation.
          </p>
        </div>
        <ProjectGoogleIntegrationsSection
          projectId={projectId}
          compact
          autoOpenGsc
          onConnected={() => {
            void overviewQuery.refetch()
            onOpenIntegrations?.()
          }}
        />
      </Card>
    )
  }

  const chartData = (data.timeseries ?? []).map((point) => ({
    ...point,
    label: point.date.slice(5),
    value:
      metric === "ctr"
        ? (point.ctr ?? null)
        : metric === "position_avg"
        ? (point.position_avg ?? null)
        : Number(point[metric] ?? 0),
  }))

  const indexation = data.indexation ?? {}

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Organic search performance</h3>
          <p className="mt-1 text-xs text-gray-500">
            Source: Google Search Console
            {data.latest_metric_date
              ? ` · latest data ${data.latest_metric_date}`
              : ""}
            {data.last_synced_at
              ? ` · synced ${new Date(data.last_synced_at).toLocaleString()}`
              : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={period} onValueChange={(value) => setPeriod(value as PeriodKey)}>
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="28">Last 28 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="365">Last 12 months</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {data.property?.backfill_status
        && data.property.backfill_status !== "completed" ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <span>
            Historical sync is in progress ({data.property.backfill_status}). Overview updates as
            data arrives.
          </span>
          {data.property.backfill_status === "queued"
            || data.property.backfill_status === "partial"
            || data.property.backfill_status === "failed"
            || !data.property.last_synced_at ? (
            <Button
              size="sm"
              variant="outline"
              className="h-7 border-amber-300 bg-white text-xs text-amber-900"
              disabled={isSyncingBackfill}
              onClick={() => {
                setIsSyncingBackfill(true)
                void syncProjectSearchConsole({
                  projectId,
                  jobType: "backfill",
                  trigger: "manual",
                })
                  .then((result) => {
                    if (!result.ok) {
                      throw new Error(result.error || "Search Console sync failed")
                    }
                    toast({ title: "Search Console sync started" })
                    void overviewQuery.refetch()
                  })
                  .catch((error) => {
                    toast({
                      title: "Search Console sync failed",
                      description:
                        error instanceof Error ? error.message : "Unknown error",
                      variant: "destructive",
                    })
                  })
                  .finally(() => setIsSyncingBackfill(false))
              }}
            >
              {isSyncingBackfill
                ? "Starting…"
                : data.property.backfill_status === "partial"
                  ? "Continue sync"
                  : "Start sync"}
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Clicks"
          metricKey="clicks"
          value={data.current?.clicks}
          delta={deltas.clicks.delta}
          pct={deltas.clicks.pct}
          tooltip="Sum of clicks in the selected period. CTR = clicks ÷ impressions."
        />
        <MetricCard
          label="Impressions"
          metricKey="impressions"
          value={data.current?.impressions}
          delta={deltas.impressions.delta}
          pct={deltas.impressions.pct}
          tooltip="Sum of impressions in the selected period."
        />
        <MetricCard
          label="CTR"
          metricKey="ctr"
          value={data.current?.ctr}
          delta={deltas.ctr.delta}
          pct={deltas.ctr.pct}
          tooltip="Period CTR = total clicks ÷ total impressions (not an average of daily CTRs)."
        />
        <MetricCard
          label="Avg. position"
          metricKey="position_avg"
          value={data.current?.position_avg}
          delta={deltas.position.delta}
          pct={deltas.position.pct}
          tooltip="Impression-weighted average position. Lower is better."
        />
      </div>

      <Card className="p-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-gray-700">Trend</p>
          <Select value={metric} onValueChange={(value) => setMetric(value as MetricKey)}>
            <SelectTrigger className="h-8 w-[150px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="clicks">Clicks</SelectItem>
              <SelectItem value="impressions">Impressions</SelectItem>
              <SelectItem value="ctr">CTR</SelectItem>
              <SelectItem value="position_avg">Avg. position</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="h-48">
          {chartData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-gray-500">
              No Search Console data for this period yet.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis
                  tick={{ fontSize: 10 }}
                  reversed={metric === "position_avg"}
                  domain={metric === "ctr" ? [0, "auto"] : ["auto", "auto"]}
                />
                <Tooltip
                  formatter={(value: number) => formatMetric(metric, value)}
                  labelFormatter={(label) => String(label)}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#111827"
                  strokeWidth={2}
                  dot={false}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
        {metric === "position_avg" ? (
          <p className="mt-2 text-[11px] text-gray-500">
            Chart is inverted for position: lower values appear higher (improvement).
          </p>
        ) : null}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <CompactTable
          title="Top queries"
          rows={(data.top_queries ?? []) as Array<Record<string, unknown>>}
          labelKey="query"
        />
        <CompactTable
          title="Top pages"
          rows={(data.top_pages ?? []) as Array<Record<string, unknown>>}
          labelKey="page"
        />
      </div>

      {variant === "full" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <CompactTable
            title="High impressions, low CTR"
            rows={(data.opportunities?.high_impressions_low_ctr ?? []) as Array<Record<string, unknown>>}
            labelKey="query"
          />
          <CompactTable
            title="Positions 4–20"
            rows={(data.opportunities?.positions_4_to_20 ?? []) as Array<Record<string, unknown>>}
            labelKey="query"
          />
        </div>
      ) : null}

      <Card className="p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <h4 className="text-sm font-semibold text-gray-900">
              Monitored page indexation
            </h4>
            <p className="mt-1 text-xs text-gray-500">
              Covers pages monitored by the project only — not the full site index.
            </p>
          </div>
          {onOpenSeoTab ? (
            <Button size="sm" variant="ghost" onClick={onOpenSeoTab}>
              View details
            </Button>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ["Monitored", indexation.monitored_pages],
            ["Indexed", indexation.indexed],
            ["Not indexed", indexation.not_indexed],
            ["With issues", indexation.with_issues],
            ["Not inspected", indexation.not_inspected],
            ["Inspected", indexation.inspected],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-md bg-gray-50 px-3 py-2">
              <p className="text-[11px] text-gray-500">{label}</p>
              <p className="text-sm font-semibold text-gray-900">
                {value == null ? "—" : numberFormatter.format(Number(value))}
              </p>
            </div>
          ))}
        </div>
        {indexation.last_inspection_at ? (
          <p className="mt-2 text-[11px] text-gray-500">
            Last inspection: {new Date(indexation.last_inspection_at).toLocaleString()}
          </p>
        ) : null}
      </Card>

      {data.coverage_note ? (
        <p className="text-[11px] text-gray-500">{data.coverage_note}</p>
      ) : null}
    </div>
  )
}

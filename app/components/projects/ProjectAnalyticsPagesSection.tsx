"use client"

import { useEffect, useMemo, useState } from "react"
import { format } from "date-fns"
import { useQuery } from "@tanstack/react-query"
import { Loader2, AlertCircle, ArrowUpDown } from "lucide-react"

import { createClient } from "../../lib/supabase/client"
import { Card } from "../ui/card"

type MetricKey = "sessions" | "active_users" | "screen_page_views"

const METRIC_LABELS: Record<MetricKey, string> = {
  sessions: "Sessions",
  active_users: "Users",
  screen_page_views: "Views",
}

export type PageAnalyticsRow = {
  page_url: string
  page_title: string | null
  active_users: number | null
  sessions: number | null
  screen_page_views: number | null
}

export interface ProjectAnalyticsPagesSectionProps {
  projectId: number
  dateRange: { from: Date; to: Date }
  selectedMetric: MetricKey
}

export function ProjectAnalyticsPagesSection({
  projectId,
  dateRange,
  selectedMetric,
}: ProjectAnalyticsPagesSectionProps) {
  const supabase = useMemo(() => createClient(), [])

  const [sortBy, setSortBy] = useState<MetricKey>(selectedMetric)
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")

  const startDate = useMemo(
    () => format(dateRange.from, "yyyy-MM-dd"),
    [dateRange.from],
  )
  const endDate = useMemo(
    () => format(dateRange.to, "yyyy-MM-dd"),
    [dateRange.to],
  )

  useEffect(() => {
    setSortBy(selectedMetric)
    setSortDir("desc")
  }, [selectedMetric])

  const {
    data,
    isLoading,
    error,
  } = useQuery<PageAnalyticsRow[]>({
    queryKey: [
      "project-analytics-pages",
      projectId,
      startDate,
      endDate,
    ],
    enabled: !!projectId && !!dateRange.from && !!dateRange.to,
    queryFn: async () => {
      const { data: rows, error: rpcError } = await (supabase as any).rpc(
        "fn_get_project_analytics_pages",
        {
          p_project_id: projectId,
          p_start_date: startDate,
          p_end_date: endDate,
          p_limit: 100,
        },
      )

      if (rpcError) {
        throw rpcError
      }

      return (rows || []) as PageAnalyticsRow[]
    },
  })

  const sortedRows = useMemo(() => {
    if (!data || data.length === 0) return []
    const rows = [...data]
    rows.sort((a, b) => {
      const va = Number(a[sortBy] ?? 0)
      const vb = Number(b[sortBy] ?? 0)
      return sortDir === "asc" ? va - vb : vb - va
    })
    return rows
  }, [data, sortBy, sortDir])

  const numberFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-US", {
        maximumFractionDigits: 0,
      }),
    [],
  )

  const dateRangeLabel = useMemo(() => {
    const fromLabel = format(dateRange.from, "MMM d, yyyy")
    const toLabel = format(dateRange.to, "MMM d, yyyy")
    return `${fromLabel} – ${toLabel}`
  }, [dateRange.from, dateRange.to])

  const selectedMetricLabel = METRIC_LABELS[selectedMetric]

  const handleMetricHeaderClick = (metric: MetricKey) => {
    if (sortBy === metric) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"))
      return
    }
    setSortBy(metric)
    setSortDir("desc")
  }

  const renderMetricHeader = (metric: MetricKey) => {
    const isActive = sortBy === metric
    const label = METRIC_LABELS[metric]

    return (
      <button
        type="button"
        onClick={() => handleMetricHeaderClick(metric)}
        className={[
          "flex w-full items-center justify-end gap-1 text-xs font-medium",
          "transition-colors",
          isActive ? "text-gray-900" : "text-gray-500 hover:text-gray-800",
        ].join(" ")}
      >
        <span className={selectedMetric === metric ? "font-semibold" : ""}>
          {label}
        </span>
        <ArrowUpDown
          className={[
            "h-3 w-3",
            isActive ? "text-gray-700" : "text-gray-400",
          ].join(" ")}
        />
      </button>
    )
  }

  const hasRows = sortedRows.length > 0

  return (
    <Card className="p-4 md:p-6">
      <div className="mb-4 flex flex-col gap-1 md:flex-row md:items-baseline md:justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-900">
            Per page analytics
          </h3>
          <p className="text-xs text-gray-500">
            {selectedMetricLabel} for {dateRangeLabel} across all channels.
          </p>
        </div>
      </div>

      {isLoading && (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      )}

      {!isLoading && error && (
        <div className="flex h-40 flex-col items-center justify-center gap-2 text-sm text-red-600">
          <AlertCircle className="h-5 w-5" />
          <span>
            {error instanceof Error
              ? error.message
              : "Failed to load page analytics."}
          </span>
        </div>
      )}

      {!isLoading && !error && !hasRows && (
        <div className="flex h-40 flex-col items-center justify-center text-sm text-gray-500">
          <span>
            No page analytics available for this period. Try a different date
            range.
          </span>
        </div>
      )}

      {!isLoading && !error && hasRows && (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b bg-gray-50 text-xs font-medium uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2 text-left">Page</th>
                <th className="px-4 py-2 text-right">
                  {renderMetricHeader("sessions")}
                </th>
                <th className="px-4 py-2 text-right">
                  {renderMetricHeader("active_users")}
                </th>
                <th className="px-4 py-2 text-right">
                  {renderMetricHeader("screen_page_views")}
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => (
                <tr key={row.page_url} className="border-b last:border-0">
                  <td className="px-4 py-3 align-top">
                    <div className="space-y-0.5">
                      <div className="text-sm font-medium text-gray-900">
                        {row.page_title || row.page_url}
                      </div>
                      <div className="text-[11px] text-gray-500">
                        <a
                          href={row.page_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="break-all hover:underline"
                        >
                          {row.page_url}
                        </a>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-sm">
                    {numberFormatter.format(Number(row.sessions ?? 0))}
                  </td>
                  <td className="px-4 py-3 text-right text-sm">
                    {numberFormatter.format(Number(row.active_users ?? 0))}
                  </td>
                  <td className="px-4 py-3 text-right text-sm">
                    {numberFormatter.format(Number(row.screen_page_views ?? 0))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}



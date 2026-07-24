"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { AlertCircle, Loader2 } from "lucide-react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Button } from "../ui/button"
import { useInViewport } from "@/hooks/use-in-viewport"
import { useViewUsersCanSee } from "@/hooks/use-view-users-can-see"
import {
  formatCompactTokenCount,
  formatExactTokenCount,
} from "../../../features/ai-chat/ai-chat-usage"
import {
  addDaysToDateString,
  formatBucketAxisLabel,
  formatBucketTooltipLabel,
  getDateStringInTimezone,
  resolveDefaultTeamTimezone,
} from "@/lib/services/team-ai-usage"
import {
  PROJECT_AI_USAGE_QUERY_KEY,
  PROJECT_AI_USAGE_TIMEZONE_QUERY_KEY,
  fetchProjectAiUsageTimeseries,
  getProjectAiUsageTimezone,
  type ProjectAiUsageResponse,
  type ProjectAiUsageSeriesPoint,
} from "@/lib/services/project-ai-usage"

type RangePreset = "7" | "30" | "90"

type ChartDatum = ProjectAiUsageSeriesPoint & {
  label: string
}

const PROMPT_BAR_COLOR = "#2563eb"
const COMPLETION_BAR_COLOR = "#93c5fd"
const ESTIMATED_BAR_COLOR = "#c4b5fd"

function buildRangeForPreset(preset: RangePreset, timeZone: string): { from: string; to: string } {
  const today = getDateStringInTimezone(new Date(), timeZone)
  const days = preset === "7" ? 7 : preset === "90" ? 90 : 30
  return {
    from: addDaysToDateString(today, -(days - 1)),
    to: today,
  }
}

function UsageTooltip({
  active,
  payload,
  timeZone,
}: {
  active?: boolean
  payload?: Array<{ payload?: ChartDatum }>
  timeZone: string
}) {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload
  if (!point) return null

  return (
    <div className="border border-gray-200 bg-white p-3 text-xs shadow-sm">
      <div className="mb-1.5 font-medium text-gray-900">
        {formatBucketTooltipLabel(point.bucket_start, timeZone)}
      </div>
      <div className="space-y-1 text-gray-700">
        <div className="flex items-center justify-between gap-6">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2" style={{ backgroundColor: PROMPT_BAR_COLOR }} />
            Prompt
          </span>
          <span className="font-medium tabular-nums">{formatExactTokenCount(point.prompt_tokens)}</span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2" style={{ backgroundColor: COMPLETION_BAR_COLOR }} />
            Completion
          </span>
          <span className="font-medium tabular-nums">{formatExactTokenCount(point.completion_tokens)}</span>
        </div>
        {point.estimated_tokens > 0 ? (
          <div className="flex items-center justify-between gap-6">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2" style={{ backgroundColor: ESTIMATED_BAR_COLOR }} />
              Estimated
            </span>
            <span className="font-medium tabular-nums">{formatExactTokenCount(point.estimated_tokens)}</span>
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-6 border-t border-gray-100 pt-1">
          <span>Cached prompt</span>
          <span className="font-medium tabular-nums">{formatExactTokenCount(point.cached_prompt_tokens)}</span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <span>Calls</span>
          <span className="font-medium tabular-nums">{formatExactTokenCount(point.call_count)}</span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <span>Total</span>
          <span className="font-medium tabular-nums">{formatExactTokenCount(point.accounted_tokens)}</span>
        </div>
      </div>
    </div>
  )
}

function MetricCell({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string | null
}) {
  return (
    <div className="min-w-0 space-y-1">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="truncate text-base font-semibold tabular-nums text-gray-900" title={value}>
        {value}
      </div>
      {hint ? (
        <div className="truncate text-xs tabular-nums text-gray-500" title={hint}>
          {hint}
        </div>
      ) : null}
    </div>
  )
}

function SummarySkeleton() {
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="min-w-0 space-y-2">
          <div className="h-3 w-16 animate-pulse bg-gray-100" />
          <div className="h-5 w-20 animate-pulse bg-gray-100" />
        </div>
      ))}
    </div>
  )
}

function ChartSkeleton() {
  return (
    <div className="flex h-64 items-center justify-center border-t border-gray-100 pt-4">
      <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
    </div>
  )
}

function BreakdownSkeleton() {
  return (
    <div className="space-y-6">
      {Array.from({ length: 2 }).map((_, index) => (
        <div key={index} className="min-w-0 space-y-3">
          <div className="h-4 w-28 animate-pulse bg-gray-100" />
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((__, row) => (
              <div key={row} className="h-8 animate-pulse bg-gray-50" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function BreakdownTable({
  title,
  emptyLabel,
  headers,
  rows,
}: {
  title: string
  emptyLabel: string
  headers: [string, string, string]
  rows: Array<{ key: string; primary: string; secondary?: string; tokens: number; calls: number }>
}) {
  return (
    <div className="min-w-0">
      <h4 className="text-sm font-medium text-gray-900">{title}</h4>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500">{emptyLabel}</p>
      ) : (
        <div className="mt-2 min-w-0">
          <table className="w-full table-fixed text-left text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-500">
                <th className="w-auto pb-2 pr-3 font-medium">{headers[0]}</th>
                <th className="w-20 pb-2 pr-3 text-right font-medium">{headers[1]}</th>
                <th className="w-16 pb-2 text-right font-medium">{headers[2]}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-b border-gray-100 last:border-b-0">
                  <td className="min-w-0 py-2.5 pr-3 align-top">
                    <div className="truncate font-medium text-gray-900" title={row.primary}>
                      {row.primary}
                    </div>
                    {row.secondary ? (
                      <div className="truncate text-xs text-gray-500" title={row.secondary}>
                        {row.secondary}
                      </div>
                    ) : null}
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-gray-900">
                    {formatCompactTokenCount(row.tokens)}
                  </td>
                  <td className="py-2.5 text-right tabular-nums text-gray-700">
                    {formatExactTokenCount(row.calls)}
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

export function ProjectAiUsageSection({ projectId }: { projectId: number }) {
  const { ref, isInViewport } = useInViewport({ rootMargin: "240px 0px" })
  const fallbackTimezone = useMemo(() => resolveDefaultTeamTimezone() || "UTC", [])
  const [preset, setPreset] = useState<RangePreset>("30")
  const { data: directoryUsers = [] } = useViewUsersCanSee(isInViewport && projectId > 0)

  const userNameById = useMemo(() => {
    const map = new Map<number, string>()
    for (const user of directoryUsers) {
      const name = (user.full_name ?? "").trim()
      if (name) map.set(user.id, name)
    }
    return map
  }, [directoryUsers])

  const { data: resolvedTimezone = fallbackTimezone } = useQuery({
    queryKey: [PROJECT_AI_USAGE_TIMEZONE_QUERY_KEY, projectId],
    enabled: isInViewport && projectId > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: () => getProjectAiUsageTimezone(projectId),
  })

  const activeRange = useMemo(
    () => buildRangeForPreset(preset, resolvedTimezone),
    [preset, resolvedTimezone],
  )

  const dateFrom = activeRange.from
  const dateTo = activeRange.to

  const {
    data,
    isLoading,
    isFetching,
    error,
    refetch,
    isError,
  } = useQuery<ProjectAiUsageResponse>({
    queryKey: [
      PROJECT_AI_USAGE_QUERY_KEY,
      projectId,
      dateFrom,
      dateTo,
      resolvedTimezone,
    ],
    enabled: isInViewport && projectId > 0 && !!dateFrom && !!dateTo && !!resolvedTimezone,
    placeholderData: (previous) => previous,
    retry: 1,
    queryFn: () =>
      fetchProjectAiUsageTimeseries({
        projectId,
        dateFrom,
        dateTo,
        timezone: resolvedTimezone,
      }),
  })

  const summary = data?.summary
  const chartTimezone = data?.timezone || resolvedTimezone

  const chartData = useMemo<ChartDatum[]>(() => {
    if (!data) return []
    return data.series.map((point) => ({
      ...point,
      label: formatBucketAxisLabel(point.bucket_start, chartTimezone),
    }))
  }, [chartTimezone, data])

  const hasChartActivity = chartData.some(
    (point) => point.accounted_tokens > 0 || point.call_count > 0,
  )
  const showInitialLoading = isLoading && !data
  const showSoftFetching = isFetching && !!data
  const showEstimatedMetric = (summary?.estimated_call_count ?? 0) > 0

  const renderTooltip = useMemo(
    () =>
      function ProjectAiUsageTooltip(props: {
        active?: boolean
        payload?: Array<{ payload?: ChartDatum }>
      }) {
        return <UsageTooltip {...props} timeZone={chartTimezone} />
      },
    [chartTimezone],
  )

  const rangeOptions: Array<{ id: RangePreset; label: string }> = [
    { id: "7", label: "7d" },
    { id: "30", label: "30d" },
    { id: "90", label: "90d" },
  ]

  return (
    <div ref={ref} className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="text-sm font-medium text-gray-900">AI usage</h3>
          {showSoftFetching ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-gray-400" aria-label="Refreshing usage" />
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {rangeOptions.map((option) => (
            <Button
              key={option.id}
              type="button"
              variant={preset === option.id ? "default" : "outline"}
              size="sm"
              className="h-7 px-2.5 text-xs"
              onClick={() => setPreset(option.id)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      {!isInViewport || showInitialLoading ? (
        <>
          <SummarySkeleton />
          <ChartSkeleton />
          <BreakdownSkeleton />
        </>
      ) : isError ? (
        <div className="flex flex-col items-start gap-3 border-t border-gray-100 py-6 text-sm text-red-600">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>
              {error instanceof Error ? error.message : "Failed to load project AI usage"}
            </span>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
            <MetricCell
              label="Total consumed tokens"
              value={formatCompactTokenCount(summary?.accounted_tokens ?? 0)}
            />
            <MetricCell
              label="Prompt tokens"
              value={formatCompactTokenCount(summary?.prompt_tokens ?? 0)}
            />
            <MetricCell
              label="Completion tokens"
              value={formatCompactTokenCount(summary?.completion_tokens ?? 0)}
            />
            <MetricCell
              label="AI calls"
              value={formatExactTokenCount(summary?.call_count ?? 0)}
            />
            <MetricCell
              label="Active users"
              value={formatExactTokenCount(summary?.user_count ?? 0)}
            />
            {showEstimatedMetric ? (
              <MetricCell
                label="Estimated usage"
                value={formatCompactTokenCount(summary?.estimated_tokens ?? 0)}
                hint={`${formatExactTokenCount(summary?.estimated_call_count ?? 0)} estimated calls`}
              />
            ) : null}
          </div>

          <div className="min-w-0 space-y-3 border-t border-gray-100 pt-4">
            <div>
              <h4 className="text-sm font-medium text-gray-900">Token usage over time</h4>
              <p className="mt-0.5 text-xs text-gray-500">
                Daily prompt, completion, and estimated tokens · {chartTimezone}
              </p>
            </div>
            <div className="h-64 min-w-0 w-full">
              {!hasChartActivity ? (
                <div className="flex h-full items-center justify-center text-sm text-gray-500">
                  No AI usage in this range.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                    <XAxis
                      dataKey="label"
                      stroke="#9ca3af"
                      style={{ fontSize: "11px" }}
                      tickMargin={8}
                      minTickGap={28}
                      axisLine={{ stroke: "#e5e7eb" }}
                      tickLine={false}
                    />
                    <YAxis
                      width={44}
                      stroke="#9ca3af"
                      style={{ fontSize: "11px" }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(value) =>
                        typeof value === "number" ? formatCompactTokenCount(value) : ""
                      }
                    />
                    <RechartsTooltip
                      content={renderTooltip as never}
                      cursor={{ fill: "rgba(37, 99, 235, 0.06)" }}
                    />
                    <Legend wrapperStyle={{ fontSize: "12px" }} />
                    <Bar
                      dataKey="prompt_tokens"
                      name="Prompt"
                      stackId="tokens"
                      fill={PROMPT_BAR_COLOR}
                      maxBarSize={24}
                      isAnimationActive={false}
                    />
                    <Bar
                      dataKey="completion_tokens"
                      name="Completion"
                      stackId="tokens"
                      fill={COMPLETION_BAR_COLOR}
                      maxBarSize={24}
                      isAnimationActive={false}
                    />
                    <Bar
                      dataKey="estimated_tokens"
                      name="Estimated"
                      stackId="tokens"
                      fill={ESTIMATED_BAR_COLOR}
                      maxBarSize={24}
                      isAnimationActive={false}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="space-y-6 border-t border-gray-100 pt-4">
            <BreakdownTable
              title="Usage by model"
              emptyLabel="No model usage in this range."
              headers={["Model", "Tokens", "Calls"]}
              rows={(data?.by_model ?? []).map((row) => ({
                key: `${row.provider}:${row.model}`,
                primary: row.model || "Unknown model",
                secondary: row.provider || undefined,
                tokens: row.accounted_tokens,
                calls: row.call_count,
              }))}
            />
            <BreakdownTable
              title="Usage by user"
              emptyLabel="No user usage in this range."
              headers={["User", "Tokens", "Calls"]}
              rows={(data?.by_user ?? []).map((row) => ({
                key: String(row.user_id),
                primary: userNameById.get(row.user_id) || `User ${row.user_id}`,
                tokens: row.accounted_tokens,
                calls: row.call_count,
              }))}
            />
          </div>
        </>
      )}
    </div>
  )
}

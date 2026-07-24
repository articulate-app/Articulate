"use client"

import { useMemo, useRef, useState } from "react"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select"
import { useInViewport } from "@/hooks/use-in-viewport"
import { TeamAiLimitEditor } from "./team-ai-limit-editor"
import {
  formatCompactTokenCount,
  formatExactTokenCount,
} from "../../../features/ai-chat/ai-chat-usage"
import {
  TEAM_AI_USAGE_GRANULARITY,
  TEAM_AI_USAGE_QUERY_KEY,
  addDaysToDateString,
  bucketStartToDateString,
  fetchTeamAiUsageTimeseries,
  fillTeamAiUsageSeries,
  formatBucketAxisLabel,
  formatBucketTooltipLabel,
  formatUsageResetDateTime,
  getDateStringInTimezone,
  getTeamAiUsageTimezone,
  resolveDefaultTeamTimezone,
  type TeamAiUsageResponse,
  type TeamAiUsageSeriesPoint,
} from "@/lib/services/team-ai-usage"

type RangePreset = "7" | "30" | "90" | "period"

type ChartDatum = TeamAiUsageSeriesPoint & {
  label: string
}

const PROMPT_BAR_COLOR = "#2563eb"
const COMPLETION_BAR_COLOR = "#93c5fd"

function buildRangeForPreset(
  preset: RangePreset,
  timeZone: string,
  periodStart: string | null,
): { from: string; to: string } {
  const today = getDateStringInTimezone(new Date(), timeZone)
  if (preset === "period" && periodStart) {
    const periodDate = bucketStartToDateString(periodStart, timeZone)
    return {
      from: periodDate <= today ? periodDate : today,
      to: today,
    }
  }
  const days = preset === "7" ? 7 : preset === "90" ? 90 : 30
  return {
    from: addDaysToDateString(today, -(days - 1)),
    to: today,
  }
}

function MetricRow({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-gray-100 py-2.5 last:border-b-0">
      <div className="text-sm text-gray-900">{label}</div>
      <div className="shrink-0 text-sm font-medium tabular-nums text-gray-900" title={value}>
        {value}
      </div>
    </div>
  )
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
          <span className="font-medium tabular-nums">{formatExactTokenCount(point.total_tokens)}</span>
        </div>
      </div>
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
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[16rem] text-left text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-500">
                <th className="pb-2 pr-3 font-medium">{headers[0]}</th>
                <th className="pb-2 pr-3 text-right font-medium">{headers[1]}</th>
                <th className="pb-2 text-right font-medium">{headers[2]}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-b border-gray-100 last:border-b-0">
                  <td className="max-w-[10rem] py-2.5 pr-3 align-top sm:max-w-none">
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

export function TeamAiUsageSection({ teamId }: { teamId: number }) {
  const { ref, isInViewport } = useInViewport({ rootMargin: "240px 0px" })
  const fallbackTimezone = useMemo(() => resolveDefaultTeamTimezone(), [])
  const knownPeriodStartRef = useRef<string | null>(null)

  const [preset, setPreset] = useState<RangePreset>("30")

  const activeRange = useMemo(
    () => buildRangeForPreset(preset, fallbackTimezone, knownPeriodStartRef.current),
    [preset, fallbackTimezone],
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
  } = useQuery<TeamAiUsageResponse>({
    queryKey: [
      TEAM_AI_USAGE_QUERY_KEY,
      teamId,
      dateFrom,
      dateTo,
      preset,
      TEAM_AI_USAGE_GRANULARITY,
    ],
    enabled: isInViewport && teamId > 0 && !!dateFrom && !!dateTo,
    placeholderData: (previous) => previous,
    retry: 1,
    queryFn: async () => {
      const timezone = await getTeamAiUsageTimezone(teamId)
      const range = buildRangeForPreset(preset, timezone, knownPeriodStartRef.current)
      return fetchTeamAiUsageTimeseries({
        teamId,
        dateFrom: range.from,
        dateTo: range.to,
        timezone,
        granularity: TEAM_AI_USAGE_GRANULARITY,
      })
    },
  })

  if (data?.summary.period_start) {
    knownPeriodStartRef.current = data.summary.period_start
  }

  const summary = data?.summary
  const chartTimezone = data?.timezone || fallbackTimezone
  const hasFiniteLimit = summary?.limit_tokens != null && summary.limit_tokens > 0
  const periodStart = knownPeriodStartRef.current
  const resetLabel = formatUsageResetDateTime(summary?.resets_at, chartTimezone)

  const chartData = useMemo<ChartDatum[]>(() => {
    if (!data) return []
    const from = data.date_from || dateFrom
    const to = data.date_to || dateTo
    return fillTeamAiUsageSeries(data.series, from, to, chartTimezone).map((point) => ({
      ...point,
      label: formatBucketAxisLabel(point.bucket_start, chartTimezone),
    }))
  }, [chartTimezone, data, dateFrom, dateTo])

  const hasChartActivity = chartData.some(
    (point) => point.total_tokens > 0 || point.call_count > 0,
  )
  const showInitialLoading = isLoading && !data
  const showSoftFetching = isFetching && !!data

  const renderTooltip = useMemo(
    () =>
      function TeamAiUsageTooltip(props: {
        active?: boolean
        payload?: Array<{ payload?: ChartDatum }>
      }) {
        return <UsageTooltip {...props} timeZone={chartTimezone} />
      },
    [chartTimezone],
  )

  const rangeOptions: Array<{ id: RangePreset; label: string }> = [
    { id: "7", label: "Last 7 days" },
    { id: "30", label: "Last 30 days" },
    { id: "90", label: "Last 90 days" },
  ]
  if (periodStart) {
    rangeOptions.push({ id: "period", label: "Current period" })
  }
  const activeRangeLabel =
    rangeOptions.find((option) => option.id === preset)?.label ?? "Last 30 days"

  const todayDate = getDateStringInTimezone(new Date(), chartTimezone)
  const todayTokens = chartData.find((point) => {
    const bucketDate = bucketStartToDateString(point.bucket_start, chartTimezone)
    return bucketDate === todayDate
  })?.total_tokens ?? 0
  const todayPercent = hasFiniteLimit
    ? Math.min(
        100,
        Math.max(
          0,
          summary?.percent_used ??
            ((summary?.limit_tokens ?? 0) > 0
              ? (todayTokens / (summary?.limit_tokens ?? 1)) * 100
              : 0),
        ),
      )
    : null
  const todayMeterClass =
    todayPercent != null && todayPercent >= 100
      ? "bg-red-500"
      : todayPercent != null && todayPercent >= 80
        ? "bg-amber-500"
        : "bg-gray-900"

  return (
    <div ref={ref} className="space-y-6">
      <TeamAiLimitEditor teamId={teamId} />

      <div className="space-y-4 border-t border-gray-100 pt-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium text-gray-900">AI usage</h3>
              {showSoftFetching ? (
                <Loader2
                  className="h-3.5 w-3.5 shrink-0 animate-spin text-gray-400"
                  aria-label="Refreshing usage"
                />
              ) : null}
            </div>
            <p className="mt-0.5 text-xs text-gray-500">Team-wide usage for this account.</p>
          </div>
          <Select value={preset} onValueChange={(value) => setPreset(value as RangePreset)}>
            <SelectTrigger className="h-8 w-auto gap-1 border-0 bg-transparent px-2 text-gray-900 hover:bg-gray-100 focus:ring-0 focus:ring-offset-0">
              <SelectValue>{activeRangeLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {rangeOptions.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {!isInViewport || showInitialLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-start gap-3 border-t border-gray-100 py-6 text-sm text-red-600">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>
                {error instanceof Error ? error.message : "Failed to load team AI usage"}
              </span>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
              Retry
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-4 rounded-lg border border-gray-100 bg-gray-50/60 p-4">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Used today
                  </div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">
                    {formatCompactTokenCount(todayTokens)}
                  </div>
                </div>
                <div className="text-right text-sm text-gray-600">
                  {hasFiniteLimit ? (
                    <>
                      <div className="font-medium tabular-nums text-gray-900">
                        {todayPercent != null ? `${Math.round(todayPercent)}%` : "—"}
                      </div>
                      <div className="text-xs text-gray-500">
                        of {formatCompactTokenCount(summary?.limit_tokens ?? 0)} daily
                      </div>
                    </>
                  ) : (
                    <div className="text-xs text-gray-500">No team daily limit</div>
                  )}
                </div>
              </div>
              {hasFiniteLimit ? (
                <div className="h-2 overflow-hidden rounded-full bg-gray-200">
                  <div
                    className={`h-full rounded-full transition-all ${todayMeterClass}`}
                    style={{ width: `${todayPercent ?? 0}%` }}
                  />
                </div>
              ) : (
                <div className="h-2 overflow-hidden rounded-full bg-gray-200">
                  <div
                    className="h-full rounded-full bg-gray-400"
                    style={{ width: todayTokens > 0 ? "35%" : "0%" }}
                  />
                </div>
              )}
              {hasFiniteLimit && summary?.remaining_tokens != null ? (
                <p className="text-xs text-gray-500">
                  {formatCompactTokenCount(summary.remaining_tokens)} remaining
                  {resetLabel ? ` · resets ${resetLabel}` : ""}
                </p>
              ) : resetLabel ? (
                <p className="text-xs text-gray-500">Resets {resetLabel}</p>
              ) : null}
            </div>

            <div className="grid gap-x-8 sm:grid-cols-2">
              <MetricRow
                label="Total tokens"
                value={formatCompactTokenCount(summary?.total_tokens ?? 0)}
              />
              <MetricRow
                label="Prompt tokens"
                value={formatCompactTokenCount(summary?.prompt_tokens ?? 0)}
              />
              <MetricRow
                label="Completion tokens"
                value={formatCompactTokenCount(summary?.completion_tokens ?? 0)}
              />
              <MetricRow label="Calls" value={formatExactTokenCount(summary?.call_count ?? 0)} />
            </div>

            <div className="min-w-0 space-y-3 border-t border-gray-100 pt-4">
              <div>
                <h4 className="text-sm font-medium text-gray-900">Token usage over time</h4>
                <p className="mt-0.5 text-xs text-gray-500">Daily prompt and completion tokens</p>
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
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="grid gap-6 border-t border-gray-100 pt-4 sm:grid-cols-2">
              <BreakdownTable
                title="Usage by model"
                emptyLabel="No model usage in this range."
                headers={["Model", "Tokens", "Calls"]}
                rows={(data?.by_model ?? []).map((row) => ({
                  key: `${row.provider}:${row.model}`,
                  primary: row.model || "Unknown model",
                  secondary: row.provider || undefined,
                  tokens: row.total_tokens,
                  calls: row.call_count,
                }))}
              />
              <BreakdownTable
                title="Top users"
                emptyLabel="No user usage in this range."
                headers={["User", "Tokens", "Calls"]}
                rows={(data?.top_users ?? []).map((row) => ({
                  key: String(row.user_id),
                  primary: row.user_name?.trim() || `User ${row.user_id}`,
                  tokens: row.total_tokens,
                  calls: row.call_count,
                }))}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

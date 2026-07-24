"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
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
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import {
  formatCompactTokenCount,
  formatExactTokenCount,
} from "../../../features/ai-chat/ai-chat-usage"
import {
  listAiTokenLimitPolicies,
  setAiTokenLimit,
} from "@/lib/services/ai-token-limits"
import {
  TEAM_AI_USAGE_GRANULARITY,
  USER_AI_USAGE_QUERY_KEY,
  addDaysToDateString,
  bucketStartToDateString,
  fetchUserAiUsageTimeseries,
  fillTeamAiUsageSeries,
  formatBucketAxisLabel,
  formatBucketTooltipLabel,
  formatUsageResetDateTime,
  getDateStringInTimezone,
  getTeamAiUsageTimezone,
  resolveDefaultTeamTimezone,
  type TeamAiUsageSeriesPoint,
  type UserAiUsageResponse,
} from "@/lib/services/team-ai-usage"
import type { UserTeamWithRole } from "@/lib/services/userSkillsAndMemberships"

type RangePreset = "7" | "30" | "90" | "period"

type ChartDatum = TeamAiUsageSeriesPoint & {
  label: string
}

const PROMPT_BAR_COLOR = "#2563eb"
const COMPLETION_BAR_COLOR = "#93c5fd"
const POLICIES_QUERY_KEY = "ai-token-limit-policies"

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
  hint,
}: {
  label: string
  value: string
  hint?: string | null
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-gray-100 py-2.5 last:border-b-0">
      <div className="min-w-0">
        <div className="text-sm text-gray-900">{label}</div>
        {hint ? (
          <div className="mt-0.5 truncate text-xs tabular-nums text-gray-500" title={hint}>
            {hint}
          </div>
        ) : null}
      </div>
      <div
        className="shrink-0 text-sm font-medium tabular-nums text-gray-900"
        title={value}
      >
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
          <span>Prompt</span>
          <span className="font-medium tabular-nums">{formatExactTokenCount(point.prompt_tokens)}</span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <span>Completion</span>
          <span className="font-medium tabular-nums">{formatExactTokenCount(point.completion_tokens)}</span>
        </div>
        <div className="flex items-center justify-between gap-6 border-t border-gray-100 pt-1">
          <span>Cached prompt</span>
          <span className="font-medium tabular-nums">{formatExactTokenCount(point.cached_prompt_tokens)}</span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <span>Total</span>
          <span className="font-medium tabular-nums">{formatExactTokenCount(point.total_tokens)}</span>
        </div>
      </div>
    </div>
  )
}

export function UserAiLimitsTab({
  userId,
  teams,
  showLimitsForm = true,
}: {
  userId: number
  teams: UserTeamWithRole[] | undefined
  /** When false, hide the daily-limit editor (charts/cards remain). */
  showLimitsForm?: boolean
}) {
  const queryClient = useQueryClient()
  const fallbackTimezone = useMemo(() => resolveDefaultTeamTimezone(), [])
  const knownPeriodStartRef = useRef<string | null>(null)

  const [teamId, setTeamId] = useState<string>("")
  const [preset, setPreset] = useState<RangePreset>("30")
  const [dailyLimit, setDailyLimit] = useState("")
  const [warningPercent, setWarningPercent] = useState("80")
  const [formStatus, setFormStatus] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [hydratedPolicyKey, setHydratedPolicyKey] = useState("")

  useEffect(() => {
    if (!teams?.length) {
      setTeamId("")
      return
    }
    if (!teamId || !teams.some((team) => String(team.team_id) === teamId)) {
      setTeamId(String(teams[0].team_id))
    }
  }, [teamId, teams])

  const parsedTeamId = Number(teamId)
  const hasTeam = Number.isFinite(parsedTeamId) && parsedTeamId > 0

  const activeRange = useMemo(
    () => buildRangeForPreset(preset, fallbackTimezone, knownPeriodStartRef.current),
    [preset, fallbackTimezone],
  )

  const {
    data,
    isLoading,
    isFetching,
    error,
    refetch,
    isError,
  } = useQuery<UserAiUsageResponse>({
    queryKey: [
      USER_AI_USAGE_QUERY_KEY,
      userId,
      parsedTeamId,
      activeRange.from,
      activeRange.to,
      preset,
      TEAM_AI_USAGE_GRANULARITY,
    ],
    enabled: hasTeam && userId > 0,
    placeholderData: (previous) => previous,
    retry: 1,
    queryFn: async () => {
      const resolvedTimezone = await getTeamAiUsageTimezone(parsedTeamId)
      const range = buildRangeForPreset(preset, resolvedTimezone, knownPeriodStartRef.current)
      return fetchUserAiUsageTimeseries({
        userId,
        teamId: parsedTeamId,
        dateFrom: range.from,
        dateTo: range.to,
        timezone: resolvedTimezone,
        granularity: TEAM_AI_USAGE_GRANULARITY,
      })
    },
  })

  if (data?.summary.period_start) {
    knownPeriodStartRef.current = data.summary.period_start
  }

  const { data: policyPayload } = useQuery({
    queryKey: [POLICIES_QUERY_KEY, parsedTeamId],
    enabled: hasTeam,
    queryFn: () => listAiTokenLimitPolicies(parsedTeamId),
  })

  const userPolicy = useMemo(
    () => (policyPayload?.policies ?? []).find((policy) => policy.user_id === userId),
    [policyPayload?.policies, userId],
  )

  const canManage = data?.can_manage === true || policyPayload?.can_manage === true

  useEffect(() => {
    if (!hasTeam) return
    const nextKey = `${parsedTeamId}:${userId}:${userPolicy?.id ?? "none"}:${userPolicy?.updated_at ?? ""}`
    if (hydratedPolicyKey === nextKey) return
    if (userPolicy) {
      setDailyLimit(String(userPolicy.daily_token_limit ?? ""))
      setWarningPercent(String(userPolicy.warning_percent ?? 80))
    } else {
      setDailyLimit("")
      setWarningPercent("80")
    }
    setHydratedPolicyKey(nextKey)
    setFormStatus(null)
    setFormError(null)
  }, [
    hasTeam,
    hydratedPolicyKey,
    parsedTeamId,
    userId,
    userPolicy,
  ])

  const saveMutation = useMutation({
    mutationFn: async (clear: boolean) => {
      const parsedLimit = clear || dailyLimit.trim() === "" ? null : Number(dailyLimit)
      const parsedWarning = Number(warningPercent)
      if (parsedLimit != null && (!Number.isFinite(parsedLimit) || parsedLimit <= 0)) {
        throw new Error("Daily token limit must be a positive number or empty to clear.")
      }
      if (!Number.isFinite(parsedWarning) || parsedWarning <= 0 || parsedWarning >= 100) {
        throw new Error("Warning percent must be between 1 and 99.")
      }
      const { error: rpcError } = await setAiTokenLimit({
        teamId: parsedTeamId,
        userId,
        dailyTokenLimit: parsedLimit,
        warningPercent: parsedWarning,
        timezone: userPolicy?.timezone || data?.timezone || fallbackTimezone || "UTC",
        enabled: true,
      })
      if (rpcError) {
        if (rpcError.code === "42501" || /permission|token_limit_admin/i.test(rpcError.message)) {
          throw new Error("You do not have permission to update this user’s AI limits.")
        }
        throw rpcError
      }
      return clear || parsedLimit == null ? "cleared" : "saved"
    },
    onSuccess: async (result) => {
      setFormError(null)
      setFormStatus(result === "cleared" ? "User AI policy cleared." : "User AI limits saved.")
      setHydratedPolicyKey("")
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [POLICIES_QUERY_KEY, parsedTeamId] }),
        queryClient.invalidateQueries({ queryKey: [USER_AI_USAGE_QUERY_KEY, userId, parsedTeamId] }),
      ])
    },
    onError: (saveError) => {
      setFormStatus(null)
      setFormError(saveError instanceof Error ? saveError.message : "Failed to save AI limits.")
    },
  })

  const summary = data?.summary
  const chartTimezone = data?.timezone || fallbackTimezone
  const hasFiniteLimit = summary?.limit_tokens != null && summary.limit_tokens > 0
  const periodStart = knownPeriodStartRef.current
  const resetLabel = formatUsageResetDateTime(summary?.resets_at, chartTimezone)

  const chartData = useMemo<ChartDatum[]>(() => {
    if (!data) return []
    return fillTeamAiUsageSeries(
      data.series,
      data.date_from || activeRange.from,
      data.date_to || activeRange.to,
      chartTimezone,
    ).map((point) => ({
      ...point,
      label: formatBucketAxisLabel(point.bucket_start, chartTimezone),
    }))
  }, [activeRange.from, activeRange.to, chartTimezone, data])

  const hasChartActivity = chartData.some(
    (point) => point.total_tokens > 0 || point.call_count > 0,
  )
  const showInitialLoading = isLoading && !data

  const rangeOptions: Array<{ id: RangePreset; label: string }> = [
    { id: "7", label: "7d" },
    { id: "30", label: "30d" },
    { id: "90", label: "90d" },
  ]
  if (periodStart) {
    rangeOptions.push({ id: "period", label: "Current period" })
  }

  const renderTooltip = useMemo(
    () =>
      function UserAiUsageTooltip(props: {
        active?: boolean
        payload?: Array<{ payload?: ChartDatum }>
      }) {
        return <UsageTooltip {...props} timeZone={chartTimezone} />
      },
    [chartTimezone],
  )

  if (!teams) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    )
  }

  if (teams.length === 0) {
    return <p className="py-6 text-sm text-gray-500">This user is not on any team you can see.</p>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="text-sm font-medium text-gray-900">AI limits</h2>
          {isFetching && data ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-gray-400" aria-label="Refreshing usage" />
          ) : null}
        </div>
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
          <label className="sr-only" htmlFor="user-ai-team">
            Team
          </label>
          <select
            id="user-ai-team"
            value={teamId}
            onChange={(event) => {
              setTeamId(event.target.value)
              setHydratedPolicyKey("")
              knownPeriodStartRef.current = null
            }}
            className="h-8 min-w-[10rem] max-w-full rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            {teams.map((team) => (
              <option key={team.team_id} value={String(team.team_id)}>
                {team.team_title}
              </option>
            ))}
          </select>
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
      </div>

      {showInitialLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      ) : isError ? (
        <div className="flex flex-col items-start gap-3 border-t border-gray-100 py-6 text-sm text-red-600">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error instanceof Error ? error.message : "Failed to load user AI usage"}</span>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <>
          <div className="grid gap-x-8 sm:grid-cols-2">
            <MetricRow
              label="Total tokens"
              value={formatCompactTokenCount(summary?.total_tokens ?? 0)}
              hint={formatExactTokenCount(summary?.total_tokens ?? 0)}
            />
            <MetricRow
              label="Prompt tokens"
              value={formatCompactTokenCount(summary?.prompt_tokens ?? 0)}
            />
            <MetricRow
              label="Completion tokens"
              value={formatCompactTokenCount(summary?.completion_tokens ?? 0)}
            />
            <MetricRow
              label="Calls"
              value={formatExactTokenCount(summary?.call_count ?? 0)}
            />
            <MetricRow
              label={hasFiniteLimit ? "Remaining today" : "Allowance"}
              value={
                hasFiniteLimit
                  ? formatCompactTokenCount(summary?.remaining_tokens ?? 0)
                  : "Unlimited"
              }
              hint={
                hasFiniteLimit && summary?.percent_used != null
                  ? `${Math.round(summary.percent_used)}% used · ${formatCompactTokenCount(summary.limit_tokens ?? 0)} limit`
                  : null
              }
            />
            {resetLabel ? <MetricRow label="Resets" value={resetLabel} /> : null}
          </div>

          <div className="min-w-0 space-y-3 border-t border-gray-100 pt-4">
            <div>
              <h3 className="text-sm font-medium text-gray-900">Token usage over time</h3>
              <p className="mt-0.5 text-xs text-gray-500">
                Daily prompt and completion tokens
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
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="grid gap-6 border-t border-gray-100 pt-4 sm:grid-cols-2">
            <div>
              <h3 className="text-sm font-medium text-gray-900">Usage by model</h3>
              <div className="mt-2">
                {(data?.by_model?.length ?? 0) === 0 ? (
                  <p className="py-2 text-sm text-gray-500">No model usage in this range.</p>
                ) : (
                  data?.by_model.map((row) => (
                    <div
                      key={`${row.provider}:${row.model}`}
                      className="flex items-center justify-between gap-3 border-b border-gray-100 py-2.5 last:border-b-0"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-gray-900">{row.model}</div>
                        <p className="truncate text-xs text-gray-500">{row.provider}</p>
                      </div>
                      <div className="shrink-0 text-right text-sm tabular-nums text-gray-900">
                        <div>{formatCompactTokenCount(row.total_tokens)}</div>
                        <div className="text-xs text-gray-500">
                          {formatExactTokenCount(row.call_count)} calls
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-900">Usage by project</h3>
              <div className="mt-2">
                {(data?.by_project?.length ?? 0) === 0 ? (
                  <p className="py-2 text-sm text-gray-500">No project usage in this range.</p>
                ) : (
                  data?.by_project.map((row) => (
                    <div
                      key={`${row.project_id ?? "none"}:${row.project_title}`}
                      className="flex items-center justify-between gap-3 border-b border-gray-100 py-2.5 last:border-b-0"
                    >
                      <div className="min-w-0 truncate text-sm font-medium text-gray-900">
                        {row.project_title}
                      </div>
                      <div className="shrink-0 text-right text-sm tabular-nums text-gray-900">
                        <div>{formatCompactTokenCount(row.total_tokens)}</div>
                        <div className="text-xs text-gray-500">
                          {formatExactTokenCount(row.call_count)} calls
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {showLimitsForm ? (
        <div className="space-y-4 border-t border-gray-100 pt-4">
          <div>
            <h3 className="text-sm font-medium text-gray-900">Daily limit for this user</h3>
            <p className="mt-0.5 text-xs text-gray-500">
              Per-user allowance on the selected team. Team-wide limits still apply separately.
            </p>
          </div>

          {!canManage ? (
            <div className="space-y-1 text-sm text-gray-600">
              {userPolicy ? (
                <>
                  <div>
                    Limit:{" "}
                    <span className="font-medium tabular-nums text-gray-900">
                      {formatExactTokenCount(userPolicy.daily_token_limit)} / day
                    </span>
                  </div>
                  <div>Warning at {userPolicy.warning_percent}%</div>
                </>
              ) : (
                <p>No per-user AI limit for this team.</p>
              )}
            </div>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="user-ai-daily-limit">Daily token limit</Label>
                  <Input
                    id="user-ai-daily-limit"
                    value={dailyLimit}
                    onChange={(e) => setDailyLimit(e.target.value)}
                    placeholder="e.g. 10000"
                    disabled={saveMutation.isPending}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="user-ai-warning">Warning at %</Label>
                  <Input
                    id="user-ai-warning"
                    value={warningPercent}
                    onChange={(e) => setWarningPercent(e.target.value)}
                    placeholder="80"
                    disabled={saveMutation.isPending}
                  />
                </div>
              </div>
              {formError ? <div className="text-sm text-red-600">{formError}</div> : null}
              {formStatus ? <div className="text-sm text-green-700">{formStatus}</div> : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() => saveMutation.mutate(false)}
                  disabled={!hasTeam || saveMutation.isPending}
                >
                  {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Save limits
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => saveMutation.mutate(true)}
                  disabled={!hasTeam || saveMutation.isPending || !userPolicy}
                >
                  Clear policy
                </Button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}

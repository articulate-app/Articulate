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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select"
import {
  formatCompactTokenCount,
  formatExactTokenCount,
} from "../../../features/ai-chat/ai-chat-usage"
import {
  listAiTokenLimitPolicies,
  setAiTokenLimit,
} from "@/lib/services/ai-token-limits"
import {
  MY_AI_USAGE_QUERY_KEY,
  TEAM_AI_USAGE_GRANULARITY,
  addDaysToDateString,
  bucketStartToDateString,
  fetchMyAiUsageTimeseries,
  fillTeamAiUsageSeries,
  formatBucketAxisLabel,
  formatBucketTooltipLabel,
  formatUsageResetDateTime,
  getDateStringInTimezone,
  resolveDefaultTeamTimezone,
  type MyAiUsageResponse,
  type TeamAiUsageSeriesPoint,
} from "@/lib/services/team-ai-usage"
import { getUserTeamsWithRoles, type UserTeamWithRole } from "@/lib/services/userSkillsAndMemberships"
import { useCurrentUserStore } from "../../store/current-user"
import { mergeWorkspaceUrlState } from "../../lib/workspace-url-state"

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
          <span>Prompt</span>
          <span className="font-medium tabular-nums">{formatExactTokenCount(point.prompt_tokens)}</span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <span>Completion</span>
          <span className="font-medium tabular-nums">
            {formatExactTokenCount(point.completion_tokens)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-6 border-t border-gray-100 pt-1">
          <span>Total</span>
          <span className="font-medium tabular-nums">{formatExactTokenCount(point.total_tokens)}</span>
        </div>
      </div>
    </div>
  )
}

function PersonalLimitEditor({
  teams,
  userId,
}: {
  teams: UserTeamWithRole[]
  userId: number
}) {
  const queryClient = useQueryClient()
  const fallbackTimezone = useMemo(() => resolveDefaultTeamTimezone(), [])
  const [teamId, setTeamId] = useState(() => (teams[0] ? String(teams[0].team_id) : ""))
  const [dailyLimit, setDailyLimit] = useState("")
  const [warningPercent, setWarningPercent] = useState("80")
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!teams.length) {
      setTeamId("")
      return
    }
    if (!teamId || !teams.some((team) => String(team.team_id) === teamId)) {
      setTeamId(String(teams[0].team_id))
    }
  }, [teamId, teams])

  const parsedTeamId = Number(teamId)
  const selectedTeam = teams.find((team) => team.team_id === parsedTeamId) ?? null

  const { data: policyPayload, isLoading } = useQuery({
    queryKey: [POLICIES_QUERY_KEY, parsedTeamId],
    enabled: Number.isFinite(parsedTeamId) && parsedTeamId > 0,
    queryFn: () => listAiTokenLimitPolicies(parsedTeamId),
  })

  const userPolicy = (policyPayload?.policies ?? []).find((policy) => policy.user_id === userId)
  const canManage = policyPayload?.can_manage === true

  useEffect(() => {
    if (!policyPayload) return
    if (userPolicy) {
      setDailyLimit(String(userPolicy.daily_token_limit ?? ""))
      setWarningPercent(String(userPolicy.warning_percent ?? 80))
    } else {
      setDailyLimit("")
      setWarningPercent("80")
    }
    setStatus(null)
    setError(null)
  }, [
    policyPayload,
    userPolicy?.id,
    userPolicy?.updated_at,
    userPolicy?.daily_token_limit,
    userPolicy?.warning_percent,
    parsedTeamId,
  ])

  const saveMutation = useMutation({
    mutationFn: async (clear: boolean) => {
      if (!selectedTeam) throw new Error("Select a team.")
      const parsedLimit = clear || dailyLimit.trim() === "" ? null : Number(dailyLimit)
      const parsedWarning = Number(warningPercent)
      if (parsedLimit != null && (!Number.isFinite(parsedLimit) || parsedLimit <= 0)) {
        throw new Error("Daily token limit must be a positive number or empty to clear.")
      }
      if (!Number.isFinite(parsedWarning) || parsedWarning <= 0 || parsedWarning >= 100) {
        throw new Error("Warning percent must be between 1 and 99.")
      }
      const { error: rpcError } = await setAiTokenLimit({
        teamId: selectedTeam.team_id,
        userId,
        dailyTokenLimit: parsedLimit,
        warningPercent: parsedWarning,
        timezone: userPolicy?.timezone || fallbackTimezone || "UTC",
        enabled: true,
      })
      if (rpcError) throw rpcError
      return clear || parsedLimit == null ? "cleared" : "saved"
    },
    onSuccess: async (result) => {
      setError(null)
      setStatus(result === "cleared" ? "Cleared." : "Saved.")
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [POLICIES_QUERY_KEY, parsedTeamId] }),
        queryClient.invalidateQueries({ queryKey: [MY_AI_USAGE_QUERY_KEY] }),
        queryClient.invalidateQueries({ queryKey: ["my-daily-ai-usage"] }),
      ])
    },
    onError: (saveError) => {
      setStatus(null)
      setError(saveError instanceof Error ? saveError.message : "Failed to save.")
    },
  })

  if (!teams.length) {
    return <p className="py-2 text-sm text-gray-500">Join a team to set a personal AI limit.</p>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 py-3">
        <span className="text-sm text-gray-700">Team</span>
        <Select value={teamId} onValueChange={setTeamId}>
          <SelectTrigger className="h-8 w-auto max-w-[14rem] gap-1 border-0 bg-transparent px-2 text-gray-900 hover:bg-gray-100 focus:ring-0 focus:ring-offset-0">
            <SelectValue placeholder="Select team" />
          </SelectTrigger>
          <SelectContent>
            {teams.map((team) => (
              <SelectItem key={team.team_id} value={String(team.team_id)}>
                {team.team_title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading limit…
        </div>
      ) : !canManage ? (
        <p className="text-sm text-gray-600">
          {userPolicy
            ? `${formatExactTokenCount(userPolicy.daily_token_limit)} / day · warn at ${userPolicy.warning_percent}%`
            : "No personal limit on this team."}
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="my-ai-daily-limit">Daily token limit</Label>
              <Input
                id="my-ai-daily-limit"
                value={dailyLimit}
                onChange={(e) => setDailyLimit(e.target.value)}
                placeholder="e.g. 10000"
                disabled={saveMutation.isPending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="my-ai-warning">Warning at %</Label>
              <Input
                id="my-ai-warning"
                value={warningPercent}
                onChange={(e) => setWarningPercent(e.target.value)}
                placeholder="80"
                disabled={saveMutation.isPending}
              />
            </div>
          </div>
          {error ? <div className="text-sm text-red-600">{error}</div> : null}
          {status ? <div className="text-sm text-green-700">{status}</div> : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => saveMutation.mutate(false)}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => saveMutation.mutate(true)}
              disabled={saveMutation.isPending || !userPolicy}
            >
              Clear
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

/**
 * Preferences → AI limits: total personal usage across teams (no team filter).
 */
export function AiTokenLimitsSettingsPanel() {
  const publicUserId = useCurrentUserStore((s) => s.publicUserId)
  const fallbackTimezone = useMemo(() => resolveDefaultTeamTimezone(), [])
  const knownPeriodStartRef = useRef<string | null>(null)
  const [preset, setPreset] = useState<RangePreset>("30")

  const activeRange = useMemo(
    () => buildRangeForPreset(preset, fallbackTimezone, knownPeriodStartRef.current),
    [preset, fallbackTimezone],
  )

  const { data: teams } = useQuery({
    queryKey: ["user-teams", publicUserId],
    enabled: !!publicUserId && publicUserId > 0,
    queryFn: async () => {
      const result = await getUserTeamsWithRoles(publicUserId!)
      if (result.error) throw result.error
      return result.data || []
    },
  })

  const {
    data,
    isLoading,
    isFetching,
    error,
    refetch,
    isError,
  } = useQuery<MyAiUsageResponse>({
    queryKey: [
      MY_AI_USAGE_QUERY_KEY,
      activeRange.from,
      activeRange.to,
      preset,
      TEAM_AI_USAGE_GRANULARITY,
    ],
    enabled: !!publicUserId && publicUserId > 0,
    placeholderData: (previous) => previous,
    retry: 1,
    queryFn: async () => {
      const range = buildRangeForPreset(preset, fallbackTimezone, knownPeriodStartRef.current)
      return fetchMyAiUsageTimeseries({
        dateFrom: range.from,
        dateTo: range.to,
        timezone: fallbackTimezone,
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
    { id: "7", label: "Last 7 days" },
    { id: "30", label: "Last 30 days" },
    { id: "90", label: "Last 90 days" },
  ]
  if (periodStart) {
    rangeOptions.push({ id: "period", label: "Current period" })
  }
  const activeRangeLabel =
    rangeOptions.find((option) => option.id === preset)?.label ?? "Last 30 days"

  const todayTokens = summary?.today_tokens ?? 0
  const todayPercent = hasFiniteLimit
    ? Math.min(100, Math.max(0, summary?.percent_used ?? 0))
    : null
  const todayMeterClass =
    todayPercent != null && todayPercent >= 100
      ? "bg-red-500"
      : todayPercent != null && todayPercent >= 80
        ? "bg-amber-500"
        : "bg-gray-900"

  const openTeams = () => {
    mergeWorkspaceUrlState(
      { settings: "open", settingsCategory: "teams" },
      { source: "ai-limits-view-by-team", mode: "push" },
    )
  }

  const renderTooltip = useMemo(
    () =>
      function MyAiUsageTooltip(props: {
        active?: boolean
        payload?: Array<{ payload?: ChartDatum }>
      }) {
        return <UsageTooltip {...props} timeZone={chartTimezone} />
      },
    [chartTimezone],
  )

  if (!publicUserId) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading…
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium text-gray-900">My AI usage</h2>
            {isFetching && data ? (
              <Loader2
                className="h-3.5 w-3.5 shrink-0 animate-spin text-gray-400"
                aria-label="Refreshing usage"
              />
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-gray-500">
            Total usage across all your teams.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
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
          <button
            type="button"
            onClick={openTeams}
            className="text-xs text-gray-500 underline-offset-2 hover:text-gray-800 hover:underline"
          >
            View by team
          </button>
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
            <span>{error instanceof Error ? error.message : "Failed to load AI usage"}</span>
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
                  <div className="text-xs text-gray-500">No personal daily limit</div>
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
              <h3 className="text-sm font-medium text-gray-900">Token usage over time</h3>
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
            <div>
              <h3 className="text-sm font-medium text-gray-900">Usage by team</h3>
              <div className="mt-2">
                {(data?.by_team?.length ?? 0) === 0 ? (
                  <p className="py-2 text-sm text-gray-500">No team usage in this range.</p>
                ) : (
                  data?.by_team.map((row) => (
                    <div
                      key={row.team_id}
                      className="flex items-center justify-between gap-3 border-b border-gray-100 py-2.5 last:border-b-0"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-gray-900">
                          {row.team_title}
                        </div>
                        {row.percent_used != null && row.limit_tokens != null ? (
                          <p className="truncate text-xs text-gray-500">
                            {Math.round(row.percent_used)}% of{" "}
                            {formatCompactTokenCount(row.limit_tokens)} limit
                          </p>
                        ) : null}
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

      <div className="space-y-2 border-t border-gray-100 pt-4">
        <div>
          <h3 className="text-sm font-medium text-gray-900">Personal daily limits</h3>
          <p className="mt-0.5 text-xs text-gray-500">
            Your personal allowance on a selected team. Team-wide limits are set on the team page.
          </p>
        </div>
        <PersonalLimitEditor teams={teams ?? []} userId={publicUserId} />
      </div>
    </div>
  )
}

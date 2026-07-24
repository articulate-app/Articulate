"use client"

import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { subDays, format, parseISO, isValid as isValidDate } from "date-fns"
import {
  Loader2,
  AlertCircle,
  Edit2,
  Plus,
  SlidersHorizontal,
  ArrowDownRight,
  ArrowUpRight,
  Minus,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { createClient } from "../../lib/supabase/client"
import { Card } from "../ui/card"
import { Button } from "../ui/button"
import { DateRangePicker } from "../ui/date-range-picker"
import { MultiSelect } from "../ui/multi-select"
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover"
import { Label } from "../ui/label"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
} from "recharts"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select"
import { ProjectAnalyticsSettings } from "./ProjectAnalyticsSettings"
import { ProjectAnalyticsPagesSection } from "./ProjectAnalyticsPagesSection"
import {
  CHART_LINE_STROKE,
  formatChartAxisDate,
} from "./chart-date-range-footer"
import {
  ChartPreviewDateRangeButton,
  ChartPreviewHoverActions,
} from "./chart-preview-hover-actions"

type PeriodType = "day" | "week" | "month"

type YMetric = "sessions" | "active_users"

export type ProjectAnalyticsPoint = {
  start_date: string
  end_date: string
  period_key: string
  channel_group: string
  active_users: number | null
  sessions: number | null
  avg_session_duration: number | null
}

export type ProjectAnalyticsChannelSummary = {
  channel_group: string
  total_active_users: number | null
  total_sessions: number | null
  avg_session_duration: number | null
  prev_total_active_users?: number | null
  prev_total_sessions?: number | null
  prev_avg_session_duration?: number | null
  sessions_change_pct?: number | null
  active_users_change_pct?: number | null
}

type TrendDirection = "up" | "down" | "flat" | "new"

function getTrendDirection(changePct: number | null | undefined, currentValue: number): TrendDirection {
  if (changePct == null) {
    return currentValue > 0 ? "new" : "flat"
  }
  if (changePct > 0.5) return "up"
  if (changePct < -0.5) return "down"
  return "flat"
}

function ChannelTrendBadge({
  changePct,
  currentValue,
  compact = false,
}: {
  changePct: number | null | undefined
  currentValue: number
  compact?: boolean
}) {
  const direction = getTrendDirection(changePct, currentValue)
  const Icon =
    direction === "up" ? ArrowUpRight : direction === "down" ? ArrowDownRight : Minus

  const label =
    direction === "new"
      ? "New"
      : changePct == null
        ? "—"
        : `${changePct > 0 ? "+" : ""}${decimalFormatter.format(changePct)}%`

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 font-medium",
        compact ? "text-[11px]" : "text-xs",
        direction === "up" && "text-emerald-600",
        direction === "down" && "text-rose-600",
        (direction === "flat" || direction === "new") && "text-gray-500",
      )}
      title="vs previous period of equal length"
    >
      <Icon className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
      <span>{label}</span>
    </span>
  )
}

type ProjectAnalyticsPropertyMapping = {
  id: number
  ga_property_id: string | null
}

export interface ProjectAnalyticsDateRange {
  from?: Date
  to?: Date
}

interface ProjectAnalyticsTabProps {
  projectId: number
  /** Overview embed: traffic chart + selectors only. */
  variant?: "full" | "preview"
  /** Controlled date range (overview shares one picker across charts). */
  dateRange?: ProjectAnalyticsDateRange
  onDateRangeChange?: (range: ProjectAnalyticsDateRange) => void
}

type DateRangeValue = ProjectAnalyticsDateRange

interface AnalyticsQueryResult {
  timeseries: ProjectAnalyticsPoint[]
  summary: ProjectAnalyticsChannelSummary[]
}

interface ChartDatum {
  periodKey: string
  label: string
  startDate: string
  endDate: string
  // dynamic numeric keys for each channel
  [key: string]: string | number | null
}

const PERIOD_LABELS: Record<PeriodType, string> = {
  day: "Daily",
  week: "Weekly",
  month: "Monthly",
}

const Y_METRIC_LABELS: Record<YMetric, string> = {
  sessions: "Sessions",
  active_users: "Active users",
}

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
})

const decimalFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
})

const formatSessionDuration = (seconds: number | null | undefined): string => {
  if (!seconds || isNaN(seconds)) {
    return "—"
  }
  const totalSeconds = Math.round(seconds)
  const minutes = Math.floor(totalSeconds / 60)
  const remainingSeconds = totalSeconds % 60

  if (minutes === 0) {
    return `${totalSeconds}s`
  }

  if (remainingSeconds === 0) {
    return `${minutes}m`
  }

  return `${minutes}m ${remainingSeconds}s`
}

const getPeriodLabel = (
  periodType: PeriodType,
  startDateStr: string,
  compact = false,
): string => {
  try {
    const date = parseISO(startDateStr)
    if (!isValidDate(date)) return startDateStr

    if (periodType === "day") {
      return compact ? formatChartAxisDate(startDateStr) : format(date, "MMM d, yyyy")
    }

    if (periodType === "week") {
      return compact ? format(date, "MMM d") : format(date, "yyyy-'W'II")
    }

    return format(date, "MMM yyyy")
  } catch {
    return startDateStr
  }
}

const getTooltipTitle = (periodType: PeriodType, startDateStr: string): string => {
  try {
    const date = parseISO(startDateStr)
    if (!isValidDate(date)) return startDateStr

    if (periodType === "day") {
      return format(date, "MMM d, yyyy")
    }

    if (periodType === "week") {
      return `Week of ${format(date, "MMM d, yyyy")}`
    }

    return format(date, "MMMM yyyy")
  } catch {
    return startDateStr
  }
}

const buildChannelKey = (channel: string, index: number): string => {
  const slug = channel.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")
  return `ch_${index}_${slug || "channel"}`
}

const computeOverallAverageDuration = (
  rows: ProjectAnalyticsChannelSummary[],
): number | null => {
  let totalWeighted = 0
  let totalSessions = 0

  for (const row of rows) {
    const sessions = Number(row.total_sessions ?? 0)
    const avg = Number(row.avg_session_duration ?? 0)

    if (sessions > 0 && avg > 0) {
      totalWeighted += sessions * avg
      totalSessions += sessions
    }
  }

  if (totalSessions === 0) return null

  return totalWeighted / totalSessions
}

function AnalyticsTooltip({
  active,
  payload,
  label,
  periodType,
  metricLabel,
}: {
  active?: boolean
  payload?: any[]
  label?: string
  periodType: PeriodType
  metricLabel: string
}) {
  if (!active || !payload || payload.length === 0) {
    return null
  }

  const firstPayload = payload[0]
  const data = firstPayload.payload as ChartDatum
  const title = getTooltipTitle(periodType, data.startDate)

  return (
    <div className="rounded-md border bg-white p-3 shadow-md text-xs">
      <div className="font-medium mb-1">{title}</div>
      <div className="space-y-1">
        {payload.map((entry) => {
          const value = entry.value as number | null
          const channelName = entry.name as string
          return (
            <div key={entry.dataKey} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: entry.color }}
                />
                <span>{channelName}</span>
              </div>
              <div className="flex flex-col items-end gap-0.5">
                <span className="font-semibold">
                  {typeof value === "number"
                    ? numberFormatter.format(value)
                    : "—"}{" "}
                  {metricLabel.toLowerCase()}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function ProjectAnalyticsTab({
  projectId,
  variant = "full",
  dateRange: controlledDateRange,
  onDateRangeChange,
}: ProjectAnalyticsTabProps) {
  const isPreview = variant === "preview"
  const [periodType, setPeriodType] = useState<PeriodType>("day")
  const [uncontrolledDateRange, setUncontrolledDateRange] = useState<DateRangeValue>(() => {
    const today = new Date()
    return {
      from: subDays(today, isPreview ? 6 : 29),
      to: today,
    }
  })
  const dateRange = controlledDateRange ?? uncontrolledDateRange
  const setDateRange = onDateRangeChange ?? setUncontrolledDateRange
  const [selectedChannels, setSelectedChannels] = useState<string[]>([])
  const [yMetric, setYMetric] = useState<YMetric>("sessions")
  const [filtersOpen, setFiltersOpen] = useState(false)

  const supabase = useMemo(() => createClient(), [])

  const from = dateRange.from
  const to = dateRange.to

  const queryEnabled = !!projectId && !!from && !!to

  const { data: gaMappings } = useQuery<ProjectAnalyticsPropertyMapping[]>({
    queryKey: ["project-analytics-mappings", projectId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("project_analytics_properties")
        .select("id, ga_property_id")
        .eq("project_id", projectId)

      if (error) {
        // Fail softly – analytics can still render without GA label
        console.error("Error loading analytics GA mapping:", error)
        throw error
      }

      return (data || []) as ProjectAnalyticsPropertyMapping[]
    },
  })

  const gaPropertyId =
    gaMappings && gaMappings.length > 0 ? gaMappings[0]?.ga_property_id : null

  const { data, isLoading, error } = useQuery<AnalyticsQueryResult>({
    queryKey: [
      "project-analytics",
      projectId,
      periodType,
      from ? from.toISOString().slice(0, 10) : null,
      to ? to.toISOString().slice(0, 10) : null,
    ],
    enabled: queryEnabled,
    queryFn: async () => {
      if (!from || !to) {
        return { timeseries: [], summary: [] }
      }

      const startDateStr = from.toISOString().slice(0, 10)
      const endDateStr = to.toISOString().slice(0, 10)

      const { data: timeseries, error: timeseriesError } =
        await (supabase as any).rpc("fn_get_project_analytics", {
          p_project_id: projectId,
          p_period_type: periodType,
          p_start_date: startDateStr,
          p_end_date: endDateStr,
        })

      const { data: summary, error: summaryError } =
        await (supabase as any).rpc("fn_get_project_analytics_channel_trends", {
          p_project_id: projectId,
          // Summary / trends should not depend on chart period granularity
          p_period_type: "day",
          p_start_date: startDateStr,
          p_end_date: endDateStr,
        })

      if (timeseriesError || summaryError) {
        const message =
          timeseriesError?.message ||
          summaryError?.message ||
          "Failed to load analytics"
        throw new Error(message)
      }

      return {
        timeseries: (timeseries || []) as ProjectAnalyticsPoint[],
        summary: (summary || []) as ProjectAnalyticsChannelSummary[],
      }
    },
  })

  const timeseries = data?.timeseries ?? []
  const summary = data?.summary ?? []

  const allChannels = useMemo(
    () =>
      Array.from(
        new Set(
          timeseries
            .map((item) => item.channel_group)
            .filter((c): c is string => !!c),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    [timeseries],
  )

  const selectableChannels = useMemo(
    () => allChannels.filter((channel) => channel !== "Total Traffic"),
    [allChannels],
  )

  useEffect(() => {
    if (allChannels.length === 0) return
    setSelectedChannels((prev) => {
      if (prev.length > 0) {
        const intersection = prev.filter((c) => selectableChannels.includes(c))
        if (intersection.length > 0) {
          return intersection
        }
      }
      // Default: no explicit channels selected (use Total Traffic internally)
      return []
    })
  }, [allChannels, selectableChannels])

  const channelOptions = selectableChannels.map((channel) => ({
    id: channel,
    label: channel,
  }))

  const filteredSummary = useMemo(() => {
    if (selectedChannels.length === 0) return summary
    return summary.filter((row) => selectedChannels.includes(row.channel_group))
  }, [summary, selectedChannels])

  const filteredTimeseries = useMemo(() => {
    if (selectedChannels.length === 0) {
      const hasTotalTraffic = timeseries.some(
        (row) => row.channel_group === "Total Traffic",
      )
      if (hasTotalTraffic) {
        return timeseries.filter(
          (row) => row.channel_group === "Total Traffic",
        )
      }
      return timeseries
    }
    return timeseries.filter((row) => selectedChannels.includes(row.channel_group))
  }, [timeseries, selectedChannels])

  const {
    chartData,
    channelKeyMap,
  }: { chartData: ChartDatum[]; channelKeyMap: Record<string, string> } =
    useMemo(() => {
      const channelKeyMapLocal: Record<string, string> = {}
      const periodMap = new Map<string, ChartDatum>()

        filteredTimeseries.forEach((row) => {
        const periodKey = row.period_key || row.start_date
        let periodDatum = periodMap.get(periodKey)

        if (!periodDatum) {
          periodDatum = {
            periodKey,
            label: getPeriodLabel(periodType, row.start_date, isPreview),
            startDate: row.start_date,
            endDate: row.end_date,
          }
          periodMap.set(periodKey, periodDatum)
        }

        const channel = row.channel_group
        if (!channelKeyMapLocal[channel]) {
          const index = Object.keys(channelKeyMapLocal).length
          channelKeyMapLocal[channel] = buildChannelKey(channel, index)
        }

        const metricValue =
          yMetric === "sessions" ? row.sessions ?? 0 : row.active_users ?? 0

        periodDatum[channelKeyMapLocal[channel]] = metricValue
      })

      const sorted = Array.from(periodMap.values()).sort((a, b) =>
        a.startDate.localeCompare(b.startDate),
      )

      return {
        chartData: sorted,
        channelKeyMap: channelKeyMapLocal,
      }
    }, [filteredTimeseries, isPreview, periodType, yMetric])

  const totalTrafficRow = useMemo(
    () => summary.find((row) => row.channel_group === "Total Traffic") ?? null,
    [summary],
  )

  const channelTrendRows = useMemo(
    () =>
      filteredSummary
        .filter((row) => row.channel_group !== "Total Traffic")
        .slice()
        .sort(
          (a, b) => Number(b.total_sessions ?? 0) - Number(a.total_sessions ?? 0),
        ),
    [filteredSummary],
  )

  const totalSessions = useMemo(() => {
    if (selectedChannels.length === 0 && totalTrafficRow) {
      return Number(totalTrafficRow.total_sessions ?? 0)
    }
    return channelTrendRows.reduce((acc, row) => acc + Number(row.total_sessions ?? 0), 0)
  }, [channelTrendRows, selectedChannels.length, totalTrafficRow])

  const totalActiveUsers = useMemo(() => {
    if (selectedChannels.length === 0 && totalTrafficRow) {
      return Number(totalTrafficRow.total_active_users ?? 0)
    }
    return channelTrendRows.reduce(
      (acc, row) => acc + Number(row.total_active_users ?? 0),
      0,
    )
  }, [channelTrendRows, selectedChannels.length, totalTrafficRow])

  const overallAvgDurationSeconds = computeOverallAverageDuration(
    selectedChannels.length === 0 && totalTrafficRow ? [totalTrafficRow] : channelTrendRows,
  )

  const overallSessionsChangePct = useMemo(() => {
    if (selectedChannels.length === 0 && totalTrafficRow) {
      return totalTrafficRow.sessions_change_pct ?? null
    }
    const prev = channelTrendRows.reduce(
      (acc, row) => acc + Number(row.prev_total_sessions ?? 0),
      0,
    )
    if (prev === 0) return totalSessions > 0 ? null : 0
    return Math.round(((totalSessions - prev) / prev) * 1000) / 10
  }, [channelTrendRows, selectedChannels.length, totalSessions, totalTrafficRow])

  const overallActiveUsersChangePct = useMemo(() => {
    if (selectedChannels.length === 0 && totalTrafficRow) {
      return totalTrafficRow.active_users_change_pct ?? null
    }
    const prev = channelTrendRows.reduce(
      (acc, row) => acc + Number(row.prev_total_active_users ?? 0),
      0,
    )
    if (prev === 0) return totalActiveUsers > 0 ? null : 0
    return Math.round(((totalActiveUsers - prev) / prev) * 1000) / 10
  }, [channelTrendRows, selectedChannels.length, totalActiveUsers, totalTrafficRow])

  const handlePeriodTypeChange = (next: PeriodType) => {
    setPeriodType(next)
  }

  const hasData = chartData.length > 0

  const analyticsFiltersControl = isPreview ? (
    <Popover open={filtersOpen} onOpenChange={setFiltersOpen} modal={false}>
      <PopoverTrigger
        type="button"
        aria-label="Chart filters"
        title="Chart filters"
        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-white/95 text-gray-600 shadow-sm backdrop-blur hover:bg-white hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
      </PopoverTrigger>
      <PopoverContent align="end" className="z-[80] w-72 space-y-3 p-3" sideOffset={6}>
        <div className="space-y-1.5">
          <Label className="text-xs text-gray-500">Channels</Label>
          <MultiSelect
            options={channelOptions}
            value={selectedChannels}
            onChange={setSelectedChannels}
            placeholder="All channels"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-gray-500">Period</Label>
          <Select
            value={periodType}
            onValueChange={(value: PeriodType) => handlePeriodTypeChange(value)}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["day", "week", "month"] as PeriodType[]).map((type) => (
                <SelectItem key={type} value={type} className="text-xs">
                  {PERIOD_LABELS[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-gray-500">Metric</Label>
          <Select value={yMetric} onValueChange={(value: YMetric) => setYMetric(value)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(Y_METRIC_LABELS) as YMetric[]).map((metric) => (
                <SelectItem key={metric} value={metric} className="text-xs">
                  {Y_METRIC_LABELS[metric]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </PopoverContent>
    </Popover>
  ) : (
    <div className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end">
      <Select
        value={periodType}
        onValueChange={(value: PeriodType) => handlePeriodTypeChange(value)}
      >
        <SelectTrigger className="h-8 w-[7.5rem] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(["day", "week", "month"] as PeriodType[]).map((type) => (
            <SelectItem key={type} value={type} className="text-xs">
              {PERIOD_LABELS[type]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={yMetric} onValueChange={(value: YMetric) => setYMetric(value)}>
        <SelectTrigger className="h-8 w-36 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(Y_METRIC_LABELS) as YMetric[]).map((metric) => (
            <SelectItem key={metric} value={metric} className="text-xs">
              {Y_METRIC_LABELS[metric]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )

  const summaryCards = (
    <div className={isPreview ? "grid gap-3 grid-cols-2 sm:grid-cols-3" : "grid gap-4 md:grid-cols-3 lg:grid-cols-4"}>
      <Card className={isPreview ? "border-0 bg-transparent p-0 shadow-none" : "p-4"}>
        <div className="text-xs font-medium text-gray-500">Total sessions</div>
        <div className={cn("flex items-baseline gap-2", isPreview ? "mt-0.5" : "mt-2")}>
          <span className={isPreview ? "text-lg font-semibold" : "text-2xl font-semibold"}>
            {numberFormatter.format(totalSessions)}
          </span>
          <ChannelTrendBadge
            changePct={overallSessionsChangePct}
            currentValue={totalSessions}
            compact={isPreview}
          />
        </div>
      </Card>
      <Card className={isPreview ? "border-0 bg-transparent p-0 shadow-none" : "p-4"}>
        <div className="text-xs font-medium text-gray-500">Total active users</div>
        <div className={cn("flex items-baseline gap-2", isPreview ? "mt-0.5" : "mt-2")}>
          <span className={isPreview ? "text-lg font-semibold" : "text-2xl font-semibold"}>
            {numberFormatter.format(totalActiveUsers)}
          </span>
          <ChannelTrendBadge
            changePct={overallActiveUsersChangePct}
            currentValue={totalActiveUsers}
            compact={isPreview}
          />
        </div>
      </Card>
      <Card className={isPreview ? "border-0 bg-transparent p-0 shadow-none" : "p-4"}>
        <div className="text-xs font-medium text-gray-500">Avg. session duration</div>
        <div className={isPreview ? "mt-0.5 text-lg font-semibold" : "mt-2 text-2xl font-semibold"}>
          {overallAvgDurationSeconds != null
            ? formatSessionDuration(overallAvgDurationSeconds)
            : "—"}
        </div>
      </Card>
      {!isPreview ? (
        <Card className="hidden p-4 lg:block">
          <div className="text-xs font-medium text-gray-500">Channels tracked</div>
          <div className="mt-2 text-2xl font-semibold">{channelTrendRows.length}</div>
        </Card>
      ) : null}
    </div>
  )

  const channelTrendsList =
    channelTrendRows.length === 0 ? null : (
      <div className="space-y-1.5">
        <div className="text-[11px] font-medium text-gray-500">Channel trends</div>
        <div className="divide-y divide-gray-100 rounded-md border border-gray-100">
          {channelTrendRows.slice(0, isPreview ? 6 : undefined).map((row) => {
            const sessions = Number(row.total_sessions ?? 0)
            const changePct =
              yMetric === "active_users"
                ? row.active_users_change_pct
                : row.sessions_change_pct
            const currentValue =
              yMetric === "active_users"
                ? Number(row.total_active_users ?? 0)
                : sessions
            return (
              <div
                key={row.channel_group}
                className="flex items-center justify-between gap-3 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-xs text-gray-900">{row.channel_group}</div>
                  <div className="text-[11px] text-gray-500">
                    {numberFormatter.format(currentValue)}{" "}
                    {yMetric === "active_users" ? "users" : "sessions"}
                  </div>
                </div>
                <ChannelTrendBadge
                  changePct={changePct}
                  currentValue={currentValue}
                  compact
                />
              </div>
            )
          })}
        </div>
      </div>
    )

  const showChartLegend = Object.keys(channelKeyMap).some(
    (channel) => channel !== "Total Traffic",
  )

  const trafficChartCard = (
    <Card
      className={
        isPreview
          ? "min-w-0 border-0 bg-transparent p-0 shadow-none focus-visible:outline-none focus-visible:ring-0"
          : "min-w-0 p-4 md:p-6 focus-visible:outline-none focus-visible:ring-0"
      }
    >
      {isPreview ? null : (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-gray-900">
              Traffic over time
            </h3>
          </div>
          <div className="flex shrink-0 items-center justify-end gap-2">
            {analyticsFiltersControl}
          </div>
        </div>
      )}

      <div className={isPreview ? "h-64 min-w-0" : "h-80 min-w-0"}>
        {isLoading && (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        )}

        {!isLoading && error && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-red-600">
            <AlertCircle className="h-5 w-5" />
            <span>
              {error instanceof Error ? error.message : "Failed to load analytics"}
            </span>
          </div>
        )}

        {!isLoading && !error && !hasData && (
          <div className="flex h-full flex-col items-center justify-center text-sm text-gray-500">
            <span>No analytics data for the selected range.</span>
          </div>
        )}

        {!isLoading && !error && hasData && (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={
                isPreview
                  ? { top: 8, right: 8, left: 0, bottom: 0 }
                  : { top: 5, right: 20, left: 0, bottom: 5 }
              }
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="label"
                stroke="#6b7280"
                style={{ fontSize: "12px" }}
                tickMargin={8}
              />
              <YAxis
                width={isPreview ? 36 : 48}
                stroke="#6b7280"
                style={{ fontSize: "12px" }}
                tickFormatter={(value) =>
                  typeof value === "number"
                    ? value >= 1000
                      ? `${decimalFormatter.format(value / 1000)}k`
                      : numberFormatter.format(value)
                    : ""
                }
              />
              <RechartsTooltip
                content={
                  <AnalyticsTooltip
                    periodType={periodType}
                    metricLabel={Y_METRIC_LABELS[yMetric]}
                  />
                }
              />
              {showChartLegend ? (
                <Legend
                  formatter={(value) =>
                    value === "Total Traffic" ? "" : value
                  }
                />
              ) : null}

              {Object.entries(channelKeyMap).map(([channel, key], index) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  name={channel === "Total Traffic" ? "Traffic" : channel}
                  stroke={CHART_LINE_STROKE}
                  strokeOpacity={
                    Object.keys(channelKeyMap).length > 1 && channel !== "Total Traffic"
                      ? Math.max(0.45, 1 - index * 0.15)
                      : 1
                  }
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  )

  if (isPreview) {
    const chartAvailable = !isLoading && !error && hasData
    return (
      <div className="min-w-0 space-y-3">
        {summaryCards}
        <ChartPreviewHoverActions
          enabled={chartAvailable}
          actions={
            <>
              {analyticsFiltersControl}
              <ChartPreviewDateRangeButton value={dateRange} onChange={setDateRange} />
            </>
          }
        >
          {trafficChartCard}
        </ChartPreviewHoverActions>
        {chartAvailable ? channelTrendsList : null}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-gray-900">Analytics</h2>
          {gaPropertyId && (
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <span>
                Google Analytics Property:{" "}
                <span className="font-mono text-gray-900">{gaPropertyId}</span>
              </span>
              <span className="inline-flex gap-1">
                <span
                  className="inline-flex h-5 w-5 items-center justify-center rounded border border-dashed border-gray-300 text-[10px] text-gray-500"
                  title="Edit property"
                >
                  <Edit2 className="h-3 w-3" />
                </span>
                <span
                  className="inline-flex h-5 w-5 items-center justify-center rounded border border-dashed border-gray-300 text-[10px] text-gray-500"
                  title="Add property"
                >
                  <Plus className="h-3 w-3" />
                </span>
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-wrap items-center justify-end gap-3">
          <div className="w-full md:w-64">
            <label className="mb-1 block text-xs font-medium text-gray-500">
              Date range
            </label>
            <DateRangePicker
              value={dateRange}
              onChange={(range) => {
                setDateRange(range)
              }}
            />
          </div>

          <div className="w-full md:w-72">
            <label className="mb-1 block text-xs font-medium text-gray-500">
              Channels
            </label>
            <MultiSelect
              options={channelOptions}
              value={selectedChannels}
              onChange={setSelectedChannels}
              placeholder="All channels"
            />
          </div>
        </div>
      </div>

      {!gaPropertyId && <ProjectAnalyticsSettings projectId={projectId} />}

      {summaryCards}

      {trafficChartCard}

      <Card className="p-4 md:p-6">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-900">
              Channel breakdown
            </h3>
            <p className="text-xs text-gray-500">
              Trend vs the previous period of equal length.
            </p>
          </div>
        </div>

        {channelTrendRows.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-500">
            No channel data for the selected range.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b bg-gray-50 text-xs font-medium uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-2">Channel</th>
                  <th className="px-4 py-2 text-right">Total sessions</th>
                  <th className="px-4 py-2 text-right">Sessions trend</th>
                  <th className="px-4 py-2 text-right">Total active users</th>
                  <th className="px-4 py-2 text-right">Users trend</th>
                  <th className="px-4 py-2 text-right">Avg. session duration</th>
                </tr>
              </thead>
              <tbody>
                {channelTrendRows.map((row) => {
                  const sessions = Number(row.total_sessions ?? 0)
                  const activeUsers = Number(row.total_active_users ?? 0)
                  return (
                    <tr key={row.channel_group} className="border-b last:border-0">
                      <td className="px-4 py-2 text-sm text-gray-900">
                        {row.channel_group}
                      </td>
                      <td className="px-4 py-2 text-right text-sm">
                        {numberFormatter.format(sessions)}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <ChannelTrendBadge
                          changePct={row.sessions_change_pct}
                          currentValue={sessions}
                        />
                      </td>
                      <td className="px-4 py-2 text-right text-sm">
                        {numberFormatter.format(activeUsers)}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <ChannelTrendBadge
                          changePct={row.active_users_change_pct}
                          currentValue={activeUsers}
                        />
                      </td>
                      <td className="px-4 py-2 text-right text-sm">
                        {formatSessionDuration(
                          row.avg_session_duration != null
                            ? Number(row.avg_session_duration)
                            : null,
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {from && to && (
        <ProjectAnalyticsPagesSection
          projectId={projectId}
          dateRange={{ from, to }}
          selectedMetric={yMetric === "sessions" ? "sessions" : "active_users"}
        />
      )}
    </div>
  )
}



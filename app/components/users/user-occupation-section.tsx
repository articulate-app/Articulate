"use client"

import { useEffect, useMemo, useState } from "react"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { Loader2, X } from "lucide-react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts"

import { Button } from "../ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select"
import { toast } from "../ui/use-toast"
import { CHART_LINE_STROKE } from "../projects/chart-date-range-footer"
import { UserOccupationStatCards } from "./user-overview-stat-cards"

type UserOccupationPoint = {
  user_id: number
  date: string
  total_hours: number
  occupation: number
  is_ooh: boolean | null
  ooh_type: string | null
}

type OccupationSummary = {
  today_occupation: number
  yesterday_occupation: number
  last_7d_avg_occupation: number
  last_30d_avg_occupation: number
}

type BacklogSummary = {
  backlog_hours: number
  backlog_days: number
}

type UserOccupationTask = {
  task_id: number
  title: string
  project_id: number
  project_name: string | null
  delivery_date: string | null
  publication_date: string | null
  is_overdue: boolean | null
  estimated_hours: number | null
}

type TimeFrame = "next7" | "last7" | "last30"

const OCCUPATION_QUICK_RANGES: { frame: TimeFrame; label: string }[] = [
  { frame: "next7", label: "Next 7 days" },
  { frame: "last7", label: "Last 7 days" },
  { frame: "last30", label: "Last 30 days" },
]

const supabase = createClientComponentClient()

function formatOccupationDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function toDateString(date: Date) {
  return date.toISOString().split("T")[0]
}

function getOccupationDateRange(frame: TimeFrame): { startDate: string; endDate: string } {
  const today = new Date()
  let startDate: Date
  let endDate: Date

  switch (frame) {
    case "next7":
      startDate = new Date(today)
      endDate = new Date(today)
      endDate.setDate(endDate.getDate() + 7)
      break
    case "last7":
      startDate = new Date(today)
      startDate.setDate(startDate.getDate() - 7)
      endDate = new Date(today)
      break
    case "last30":
      startDate = new Date(today)
      startDate.setDate(startDate.getDate() - 30)
      endDate = new Date(today)
      break
  }

  return {
    startDate: toDateString(startDate),
    endDate: toDateString(endDate),
  }
}

function OccupationTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload?: { date: string; occupation: number; totalHours: number; isOoh?: boolean } }>
}) {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload
  if (!point) return null
  return (
    <div className="border border-gray-200 bg-white px-3 py-2 text-xs shadow-sm">
      <div className="font-medium text-gray-900">{point.date}</div>
      <div className="mt-1 text-gray-700">
        Occupation: <span className="font-medium tabular-nums">{point.occupation}%</span>
      </div>
      <div className="text-gray-700">
        Hours: <span className="font-medium tabular-nums">{point.totalHours}</span>
      </div>
      {point.isOoh ? <div className="mt-1 text-orange-600">Out of hours</div> : null}
    </div>
  )
}

type UserOccupationSectionProps = {
  userId: number
  compact?: boolean
}

export function UserOccupationSection({ userId, compact = false }: UserOccupationSectionProps) {
  const [occupationData, setOccupationData] = useState<UserOccupationPoint[]>([])
  const [isLoadingOccupation, setIsLoadingOccupation] = useState(true)
  const [occupationTimeFrame, setOccupationTimeFrame] = useState<TimeFrame>("last7")
  const [occupationSummary, setOccupationSummary] = useState<OccupationSummary | null>(null)
  const [occupationBacklog, setOccupationBacklog] = useState<BacklogSummary | null>(null)
  const [isLoadingSummary, setIsLoadingSummary] = useState(true)
  const [selectedOccupationDate, setSelectedOccupationDate] = useState<string | null>(null)
  const [occupationTasks, setOccupationTasks] = useState<UserOccupationTask[]>([])
  const [isLoadingOccupationTasks, setIsLoadingOccupationTasks] = useState(false)

  useEffect(() => {
    void loadSummary()
    void loadBacklog()
  }, [userId])

  useEffect(() => {
    void loadOccupationData(occupationTimeFrame)
  }, [userId, occupationTimeFrame])

  useEffect(() => {
    if (selectedOccupationDate) void loadOccupationTasks(selectedOccupationDate)
  }, [selectedOccupationDate, userId])

  const loadSummary = async () => {
    setIsLoadingSummary(true)
    try {
      const { data, error } = await supabase.rpc("fn_get_user_occupation_summary", {
        p_user_id: userId,
      })
      if (error) throw error
      setOccupationSummary(Array.isArray(data) ? data[0] : data)
    } catch (error) {
      console.error("Error loading occupation summary:", error)
      toast({ title: "Error", description: "Failed to load occupation summary", variant: "destructive" })
    } finally {
      setIsLoadingSummary(false)
    }
  }

  const loadBacklog = async () => {
    try {
      const { data, error } = await supabase.rpc("fn_get_user_backlog", { p_user_id: userId })
      if (error) throw error
      setOccupationBacklog(Array.isArray(data) ? data[0] : data)
    } catch (error) {
      console.error("Error loading occupation backlog:", error)
    }
  }

  const loadOccupationTasks = async (date: string) => {
    setIsLoadingOccupationTasks(true)
    try {
      const { data, error } = await supabase.rpc("fn_get_user_tasks_for_date", {
        p_user_id: userId,
        p_date: date,
      })
      if (error) throw error
      setOccupationTasks(data || [])
    } catch (error) {
      console.error("Error loading occupation tasks:", error)
      toast({ title: "Error", description: "Failed to load tasks for date", variant: "destructive" })
    } finally {
      setIsLoadingOccupationTasks(false)
    }
  }

  const loadOccupationData = async (frame: TimeFrame) => {
    setIsLoadingOccupation(true)
    try {
      const { startDate, endDate } = getOccupationDateRange(frame)
      const { data, error } = await supabase.rpc("fn_get_user_occupation", {
        p_user_id: userId,
        p_start_date: startDate,
        p_end_date: endDate,
      })
      if (error) throw error
      setOccupationData(data || [])
    } catch (error) {
      console.error("Error loading occupation data:", error)
      toast({ title: "Error", description: "Failed to load occupation data", variant: "destructive" })
    } finally {
      setIsLoadingOccupation(false)
    }
  }

  const chartData = useMemo(() => {
    const range = getOccupationDateRange(occupationTimeFrame)
    const startDate = new Date(range.startDate)
    const endDate = new Date(range.endDate)

    const dataMap = new Map<string, UserOccupationPoint>()
    occupationData.forEach((point) => dataMap.set(point.date, point))

    const rows: Array<{
      date: string
      rawDate: string
      occupation: number
      totalHours: number
      isOoh: boolean
      isToday: boolean
    }> = []
    const currentDate = new Date(startDate)
    const todayStr = toDateString(new Date())

    while (currentDate <= endDate) {
      const dateStr = toDateString(currentDate)
      const existing = dataMap.get(dateStr)
      rows.push({
        date: formatOccupationDate(dateStr),
        rawDate: dateStr,
        occupation: existing ? Math.round(existing.occupation * 100) : 0,
        totalHours: existing?.total_hours ?? 0,
        isOoh: Boolean(existing?.is_ooh),
        isToday: dateStr === todayStr,
      })
      currentDate.setDate(currentDate.getDate() + 1)
    }
    return rows
  }, [occupationData, occupationTimeFrame])

  const chartHeight = compact ? 220 : 280
  const activeRangeLabel =
    OCCUPATION_QUICK_RANGES.find((option) => option.frame === occupationTimeFrame)?.label ?? "Last 7d"

  return (
    <div className="space-y-4">
      {isLoadingSummary ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      ) : (
        <UserOccupationStatCards
          cards={[
            {
              id: "today",
              label: "Today",
              value: `${Math.round((occupationSummary?.today_occupation || 0) * 100)}%`,
            },
            {
              id: "yesterday",
              label: "Yesterday",
              value: `${Math.round((occupationSummary?.yesterday_occupation || 0) * 100)}%`,
            },
            {
              id: "last-7d",
              label: "Last 7 days",
              value: `${Math.round((occupationSummary?.last_7d_avg_occupation || 0) * 100)}%`,
            },
            {
              id: "last-30d",
              label: "Last 30 days",
              value: `${Math.round((occupationSummary?.last_30d_avg_occupation || 0) * 100)}%`,
            },
            {
              id: "backlog",
              label: "Backlog",
              value: `${occupationBacklog?.backlog_days?.toFixed(1) || 0}d`,
              valueClassName: "text-orange-600",
            },
          ]}
        />
      )}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-medium text-gray-900">Occupation timeline</h3>
          <Select
            value={occupationTimeFrame}
            onValueChange={(value) => {
              setOccupationTimeFrame(value as TimeFrame)
              setSelectedOccupationDate(null)
            }}
          >
            <SelectTrigger className="h-8 w-auto gap-1 border-0 bg-transparent px-2 text-gray-900 hover:bg-gray-100 focus:ring-0 focus:ring-offset-0">
              <SelectValue>{activeRangeLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {OCCUPATION_QUICK_RANGES.map(({ frame, label }) => (
                <SelectItem key={frame} value={frame}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="min-w-0">
          {isLoadingOccupation ? (
            <div className="flex items-center justify-center" style={{ height: chartHeight }}>
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={chartHeight} minWidth={0}>
              <AreaChart
                data={chartData}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                onClick={(data: any) => {
                  const rawDate = data?.activePayload?.[0]?.payload?.rawDate
                  if (rawDate) setSelectedOccupationDate(rawDate)
                }}
              >
                <defs>
                  <linearGradient id="occupationFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART_LINE_STROKE} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={CHART_LINE_STROKE} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                <XAxis
                  dataKey="date"
                  stroke="#9ca3af"
                  style={{ fontSize: "11px" }}
                  tickMargin={8}
                  minTickGap={24}
                  axisLine={{ stroke: "#e5e7eb" }}
                  tickLine={false}
                />
                <YAxis
                  width={36}
                  stroke="#9ca3af"
                  style={{ fontSize: "11px" }}
                  domain={[0, 120]}
                  ticks={[0, 40, 80, 100, 120]}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value) => `${value}%`}
                />
                <RechartsTooltip content={OccupationTooltip as never} cursor={{ stroke: "#d1d5db" }} />
                <Area
                  type="monotone"
                  dataKey="occupation"
                  stroke={CHART_LINE_STROKE}
                  strokeWidth={2}
                  fill="url(#occupationFill)"
                  isAnimationActive={false}
                  dot={false}
                  activeDot={{
                    r: 5,
                    stroke: "#fff",
                    strokeWidth: 2,
                    fill: CHART_LINE_STROKE,
                    cursor: "pointer",
                  }}
                  name="Occupation %"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {selectedOccupationDate ? (
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium text-gray-900">
              Tasks for{" "}
              {new Date(selectedOccupationDate).toLocaleDateString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
            </h3>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setSelectedOccupationDate(null)}
              aria-label="Clear selected date"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {isLoadingOccupationTasks ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            </div>
          ) : occupationTasks.length === 0 ? (
            <p className="py-4 text-sm text-gray-500">No tasks scheduled for this date.</p>
          ) : (
            <div>
              {occupationTasks.map((task) => (
                <div
                  key={task.task_id}
                  className="flex items-start justify-between gap-3 border-b border-gray-100 py-2.5 last:border-b-0"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-gray-900">
                      {task.title}
                      {task.is_overdue ? (
                        <span className="ml-2 text-xs font-normal text-red-600">Overdue</span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-gray-500">
                      {[
                        task.project_name,
                        task.delivery_date
                          ? `Delivery ${new Date(task.delivery_date).toLocaleDateString()}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  {task.estimated_hours != null ? (
                    <div className="shrink-0 text-sm font-medium tabular-nums text-gray-900">
                      {task.estimated_hours}h
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}

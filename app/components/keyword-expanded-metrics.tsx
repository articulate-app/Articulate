"use client"

import React, { useMemo } from "react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import type { KeywordMonthlySearchVolume } from "../lib/keyword-ideas-metrics"
import { cn } from "@/lib/utils"

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]

function formatCompactVolume(volume: number): string {
  const value = Number.isFinite(volume) ? Math.max(0, volume) : 0
  if (value >= 1_000_000) {
    const millions = value / 1_000_000
    const rounded = millions >= 10 ? Math.round(millions) : Math.round(millions * 10) / 10
    return `${rounded}M`
  }
  if (value >= 1_000) {
    const thousands = value / 1_000
    const rounded = thousands >= 10 ? Math.round(thousands) : Math.round(thousands * 10) / 10
    return `${rounded}k`
  }
  return String(Math.round(value))
}

function difficultyTone(competitionIndex: number): {
  label: string
  boxClassName: string
  textClassName: string
} {
  if (competitionIndex >= 70) {
    return {
      label: "Hard",
      boxClassName: "border-rose-200 bg-rose-50",
      textClassName: "text-rose-700",
    }
  }
  if (competitionIndex >= 40) {
    return {
      label: "Medium",
      boxClassName: "border-amber-200 bg-amber-50",
      textClassName: "text-amber-700",
    }
  }
  return {
    label: "Easy",
    boxClassName: "border-emerald-200 bg-emerald-50",
    textClassName: "text-emerald-700",
  }
}

export function KeywordDifficultyBadge({
  competitionIndex,
  size = "sm",
  variant = "badge",
  className,
}: {
  competitionIndex: number
  size?: "sm" | "lg"
  /** Plain text label (no chip background) for compact lists. */
  variant?: "badge" | "plain"
  className?: string
}) {
  const tone = difficultyTone(competitionIndex)
  if (variant === "plain") {
    return (
      <span
        className={cn("text-[11px] font-medium tabular-nums", tone.textClassName, className)}
        title={`Keyword difficulty: ${tone.label} (${competitionIndex})`}
      >
        {tone.label}
      </span>
    )
  }
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded border font-medium tabular-nums",
        size === "sm"
          ? "h-5 min-w-[3.25rem] px-1.5 text-[10px] leading-none"
          : "h-8 min-w-[4.5rem] px-2.5 text-sm",
        tone.boxClassName,
        tone.textClassName,
        className,
      )}
      title={`Keyword difficulty: ${tone.label} (${competitionIndex})`}
    >
      {tone.label}
    </span>
  )
}

type KeywordExpandedMetricsProps = {
  avgMonthlySearches: number
  competitionIndex: number
  volumes?: KeywordMonthlySearchVolume[] | null
  /** Compact card for dense SEO lists (smaller type + chart). */
  size?: "md" | "sm"
}

export function KeywordExpandedMetrics({
  avgMonthlySearches,
  competitionIndex,
  volumes,
  size = "md",
}: KeywordExpandedMetricsProps) {
  const isCompact = size === "sm"
  const chartData = useMemo(() => {
    if (!volumes?.length) return []
    return volumes.map((row) => ({
      key: `${row.year}-${row.month}`,
      label: `${MONTH_SHORT[Math.max(0, Math.min(11, row.month - 1))]} ${String(row.year).slice(-2)}`,
      volume: Math.max(0, row.monthlySearches),
    }))
  }, [volumes])

  const latest = volumes && volumes.length > 0 ? volumes[volumes.length - 1] : null
  const latestVolume = latest?.monthlySearches ?? avgMonthlySearches
  const latestLabel = latest
    ? `${MONTH_SHORT[Math.max(0, Math.min(11, latest.month - 1))]} ${latest.year}`
    : "Avg monthly"

  const chart = chartData.length >= 2 ? (
    <div className={cn("w-full", isCompact ? "h-16" : "h-28")}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <AreaChart
          data={chartData}
          margin={isCompact ? { top: 2, right: 2, left: 0, bottom: 0 } : { top: 4, right: 4, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="keywordVolumeFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.28} />
              <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: isCompact ? 9 : 10, fill: "#9ca3af" }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={isCompact ? 20 : 28}
            hide={isCompact}
          />
          <YAxis
            width={isCompact ? 28 : 36}
            tick={{ fontSize: isCompact ? 9 : 10, fill: "#9ca3af" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: number) => formatCompactVolume(value)}
            hide={isCompact}
          />
          <Tooltip
            cursor={{ stroke: "#cbd5e1", strokeWidth: 1 }}
            contentStyle={{
              borderRadius: 8,
              border: "1px solid #e5e7eb",
              fontSize: isCompact ? 11 : 12,
              padding: isCompact ? "4px 6px" : "6px 8px",
            }}
            formatter={(value: number | string) => [
              formatCompactVolume(Number(value)),
              "Volume",
            ]}
          />
          <Area
            type="monotone"
            dataKey="volume"
            stroke="#0ea5e9"
            strokeWidth={isCompact ? 1.5 : 1.75}
            fill="url(#keywordVolumeFill)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  ) : (
    <p className={cn("text-gray-500", isCompact ? "text-[11px]" : "text-xs")}>
      No monthly volume history for this keyword.
    </p>
  )

  return (
    <div
      className={cn(
        "rounded-md border border-gray-100 bg-gray-50/60",
        isCompact ? "space-y-2 px-2.5 py-2" : "space-y-3 px-3 py-3",
      )}
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
            Latest volume
          </div>
          <div
            className={cn(
              "mt-0.5 font-semibold tabular-nums tracking-tight text-gray-900",
              isCompact ? "text-base" : "text-xl",
            )}
          >
            {formatCompactVolume(latestVolume)}
          </div>
          <div className={cn("text-gray-500", isCompact ? "text-[10px]" : "text-[11px]")}>
            {latestLabel}
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
            Difficulty
          </div>
          <div className={cn("flex items-center gap-2", isCompact ? "mt-1" : "mt-1.5")}>
            <KeywordDifficultyBadge
              competitionIndex={competitionIndex}
              size={isCompact ? "sm" : "lg"}
            />
            <span className={cn("tabular-nums text-gray-500", isCompact ? "text-[11px]" : "text-xs")}>
              {competitionIndex}/100
            </span>
          </div>
        </div>
      </div>
      {chart}
    </div>
  )
}

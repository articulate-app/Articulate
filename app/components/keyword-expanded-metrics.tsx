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
  className,
}: {
  competitionIndex: number
  size?: "sm" | "lg"
  className?: string
}) {
  const tone = difficultyTone(competitionIndex)
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
}

export function KeywordExpandedMetrics({
  avgMonthlySearches,
  competitionIndex,
  volumes,
}: KeywordExpandedMetricsProps) {
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

  return (
    <div className="space-y-3 rounded-md border border-gray-100 bg-gray-50/60 px-3 py-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
            Latest volume
          </div>
          <div className="mt-0.5 text-xl font-semibold tabular-nums tracking-tight text-gray-900">
            {formatCompactVolume(latestVolume)}
          </div>
          <div className="text-[11px] text-gray-500">{latestLabel}</div>
        </div>
        <div className="min-w-0">
          <div className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
            Difficulty
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <KeywordDifficultyBadge competitionIndex={competitionIndex} size="lg" />
            <span className="text-xs tabular-nums text-gray-500">{competitionIndex}/100</span>
          </div>
        </div>
      </div>

      {chartData.length >= 2 ? (
        <div className="h-28 w-full">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="keywordVolumeFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "#9ca3af" }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                minTickGap={28}
              />
              <YAxis
                width={36}
                tick={{ fontSize: 10, fill: "#9ca3af" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value: number) => formatCompactVolume(value)}
              />
              <Tooltip
                cursor={{ stroke: "#cbd5e1", strokeWidth: 1 }}
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                  fontSize: 12,
                  padding: "6px 8px",
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
                strokeWidth={1.75}
                fill="url(#keywordVolumeFill)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="text-xs text-gray-500">No monthly volume history for this keyword.</p>
      )}
    </div>
  )
}

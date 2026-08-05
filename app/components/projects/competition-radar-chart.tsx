"use client"

import { useMemo } from "react"
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
} from "recharts"
import { Card } from "../ui/card"
import { cn } from "@/lib/utils"
import {
  buildCompetitiveRadarData,
  type CompetitiveRadarChartPoint,
  type SocialSummaryEntityMetrics,
} from "@/lib/project-social-summary"

const ENTITY_COLORS = [
  "#2563eb",
  "#059669",
  "#d97706",
  "#dc2626",
  "#0891b2",
  "#4b5563",
  "#7c2d12",
]

function formatCount(value: number | null | undefined): string {
  if (value == null) return "—"
  return new Intl.NumberFormat("en-US").format(Math.round(value))
}

type CompetitionRadarChartProps = {
  entities: SocialSummaryEntityMetrics[]
  totalsPosts: number
  compact?: boolean
  className?: string
  /** Skip Card wrapper (for embedding beside the comparison table). */
  bare?: boolean
  showTitle?: boolean
  showLegend?: boolean
  /** entity_id → favicon URL, used to brand the legend rows. */
  faviconByEntityId?: Map<string, string | null>
}

type RadarTooltipPayload = {
  dataKey?: string | number
  name?: string
  color?: string
  payload?: CompetitiveRadarChartPoint
}

function RadarTooltipContent({
  active,
  payload,
}: {
  active?: boolean
  payload?: RadarTooltipPayload[]
}) {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload
  if (!point) return null

  return (
    <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs shadow-sm">
      <p className="mb-1.5 font-medium text-gray-900">{point.metricLabel}</p>
      <ul className="space-y-1">
        {payload.map((entry) => {
          const key = String(entry.dataKey ?? "")
          const raw = point.raw?.[key] ?? null
          return (
            <li
              key={key}
              className="flex items-center justify-between gap-4 text-gray-700"
            >
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: entry.color }}
                />
                {entry.name}
              </span>
              <span className="font-medium tabular-nums text-gray-900">
                {formatCount(raw)}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function CompetitionRadarChart({
  entities,
  totalsPosts,
  compact = false,
  className,
  bare = false,
  showTitle = true,
  showLegend = true,
  faviconByEntityId,
}: CompetitionRadarChartProps) {
  const radar = useMemo(
    () =>
      buildCompetitiveRadarData(entities, {
        maxCompetitors: compact ? 3 : 5,
      }),
    [compact, entities],
  )

  const emptyMessage =
    totalsPosts === 0
      ? "No tracked posts in this period to compare. Sync brand and competitor profiles to populate the radar."
      : "Insufficient metric data to build a comparison radar for this period."

  if (totalsPosts === 0 || !radar.hasComparableData) {
    const empty = (
      <div className={cn("p-4", bare && "px-3 py-4", className)}>
        {showTitle ? (
          <h3 className="text-sm font-medium text-gray-900">Comparison radar</h3>
        ) : null}
        <p className={cn("text-sm text-gray-500", showTitle && "mt-2")}>{emptyMessage}</p>
      </div>
    )
    return bare ? empty : <Card className={cn("p-0", className)}>{empty}</Card>
  }

  const chart = (
    <div className={cn(bare ? "px-3 py-3" : "p-4", className)}>
      {showTitle ? (
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-medium text-gray-900">Comparison radar</h3>
          <p className="text-[11px] text-gray-500">Axes scaled 0–100 vs period max</p>
        </div>
      ) : null}
      <div className={cn(compact ? "h-56" : "h-72")}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={radar.chartData} cx="50%" cy="50%" outerRadius="72%">
            <PolarGrid stroke="#e5e7eb" />
            <PolarAngleAxis
              dataKey="metricLabel"
              tick={{ fontSize: 11, fill: "#6b7280" }}
            />
            <PolarRadiusAxis
              angle={90}
              domain={[0, 100]}
              tick={false}
              axisLine={false}
            />
            <RechartsTooltip content={<RadarTooltipContent />} />
            {radar.entities.map((entity, index) => (
              <Radar
                key={entity.entity_id}
                name={entity.entity_name}
                dataKey={entity.dataKey}
                stroke={ENTITY_COLORS[index % ENTITY_COLORS.length]}
                fill={ENTITY_COLORS[index % ENTITY_COLORS.length]}
                fillOpacity={entity.is_owned ? 0.22 : 0.1}
                strokeWidth={entity.is_owned ? 2.25 : 1.5}
              />
            ))}
          </RadarChart>
        </ResponsiveContainer>
      </div>
      {showLegend ? (
        <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-500">
          {radar.entities.map((entity, index) => {
            const favicon = faviconByEntityId?.get(entity.entity_id) ?? null
            return (
            <li key={entity.entity_id} className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{
                  backgroundColor: ENTITY_COLORS[index % ENTITY_COLORS.length],
                }}
              />
              {favicon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={favicon}
                  alt=""
                  width={14}
                  height={14}
                  loading="lazy"
                  className="h-3.5 w-3.5 shrink-0 rounded-sm"
                />
              ) : null}
              <span className="text-gray-700">{entity.entity_name}</span>
              {entity.is_owned ? (
                <span className="rounded bg-sky-50 px-1 py-0.5 font-medium text-sky-700">
                  Our brand
                </span>
              ) : null}
            </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )

  return bare ? chart : <Card className={cn("p-0", className)}>{chart}</Card>
}

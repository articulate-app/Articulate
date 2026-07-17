"use client"

import React from "react"
import { IconTooltip } from "../../../app/components/ui/icon-tooltip"
import { cn } from "../../../app/lib/utils"

export const KEYWORD_METRIC_DEFINITIONS = {
  uses: {
    label: "Uses",
    tooltip: "How many times this keyword appears in channel content.",
  },
  density: {
    label: "Share",
    tooltip: "Keyword density — share of words in content that match this keyword.",
  },
  volume: {
    label: "SV",
    tooltip: "Average monthly search volume in the selected region.",
  },
  difficulty: {
    label: "KD",
    tooltip: "Keyword difficulty (competition index). Higher values mean stronger competition.",
  },
} as const

type KeywordMetricStatProps = {
  metric: keyof typeof KEYWORD_METRIC_DEFINITIONS
  valueClassName?: string
  children: React.ReactNode
}

export function KeywordMetricStat({ metric, valueClassName, children }: KeywordMetricStatProps) {
  const definition = KEYWORD_METRIC_DEFINITIONS[metric]
  return (
    <IconTooltip label={definition.tooltip} side="top">
      <span className="inline-flex cursor-default items-baseline gap-0.5">
        <span className="text-[10px] font-medium uppercase tracking-wide text-gray-300">
          {definition.label}
        </span>
        <span className={cn("text-[11px] tabular-nums text-gray-500", valueClassName)}>{children}</span>
      </span>
    </IconTooltip>
  )
}

export function KeywordMetricSeparator() {
  return <span aria-hidden className="text-gray-300">·</span>
}

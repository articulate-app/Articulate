"use client"

import React, { useMemo } from "react"
import type { KeywordMonthlySearchVolume } from "../lib/keyword-ideas-metrics"
import { cn } from "@/lib/utils"

type KeywordVolumeSparklineProps = {
  volumes?: KeywordMonthlySearchVolume[] | null
  className?: string
  width?: number
  height?: number
}

export function KeywordVolumeSparkline({
  volumes,
  className,
  width = 56,
  height = 18,
}: KeywordVolumeSparklineProps) {
  const path = useMemo(() => {
    if (!volumes || volumes.length < 2) return null
    const values = volumes.map((v) => Math.max(0, v.monthlySearches))
    const max = Math.max(...values, 1)
    const min = Math.min(...values, 0)
    const range = Math.max(max - min, 1)
    const padY = 1.5
    const innerH = height - padY * 2
    const step = width / (values.length - 1)

    return values
      .map((value, index) => {
        const x = index * step
        const y = padY + innerH - ((value - min) / range) * innerH
        return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`
      })
      .join(" ")
  }, [height, volumes, width])

  if (!path) return null

  const title =
    volumes && volumes.length > 0
      ? `Monthly search volume (${volumes.length} mo)`
      : "Monthly search volume"

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn("shrink-0 text-sky-500", className)}
      aria-label={title}
      role="img"
    >
      <title>{title}</title>
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

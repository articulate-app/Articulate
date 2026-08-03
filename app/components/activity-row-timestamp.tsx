"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"

/**
 * Parse activity timestamps robustly.
 * Naive Postgres timestamps (no timezone) are treated as UTC so local offsets
 * (e.g. WEST UTC+1) do not falsely show "1 hour ago" for brand-new rows.
 */
export function parseActivityDate(dateString: string | null | undefined): Date | null {
  if (!dateString) return null
  const raw = String(dateString).trim()
  if (!raw) return null

  const naiveMatch = raw.match(
    /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2}(?:\.\d+)?)(.*)$/,
  )
  if (naiveMatch) {
    const [, day, time, suffix] = naiveMatch
    const rest = (suffix ?? "").trim()
    if (!rest) {
      const utc = new Date(`${day}T${time}Z`)
      return Number.isNaN(utc.getTime()) ? null : utc
    }
  }

  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Relative time string (e.g. "Just now", "5 mins ago", "12 days ago"). */
export function getActivityRelativeTimeLabel(dateString: string | null | undefined): string {
  const date = parseActivityDate(dateString)
  if (!date) return "—"
  const diffMs = Math.max(0, Date.now() - date.getTime())
  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffSecs < 45) return "Just now"
  if (diffMins < 60) return `${Math.max(1, diffMins)} min${diffMins === 1 ? "" : "s"} ago`
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`
  if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7)
    return `${weeks} week${weeks === 1 ? "" : "s"} ago`
  }
  if (diffDays < 365) {
    const months = Math.floor(diffDays / 30)
    return `${months} month${months === 1 ? "" : "s"} ago`
  }
  const years = Math.floor(diffDays / 365)
  return `${years} year${years === 1 ? "" : "s"} ago`
}

/** Absolute short stamp for secondary / hover display (HH:MM · MM/YY). */
export function formatActivityDateShort(dateString: string | null | undefined): string {
  const date = parseActivityDate(dateString)
  if (!date) return ""
  const mm = String(date.getMonth() + 1).padStart(2, "0")
  const yy = String(date.getFullYear()).slice(-2)
  const h = String(date.getHours()).padStart(2, "0")
  const m = String(date.getMinutes()).padStart(2, "0")
  return `${h}:${m} · ${mm}/${yy}`
}

type ActivityRowTimestampProps = {
  value: string | null | undefined
  className?: string
}

/**
 * Shows the friendly relative time by default.
 * Desktop: hover reveals the absolute stamp. Mobile: tap toggles it.
 */
export function ActivityRowTimestamp({ value, className }: ActivityRowTimestampProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const relative = getActivityRelativeTimeLabel(value)
  const full = formatActivityDateShort(value)

  if (!full) {
    return (
      <span className={cn("shrink-0 whitespace-nowrap text-xs text-muted-foreground", className)}>
        {relative}
      </span>
    )
  }

  return (
    <button
      type="button"
      className={cn(
        "group/ts shrink-0 whitespace-nowrap text-xs text-muted-foreground",
        className,
      )}
      aria-label={full}
      title={full}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        setIsExpanded((prev) => !prev)
      }}
    >
      <span className="md:hidden">{isExpanded ? full : relative}</span>
      <span className="hidden md:inline group-hover/ts:hidden">{relative}</span>
      <span className="hidden md:group-hover/ts:inline">{full}</span>
    </button>
  )
}

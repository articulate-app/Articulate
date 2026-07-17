"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"

/** Relative time string (e.g. "5 mins ago", "12 days ago"). */
export function getActivityRelativeTimeLabel(dateString: string | null | undefined): string {
  if (!dateString) return "—"
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return "—"
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return "Just now"
  if (diffMins < 60) return `${diffMins} min${diffMins !== 1 ? "s" : ""} ago`
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`
  if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) !== 1 ? "s" : ""} ago`
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} month${Math.floor(diffDays / 30) !== 1 ? "s" : ""} ago`
  return `${Math.floor(diffDays / 365)} year${Math.floor(diffDays / 365) !== 1 ? "s" : ""} ago`
}

/** Absolute short stamp for secondary / hover display (HH:MM · MM/YY). */
export function formatActivityDateShort(dateString: string | null | undefined): string {
  if (!dateString) return ""
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return ""
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
      <span className={cn("shrink-0 whitespace-nowrap text-right text-xs text-muted-foreground", className)}>
        {relative}
      </span>
    )
  }

  return (
    <button
      type="button"
      className={cn(
        "group/ts shrink-0 whitespace-nowrap text-right text-xs text-muted-foreground",
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

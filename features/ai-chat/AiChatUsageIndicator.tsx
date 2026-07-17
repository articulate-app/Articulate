"use client"

import React, { useEffect, useRef, useState } from "react"
import type { AiChatUsageSnapshot } from "../../app/lib/ai/ai-chat-v2-types"
import {
  buildUsageWarningCopy,
  formatCompactTokenCount,
  formatExactTokenCount,
  hasConfiguredTokenLimit,
  pickStricterUsageScope,
} from "./ai-chat-usage"

type AiChatUsageIndicatorProps = {
  usage: AiChatUsageSnapshot | null | undefined
  isLoading?: boolean
}

export function AiChatUsageIndicator({ usage, isLoading }: AiChatUsageIndicatorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const strictest = pickStricterUsageScope(usage)

  useEffect(() => {
    if (!isOpen) return
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false)
    }
    document.addEventListener("mousedown", handlePointerDown, true)
    document.addEventListener("keydown", handleKeyDown, true)
    return () => {
      document.removeEventListener("mousedown", handlePointerDown, true)
      document.removeEventListener("keydown", handleKeyDown, true)
    }
  }, [isOpen])

  if (isLoading && !usage) {
    return <span className="text-[11px] text-gray-400">Usage…</span>
  }
  if (!usage || !strictest) return null

  const { scope, key } = strictest
  const hasLimit = hasConfiguredTokenLimit(scope)
  const percent = scope.percent_used ?? 0
  const isWarning = scope.warning || scope.projected_warning
  const isMaxed = scope.maxed_out || scope.projected_maxed_out
  const warningCopy = buildUsageWarningCopy(scope)

  const meterClass = isMaxed
    ? "bg-red-500"
    : isWarning
      ? "bg-amber-500"
      : "bg-gray-400"

  const collapsedLabel = hasLimit
    ? `${Math.round(percent)}%`
    : `${formatCompactTokenCount(scope.used_tokens)} today`

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`inline-flex h-7 max-w-[140px] items-center gap-1.5 rounded-sm px-1.5 text-[11px] font-medium hover:bg-gray-100/80 ${
          isMaxed ? "text-red-700" : isWarning ? "text-amber-800" : "text-gray-500 hover:text-gray-700"
        }`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label="AI usage today"
        title={warningCopy ?? "Today's AI usage"}
      >
        {hasLimit ? (
          <span className="inline-flex h-1.5 w-10 overflow-hidden rounded-full bg-gray-200">
            <span
              className={`h-full rounded-full transition-all ${meterClass}`}
              style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
            />
          </span>
        ) : null}
        <span className="truncate">{collapsedLabel}</span>
      </button>
      {isOpen ? (
        <div
          role="dialog"
          aria-label="AI usage details"
          className="absolute bottom-full left-0 z-[9999] mb-1 w-56 rounded-md border border-gray-200 bg-white p-2.5 text-xs shadow-lg"
        >
          <UsageScopeRow label="Your usage" scope={usage.user} />
          <UsageScopeRow label="Team usage" scope={usage.team} className="mt-2 border-t border-gray-100 pt-2" />
        </div>
      ) : null}
    </div>
  )
}

function UsageScopeRow({
  label,
  scope,
  className,
}: {
  label: string
  scope: AiChatUsageSnapshot["user"]
  className?: string
}) {
  const hasLimit = hasConfiguredTokenLimit(scope)
  const percent = scope.percent_used
  return (
    <div className={className}>
      <div className="font-medium text-gray-800">{label}</div>
      <div className="mt-0.5 text-gray-600">
        {formatExactTokenCount(scope.used_tokens)} tokens used today
      </div>
      {hasLimit ? (
        <>
          <div className="mt-1 text-gray-500">
            {percent != null ? `${Math.round(percent)}% of daily allowance` : "Daily allowance configured"}
          </div>
          {scope.remaining_tokens != null ? (
            <div className="text-gray-500">
              {formatExactTokenCount(scope.remaining_tokens)} remaining
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}

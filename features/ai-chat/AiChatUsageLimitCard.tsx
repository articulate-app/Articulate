"use client"

import React from "react"
import Link from "next/link"
import type { AiChatUsageSnapshot } from "../../app/lib/ai/ai-chat-v2-types"
import {
  formatUsageResetTime,
  isTokenLimitExceededCode,
  pickStricterUsageScope,
  resolveRunFailureMessage,
} from "./ai-chat-usage"

type AiChatUsageLimitCardProps = {
  usage: AiChatUsageSnapshot | null | undefined
  canReviewLimits?: boolean
  code?: string | null
}

export function AiChatUsageLimitCard({ usage, canReviewLimits = false, code }: AiChatUsageLimitCardProps) {
  const strictest = pickStricterUsageScope(usage)
  const scope = strictest?.scope
  const scopeKey = strictest?.key
  const resetTime = formatUsageResetTime(scope?.resets_at, scope?.timezone)

  const message = (() => {
    if (code && isTokenLimitExceededCode(code)) {
      return resolveRunFailureMessage({ code })
    }
    if (scopeKey === "team") {
      return "Your team has reached its daily AI token limit."
    }
    return "You have reached your daily AI token limit."
  })()

  return (
    <div className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
      <div className="font-medium">{message}</div>
      {resetTime ? (
        <div className="mt-1 text-xs text-amber-900/80">Resets around {resetTime}.</div>
      ) : null}
      <div className="mt-2">
        {canReviewLimits ? (
          <Link
            href="/?settings=open&settingsCategory=ai-limits"
            className="text-xs font-medium text-amber-950 underline underline-offset-2 hover:text-amber-900"
          >
            Review limits
          </Link>
        ) : (
          <span className="text-xs text-amber-900/80">Ask an admin to review team limits.</span>
        )}
      </div>
    </div>
  )
}

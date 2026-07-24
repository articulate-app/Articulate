"use client"

import { useQuery } from "@tanstack/react-query"
import { cn } from "@/lib/utils"
import {
  MY_DAILY_AI_USAGE_QUERY_KEY,
  fetchMyDailyAiUsage,
  resolveDefaultTeamTimezone,
} from "@/lib/services/team-ai-usage"
import { formatCompactTokenCount } from "../../../features/ai-chat/ai-chat-usage"
import { UserAvatar } from "../UserAvatar"

type AvatarAiUsageRingProps = {
  name: string
  photoUrl?: string | null
  className?: string
}

/**
 * Avatar with a daily AI usage ring. Click handling is owned by the parent.
 */
export function AvatarAiUsageRing({ name, photoUrl, className }: AvatarAiUsageRingProps) {
  const timezone = resolveDefaultTeamTimezone()
  const { data } = useQuery({
    queryKey: [MY_DAILY_AI_USAGE_QUERY_KEY, timezone],
    queryFn: () => fetchMyDailyAiUsage(timezone),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  })

  const hasLimit = data?.limit_tokens != null && data.limit_tokens > 0
  const percent = hasLimit ? Math.min(100, Math.max(0, data?.percent_used ?? 0)) : 0
  const isMaxed = data?.maxed_out === true
  const isWarning = data?.warning === true
  const stroke = isMaxed ? "#ef4444" : isWarning ? "#f59e0b" : "#9ca3af"
  const radius = 18
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference - (percent / 100) * circumference
  const title = hasLimit
    ? `${Math.round(percent)}% of daily AI allowance used`
    : data
      ? `${formatCompactTokenCount(data.used_tokens)} tokens used today`
      : "Daily AI usage"

  return (
    <span className={cn("relative inline-flex h-9 w-9 items-center justify-center", className)} title={title}>
      <svg
        className="pointer-events-none absolute inset-0 h-9 w-9 -rotate-90"
        viewBox="0 0 40 40"
        aria-hidden
      >
        <circle
          cx="20"
          cy="20"
          r={radius}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth="2.5"
        />
        {hasLimit ? (
          <circle
            cx="20"
            cy="20"
            r={radius}
            fill="none"
            stroke={stroke}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
          />
        ) : data && data.used_tokens > 0 ? (
          <circle
            cx="20"
            cy="20"
            r={radius}
            fill="none"
            stroke="#9ca3af"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * 0.85}
          />
        ) : null}
      </svg>
      <UserAvatar name={name} photoUrl={photoUrl} size="sm" className="h-7 w-7 min-h-7 min-w-7" />
    </span>
  )
}

"use client"

import React, { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import type { AiChatUsageSnapshot } from "../../app/lib/ai/ai-chat-v2-types"
import { getSupabaseBrowser } from "../../lib/supabase-browser"
import { invokeEdgeFunctionFetch } from "../../app/lib/edge-functions"
import { Popover, PopoverContent, PopoverTrigger } from "../../app/components/ui/popover"
import {
  buildUsageWarningCopy,
  formatCompactTokenCount,
  formatExactTokenCount,
  hasConfiguredTokenLimit,
  pickStricterUsageScope,
} from "./ai-chat-usage"

const POPOVER_CONTENT_CLASS =
  "z-[9999] w-[min(18rem,calc(100vw-1.5rem))] max-h-[min(70vh,24rem)] overflow-y-auto overflow-x-hidden p-3 text-xs"

function ContextUsagePie({
  percent,
  size = 16,
  className,
}: {
  percent: number
  size?: number
  className?: string
}) {
  const clamped = Math.min(100, Math.max(0, percent))
  const radius = 5.5
  const circumference = 2 * Math.PI * radius
  const filled = (clamped / 100) * circumference
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      className={className}
      aria-hidden
    >
      <circle cx="8" cy="8" r={radius} fill="none" className="stroke-gray-200" strokeWidth="3" />
      <circle
        cx="8"
        cy="8"
        r={radius}
        fill="none"
        className="stroke-current"
        strokeWidth="3"
        strokeDasharray={`${filled} ${circumference - filled}`}
        transform="rotate(-90 8 8)"
      />
    </svg>
  )
}

type AiChatUsageIndicatorProps = {
  threadId?: string | null
  usage: AiChatUsageSnapshot | null | undefined
  isLoading?: boolean
}

type ContextComposition = {
  system?: number | null
  tools?: number | null
  summary?: number | null
  recent_messages?: number | null
  turn_context?: number | null
  current_request?: number | null
  active_tool_loop?: number | null
  total_estimated_tokens?: number | null
}

type ContextSnapshot = {
  run_id: string
  model_provider: string | null
  model_name: string | null
  prompt_tokens: number
  provider_prompt_tokens_total?: number | null
  context_limit: number | null
  percent_used: number | null
  status?: "healthy" | "compacting" | "high" | string | null
  composition?: ContextComposition | null
  estimated_prompt_tokens?: number | null
  cached_prompt_tokens?: number | null
  cache_write_tokens?: number | null
  cache_hit_rate?: number | null
  summarized: boolean
  measured_at: string | null
}

function formatContextLimit(value: number | null): string {
  if (!value || !Number.isFinite(value)) return "unknown"
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M`
  return `${Math.round(value / 1_000)}k`
}

function contextRows(context: ContextSnapshot) {
  const composition = context.composition ?? {}
  return [
    ["System", composition.system],
    ["Tools", composition.tools],
    ["Conversation", composition.recent_messages],
    ["Thread summary", composition.summary],
    ["Turn context", composition.turn_context],
    ["Current request", composition.current_request],
    ["Active tool loop", composition.active_tool_loop],
  ] as Array<[string, number | null | undefined]>
}

export function AiChatUsageIndicator({ threadId, usage, isLoading }: AiChatUsageIndicatorProps) {
  const [usageOpen, setUsageOpen] = useState(false)
  const [contextOpen, setContextOpen] = useState(false)
  const [context, setContext] = useState<ContextSnapshot | null>(null)
  const strictest = pickStricterUsageScope(usage)
  const activeThreadId = threadId?.trim() || null
  useSearchParams()

  useEffect(() => {
    if (!activeThreadId) {
      setContext(null)
      return
    }
    let cancelled = false
    const load = async () => {
      try {
        const supabase = getSupabaseBrowser()
        const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ai-context-meter?thread_id=${encodeURIComponent(activeThreadId)}`
        const response = await invokeEdgeFunctionFetch({
          supabase,
          url,
          debugLabel: "ai-context-meter",
          init: { method: "GET" },
          headers: { "Content-Type": "application/json" },
        })
        if (!response.ok) return
        const payload = (await response.json()) as { context?: ContextSnapshot | null }
        if (!cancelled) setContext(payload.context ?? null)
      } catch {
        // Context visibility is supplemental; never interfere with chat sending.
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [activeThreadId, usage?.user.used_tokens, usage?.team.used_tokens])

  if (isLoading && !usage && !context) {
    return <span className="text-[11px] text-gray-400">Usage…</span>
  }
  if ((!usage || !strictest) && !context) return null

  const scope = strictest?.scope ?? null
  const hasLimit = scope ? hasConfiguredTokenLimit(scope) : false
  const percent = scope?.percent_used ?? 0
  const isWarning = Boolean(scope && (scope.warning || scope.projected_warning))
  const isMaxed = Boolean(scope && (scope.maxed_out || scope.projected_maxed_out))
  const warningCopy = scope ? buildUsageWarningCopy(scope) : null
  const collapsedLabel = scope
    ? hasLimit
      ? `${Math.round(percent)}%`
      : `${formatCompactTokenCount(scope.used_tokens)} today`
    : null

  const contextPercent = context?.percent_used ?? null
  const contextWarning = contextPercent != null && contextPercent >= 80
  const contextCaution = contextPercent != null && contextPercent >= 60 && contextPercent < 80
  const contextCounts = context
    ? context.context_limit
      ? `${formatCompactTokenCount(context.prompt_tokens)} / ${formatContextLimit(context.context_limit)}`
      : formatCompactTokenCount(context.prompt_tokens)
    : null
  const contextTitle = context
    ? context.context_limit
      ? `Context ${formatCompactTokenCount(context.prompt_tokens)} / ${formatContextLimit(context.context_limit)}`
      : `Context ${formatCompactTokenCount(context.prompt_tokens)}`
    : "Context used by the latest model call"

  return (
    <div className="flex min-w-0 max-w-full items-center gap-0.5">
      {usage && strictest && scope ? (
        <Popover
          modal={false}
          open={usageOpen}
          onOpenChange={(open) => {
            setUsageOpen(open)
            if (open) setContextOpen(false)
          }}
        >
          <PopoverTrigger asChild>
            <button
              type="button"
              className={`inline-flex h-7 max-w-[140px] items-center gap-1.5 whitespace-nowrap rounded-sm px-1.5 text-[11px] font-medium hover:bg-gray-100/80 ${
                isMaxed ? "text-red-700" : isWarning ? "text-amber-800" : "text-gray-500 hover:text-gray-700"
              }`}
              aria-label="AI usage today"
              title={warningCopy ?? "Today's AI usage"}
            >
              {hasLimit ? (
                <ContextUsagePie
                  percent={percent}
                  className={`shrink-0 ${isMaxed ? "text-red-500" : isWarning ? "text-amber-500" : "text-gray-400"}`}
                />
              ) : null}
              <span className="truncate">{collapsedLabel}</span>
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            side="top"
            sideOffset={6}
            collisionPadding={12}
            className={POPOVER_CONTENT_CLASS}
          >
            <UsageScopeRow label="Your usage" scope={usage.user} />
            <UsageScopeRow label="Team usage" scope={usage.team} className="mt-2 border-t border-gray-100 pt-2" />
            <div className="mt-2 border-t border-gray-100 pt-2 text-[10px] leading-4 text-gray-400">
              Daily usage is cumulative and is separate from the model context window.
            </div>
          </PopoverContent>
        </Popover>
      ) : null}

      {context && contextCounts ? (
        <Popover
          modal={false}
          open={contextOpen}
          onOpenChange={(open) => {
            setContextOpen(open)
            if (open) setUsageOpen(false)
          }}
        >
          <PopoverTrigger asChild>
            <button
              type="button"
              className={`inline-flex h-7 min-w-0 max-w-full items-center gap-1 whitespace-nowrap rounded-sm px-1.5 text-[11px] font-medium hover:bg-gray-100/80 ${
                contextWarning ? "text-red-700" : contextCaution ? "text-amber-800" : "text-gray-500 hover:text-gray-700"
              }`}
              aria-label={contextTitle}
              title={`${contextTitle} — context used by the latest model call`}
            >
              {contextPercent != null ? (
                <ContextUsagePie
                  percent={contextPercent}
                  className={`shrink-0 ${
                    contextWarning ? "text-red-500" : contextCaution ? "text-amber-500" : "text-gray-400"
                  }`}
                />
              ) : null}
              <span className="min-w-0 truncate">{contextCounts}</span>
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            side="top"
            sideOffset={6}
            collisionPadding={12}
            className={POPOVER_CONTENT_CLASS}
          >
            <div className="flex min-w-0 items-start gap-2.5">
              {contextPercent != null ? (
                <ContextUsagePie
                  percent={contextPercent}
                  size={36}
                  className={`mt-0.5 shrink-0 ${
                    contextWarning ? "text-red-500" : contextCaution ? "text-amber-500" : "text-gray-500"
                  }`}
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium text-gray-800">Context window</div>
                  {context.status ? (
                    <span className="shrink-0 text-[10px] capitalize text-gray-400">{context.status}</span>
                  ) : null}
                </div>
                <div className="mt-1 text-gray-600">
                  {formatCompactTokenCount(context.prompt_tokens)} tokens in the latest model input
                </div>
                {context.context_limit ? (
                  <div className="mt-0.5 text-gray-500">
                    {Math.round(contextPercent ?? 0)}% of {formatCompactTokenCount(context.context_limit)} available
                  </div>
                ) : (
                  <div className="mt-0.5 text-gray-500">Context limit is not yet known for this model.</div>
                )}
              </div>
            </div>

            {contextRows(context).some(([, value]) => Number(value) > 0) ? (
              <div className="mt-3 border-t border-gray-100 pt-2">
                {contextRows(context)
                  .filter(([, value]) => Number(value) > 0)
                  .map(([label, value]) => (
                    <div key={label} className="flex min-w-0 items-center justify-between gap-3 py-0.5">
                      <span className="min-w-0 truncate text-gray-500">{label}</span>
                      <span className="shrink-0 tabular-nums text-gray-700">{formatCompactTokenCount(Number(value ?? 0))}</span>
                    </div>
                  ))}
              </div>
            ) : null}

            {context.cache_hit_rate != null || context.cached_prompt_tokens != null ? (
              <div className="mt-3 border-t border-gray-100 pt-2">
                {context.cache_hit_rate != null ? (
                  <div className="flex min-w-0 items-center justify-between gap-3 py-0.5">
                    <span className="min-w-0 truncate text-gray-500">Cache hit</span>
                    <span className="shrink-0 tabular-nums text-gray-700">{Math.round(context.cache_hit_rate * 100)}%</span>
                  </div>
                ) : null}
                {context.cached_prompt_tokens != null ? (
                  <div className="flex min-w-0 items-center justify-between gap-3 py-0.5">
                    <span className="min-w-0 truncate text-gray-500">Cached input</span>
                    <span className="shrink-0 tabular-nums text-gray-700">{formatCompactTokenCount(context.cached_prompt_tokens)}</span>
                  </div>
                ) : null}
                {context.cache_write_tokens != null && context.cache_write_tokens > 0 ? (
                  <div className="flex min-w-0 items-center justify-between gap-3 py-0.5">
                    <span className="min-w-0 truncate text-gray-500">Cache write</span>
                    <span className="shrink-0 tabular-nums text-gray-700">{formatCompactTokenCount(context.cache_write_tokens)}</span>
                  </div>
                ) : null}
              </div>
            ) : null}

            {context.model_name ? (
              <div className="mt-2 truncate text-[10px] text-gray-400" title={context.model_name}>
                Model: {context.model_name}
              </div>
            ) : null}
            <div className="mt-2 border-t border-gray-100 pt-2 text-[10px] leading-4 text-gray-400">
              This is the context sent to the latest model call, not all tokens ever used in this conversation.
            </div>
          </PopoverContent>
        </Popover>
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
      <div className="mt-0.5 text-gray-600">{formatExactTokenCount(scope.used_tokens)} tokens used today</div>
      {hasLimit ? (
        <>
          <div className="mt-1 text-gray-500">
            {percent != null ? `${Math.round(percent)}% of daily allowance` : "Daily allowance configured"}
          </div>
          {scope.remaining_tokens != null ? (
            <div className="text-gray-500">{formatExactTokenCount(scope.remaining_tokens)} remaining</div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}

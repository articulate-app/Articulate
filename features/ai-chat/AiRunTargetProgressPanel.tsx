"use client"

import React from "react"
import type { AiChatRunTargetProgress } from "../../app/lib/ai/ai-chat-v2-types"

type AiRunTargetProgressPanelProps = {
  entries: AiChatRunTargetProgress[]
  summaryLine?: string | null
}

export function AiRunTargetProgressPanel({ entries, summaryLine }: AiRunTargetProgressPanelProps) {
  if (entries.length === 0 && !summaryLine) return null

  const activeEntry = [...entries].reverse().find((entry) => entry.status === "active")
  const completedEntries = entries.filter((entry) => entry.status === "completed")

  return (
    <div className="flex w-full justify-start">
      <div className="min-w-0 max-w-[80%] space-y-1 px-3">
        {summaryLine ? <span className="ai-status-active text-xs">{summaryLine}</span> : null}
        {activeEntry ? (
          <div className="rounded-md border border-border/70 bg-muted/30 px-2 py-1 text-xs text-foreground">
            {activeEntry.detail ?? activeEntry.label ?? "Working…"}
          </div>
        ) : null}
        {completedEntries.length > 0 ? (
          <div className="text-[11px] text-muted-foreground">
            {completedEntries
              .slice(-3)
              .map((entry) => entry.label ?? entry.detail ?? entry.target_kind)
              .join(" · ")}
          </div>
        ) : null}
      </div>
    </div>
  )
}

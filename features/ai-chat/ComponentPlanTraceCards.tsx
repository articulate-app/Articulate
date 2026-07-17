"use client"

import React, { useState } from "react"
import { Check, ChevronDown, ChevronRight, Layers, ListChecks } from "lucide-react"
import { cn } from "../../app/lib/utils"
import { useComponentPlanTraceStore } from "../../app/store/component-plan-trace-store"
import {
  PLAN_COUNT_ROWS,
  groupPlanActions,
  librarySourceDisplayLabel,
  planSourceDisplayLabel,
  type ComponentLibraryTrace,
  type ComponentPlanTrace,
  type PlanActionGroupTone,
} from "./component-plan-trace"

const CARD_CLASS =
  "group card-row relative w-full max-w-full min-w-0 overflow-x-hidden rounded-xl border border-border bg-card text-left shadow-sm"

const HEADER_BUTTON_CLASS =
  "flex w-full min-w-0 max-w-full items-center gap-2 px-3 py-2.5 text-left sm:px-4"

function ComponentSourcesCheckedCard({ trace }: { trace: ComponentLibraryTrace }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className={CARD_CLASS}>
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className={HEADER_BUTTON_CLASS}
        aria-expanded={expanded}
      >
        <Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          Component sources checked
        </span>
        {expanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        )}
      </button>
      <div className="border-t border-border/70 px-3 pb-3 pt-2 sm:px-4">
        <ul className="space-y-1.5">
          {trace.sources.map((source, index) => (
            <li key={`${source.source}-${index}`} className="min-w-0 text-sm text-foreground">
              <div className="flex items-start gap-2">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
                <span className="min-w-0 flex-1 break-words">
                  {librarySourceDisplayLabel(source)}
                  <span className="text-muted-foreground"> — {source.count}</span>
                </span>
              </div>
              {expanded && source.sampleTitles.length > 0 ? (
                <div className="ml-[22px] mt-0.5 text-xs text-muted-foreground break-words">
                  {source.sampleTitles.join(", ")}
                </div>
              ) : null}
              {expanded && source.usedFor ? (
                <div className="ml-[22px] mt-0.5 text-xs text-muted-foreground break-words">
                  {source.usedFor}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
        {expanded && trace.scopeNote ? (
          <p className="mt-2 text-xs text-muted-foreground break-words">{trace.scopeNote}</p>
        ) : null}
        <p className="mt-2 text-[11px] italic text-muted-foreground">
          Candidate building blocks — not all were used.
        </p>
      </div>
    </div>
  )
}

function planActionSignClass(tone: PlanActionGroupTone): string {
  if (tone === "added") return "text-emerald-600"
  if (tone === "removed") return "text-red-600"
  return "text-muted-foreground"
}

function planActionSign(tone: PlanActionGroupTone): string {
  if (tone === "added") return "+"
  if (tone === "removed") return "−"
  return "•"
}

function StructureDecisionCard({ trace }: { trace: ComponentPlanTrace }) {
  const [expanded, setExpanded] = useState(false)
  const countRows = PLAN_COUNT_ROWS.filter((row) => (trace.actionCounts[row.key] ?? 0) > 0)
  const groups = groupPlanActions(trace.actions)
  const decision =
    trace.decision || "The AI reviewed the current structure before generating."
  return (
    <div className={CARD_CLASS}>
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className={HEADER_BUTTON_CLASS}
        aria-expanded={expanded}
      >
        <ListChecks className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          Structure decision
        </span>
        {expanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        )}
      </button>
      <div className="border-t border-border/70 px-3 pb-3 pt-2 sm:px-4">
        <p className="text-sm text-foreground break-words">{decision}</p>
        {countRows.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {countRows.map((row) => (
              <span key={row.key}>
                {row.label}: <span className="font-medium text-foreground">{trace.actionCounts[row.key]}</span>
              </span>
            ))}
          </div>
        ) : null}
        {expanded && groups.length > 0 ? (
          <div className="mt-3 space-y-3">
            {groups.map((group) => (
              <div key={group.heading} className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.heading}
                </div>
                <ul className="mt-1 space-y-1">
                  {group.actions.map((action, index) => {
                    const sourceLabel = planSourceDisplayLabel(action.source)
                    return (
                      <li key={`${action.componentTitle}-${index}`} className="min-w-0 text-sm text-foreground">
                        <div className="flex items-start gap-1.5">
                          <span className={cn("shrink-0 font-medium", planActionSignClass(group.tone))}>
                            {planActionSign(group.tone)}
                          </span>
                          <span className="min-w-0 flex-1 break-words">
                            {action.componentTitle}
                            {sourceLabel ? (
                              <span className="text-muted-foreground"> — {sourceLabel}</span>
                            ) : null}
                          </span>
                        </div>
                        {action.reason ? (
                          <div className="ml-[18px] mt-0.5 text-xs text-muted-foreground break-words">
                            {action.reason}
                          </div>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

/**
 * Renders the "Component sources checked" and "Structure decision" cards for one assistant message.
 * Ordering: library trace first, then plan trace — placed before component edit preview cards.
 */
export function ComponentPlanTraceCards({ assistantMessageId }: { assistantMessageId: string }) {
  const bucket = useComponentPlanTraceStore((state) => state.buckets[assistantMessageId] ?? null)
  if (!bucket) return null
  const { libraryTrace, planTrace } = bucket
  if (!libraryTrace && !planTrace) return null
  return (
    <div className="space-y-2 w-full min-w-0 max-w-full">
      {libraryTrace ? <ComponentSourcesCheckedCard trace={libraryTrace} /> : null}
      {planTrace ? <StructureDecisionCard trace={planTrace} /> : null}
    </div>
  )
}

"use client"

import React, { useMemo, useState } from "react"
import { AlertCircle, ChevronDown, ChevronRight } from "lucide-react"
import { cn } from "../../app/lib/utils"
import { useAiExecutionTraceStore } from "../../app/store/ai-execution-trace-store"
import {
  orderExecutionTraceSteps,
  type AiExecutionTraceEntity,
  type AiExecutionTraceStep,
} from "./execution-trace"
import { InlineMarkdownText } from "./inline-markdown-text"
import {
  stepHasExpandableToolResult,
  toolResultRowsFromDetails,
} from "./tool-result-display"

type ExecutionTimelineProps = {
  assistantMessageId: string
  /** Change-preview cards keyed by preview/change key. */
  changePreviewByKey?: Record<string, React.ReactNode>
  /** Component-edit preview cards keyed by stream key. */
  editPreviewByKey?: Record<string, React.ReactNode>
  onEntityClick?: (entity: AiExecutionTraceEntity) => void
  className?: string
}

function StepStatusMark({ phase }: { phase: AiExecutionTraceStep["phase"] }) {
  // Active tools use the shared text gradient (no spinner / skeleton).
  if (phase === "completed" || phase === "started") return null
  if (phase === "failed") {
    return (
      <span className="flex h-4 w-4 shrink-0 items-center justify-center text-red-600">
        <AlertCircle className="h-3.5 w-3.5" aria-hidden />
      </span>
    )
  }
  if (phase === "warning") {
    return (
      <span className="flex h-4 w-4 shrink-0 items-center justify-center text-amber-600">
        <AlertCircle className="h-3.5 w-3.5" aria-hidden />
      </span>
    )
  }
  return null
}

function EntityChip({
  entity,
  onClick,
}: {
  entity: AiExecutionTraceEntity
  onClick?: (entity: AiExecutionTraceEntity) => void
}) {
  const interactive =
    Boolean(onClick)
    && (entity.type === "task" || entity.type === "component" || entity.type === "url" || entity.type === "channel")

  if (!interactive) {
    return (
      <span className="inline-flex max-w-full truncate rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-700">
        {entity.label}
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={() => onClick?.(entity)}
      className="inline-flex max-w-full truncate rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-800 underline-offset-2 hover:bg-gray-200 hover:underline"
    >
      {entity.label}
    </button>
  )
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function ToolResultDetails({
  step,
  onEntityClick,
}: {
  step: AiExecutionTraceStep
  onEntityClick?: (entity: AiExecutionTraceEntity) => void
}) {
  const rows = toolResultRowsFromDetails(step.details)
  const resultSummary =
    typeof step.details?.result_summary === "string"
      ? step.details.result_summary.trim()
      : ""
  const dataSummary = asRecord(step.details?.data_summary)
  const count =
    typeof dataSummary?.count === "number" && Number.isFinite(dataSummary.count)
      ? dataSummary.count
      : null

  return (
    <div className="mt-1.5 space-y-1.5 text-[11px] text-gray-700">
      {resultSummary ? (
        <p className="break-words [overflow-wrap:anywhere] text-gray-600">{resultSummary}</p>
      ) : null}
      {count != null && rows.length === 0 ? (
        <p className="text-gray-500">{count} result{count === 1 ? "" : "s"}</p>
      ) : null}
      {rows.length > 0 ? (
        <ul className="space-y-1">
          {rows.map((row, index) => (
            <li
              key={`${row.id ?? row.label}:${index}`}
              className="min-w-0 break-words [overflow-wrap:anywhere]"
            >
              <span className="font-medium text-gray-900">{row.label}</span>
              {row.meta ? (
                <span className="mt-0.5 block text-gray-500">{row.meta}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {rows.length === 0 && step.entities.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {step.entities.map((entity, index) => (
            <EntityChip
              key={`${entity.type}:${entity.id ?? entity.label}:${index}`}
              entity={entity}
              onClick={onEntityClick}
            />
          ))}
        </div>
      ) : null}
      {rows.length === 0 && !resultSummary && dataSummary ? (
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed text-gray-600">
          {JSON.stringify(dataSummary, null, 2)}
        </pre>
      ) : null}
    </div>
  )
}

function TimelineRow({
  step,
  isActive,
  changePreviewByKey,
  editPreviewByKey,
  onEntityClick,
}: {
  step: AiExecutionTraceStep
  isActive: boolean
  changePreviewByKey?: Record<string, React.ReactNode>
  editPreviewByKey?: Record<string, React.ReactNode>
  onEntityClick?: (entity: AiExecutionTraceEntity) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const attachedChangePreviews = step.previewKeys
    .map((key) => changePreviewByKey?.[key])
    .filter(Boolean)
  const attachedEditPreviews = step.editStreamKeys
    .map((key) => editPreviewByKey?.[key])
    .filter(Boolean)
  const canExpand = stepHasExpandableToolResult({
    phase: step.phase,
    entitiesCount: step.entities.length,
    details: step.details,
  })
  const showStatusMark = step.phase === "failed" || step.phase === "warning"
  const isRunning = step.phase === "started" || isActive
  // Completed tools stay collapsed until clicked; failures open by default.
  const detailsOpen = canExpand
    ? expanded || step.phase === "failed"
    : (isActive || step.phase === "failed" || step.phase === "warning") && step.entities.length > 0

  const label = (
    <span
      className={cn(
        "min-w-0 break-words [overflow-wrap:anywhere]",
        step.category === "planning" && "text-[13px] leading-relaxed text-gray-700",
        isRunning && "ai-status-active",
      )}
    >
      {showStatusMark ? (
        <span className="mr-1.5 inline-flex translate-y-[0.1rem] align-text-top">
          <StepStatusMark phase={step.phase} />
        </span>
      ) : null}
      <InlineMarkdownText text={step.text} />
    </span>
  )

  return (
    <li className="min-w-0">
      <div
        className={cn(
          "min-w-0 text-xs leading-snug text-gray-600",
          step.phase === "failed" && "text-red-700",
          step.phase === "warning" && "text-amber-800",
          isActive && !isRunning && "text-gray-900",
        )}
      >
        {canExpand ? (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className={cn(
              "inline-flex max-w-full min-w-0 items-center gap-1 rounded-sm text-left",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30",
            )}
            aria-expanded={detailsOpen}
          >
            {label}
            <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-gray-400">
              {detailsOpen ? (
                <ChevronDown className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              )}
            </span>
          </button>
        ) : (
          <p
            className={cn(
              "break-words [overflow-wrap:anywhere]",
              step.category === "planning" && "text-[13px] leading-relaxed text-gray-700",
              isRunning && "ai-status-active",
            )}
          >
            {showStatusMark ? (
              <span className="mr-1.5 inline-flex translate-y-[0.1rem] align-text-top">
                <StepStatusMark phase={step.phase} />
              </span>
            ) : null}
            <InlineMarkdownText text={step.text} />
          </p>
        )}

        {detailsOpen && canExpand ? (
          <ToolResultDetails step={step} onEntityClick={onEntityClick} />
        ) : null}

        {!canExpand && detailsOpen && step.entities.length > 0 ? (
          <div className="mt-1 flex flex-wrap gap-1">
            {step.entities.map((entity, index) => (
              <EntityChip
                key={`${entity.type}:${entity.id ?? entity.label}:${index}`}
                entity={entity}
                onClick={onEntityClick}
              />
            ))}
          </div>
        ) : null}
      </div>
      {attachedChangePreviews.length > 0 || attachedEditPreviews.length > 0 ? (
        <div className="mt-2 space-y-2">
          {attachedChangePreviews.map((node, index) => (
            <div key={`change-${step.stepId}-${index}`} className="w-full min-w-0 max-w-full">
              {node}
            </div>
          ))}
          {attachedEditPreviews.map((node, index) => (
            <div key={`edit-${step.stepId}-${index}`} className="w-full min-w-0 max-w-full">
              {node}
            </div>
          ))}
        </div>
      ) : null}
    </li>
  )
}

export function ExecutionTimeline({
  assistantMessageId,
  changePreviewByKey,
  editPreviewByKey,
  onEntityClick,
  className,
}: ExecutionTimelineProps) {
  const stepsById = useAiExecutionTraceStore(
    (state) => state.buckets[assistantMessageId]?.stepsById ?? null,
  )

  const steps = useMemo(
    () => (stepsById ? orderExecutionTraceSteps(stepsById) : []),
    [stepsById],
  )

  const activeStepId = useMemo(() => {
    const started = [...steps].reverse().find((step) => step.phase === "started")
    return started?.stepId ?? null
  }, [steps])

  const claimedPreviewKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const step of steps) {
      for (const key of step.previewKeys) keys.add(key)
      for (const key of step.editStreamKeys) keys.add(key)
    }
    return keys
  }, [steps])

  const unclaimedChangePreviews = useMemo(() => {
    if (!changePreviewByKey) return []
    return Object.entries(changePreviewByKey)
      .filter(([key]) => !claimedPreviewKeys.has(key))
      .map(([, node]) => node)
  }, [changePreviewByKey, claimedPreviewKeys])

  const unclaimedEditPreviews = useMemo(() => {
    if (!editPreviewByKey) return []
    return Object.entries(editPreviewByKey)
      .filter(([key]) => !claimedPreviewKeys.has(key))
      .map(([, node]) => node)
  }, [editPreviewByKey, claimedPreviewKeys])

  if (steps.length === 0) return null

  return (
    <div className={cn("w-full min-w-0 max-w-full", className)}>
      <ol className="flex flex-col gap-1.5">
        {steps.map((step) => (
          <TimelineRow
            key={step.stepId}
            step={step}
            isActive={step.stepId === activeStepId}
            changePreviewByKey={changePreviewByKey}
            editPreviewByKey={editPreviewByKey}
            onEntityClick={onEntityClick}
          />
        ))}
      </ol>
      {unclaimedChangePreviews.length > 0 || unclaimedEditPreviews.length > 0 ? (
        <div className="mt-3 space-y-2">
          {unclaimedChangePreviews.map((node, index) => (
            <div key={`unclaimed-change-${index}`} className="w-full min-w-0 max-w-full">
              {node}
            </div>
          ))}
          {unclaimedEditPreviews.map((node, index) => (
            <div key={`unclaimed-edit-${index}`} className="w-full min-w-0 max-w-full">
              {node}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

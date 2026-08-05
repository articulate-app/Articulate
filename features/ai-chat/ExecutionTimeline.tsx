"use client"

import React, { useMemo } from "react"
import { AlertCircle, Loader2 } from "lucide-react"
import { cn } from "../../app/lib/utils"
import { useAiExecutionTraceStore } from "../../app/store/ai-execution-trace-store"
import {
  orderExecutionTraceSteps,
  type AiExecutionTraceEntity,
  type AiExecutionTraceStep,
} from "./execution-trace"

type ExecutionTimelineProps = {
  assistantMessageId: string
  /** Change-preview cards keyed by preview/change key. */
  changePreviewByKey?: Record<string, React.ReactNode>
  /** Component-edit preview cards keyed by stream key. */
  editPreviewByKey?: Record<string, React.ReactNode>
  onEntityClick?: (entity: AiExecutionTraceEntity) => void
  className?: string
}

function StepIcon({ phase }: { phase: AiExecutionTraceStep["phase"] }) {
  // Completed rows stay text-only — a left checkmark reads like a selected
  // radio and makes the stack feel like a single active item.
  if (phase === "completed") return null
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
  return (
    <span className="flex h-4 w-4 shrink-0 items-center justify-center text-gray-500">
      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
    </span>
  )
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
  const attachedChangePreviews = step.previewKeys
    .map((key) => changePreviewByKey?.[key])
    .filter(Boolean)
  const attachedEditPreviews = step.editStreamKeys
    .map((key) => editPreviewByKey?.[key])
    .filter(Boolean)
  // Completed rows stay to a single concise line; expand active/failed/warning for entities.
  const showExpandedDetails = isActive || step.phase === "failed" || step.phase === "warning"

  const icon = <StepIcon phase={step.phase} />

  return (
    <li className="min-w-0">
      <div className="flex min-w-0 items-start gap-2">
        {icon ? <div className="mt-0.5">{icon}</div> : null}
        <div
          className={cn(
            "min-w-0 flex-1 text-xs leading-snug text-gray-600",
            step.phase === "failed" && "text-red-700",
            step.phase === "warning" && "text-amber-800",
            isActive && "text-gray-900",
          )}
        >
          <p className="break-words [overflow-wrap:anywhere]">{step.text}</p>
          {showExpandedDetails && step.entities.length > 0 ? (
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

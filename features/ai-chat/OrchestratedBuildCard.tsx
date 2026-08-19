"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  MinusCircle,
  RefreshCw,
} from "lucide-react"
import {
  listUnitsForBuild,
  useAiOrchestratedBuildStore,
  type AiOrchestratedBuildCardEntry,
} from "../../app/store/ai-orchestrated-build-store"
import type {
  AiOrchestratedBuildStatus,
  AiOrchestratedBuildUnit,
  AiOrchestratedBuildUnitStatus,
} from "../../app/lib/ai/ai-orchestrated-build-types"
import {
  isTerminalAiOrchestratedBuildStatus,
} from "../../app/lib/ai/ai-orchestrated-build-types"
import { dedupeWorkUnitFailures, aggregateValidationIssues } from "./ai-orchestrated-build-errors"
import {
  rehydrateArtifactPreviewCards,
  retryDispatchOrchestratedBuild,
} from "./use-orchestrated-build-poll"
import {
  formatStructureActionLabel,
  reduceWorkUnitComponentAudit,
  type WorkUnitAuditCurrentComponent,
  type WorkUnitComponentAudit,
} from "./orchestrated-build-audit"
import { formatConciseComponentDecisionSummary } from "./execution-trace"
import { BuildComponentPreviewCard } from "./BuildComponentPreviewCard"
import { useAiBuildComponentPreviewStore } from "../../app/store/ai-build-component-preview-store"
import { useAiBuildArtifactPreviewStore } from "../../app/store/ai-build-artifact-preview-store"
import { ArtifactLivePreviewCards } from "../artifacts/ArtifactLivePreviewCards"
import { openArtifactCenterTab } from "../artifacts/open-artifact-center-tab"
import { AssistantMessageRestoreFooter } from "./AssistantMessageRestoreFooter"
import { cn } from "../../app/lib/utils"

function statusLabel(status: AiOrchestratedBuildStatus | null | undefined): string {
  switch (status) {
    case "completed":
      return "Completed"
    case "partially_completed":
      return "Partially completed"
    case "failed":
      return "Failed"
    case "cancelled":
      return "Cancelled"
    case "running":
      return "Running"
    case "queued":
      return "Queued"
    default:
      // Never treat a missing snapshot / dispatch_started as a successful start.
      return "Queued"
  }
}

function unitStatusLabel(status: AiOrchestratedBuildUnitStatus): string {
  switch (status) {
    case "succeeded":
      return "Saved"
    case "partially_succeeded":
      return "Partial"
    case "failed":
      return "Failed"
    case "conflict":
      return "Conflict"
    case "cancelled":
      return "Cancelled"
    case "running":
      return "Running"
    case "queued":
      return "Queued"
    default:
      return status
  }
}

function StatusPill({ status }: { status: AiOrchestratedBuildStatus | null | undefined }) {
  if (status === "completed") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
        <Check className="h-3 w-3" aria-hidden />
        {statusLabel(status)}
      </span>
    )
  }
  if (status === "partially_completed") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-800">
        <AlertCircle className="h-3 w-3" aria-hidden />
        {statusLabel(status)}
      </span>
    )
  }
  if (status === "failed") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
        <AlertCircle className="h-3 w-3" aria-hidden />
        {statusLabel(status)}
      </span>
    )
  }
  if (status === "cancelled") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
        <MinusCircle className="h-3 w-3" aria-hidden />
        {statusLabel(status)}
      </span>
    )
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
      <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
      {statusLabel(status)}
    </span>
  )
}

function ComponentList({
  components,
  showIds = false,
}: {
  components: WorkUnitAuditCurrentComponent[]
  showIds?: boolean
}) {
  if (components.length === 0) return null
  return (
    <ul className="mt-0.5 space-y-0.5">
      {components.map((component, index) => (
        <li
          key={`${component.componentId ?? component.title}-${index}`}
          className="text-[11px] text-foreground break-words [overflow-wrap:anywhere]"
        >
          {component.title}
          <span className="text-muted-foreground">
            {component.hasContent === true
              ? " — has content"
              : component.hasContent === false
                ? " — empty"
                : ""}
          </span>
          {showIds && component.componentId ? (
            <span className="text-muted-foreground"> ({component.componentId})</span>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

function ValidationIssueGroups({
  issues,
}: {
  issues: ReturnType<typeof aggregateValidationIssues>
}) {
  const [expandedCodes, setExpandedCodes] = useState<Record<string, boolean>>({})
  if (issues.length === 0) return null
  return (
    <ul className="mt-0.5 space-y-1.5">
      {issues.map((group) => {
        const isExpanded = expandedCodes[group.code] === true
        const visible = isExpanded ? group.componentTitles : group.componentTitles.slice(0, 5)
        const hiddenCount = Math.max(0, group.componentTitles.length - 5)
        return (
          <li key={group.code} className="text-[11px] text-destructive/90 break-words [overflow-wrap:anywhere]">
            <div className="font-medium">{group.message}</div>
            {visible.length > 0 ? (
              <ul className="mt-0.5 space-y-0.5 pl-2 text-muted-foreground">
                {visible.map((title) => (
                  <li key={title}>{title}</li>
                ))}
              </ul>
            ) : null}
            {hiddenCount > 0 ? (
              <button
                type="button"
                onClick={() =>
                  setExpandedCodes((prev) => ({
                    ...prev,
                    [group.code]: !isExpanded,
                  }))
                }
                className="mt-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground"
              >
                {isExpanded ? "Show less" : `${hiddenCount} more`}
              </button>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

function WorkUnitAuditTrail({ audit }: { audit: WorkUnitComponentAudit }) {
  const [expanded, setExpanded] = useState(false)
  const [showIds, setShowIds] = useState(false)
  if (!audit.hasAnyTrace) return null

  const selected = audit.selectedComponents
  const inactive = audit.inactiveComponents
  // Active inventory when the server did not send an explicit selection set.
  const activeOnly =
    selected.length === 0 && audit.currentComponents.length > 0
      ? audit.currentComponents
      : []

  return (
    <div className="mt-2 border-t border-border/60 pt-1.5">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center gap-1.5 py-0.5 text-left text-[11px] font-medium text-muted-foreground hover:text-foreground"
        aria-expanded={expanded}
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3 shrink-0" aria-hidden />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0" aria-hidden />
        )}
        How components were chosen
      </button>
      {expanded ? (
        <div className="mt-1.5 space-y-2.5 pl-0.5">
          <p className="text-[10px] italic text-muted-foreground">
            Structured decision audit — not model reasoning.
          </p>

          {(audit.discoveryStarted
            || audit.discoveryOrder.length > 0
            || selected.length > 0
            || activeOnly.length > 0
            || inactive.length > 0
            || audit.reusableGroups.length > 0
            || audit.requiredComponents.length > 0) ? (
            <section>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Sources checked
              </div>
              {audit.discoveryOrder.length > 0 ? (
                <p className="mt-0.5 text-[11px] text-foreground break-words [overflow-wrap:anywhere]">
                  Order: {audit.discoveryOrder.join(" → ")}
                </p>
              ) : null}
              {audit.requiredComponents.length > 0 ? (
                <div className="mt-1.5">
                  <div className="text-[10px] font-medium text-muted-foreground">
                    Channel requirements
                  </div>
                  <ul className="mt-0.5 space-y-0.5">
                    {audit.requiredComponents.map((component, index) => (
                      <li
                        key={`${component.title}-${index}`}
                        className="text-[11px] text-foreground break-words [overflow-wrap:anywhere]"
                      >
                        <span className="font-medium">{component.title}</span>
                        {component.source ? (
                          <span className="text-muted-foreground"> · {component.source}</span>
                        ) : null}
                        {component.position != null ? (
                          <span className="text-muted-foreground"> · pos {component.position}</span>
                        ) : null}
                        {component.provenance ? (
                          <span className="text-muted-foreground">
                            {" "}
                            · {component.provenance === "project_override"
                              ? "project override"
                              : component.provenance === "system_default"
                                ? "system default"
                                : component.provenance}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {selected.length > 0 ? (
                <div className="mt-1.5">
                  <div className="text-[10px] font-medium text-muted-foreground">
                    Selected task components
                  </div>
                  <ComponentList components={selected} showIds={showIds} />
                </div>
              ) : activeOnly.length > 0 ? (
                <div className="mt-1.5">
                  <div className="text-[10px] font-medium text-muted-foreground">
                    Active task components
                  </div>
                  <ComponentList components={activeOnly} showIds={showIds} />
                </div>
              ) : null}
              {inactive.length > 0 ? (
                <div className="mt-1.5">
                  <div className="text-[10px] font-medium text-muted-foreground">
                    Inactive task components available for reuse
                  </div>
                  <ComponentList components={inactive} showIds={showIds} />
                </div>
              ) : null}
              {audit.reusableGroups.length > 0 ? (
                <ul className="mt-1 space-y-0.5">
                  {audit.reusableGroups.map((group, index) => (
                    <li
                      key={`${group.label}-${index}`}
                      className="text-[11px] text-foreground break-words [overflow-wrap:anywhere]"
                    >
                      {group.label}
                      {group.count != null ? (
                        <span className="text-muted-foreground"> — {group.count}</span>
                      ) : null}
                      {group.titles.length > 0 ? (
                        <span className="block text-[10px] text-muted-foreground">
                          {group.titles.join(", ")}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}

          {audit.decisions.length > 0 ? (
            <section>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Component decisions
              </div>
              <ul className="mt-1 space-y-1">
                {audit.decisions.map((decision, index) => {
                  const summary = formatConciseComponentDecisionSummary({
                    title: decision.title,
                    outcome: decision.outcome,
                    source: decision.source,
                    reason: decision.reason,
                  })
                  return (
                    <li
                      key={`${decision.title}-${index}`}
                      className="text-[11px] text-foreground break-words [overflow-wrap:anywhere]"
                    >
                      {summary ?? decision.title}
                    </li>
                  )
                })}
              </ul>
            </section>
          ) : null}

          {audit.finalStructure.length > 0 ? (
            <section>
              <div className="flex items-center justify-between gap-2">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Final structure
                </div>
                {audit.finalStructure.some((item) => item.componentId) ? (
                  <button
                    type="button"
                    onClick={() => setShowIds((value) => !value)}
                    className="text-[10px] font-medium text-muted-foreground hover:text-foreground"
                  >
                    {showIds ? "Hide IDs" : "Show IDs"}
                  </button>
                ) : null}
              </div>
              <ul className="mt-1 space-y-0.5">
                {audit.finalStructure.map((item, index) => (
                  <li
                    key={`${item.componentId ?? item.title}-${index}`}
                    className="text-[11px] text-foreground break-words [overflow-wrap:anywhere]"
                  >
                    <span className="text-muted-foreground">
                      {formatStructureActionLabel(item.action)}
                    </span>
                    {" · "}
                    {item.title}
                    {item.position != null ? (
                      <span className="text-muted-foreground"> · pos {item.position}</span>
                    ) : null}
                    {showIds && item.componentId ? (
                      <span className="text-muted-foreground"> ({item.componentId})</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {audit.persistedOrder.length > 0 ? (
            <section>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Persisted order
              </div>
              <ol className="mt-1 list-decimal space-y-0.5 pl-4">
                {audit.persistedOrder.map((item, index) => (
                  <li
                    key={`${item.componentId ?? item.title ?? "order"}-${index}`}
                    className="text-[11px] text-foreground break-words [overflow-wrap:anywhere]"
                  >
                    {item.title ?? (showIds ? item.componentId : null) ?? "Component"}
                    {item.position != null ? (
                      <span className="text-muted-foreground"> · pos {item.position}</span>
                    ) : null}
                    {showIds && item.componentId && item.title ? (
                      <span className="text-muted-foreground"> ({item.componentId})</span>
                    ) : null}
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          {audit.repair ? (
            <section>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Repair
              </div>
              <ValidationIssueGroups
                issues={aggregateValidationIssues(
                  audit.repair.validationIssueRows.length > 0
                    ? audit.repair.validationIssueRows
                    : audit.repair.validationIssues,
                )}
              />
              {audit.repair.succeeded != null ? (
                <p className="mt-1 text-[11px] text-foreground">
                  {audit.repair.succeeded
                    ? "Bounded repair succeeded."
                    : "Bounded repair did not fully resolve issues."}
                </p>
              ) : null}
              <ValidationIssueGroups
                issues={aggregateValidationIssues(
                  audit.repair.remainingIssueRows.length > 0
                    ? audit.repair.remainingIssueRows
                    : audit.repair.remainingIssues,
                )}
              />
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function UnitRow({
  unit,
  audit,
  buildId,
  buildError,
  onRetry,
  canRetry,
  isRetrying,
}: {
  unit: AiOrchestratedBuildUnit
  audit: WorkUnitComponentAudit | null
  buildId: string
  buildError?: string | null
  onRetry?: () => void
  canRetry?: boolean
  isRetrying?: boolean
}) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const saved = unit.result.saved ?? []
  const failed = unit.result.failed ?? []
  const primaryFailures = dedupeWorkUnitFailures({
    buildId,
    unitId: unit.id,
    unitErrorCode: unit.error_code,
    unitErrorMessage: unit.error_message,
    itemFailures: failed.map((item) => ({
      component_id: item.component_id,
      title: item.title,
      error: item.error,
      error_code: item.error_code ?? item.code ?? null,
    })),
    buildErrorCode: null,
    buildErrorMessage: buildError,
    repairErrorCode: audit?.repair?.succeeded === false ? audit.repair.errorCode : null,
    repairErrorMessage:
      audit?.repair?.succeeded === false
        ? (audit.repair.errorMessage
          ?? (audit.repair.remainingIssues[0] ?? null)
          ?? "Structure validation failed")
        : null,
  })
  const primary = primaryFailures[0] ?? null
  const secondary = primaryFailures.slice(1)
  const showFailureCard =
    unit.status === "failed" || unit.status === "conflict" || primaryFailures.length > 0
  const aggregatedRemaining = aggregateValidationIssues(
    audit?.repair?.remainingIssueRows?.length
      ? audit.repair.remainingIssueRows
      : audit?.repair?.remainingIssues ?? [],
  )
  const aggregatedValidation = aggregateValidationIssues(
    audit?.repair?.validationIssueRows?.length
      ? audit.repair.validationIssueRows
      : audit?.repair?.validationIssues ?? [],
  )

  return (
    <li className="rounded-md border border-border/70 bg-background/60 px-2.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 text-xs font-medium text-foreground">
          Task {unit.task_id}
          {unit.attempt > 1 ? (
            <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">
              attempt {unit.attempt}
            </span>
          ) : null}
        </div>
        <span
          className={cn(
            "shrink-0 text-[10px] font-medium",
            unit.status === "succeeded" && "text-emerald-700",
            unit.status === "partially_succeeded" && "text-amber-800",
            (unit.status === "failed" || unit.status === "conflict") && "text-destructive",
            unit.status === "cancelled" && "text-muted-foreground",
            (unit.status === "queued" || unit.status === "running") && "text-muted-foreground",
          )}
        >
          {unit.status === "running" ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
              Running
            </span>
          ) : (
            unitStatusLabel(unit.status)
          )}
        </span>
      </div>

      {audit ? (
        <WorkUnitAuditTrail
          audit={
            showFailureCard && audit.repair
              ? { ...audit, repair: null }
              : audit
          }
        />
      ) : null}

      {saved.length > 0 ? (
        <ul className="mt-1.5 space-y-1">
          {saved.map((item) => (
            <li key={`${item.output_id}:${item.component_id}`} className="text-[11px]">
              <div className="font-medium text-foreground">{item.title}</div>
              {item.snippet.trim() ? (
                <p className="text-muted-foreground line-clamp-2 break-words [overflow-wrap:anywhere]">
                  {item.snippet}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {showFailureCard && primary ? (
        <div className="mt-1.5 space-y-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5">
          <div className="text-[11px] text-destructive/90">
            {primary.title ? <span className="font-medium">{primary.title}: </span> : null}
            <span className="break-words [overflow-wrap:anywhere]">{primary.message}</span>
          </div>
          {audit?.repair && (aggregatedRemaining.length > 0 || aggregatedValidation.length > 0) ? (
            <div className="border-t border-destructive/20 pt-1.5">
              <ValidationIssueGroups
                issues={aggregatedRemaining.length > 0 ? aggregatedRemaining : aggregatedValidation}
              />
            </div>
          ) : audit?.repair ? (
            <div className="border-t border-destructive/20 pt-1.5 text-[11px] text-muted-foreground">
              {audit.repair.succeeded != null
                ? audit.repair.succeeded
                  ? "Bounded repair succeeded."
                  : "Bounded repair did not fully resolve issues."
                : "Repair attempted."}
            </div>
          ) : null}
          {secondary.length > 0 || (failed.length > 0 && primaryFailures.length > 0) ? (
            <div className="border-t border-destructive/20 pt-1">
              <button
                type="button"
                onClick={() => setDetailsOpen((value) => !value)}
                className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-foreground"
              >
                {detailsOpen ? (
                  <ChevronDown className="h-3 w-3" aria-hidden />
                ) : (
                  <ChevronRight className="h-3 w-3" aria-hidden />
                )}
                {detailsOpen ? "Hide details" : "Failure details"}
              </button>
              {detailsOpen ? (
                <div className="mt-1 space-y-1.5">
                  {(() => {
                    const byCode = new Map<string, Array<{ title: string | null; message: string }>>()
                    for (const item of failed) {
                      const code =
                        (item.error_code ?? item.code ?? "failed").toString().trim().toLowerCase()
                        || "failed"
                      const bucket = byCode.get(code) ?? []
                      bucket.push({
                        title: item.title?.trim() || null,
                        message: item.error?.trim() || code,
                      })
                      byCode.set(code, bucket)
                    }
                    if (byCode.size === 0 && secondary.length > 0) {
                      return (
                        <ul className="space-y-0.5">
                          {secondary.map((failure) => (
                            <li key={failure.key} className="text-[10px] text-muted-foreground break-words [overflow-wrap:anywhere]">
                              {failure.title ? `${failure.title}: ` : null}
                              {failure.message}
                            </li>
                          ))}
                        </ul>
                      )
                    }
                    return (
                      <ul className="space-y-1">
                        {[...byCode.entries()].map(([code, rows]) => (
                          <li key={code} className="text-[10px] text-muted-foreground">
                            <div className="font-medium text-foreground/80">
                              {code.replace(/_/g, " ")} ({rows.length})
                            </div>
                            <ul className="mt-0.5 space-y-0.5 pl-2">
                              {rows.map((row, index) => (
                                <li key={`${code}-${row.title ?? "row"}-${index}`} className="break-words [overflow-wrap:anywhere]">
                                  {row.title ? `${row.title}: ` : null}
                                  {row.message}
                                </li>
                              ))}
                            </ul>
                          </li>
                        ))}
                      </ul>
                    )
                  })()}
                </div>
              ) : null}
            </div>
          ) : null}
          {canRetry && onRetry ? (
            <button
              type="button"
              disabled={isRetrying}
              onClick={onRetry}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-foreground hover:bg-muted disabled:opacity-50"
            >
              {isRetrying ? (
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
              ) : (
                <RefreshCw className="h-3 w-3" aria-hidden />
              )}
              Retry
            </button>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}

function progressSummary(entry: AiOrchestratedBuildCardEntry): string {
  const build = entry.build
  if (entry.error?.trim()) {
    return entry.error.trim()
  }
  if (!build) return "Queued — reconciling build status…"
  const saved = build.succeeded_units
  const failed = build.failed_units
  const total = build.total_units
  if (build.status === "completed") {
    return `Saved ${saved} of ${total} task${total === 1 ? "" : "s"}.`
  }
  if (build.status === "partially_completed") {
    return `Saved ${saved}, failed ${failed} of ${total} tasks.`
  }
  if (build.status === "failed") {
    return failed > 0
      ? `${failed} task${failed === 1 ? "" : "s"} failed.${saved > 0 ? ` ${saved} saved.` : ""}`
      : "The build failed."
  }
  if (build.status === "cancelled") {
    return saved > 0
      ? `Cancelled. ${saved} saved result${saved === 1 ? "" : "s"} kept.`
      : "Build cancelled."
  }
  if (total <= 0) {
    return build.status === "running"
      ? "Running — waiting for work units…"
      : "Queued — waiting for workers…"
  }
  const done = saved + failed
  return `${done} of ${total} tasks processed` + (build.running_units > 0 ? "…" : ".")
}

export function OrchestratedBuildCard({
  buildId,
  assistantMessageId,
  threadId,
  taskId,
  activeChannelId,
}: {
  buildId: string
  assistantMessageId: string
  threadId: string
  taskId?: number | null
  activeChannelId?: number | null
}) {
  const entry = useAiOrchestratedBuildStore((state) => state.builds[buildId] ?? null)
  const units = useMemo(() => listUnitsForBuild(entry), [entry])
  const auditsByUnitId = useMemo(() => {
    if (!entry) return {} as Record<string, WorkUnitComponentAudit>
    const out: Record<string, WorkUnitComponentAudit> = {}
    for (const unit of Object.values(entry.unitsById)) {
      const audit = reduceWorkUnitComponentAudit(unit.id, entry.eventsBySequence)
      if (audit.hasAnyTrace) out[unit.id] = audit
    }
    return out
  }, [entry])
  const previewEntries = useAiBuildComponentPreviewStore((state) => state.previews)
  const buildPreviews = useMemo(
    () =>
      Object.values(previewEntries)
        .filter((row) => row.buildId === buildId)
        .sort((a, b) => a.sequence - b.sequence),
    [previewEntries, buildId],
  )
  const artifactPreviewEntries = useAiBuildArtifactPreviewStore((state) => state.previews)
  const artifactPreviews = useMemo(() => {
    // One live card per artifact_id (highest sequence wins). Decision-only phases
    // are rendered in the execution timeline, not as cards.
    const byArtifactId = new Map<string, (typeof artifactPreviewEntries)[string]>()
    for (const row of Object.values(artifactPreviewEntries)) {
      if (row.buildId !== buildId) continue
      if (
        row.phase !== "started"
        && row.phase !== "preview"
        && row.phase !== "saved"
        && row.phase !== "media"
        && row.phase !== "failed"
      ) {
        continue
      }
      const prev = byArtifactId.get(row.artifactId)
      if (!prev || row.sequence > prev.sequence) byArtifactId.set(row.artifactId, row)
    }
    return Array.from(byArtifactId.values()).sort((a, b) => a.sequence - b.sequence)
  }, [artifactPreviewEntries, buildId])
  const isArtifactFirstBuild = useMemo(() => {
    if (artifactPreviews.length > 0) return true
    if (!entry) return false
    if (entry.isArtifactBuild) return true
    return Object.values(entry.eventsBySequence).some((event) =>
      typeof event.event_type === "string"
      && event.event_type.toLowerCase().includes("artifact."),
    )
  }, [artifactPreviews.length, entry])

  const fallbackArtifactRefs = useMemo(() => {
    if (!entry) return []
    const seen = new Set<string>()
    const refs: Array<{ artifactId: string; title: string | null }> = []
    for (const unit of units) {
      const match = String(unit.unit_key ?? "").match(/^artifact:([0-9a-f-]{36})$/i)
      const artifactId = match?.[1]
      if (!artifactId || seen.has(artifactId)) continue
      seen.add(artifactId)
      refs.push({
        artifactId,
        title: unit.result.saved?.[0]?.title?.trim() || entry.title?.trim() || null,
      })
    }
    return refs
  }, [entry, units])

  const rehydrateAttemptsRef = useRef(0)
  const [isRehydratingPreviews, setIsRehydratingPreviews] = useState(false)
  useEffect(() => {
    if (!entry) return
    if (artifactPreviews.length > 0) {
      setIsRehydratingPreviews(false)
      return
    }
    if (rehydrateAttemptsRef.current >= 5) return
    rehydrateAttemptsRef.current += 1
    setIsRehydratingPreviews(true)
    void rehydrateArtifactPreviewCards(buildId).then((ok) => {
      if (ok) rehydrateAttemptsRef.current = 5
      setIsRehydratingPreviews(false)
    })
  }, [artifactPreviews.length, buildId, entry])

  if (!entry) return null

  // Only show Queued after a real build_id was registered (this card only mounts with one).
  const status = entry.build?.status ?? "queued"
  const canRetryDispatch =
    status === "queued"
    && (entry.build?.running_units ?? 0) === 0
    && (entry.build?.queued_units ?? 0) > 0
  const isTerminal = isTerminalAiOrchestratedBuildStatus(status)
  const changeSetId = entry.build?.change_set_id?.trim() || null
  const borderClass =
    status === "failed"
      ? "border-destructive/40"
      : status === "partially_completed"
        ? "border-amber-300/70"
        : status === "cancelled"
          ? "border-border"
          : "border-border"

  const artifactPreviewList = (
    <ul className="space-y-2 w-full min-w-0 max-w-full">
      {artifactPreviews.map((preview) => (
        <React.Fragment key={preview.artifactId}>
          <ArtifactLivePreviewCards
            preview={preview}
            allowAttachToTask
            onOpenArtifact={(artifactId) => {
              openArtifactCenterTab({
                artifactId,
                title: preview.title,
                version: preview.currentVersion,
              })
            }}
          />
        </React.Fragment>
      ))}
    </ul>
  )

  // Cancel lives in the composer stop control — don't duplicate it on history cards.
  const artifactChromeFooter = (
    <>
      {isTerminal && changeSetId ? (
        <AssistantMessageRestoreFooter
          inline
          showMetadata={false}
          threadId={threadId}
          messageId={assistantMessageId}
          changeSet={{
            id: changeSetId,
            has_restorable_changes: true,
            status: "active",
          }}
          taskId={taskId ?? null}
          activeChannelId={activeChannelId ?? null}
        />
      ) : null}
    </>
  )

  // Artifact-first builds: show compact change cards only — no "Orchestrated build" shell.
  // Preview cards must stay visible after refresh (rehydrated from durable events), like
  // component-edit previews — never collapse to a bare “Saved” placeholder.
  if (isArtifactFirstBuild) {
    const showRestoring =
      artifactPreviews.length === 0
      && (isRehydratingPreviews || !isTerminal || rehydrateAttemptsRef.current < 5)
    return (
      <div className="space-y-2 w-full min-w-0 max-w-full">
        {artifactPreviews.length > 0 ? (
          artifactPreviewList
        ) : showRestoring ? (
          <div
            className="flex items-center justify-center rounded-xl border border-border bg-card px-3 py-2.5 shadow-sm"
            aria-label={entry.title?.trim() || (isTerminal ? "Restoring preview" : "Building artifact")}
          >
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" aria-hidden />
          </div>
        ) : status === "failed" ? (
          <div className="rounded-xl border border-destructive/40 bg-card px-3 py-2.5 text-sm text-muted-foreground shadow-sm">
            <span className="truncate">{entry.title?.trim() || "Artifact update"}</span>
            <p className="mt-0.5 text-xs">Build failed.</p>
          </div>
        ) : fallbackArtifactRefs.length > 0 ? (
          <ul className="space-y-2 w-full min-w-0 max-w-full">
            {fallbackArtifactRefs.map((ref) => (
              <li key={ref.artifactId}>
                <button
                  type="button"
                  className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-left text-sm shadow-sm hover:bg-muted/40"
                  onClick={() =>
                    openArtifactCenterTab({
                      artifactId: ref.artifactId,
                      title: ref.title,
                    })
                  }
                >
                  <span className="truncate font-medium text-foreground">
                    {ref.title || "Artifact"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {artifactChromeFooter}
      </div>
    )
  }

  return (
    <div
      className={cn(
        "w-full max-w-full min-w-0 overflow-hidden rounded-xl border bg-card text-left shadow-sm",
        borderClass,
      )}
    >
      <div className="flex w-full min-w-0 items-center gap-2 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-foreground">
            {entry.title?.trim() || "Orchestrated build"}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground break-words [overflow-wrap:anywhere]">
            {progressSummary(entry)}
          </p>
        </div>
        <StatusPill status={status} />
      </div>

      {entry.build && entry.build.total_units > 0 ? (
        <div className="px-3 pb-2">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                status === "failed"
                  ? "bg-destructive/70"
                  : status === "partially_completed"
                    ? "bg-amber-500"
                    : status === "cancelled"
                      ? "bg-muted-foreground/40"
                      : "bg-emerald-500",
              )}
              style={{
                width: `${Math.min(
                  100,
                  Math.round(
                    ((entry.build.succeeded_units + entry.build.failed_units)
                      / Math.max(1, entry.build.total_units))
                      * 100,
                  ),
                )}%`,
              }}
            />
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
            <span>{entry.build.total_units} units</span>
            <span>{entry.build.succeeded_units} saved</span>
            <span>{entry.build.failed_units} failed</span>
            <span>{entry.build.running_units} running</span>
            <span>{entry.build.queued_units} queued</span>
          </div>
        </div>
      ) : null}

      {buildPreviews.length > 0 && !isArtifactFirstBuild ? (
        <ul className="space-y-1.5 border-t border-border/70 px-3 py-2">
          {buildPreviews.map((preview) => (
            <li key={preview.key}>
              <BuildComponentPreviewCard entry={preview} />
            </li>
          ))}
        </ul>
      ) : null}

      {artifactPreviews.length > 0 ? (
        <div className="border-t border-border/70 px-3 py-2">
          {artifactPreviewList}
        </div>
      ) : null}

      {units.length > 0 && !isArtifactFirstBuild ? (
        <ul className="space-y-1.5 border-t border-border/70 px-3 py-2">
          {units.map((unit, index) => {
            const isFailedUnit =
              unit.status === "failed" || unit.status === "conflict"
            const showUnitRetry =
              canRetryDispatch
              || (isFailedUnit && (status === "failed" || status === "partially_completed" || status === "queued"))
            // One retry action for the build — attach to the first failed unit card.
            const isPrimaryFailureUnit =
              showUnitRetry
              && units.findIndex((row) => row.status === "failed" || row.status === "conflict") === index
            return (
              <UnitRow
                key={unit.id}
                unit={unit}
                audit={auditsByUnitId[unit.id] ?? null}
                buildId={buildId}
                buildError={entry.error}
                canRetry={isPrimaryFailureUnit}
                isRetrying={entry.isPumping}
                onRetry={
                  isPrimaryFailureUnit
                    ? () => void retryDispatchOrchestratedBuild(buildId)
                    : undefined
                }
              />
            )
          })}
        </ul>
      ) : null}

      {entry.error && units.length === 0 ? (
        <p className="border-t border-destructive/30 px-3 py-2 text-xs text-destructive/90">
          {entry.error}
        </p>
      ) : null}

      {canRetryDispatch && units.every((unit) => unit.status !== "failed" && unit.status !== "conflict") ? (
        <div className="flex flex-wrap gap-2 border-t border-border/70 px-3 py-2">
          <button
            type="button"
            disabled={entry.isPumping}
            onClick={() => void retryDispatchOrchestratedBuild(buildId)}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
          >
            {entry.isPumping ? (
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="h-3 w-3" aria-hidden />
            )}
            Retry dispatch
          </button>
        </div>
      ) : null}

      {isTerminal && changeSetId ? (
        <div className="border-t border-border/70 px-3 py-2">
          <AssistantMessageRestoreFooter
            inline
            showMetadata={false}
            threadId={threadId}
            messageId={assistantMessageId}
            changeSet={{
              id: changeSetId,
              has_restorable_changes: true,
              status: "active",
            }}
            taskId={taskId ?? null}
            activeChannelId={activeChannelId ?? null}
          />
        </div>
      ) : null}
    </div>
  )
}

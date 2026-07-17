"use client"

import React, { useMemo, useState } from "react"
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  MinusCircle,
  RefreshCw,
  Square,
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
  isActiveAiOrchestratedBuildStatus,
  isTerminalAiOrchestratedBuildStatus,
} from "../../app/lib/ai/ai-orchestrated-build-types"
import { resolveOrchestratedBuildErrorMessage } from "./ai-orchestrated-build-errors"
import {
  cancelOrchestratedBuild,
  retryDispatchOrchestratedBuild,
} from "./use-orchestrated-build-poll"
import {
  reduceWorkUnitComponentAudit,
  type WorkUnitComponentAudit,
} from "./orchestrated-build-audit"
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

function WorkUnitAuditTrail({ audit }: { audit: WorkUnitComponentAudit }) {
  const [expanded, setExpanded] = useState(false)
  if (!audit.hasAnyTrace) return null

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
            || audit.currentComponents.length > 0
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
              {audit.currentComponents.length > 0 ? (
                <ul className="mt-1 space-y-0.5">
                  {audit.currentComponents.map((component, index) => (
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
                    </li>
                  ))}
                </ul>
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
                {audit.decisions.map((decision, index) => (
                  <li
                    key={`${decision.title}-${index}`}
                    className="text-[11px] text-foreground break-words [overflow-wrap:anywhere]"
                  >
                    <span className="font-medium">{decision.title}</span>
                    {decision.source ? (
                      <span className="text-muted-foreground"> · {decision.source}</span>
                    ) : null}
                    {decision.outcome ? (
                      <span className="text-muted-foreground"> · {decision.outcome}</span>
                    ) : null}
                    {decision.reason ? (
                      <span className="mt-0.5 block text-[10px] text-muted-foreground">
                        {decision.reason}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {audit.finalStructure.length > 0 ? (
            <section>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Final structure
              </div>
              <ul className="mt-1 space-y-0.5">
                {audit.finalStructure.map((item, index) => (
                  <li
                    key={`${item.componentId ?? item.title}-${index}`}
                    className="text-[11px] text-foreground break-words [overflow-wrap:anywhere]"
                  >
                    <span className="text-muted-foreground">{item.action}</span>
                    {" · "}
                    {item.title}
                    {item.position != null ? (
                      <span className="text-muted-foreground"> · pos {item.position}</span>
                    ) : null}
                    {item.componentId ? (
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
                    {item.title ?? item.componentId ?? "Component"}
                    {item.position != null ? (
                      <span className="text-muted-foreground"> · pos {item.position}</span>
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
              {audit.repair.validationIssues.length > 0 ? (
                <ul className="mt-1 space-y-0.5">
                  {audit.repair.validationIssues.map((issue, index) => (
                    <li
                      key={`issue-${index}`}
                      className="text-[11px] text-muted-foreground break-words [overflow-wrap:anywhere]"
                    >
                      {issue}
                    </li>
                  ))}
                </ul>
              ) : null}
              {audit.repair.succeeded != null ? (
                <p className="mt-1 text-[11px] text-foreground">
                  {audit.repair.succeeded
                    ? "Bounded repair succeeded."
                    : "Bounded repair did not fully resolve issues."}
                </p>
              ) : null}
              {audit.repair.remainingIssues.length > 0 ? (
                <ul className="mt-1 space-y-0.5">
                  {audit.repair.remainingIssues.map((issue, index) => (
                    <li
                      key={`remaining-${index}`}
                      className="text-[11px] text-destructive/90 break-words [overflow-wrap:anywhere]"
                    >
                      Remaining: {issue}
                    </li>
                  ))}
                </ul>
              ) : null}
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
}: {
  unit: AiOrchestratedBuildUnit
  audit: WorkUnitComponentAudit | null
}) {
  const errorMessage =
    unit.status === "failed" || unit.status === "conflict"
      ? resolveOrchestratedBuildErrorMessage({
          code: unit.error_code,
          backendMessage: unit.error_message,
        })
      : null
  const saved = unit.result.saved ?? []
  const failed = unit.result.failed ?? []

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

      {audit ? <WorkUnitAuditTrail audit={audit} /> : null}

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

      {failed.length > 0 ? (
        <ul className="mt-1.5 space-y-1">
          {failed.map((item, index) => (
            <li
              key={`${item.component_id ?? "failed"}-${index}`}
              className="text-[11px] text-destructive/90"
            >
              {item.title ? <span className="font-medium">{item.title}: </span> : null}
              {resolveOrchestratedBuildErrorMessage({ backendMessage: item.error })}
            </li>
          ))}
        </ul>
      ) : null}

      {errorMessage ? (
        <p className="mt-1.5 text-[11px] text-destructive/90 break-words [overflow-wrap:anywhere]">
          {errorMessage}
        </p>
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

  if (!entry) return null

  // Only show Queued after a real build_id was registered (this card only mounts with one).
  const status = entry.build?.status ?? "queued"
  const canCancel = isActiveAiOrchestratedBuildStatus(status)
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

      {units.length > 0 ? (
        <ul className="space-y-1.5 border-t border-border/70 px-3 py-2">
          {units.map((unit) => (
            <UnitRow
              key={unit.id}
              unit={unit}
              audit={auditsByUnitId[unit.id] ?? null}
            />
          ))}
        </ul>
      ) : null}

      {entry.error ? (
        <p className="border-t border-destructive/30 px-3 py-2 text-xs text-destructive/90">
          {entry.error}
        </p>
      ) : null}

      {canCancel || canRetryDispatch ? (
        <div className="flex flex-wrap gap-2 border-t border-border/70 px-3 py-2">
          {canRetryDispatch ? (
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
          ) : null}
          {canCancel ? (
            <button
              type="button"
              disabled={entry.isCancelling}
              onClick={() => void cancelOrchestratedBuild(buildId)}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
            >
              {entry.isCancelling ? (
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
              ) : (
                <Square className="h-3 w-3 fill-current" aria-hidden />
              )}
              Cancel build
            </button>
          ) : null}
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

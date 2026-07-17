"use client"

import React, { useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { cn } from "../../app/lib/utils"
import { useAiRequestPlanStore } from "../../app/store/ai-request-plan-store"
import {
  collectCandidatesConsidered,
  countResolvedTargets,
  countUnresolvedChoices,
  formatHumanizedKey,
  formatRequestPlanKeyValueRows,
  requestPlanOperationLabel,
  requestPlanStatusLabel,
  resultSummaryLabel,
  type AiRequestPlan,
  type RequestPlanCandidate,
  type RequestPlanResolution,
} from "./request-plan"

const CARD_CLASS =
  "w-full max-w-full min-w-0 overflow-x-hidden rounded-lg border border-gray-200 bg-white text-left text-sm text-gray-900 shadow-sm"

function StatusBadge({ status }: { status: string }) {
  const label = requestPlanStatusLabel(status)
  const tone =
    status === "completed"
      ? "bg-gray-100 text-gray-800"
      : status === "failed" || status === "cancelled" || status === "expired"
        ? "bg-gray-100 text-gray-600"
        : status === "waiting_for_input"
          ? "bg-gray-100 text-gray-800"
          : status === "partially_completed"
            ? "bg-gray-100 text-gray-700"
            : "bg-gray-50 text-gray-700"
  return (
    <span className={cn("inline-flex shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium", tone)}>
      {label}
    </span>
  )
}

function Section({
  title,
  children,
  defaultOpen = true,
}: {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="min-w-0 border-t border-gray-100 pt-2">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-1.5 py-0.5 text-left text-xs font-semibold text-gray-800"
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-500" aria-hidden />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-500" aria-hidden />
        )}
        {title}
      </button>
      {open ? <div className="mt-1.5 space-y-1.5 pl-5">{children}</div> : null}
    </div>
  )
}

function KeyValueList({ record }: { record: Record<string, unknown> }) {
  const rows = formatRequestPlanKeyValueRows(record)
  if (rows.length === 0) {
    return <p className="text-xs text-gray-500">None</p>
  }
  return (
    <ul className="space-y-1">
      {rows.map((row) => (
        <li key={row.key} className="min-w-0 text-xs text-gray-700 break-words [overflow-wrap:anywhere]">
          <span className="font-medium text-gray-900">{formatHumanizedKey(row.key)}</span>
          <span className="text-gray-500"> — </span>
          <span>{row.value}</span>
        </li>
      ))}
    </ul>
  )
}

function CandidateBadge({ candidate }: { candidate: RequestPlanCandidate }) {
  const isSelected = candidate.selected === true
  const isRejected = candidate.rejected === true || candidate.selected === false
  return (
    <li className="flex min-w-0 items-start gap-2 text-xs text-gray-700">
      <span
        className={cn(
          "mt-0.5 shrink-0 rounded px-1 py-0.5 text-[10px] font-medium",
          isSelected && "bg-gray-900 text-white",
          isRejected && !isSelected && "bg-gray-100 text-gray-500",
          !isSelected && !isRejected && "bg-gray-50 text-gray-600",
        )}
      >
        {isSelected ? "Selected" : isRejected ? "Rejected" : "Considered"}
      </span>
      <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">{candidate.label}</span>
    </li>
  )
}

function ResolutionBlock({ resolution, index }: { resolution: RequestPlanResolution; index: number }) {
  const heading =
    resolution.entityType
      ? formatHumanizedKey(resolution.entityType)
      : `Resolution ${index + 1}`
  return (
    <div className="min-w-0 space-y-1.5">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{heading}</div>
      {resolution.matches.length === 0 && resolution.unresolved.length === 0 ? (
        <p className="text-xs text-gray-500">No matches recorded.</p>
      ) : null}
      {resolution.matches.map((match, matchIndex) => (
        <div
          key={`${match.candidateId ?? match.reference ?? "match"}-${matchIndex}`}
          className="min-w-0 rounded-md border border-gray-100 bg-gray-50 px-2 py-1.5"
        >
          {match.reference ? (
            <p className="text-xs text-gray-700 break-words [overflow-wrap:anywhere]">
              <span className="font-medium text-gray-900">You said</span>
              <span className="text-gray-500"> — </span>
              {match.reference}
            </p>
          ) : null}
          {match.candidateLabel || match.candidateId ? (
            <p className="mt-0.5 text-xs text-gray-700 break-words [overflow-wrap:anywhere]">
              <span className="font-medium text-gray-900">Selected</span>
              <span className="text-gray-500"> — </span>
              {match.candidateLabel || match.candidateId}
            </p>
          ) : null}
          {match.reason ? (
            <p className="mt-0.5 text-[11px] text-gray-500 break-words [overflow-wrap:anywhere]">
              {match.reason}
            </p>
          ) : null}
        </div>
      ))}
      {resolution.unresolved.length > 0 ? (
        <p className="text-xs text-gray-600 break-words [overflow-wrap:anywhere]">
          Unresolved: {resolution.unresolved.join(", ")}
        </p>
      ) : null}
    </div>
  )
}

function RequestPlanCardView({ plan }: { plan: AiRequestPlan }) {
  const [expanded, setExpanded] = useState(false)
  const resolvedCount = countResolvedTargets(plan)
  const unresolvedCount = countUnresolvedChoices(plan)
  const resultLabel = resultSummaryLabel(plan)
  const interpretation = plan.decisionAudit?.interpretation ?? null
  const resolutions = plan.decisionAudit?.resolutions ?? []
  const candidates = collectCandidatesConsidered(plan)
  const hasTargets =
    Object.keys(plan.mutationTargets).length > 0 || Object.keys(plan.contextRefs).length > 0
  const hasArguments = Object.keys(plan.arguments).length > 0
  const hasResult = Boolean(plan.resultSummary || plan.verification)

  return (
    <div className={CARD_CLASS}>
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full min-w-0 items-center gap-2 px-3 py-2.5 text-left"
        aria-expanded={expanded}
      >
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">
          {requestPlanOperationLabel(plan.operation)}
        </span>
        <StatusBadge status={plan.status} />
        {expanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-gray-500" aria-hidden />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-gray-500" aria-hidden />
        )}
      </button>

      <div className="border-t border-gray-100 px-3 pb-3 pt-2">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
          <span>
            Resolved targets:{" "}
            <span className="font-medium text-gray-900">{resolvedCount}</span>
          </span>
          <span>
            Unresolved choices:{" "}
            <span className="font-medium text-gray-900">{unresolvedCount}</span>
          </span>
          {plan.executor ? (
            <span>
              Executor: <span className="font-medium text-gray-900">{formatHumanizedKey(plan.executor)}</span>
            </span>
          ) : null}
          {resultLabel ? (
            <span className="min-w-0 break-words [overflow-wrap:anywhere]">
              Result: <span className="font-medium text-gray-900">{resultLabel}</span>
            </span>
          ) : null}
        </div>

        {expanded ? (
          <div className="mt-3 space-y-2">
            {plan.requestText ? (
              <Section title="Request">
                <p className="text-xs text-gray-700 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                  {plan.requestText}
                </p>
              </Section>
            ) : null}

            {(plan.operation || hasArguments || interpretation?.summary) ? (
              <Section title="Interpreted operation">
                {plan.operation ? (
                  <p className="text-xs text-gray-700">
                    <span className="font-medium text-gray-900">Operation</span>
                    <span className="text-gray-500"> — </span>
                    {requestPlanOperationLabel(plan.operation)}
                    <span className="text-gray-400"> ({plan.operation})</span>
                  </p>
                ) : null}
                {interpretation?.summary ? (
                  <p className="text-xs text-gray-700 break-words [overflow-wrap:anywhere]">
                    {interpretation.summary}
                  </p>
                ) : null}
                {interpretation?.targetScope || interpretation?.editKind ? (
                  <p className="text-[11px] text-gray-500">
                    {[
                      interpretation.targetScope
                        ? `Scope: ${formatHumanizedKey(interpretation.targetScope)}`
                        : null,
                      interpretation.editKind
                        ? `Edit: ${formatHumanizedKey(interpretation.editKind)}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                ) : null}
                {hasArguments ? <KeyValueList record={plan.arguments} /> : null}
              </Section>
            ) : null}

            {hasTargets ? (
              <Section title="Targets">
                {Object.keys(plan.mutationTargets).length > 0 ? (
                  <div>
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                      Mutation targets
                    </div>
                    <KeyValueList record={plan.mutationTargets} />
                  </div>
                ) : null}
                {Object.keys(plan.contextRefs).length > 0 ? (
                  <div>
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                      Context references
                    </div>
                    <KeyValueList record={plan.contextRefs} />
                  </div>
                ) : null}
              </Section>
            ) : null}

            {resolutions.length > 0 ? (
              <Section title="How this request was resolved">
                <div className="space-y-3">
                  {resolutions.map((resolution, index) => (
                    <ResolutionBlock
                      key={`${resolution.entityType ?? "resolution"}-${index}`}
                      resolution={resolution}
                      index={index}
                    />
                  ))}
                </div>
              </Section>
            ) : null}

            {candidates.length > 0 ? (
              <Section title="Candidates considered" defaultOpen={false}>
                <ul className="space-y-1.5">
                  {candidates.map((candidate) => (
                    <CandidateBadge key={candidate.id} candidate={candidate} />
                  ))}
                </ul>
              </Section>
            ) : null}

            {plan.missingInputs.length > 0 ? (
              <Section title="Needs your input">
                <p className="text-xs text-gray-600">
                  Use the clarification card below to answer. Outstanding fields:
                </p>
                <ul className="list-disc space-y-0.5 pl-4 text-xs text-gray-700">
                  {plan.missingInputs.map((input, index) => (
                    <li key={`${input.field ?? "field"}-${index}`}>
                      {input.field ? formatHumanizedKey(input.field) : "Additional input"}
                      {input.allowMultiple ? " (one or more)" : null}
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}

            {hasResult ? (
              <Section title="Result">
                {plan.resultSummary ? <KeyValueList record={plan.resultSummary} /> : null}
                {plan.verification ? (
                  <div>
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                      Verification
                    </div>
                    <KeyValueList record={plan.verification} />
                  </div>
                ) : null}
              </Section>
            ) : null}

            <p className="pt-1 text-[11px] italic text-gray-500">
              Execution plan — structured audit of how this request was resolved.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** Request Plan V3 card for one assistant message (live stream or persisted snapshot). */
export function RequestPlanCard({ assistantMessageId }: { assistantMessageId: string }) {
  const plan = useAiRequestPlanStore(
    (state) => state.buckets[assistantMessageId]?.plan ?? null,
  )
  if (!plan) return null
  return <RequestPlanCardView plan={plan} />
}

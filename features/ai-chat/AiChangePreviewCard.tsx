"use client"

import React, { useMemo, useState } from "react"
import { AlertCircle, ArrowRight, Check, Loader2 } from "lucide-react"
import {
  useAiChangePreviewStreamStore,
  type AiChangePreviewEntry,
  type AiChangePreviewItem,
  type AiChangePreviewPhase,
} from "../../app/store/ai-change-preview-stream"
import { cn } from "../../app/lib/utils"

const VALUE_COLLAPSE_LENGTH = 140

const ENTITY_LABELS: Record<string, { live: string; done: string }> = {
  task_component_structure: { live: "Updating structure", done: "Component structure updated" },
  task_component_output: { live: "Saving content", done: "Content saved" },
  task_seo: { live: "Updating SEO", done: "SEO fields updated" },
  task_fields: { live: "Updating task fields", done: "Task fields updated" },
  bulk_task_fields: { live: "Updating task fields", done: "Task fields updated" },
  project_fields: { live: "Updating project fields", done: "Project fields updated" },
  task_channel: { live: "Updating task channel", done: "Task channel updated" },
  generic: { live: "Applying change", done: "Change applied" },
}

function isLivePhase(phase: AiChangePreviewPhase): boolean {
  return phase === "started" || phase === "delta" || phase === "completed"
}

function resolveTitle(entry: AiChangePreviewEntry): string {
  const explicit = entry.title?.trim()
  if (explicit) return explicit
  const labels = ENTITY_LABELS[entry.entity_type] ?? ENTITY_LABELS.generic
  return isLivePhase(entry.phase) ? labels.live : labels.done
}

/** Group status: failed if any failed, saved only when every card is terminal-saved, else in progress. */
function aggregatePhase(entries: AiChangePreviewEntry[]): { phase: AiChangePreviewPhase; ok: boolean | null } {
  if (entries.some((e) => e.phase === "failed" || e.ok === false)) {
    return { phase: "failed", ok: false }
  }
  if (entries.length > 0 && entries.every((e) => e.phase === "saved")) {
    return { phase: "saved", ok: true }
  }
  return { phase: "started", ok: null }
}

function stringifyValue(value: unknown): string {
  if (value == null) return "—"
  if (typeof value === "string") return value.length > 0 ? value : "—"
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function ChangeValue({ value }: { value: unknown }) {
  const [expanded, setExpanded] = useState(false)
  const text = stringifyValue(value)
  const isLong = text.length > VALUE_COLLAPSE_LENGTH
  const shown = !isLong || expanded ? text : `${text.slice(0, VALUE_COLLAPSE_LENGTH)}…`
  return (
    <span className="break-words [overflow-wrap:anywhere]">
      {shown}
      {isLong ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="ml-1 text-[11px] font-medium text-primary hover:underline"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      ) : null}
    </span>
  )
}

function isWaitingForInput(entry: AiChangePreviewEntry): boolean {
  return entry.requires_clarification === true || entry.no_build_created === true
}

function StatusPill({
  phase,
  ok,
  waitingForInput,
}: {
  phase: AiChangePreviewPhase
  ok?: boolean | null
  waitingForInput?: boolean
}) {
  if (waitingForInput) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
        Waiting for input
      </span>
    )
  }
  if (phase === "failed" || ok === false) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
        <AlertCircle className="h-3 w-3" aria-hidden />
        Failed
      </span>
    )
  }
  if (phase === "saved") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600">
        <Check className="h-3 w-3" aria-hidden />
        Saved
      </span>
    )
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
      <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
      In progress
    </span>
  )
}

function PreviewItemsList({ items }: { items: AiChangePreviewItem[] }) {
  return (
    <div className="border-t border-border/70 px-3 py-2">
      <ul className="space-y-1.5">
        {items.map((item, index) => {
          const values = item.values ?? []
          return (
            <li key={`${item.label}-${index}`} className="text-xs">
              <div className="flex flex-wrap items-baseline gap-1.5">
                <span className="font-medium text-foreground">{item.label}</span>
                {typeof item.count === "number" && item.count > 0 ? (
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {item.count}
                  </span>
                ) : null}
              </div>
              {values.length > 0 ? (
                <p className="mt-0.5 text-muted-foreground break-words [overflow-wrap:anywhere]">
                  {values.join(", ")}
                </p>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function TechnicalDetails({ entries }: { entries: AiChangePreviewEntry[] }) {
  const changes = entries.flatMap((entry) => entry.changes ?? [])
  if (changes.length === 0) return null
  return (
    <details className="group border-t border-border/70">
      <summary className="cursor-pointer list-none px-3 py-2 text-[11px] font-medium text-muted-foreground hover:text-foreground">
        Technical details
      </summary>
      <div className="px-3 pb-2">
        <ul className="space-y-1.5">
          {changes.map((change, index) => (
            <li key={`${change.field}-${index}`} className="text-xs">
              <span className="font-medium text-foreground">
                {change.label?.trim() || change.field}
              </span>
              <div className="mt-0.5 flex flex-wrap items-center gap-1 text-muted-foreground">
                {change.before !== undefined && change.before !== null && change.before !== "" ? (
                  <>
                    <span className="text-red-600/90 line-through">
                      <ChangeValue value={change.before} />
                    </span>
                    <ArrowRight className="h-3 w-3 shrink-0" aria-hidden />
                  </>
                ) : null}
                <span className="text-emerald-700">
                  <ChangeValue value={change.after} />
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </details>
  )
}

/**
 * Compact write-action preview. Accepts one or more preview keys — related structure cards
 * that share a `group_id` collapse into a single grouped card. Prefers `preview_items` for
 * display; raw `changes` are tucked behind a "Technical details" disclosure.
 */
export function AiChangePreviewCard({
  previewKey,
  previewKeys,
}: {
  previewKey?: string
  previewKeys?: string[]
}) {
  const keys = useMemo(
    () => (previewKeys && previewKeys.length > 0 ? previewKeys : previewKey ? [previewKey] : []),
    [previewKeys, previewKey],
  )
  const previews = useAiChangePreviewStreamStore((state) => state.previews)

  const entries = useMemo(
    () => keys.map((key) => previews[key]).filter((entry): entry is AiChangePreviewEntry => Boolean(entry)),
    [keys, previews],
  )

  const isGroup = entries.length > 1
  const waitingForInput = useMemo(
    () => entries.some((entry) => isWaitingForInput(entry)),
    [entries],
  )
  const status = useMemo(
    () =>
      isGroup
        ? aggregatePhase(entries)
        : entries[0]
          ? { phase: entries[0].phase, ok: entries[0].ok ?? null }
          : { phase: "started" as AiChangePreviewPhase, ok: null },
    [entries, isGroup],
  )

  const title = useMemo(() => {
    if (entries.length === 0) return ""
    if (waitingForInput) {
      return entries[0]?.title?.trim() || "Build preflight"
    }
    if (!isGroup) return resolveTitle(entries[0])
    // A group with a single distinct entity type reuses that label; otherwise a neutral header.
    const entityTypes = new Set(entries.map((e) => e.entity_type))
    if (entityTypes.size === 1) return resolveTitle({ ...entries[0], phase: status.phase } as AiChangePreviewEntry)
    return status.phase === "saved" ? "Changes applied" : "Applying changes"
  }, [entries, isGroup, status.phase, waitingForInput])

  const previewItems = useMemo(
    () => entries.flatMap((entry) => entry.preview_items ?? []),
    [entries],
  )
  const summary = useMemo(() => {
    if (waitingForInput) {
      return (
        entries.map((entry) => entry.summary?.trim()).find((value) => Boolean(value))
        || "Waiting for input"
      )
    }
    return entries.map((entry) => entry.summary?.trim()).find((value) => Boolean(value)) ?? ""
  }, [entries, waitingForInput])
  const reason = useMemo(
    () => (!isGroup ? entries[0]?.reason?.trim() ?? "" : ""),
    [entries, isGroup],
  )
  const errorText = useMemo(
    () => entries.map((entry) => entry.error?.trim()).find((value) => Boolean(value)) ?? "",
    [entries],
  )
  /** Prefer backend task/channel counts over conflating channels as tasks. */
  const buildCounts = useMemo(() => {
    for (const entry of entries) {
      if (entry.task_count != null || entry.channel_count != null) {
        return {
          taskCount: entry.task_count ?? null,
          channelCount: entry.channel_count ?? null,
        }
      }
    }
    return null
  }, [entries])

  if (entries.length === 0) return null

  const showFailed = status.phase === "failed" || status.ok === false

  return (
    <div
      className={cn(
        "w-full max-w-full min-w-0 overflow-hidden rounded-xl border border-border bg-card text-left shadow-sm",
        showFailed && "border-destructive/40",
      )}
    >
      <div className="flex w-full min-w-0 max-w-full items-center gap-2 px-3 py-2.5">
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{title}</span>
        <StatusPill phase={status.phase} ok={status.ok} waitingForInput={waitingForInput} />
      </div>

      {summary ? (
        <p className="px-3 pb-2 text-xs text-muted-foreground break-words [overflow-wrap:anywhere]">
          {summary}
        </p>
      ) : null}

      {buildCounts ? (
        <div className="flex flex-wrap gap-2 border-t border-border/70 px-3 py-2 text-xs text-muted-foreground">
          {buildCounts.taskCount != null ? (
            <span>
              <span className="font-medium text-foreground">{buildCounts.taskCount}</span>
              {` ${buildCounts.taskCount === 1 ? "task" : "tasks"}`}
            </span>
          ) : null}
          {buildCounts.channelCount != null ? (
            <span>
              <span className="font-medium text-foreground">{buildCounts.channelCount}</span>
              {` ${buildCounts.channelCount === 1 ? "channel" : "channels"}`}
            </span>
          ) : null}
        </div>
      ) : null}

      {previewItems.length > 0 ? <PreviewItemsList items={previewItems} /> : null}

      {reason ? (
        <p className="border-t border-border/70 px-3 py-2 text-[11px] italic text-muted-foreground break-words [overflow-wrap:anywhere]">
          {reason}
        </p>
      ) : null}

      <TechnicalDetails entries={entries} />

      {showFailed && errorText ? (
        <p className="border-t border-destructive/30 px-3 py-2 text-xs text-destructive/90 break-words [overflow-wrap:anywhere]">
          {errorText}
        </p>
      ) : null}
    </div>
  )
}

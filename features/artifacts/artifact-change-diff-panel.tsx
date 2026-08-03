"use client"

import React, { useMemo, useState } from "react"
import { ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "../../app/lib/utils"
import { ComponentContentDiffView } from "../tasks/components/ComponentContentDiffView"
import {
  buildComponentPreviewDiff,
  hasRenderableDiff,
} from "../tasks/utils/component-content-diff"
import {
  artifactDiffPlainFromContent,
} from "../../app/lib/artifact-selection-patch"

export type ArtifactChangeDiffPanelProps = {
  /** Plain or HTML-ish before body. */
  beforeText?: string | null
  beforeContentJson?: unknown
  /** Plain or HTML-ish after body. */
  afterText?: string | null
  afterContentJson?: unknown
  /** Label e.g. "v102 → v103" or "AI edit". */
  label?: string | null
  className?: string
  /** Start with the red/green diff visible. */
  defaultOpen?: boolean
}

/**
 * Collapsible red/green change view for the artifact pane (version history + live AI).
 */
export function ArtifactChangeDiffPanel({
  beforeText,
  beforeContentJson,
  afterText,
  afterContentJson,
  label,
  className,
  defaultOpen = true,
}: ArtifactChangeDiffPanelProps) {
  const [open, setOpen] = useState(defaultOpen)

  const beforePlain = useMemo(
    () => artifactDiffPlainFromContent(beforeText, beforeContentJson),
    [beforeContentJson, beforeText],
  )
  const afterPlain = useMemo(
    () => artifactDiffPlainFromContent(afterText, afterContentJson),
    [afterContentJson, afterText],
  )

  const diffLines = useMemo(() => {
    if (!beforePlain || !afterPlain || beforePlain === afterPlain) return []
    return buildComponentPreviewDiff({
      operation: "replace",
      beforeText: beforePlain,
      afterText: afterPlain,
    })
  }, [afterPlain, beforePlain])

  const canShow = hasRenderableDiff(diffLines)
  if (!canShow) return null

  const stats = useMemo(() => {
    let added = 0
    let removed = 0
    for (const line of diffLines) {
      if (line.type === "added") added += line.text.length
      if (line.type === "removed") removed += line.text.length
    }
    return { added, removed }
  }, [diffLines])

  return (
    <div className={cn("border-b border-border bg-muted/20", className)}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs text-muted-foreground hover:bg-muted/40"
        aria-expanded={open}
      >
        <span className="font-medium text-foreground">
          {label?.trim() || "Changes"}
        </span>
        <span className="inline-flex items-center gap-1.5">
          {stats.added > 0 ? (
            <span className="font-medium text-emerald-600">+{stats.added}</span>
          ) : null}
          {stats.removed > 0 ? (
            <span className="font-medium text-red-600">−{stats.removed}</span>
          ) : null}
        </span>
        <span className="ml-auto inline-flex items-center gap-1">
          {open ? "Hide" : "Show"}
          {open ? (
            <ChevronUp className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" aria-hidden />
          )}
        </span>
      </button>
      {open ? (
        <div className="max-h-[min(40vh,22rem)] overflow-y-auto border-t border-border/60 bg-card">
          <ComponentContentDiffView
            lines={diffLines}
            className="px-4 py-3"
          />
        </div>
      ) : null}
    </div>
  )
}

/** True when before/after sides produce a renderable red/green diff. */
export function artifactChangeDiffHasContent(args: {
  beforeText?: string | null
  beforeContentJson?: unknown
  afterText?: string | null
  afterContentJson?: unknown
}): boolean {
  const before = artifactDiffPlainFromContent(args.beforeText, args.beforeContentJson)
  const after = artifactDiffPlainFromContent(args.afterText, args.afterContentJson)
  if (!before || !after || before === after) return false
  return hasRenderableDiff(
    buildComponentPreviewDiff({
      operation: "replace",
      beforeText: before,
      afterText: after,
    }),
  )
}

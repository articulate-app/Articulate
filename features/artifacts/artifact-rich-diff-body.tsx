"use client"

import React, { useMemo } from "react"
import { cn } from "../../app/lib/utils"
import { AI_CHAT_PREVIEW_BODY_WRAPPER_CLASS } from "../tasks/components/component-output-body-shared"
import {
  buildArtifactTrackChangesHtml,
  resolveArtifactDiffHtml,
} from "./artifact-rich-diff-html"

export type ArtifactRichDiffBodyProps = {
  beforeText?: string | null
  beforeContentJson?: unknown
  afterText?: string | null
  afterContentJson?: unknown
  /** Prefer raw HTML when already available (section / hunk previews). */
  beforeHtml?: string | null
  afterHtml?: string | null
  /** Omit unchanged blocks — used in AI chat preview cards. */
  changedOnly?: boolean
  label?: string | null
  addedChars?: number
  removedChars?: number
  className?: string
  compact?: boolean
}

/**
 * Track-changes view in the same rich-text typography as the artifact editor.
 */
export function ArtifactRichDiffBody({
  beforeText,
  beforeContentJson,
  afterText,
  afterContentJson,
  beforeHtml,
  afterHtml,
  changedOnly = false,
  label,
  addedChars = 0,
  removedChars = 0,
  className,
  compact = false,
}: ArtifactRichDiffBodyProps) {
  const html = useMemo(() => {
    const resolvedBefore = resolveArtifactDiffHtml({
      contentText: beforeText,
      contentJson: beforeContentJson,
      htmlHint: beforeHtml ?? beforeText,
    })
    const resolvedAfter = resolveArtifactDiffHtml({
      contentText: afterText,
      contentJson: afterContentJson,
      htmlHint: afterHtml ?? afterText,
    })
    return buildArtifactTrackChangesHtml(resolvedBefore, resolvedAfter, { changedOnly })
  }, [
    afterContentJson,
    afterHtml,
    afterText,
    beforeContentJson,
    beforeHtml,
    beforeText,
    changedOnly,
  ])

  return (
    <div className={cn(compact ? "py-1" : "px-2 py-3", className)}>
      {!compact && (label || addedChars > 0 || removedChars > 0) ? (
        <div className="mb-2 flex items-center gap-2 px-2 text-xs text-muted-foreground">
          {label ? (
            <span className="font-medium text-foreground">{label}</span>
          ) : null}
          {addedChars > 0 ? (
            <span className="font-medium text-emerald-700">+{addedChars}</span>
          ) : null}
          {removedChars > 0 ? (
            <span className="font-medium text-red-700">−{removedChars}</span>
          ) : null}
        </div>
      ) : null}
      <div
        data-artifact-rich-diff="true"
        className={cn(
          AI_CHAT_PREVIEW_BODY_WRAPPER_CLASS,
          "artifact-rich-diff-body",
          compact ? "px-0 py-0" : "px-3 py-2",
        )}
      >
        <div
          className="rte-prose max-w-none"
          // Track-changes HTML is built from trusted artifact snapshots (escaped text nodes).
          dangerouslySetInnerHTML={{ __html: html || "<p></p>" }}
        />
      </div>
    </div>
  )
}

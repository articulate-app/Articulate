"use client"

import React, { useMemo } from "react"
import {
  AlertCircle,
  Loader2,
} from "lucide-react"
import { cn } from "../../app/lib/utils"
import { normalizeComponentOutputToHtml } from "../../app/lib/rich-text-normalization"
import type { AiBuildArtifactPreviewEntry } from "../../app/store/ai-build-artifact-preview-store"
import { ComponentOutputReadonlyBody } from "../tasks/components/ComponentOutputReadonlyBody"
import {
  extractPrimaryArtifactHtml,
  simpleMarkdownToHtml,
} from "../../app/lib/artifact-selection-patch"
import { ArtifactRichDiffBody } from "./artifact-rich-diff-body"
import {
  resolveArtifactChangeSides,
  resolveArtifactPreviewChangeInput,
  splitArtifactChangeSegments,
  type ArtifactChangeSegment,
} from "./resolve-artifact-change-diff"
import type { TaskArtifact } from "../../app/lib/artifacts/artifact-types"
import { isHtmlEmailArtifact } from "./artifact-html-document"
import { ArtifactHtmlDocumentView } from "./artifact-html-document-view"

const CHAT_PREVIEW_MAX_SEGMENT_CHARS = 480
/** One preview card per artifact per run — segment split was stacking same-title cards. */
const CHAT_PREVIEW_MAX_SEGMENTS = 1

function PreviewDiffCharStats({
  added,
  removed,
}: {
  added: number
  removed: number
}) {
  if (added === 0 && removed === 0) return null
  return (
    <span className="inline-flex items-center gap-1.5">
      {added > 0 ? <span className="font-medium text-emerald-600">+{added}</span> : null}
      {removed > 0 ? <span className="font-medium text-red-600">−{removed}</span> : null}
    </span>
  )
}

function phaseLabel(phase: AiBuildArtifactPreviewEntry["phase"]): string {
  switch (phase) {
    case "media":
      return "Generating media"
    case "preview":
      return "Preview"
    case "saved":
      return "Saved"
    case "failed":
      return "Failed"
    case "started":
      return "Building"
    default:
      return "Building"
  }
}

function snippetToPreviewHtml(snippet: string): string {
  const raw = snippet.trim()
  if (!raw) return "<p></p>"
  if (/<\/?[a-z][\s\S]*>/i.test(raw)) {
    return normalizeComponentOutputToHtml(raw, null) || raw
  }
  return simpleMarkdownToHtml(raw) || normalizeComponentOutputToHtml(raw, null) || `<p>${raw}</p>`
}

function PreviewStatusPill({
  phase,
  isLive,
}: {
  phase: AiBuildArtifactPreviewEntry["phase"]
  isLive: boolean
}) {
  if (phase === "failed") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
        <AlertCircle className="h-3 w-3" aria-hidden />
        {phaseLabel(phase)}
      </span>
    )
  }
  if (isLive) {
    return (
      <span
        className="inline-flex shrink-0 items-center rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground"
        title={phaseLabel(phase)}
        aria-label={phaseLabel(phase)}
      >
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
      </span>
    )
  }
  return null
}

function SegmentPreviewCard({
  preview,
  segment,
  onOpen,
}: {
  preview: AiBuildArtifactPreviewEntry
  segment: ArtifactChangeSegment
  onOpen?: () => void
}) {
  const isLive = preview.phase !== "saved" && preview.phase !== "failed"
  return (
    <div
      className={cn(
        "group card-row relative w-full max-w-full min-w-0 overflow-x-hidden rounded-xl border border-border bg-card text-left shadow-sm",
        preview.phase === "failed" && "border-destructive/40",
      )}
    >
      <div className="flex w-full min-w-0 max-w-full items-center gap-2 px-3 py-2 sm:px-4">
        <button
          type="button"
          onClick={onOpen}
          className="min-w-0 flex-1 truncate text-left text-sm text-foreground"
        >
          <span className="font-medium">{preview.title?.trim() || "Artifact"}</span>
        </button>
        <PreviewDiffCharStats added={segment.addedChars} removed={segment.removedChars} />
        <PreviewStatusPill phase={preview.phase} isLive={isLive} />
      </div>
      <div className="max-h-40 w-full max-w-full min-w-0 overflow-x-hidden overflow-y-auto border-t border-border/70 px-3 pb-2 pt-1.5 sm:px-4">
        <ArtifactRichDiffBody
          prebuiltHtml={segment.html}
          compact
          className="!py-0"
        />
      </div>
    </div>
  )
}

function BaselinePreviewCard({
  preview,
  html,
  onOpen,
}: {
  preview: AiBuildArtifactPreviewEntry
  html: string
  onOpen?: () => void
}) {
  const isLive = preview.phase !== "saved" && preview.phase !== "failed"
  return (
    <div
      className={cn(
        "group card-row relative w-full max-w-full min-w-0 overflow-x-hidden rounded-xl border border-border bg-card text-left shadow-sm",
        preview.phase === "failed" && "border-destructive/40",
      )}
    >
      <div className="flex w-full min-w-0 max-w-full items-center gap-2 px-3 py-2 sm:px-4">
        <button
          type="button"
          onClick={onOpen}
          className="min-w-0 flex-1 truncate text-left text-sm text-foreground"
        >
          <span className="font-medium">{preview.title?.trim() || "Artifact"}</span>
        </button>
        <PreviewStatusPill phase={preview.phase} isLive={isLive} />
      </div>
      {preview.errorMessage ? (
        <p className="px-3 pb-1 text-xs text-destructive/90 sm:px-4">{preview.errorMessage}</p>
      ) : null}
      <div className="max-h-40 w-full max-w-full min-w-0 overflow-x-hidden overflow-y-auto border-t border-border/70 px-3 pb-2 pt-1.5 sm:px-4">
        {isHtmlEmailArtifact(artifactFromLivePreview(preview)) ? (
          <ArtifactHtmlDocumentView
            html={html}
            readOnly
            variant="preview"
          />
        ) : (
          <ComponentOutputReadonlyBody
            html={normalizeComponentOutputToHtml(html, null) || html}
            toolbarId={`artifact-baseline-${preview.artifactId}`}
            className="border-0 bg-transparent shadow-none"
            fromAiChat
            placeholder={isLive ? "Generating…" : "Empty"}
          />
        )}
      </div>
    </div>
  )
}

export function artifactFromLivePreview(entry: AiBuildArtifactPreviewEntry): TaskArtifact {
  const isBusy = entry.phase !== "saved" && entry.phase !== "failed"
  const preferBaseline =
    isBusy
    && (Boolean(entry.beforeContentJson) || Boolean(entry.beforeContentText?.trim()))
  return {
    id: entry.artifactId,
    task_id: entry.taskId,
    project_id: null,
    ai_thread_id: entry.aiThreadId ?? entry.threadId,
    artifact_type: entry.artifactType?.trim() || "document",
    artifact_role: entry.artifactRole ?? null,
    title: entry.title,
    status: "draft",
    channel_id: entry.channelId,
    language_id: entry.languageId,
    content_text: preferBaseline
      ? (entry.beforeContentText ?? entry.contentText)
      : entry.contentText,
    content_json: preferBaseline
      ? (entry.beforeContentJson ?? entry.contentJson)
      : entry.contentJson,
    asset_data: entry.assetData,
    source_artifact_id: null,
    source_version_number: null,
    derivation_type: null,
    current_version: entry.currentVersion ?? 1,
    metadata: {
      ...(entry.channelName ? { channel_name: entry.channelName } : {}),
      ...(entry.languageName ? { language_name: entry.languageName } : {}),
    },
    created_at: entry.updatedAt,
    updated_at: entry.updatedAt,
  }
}

export type ArtifactLivePreviewCardsProps = {
  preview: AiBuildArtifactPreviewEntry
  allowAttachToTask?: boolean
  onOpenArtifact?: (artifactId: string) => void
}

/**
 * Chat preview: small rich track-change segments from the shared HTML↔HTML resolver.
 */
export function ArtifactLivePreviewCards({
  preview,
  allowAttachToTask = true,
  onOpenArtifact,
}: ArtifactLivePreviewCardsProps) {
  const isBusy = preview.phase !== "saved" && preview.phase !== "failed"

  const sides = useMemo(() => {
    const input = resolveArtifactPreviewChangeInput({
      phase: preview.phase,
      isBusy,
      beforeContentText: preview.beforeContentText,
      beforeContentJson: preview.beforeContentJson,
      contentText: preview.contentText,
      contentJson: preview.contentJson,
      diffContentText: preview.diffContentText,
      sectionHtml: preview.sectionHtml,
      sectionBeforeHtml: preview.sectionBeforeHtml,
      streamSnippet: preview.streamSnippet,
      baselineContentJson: preview.beforeContentJson,
      baselineContentText: preview.beforeContentText,
    })
    if (!input) {
      return resolveArtifactChangeSides({
        beforeText: preview.beforeContentText,
        beforeContentJson: preview.beforeContentJson,
        afterText: preview.diffContentText || preview.contentText,
        afterContentJson: preview.contentJson,
        baselineContentJson: preview.beforeContentJson,
        baselineContentText: preview.beforeContentText,
      })
    }
    return resolveArtifactChangeSides(input)
  }, [
    isBusy,
    preview.beforeContentJson,
    preview.beforeContentText,
    preview.contentJson,
    preview.contentText,
    preview.diffContentText,
    preview.phase,
    preview.sectionBeforeHtml,
    preview.sectionHtml,
    preview.streamSnippet,
  ])

  const segments = useMemo(() => {
    if (!sides.hasChanges) return []
    const changedOnly = sides.trackChangesHtmlChangedOnly?.trim() || ""
    const fullTrack = sides.trackChangesHtml?.trim() || ""
    // Prefer a single combined changed-only card; if that is empty while stats
    // claim edits, fall back to the full track or after HTML so the body is never blank.
    const html =
      (changedOnly && changedOnly !== "<p></p>" ? changedOnly : "")
      || (fullTrack && fullTrack !== "<p></p>" ? fullTrack : "")
      || sides.afterHtml
      || ""
    if (html) {
      return [
        {
          html,
          addedChars: sides.stats.added,
          removedChars: sides.stats.removed,
        } satisfies ArtifactChangeSegment,
      ]
    }
    return splitArtifactChangeSegments(sides.beforeHtml, sides.afterHtml, {
      maxChars: CHAT_PREVIEW_MAX_SEGMENT_CHARS,
      maxSegments: CHAT_PREVIEW_MAX_SEGMENTS,
    })
  }, [sides])

  if (segments.length >= 1) {
    const segment = segments[0]
    return (
      <li key={preview.artifactId}>
        <SegmentPreviewCard
          preview={preview}
          segment={segment}
          onOpen={() => onOpenArtifact?.(preview.artifactId)}
        />
      </li>
    )
  }

  if (isBusy) {
    // Prefer progressive stream body over the empty pre-edit baseline so creates
    // show content as it generates instead of "Editing artifact…".
    const liveHtml =
      preview.sectionHtml?.trim()
      || (preview.streamSnippet?.trim()
        ? snippetToPreviewHtml(preview.streamSnippet)
        : null)
      || (preview.contentText?.trim()
        ? snippetToPreviewHtml(preview.contentText)
        : null)
      || null
    const baselineHtml =
      liveHtml
      || extractPrimaryArtifactHtml(preview.beforeContentJson)
      || (preview.beforeContentText?.trim()
        ? snippetToPreviewHtml(preview.beforeContentText)
        : null)
      || "<p><em>Generating…</em></p>"
    return (
      <li key={preview.artifactId}>
        <BaselinePreviewCard
          preview={preview}
          html={baselineHtml}
          onOpen={() => onOpenArtifact?.(preview.artifactId)}
        />
      </li>
    )
  }

  // Settled create / no-diff: keep the same compact shell as updates (title opens
  // center pane, max-h-40). Do not fall through to uncapped ArtifactCard in chat.
  const settledHtml =
    extractPrimaryArtifactHtml(preview.contentJson)
    || (preview.contentText?.trim() ? snippetToPreviewHtml(preview.contentText) : null)
    || (preview.streamSnippet?.trim() ? snippetToPreviewHtml(preview.streamSnippet) : null)
    || (preview.diffContentText?.trim() ? snippetToPreviewHtml(preview.diffContentText) : null)
    || "<p><em>Empty artifact</em></p>"

  return (
    <li key={preview.artifactId}>
      <BaselinePreviewCard
        preview={preview}
        html={settledHtml}
        onOpen={() => onOpenArtifact?.(preview.artifactId)}
      />
    </li>
  )
}

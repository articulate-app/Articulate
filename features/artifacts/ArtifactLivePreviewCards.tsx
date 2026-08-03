"use client"

import React, { useMemo, useState } from "react"
import {
  AlertCircle,
  Check,
  Loader2,
} from "lucide-react"
import { cn } from "../../app/lib/utils"
import { normalizeComponentOutputToHtml } from "../../app/lib/rich-text-normalization"
import type { AiBuildArtifactPreviewEntry } from "../../app/store/ai-build-artifact-preview-store"
import { ComponentOutputReadonlyBody } from "../tasks/components/ComponentOutputReadonlyBody"
import {
  artifactDiffPlainFromContent,
  canonicalArtifactDiffText,
  extractHtmlSectionByHeading,
  extractPrimaryArtifactHtml,
  simpleMarkdownToHtml,
} from "../../app/lib/artifact-selection-patch"
import {
  buildComponentPreviewDiff,
  hasRenderableDiff,
  splitDiffIntoHunks,
  type DiffHunk,
} from "../tasks/utils/component-content-diff"
import { ArtifactCard } from "./ArtifactCard"
import { ArtifactRichDiffBody } from "./artifact-rich-diff-body"
import type { TaskArtifact } from "../../app/lib/artifacts/artifact-types"

function PreviewDiffCharStats({
  added,
  removed,
  onClick,
  canToggle,
}: {
  added: number
  removed: number
  onClick?: () => void
  canToggle?: boolean
}) {
  if (added === 0 && removed === 0) return null
  const className = canToggle
    ? "inline-flex items-center gap-1.5 rounded px-1 py-0.5 transition-colors hover:bg-muted"
    : "inline-flex items-center gap-1.5"
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        onClick?.()
      }}
      disabled={!canToggle}
      className={className}
      aria-label={canToggle ? "Toggle diff view" : undefined}
    >
      {added > 0 ? <span className="font-medium text-emerald-600">+{added}</span> : null}
      {removed > 0 ? <span className="font-medium text-red-600">−{removed}</span> : null}
    </button>
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

function resolveSectionHtml(preview: AiBuildArtifactPreviewEntry): string | null {
  if (preview.sectionHtml?.trim()) return preview.sectionHtml
  const heading = preview.targetSectionHeading?.trim()
  if (!heading) return null
  const full = extractPrimaryArtifactHtml(preview.contentJson)
  if (!full) return null
  return extractHtmlSectionByHeading(full, heading)?.sectionHtml ?? null
}

function resolveSectionBeforeHtml(preview: AiBuildArtifactPreviewEntry): string | null {
  if (preview.sectionBeforeHtml?.trim()) return preview.sectionBeforeHtml
  const heading = preview.targetSectionHeading?.trim()
  if (!heading) return null
  const full = extractPrimaryArtifactHtml(preview.beforeContentJson)
  if (!full) return null
  return extractHtmlSectionByHeading(full, heading)?.sectionHtml ?? null
}

function snippetToPreviewHtml(snippet: string): string {
  const raw = snippet.trim()
  if (!raw) return "<p></p>"
  if (/<\/?[a-z][\s\S]*>/i.test(raw)) {
    return normalizeComponentOutputToHtml(raw, null) || raw
  }
  return simpleMarkdownToHtml(raw) || normalizeComponentOutputToHtml(raw, null) || `<p>${raw}</p>`
}

function SectionPreviewCard({
  preview,
  html,
  subtitle,
  onOpen,
  isLive,
}: {
  preview: AiBuildArtifactPreviewEntry
  html: string
  subtitle: string
  onOpen?: () => void
  isLive: boolean
}) {
  const [showDiff, setShowDiff] = useState(true)
  const beforeHtml = resolveSectionBeforeHtml(preview)
  const beforeText = beforeHtml
    ? canonicalArtifactDiffText(beforeHtml)
    : artifactDiffPlainFromContent(preview.beforeContentText, preview.beforeContentJson)
  const afterText = canonicalArtifactDiffText(html)
  const diffLines = useMemo(() => {
    if (!beforeText || !afterText || beforeText === afterText) return []
    return buildComponentPreviewDiff({
      operation: "replace",
      beforeText,
      afterText,
    })
  }, [afterText, beforeText])
  const canShowDiff = hasRenderableDiff(diffLines)
  const diffStats = useMemo(() => {
    if (!canShowDiff) return { added: 0, removed: 0 }
    let added = 0
    let removed = 0
    for (const line of diffLines) {
      if (line.type === "added") added += line.text.length
      if (line.type === "removed") removed += line.text.length
    }
    return { added, removed }
  }, [canShowDiff, diffLines])

  return (
    <div
      className={cn(
        "group card-row relative w-full max-w-full min-w-0 overflow-x-hidden rounded-xl border border-border bg-card text-left shadow-sm",
        preview.phase === "failed" && "border-destructive/40",
      )}
    >
      <div className="flex w-full min-w-0 max-w-full items-center gap-2 px-3 py-2.5 sm:px-4">
        <button
          type="button"
          onClick={onOpen}
          className="min-w-0 flex-1 truncate text-left text-sm text-foreground"
        >
          {isLive || preview.phase === "started" ? (
            <Loader2 className="mr-1.5 inline h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground align-[-2px]" aria-hidden />
          ) : null}
          {preview.phase === "saved" ? (
            <Check className="mr-1.5 inline h-3.5 w-3.5 shrink-0 text-emerald-600 align-[-2px]" aria-hidden />
          ) : null}
          <span className="font-medium">{preview.title?.trim() || "Artifact"}</span>
          <span className="ml-2 text-xs font-normal text-muted-foreground">{subtitle}</span>
        </button>
        <PreviewDiffCharStats
          added={diffStats.added}
          removed={diffStats.removed}
          canToggle={canShowDiff}
          onClick={() => {
            if (!canShowDiff) return
            setShowDiff((value) => !value)
          }}
        />
        {preview.phase === "failed" ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
            <AlertCircle className="h-3 w-3" aria-hidden />
            {phaseLabel(preview.phase)}
          </span>
        ) : preview.phase === "saved" ? (
          <span
            className="inline-flex shrink-0 items-center rounded-full bg-emerald-50 px-1.5 py-0.5 text-emerald-800"
            title={phaseLabel(preview.phase)}
            aria-label={phaseLabel(preview.phase)}
          >
            <Check className="h-3 w-3" aria-hidden />
          </span>
        ) : (
          <span
            className="inline-flex shrink-0 items-center rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground"
            title={phaseLabel(preview.phase)}
            aria-label={phaseLabel(preview.phase)}
          >
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          </span>
        )}
      </div>
      {preview.errorMessage ? (
        <p className="px-3 pb-1 text-xs text-destructive/90 sm:px-4">{preview.errorMessage}</p>
      ) : null}
      <div className="w-full max-w-full min-w-0 overflow-x-hidden border-t border-border/70 px-3 pb-2 pt-2 sm:px-4">
        {showDiff && canShowDiff ? (
          <ArtifactRichDiffBody
            beforeHtml={beforeHtml}
            beforeText={beforeText}
            afterHtml={html}
            afterText={afterText}
            changedOnly
            compact
          />
        ) : (
          <ComponentOutputReadonlyBody
            html={normalizeComponentOutputToHtml(html, null) || html}
            toolbarId={`artifact-section-${preview.artifactId}`}
            className="border-0 bg-transparent shadow-none"
            fromAiChat
            placeholder={isLive ? "Generating…" : "Empty change"}
          />
        )}
      </div>
    </div>
  )
}

function ArtifactHunkPreviewCard({
  preview,
  hunk,
  hunkIndex,
  hunkCount,
  onOpen,
}: {
  preview: AiBuildArtifactPreviewEntry
  hunk: DiffHunk
  hunkIndex: number
  hunkCount: number
  onOpen?: () => void
}) {
  const [showDiff, setShowDiff] = useState(true)
  const canShowDiff = hasRenderableDiff(hunk.lines)
  const isLive = preview.phase !== "saved" && preview.phase !== "failed"
  const title = preview.title?.trim() || "Artifact"
  const subtitle =
    hunkCount > 1
      ? `Change ${hunkIndex + 1} of ${hunkCount}`
      : "Edit"
  const previewHtml = useMemo(() => {
    // Prefer authoritative HTML from the saved artifact when the hunk is only plain text.
    const fullHtml = extractPrimaryArtifactHtml(preview.contentJson)
    if (fullHtml && hunk.afterText.trim()) {
      const heading = hunk.afterText.split("\n").map((line) => line.trim()).find(Boolean)
      if (heading) {
        const section = extractHtmlSectionByHeading(fullHtml, heading)
        if (section?.sectionHtml?.trim()) return section.sectionHtml
      }
    }
    const source = hunk.afterText || hunk.beforeText
    if (/<[a-z][\s\S]*>/i.test(source)) {
      return normalizeComponentOutputToHtml(source, null) || source
    }
    return simpleMarkdownToHtml(source) || normalizeComponentOutputToHtml(source, null) || "<p></p>"
  }, [hunk.afterText, hunk.beforeText, preview.contentJson])

  return (
    <div
      className={cn(
        "group card-row relative w-full max-w-full min-w-0 overflow-x-hidden rounded-xl border border-border bg-card text-left shadow-sm",
        preview.phase === "failed" && "border-destructive/40",
      )}
    >
      <div className="flex w-full min-w-0 max-w-full items-center gap-2 px-3 py-2.5 sm:px-4">
        <button
          type="button"
          onClick={onOpen}
          className="min-w-0 flex-1 truncate text-left text-sm text-foreground"
        >
          {(isLive || preview.phase === "started") && (
            <Loader2 className="mr-1.5 inline h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground align-[-2px]" aria-hidden />
          )}
          {preview.phase === "saved" ? (
            <Check className="mr-1.5 inline h-3.5 w-3.5 shrink-0 text-emerald-600 align-[-2px]" aria-hidden />
          ) : null}
          <span className="font-medium">{title}</span>
          <span className="ml-2 text-xs font-normal text-muted-foreground">{subtitle}</span>
        </button>
        <PreviewDiffCharStats
          added={hunk.addedChars}
          removed={hunk.removedChars}
          canToggle={canShowDiff}
          onClick={() => {
            if (!canShowDiff) return
            setShowDiff((value) => !value)
          }}
        />
        {preview.phase === "failed" ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
            <AlertCircle className="h-3 w-3" aria-hidden />
            {phaseLabel(preview.phase)}
          </span>
        ) : preview.phase === "saved" ? (
          <span
            className="inline-flex shrink-0 items-center rounded-full bg-emerald-50 px-1.5 py-0.5 text-emerald-800"
            title={phaseLabel(preview.phase)}
            aria-label={phaseLabel(preview.phase)}
          >
            <Check className="h-3 w-3" aria-hidden />
          </span>
        ) : (
          <span
            className="inline-flex shrink-0 items-center rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground"
            title={phaseLabel(preview.phase)}
            aria-label={phaseLabel(preview.phase)}
          >
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          </span>
        )}
      </div>
      {preview.errorMessage && hunkIndex === 0 ? (
        <p className="px-3 pb-1 text-xs text-destructive/90 sm:px-4">{preview.errorMessage}</p>
      ) : null}
      <div className="w-full max-w-full min-w-0 overflow-x-hidden border-t border-border/70 px-3 pb-2 pt-2 sm:px-4">
        {showDiff && canShowDiff ? (
          <ArtifactRichDiffBody
            beforeText={hunk.beforeText}
            afterText={hunk.afterText}
            changedOnly
            compact
          />
        ) : (
          <ComponentOutputReadonlyBody
            html={previewHtml}
            toolbarId={`artifact-hunk-${preview.artifactId}-${hunkIndex}`}
            className="border-0 bg-transparent shadow-none"
            fromAiChat
            placeholder={isLive ? "Generating…" : "Empty change"}
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
  defaultTaskId?: number | null
  defaultChannelId?: number | null
  onOpenArtifact?: (artifactId: string) => void
}

/**
 * Chat preview for one artifact build: prefer the edited section (formatted HTML),
 * then compact hunks — never dump the whole article while generating.
 */
export function ArtifactLivePreviewCards({
  preview,
  allowAttachToTask = true,
  defaultTaskId = null,
  defaultChannelId = null,
  onOpenArtifact,
}: ArtifactLivePreviewCardsProps) {
  const beforeText = useMemo(
    () => artifactDiffPlainFromContent(preview.beforeContentText, preview.beforeContentJson),
    [preview.beforeContentJson, preview.beforeContentText],
  )
  const isBusy = preview.phase !== "saved" && preview.phase !== "failed"
  const afterText = useMemo(() => {
    // While generating, prefer streamed/section after-text so the preview can show live diffs.
    if (isBusy) {
      if (preview.sectionHtml?.trim()) {
        return canonicalArtifactDiffText(preview.sectionHtml)
      }
      if (preview.streamSnippet?.trim()) {
        return canonicalArtifactDiffText(preview.streamSnippet)
      }
      if (typeof preview.diffContentText === "string" && preview.diffContentText.trim()) {
        return canonicalArtifactDiffText(preview.diffContentText)
      }
      const fromJson = artifactDiffPlainFromContent(preview.contentText, preview.contentJson)
      if (fromJson && fromJson !== beforeText) return fromJson
      return beforeText
    }
    if (typeof preview.diffContentText === "string" && preview.diffContentText.trim()) {
      return canonicalArtifactDiffText(preview.diffContentText)
    }
    return artifactDiffPlainFromContent(preview.contentText, preview.contentJson)
  }, [
    beforeText,
    isBusy,
    preview.contentJson,
    preview.contentText,
    preview.diffContentText,
    preview.sectionHtml,
    preview.streamSnippet,
  ])

  const sectionHtml = useMemo(() => resolveSectionHtml(preview), [preview])
  const sectionLabel = preview.targetSectionHeading?.trim() || null

  const hunks = useMemo(() => {
    // Section cards replace full-doc hunks when we know the zone.
    if (sectionLabel || sectionHtml) return []
    if (!beforeText || !afterText || beforeText === afterText) return []
    const lines = buildComponentPreviewDiff({
      operation: "replace",
      beforeText,
      afterText,
    })
    // Tight context: only a little above/below each change.
    return splitDiffIntoHunks(lines, { maxUnchangedGap: 1 }).slice(0, 6)
  }, [afterText, beforeText, sectionHtml, sectionLabel])

  if (sectionHtml || sectionLabel) {
    const html = sectionHtml
      || (preview.streamSnippet?.trim() ? snippetToPreviewHtml(preview.streamSnippet) : null)
      || (isBusy
        ? (sectionLabel ? `<p><em>Editing “${sectionLabel}”…</em></p>` : "<p><em>Editing artifact…</em></p>")
        : "<p></p>")
    return (
      <li key={preview.artifactId}>
        <SectionPreviewCard
          preview={preview}
          html={html}
          subtitle={sectionLabel ? `Section · ${sectionLabel}` : (isBusy ? phaseLabel(preview.phase) : "Edit")}
          onOpen={() => onOpenArtifact?.(preview.artifactId)}
          isLive={isBusy}
        />
      </li>
    )
  }

  if (hunks.length >= 1) {
    return (
      <>
        {hunks.map((hunk, index) => (
          <li key={`${preview.artifactId}:hunk:${index}`}>
            <ArtifactHunkPreviewCard
              preview={preview}
              hunk={hunk}
              hunkIndex={index}
              hunkCount={hunks.length}
              onOpen={() => onOpenArtifact?.(preview.artifactId)}
            />
          </li>
        ))}
      </>
    )
  }

  if (isBusy) {
    const liveHtml = preview.streamSnippet?.trim()
      ? snippetToPreviewHtml(preview.streamSnippet)
      : "<p><em>Editing artifact…</em></p>"
    return (
      <li key={preview.artifactId}>
        <SectionPreviewCard
          preview={preview}
          html={liveHtml}
          subtitle={phaseLabel(preview.phase)}
          onOpen={() => onOpenArtifact?.(preview.artifactId)}
          isLive
        />
      </li>
    )
  }

  // Create flows without a clear section — keep one card, but prefer a short snippet.
  if (preview.streamSnippet?.trim() && !preview.contentJson) {
    return (
      <li key={preview.artifactId}>
        <SectionPreviewCard
          preview={preview}
          html={snippetToPreviewHtml(preview.streamSnippet)}
          subtitle={phaseLabel(preview.phase)}
          onOpen={() => onOpenArtifact?.(preview.artifactId)}
          isLive={false}
        />
      </li>
    )
  }

  return (
    <li key={preview.artifactId}>
      <ArtifactCard
        artifact={artifactFromLivePreview(preview)}
        livePreview={preview}
        allowAttachToTask={allowAttachToTask}
        defaultTaskId={defaultTaskId}
        defaultChannelId={defaultChannelId}
        chatPreview
        className="rounded-xl"
      />
    </li>
  )
}

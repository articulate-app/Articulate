"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { AlertTriangle, X } from "lucide-react"
import { cn } from "../../app/lib/utils"
import type { ArtifactAssetData, ArtifactContentJson } from "../../app/lib/artifacts/artifact-types"
import {
  parseKeywordTokens,
  taskSeoQueryKey,
  type TaskSeoKeywords,
} from "../../app/lib/task-seo"
import { countKeywordOccurrences } from "../tasks/utils/keyword-density"
import {
  countUrlOccurrencesInRichText,
  extractUrlsFromComponentOutputSources,
  isMediaOrStorageUrl,
} from "../tasks/lib/link-summary-url-extraction"
import { extractArtifactOutline } from "./extract-artifact-outline"
import { ArtifactNavigationPanel, ArtifactSeoDetailsPanel } from "./artifact-seo-details"
import {
  artifactHtmlSource,
  artifactPlainText,
  artifactPlainTextWithHrefs,
  countWords,
  densityTone,
  formatCharCountLabel,
  formatWordCountLabel,
  keywordUtilizationPct,
} from "./artifact-content-stats"
import { removeArtifactUrl, replaceArtifactUrl } from "./replace-artifact-url"
import { ArtifactSeoPanel } from "./artifact-seo-panel"
import {
  SeoLinkSummaryList,
  type SeoLinkSummaryItem,
} from "../tasks/components/seo-link-summary-list"
import { TaskOverviewPreviewSection } from "../../app/components/tasks/task-overview-preview-section"

type LinkStatusResult =
  | { kind: "checking" }
  | { kind: "invalid" }
  | { kind: "timeout" }
  | { kind: "unreachable" }
  | { kind: "unknown" }
  | { kind: "http"; statusCode: number }

type ArtifactSeoDockProps = {
  artifactId: string
  artifactVersion: number
  artifactTitle?: string | null
  taskId: number | null | undefined
  projectId?: number | null
  channelId?: number | null
  contentText?: string | null
  contentJson?: ArtifactContentJson | null
  metadata?: Record<string, unknown> | null
  assetData?: ArtifactAssetData | null
  aiThreadId?: string | null
  readOnly?: boolean
  onContentChange?: (next: {
    contentText: string | null
    contentJson: ArtifactContentJson | null
  }) => void
  className?: string
  /**
   * `dock` — bottom status chips + pop-up panels (legacy).
   * `inline` — Navigation / Keywords / Links expanded at end of document content.
   */
  variant?: "dock" | "inline"
}

function normalizeKeywordKey(value: string): string {
  return value.trim().toLowerCase()
}

function normalizeUrl(rawUrl: string): { normalizedUrl: string; displayUrl: string; isValid: boolean } {
  const trimmed = String(rawUrl || "").trim()
  if (!trimmed) return { normalizedUrl: "", displayUrl: "", isValid: false }
  try {
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    const parsed = new URL(withProtocol)
    parsed.hash = ""
    const displayUrl = parsed.toString().replace(/\/$/, "")
    return { normalizedUrl: displayUrl.toLowerCase(), displayUrl, isValid: true }
  } catch {
    return { normalizedUrl: trimmed.toLowerCase(), displayUrl: trimmed, isValid: false }
  }
}

function isLinkIssue(status: LinkStatusResult): boolean {
  if (status.kind === "http") return status.statusCode >= 400
  return status.kind === "invalid" || status.kind === "timeout" || status.kind === "unreachable"
}

function scrollToHeading(text: string) {
  if (typeof document === "undefined") return
  const root = document.querySelector<HTMLElement>('[data-ai-selectable="artifact"]')
  if (!root) return
  const target = text.trim().toLowerCase()
  const headings = Array.from(root.querySelectorAll<HTMLElement>("h1, h2, h3, h4"))
  const exact = headings.find((el) => (el.textContent ?? "").trim().toLowerCase() === target)
  const fuzzy = exact
    ?? headings.find((el) => (el.textContent ?? "").trim().toLowerCase().includes(target))
  if (!fuzzy) return
  fuzzy.scrollIntoView({ behavior: "smooth", block: "center" })
  fuzzy.classList.add("ring-2", "ring-amber-300", "rounded-sm")
  window.setTimeout(() => {
    fuzzy.classList.remove("ring-2", "ring-amber-300", "rounded-sm")
  }, 1200)
}

function StatusChip({
  active,
  alert,
  children,
  onClick,
}: {
  active?: boolean
  alert?: boolean
  children: React.ReactNode
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] tabular-nums text-gray-600 hover:bg-gray-100 hover:text-gray-900",
        active && "bg-gray-100 text-gray-900",
        alert && "text-red-600 hover:bg-red-50 hover:text-red-700",
      )}
    >
      {children}
    </button>
  )
}

/**
 * Artifact SEO / outline UI.
 * - `dock`: Word-style status bar pinned at the bottom (legacy chips).
 * - `inline`: Navigation / Keywords / Links expanded after document content
 *   (same presence as task-details SEO sections).
 */
export function ArtifactSeoDock({
  artifactId,
  artifactVersion,
  artifactTitle = null,
  taskId,
  projectId = null,
  channelId = null,
  contentText = null,
  contentJson = null,
  metadata = null,
  assetData = null,
  aiThreadId = null,
  readOnly = false,
  onContentChange,
  className,
  variant = "dock",
}: ArtifactSeoDockProps) {
  const supabase = createClientComponentClient()
  const enabled = taskId != null && taskId > 0

  const [openPanel, setOpenPanel] = useState<"nav" | "keywords" | "links" | "meta" | "prompts" | "images" | null>(null)
  const [linkStatusByUrl, setLinkStatusByUrl] = useState<Record<string, LinkStatusResult>>({})
  const linkStatusCacheRef = useRef<Map<string, LinkStatusResult>>(new Map())

  const plain = useMemo(
    () => artifactPlainText({ contentText, contentJson }),
    [contentText, contentJson],
  )
  const plainWithHrefs = useMemo(
    () => artifactPlainTextWithHrefs({ contentText, contentJson }),
    [contentText, contentJson],
  )
  const htmlSource = useMemo(
    () => artifactHtmlSource({ contentText, contentJson }),
    [contentText, contentJson],
  )
  const wordCount = useMemo(() => countWords(plain), [plain])
  const charCount = plain.length
  const outline = useMemo(
    () => extractArtifactOutline({ contentJson, contentText }),
    [contentJson, contentText],
  )

  const seoQuery = useQuery({
    queryKey: taskSeoQueryKey(taskId),
    enabled,
    staleTime: 15_000,
    queryFn: async (): Promise<TaskSeoKeywords & { languageCode: string | null; languageName: string | null }> => {
      const { data, error } = await supabase
        .from("tasks")
        .select("keyword, secondary_keywords, updated_at, language_id, languages:language_id(code, long_name)")
        .eq("id", taskId!)
        .maybeSingle()
      if (error) throw error
      const primary = typeof data?.keyword === "string" ? data.keyword.trim() : ""
      const secondaryRaw = (data as any)?.secondary_keywords
      const language = Array.isArray((data as any)?.languages)
        ? (data as any).languages[0]
        : (data as any)?.languages
      return {
        primaryKeyword: primary,
        secondaryKeywords: parseKeywordTokens(secondaryRaw),
        updatedAt: typeof data?.updated_at === "string" ? data.updated_at : null,
        languageCode: typeof language?.code === "string" ? language.code : null,
        languageName:
          typeof language?.long_name === "string"
            ? language.long_name
            : typeof language?.name === "string"
              ? language.name
              : null,
      }
    },
  })

  const allKeywords = useMemo(() => {
    const primary = seoQuery.data?.primaryKeyword?.trim() ?? ""
    const secondary = seoQuery.data?.secondaryKeywords ?? []
    const seen = new Set<string>()
    const out: Array<{ keyword: string; isPrimary: boolean }> = []
    for (const value of primary ? [primary, ...secondary] : secondary) {
      const key = normalizeKeywordKey(value)
      if (!key || seen.has(key)) continue
      seen.add(key)
      out.push({ keyword: value, isPrimary: key === normalizeKeywordKey(primary) })
    }
    return out
  }, [seoQuery.data])

  const keywordHealth = useMemo(() => {
    return allKeywords.map((row) => {
      const uses = countKeywordOccurrences(plain, row.keyword)
      const pct = keywordUtilizationPct(uses, wordCount)
      return { ...row, uses, pct, tone: densityTone(pct) }
    })
  }, [allKeywords, plain, wordCount])

  const hasBadPrimary = keywordHealth.some((row) => row.isPrimary && row.tone !== "ok")
  const hasAnyBadKeyword = keywordHealth.some((row) => row.tone === "bad")

  const links = useMemo(() => {
    const extracted = extractUrlsFromComponentOutputSources({
      output: {
        content_text: contentText,
        content_json: contentJson,
        content: null,
        resolved_content_json: null,
      },
      blocks: [],
    })
    const seen = new Set<string>()
    const items: SeoLinkSummaryItem[] = []
    for (const entry of extracted) {
      if (isMediaOrStorageUrl(entry.url)) continue
      const normalized = normalizeUrl(entry.url)
      if (!normalized.normalizedUrl) continue
      if (seen.has(normalized.normalizedUrl)) continue
      seen.add(normalized.normalizedUrl)
      const anchor = (entry.anchorText ?? "").trim()
      const occurrences = Math.max(
        1,
        countUrlOccurrencesInRichText(htmlSource || contentText || "", entry.url),
      )
      items.push({
        url: entry.url,
        displayUrl: normalized.displayUrl,
        normalizedUrl: normalized.normalizedUrl,
        isValid: normalized.isValid,
        occurrences,
        anchorSamples: anchor ? [anchor] : [],
      })
    }
    return items
  }, [contentJson, contentText, htmlSource])

  useEffect(() => {
    if (links.length === 0) return
    setLinkStatusByUrl((prev) => {
      let changed = false
      const next = { ...prev }
      for (const item of links) {
        if (!item.isValid) {
          if (next[item.normalizedUrl]?.kind !== "invalid") {
            next[item.normalizedUrl] = { kind: "invalid" }
            changed = true
          }
          continue
        }
        const cached = linkStatusCacheRef.current.get(item.normalizedUrl)
        if (cached) {
          if (next[item.normalizedUrl] !== cached) {
            next[item.normalizedUrl] = cached
            changed = true
          }
        } else if (!next[item.normalizedUrl] || next[item.normalizedUrl].kind !== "checking") {
          next[item.normalizedUrl] = { kind: "checking" }
          changed = true
        }
      }
      return changed ? next : prev
    })

    const pending = links.filter(
      (item) => item.isValid && !linkStatusCacheRef.current.has(item.normalizedUrl),
    )
    if (pending.length === 0) return
    let cancelled = false
    void (async () => {
      const { data, error } = await supabase.functions.invoke("check-links", {
        body: { urls: pending.map((item) => item.normalizedUrl) },
      })
      if (cancelled) return
      const results = Array.isArray(data)
        ? data
        : Array.isArray((data as any)?.results)
          ? (data as any).results
          : []
      setLinkStatusByUrl((prev) => {
        const next = { ...prev }
        for (const item of pending) {
          const match = results.find((row: any) => {
            const a = normalizeUrl(String(row?.normalizedUrl ?? "")).normalizedUrl
            const b = normalizeUrl(String(row?.input ?? "")).normalizedUrl
            return a === item.normalizedUrl || b === item.normalizedUrl
          })
          let status: LinkStatusResult = { kind: "unknown" }
          if (error) status = { kind: "unknown" }
          else if (!match) status = { kind: "unknown" }
          else if (match.error === "invalid_url" || match.valid === false) status = { kind: "invalid" }
          else if (match.error === "timeout") status = { kind: "timeout" }
          else if (match.error === "request_failed") status = { kind: "unreachable" }
          else if (typeof match.status === "number") status = { kind: "http", statusCode: match.status }
          linkStatusCacheRef.current.set(item.normalizedUrl, status)
          next[item.normalizedUrl] = status
        }
        return next
      })
    })()
    return () => {
      cancelled = true
    }
  }, [links, supabase])

  const linkIssueCount = useMemo(() => {
    return links.reduce((count, item) => {
      const status = !item.isValid
        ? ({ kind: "invalid" } as const)
        : (linkStatusByUrl[item.normalizedUrl] ?? { kind: "checking" as const })
      return isLinkIssue(status) ? count + 1 : count
    }, 0)
  }, [links, linkStatusByUrl])

  const handleReplaceLink = useCallback(
    (fromUrl: string, toUrl: string) => {
      const nextUrl = toUrl.trim()
      if (!nextUrl || readOnly || !onContentChange) return
      const result = replaceArtifactUrl({
        fromUrl,
        toUrl: nextUrl,
        contentText,
        contentJson,
      })
      if (result.replaced <= 0) return
      onContentChange({
        contentText: result.contentText,
        contentJson: result.contentJson,
      })
      linkStatusCacheRef.current.delete(normalizeUrl(fromUrl).normalizedUrl)
    },
    [readOnly, onContentChange, contentText, contentJson],
  )

  const handleRemoveLink = useCallback(
    (url: string) => {
      if (readOnly || !onContentChange) return
      const result = removeArtifactUrl({
        url,
        contentText,
        contentJson,
      })
      if (result.removed <= 0) return
      onContentChange({
        contentText: result.contentText,
        contentJson: result.contentJson,
      })
      linkStatusCacheRef.current.delete(normalizeUrl(url).normalizedUrl)
    },
    [readOnly, onContentChange, contentText, contentJson],
  )

  const togglePanel = useCallback((panel: "nav" | "keywords" | "links" | "meta" | "prompts" | "images") => {
    setOpenPanel((prev) => (prev === panel ? null : panel))
  }, [])

  const detailArtifact = {
    id: artifactId,
    title: artifactTitle,
    content_text: contentText,
    content_json: contentJson,
    asset_data: assetData,
    metadata,
    current_version: artifactVersion,
    task_id: taskId ?? null,
    project_id: projectId ?? null,
    ai_thread_id: aiThreadId,
  }

  const navList = (
    <ArtifactNavigationPanel
      artifactId={artifactId}
      contentText={contentText}
      contentJson={contentJson}
    />
  )

  const keywordsPanel = (
    <ArtifactSeoPanel
      taskId={taskId}
      channelId={channelId}
      contentText={contentText}
      contentJson={contentJson}
      readOnly={readOnly}
      variant="artifact"
      className="pb-1"
    />
  )

  const linksPanel = (
    <SeoLinkSummaryList
      items={links}
      statusByUrl={linkStatusByUrl}
      plainText={plainWithHrefs}
      emptyMessage="No links in this artifact."
      readOnly={readOnly || !onContentChange}
      onReplaceLink={
        readOnly || !onContentChange
          ? undefined
          : ({ fromUrl, toUrl }) => {
              handleReplaceLink(fromUrl, toUrl)
            }
      }
      onRemoveLink={
        readOnly || !onContentChange
          ? undefined
          : ({ url }) => {
              handleRemoveLink(url)
            }
      }
    />
  )

  if (variant === "inline") {
    return (
      <div className={cn("px-4 pb-2", className)}>
        <TaskOverviewPreviewSection title="Navigation">
          {navList}
        </TaskOverviewPreviewSection>
        <TaskOverviewPreviewSection
          title="Keywords"
          headerActions={
            hasBadPrimary || hasAnyBadKeyword ? (
              <span className="inline-flex items-center gap-1 text-xs text-red-600">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                Needs attention
              </span>
            ) : null
          }
        >
          {keywordsPanel}
        </TaskOverviewPreviewSection>
        <TaskOverviewPreviewSection
          title="Links"
          headerActions={
            linkIssueCount > 0 ? (
              <span className="inline-flex items-center gap-1 text-xs text-red-600">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                {linkIssueCount} issue{linkIssueCount === 1 ? "" : "s"}
              </span>
            ) : null
          }
        >
          {linksPanel}
        </TaskOverviewPreviewSection>
        <TaskOverviewPreviewSection title="Meta info">
          <ArtifactSeoDetailsPanel artifact={detailArtifact} section="meta" readOnly={readOnly} />
        </TaskOverviewPreviewSection>
        <TaskOverviewPreviewSection title="Prompts">
          <ArtifactSeoDetailsPanel artifact={detailArtifact} section="prompts" readOnly={readOnly} />
        </TaskOverviewPreviewSection>
        <TaskOverviewPreviewSection title="Image info">
          <ArtifactSeoDetailsPanel artifact={detailArtifact} section="images" readOnly={readOnly} />
        </TaskOverviewPreviewSection>
      </div>
    )
  }

  return (
    <div
      className={cn(
        "relative z-20 shrink-0 border-t border-gray-200 bg-gray-50/90",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1">
        <span className="px-1.5 py-0.5 text-[11px] tabular-nums text-gray-600">
          {formatWordCountLabel(wordCount)}
        </span>
        <span className="px-1.5 py-0.5 text-[11px] tabular-nums text-gray-600">
          {formatCharCountLabel(charCount)}
        </span>

        <StatusChip active={openPanel === "nav"} onClick={() => togglePanel("nav")}>
          Navigation
          {outline.length > 0 ? <span className="text-gray-400">{outline.length}</span> : null}
        </StatusChip>

        <StatusChip
          active={openPanel === "keywords"}
          alert={hasBadPrimary || hasAnyBadKeyword}
          onClick={() => togglePanel("keywords")}
        >
          Keywords
          {keywordHealth.length > 0 ? (
            <span className="text-gray-400">{keywordHealth.length}</span>
          ) : null}
          {hasBadPrimary || hasAnyBadKeyword ? (
            <AlertTriangle className="h-3 w-3" aria-hidden />
          ) : null}
        </StatusChip>

        <StatusChip
          active={openPanel === "links"}
          alert={linkIssueCount > 0}
          onClick={() => togglePanel("links")}
        >
          Links
          {links.length > 0 ? <span className="text-gray-400">{links.length}</span> : null}
          {linkIssueCount > 0 ? (
            <span className="inline-flex items-center gap-0.5 text-red-600">
              <AlertTriangle className="h-3 w-3" />
              {linkIssueCount}
            </span>
          ) : null}
        </StatusChip>
        <StatusChip active={openPanel === "meta"} onClick={() => togglePanel("meta")}>Meta info</StatusChip>
        <StatusChip active={openPanel === "prompts"} onClick={() => togglePanel("prompts")}>Prompts</StatusChip>
        <StatusChip active={openPanel === "images"} onClick={() => togglePanel("images")}>Image info</StatusChip>
      </div>

      {openPanel ? (
        <div className="absolute inset-x-0 bottom-full z-30 flex max-h-[min(28rem,60vh)] flex-col border-t border-gray-200 bg-white shadow-[0_-8px_24px_rgba(15,23,42,0.08)]">
          <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
              {openPanel === "nav" ? "Navigation" : openPanel === "keywords" ? "Keywords" : openPanel === "links" ? "Links" : openPanel === "meta" ? "Meta info" : openPanel === "prompts" ? "Prompts" : "Image info"}
            </span>
            <button
              type="button"
              className="rounded p-1 text-gray-400 hover:bg-gray-50 hover:text-gray-700"
              aria-label="Close panel"
              onClick={() => setOpenPanel(null)}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-2">
            {openPanel === "nav" ? navList : null}
            {openPanel === "keywords" ? keywordsPanel : null}
            {openPanel === "links" ? linksPanel : null}
            {openPanel === "meta" ? <ArtifactSeoDetailsPanel artifact={detailArtifact} section="meta" readOnly={readOnly} /> : null}
            {openPanel === "prompts" ? <ArtifactSeoDetailsPanel artifact={detailArtifact} section="prompts" readOnly={readOnly} /> : null}
            {openPanel === "images" ? <ArtifactSeoDetailsPanel artifact={detailArtifact} section="images" readOnly={readOnly} /> : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

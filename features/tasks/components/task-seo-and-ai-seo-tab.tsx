"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { ChevronDown } from "lucide-react"
import { ArtifactSeoPanel } from "../../artifacts/artifact-seo-panel"
import { listTaskArtifacts } from "../../../app/lib/services/artifacts"
import {
  extractUrlsFromComponentOutputSources,
  isMediaOrStorageUrl,
} from "../lib/link-summary-url-extraction"

type TaskSeoAndAiSeoTabProps = {
  taskId: number
  readOnly?: boolean
  /** Compact embed for Overview (no page heading — parent section owns title). */
  embedded?: boolean
  className?: string
  /** Seed SEO keywords from task-details-bootstrap (skips extra tasks fetch). */
  seedSeo?: {
    primaryKeyword?: string | null
    secondaryKeywords?: string | string[] | null
    updatedAt?: string | null
    languageCode?: string | null
    languageName?: string | null
  } | null
}

type LinkStatusResult =
  | { kind: "checking" }
  | { kind: "invalid" }
  | { kind: "timeout" }
  | { kind: "unreachable" }
  | { kind: "unknown" }
  | { kind: "http"; statusCode: number }

type LinkSummaryItem = {
  normalizedUrl: string
  url: string
  displayUrl: string
  isValid: boolean
  occurrences: number
  anchorSamples: string[]
  components: Array<{ cardKey: string; title: string; count: number }>
}

type CheckLinksFunctionResult = {
  input?: string
  normalizedUrl?: string
  valid?: boolean
  status?: number
  error?: string
}

type LinkSourceRow = {
  cardKey: string
  title: string
  content_text: string | null | undefined
  content_json: unknown
}

function normalizeUrl(rawUrl: string): { normalizedUrl: string; displayUrl: string; isValid: boolean } {
  const trimmed = String(rawUrl || "").trim()
  if (!trimmed) return { normalizedUrl: "", displayUrl: "", isValid: false }
  try {
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    const parsed = new URL(withProtocol)
    parsed.hash = ""
    const displayUrl = parsed.toString().replace(/\/$/, "")
    return {
      normalizedUrl: displayUrl.toLowerCase(),
      displayUrl,
      isValid: true,
    }
  } catch {
    return { normalizedUrl: trimmed.toLowerCase(), displayUrl: trimmed, isValid: false }
  }
}

function getLinkStatusSortBucket(status: LinkStatusResult): number {
  if (status.kind === "invalid") return 1
  if (status.kind === "http") {
    if (status.statusCode >= 400) return 1
    if (status.statusCode >= 300) return 3
    if (status.statusCode >= 200) return 4
  }
  return 2
}

function getLinkStatusColor(status: LinkStatusResult): string {
  if (status.kind === "invalid") return "text-red-600"
  if (
    status.kind === "checking"
    || status.kind === "unknown"
    || status.kind === "timeout"
    || status.kind === "unreachable"
  ) {
    return "text-gray-500"
  }
  if (status.kind === "http") {
    if (status.statusCode >= 500) return "text-red-600"
    if (status.statusCode >= 400) return "text-orange-600"
    if (status.statusCode >= 300) return "text-amber-600"
    if (status.statusCode >= 200) return "text-green-600"
  }
  return "text-gray-500"
}

function mapCheckLinksResultToStatus(result: CheckLinksFunctionResult): LinkStatusResult {
  if (result.error === "invalid_url" || result.valid === false) return { kind: "invalid" }
  if (result.error === "timeout") return { kind: "timeout" }
  if (result.error === "request_failed") return { kind: "unreachable" }
  if (typeof result.status === "number") return { kind: "http", statusCode: result.status }
  return { kind: "unknown" }
}

function extractCheckLinksResults(data: unknown): CheckLinksFunctionResult[] {
  if (Array.isArray(data)) return data as CheckLinksFunctionResult[]
  if (!data || typeof data !== "object") return []
  const obj = data as Record<string, unknown>
  if (Array.isArray(obj.results)) return obj.results as CheckLinksFunctionResult[]
  if (Array.isArray(obj.items)) return obj.items as CheckLinksFunctionResult[]
  return []
}

function accumulateLinkSources(
  summary: Map<string, LinkSummaryItem>,
  sources: LinkSourceRow[],
) {
  for (const row of sources) {
    const extractedUrls = extractUrlsFromComponentOutputSources({
      output: {
        content_text: row.content_text,
        content_json: row.content_json,
      },
      blocks: [],
    })
    for (const extracted of extractedUrls) {
      if (isMediaOrStorageUrl(extracted.url)) continue
      const normalized = normalizeUrl(extracted.url)
      if (!normalized.normalizedUrl) continue
      const existing = summary.get(normalized.normalizedUrl)
      if (existing) {
        existing.occurrences += 1
        const existingComponent = existing.components.find((entry) => entry.cardKey === row.cardKey)
        if (existingComponent) existingComponent.count += 1
        else existing.components.push({ cardKey: row.cardKey, title: row.title, count: 1 })
        const cleanAnchor = (extracted.anchorText ?? "").trim()
        if (cleanAnchor && !existing.anchorSamples.includes(cleanAnchor) && existing.anchorSamples.length < 3) {
          existing.anchorSamples.push(cleanAnchor)
        }
        continue
      }
      summary.set(normalized.normalizedUrl, {
        normalizedUrl: normalized.normalizedUrl,
        url: normalized.displayUrl,
        displayUrl: normalized.displayUrl,
        isValid: normalized.isValid,
        occurrences: 1,
        anchorSamples: (extracted.anchorText ?? "").trim()
          ? [(extracted.anchorText ?? "").trim()]
          : [],
        components: [{ cardKey: row.cardKey, title: row.title, count: 1 }],
      })
    }
  }
}

/**
 * Task-level SEO + linkbuilding (no channel picker).
 * Keywords live on `tasks.keyword` / `tasks.secondary_keywords`.
 * Linkbuilding scans task artifacts only.
 */
export function TaskSeoAndAiSeoTab({
  taskId,
  readOnly = false,
  embedded = false,
  className,
  seedSeo = null,
}: TaskSeoAndAiSeoTabProps) {
  const supabase = useMemo(() => createClientComponentClient(), [])
  const [linkStatusByUrl, setLinkStatusByUrl] = useState<Record<string, LinkStatusResult>>({})
  const [expandedLinkUrls, setExpandedLinkUrls] = useState<Set<string>>(() => new Set())
  const linkStatusCacheRef = useRef<Map<string, LinkStatusResult>>(new Map())

  const artifactsQuery = useQuery({
    queryKey: ["task-artifacts", taskId, "seo-links"],
    enabled: taskId > 0,
    staleTime: 15_000,
    queryFn: async () => {
      const result = await listTaskArtifacts({ taskId, includeContent: true })
      return result.artifacts ?? []
    },
  })

  const linkSummaryItems = useMemo<LinkSummaryItem[]>(() => {
    const summary = new Map<string, LinkSummaryItem>()
    const artifactSources: LinkSourceRow[] = (artifactsQuery.data ?? []).map((artifact) => ({
      cardKey: `artifact:${artifact.id}`,
      title: String(artifact.title ?? "").trim() || "Artifact",
      content_text: artifact.content_text,
      content_json: artifact.content_json,
    }))
    accumulateLinkSources(summary, artifactSources)
    return Array.from(summary.values())
  }, [artifactsQuery.data])

  useEffect(() => {
    if (linkSummaryItems.length === 0) return

    setLinkStatusByUrl((prev) => {
      let hasChanges = false
      const next = { ...prev }
      for (const item of linkSummaryItems) {
        if (!item.isValid) {
          if (next[item.normalizedUrl]?.kind !== "invalid") {
            next[item.normalizedUrl] = { kind: "invalid" }
            hasChanges = true
          }
          continue
        }
        const cached = linkStatusCacheRef.current.get(item.normalizedUrl)
        if (cached) {
          if (next[item.normalizedUrl] !== cached) {
            next[item.normalizedUrl] = cached
            hasChanges = true
          }
        } else if (!next[item.normalizedUrl] || next[item.normalizedUrl].kind !== "checking") {
          next[item.normalizedUrl] = { kind: "checking" }
          hasChanges = true
        }
      }
      return hasChanges ? next : prev
    })

    const pendingChecks = linkSummaryItems.filter(
      (item) => item.isValid && !linkStatusCacheRef.current.has(item.normalizedUrl),
    )
    if (pendingChecks.length === 0) return

    let isCancelled = false
    const runCheck = async () => {
      const urls = pendingChecks.map((item) => item.normalizedUrl)
      const { data, error } = await supabase.functions.invoke("check-links", {
        body: { urls },
      })
      if (isCancelled) return
      if (error) {
        setLinkStatusByUrl((prev) => {
          const next = { ...prev }
          for (const item of pendingChecks) next[item.normalizedUrl] = { kind: "unknown" }
          return next
        })
        return
      }

      const functionResults = extractCheckLinksResults(data)
      const resultByNormalizedUrl = new Map<string, CheckLinksFunctionResult>()
      for (const result of functionResults) {
        if (typeof result?.normalizedUrl === "string" && result.normalizedUrl) {
          const normalizedFromResult = normalizeUrl(result.normalizedUrl).normalizedUrl
          if (normalizedFromResult) resultByNormalizedUrl.set(normalizedFromResult, result)
        }
        if (typeof result?.input === "string" && result.input) {
          const normalizedFromInput = normalizeUrl(result.input).normalizedUrl
          if (normalizedFromInput && !resultByNormalizedUrl.has(normalizedFromInput)) {
            resultByNormalizedUrl.set(normalizedFromInput, result)
          }
        }
      }

      setLinkStatusByUrl((prev) => {
        const next = { ...prev }
        for (const item of pendingChecks) {
          const result = resultByNormalizedUrl.get(item.normalizedUrl)
          const status = result ? mapCheckLinksResultToStatus(result) : { kind: "unknown" as const }
          linkStatusCacheRef.current.set(item.normalizedUrl, status)
          next[item.normalizedUrl] = status
        }
        return next
      })
    }

    void runCheck()
    return () => {
      isCancelled = true
    }
  }, [linkSummaryItems, supabase])

  const sortedLinkSummaryItems = useMemo(() => {
    return [...linkSummaryItems].sort((a, b) => {
      const statusA: LinkStatusResult = !a.isValid
        ? { kind: "invalid" }
        : (linkStatusByUrl[a.normalizedUrl] ?? { kind: "checking" })
      const statusB: LinkStatusResult = !b.isValid
        ? { kind: "invalid" }
        : (linkStatusByUrl[b.normalizedUrl] ?? { kind: "checking" })
      const bucketDiff = getLinkStatusSortBucket(statusA) - getLinkStatusSortBucket(statusB)
      if (bucketDiff !== 0) return bucketDiff
      return a.displayUrl.localeCompare(b.displayUrl)
    })
  }, [linkSummaryItems, linkStatusByUrl])

  const linkSummaryNon200Count = useMemo(() => {
    return sortedLinkSummaryItems.reduce((count, item) => {
      if (!item.isValid) return count + 1
      const status = linkStatusByUrl[item.normalizedUrl]
      if (!status) return count + 1
      if (status.kind !== "http") return count + 1
      return status.statusCode === 200 ? count : count + 1
    }, 0)
  }, [sortedLinkSummaryItems, linkStatusByUrl])

  const toggleExpanded = useCallback((normalizedUrl: string) => {
    setExpandedLinkUrls((prev) => {
      const next = new Set(prev)
      if (next.has(normalizedUrl)) next.delete(normalizedUrl)
      else next.add(normalizedUrl)
      return next
    })
  }, [])

  const isLinksLoading = artifactsQuery.isLoading

  return (
    <div className={embedded ? className : `space-y-4 p-4 ${className ?? ""}`}>
      {!embedded ? (
        <h3 className="text-base font-medium text-gray-900">SEO and AI SEO</h3>
      ) : null}

      <ArtifactSeoPanel
        taskId={taskId}
        readOnly={readOnly}
        seedSeo={seedSeo}
      />

      <div className={embedded ? "mt-3" : undefined}>
        <div className="flex w-full items-center justify-between gap-2 px-0 py-1 text-left">
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-sm font-normal text-gray-400">Linkbuilding summary</span>
            {linkSummaryNon200Count > 0 ? (
              <span className="inline-flex items-center rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                {linkSummaryNon200Count} issue{linkSummaryNon200Count === 1 ? "" : "s"}
              </span>
            ) : null}
          </div>
        </div>
        <div className="pt-1">
          {isLinksLoading ? (
            <p className="text-xs text-gray-500">Loading links…</p>
          ) : sortedLinkSummaryItems.length === 0 ? (
            <p className="text-xs text-gray-500">No links found in this task’s artifacts.</p>
          ) : (
            <div className="space-y-1.5">
              {sortedLinkSummaryItems.map((linkItem) => {
                const status: LinkStatusResult = !linkItem.isValid
                  ? { kind: "invalid" }
                  : (linkStatusByUrl[linkItem.normalizedUrl] ?? { kind: "checking" })
                const statusCodeText =
                  status.kind === "http"
                    ? String(status.statusCode)
                    : status.kind === "checking"
                      ? "..."
                      : status.kind === "invalid"
                        ? "Invalid"
                        : status.kind === "timeout"
                          ? "Timeout"
                          : status.kind === "unreachable"
                            ? "Unreachable"
                            : "Unknown"
                const isExpanded = expandedLinkUrls.has(linkItem.normalizedUrl)
                return (
                  <div
                    key={linkItem.normalizedUrl}
                    className="rounded-md border border-gray-200 bg-white px-2 py-1.5"
                  >
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-500 hover:bg-gray-100"
                        onClick={() => toggleExpanded(linkItem.normalizedUrl)}
                        title={isExpanded ? "Hide sources" : "Show sources"}
                        aria-label={isExpanded ? "Hide sources" : "Show sources"}
                      >
                        <ChevronDown
                          className={`h-3.5 w-3.5 transition-transform duration-150 ${
                            isExpanded ? "rotate-0" : "-rotate-90"
                          }`}
                        />
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-2">
                          <a
                            href={linkItem.isValid ? linkItem.url : undefined}
                            target={linkItem.isValid ? "_blank" : undefined}
                            rel={linkItem.isValid ? "noreferrer noopener" : undefined}
                            className={`truncate text-xs ${
                              linkItem.isValid
                                ? "text-blue-700 hover:text-blue-800 hover:underline"
                                : "text-gray-500"
                            }`}
                            title={linkItem.url}
                          >
                            {linkItem.displayUrl}
                          </a>
                          <span className={`text-xs font-medium ${getLinkStatusColor(status)}`}>
                            {statusCodeText}
                          </span>
                        </div>
                        {linkItem.anchorSamples.length > 0 ? (
                          <p className="mt-0.5 truncate text-[11px] text-gray-500">
                            {linkItem.anchorSamples.join(" · ")}
                          </p>
                        ) : null}
                      </div>
                      <span className="inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                        {linkItem.occurrences}
                      </span>
                    </div>
                    {isExpanded ? (
                      <ul className="mt-1.5 space-y-0.5 border-t border-gray-100 pt-1.5">
                        {linkItem.components.map((component) => (
                          <li
                            key={`${linkItem.normalizedUrl}-${component.cardKey}`}
                            className="truncate text-[11px] text-gray-600"
                          >
                            {component.title}
                            {component.count > 1 ? ` ×${component.count}` : ""}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

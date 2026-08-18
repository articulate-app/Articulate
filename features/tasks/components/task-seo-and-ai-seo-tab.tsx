"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { ArtifactSeoPanel } from "../../artifacts/artifact-seo-panel"
import { ArtifactSeoDetailsPanel, type ArtifactSeoDetailSection } from "../../artifacts/artifact-seo-details"
import { listTaskArtifacts, saveWorkspaceArtifact } from "../../../app/lib/services/artifacts"
import type { ArtifactContentJson } from "../../../app/lib/artifacts/artifact-types"
import {
  extractUrlsFromComponentOutputSources,
  isMediaOrStorageUrl,
} from "../lib/link-summary-url-extraction"
import {
  removeArtifactUrl,
  replaceArtifactUrl,
} from "../../artifacts/replace-artifact-url"
import {
  SeoLinkSummaryList,
  type SeoLinkStatusResult,
  type SeoLinkSummaryItem,
} from "./seo-link-summary-list"
import { cn } from "../../../app/lib/utils"

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

type SeoPane = "navigation" | "keywords" | "links" | "meta" | "prompts" | "images"

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
  artifactId: string
  currentVersion: number
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

function getLinkStatusSortBucket(status: SeoLinkStatusResult): number {
  if (status.kind === "invalid") return 1
  if (status.kind === "http") {
    if (status.statusCode >= 400) return 1
    if (status.statusCode >= 300) return 3
    if (status.statusCode >= 200) return 4
  }
  return 2
}

function mapCheckLinksResultToStatus(result: CheckLinksFunctionResult): SeoLinkStatusResult {
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
  summary: Map<string, SeoLinkSummaryItem & { artifactIds: string[] }>,
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
        existing.occurrences = (existing.occurrences ?? 0) + 1
        const existingSource = existing.sources?.find((entry) => entry.key === row.cardKey)
        if (existingSource) existingSource.count = (existingSource.count ?? 0) + 1
        else {
          existing.sources = [
            ...(existing.sources ?? []),
            { key: row.cardKey, title: row.title, count: 1 },
          ]
        }
        if (!existing.artifactIds.includes(row.artifactId)) {
          existing.artifactIds.push(row.artifactId)
        }
        const cleanAnchor = (extracted.anchorText ?? "").trim()
        if (
          cleanAnchor
          && !(existing.anchorSamples ?? []).includes(cleanAnchor)
          && (existing.anchorSamples?.length ?? 0) < 3
        ) {
          existing.anchorSamples = [...(existing.anchorSamples ?? []), cleanAnchor]
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
        sources: [{ key: row.cardKey, title: row.title, count: 1 }],
        artifactIds: [row.artifactId],
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
  const queryClient = useQueryClient()
  const [seoPane, setSeoPane] = useState<SeoPane>("keywords")
  const [linkStatusByUrl, setLinkStatusByUrl] = useState<Record<string, SeoLinkStatusResult>>({})
  const linkStatusCacheRef = useRef<Map<string, SeoLinkStatusResult>>(new Map())

  // Share the workspace content query — avoid a second full-content list fetch.
  const artifactsQuery = useQuery({
    queryKey: ["task-artifacts", taskId],
    enabled: taskId > 0,
    staleTime: 60_000,
    queryFn: () => listTaskArtifacts({ taskId, includeContent: true }),
  })
  const artifacts = artifactsQuery.data?.artifacts ?? []

  const linkSummaryItems = useMemo(() => {
    const summary = new Map<string, SeoLinkSummaryItem & { artifactIds: string[] }>()
    const artifactSources: LinkSourceRow[] = artifacts.map((artifact) => ({
      cardKey: `artifact:${artifact.id}`,
      title: String(artifact.title ?? "").trim() || "Artifact",
      artifactId: artifact.id,
      currentVersion: artifact.current_version ?? 0,
      content_text: artifact.content_text,
      content_json: artifact.content_json,
    }))
    accumulateLinkSources(summary, artifactSources)
    return Array.from(summary.values())
  }, [artifacts])

  /** Combined artifact plain text for keyword uses / density. */
  const artifactsContentText = useMemo(() => {
    const parts: string[] = []
    for (const artifact of artifacts) {
      const text = typeof artifact.content_text === "string" ? artifact.content_text.trim() : ""
      if (text) parts.push(text)
    }
    return parts.join("\n\n")
  }, [artifacts])

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
          resultByNormalizedUrl.set(result.normalizedUrl.toLowerCase(), result)
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
      const statusA: SeoLinkStatusResult = !a.isValid
        ? { kind: "invalid" }
        : (linkStatusByUrl[a.normalizedUrl] ?? { kind: "checking" })
      const statusB: SeoLinkStatusResult = !b.isValid
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

  const applyLinkMutationAcrossArtifacts = useCallback(
    async (args: { fromUrl: string; toUrl: string | null }) => {
      const fromNormalized = normalizeUrl(args.fromUrl).normalizedUrl
      const targets = artifacts.filter((artifact) => {
        const extracted = extractUrlsFromComponentOutputSources({
          output: {
            content_text: artifact.content_text,
            content_json: artifact.content_json,
          },
          blocks: [],
        })
        return extracted.some(
          (entry) => normalizeUrl(entry.url).normalizedUrl === fromNormalized,
        )
      })

      for (const artifact of targets) {
        const mutation = args.toUrl
          ? replaceArtifactUrl({
              fromUrl: args.fromUrl,
              toUrl: args.toUrl,
              contentText: artifact.content_text,
              contentJson: artifact.content_json,
            })
          : removeArtifactUrl({
              url: args.fromUrl,
              contentText: artifact.content_text,
              contentJson: artifact.content_json,
            })
        const changed =
          args.toUrl
            ? (mutation as ReturnType<typeof replaceArtifactUrl>).replaced > 0
            : (mutation as ReturnType<typeof removeArtifactUrl>).removed > 0
        if (!changed) continue

        await saveWorkspaceArtifact({
          artifactId: artifact.id,
          expectedVersion: artifact.current_version ?? 0,
          snapshot: {
            title: artifact.title,
            content_text: mutation.contentText,
            content_json: mutation.contentJson as ArtifactContentJson | null,
            asset_data: artifact.asset_data ?? null,
            metadata: artifact.metadata ?? null,
          },
          changeSource: "manual",
          changeSummary: args.toUrl ? "Replace link" : "Remove link",
        })
      }

      await queryClient.invalidateQueries({ queryKey: ["task-artifacts", taskId] })
      await queryClient.invalidateQueries({ queryKey: ["task-artifacts-meta", taskId] })
    },
    [artifacts, queryClient, taskId],
  )

  const isLinksLoading = artifactsQuery.isLoading

  const panePills = (
    <div className={cn("flex flex-wrap items-center gap-1.5", embedded ? "mb-3" : "mb-4")}>
      {(
        [
          { value: "navigation" as const, label: "Navigation" },
          { value: "keywords" as const, label: "Keywords" },
          { value: "links" as const, label: "Links" },
          { value: "meta" as const, label: "Meta info" },
          { value: "prompts" as const, label: "Prompts" },
          { value: "images" as const, label: "Image info" },
        ] as const
      ).map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => setSeoPane(option.value)}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-sm",
            seoPane === option.value
              ? "bg-gray-100 text-gray-900"
              : "border-0 text-gray-500 hover:text-gray-700",
          )}
        >
          {option.label}
          {option.value === "links" && linkSummaryNon200Count > 0 ? (
            <span className="inline-flex items-center rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
              {linkSummaryNon200Count}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  )

  return (
    <div className={embedded ? className : `space-y-4 p-4 ${className ?? ""}`}>
      {!embedded ? (
        <h3 className="text-base font-medium text-gray-900">SEO and AI SEO</h3>
      ) : null}

      {panePills}

      {seoPane === "keywords" ? (
        <ArtifactSeoPanel
          taskId={taskId}
          readOnly={readOnly}
          seedSeo={seedSeo}
          contentText={artifactsContentText}
        />
      ) : seoPane === "links" ? (
        <SeoLinkSummaryList
          items={sortedLinkSummaryItems}
          statusByUrl={linkStatusByUrl}
          isLoading={isLinksLoading}
          emptyMessage="No links found in this task’s artifacts."
          readOnly={readOnly}
          onReplaceLink={
            readOnly
              ? undefined
              : async ({ fromUrl, toUrl }) => {
                  await applyLinkMutationAcrossArtifacts({ fromUrl, toUrl })
                }
          }
          onRemoveLink={
            readOnly
              ? undefined
              : async ({ url }) => {
                  await applyLinkMutationAcrossArtifacts({ fromUrl: url, toUrl: null })
                }
          }
        />
      ) : artifactsQuery.isLoading ? (
        <div className="space-y-2">
          <div className="h-9 animate-pulse rounded bg-gray-100" />
          <div className="h-20 animate-pulse rounded bg-gray-50" />
        </div>
      ) : artifacts.length === 0 ? (
        <p className="text-sm text-gray-500">No artifacts in this task yet.</p>
      ) : (
        <div className="space-y-5">
          {artifacts.map((artifact) => (
            <ArtifactSeoDetailsPanel
              key={`${seoPane}:${artifact.id}`}
              artifact={artifact}
              section={seoPane as ArtifactSeoDetailSection}
              readOnly={readOnly}
              showArtifactTitle
            />
          ))}
        </div>
      )}
    </div>
  )
}

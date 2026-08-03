"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Loader2,
  MessageSquarePlus,
  Pencil,
  X,
} from "lucide-react"
import { Button } from "../../app/components/ui/button"
import { Input } from "../../app/components/ui/input"
import { AddDashedButton } from "../../app/components/ui/add-dashed-button"
import { KeywordDifficultyBadge } from "../../app/components/keyword-expanded-metrics"
import { regions } from "../../app/lib/geoLanguageMaps"
import { cn } from "../../app/lib/utils"
import { useCurrentUserStore } from "../../app/store/current-user"
import type {
  ArtifactContentJson,
  SelectedArtifactContext,
} from "../../app/lib/artifacts/artifact-types"
import {
  formatSecondaryKeywords,
  parseKeywordTokens,
  taskSeoQueryKey,
  type TaskSeoKeywords,
} from "../../app/lib/task-seo"
import type {
  CompetitorPageType,
  CompetitorStructureResponse,
} from "../../app/lib/types/seo-competitor-snapshot"
import {
  fetchCompetitorStructure,
  fetchTopResults as fetchTopResultsService,
} from "../../app/lib/services/seo-competitor-snapshot"
import { SeoKeywordResearchInline } from "../tasks/components/seo-keyword-research-inline"
import { KeywordMetricStat } from "../tasks/components/keyword-metric-stat"
import { useKeywordIdeasMetrics } from "../tasks/hooks/use-keyword-ideas-metrics"
import { useSeoCompetitorSnapshot } from "../tasks/hooks/use-seo-competitor-snapshot"
import { countKeywordOccurrences } from "../tasks/utils/keyword-density"
import {
  extractUrlsFromComponentOutputSources,
  isMediaOrStorageUrl,
} from "../tasks/lib/link-summary-url-extraction"
import { extractArtifactOutline } from "./extract-artifact-outline"
import {
  artifactPlainText,
  countWords,
  densityTone,
  densityToneClass,
  formatCharCountLabel,
  formatWordCountLabel,
  keywordUtilizationPct,
} from "./artifact-content-stats"
import { findArtifactLinkUsages, replaceArtifactUrl } from "./replace-artifact-url"
import { openArtifactSelectionInAiPane } from "./open-artifact-selection-in-ai-pane"
import { computeArtifactContentHash } from "./artifact-selection"

const SEO_REGION_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0, label: "All countries" },
  ...regions
    .map((region) => {
      const parsedId = Number(region.id)
      if (!Number.isFinite(parsedId)) return null
      if (region.name.trim().toLowerCase() === "any") return null
      return { value: parsedId, label: region.name }
    })
    .filter((region): region is { value: number; label: string } => region !== null),
]

type LinkStatusResult =
  | { kind: "checking" }
  | { kind: "invalid" }
  | { kind: "timeout" }
  | { kind: "unreachable" }
  | { kind: "unknown" }
  | { kind: "http"; statusCode: number }

type AdHocCompetitor = {
  key: string
  position: number
  title: string
  url: string
  displayLink: string
}

type ArtifactSeoDockProps = {
  artifactId: string
  artifactVersion: number
  artifactTitle?: string | null
  taskId: number | null | undefined
  projectId?: number | null
  channelId?: number | null
  contentText?: string | null
  contentJson?: ArtifactContentJson | null
  readOnly?: boolean
  onContentChange?: (next: {
    contentText: string | null
    contentJson: ArtifactContentJson | null
  }) => void
  className?: string
}

function normalizeKeywordKey(value: string): string {
  return value.trim().toLowerCase()
}

function formatMetricValue(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—"
  return value.toLocaleString()
}

function getDomainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}

function getFaviconUrl(url: string): string | null {
  try {
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(new URL(url).hostname)}&sz=32`
  } catch {
    return null
  }
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

function statusLabel(status: LinkStatusResult): string {
  if (status.kind === "http") return String(status.statusCode)
  if (status.kind === "checking") return "…"
  if (status.kind === "invalid") return "Invalid"
  if (status.kind === "timeout") return "Timeout"
  if (status.kind === "unreachable") return "Down"
  return "?"
}

function statusClass(status: LinkStatusResult): string {
  if (status.kind === "http") {
    if (status.statusCode >= 400) return "text-red-600"
    if (status.statusCode >= 300) return "text-amber-600"
    return "text-emerald-600"
  }
  if (status.kind === "checking") return "text-gray-400"
  return "text-red-600"
}

function isLinkIssue(status: LinkStatusResult): boolean {
  if (status.kind === "http") return status.statusCode >= 400
  return status.kind === "invalid" || status.kind === "timeout" || status.kind === "unreachable"
}

const PAGE_TYPE_BADGE: Record<CompetitorPageType, string> = {
  article: "text-blue-700",
  product: "text-violet-700",
  homepage: "text-emerald-700",
  category: "text-amber-700",
  landing: "text-sky-700",
  unknown: "text-gray-500",
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
 * Word-style status bar pinned at the bottom of the artifact pane
 * (below comments / “We'll notify”).
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
  readOnly = false,
  onContentChange,
  className,
}: ArtifactSeoDockProps) {
  const supabase = createClientComponentClient()
  const queryClient = useQueryClient()
  const enabled = taskId != null && taskId > 0
  const hasChannel = channelId != null && channelId > 0
  const currentPublicUserId = useCurrentUserStore((state) => state.publicUserId)

  const [openPanel, setOpenPanel] = useState<"nav" | "keywords" | "links" | null>(null)
  const [seoRegionId, setSeoRegionId] = useState(0)
  const [expandedKeyword, setExpandedKeyword] = useState<string | null>(null)
  const [expandedCompetitorKey, setExpandedCompetitorKey] = useState<string | null>(null)
  const [expandedLinkUrl, setExpandedLinkUrl] = useState<string | null>(null)
  const [replacingUrl, setReplacingUrl] = useState<string | null>(null)
  const [replaceDraft, setReplaceDraft] = useState("")
  const [editingKeyword, setEditingKeyword] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState("")
  const [newKeywordValue, setNewKeywordValue] = useState("")
  const [isKeywordSuggestionsOpen, setIsKeywordSuggestionsOpen] = useState(false)
  const [addKeywordMode, setAddKeywordMode] = useState<"type" | "research">("type")
  const addKeywordInputRef = useRef<HTMLInputElement | null>(null)

  const [adHocCompetitorsByKeyword, setAdHocCompetitorsByKeyword] = useState<
    Record<string, AdHocCompetitor[]>
  >({})
  const [adHocLoadingByKeyword, setAdHocLoadingByKeyword] = useState<Record<string, boolean>>({})
  const [adHocErrorByKeyword, setAdHocErrorByKeyword] = useState<Record<string, string | null>>({})
  const [structureByUrl, setStructureByUrl] = useState<
    Record<string, CompetitorStructureResponse | null>
  >({})
  const [structureLoadingByUrl, setStructureLoadingByUrl] = useState<Record<string, boolean>>({})
  const [structureErrorByUrl, setStructureErrorByUrl] = useState<Record<string, string | null>>({})
  const [linkStatusByUrl, setLinkStatusByUrl] = useState<Record<string, LinkStatusResult>>({})
  const linkStatusCacheRef = useRef<Map<string, LinkStatusResult>>(new Map())

  const plain = useMemo(
    () => artifactPlainText({ contentText, contentJson }),
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
      const secondaryRaw =
        typeof data?.secondary_keywords === "string" ? data.secondary_keywords : ""
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

  const keywordList = useMemo(() => allKeywords.map((row) => row.keyword), [allKeywords])
  const existingKeywordsSet = useMemo(
    () => new Set(keywordList.map((keyword) => normalizeKeywordKey(keyword))),
    [keywordList],
  )

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
    const items: Array<{ url: string; displayUrl: string; normalizedUrl: string; isValid: boolean }> = []
    for (const entry of extracted) {
      if (isMediaOrStorageUrl(entry.url)) continue
      const normalized = normalizeUrl(entry.url)
      if (!normalized.normalizedUrl || seen.has(normalized.normalizedUrl)) continue
      seen.add(normalized.normalizedUrl)
      items.push({
        url: entry.url,
        displayUrl: normalized.displayUrl,
        normalizedUrl: normalized.normalizedUrl,
        isValid: normalized.isValid,
      })
    }
    return items
  }, [contentJson, contentText])

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

  const inferredTaskLanguage = useMemo(
    () => seoQuery.data?.languageCode ?? seoQuery.data?.languageName ?? null,
    [seoQuery.data],
  )

  const {
    syncKeywordKeys,
    getKeywordMetric,
    fetchKeywordMetricsForKeyword,
  } = useKeywordIdeasMetrics({
    inferredTaskLanguage,
    regionId: seoRegionId > 0 ? seoRegionId : null,
    taskId: enabled ? taskId! : null,
    channelId: hasChannel ? channelId! : null,
    userId: currentPublicUserId,
  })

  useEffect(() => {
    syncKeywordKeys(keywordList)
  }, [keywordList, syncKeywordKeys])

  useEffect(() => {
    for (const keyword of keywordList) void fetchKeywordMetricsForKeyword(keyword)
  }, [keywordList, seoRegionId, fetchKeywordMetricsForKeyword])

  const competitorSnapshot = useSeoCompetitorSnapshot({
    taskId: enabled ? taskId : null,
    channelId: hasChannel ? channelId : null,
    taskLanguage: inferredTaskLanguage,
    keywords: keywordList,
    bootstrapKeywords: keywordList,
    selectedCountryByKeyword: Object.fromEntries(
      keywordList.map((keyword) => [keyword, seoRegionId > 0 ? seoRegionId : "all"]),
    ),
    autoLoadOnKeywordAdd: false,
  })

  const loadAdHocCompetitors = useCallback(
    async (keyword: string) => {
      const key = normalizeKeywordKey(keyword)
      setAdHocLoadingByKeyword((prev) => ({ ...prev, [key]: true }))
      setAdHocErrorByKeyword((prev) => ({ ...prev, [key]: null }))
      try {
        const response = await fetchTopResultsService({
          q: keyword,
          languageId: inferredTaskLanguage,
          regionId: seoRegionId > 0 ? seoRegionId : "all",
          num: 10,
        })
        if (response.error) throw new Error(response.error)
        setAdHocCompetitorsByKeyword((prev) => ({
          ...prev,
          [key]: (response.results ?? []).map((row, index) => ({
            key: `${key}:${row.link || index}`,
            position: row.position || index + 1,
            title: row.title || row.link,
            url: row.link,
            displayLink: row.displayLink || getDomainFromUrl(row.link),
          })),
        }))
      } catch (error) {
        setAdHocErrorByKeyword((prev) => ({
          ...prev,
          [key]: error instanceof Error ? error.message : "Failed to load top results",
        }))
      } finally {
        setAdHocLoadingByKeyword((prev) => ({ ...prev, [key]: false }))
      }
    },
    [inferredTaskLanguage, seoRegionId],
  )

  const loadStructureForUrl = useCallback(async (url: string) => {
    if (!url || structureByUrl[url] || structureLoadingByUrl[url]) return
    setStructureLoadingByUrl((prev) => ({ ...prev, [url]: true }))
    setStructureErrorByUrl((prev) => ({ ...prev, [url]: null }))
    try {
      const structure = await fetchCompetitorStructure({ url })
      setStructureByUrl((prev) => ({ ...prev, [url]: structure }))
    } catch (error) {
      setStructureErrorByUrl((prev) => ({
        ...prev,
        [url]: error instanceof Error ? error.message : "Failed to load structure",
      }))
    } finally {
      setStructureLoadingByUrl((prev) => ({ ...prev, [url]: false }))
    }
  }, [structureByUrl, structureLoadingByUrl])

  const handleExpandKeyword = useCallback(
    async (keyword: string) => {
      const next = expandedKeyword === keyword ? null : keyword
      setExpandedKeyword(next)
      setExpandedCompetitorKey(null)
      if (!next) return
      if (hasChannel) {
        const state = competitorSnapshot.getKeywordState(keyword)
        if (!state.hasLoadedCompetitors && !state.isLoadingCompetitors) {
          await competitorSnapshot.loadKeywordCompetitors(keyword)
        }
        return
      }
      const key = normalizeKeywordKey(keyword)
      if (!adHocCompetitorsByKeyword[key] && !adHocLoadingByKeyword[key]) {
        await loadAdHocCompetitors(keyword)
      }
    },
    [
      adHocCompetitorsByKeyword,
      adHocLoadingByKeyword,
      competitorSnapshot,
      expandedKeyword,
      hasChannel,
      loadAdHocCompetitors,
    ],
  )

  const updateKeywords = useMutation({
    mutationFn: async (args: { primaryKeyword: string; secondaryKeywords: string[] }) => {
      const { error } = await supabase
        .from("tasks")
        .update({
          keyword: args.primaryKeyword.trim() || null,
          secondary_keywords: formatSecondaryKeywords(args.secondaryKeywords) || null,
        })
        .eq("id", taskId!)
      if (error) throw error
      return args
    },
    onSuccess: (args) => {
      queryClient.setQueryData(
        taskSeoQueryKey(taskId),
        (prev: (TaskSeoKeywords & { languageCode: string | null; languageName: string | null }) | undefined) => ({
          primaryKeyword: args.primaryKeyword,
          secondaryKeywords: args.secondaryKeywords,
          updatedAt: new Date().toISOString(),
          languageCode: prev?.languageCode ?? null,
          languageName: prev?.languageName ?? null,
        }),
      )
    },
  })

  const persistKeywords = useCallback(
    async (primaryKeyword: string, secondaryKeywords: string[]) => {
      if (!enabled || readOnly) return
      const nextPrimary = primaryKeyword.trim()
      const nextSecondary = secondaryKeywords
        .map((token) => token.trim())
        .filter(Boolean)
        .filter((token) => normalizeKeywordKey(token) !== normalizeKeywordKey(nextPrimary))
      await updateKeywords.mutateAsync({
        primaryKeyword: nextPrimary,
        secondaryKeywords: nextSecondary,
      })
    },
    [enabled, readOnly, updateKeywords],
  )

  const handleAddKeyword = useCallback(
    async (keywordInput?: string) => {
      const tokens = parseKeywordTokens(keywordInput ?? newKeywordValue)
      if (tokens.length === 0 || !enabled || readOnly) return
      const currentPrimary = (seoQuery.data?.primaryKeyword || "").trim()
      const currentSecondary = [...(seoQuery.data?.secondaryKeywords ?? [])]
      const merged = [...currentSecondary]
      for (const token of tokens) {
        if (existingKeywordsSet.has(normalizeKeywordKey(token))) continue
        merged.push(token)
      }
      const nextPrimary = currentPrimary || tokens[0] || ""
      const nextSecondary = nextPrimary
        ? merged.filter((k) => normalizeKeywordKey(k) !== normalizeKeywordKey(nextPrimary))
        : merged
      setNewKeywordValue("")
      setIsKeywordSuggestionsOpen(false)
      setAddKeywordMode("type")
      await persistKeywords(nextPrimary, nextSecondary)
    },
    [enabled, readOnly, newKeywordValue, seoQuery.data, existingKeywordsSet, persistKeywords],
  )

  const handleRemoveKeyword = useCallback(
    (keyword: string) => {
      const key = normalizeKeywordKey(keyword)
      const currentPrimary = seoQuery.data?.primaryKeyword ?? ""
      const currentSecondary = seoQuery.data?.secondaryKeywords ?? []
      if (normalizeKeywordKey(currentPrimary) === key) {
        const [nextPrimary = "", ...rest] = currentSecondary
        void persistKeywords(nextPrimary, rest)
        return
      }
      void persistKeywords(
        currentPrimary,
        currentSecondary.filter((item) => normalizeKeywordKey(item) !== key),
      )
    },
    [seoQuery.data, persistKeywords],
  )

  const commitKeywordEdit = useCallback(
    (oldKeyword: string, nextValue: string) => {
      setEditingKeyword(null)
      const next = nextValue.trim()
      if (!next || normalizeKeywordKey(next) === normalizeKeywordKey(oldKeyword)) return
      if (existingKeywordsSet.has(normalizeKeywordKey(next))) return
      const currentPrimary = seoQuery.data?.primaryKeyword ?? ""
      const currentSecondary = seoQuery.data?.secondaryKeywords ?? []
      if (normalizeKeywordKey(currentPrimary) === normalizeKeywordKey(oldKeyword)) {
        void persistKeywords(next, currentSecondary)
        return
      }
      void persistKeywords(
        currentPrimary,
        currentSecondary.map((item) =>
          normalizeKeywordKey(item) === normalizeKeywordKey(oldKeyword) ? next : item,
        ),
      )
    },
    [existingKeywordsSet, seoQuery.data, persistKeywords],
  )

  const handleReplaceLink = useCallback(
    (fromUrl: string) => {
      const toUrl = replaceDraft.trim()
      if (!toUrl || readOnly || !onContentChange) return
      const result = replaceArtifactUrl({
        fromUrl,
        toUrl,
        contentText,
        contentJson,
      })
      if (result.replaced <= 0) return
      onContentChange({
        contentText: result.contentText,
        contentJson: result.contentJson,
      })
      setReplacingUrl(null)
      setReplaceDraft("")
      linkStatusCacheRef.current.delete(normalizeUrl(fromUrl).normalizedUrl)
    },
    [replaceDraft, readOnly, onContentChange, contentText, contentJson],
  )

  const askAboutStructure = useCallback(
    (args: { heading: string; sourceUrl: string; sourceTitle: string; pageType?: string | null }) => {
      const selectedText = [
        args.heading,
        "",
        `Source: ${args.sourceTitle}`,
        args.sourceUrl,
        args.pageType ? `Type: ${args.pageType}` : null,
      ]
        .filter(Boolean)
        .join("\n")
      const context: SelectedArtifactContext = {
        source_type: "task_artifact",
        artifact_id: artifactId,
        artifact_version_number: artifactVersion,
        anchor_type: "text_range",
        selected_text: selectedText,
        selection_before: "Competitor structure · ",
        selection_after: "",
        full_content_hash: computeArtifactContentHash(plain),
        title: artifactTitle,
      }
      void openArtifactSelectionInAiPane({
        context,
        taskId: taskId ?? null,
        projectId,
        channelId: channelId ?? null,
      })
    },
    [artifactId, artifactVersion, artifactTitle, plain, taskId, projectId, channelId],
  )

  const selectedCountryLabel =
    SEO_REGION_OPTIONS.find((option) => option.value === seoRegionId)?.label ?? "All countries"

  const renderStructureRows = (
    structure: CompetitorStructureResponse | null | undefined,
    meta: { sourceUrl: string; sourceTitle: string },
    isLoading: boolean,
    error: string | null,
  ) => {
    if (isLoading) {
      return (
        <div className="flex items-center gap-2 py-1 text-[11px] text-gray-500">
          <Loader2 className="h-3 w-3 animate-spin" />
          Analyzing structure…
        </div>
      )
    }
    if (error) return <p className="py-1 text-[11px] text-red-600">{error}</p>
    if (!structure) return <p className="py-1 text-[11px] text-gray-500">No structure yet.</p>
    if (structure.error) {
      return <p className="py-1 text-[11px] text-amber-600">{structure.error}</p>
    }
    const rows = (structure.flatHeadings ?? []).filter((row) => row.text?.trim())
    if (rows.length === 0) {
      return <p className="py-1 text-[11px] text-gray-500">No heading structure available.</p>
    }
    return (
      <ul className="space-y-0.5">
        {rows.map((row, index) => (
          <li
            key={`${row.tag}-${index}`}
            className={cn(
              "group flex items-start gap-1.5 py-0.5",
              row.level === 2 && "pl-3",
              row.level === 3 && "pl-6",
            )}
          >
            <span className="mt-0.5 w-5 shrink-0 text-[10px] text-gray-400">H{row.level}</span>
            <span className="min-w-0 flex-1 truncate text-xs text-gray-800">{row.text}</span>
            <button
              type="button"
              className="rounded p-0.5 text-gray-300 opacity-0 hover:text-gray-700 group-hover:opacity-100"
              title="Add to chat"
              aria-label="Add structure point to chat"
              onClick={() =>
                askAboutStructure({
                  heading: row.text,
                  sourceUrl: meta.sourceUrl,
                  sourceTitle: meta.sourceTitle,
                  pageType: structure.pageType,
                })
              }
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
    )
  }

  const renderCompetitors = (keyword: string) => {
    if (hasChannel) {
      const state = competitorSnapshot.getKeywordState(keyword)
      if (state.isLoadingCompetitors) {
        return (
          <div className="flex items-center gap-2 py-1 text-[11px] text-gray-500">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading…
          </div>
        )
      }
      if (state.competitorsError) {
        return <p className="text-[11px] text-red-600">{state.competitorsError}</p>
      }
      if (state.competitors.length === 0) {
        return <p className="text-[11px] text-gray-500">No top results.</p>
      }
      return (
        <ul className="space-y-0.5">
          {state.competitors.map((competitor, index) => {
            const key = `snap:${competitor.id}`
            const open = expandedCompetitorKey === key
            return (
              <li key={competitor.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded px-1 py-1 text-left hover:bg-gray-50"
                  onClick={() => {
                    setExpandedCompetitorKey(open ? null : key)
                    if (!open) void competitorSnapshot.loadCompetitorStructure(keyword, competitor.id)
                  }}
                >
                  <ChevronRight className={cn("h-3.5 w-3.5 text-gray-400", open && "rotate-90")} />
                  <span className="w-3 text-[10px] text-gray-400">{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-xs">{competitor.title}</span>
                  {competitor.structure?.pageType ? (
                    <span className={cn("text-[10px] uppercase", PAGE_TYPE_BADGE[competitor.structure.pageType])}>
                      {competitor.structure.pageType}
                    </span>
                  ) : null}
                </button>
                {open ? (
                  <div className="ml-6 border-l border-gray-100 pl-2 pb-1">
                    {renderStructureRows(
                      competitor.structure
                        ? {
                            url: competitor.url,
                            title: competitor.structure.pageTitle,
                            headings: {
                              h1: competitor.structure.h1,
                              h2: competitor.structure.h2,
                              h3: competitor.structure.h3,
                            },
                            flatHeadings: competitor.structure.flatHeadings,
                            available: true,
                            pageType: competitor.structure.pageType ?? "unknown",
                            source: "fallback",
                            cached: true,
                            error: competitor.structure.error ?? null,
                          }
                        : null,
                      { sourceUrl: competitor.url, sourceTitle: competitor.title },
                      !!state.loadingStructureByCompetitorId[competitor.id],
                      state.structureErrorByCompetitorId[competitor.id] ?? null,
                    )}
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      )
    }

    const key = normalizeKeywordKey(keyword)
    if (adHocLoadingByKeyword[key]) {
      return (
        <div className="flex items-center gap-2 py-1 text-[11px] text-gray-500">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading…
        </div>
      )
    }
    if (adHocErrorByKeyword[key]) {
      return <p className="text-[11px] text-red-600">{adHocErrorByKeyword[key]}</p>
    }
    const competitors = adHocCompetitorsByKeyword[key] ?? []
    if (competitors.length === 0) return <p className="text-[11px] text-gray-500">No top results.</p>
    return (
      <ul className="space-y-0.5">
        {competitors.map((competitor) => {
          const open = expandedCompetitorKey === competitor.key
          const pageType = structureByUrl[competitor.url]?.pageType
          return (
            <li key={competitor.key}>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded px-1 py-1 text-left hover:bg-gray-50"
                onClick={() => {
                  setExpandedCompetitorKey(open ? null : competitor.key)
                  if (!open) void loadStructureForUrl(competitor.url)
                }}
              >
                <ChevronRight className={cn("h-3.5 w-3.5 text-gray-400", open && "rotate-90")} />
                <span className="w-3 text-[10px] text-gray-400">{competitor.position}</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {getFaviconUrl(competitor.url) ? (
                  <img src={getFaviconUrl(competitor.url)!} alt="" className="h-3.5 w-3.5" />
                ) : null}
                <span className="min-w-0 flex-1 truncate text-xs">{competitor.title}</span>
                {pageType ? (
                  <span className={cn("text-[10px] uppercase", PAGE_TYPE_BADGE[pageType])}>
                    {pageType}
                  </span>
                ) : null}
              </button>
              {open ? (
                <div className="ml-6 border-l border-gray-100 pl-2 pb-1">
                  {renderStructureRows(
                    structureByUrl[competitor.url],
                    { sourceUrl: competitor.url, sourceTitle: competitor.title },
                    !!structureLoadingByUrl[competitor.url],
                    structureErrorByUrl[competitor.url] ?? null,
                  )}
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
    )
  }

  const togglePanel = useCallback((panel: "nav" | "keywords" | "links") => {
    setOpenPanel((prev) => (prev === panel ? null : panel))
  }, [])

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
      </div>

      {openPanel ? (
        <div className="absolute inset-x-0 bottom-full z-30 flex max-h-[min(16rem,45vh)] flex-col border-t border-gray-200 bg-white shadow-[0_-8px_24px_rgba(15,23,42,0.08)]">
          <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
              {openPanel === "nav" ? "Navigation" : openPanel === "keywords" ? "Keywords" : "Links"}
            </span>
            <div className="flex items-center gap-2">
              {openPanel === "keywords" ? (
                <label className="inline-flex items-center gap-1 text-[11px] text-gray-500">
                  <span className="sr-only">Country</span>
                  <select
                    value={seoRegionId}
                    onChange={(event) => setSeoRegionId(Number(event.target.value) || 0)}
                    className="h-7 max-w-[10rem] truncate rounded border-0 bg-gray-50 px-1.5 text-[11px] text-gray-700 outline-none hover:bg-gray-100"
                    title={selectedCountryLabel}
                  >
                    {SEO_REGION_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <button
                type="button"
                className="rounded p-1 text-gray-400 hover:bg-gray-50 hover:text-gray-700"
                aria-label="Close panel"
                onClick={() => setOpenPanel(null)}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-2">
            {openPanel === "nav" ? (
              outline.length === 0 ? (
                <p className="px-1 py-2 text-[11px] text-gray-500">No headings yet.</p>
              ) : (
                <ul className="space-y-0.5">
                  {outline.map((row) => (
                    <li key={row.id}>
                      <button
                        type="button"
                        className={cn(
                          "flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs hover:bg-gray-50",
                          row.level === 2 && "pl-4",
                          row.level === 3 && "pl-7",
                          row.level >= 4 && "pl-9",
                        )}
                        onClick={() => scrollToHeading(row.text)}
                      >
                        <span className="w-5 shrink-0 text-[10px] text-gray-400">H{row.level}</span>
                        <span className="truncate text-gray-800">{row.text}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )
            ) : null}

            {openPanel === "keywords" ? (
              <div>
                {!enabled ? (
                  <p className="px-1 py-2 text-[11px] text-gray-500">
                    Link this artifact to a task to edit shared keywords.
                  </p>
                ) : keywordHealth.length === 0 ? (
                  <p className="px-1 py-2 text-[11px] text-gray-500">No keywords yet.</p>
                ) : (
                  <ul>
                    {keywordHealth.map((row) => {
                      const metric = getKeywordMetric(row.keyword)
                      const open = expandedKeyword === row.keyword
                      const toneClass = densityToneClass(row.tone)
                      const isEditing = editingKeyword === row.keyword
                      return (
                        <li key={row.keyword} className="border-b border-gray-50 last:border-0">
                          <div className="flex items-center gap-1.5 py-1.5">
                            <button
                              type="button"
                              className="inline-flex h-6 w-6 shrink-0 items-center justify-center text-gray-400 hover:text-gray-700"
                              onClick={() => void handleExpandKeyword(row.keyword)}
                              aria-label="Top results"
                            >
                              <ChevronRight className={cn("h-3.5 w-3.5", open && "rotate-90")} />
                            </button>
                            <div className="min-w-0 flex-1">
                              {isEditing ? (
                                <Input
                                  value={editingValue}
                                  autoFocus
                                  className="h-7 text-sm"
                                  onChange={(event) => setEditingValue(event.target.value)}
                                  onBlur={() => commitKeywordEdit(row.keyword, editingValue)}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                      event.preventDefault()
                                      commitKeywordEdit(row.keyword, editingValue)
                                    }
                                    if (event.key === "Escape") setEditingKeyword(null)
                                  }}
                                />
                              ) : (
                                <button
                                  type="button"
                                  className="block w-full truncate text-left text-sm text-gray-900"
                                  onDoubleClick={() => {
                                    if (readOnly) return
                                    setEditingKeyword(row.keyword)
                                    setEditingValue(row.keyword)
                                  }}
                                  onClick={() => void handleExpandKeyword(row.keyword)}
                                >
                                  {row.keyword}
                                  {row.isPrimary ? (
                                    <span className="ml-1 text-[10px] uppercase text-gray-400">
                                      primary
                                    </span>
                                  ) : null}
                                </button>
                              )}
                            </div>
                            <span
                              className={cn("w-8 shrink-0 text-right text-[11px] tabular-nums", toneClass)}
                              title="Uses"
                            >
                              {row.uses}
                            </span>
                            <span
                              className={cn("w-10 shrink-0 text-right text-[11px] tabular-nums", toneClass)}
                              title="% of words"
                            >
                              {row.pct.toFixed(1)}%
                            </span>
                            <span className="w-12 shrink-0 text-right text-[11px] tabular-nums text-gray-500">
                              <KeywordMetricStat metric="volume" hideLabel>
                                {metric?.isLoading ? "…" : formatMetricValue(metric?.volume)}
                              </KeywordMetricStat>
                            </span>
                            <span className="shrink-0">
                              {typeof metric?.competition === "number" ? (
                                <KeywordDifficultyBadge competitionIndex={metric.competition} />
                              ) : (
                                <span className="text-[11px] text-gray-400">—</span>
                              )}
                            </span>
                            {!readOnly ? (
                              <button
                                type="button"
                                className="rounded p-0.5 text-gray-300 hover:text-red-500"
                                onClick={() => handleRemoveKeyword(row.keyword)}
                                aria-label="Remove keyword"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            ) : null}
                          </div>
                          {open ? (
                            <div className="mb-2 ml-6 border-l border-gray-100 pl-2">
                              {renderCompetitors(row.keyword)}
                            </div>
                          ) : null}
                        </li>
                      )
                    })}
                  </ul>
                )}

                {enabled && !readOnly ? (
                  <div className="mt-2">
                    {!isKeywordSuggestionsOpen ? (
                      <AddDashedButton
                        label="Add keyword"
                        className="mt-0"
                        onClick={() => {
                          setIsKeywordSuggestionsOpen(true)
                          setAddKeywordMode("type")
                          requestAnimationFrame(() => addKeywordInputRef.current?.focus())
                        }}
                      />
                    ) : addKeywordMode === "type" ? (
                      <div className="space-y-2 rounded border border-gray-100 p-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium">Add keyword</span>
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs"
                              onClick={() => setAddKeywordMode("research")}
                            >
                              Research
                            </Button>
                            <button
                              type="button"
                              className="rounded p-1 text-gray-400 hover:text-gray-700"
                              onClick={() => {
                                setIsKeywordSuggestionsOpen(false)
                                setNewKeywordValue("")
                              }}
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Input
                            ref={addKeywordInputRef}
                            value={newKeywordValue}
                            onChange={(event) => setNewKeywordValue(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault()
                                void handleAddKeyword()
                              }
                            }}
                            className="h-8 text-sm"
                            placeholder="Keyword"
                          />
                          <Button
                            type="button"
                            size="sm"
                            className="h-8"
                            onClick={() => void handleAddKeyword()}
                          >
                            Add
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded border border-gray-100 p-2">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-xs font-medium">Research</span>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs"
                            onClick={() => setAddKeywordMode("type")}
                          >
                            Type instead
                          </Button>
                        </div>
                        <SeoKeywordResearchInline
                          initialRegionId={seoRegionId > 0 ? String(seoRegionId) : ""}
                          existingKeywords={existingKeywordsSet}
                          onSelectKeyword={async (keyword) => {
                            await handleAddKeyword(keyword)
                            setIsKeywordSuggestionsOpen(false)
                          }}
                          autoFocus
                        />
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}

            {openPanel === "links" ? (
              links.length === 0 ? (
                <p className="px-1 py-2 text-[11px] text-gray-500">No links in this artifact.</p>
              ) : (
                <ul className="space-y-1">
                  {links.map((link) => {
                    const status: LinkStatusResult = !link.isValid
                      ? { kind: "invalid" }
                      : (linkStatusByUrl[link.normalizedUrl] ?? { kind: "checking" })
                    const open = expandedLinkUrl === link.normalizedUrl
                    const usages = open
                      ? findArtifactLinkUsages({
                          url: link.displayUrl,
                          contentText,
                          contentJson,
                        })
                      : []
                    const isReplacing = replacingUrl === link.normalizedUrl
                    return (
                      <li key={link.normalizedUrl} className="rounded border border-gray-100 px-1.5 py-1">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            className="inline-flex h-6 w-6 shrink-0 items-center justify-center text-gray-400 hover:text-gray-700"
                            onClick={() =>
                              setExpandedLinkUrl((prev) =>
                                prev === link.normalizedUrl ? null : link.normalizedUrl,
                              )
                            }
                          >
                            <ChevronDown className={cn("h-3.5 w-3.5", !open && "-rotate-90")} />
                          </button>
                          <a
                            href={link.isValid ? link.url : undefined}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="min-w-0 flex-1 truncate text-xs text-blue-700 hover:underline"
                          >
                            {link.displayUrl}
                          </a>
                          <span
                            className={cn(
                              "shrink-0 text-[11px] font-medium tabular-nums",
                              statusClass(status),
                            )}
                          >
                            {statusLabel(status)}
                          </span>
                          {!readOnly && onContentChange ? (
                            <button
                              type="button"
                              className="rounded p-1 text-gray-400 hover:text-gray-700"
                              title="Replace link"
                              onClick={() => {
                                setReplacingUrl(link.normalizedUrl)
                                setReplaceDraft(link.displayUrl)
                                setExpandedLinkUrl(link.normalizedUrl)
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                        </div>
                        {open ? (
                          <div className="mt-1 space-y-1 border-t border-gray-50 pt-1">
                            {isReplacing ? (
                              <div className="flex items-center gap-1.5">
                                <Input
                                  value={replaceDraft}
                                  onChange={(event) => setReplaceDraft(event.target.value)}
                                  className="h-7 text-xs"
                                  placeholder="https://"
                                />
                                <Button
                                  type="button"
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  onClick={() => handleReplaceLink(link.displayUrl)}
                                >
                                  Save
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-2 text-xs"
                                  onClick={() => {
                                    setReplacingUrl(null)
                                    setReplaceDraft("")
                                  }}
                                >
                                  Cancel
                                </Button>
                              </div>
                            ) : null}
                            {usages.length === 0 ? (
                              <p className="px-1 text-[11px] text-gray-500">
                                No in-document snippets found.
                              </p>
                            ) : (
                              usages.map((usage) => (
                                <p key={usage.id} className="px-1 text-[11px] text-gray-600">
                                  {usage.excerpt}
                                </p>
                              ))
                            )}
                          </div>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              )
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

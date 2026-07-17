"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import {
  fetchCompetitorStructure,
  fetchTaskChannelSeoSnapshot,
  fetchTopResults,
  prefetchCompetitorStructures,
  saveCompetitorStructure,
  saveKeywordCompetitors,
} from "../../../app/lib/services/seo-competitor-snapshot"
import type {
  CompetitorStructureResponse,
  PrefetchJobState,
  PrefetchJobStatus,
  SeoSnapshot,
  SeoSnapshotCompetitor,
  SeoSnapshotStructure,
  TopResultsRequestParams,
} from "../../../app/lib/types/seo-competitor-snapshot"

export interface KeywordCompetitorSnapshotState {
  keyword: string
  isExpanded: boolean
  isLoadingCompetitors: boolean
  hasLoadedCompetitors: boolean
  competitors: SeoSnapshotCompetitor[]
  selectedCompetitorId: number | null
  competitorsError: string | null
  isPrefetchingStructures: boolean
  hasPrefetchStarted: boolean
  hasPrefetchCompleted: boolean
  prefetchError: string | null
  prefetchedBatchKey: string | null
  lastPrefetchedAt: string | null
  prefetchJob: PrefetchJobState | null
  lastStructureUpdateAt: number | null
  fallbackTriedByCompetitorId: Record<number, boolean>
  loadingStructureByCompetitorId: Record<number, boolean>
  structureErrorByCompetitorId: Record<number, string | null>
}

interface UseSeoCompetitorSnapshotArgs {
  taskId: number | null | undefined
  channelId: number | null | undefined
  taskLanguage?: string | null
  keywords: string[]
  /** Source-of-truth persisted SEO keywords from task-channel-bootstrap.seo */
  bootstrapKeywords?: string[]
  selectedCountryByKeyword?: Record<string, string | number | null | undefined>
  autoLoadOnKeywordAdd?: boolean
}

type KeywordStateMap = Record<string, KeywordCompetitorSnapshotState>

function createDefaultKeywordState(keyword: string): KeywordCompetitorSnapshotState {
  return {
    keyword,
    isExpanded: false,
    isLoadingCompetitors: false,
    hasLoadedCompetitors: false,
    competitors: [],
    selectedCompetitorId: null,
    competitorsError: null,
    isPrefetchingStructures: false,
    hasPrefetchStarted: false,
    hasPrefetchCompleted: false,
    prefetchError: null,
    prefetchedBatchKey: null,
    lastPrefetchedAt: null,
    prefetchJob: null,
    lastStructureUpdateAt: null,
    fallbackTriedByCompetitorId: {},
    loadingStructureByCompetitorId: {},
    structureErrorByCompetitorId: {},
  }
}

function getBestErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message
  return fallback
}

function sanitizePlainString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value)
  }
  if (value != null && typeof value === "object") {
    const row = value as Record<string, unknown>
    return (
      sanitizePlainString(row.value) ??
      sanitizePlainString(row.code) ??
      sanitizePlainString(row.languageCode) ??
      sanitizePlainString(row.language_name) ??
      sanitizePlainString(row.long_name) ??
      sanitizePlainString(row.name) ??
      null
    )
  }
  return null
}

export function inferSeoLanguage(taskLanguage: unknown): string | null {
  if (typeof taskLanguage === "number") return null
  const sanitized = sanitizePlainString(taskLanguage)
  if (!sanitized) return null
  if (sanitized.toLowerCase() === "all") return null
  const normalized = sanitized.toLowerCase()
  if (/^lang_[a-z]{2}$/.test(normalized)) return normalized
  if (/^[a-z]{2}$/.test(normalized)) return `lang_${normalized}`
  return sanitized
}

export function buildTopResultsParams(input: {
  keyword: string
  taskLanguage: unknown
  selectedCountry: unknown
}): TopResultsRequestParams {
  const q = sanitizePlainString(input.keyword) ?? ""
  const languageId = inferSeoLanguage(input.taskLanguage)
  const sanitizedCountry = sanitizePlainString(input.selectedCountry)
  const regionId = sanitizedCountry ?? "all"
  return {
    q,
    languageId,
    regionId,
    num: 10,
  }
}

function mergeSnapshotStructure(
  existing: SeoSnapshotStructure | null,
  fetched: CompetitorStructureResponse,
): SeoSnapshotStructure {
  return {
    pageTitle: fetched.title,
    h1: fetched.headings.h1 ?? [],
    h2: fetched.headings.h2 ?? [],
    h3: fetched.headings.h3 ?? [],
    flatHeadings: fetched.flatHeadings ?? [],
    source: fetched.source ?? null,
    pageType: fetched.pageType ?? "unknown",
    fetchedAt: existing?.fetchedAt ?? new Date().toISOString(),
    error: fetched.error,
    available: fetched.available,
  }
}

function groupCompetitorsByKeyword(competitors: SeoSnapshotCompetitor[]): Record<string, SeoSnapshotCompetitor[]> {
  return competitors.reduce<Record<string, SeoSnapshotCompetitor[]>>((acc, competitor) => {
    const key = competitor.keyword.trim().toLowerCase()
    if (!acc[key]) acc[key] = []
    acc[key].push(competitor)
    return acc
  }, {})
}

function buildPrefetchBatchKey(competitors: SeoSnapshotCompetitor[]): string {
  return competitors
    .map((competitor) => String(competitor.id))
    .sort((a, b) => Number(a) - Number(b))
    .join(",")
}

function isTerminalStructureError(error: string | null | undefined): boolean {
  return error === "unsupported_site"
}

function hasAllStructures(competitors: SeoSnapshotCompetitor[]): boolean {
  if (competitors.length === 0) return false
  return competitors.every((competitor) => !!competitor.structure)
}

type RealtimeRow = Record<string, unknown>

function asRecord(value: unknown): RealtimeRow | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as RealtimeRow)
    : null
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((entry) => (typeof entry === "string" ? entry : "")).filter(Boolean)
}

function asFlatHeadings(value: unknown): SeoSnapshotStructure["flatHeadings"] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => {
      const row = asRecord(entry)
      if (!row) return null
      const level = asNumber(row.level)
      const tag = asString(row.tag)
      const text = asString(row.text)
      if ((level !== 1 && level !== 2 && level !== 3) || (tag !== "h1" && tag !== "h2" && tag !== "h3") || !text) {
        return null
      }
      return { level: level as 1 | 2 | 3, tag: tag as "h1" | "h2" | "h3", text }
    })
    .filter((entry): entry is NonNullable<typeof entry> => !!entry)
}

function asPrefetchJobStatus(value: unknown): PrefetchJobStatus {
  if (value === "queued" || value === "running" || value === "completed" || value === "failed") {
    return value
  }
  return "queued"
}

function buildStructureFromRealtimeRow(row: RealtimeRow): SeoSnapshotStructure {
  const error = asString(row.error)
  return {
    pageTitle: asString(row.page_title) ?? asString(row.pageTitle) ?? null,
    h1: asStringArray(row.h1),
    h2: asStringArray(row.h2),
    h3: asStringArray(row.h3),
    flatHeadings: asFlatHeadings(row.flat_headings ?? row.flatHeadings),
    source: asString(row.source) ?? null,
    pageType: (asString(row.page_type ?? row.pageType) as SeoSnapshotStructure["pageType"]) ?? null,
    fetchedAt: asString(row.fetched_at ?? row.fetchedAt) ?? null,
    error,
    available: error ? false : true,
  }
}

function pickRealtimeStructureUrl(row: RealtimeRow): string | null {
  return asString(row.url) ?? asString(row.page_url) ?? null
}

function buildPrefetchJobFromRealtimeRow(row: RealtimeRow): PrefetchJobState | null {
  const id = asNumber(row.id)
  const keyword = asString(row.keyword)
  if (id == null || !keyword) return null
  return {
    id,
    keyword,
    status: asPrefetchJobStatus(row.status),
    requestedCount: asNumber(row.requested_count ?? row.requestedCount) ?? 0,
    processedCount: asNumber(row.processed_count ?? row.processedCount) ?? 0,
    error: asString(row.error),
  }
}

export function useSeoCompetitorSnapshot({
  taskId,
  channelId,
  taskLanguage,
  keywords,
  bootstrapKeywords,
  selectedCountryByKeyword,
  autoLoadOnKeywordAdd = true,
}: UseSeoCompetitorSnapshotArgs) {
  const supabase = useMemo(() => createClientComponentClient(), [])
  const [isLoadingSnapshot, setIsLoadingSnapshot] = useState(false)
  const [hasSnapshotInitialized, setHasSnapshotInitialized] = useState(false)
  const [snapshotError, setSnapshotError] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<SeoSnapshot | null>(null)
  const [statesByKeyword, setStatesByKeyword] = useState<KeywordStateMap>({})
  const statesByKeywordRef = useRef<KeywordStateMap>({})
  const previousKeywordsRef = useRef<string[]>([])
  // Identifies the currently selected task/channel so async responses from a previous channel can
  // be discarded instead of writing stale competitor/top-result data into the UI.
  const channelKeyRef = useRef<string>(`${taskId ?? ""}:${channelId ?? ""}`)

  const normalizedKeywords = useMemo(() => {
    const seen = new Set<string>()
    const list: string[] = []
    for (const keyword of keywords) {
      const trimmed = String(keyword).trim()
      if (!trimmed) continue
      const key = trimmed.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      list.push(trimmed)
    }
    return list
  }, [keywords])

  const normalizedBootstrapKeywords = useMemo(() => {
    const seen = new Set<string>()
    const list: string[] = []
    for (const keyword of bootstrapKeywords ?? []) {
      const trimmed = String(keyword).trim()
      if (!trimmed) continue
      const key = trimmed.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      list.push(trimmed)
    }
    return list
  }, [bootstrapKeywords])

  const hasPersistedSeoKeywords = normalizedBootstrapKeywords.length > 0

  useEffect(() => {
    setStatesByKeyword((prev) => {
      const next: KeywordStateMap = {}
      for (const keyword of normalizedKeywords) {
        next[keyword] = prev[keyword] ?? createDefaultKeywordState(keyword)
      }
      statesByKeywordRef.current = next
      return next
    })
  }, [normalizedKeywords])

  // Fully reset competitor/top-result state the moment the task or channel changes so a channel
  // with no SEO config never shows the previous channel's snapshot while async reads complete.
  useEffect(() => {
    channelKeyRef.current = `${taskId ?? ""}:${channelId ?? ""}`
    previousKeywordsRef.current = []
    setHasSnapshotInitialized(false)
    setSnapshot(null)
    setSnapshotError(null)
    setStatesByKeyword({})
    statesByKeywordRef.current = {}
  }, [taskId, channelId])

  useEffect(() => {
    if (!taskId || !channelId) return
    if (!hasPersistedSeoKeywords) {
      setSnapshot({
        taskId,
        channelId,
        primaryKeyword: null,
        secondaryKeywords: [],
        keywords: [],
        competitors: [],
      })
      setSnapshotError(null)
      setIsLoadingSnapshot(false)
      setHasSnapshotInitialized(true)
      return
    }
    let isCancelled = false
    setHasSnapshotInitialized(false)
    setIsLoadingSnapshot(true)
    setSnapshotError(null)

    const loadSnapshot = async () => {
      try {
        const nextSnapshot = await fetchTaskChannelSeoSnapshot(taskId, channelId)
        if (isCancelled) return
        setSnapshot(nextSnapshot)

        const grouped = groupCompetitorsByKeyword(nextSnapshot.competitors)
        const keywordPool = normalizedKeywords.length > 0 ? normalizedKeywords : normalizedBootstrapKeywords
        setStatesByKeyword((prev) => {
          const next = { ...prev }
          for (const keyword of keywordPool) {
            const keywordKey = keyword.toLowerCase()
            const existing = prev[keyword] ?? createDefaultKeywordState(keyword)
            const savedCompetitors = grouped[keywordKey] ?? existing.competitors
            next[keyword] = {
              ...existing,
              keyword,
              competitors: savedCompetitors,
              selectedCompetitorId:
                savedCompetitors.find((competitor) => competitor.selected)?.id ?? existing.selectedCompetitorId,
              hasLoadedCompetitors: (grouped[keywordKey]?.length ?? 0) > 0 || existing.hasLoadedCompetitors,
            }
          }
          statesByKeywordRef.current = next
          return next
        })
      } catch (error) {
        if (isCancelled) return
        setSnapshotError(getBestErrorMessage(error, "Failed to load saved competitor snapshot"))
      } finally {
        if (!isCancelled) {
          setIsLoadingSnapshot(false)
          setHasSnapshotInitialized(true)
        }
      }
    }

    void loadSnapshot()

    return () => {
      isCancelled = true
    }
  }, [taskId, channelId, hasPersistedSeoKeywords, normalizedBootstrapKeywords])

  const setKeywordState = useCallback((keyword: string, updater: (state: KeywordCompetitorSnapshotState) => KeywordCompetitorSnapshotState) => {
    setStatesByKeyword((prev) => {
      const current = prev[keyword] ?? createDefaultKeywordState(keyword)
      const nextKeywordState = updater(current)
      const next = {
        ...prev,
        [keyword]: nextKeywordState,
      }
      statesByKeywordRef.current = next
      return {
        ...prev,
        [keyword]: nextKeywordState,
      }
    })
  }, [])

  useEffect(() => {
    if (!taskId || !channelId) return
    const channelName = `seo-snapshot:${taskId}:${channelId}`
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "task_channel_seo_competitor_structures",
        },
        (payload) => {
          const row = asRecord(payload.new) ?? asRecord(payload.old)
          if (!row) return
          const rowTaskId = asNumber(row.task_id ?? row.taskId)
          const rowChannelId = asNumber(row.channel_id ?? row.channelId)
          if (rowTaskId != null && rowTaskId !== taskId) return
          if (rowChannelId != null && rowChannelId !== channelId) return
          const competitorId = asNumber(row.competitor_id ?? row.competitorId)
          const realtimeUrl = pickRealtimeStructureUrl(row)
          if (competitorId == null && !realtimeUrl) return
          const structure = buildStructureFromRealtimeRow(row)
          console.log("[seo][realtime] structure row received", {
            competitorId,
            url: realtimeUrl,
            taskId: rowTaskId,
            channelId: rowChannelId,
          })
          console.log(`[seo] realtime structure received for competitor ${competitorId ?? "unknown"}`)
          setStatesByKeyword((prev) => {
            let didChange = false
            const next: KeywordStateMap = {}
            for (const [keyword, state] of Object.entries(prev)) {
              let matched = false
              const nextCompetitors = state.competitors.map((competitor) => {
                const matchesById = competitorId != null && competitor.id === competitorId
                const matchesByUrl = !!realtimeUrl && competitor.url === realtimeUrl
                if (!matchesById && !matchesByUrl) return competitor
                matched = true
                didChange = true
                console.log("[seo][realtime] merging structure into competitor", {
                  keyword,
                  competitorId: competitor.id,
                })
                console.log("[seo] merging into state", {
                  keyword,
                  competitorId: competitor.id,
                })
                return {
                  ...competitor,
                  structure,
                }
              })
              if (matched) {
                next[keyword] = {
                  ...state,
                  competitors: nextCompetitors,
                  lastStructureUpdateAt: Date.now(),
                }
              } else {
                next[keyword] = state
              }
            }
            if (!didChange) {
              console.log("[seo][realtime] no matching competitor found for structure row", {
                competitorId,
                url: realtimeUrl,
              })
              return prev
            }
            statesByKeywordRef.current = next
            console.log("[seo][realtime] structure merged into competitor", { competitorId })
            console.log("[seo][realtime] page type updated", {
              competitorId,
              pageType: structure.pageType ?? null,
            })
            console.log("[seo] competitors updated", {
              competitorId,
              pageType: structure.pageType ?? null,
            })
            return next
          })
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "task_channel_seo_prefetch_jobs",
          filter: `channel_id=eq.${channelId}`,
        },
        (payload) => {
          const row = asRecord(payload.new) ?? asRecord(payload.old)
          if (!row) return
          const rowTaskId = asNumber(row.task_id ?? row.taskId)
          const rowChannelId = asNumber(row.channel_id ?? row.channelId)
          if (rowTaskId !== taskId || rowChannelId !== channelId) return
          const job = buildPrefetchJobFromRealtimeRow(row)
          if (!job) return
          console.log("[seo][realtime] job row received", {
            keyword: job.keyword,
            status: job.status,
          })
          setKeywordState(job.keyword, (prev) => ({
            ...prev,
            prefetchJob: job,
            isPrefetchingStructures: job.status === "queued" || job.status === "running",
            hasPrefetchCompleted: job.status === "completed",
            prefetchError: job.status === "failed" ? job.error ?? "Prefetch failed" : null,
          }))
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log("[seo][realtime] structures subscription started", { taskId, channelId })
        }
      })

    return () => {
      console.log("[seo][realtime] subscription cleaned up", { taskId, channelId })
      supabase.removeChannel(channel)
    }
  }, [taskId, channelId, supabase, setKeywordState])

  const refreshKeywordCompetitorsFromBackend = useCallback(
    async (keyword: string): Promise<SeoSnapshotCompetitor[]> => {
      if (!taskId || !channelId) return []
      const refreshed = await fetchTaskChannelSeoSnapshot(taskId, channelId)
      setSnapshot(refreshed)
      const refreshedKeywordCompetitors = refreshed.competitors
        .filter((competitor) => competitor.keyword.trim().toLowerCase() === keyword.trim().toLowerCase())
        .sort((a, b) => a.position - b.position)
      setKeywordState(keyword, (prev) => ({
        ...prev,
        competitors: refreshedKeywordCompetitors,
        selectedCompetitorId:
          refreshedKeywordCompetitors.find((competitor) => competitor.selected)?.id ?? prev.selectedCompetitorId,
        hasLoadedCompetitors: refreshedKeywordCompetitors.length > 0 || prev.hasLoadedCompetitors,
      }))
      return refreshedKeywordCompetitors
    },
    [taskId, channelId, setKeywordState],
  )

  const startBackgroundPrefetch = useCallback(
    async (keyword: string, competitors: SeoSnapshotCompetitor[]) => {
      if (!taskId || !channelId) return
      const topTenMissingStructures = competitors.filter((competitor) => !competitor.structure).slice(0, 10)
      if (topTenMissingStructures.length === 0) {
        console.log("[seo] skipping prefetch because all structures already exist", { keyword })
        setKeywordState(keyword, (prev) => ({
          ...prev,
          hasPrefetchStarted: true,
          hasPrefetchCompleted: true,
          isPrefetchingStructures: false,
          prefetchError: null,
        }))
        return
      }

      const batchKey = buildPrefetchBatchKey(topTenMissingStructures)
      const existingKeywordState = statesByKeywordRef.current[keyword] ?? createDefaultKeywordState(keyword)
      if (
        existingKeywordState.prefetchedBatchKey === batchKey &&
        existingKeywordState.isPrefetchingStructures
      ) {
        console.log("[seo] prefetch skipped because already in flight", { keyword, batchKey })
        return
      }

      console.log("[seo] prefetch started for keyword", {
        keyword,
        batchKey,
        competitors: topTenMissingStructures.map((entry) => entry.id),
      })
      try {
        const prefetchPromise = prefetchCompetitorStructures({
          taskId,
          channelId,
          keyword,
          competitors: topTenMissingStructures.map((competitor) => ({
            competitorId: competitor.id,
            url: competitor.url,
          })),
        })
        setKeywordState(keyword, (prev) => ({
          ...prev,
          isPrefetchingStructures: true,
          hasPrefetchStarted: true,
          hasPrefetchCompleted: false,
          prefetchError: null,
          prefetchedBatchKey: batchKey,
        }))
        const prefetchResult = await prefetchPromise
        console.log("[seo] prefetch completed", { keyword, batchKey })
        if (prefetchResult?.completed) {
          const refreshedKeywordCompetitors = await refreshKeywordCompetitorsFromBackend(keyword)
          const ready = hasAllStructures(refreshedKeywordCompetitors)
          setKeywordState(keyword, (prev) => ({
            ...prev,
            isPrefetchingStructures: false,
            hasPrefetchCompleted: ready,
            lastPrefetchedAt: new Date().toISOString(),
          }))
          console.log("[seo] structures updated", {
            keyword,
            count: refreshedKeywordCompetitors.length,
          })
          return
        }
        setKeywordState(keyword, (prev) => ({
          ...prev,
          isPrefetchingStructures: false,
          hasPrefetchCompleted: false,
          prefetchError: null,
          lastPrefetchedAt: new Date().toISOString(),
        }))
      } catch (error) {
        console.log("[seo] prefetch failed", { keyword, message: getBestErrorMessage(error, "Background prefetch failed") })
        setKeywordState(keyword, (prev) => ({
          ...prev,
          isPrefetchingStructures: false,
          hasPrefetchCompleted: false,
          prefetchError: getBestErrorMessage(error, "Background prefetch failed"),
        }))
      }
    },
    [taskId, channelId, setKeywordState, refreshKeywordCompetitorsFromBackend],
  )

  const hydrateKeywordFromSnapshot = useCallback(
    async (keyword: string): Promise<SeoSnapshotCompetitor[]> => {
      if (!taskId || !channelId) return []
      const refreshed = await fetchTaskChannelSeoSnapshot(taskId, channelId)
      setSnapshot(refreshed)
      return refreshed.competitors
        .filter((competitor) => competitor.keyword.trim().toLowerCase() === keyword.trim().toLowerCase())
        .sort((a, b) => a.position - b.position)
    },
    [taskId, channelId],
  )

  const saveAndHydrateKeywordCompetitors = useCallback(
    async (
      keyword: string,
      results: Array<{ position: number; title: string; url: string; displayLink?: string | null }>,
      options?: { triggerPrefetch?: boolean; triggerSource?: "keyword_add" | "manual_refresh" | null },
    ) => {
      if (!taskId || !channelId) return [] as SeoSnapshotCompetitor[]
      const savedRows = await saveKeywordCompetitors({
        taskId,
        channelId,
        keyword,
        results,
      })
      console.log("[seo] keyword saved", {
        keyword,
        savedCount: savedRows.length,
      })
      const hydratedRows = savedRows.length > 0 ? savedRows : await hydrateKeywordFromSnapshot(keyword)
      console.log("[seo] saved competitors", {
        keyword,
        count: hydratedRows.length,
      })

      setKeywordState(keyword, (prev) => ({
        ...prev,
        competitors: hydratedRows,
        selectedCompetitorId: hydratedRows.find((competitor) => competitor.selected)?.id ?? null,
        hasLoadedCompetitors: true,
        competitorsError: null,
      }))
      if (options?.triggerPrefetch) {
        if (options.triggerSource === "keyword_add") {
          console.log("[seo] prefetch triggered by keyword add", { keyword })
        } else if (options.triggerSource === "manual_refresh") {
          console.log("[seo] prefetch triggered by manual refresh", { keyword })
        }
        console.log("[seo] starting prefetch", {
          keyword,
          competitorCount: hydratedRows.length,
        })
        void startBackgroundPrefetch(keyword, hydratedRows)
      }
      return hydratedRows
    },
    [taskId, channelId, hydrateKeywordFromSnapshot, setKeywordState, startBackgroundPrefetch],
  )

  const loadKeywordCompetitors = useCallback(
    async (
      keyword: string,
      options?: {
        forceRefresh?: boolean
        triggerPrefetch?: boolean
        triggerSource?: "keyword_add" | "manual_refresh" | null
      },
    ) => {
      if (!taskId || !channelId) return
      const requestKey = `${taskId}:${channelId}`
      const current = statesByKeyword[keyword]
      if (current?.isLoadingCompetitors) return
      if (!options?.forceRefresh && current?.hasLoadedCompetitors) return

      setKeywordState(keyword, (prev) => ({
        ...prev,
        isLoadingCompetitors: true,
        competitorsError: null,
      }))

      try {
        console.log("[seo] fetching top results", { keyword })
        const topResults = await fetchTopResults({
          ...buildTopResultsParams({
            keyword,
            taskLanguage: taskLanguage ?? null,
            selectedCountry: selectedCountryByKeyword?.[keyword] ?? null,
          }),
        })
        // Discard responses that arrived after the user switched task/channel.
        if (channelKeyRef.current !== requestKey) return
        if (topResults.error) throw new Error(topResults.error)

        const results = topResults.results.map((result) => ({
          position: result.position,
          title: result.title,
          url: result.link,
          displayLink: result.displayLink,
        }))

        await saveAndHydrateKeywordCompetitors(keyword, results, {
          triggerPrefetch: options?.triggerPrefetch ?? false,
          triggerSource: options?.triggerSource ?? null,
        })
      } catch (error) {
        if (channelKeyRef.current !== requestKey) return
        setKeywordState(keyword, (prev) => ({
          ...prev,
          competitorsError: getBestErrorMessage(error, "Failed to load competitor results"),
        }))
      } finally {
        if (channelKeyRef.current === requestKey) {
          setKeywordState(keyword, (prev) => ({
            ...prev,
            isLoadingCompetitors: false,
          }))
        }
      }
    },
    [taskId, channelId, taskLanguage, selectedCountryByKeyword, setKeywordState, statesByKeyword, saveAndHydrateKeywordCompetitors],
  )

  useEffect(() => {
    if (!autoLoadOnKeywordAdd) return
    if (!hasSnapshotInitialized) return
    const previousKeywords = previousKeywordsRef.current
    if (previousKeywords.length === 0) {
      previousKeywordsRef.current = [...normalizedKeywords]
      return
    }
    const addedKeywords = normalizedKeywords.filter((keyword) => !previousKeywords.includes(keyword))
    previousKeywordsRef.current = [...normalizedKeywords]

    for (const keyword of addedKeywords) {
      const state = statesByKeywordRef.current[keyword] ?? createDefaultKeywordState(keyword)
      if (state.isLoadingCompetitors || state.hasLoadedCompetitors) continue
      void loadKeywordCompetitors(keyword, {
        forceRefresh: true,
        triggerPrefetch: true,
        triggerSource: "keyword_add",
      })
    }
  }, [autoLoadOnKeywordAdd, hasSnapshotInitialized, normalizedKeywords, loadKeywordCompetitors])

  const toggleKeywordExpanded = useCallback(
    async (keyword: string) => {
      const keywordState = statesByKeyword[keyword] ?? createDefaultKeywordState(keyword)
      const nextExpanded = !keywordState.isExpanded
      setKeywordState(keyword, (prev) => ({
        ...prev,
        isExpanded: nextExpanded,
      }))

      if (!nextExpanded) return
      if (keywordState.hasLoadedCompetitors || keywordState.competitors.length > 0) return
      await loadKeywordCompetitors(keyword)
    },
    [statesByKeyword, setKeywordState, loadKeywordCompetitors],
  )

  const refreshKeywordAnalysis = useCallback(
    async (keyword: string) => {
      await loadKeywordCompetitors(keyword, {
        forceRefresh: true,
        triggerPrefetch: true,
        triggerSource: "manual_refresh",
      })
    },
    [loadKeywordCompetitors],
  )

  const loadCompetitorStructure = useCallback(
    async (keyword: string, competitorId: number) => {
      const keywordState = statesByKeyword[keyword] ?? createDefaultKeywordState(keyword)
      const competitor = keywordState.competitors.find((item) => item.id === competitorId)
      if (!competitor) return
      if (competitor.structure) return
      if (keywordState.loadingStructureByCompetitorId[competitorId]) return

      setKeywordState(keyword, (prev) => ({
        ...prev,
        loadingStructureByCompetitorId: {
          ...prev.loadingStructureByCompetitorId,
          [competitorId]: true,
        },
        structureErrorByCompetitorId: {
          ...prev.structureErrorByCompetitorId,
          [competitorId]: null,
        },
      }))

      try {
        const structureResponse = await fetchCompetitorStructure({ url: competitor.url })
        if (structureResponse.error) {
          if (isTerminalStructureError(structureResponse.error)) {
            const terminalStructure: SeoSnapshotStructure = {
              pageTitle: null,
              h1: [],
              h2: [],
              h3: [],
              flatHeadings: [],
              source: structureResponse.source ?? null,
              pageType: "unknown",
              fetchedAt: new Date().toISOString(),
              error: structureResponse.error,
              available: false,
            }
            setKeywordState(keyword, (prev) => ({
              ...prev,
              competitors: prev.competitors.map((item) =>
                item.id === competitorId
                  ? {
                      ...item,
                      structure: terminalStructure,
                    }
                  : item,
              ),
              fallbackTriedByCompetitorId: {
                ...prev.fallbackTriedByCompetitorId,
                [competitorId]: true,
              },
            }))
            return
          }
          throw new Error(structureResponse.error)
        }

        const structure = mergeSnapshotStructure(competitor.structure, structureResponse)
        await saveCompetitorStructure({
          competitorId,
          structure,
        })

        setKeywordState(keyword, (prev) => ({
          ...prev,
          competitors: prev.competitors.map((item) =>
            item.id === competitorId
              ? {
                  ...item,
                  structure,
                }
              : item,
          ),
          fallbackTriedByCompetitorId: {
            ...prev.fallbackTriedByCompetitorId,
            [competitorId]: true,
          },
        }))
      } catch (error) {
        setKeywordState(keyword, (prev) => ({
          ...prev,
          structureErrorByCompetitorId: {
            ...prev.structureErrorByCompetitorId,
            [competitorId]: getBestErrorMessage(error, "Failed to load heading structure"),
          },
        }))
      } finally {
        setKeywordState(keyword, (prev) => ({
          ...prev,
          loadingStructureByCompetitorId: {
            ...prev.loadingStructureByCompetitorId,
            [competitorId]: false,
          },
        }))
      }
    },
    [statesByKeyword, setKeywordState],
  )

  const getKeywordState = useCallback(
    (keyword: string): KeywordCompetitorSnapshotState => statesByKeyword[keyword] ?? createDefaultKeywordState(keyword),
    [statesByKeyword],
  )

  return {
    snapshot,
    isLoadingSnapshot,
    snapshotError,
    normalizedKeywords,
    getKeywordState,
    toggleKeywordExpanded,
    refreshKeywordAnalysis,
    loadKeywordCompetitors,
    saveAndHydrateKeywordCompetitors,
    startBackgroundPrefetch,
    loadCompetitorStructure,
  }
}

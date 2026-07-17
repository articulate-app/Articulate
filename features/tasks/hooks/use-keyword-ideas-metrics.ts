"use client"

import { useCallback, useMemo, useState } from "react"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { invokeEdgeFunctionFetch } from "../../../app/lib/edge-functions"

const SUPABASE_FUNCTIONS_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1`

type KeywordMetricRow = {
  keywordKey: string
  volume: number | null
  competition: number | null
  isLoading: boolean
}

type KeywordMetricApiRow = {
  keyword?: unknown
  text?: unknown
  avgMonthlySearches?: unknown
  competitionIndex?: unknown
}

type KeywordMetricDbRow = {
  keyword?: unknown
  name?: unknown
  volume?: unknown
  competition?: unknown
  competition_index?: unknown
}

type BuildKeywordIdeasParamsInput = {
  keyword: string
  taskLanguage: string | null
  regionId: unknown
  taskId?: number | null
  channelId?: number | null
  userId?: number | null
}

type KeywordIdeasRequestPayload = {
  keyword: string
  languageId?: string
  regionId?: string
  pageSize?: number
  taskId?: number
  channelId?: number
  listId?: number
  userId?: number
}

function normalizeKeyword(value: string): string {
  return value.trim().toLowerCase()
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function readResults(payload: unknown): KeywordMetricApiRow[] {
  if (payload == null || typeof payload !== "object") return []
  const row = payload as Record<string, unknown>
  if (Array.isArray(row.results)) {
    return row.results.filter((item): item is KeywordMetricApiRow => !!item && typeof item === "object")
  }
  if (Array.isArray(row.data)) {
    return row.data.filter((item): item is KeywordMetricApiRow => !!item && typeof item === "object")
  }
  return []
}

function normalizeLanguageId(taskLanguage: string | null): string | undefined {
  if (!taskLanguage) return undefined
  const normalized = taskLanguage.trim().toLowerCase()
  if (!normalized) return undefined
  if (normalized === "pt" || normalized.startsWith("portuguese")) return "pt"
  if (normalized === "en" || normalized.startsWith("english")) return "en"
  if (normalized === "es" || normalized.startsWith("spanish")) return "es"
  if (normalized === "fr" || normalized.startsWith("french")) return "fr"
  if (normalized === "de" || normalized.startsWith("german")) return "de"
  if (/^[a-z]{2}$/.test(normalized)) return normalized
  return undefined
}

export function normalizeKeywordIdeasRegionId(regionId: unknown): string | undefined {
  if (regionId == null) return undefined

  const value = typeof regionId === "string" ? regionId.trim() : String(regionId).trim()

  if (!value || value === "0" || value.toLowerCase() === "all") {
    return undefined
  }

  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return undefined
  }

  return String(numeric)
}

export function buildKeywordIdeasParams(input: BuildKeywordIdeasParamsInput): KeywordIdeasRequestPayload {
  const keyword = input.keyword.trim()
  const languageId = normalizeLanguageId(input.taskLanguage)
  const normalizedRegionId = normalizeKeywordIdeasRegionId(input.regionId)

  const payload: KeywordIdeasRequestPayload = {
    keyword,
    pageSize: 10,
  }

  if (languageId) {
    payload.languageId = languageId
  }

  if (normalizedRegionId) {
    payload.regionId = normalizedRegionId
  }

  if (typeof input.taskId === "number" && Number.isFinite(input.taskId)) {
    payload.taskId = input.taskId
  }

  if (typeof input.channelId === "number" && Number.isFinite(input.channelId)) {
    payload.channelId = input.channelId
  }

  if (typeof input.userId === "number" && Number.isFinite(input.userId)) {
    payload.userId = input.userId
  }

  return payload
}

export function useKeywordIdeasMetrics(args: {
  inferredTaskLanguage: string | null
  regionId: number | null
  taskId: number | null
  channelId: number | null
  userId: number | null
}) {
  const { inferredTaskLanguage, regionId, taskId, channelId, userId } = args
  const supabase = useMemo(() => createClientComponentClient(), [])
  const [keywordMetrics, setKeywordMetrics] = useState<KeywordMetricRow[]>([])

  const syncKeywordKeys = useCallback((keywords: string[]) => {
    const uniqueKeys: string[] = []
    const seen = new Set<string>()
    for (const keyword of keywords) {
      const key = normalizeKeyword(keyword)
      if (!key || seen.has(key)) continue
      seen.add(key)
      uniqueKeys.push(key)
    }

    setKeywordMetrics((prev) => {
      const prevByKey = new Map(prev.map((item) => [item.keywordKey, item]))
      return uniqueKeys.map((key) => {
        return prevByKey.get(key) ?? {
          keywordKey: key,
          volume: null,
          competition: null,
          isLoading: false,
        }
      })
    })
  }, [])

  const getKeywordMetric = useCallback(
    (keyword: string): KeywordMetricRow | null => {
      const key = normalizeKeyword(keyword)
      return keywordMetrics.find((item) => item.keywordKey === key) ?? null
    },
    [keywordMetrics],
  )

  const fetchKeywordMetricsForKeyword = useCallback(
    async (keyword: string, options?: { regionIdOverride?: number | null }) => {
      const trimmedKeyword = keyword.trim()
      if (!trimmedKeyword) return
      const key = normalizeKeyword(trimmedKeyword)
      const effectiveRegionId = options?.regionIdOverride ?? regionId

      if (typeof userId !== "number" || !Number.isFinite(userId)) {
        // Avoid sending metric persistence requests without a valid actor id.
        setKeywordMetrics((prev) =>
          prev.map((item) =>
            item.keywordKey === key
              ? {
                  ...item,
                  isLoading: false,
                }
              : item,
          ),
        )
        return
      }

      setKeywordMetrics((prev) => {
        const hasKeyword = prev.some((item) => item.keywordKey === key)
        if (!hasKeyword) {
          return [
            ...prev,
            {
              keywordKey: key,
              volume: null,
              competition: null,
              isLoading: true,
            },
          ]
        }
        return prev.map((item) =>
          item.keywordKey === key
            ? {
                ...item,
                isLoading: true,
              }
            : item,
        )
      })

      try {
        const requestPayload = buildKeywordIdeasParams({
          keyword: trimmedKeyword,
          taskLanguage: inferredTaskLanguage,
          regionId: effectiveRegionId,
          taskId,
          channelId,
          userId,
        })
        const response = await invokeEdgeFunctionFetch({
          supabase,
          url: `${SUPABASE_FUNCTIONS_BASE}/keyword-ideas`,
          init: {
            method: "POST",
            body: JSON.stringify(requestPayload),
          },
          headers: {
            "Content-Type": "application/json",
          },
          debugLabel: "keyword-ideas",
        })

        if (!response.ok) {
          throw new Error(`keyword-ideas failed with ${response.status}`)
        }

        const payload = (await response.json()) as unknown
        const rows = readResults(payload)
        const matchedRow =
          rows.find((row) => normalizeKeyword(String(row.keyword ?? row.text ?? "")) === key) ?? null

        const volume = toNumber(matchedRow?.avgMonthlySearches ?? null)
        const competition = toNumber(matchedRow?.competitionIndex ?? null)

        setKeywordMetrics((prev) =>
          prev.map((item) =>
            item.keywordKey === key
              ? {
                  ...item,
                  volume,
                  competition,
                  isLoading: false,
                }
              : item,
          ),
        )
      } catch {
        // Per product requirement: fail silently and do not auto-retry.
        setKeywordMetrics((prev) =>
          prev.map((item) =>
            item.keywordKey === key
              ? {
                  ...item,
                  isLoading: false,
                }
              : item,
          ),
        )
      }
    },
    [inferredTaskLanguage, regionId, taskId, channelId, userId, supabase],
  )

  const hydrateKeywordMetricsFromDb = useCallback(
    async (keywords: string[]) => {
      if (!taskId || !channelId) return

      const keywordKeySet = new Set(
        keywords
          .map((keyword) => normalizeKeyword(keyword))
          .filter(Boolean),
      )
      if (keywordKeySet.size === 0) return

      const { data, error } = await supabase.rpc("get_task_channel_keywords_with_metrics", {
        p_task_id: taskId,
        p_channel_id: channelId,
      })
      if (error) {
        console.error("[keyword-metrics] failed to load DB metrics", error)
        return
      }

      const rows = Array.isArray(data)
        ? data.filter((item): item is KeywordMetricDbRow => !!item && typeof item === "object")
        : []

      const byKeywordKey = new Map<string, { volume: number | null; competition: number | null }>()
      for (const row of rows) {
        const key = normalizeKeyword(String(row.keyword ?? row.name ?? ""))
        if (!key || !keywordKeySet.has(key)) continue
        const volume = toNumber(row.volume ?? null)
        const competition = toNumber(row.competition ?? row.competition_index ?? null)
        byKeywordKey.set(key, { volume, competition })
      }

      setKeywordMetrics((prev) =>
        prev.map((item) => {
          const dbMetric = byKeywordKey.get(item.keywordKey)
          if (!dbMetric) return item
          return {
            ...item,
            volume: dbMetric.volume,
            competition: dbMetric.competition,
            isLoading: false,
          }
        }),
      )
    },
    [taskId, channelId, supabase],
  )

  return {
    getKeywordMetric,
    fetchKeywordMetricsForKeyword,
    hydrateKeywordMetricsFromDb,
    syncKeywordKeys,
  }
}

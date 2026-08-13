"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { format, subDays } from "date-fns"
import { createClient } from "../../lib/supabase/client"
import { Card } from "../ui/card"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import { DateRangePicker } from "../ui/date-range-picker"
import { toast } from "../ui/use-toast"
import { Loader2, AlertCircle, X } from "lucide-react"
import { KeywordDifficultyBadge } from "../keyword-expanded-metrics"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
} from "recharts"
import { regions } from "../../lib/geoLanguageMaps"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog"
import {
  CHART_LINE_STROKE,
  formatChartAxisDate,
} from "./chart-date-range-footer"
import {
  ChartPreviewDateRangeButton,
  ChartPreviewHoverActions,
} from "./chart-preview-hover-actions"
import { AddDashedButton } from "../ui/add-dashed-button"
import { ProjectTrackSuggestions } from "./project-track-suggestions"
import { cn } from "@/lib/utils"

interface DateRangeValue {
  from?: Date
  to?: Date
}

interface ProjectKeywordTrackingTabProps {
  projectId: number
  /** Overview embed: chart + keyword picker. Manage: list/add only. */
  variant?: "full" | "preview" | "manage"
  dateRange?: DateRangeValue
  onDateRangeChange?: (range: DateRangeValue) => void
}

type KeywordRow = {
  project_keyword_id: number
  project_id: number
  keyword: string
  language_code: string | null
  region_code: string | null
  search_volume: number | null
  competition_index: number | null
  is_active: boolean | null
  created_at: string
  updated_at: string
  rank: number | null
  check_date: string | null
  found_url: string | null
  found_domain: string | null
  top_results?: any | null
}

type GlobalPoint = {
  check_date: string
  best_rank: number | null
  avg_rank: number | null
  keywords_tracked: number
  keywords_ranked: number
}

type KeywordPoint = {
  check_date: string
  rank: number | null
  keyword: string
  language_code: string | null
  region_code: string | null
}

type KeywordSnapshot = {
  check_date: string
  rank: number | null
  found_url: string | null
  found_domain: string | null
  top_results: any | null
}

const LANGUAGE_OPTIONS: { code: string; label: string }[] = [
  { code: "any", label: "Any" },
  { code: "EN", label: "English" },
  { code: "PT", label: "Portuguese" },
  { code: "ES", label: "Spanish" },
  { code: "FR", label: "French" },
  { code: "DE", label: "German" },
]

const LANGUAGE_TO_ADS_ID: Record<string, string> = {
  EN: "1000",
  PT: "1014",
  ES: "1003",
  FR: "1002",
  DE: "1001",
}

const volumeFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
})

function adsLanguageIdFromCode(code: string): string {
  if (!code || code === "any") return "1014"
  return LANGUAGE_TO_ADS_ID[code] ?? "1014"
}

function adsRegionIdFromCode(code: string): string {
  if (!code || code === "any") return "2620"
  return code
}

function formatSearchVolume(volume: number | null | undefined): string {
  if (volume == null || !Number.isFinite(volume)) return "—"
  return volumeFormatter.format(volume)
}

async function fetchKeywordAdsMetrics(args: {
  keyword: string
  languageCode: string
  regionCode: string
}): Promise<{ searchVolume: number; competitionIndex: number } | null> {
  try {
    const response = await fetch("/api/keyword-ideas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "seed",
        keyword: args.keyword,
        languageId: adsLanguageIdFromCode(args.languageCode),
        regionId: adsRegionIdFromCode(args.regionCode),
        pageSize: 10,
        phase: "primary",
      }),
      signal: AbortSignal.timeout(25_000),
    })
    if (!response.ok) return null
    const data = (await response.json().catch(() => ({}))) as {
      results?: Array<{
        keyword?: string
        avgMonthlySearches?: number
        competitionIndex?: number
      }>
    }
    const needle = args.keyword.trim().toLowerCase()
    const exact =
      (data.results ?? []).find(
        (row) => String(row.keyword || "").trim().toLowerCase() === needle,
      ) ?? data.results?.[0]
    if (!exact) return null
    return {
      searchVolume: Number(exact.avgMonthlySearches) || 0,
      competitionIndex: Number(exact.competitionIndex) || 0,
    }
  } catch {
    return null
  }
}

const getDefaultDateRange = (days = 29): DateRangeValue => {
  const today = new Date()
  const from = subDays(today, days)
  return { from, to: today }
}

const formatShortDate = (dateStr: string) => formatChartAxisDate(dateStr)

const mapRegionName = (regionCode: string | null) => {
  if (!regionCode || regionCode === "") return "Any"
  const region = regions.find((r) => r.id === regionCode)
  return region?.name || regionCode
}

const mapLanguageName = (languageCode: string | null) => {
  if (!languageCode || languageCode === "") return "Any"
  const match = LANGUAGE_OPTIONS.find((opt) => opt.code === languageCode)
  return match?.label || languageCode
}

const shortenUrl = (url: string) => {
  if (!url) return ""
  try {
    const u = new URL(url)
    return `${u.hostname}${u.pathname}`
  } catch {
    return url
  }
}

export function ProjectKeywordTrackingTab({
  projectId,
  variant = "full",
  dateRange: controlledDateRange,
  onDateRangeChange,
}: ProjectKeywordTrackingTabProps) {
  const isPreview = variant === "preview"
  const isManage = variant === "manage"
  const supabase = useMemo(() => createClient(), [])
  const queryClient = useQueryClient()
  const functionsClient = useMemo(() => createClientComponentClient(), [])
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [newKeyword, setNewKeyword] = useState("")
  const [newLanguage, setNewLanguage] = useState<string>("PT")
  const [newRegion, setNewRegion] = useState<string>("2620")
  const [isAdding, setIsAdding] = useState(false)
  const [showPreviewAddForm, setShowPreviewAddForm] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [pendingRankKeywordId, setPendingRankKeywordId] = useState<number | null>(
    null,
  )
  const [selectedKeywordId, setSelectedKeywordId] = useState<number | null>(null)
  const [isDetailsOpen, setIsDetailsOpen] = useState(false)
  const [uncontrolledDateRange, setUncontrolledDateRange] = useState<DateRangeValue>(() =>
    getDefaultDateRange(isPreview ? 6 : 29),
  )
  const dateRange = controlledDateRange ?? uncontrolledDateRange
  const setDateRange = onDateRangeChange ?? setUncontrolledDateRange
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [snapshot, setSnapshot] = useState<KeywordSnapshot | null>(null)
  const [isSnapshotLoading, setIsSnapshotLoading] = useState(false)
  const [snapshotError, setSnapshotError] = useState<string | null>(null)
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
  }, [])

  const from = dateRange.from
  const to = dateRange.to

  const {
    data: keywords,
    isLoading: isLoadingKeywords,
    error: keywordsError,
    refetch: refetchKeywords,
  } = useQuery<KeywordRow[]>({
    queryKey: ["project-keywords", projectId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("v_project_keywords_with_latest_rank")
        .select("*")
        .eq("project_id", projectId)
        .order("keyword", { ascending: true })

      if (error) {
        throw error
      }

      return (data || []) as KeywordRow[]
    },
  })

  const {
    data: globalSeries,
    isLoading: isLoadingGlobal,
    error: globalError,
    refetch: refetchGlobal,
  } = useQuery<GlobalPoint[]>({
    queryKey: [
      "project-keywords-global-series",
      projectId,
      from ? from.toISOString().slice(0, 10) : null,
      to ? to.toISOString().slice(0, 10) : null,
    ],
    enabled: !!from && !!to,
    queryFn: async () => {
      if (!from || !to) return []
      const { data, error } = await (supabase as any).rpc(
        "fn_get_project_keyword_global_timeseries",
        {
          p_project_id: projectId,
          p_start_date: from.toISOString().slice(0, 10),
          p_end_date: to.toISOString().slice(0, 10),
        },
      )

      if (error) {
        throw error
      }

      return (data || []) as GlobalPoint[]
    },
  })

  const {
    data: keywordSeries,
    isLoading: isLoadingKeywordSeries,
    error: keywordSeriesError,
    refetch: refetchKeywordSeries,
  } = useQuery<KeywordPoint[]>({
    queryKey: [
      "project-keywords-series",
      projectId,
      selectedKeywordId,
      from ? from.toISOString().slice(0, 10) : null,
      to ? to.toISOString().slice(0, 10) : null,
    ],
    enabled: !!selectedKeywordId && !!from && !!to,
    queryFn: async () => {
      if (!selectedKeywordId || !from || !to) return []
      const { data, error } = await (supabase as any).rpc(
        "fn_get_project_keyword_timeseries",
        {
          p_project_id: projectId,
          p_project_keyword_id: selectedKeywordId,
          p_start_date: from.toISOString().slice(0, 10),
          p_end_date: to.toISOString().slice(0, 10),
        },
      )

      if (error) {
        throw error
      }

      return (data || []) as KeywordPoint[]
    },
  })

  // Initialize selectedDate to latest point when series loads
  useEffect(() => {
    if (!selectedKeywordId || !keywordSeries || keywordSeries.length === 0) {
      setSelectedDate(null)
      return
    }

    if (!selectedDate) {
      const latest = keywordSeries[keywordSeries.length - 1]
      if (latest?.check_date) {
        setSelectedDate(new Date(latest.check_date))
      }
    }
  }, [selectedKeywordId, keywordSeries])

  // Fetch SERP snapshot whenever selected keyword or date changes
  useEffect(() => {
    if (!selectedKeywordId) {
      setSnapshot(null)
      setSnapshotError(null)
      setIsSnapshotLoading(false)
      return
    }

    const fetchSnapshot = async () => {
      setIsSnapshotLoading(true)
      setSnapshotError(null)
      try {
        const dateStr = selectedDate
          ? selectedDate.toISOString().slice(0, 10)
          : null

        const { data, error } = await (supabase as any).rpc(
          "fn_get_project_keyword_snapshot",
          {
            p_project_keyword_id: selectedKeywordId,
            p_check_date: dateStr,
          },
        )

        if (error) {
          throw error
        }

        if (data && Array.isArray(data) && data.length > 0) {
          setSnapshot(data[0] as KeywordSnapshot)
        } else {
          setSnapshot(null)
        }
      } catch (err: any) {
        console.error("Error loading keyword snapshot:", err)
        setSnapshotError(
          err?.message || "Failed to load SERP snapshot for this date.",
        )
        setSnapshot(null)
      } finally {
        setIsSnapshotLoading(false)
      }
    }

    // Only fetch when we have at least some timeseries data; otherwise snapshot is not meaningful
    if (keywordSeries && keywordSeries.length > 0) {
      fetchSnapshot()
    } else {
      setSnapshot(null)
    }
  }, [selectedKeywordId, selectedDate, keywordSeries])

  const enrichKeywordMetrics = async (args: {
    projectKeywordId: number
    keyword: string
    languageCode: string
    regionCode: string
  }) => {
    const metrics = await fetchKeywordAdsMetrics({
      keyword: args.keyword,
      languageCode: args.languageCode,
      regionCode: args.regionCode,
    })
    if (!metrics) return
    await (supabase as any).rpc("fn_update_project_keyword_metrics", {
      p_project_keyword_id: args.projectKeywordId,
      p_search_volume: metrics.searchVolume,
      p_competition_index: metrics.competitionIndex,
    })
  }

  const syncKeywordRankings = async (args?: {
    projectKeywordId?: number | null
  }) => {
    const body: Record<string, number> = { project_id: projectId }
    if (args?.projectKeywordId) {
      body.project_keyword_id = args.projectKeywordId
    }
    return functionsClient.functions.invoke("sync-project-keyword-rankings", {
      body,
    })
  }

  const handleAddSuggestedKeywords = async (texts: string[]) => {
    const keywordsToAdd = texts.map((text) => text.trim()).filter(Boolean)
    if (keywordsToAdd.length === 0) return

    setIsAdding(true)
    try {
      const languageCode = newLanguage === "any" ? "" : newLanguage
      const regionCode = newRegion === "any" ? "" : newRegion
      let added = 0
      let firstAddedId: number | null = null

      for (const keyword of keywordsToAdd) {
        const { data, error } = await (supabase as any).rpc(
          "fn_add_project_keyword",
          {
            p_project_id: projectId,
            p_keyword: keyword,
            p_language_code: languageCode,
            p_region_code: regionCode,
          },
        )
        if (error) throw error
        added += 1
        const id = Number(data?.id)
        if (Number.isFinite(id) && id > 0) {
          if (firstAddedId == null) firstAddedId = id
          void enrichKeywordMetrics({
            projectKeywordId: id,
            keyword,
            languageCode: newLanguage,
            regionCode: newRegion,
          })
        }
      }

      if (firstAddedId != null) {
        setSelectedKeywordId(firstAddedId)
        setPendingRankKeywordId(firstAddedId)
      }

      await refetchKeywords()
      toast({
        title: added === 1 ? "Keyword added" : `${added} keywords added`,
        description: "Fetching rankings and metrics…",
      })

      const { error: fnError } = await syncKeywordRankings({
        projectKeywordId: firstAddedId,
      })
      if (fnError) {
        toast({
          title: "Keywords added, but rankings not updated",
          description: "Try “Check rankings now”.",
          variant: "destructive",
        })
      }

      await Promise.all([refetchKeywords(), refetchGlobal()])
      await queryClient.invalidateQueries({
        queryKey: ["project-keywords-series", projectId],
      })
    } catch (error: unknown) {
      toast({
        title: "Could not add suggestions",
        description:
          error instanceof Error ? error.message : "Failed to add keywords.",
        variant: "destructive",
      })
      throw error
    } finally {
      setPendingRankKeywordId(null)
      setIsAdding(false)
    }
  }

  const handleAddKeyword = async () => {
    if (!newKeyword.trim()) {
      toast({
        title: "Keyword required",
        description: "Please enter a keyword to track.",
        variant: "destructive",
      })
      return
    }

    setIsAdding(true)
    const languageCode = newLanguage === "any" ? "" : newLanguage
    const regionCode = newRegion === "any" ? "" : newRegion
    const keywordText = newKeyword.trim()

    try {
      const { data, error } = await (supabase as any).rpc(
        "fn_add_project_keyword",
        {
          p_project_id: projectId,
          p_keyword: keywordText,
          p_language_code: languageCode,
          p_region_code: regionCode,
        },
      )

      if (error) {
        throw error
      }

      const addedId = Number(data?.id)
      if (Number.isFinite(addedId) && addedId > 0) {
        setSelectedKeywordId(addedId)
        setPendingRankKeywordId(addedId)
        queryClient.setQueryData(
          ["project-keywords", projectId],
          (old: KeywordRow[] | undefined) => {
            const newRow: KeywordRow = {
              project_keyword_id: addedId,
              project_id: projectId,
              keyword: data.keyword ?? keywordText,
              language_code: (data.language_code ?? languageCode) || null,
              region_code: (data.region_code ?? regionCode) || null,
              search_volume: null,
              competition_index: null,
              is_active: true,
              created_at: data.created_at,
              updated_at: data.updated_at,
              rank: null,
              check_date: null,
              found_url: null,
              found_domain: null,
              top_results: null,
            }
            if (!old) return [newRow]
            if (old.some((row) => row.project_keyword_id === addedId)) return old
            return [...old, newRow]
          },
        )
      }

      toast({
        title: "Keyword added",
        description: "Checking rankings and metrics…",
      })

      setNewKeyword("")
      setShowPreviewAddForm(false)

      if (Number.isFinite(addedId) && addedId > 0) {
        await enrichKeywordMetrics({
          projectKeywordId: addedId,
          keyword: keywordText,
          languageCode: newLanguage,
          regionCode: newRegion,
        })
      }

      const { error: fnError } = await syncKeywordRankings({
        projectKeywordId: Number.isFinite(addedId) ? addedId : null,
      })

      if (fnError) {
        console.error("Keyword rankings sync after add failed:", fnError)
        toast({
          title: "Keyword added, but rankings not updated",
          description: "The ranking check failed. Please try 'Check rankings now'.",
          variant: "destructive",
        })
        await refetchKeywords()
        return
      }

      await Promise.all([refetchKeywords(), refetchGlobal()])
      await queryClient.invalidateQueries({
        queryKey: ["project-keywords-series", projectId],
      })

      toast({
        title: "Keyword added and rankings updated",
        description: "Latest rankings and metrics are ready.",
      })
    } catch (error: any) {
      toast({
        title: "Error adding keyword",
        description: error?.message || "Failed to add keyword.",
        variant: "destructive",
      })
    } finally {
      setPendingRankKeywordId(null)
      setIsAdding(false)
    }
  }

  const handleRemoveKeyword = async (projectKeywordId: number) => {
    const { error } = await (supabase as any).rpc(
      "fn_deactivate_project_keyword",
      { p_project_keyword_id: projectKeywordId },
    )
    if (error) throw error

    queryClient.setQueryData(
      ["project-keywords", projectId],
      (old: KeywordRow[] | undefined) =>
        old
          ? old.filter((row) => row.project_keyword_id !== projectKeywordId)
          : old,
    )
    if (selectedKeywordId === projectKeywordId) {
      setSelectedKeywordId(null)
      setIsDetailsOpen(false)
    }
    await Promise.all([
      refetchKeywords(),
      refetchGlobal(),
      queryClient.invalidateQueries({
        queryKey: ["project-keywords-series", projectId],
      }),
    ])
  }

  const handleSyncRankings = async () => {
    setIsSyncing(true)
    try {
      const { error: fnError } = await syncKeywordRankings()

      if (fnError) {
        console.error("Keyword rankings sync failed:", fnError)
        toast({
          title: "Failed to check rankings",
          description: "Please try again in a few moments.",
          variant: "destructive",
        })
        return
      }

      toast({
        title: "Rankings updated",
        description: "Latest keyword rankings have been fetched.",
      })

      await Promise.all([
        refetchKeywords(),
        refetchGlobal(),
        selectedKeywordId ? refetchKeywordSeries() : Promise.resolve(),
      ])
    } catch (error: any) {
      console.error("Error syncing keyword rankings:", error)
      toast({
        title: "Error checking rankings",
        description: error?.message || "Unexpected error while syncing.",
        variant: "destructive",
      })
    } finally {
      setIsSyncing(false)
    }
  }

  const latestGlobalPoint = useMemo(() => {
    if (!globalSeries?.length) return null
    for (let i = globalSeries.length - 1; i >= 0; i -= 1) {
      const point = globalSeries[i]
      if (point?.avg_rank != null) return point
    }
    return globalSeries[globalSeries.length - 1] ?? null
  }, [globalSeries])

  const hasKeywords = !!keywords && keywords.length > 0
  const hasGlobalSeries = !!globalSeries && globalSeries.length > 0
  const hasKeywordSeries = !!keywordSeries && keywordSeries.length > 0

  const selectedKeywordRow = hasKeywords
    ? keywords!.find((row) => row.project_keyword_id === selectedKeywordId) || null
    : null

  // Preview defaults to the global average chart (like AI Visibility).

  const metricsBackfillAttemptedRef = useRef<Set<number>>(new Set())

  // Backfill SV/KD for older tracked keywords that were added before metrics storage.
  useEffect(() => {
    if (!keywords?.length) return
    const missing = keywords.filter(
      (row) =>
        (row.search_volume == null || row.competition_index == null)
        && !metricsBackfillAttemptedRef.current.has(row.project_keyword_id),
    )
    if (missing.length === 0) return

    let cancelled = false
    void (async () => {
      let updated = false
      for (const row of missing.slice(0, 8)) {
        if (cancelled) break
        metricsBackfillAttemptedRef.current.add(row.project_keyword_id)
        const metrics = await fetchKeywordAdsMetrics({
          keyword: row.keyword,
          languageCode: row.language_code || "any",
          regionCode: row.region_code || "any",
        })
        if (!metrics) continue
        const { error } = await (supabase as any).rpc(
          "fn_update_project_keyword_metrics",
          {
            p_project_keyword_id: row.project_keyword_id,
            p_search_volume: metrics.searchVolume,
            p_competition_index: metrics.competitionIndex,
          },
        )
        if (!error) updated = true
      }
      if (!cancelled && updated) {
        await refetchKeywords()
      }
    })()

    return () => {
      cancelled = true
    }
  }, [keywords, refetchKeywords, supabase])
  useEffect(() => {
    if (!isClient || !hasKeywords || isPreview) return

    const keywordIdParam = searchParams.get("keywordId")
    const keywordId = keywordIdParam ? Number(keywordIdParam) : null
    if (!keywordId || Number.isNaN(keywordId)) return

    const exists = keywords!.some(
      (row) => row.project_keyword_id === keywordId,
    )
    if (!exists) return

    setSelectedKeywordId(keywordId)
    setIsDetailsOpen(true)
  }, [isClient, hasKeywords, isPreview, keywords, searchParams])

  const handleCloseDetails = () => {
    setIsDetailsOpen(false)
    const params = new URLSearchParams(searchParams.toString())
    params.delete("keywordId")
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    })
  }

  const detailsPane =
    selectedKeywordRow && isDetailsOpen && isClient
      ? createPortal(
          <div className="fixed top-0 right-0 w-96 bg-white border-l border-gray-200 flex flex-col h-screen z-40">
            {/* Header */}
            <div className="flex h-14 items-center justify-between border-b px-4">
              <h2 className="text-sm font-semibold truncate">Keyword details</h2>
              <button
                onClick={handleCloseDetails}
                className="ml-2 rounded-full p-1 hover:bg-accent"
              >
                <span className="sr-only">Close</span>
                ×
              </button>
            </div>

            {/* Content */}
            <div className="space-y-4 h-full flex-1 overflow-y-auto p-4">
              {/* Keyword summary: label left, value right */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-medium text-gray-500">
                    Keyword
                  </span>
                  <span className="max-w-[220px] text-right text-xs text-gray-900 truncate">
                    {selectedKeywordRow.keyword}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-medium text-gray-500">
                    Language
                  </span>
                  <span className="text-right text-xs text-gray-900">
                    {mapLanguageName(selectedKeywordRow.language_code)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-medium text-gray-500">
                    Region
                  </span>
                  <span className="text-right text-xs text-gray-900">
                    {mapRegionName(selectedKeywordRow.region_code)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-medium text-gray-500">SV</span>
                  <span className="text-right text-xs tabular-nums text-gray-900">
                    {formatSearchVolume(selectedKeywordRow.search_volume)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-medium text-gray-500">KD</span>
                  <span className="text-right text-xs text-gray-900">
                    {selectedKeywordRow.competition_index != null ? (
                      <KeywordDifficultyBadge
                        competitionIndex={selectedKeywordRow.competition_index}
                      />
                    ) : (
                      "—"
                    )}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2">
                <RemoveKeywordTrackingButton
                  selectedKeywordId={selectedKeywordId}
                  onRemove={handleRemoveKeyword}
                  onClosePane={handleCloseDetails}
                />
              </div>

              <div className="pt-4 flex-1 flex flex-col">
                <h4 className="mb-2 text-sm font-semibold text-gray-900">
                  Ranking history
                </h4>
                <div className="h-64">
                  {isLoadingKeywordSeries
                    || pendingRankKeywordId === selectedKeywordId ? (
                    <div className="flex h-full items-center justify-center text-sm text-gray-500">
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      {pendingRankKeywordId === selectedKeywordId
                        ? "Checking rankings…"
                        : "Loading keyword rankings…"}
                    </div>
                  ) : keywordSeriesError ? (
                    <div className="flex h-full items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                      <AlertCircle className="h-4 w-4" />
                      <span>Failed to load keyword ranking history.</span>
                    </div>
                  ) : !hasKeywordSeries ? (
                    <div className="flex h-full items-center justify-center text-sm text-gray-500">
                      No ranking data for this keyword in the selected date range.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={keywordSeries!.map((point) => ({
                          ...point,
                          displayRank:
                            point.rank == null || point.rank <= 0
                              ? 101
                              : point.rank,
                        }))}
                        onClick={(e: any) => {
                          const payload =
                            e && e.activePayload && e.activePayload[0]
                              ? e.activePayload[0].payload
                              : null
                          if (payload && payload.check_date) {
                            setSelectedDate(new Date(payload.check_date))
                          }
                        }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis
                          dataKey="check_date"
                          stroke="#6b7280"
                          style={{ fontSize: "12px" }}
                          tickFormatter={formatShortDate}
                        />
                        <YAxis
                          stroke="#6b7280"
                          style={{ fontSize: "12px" }}
                          reversed
                          domain={[1, 101]}
                        />
                        <RechartsTooltip
                          formatter={(value: any, name: string, props: any) => {
                            const originalRank = props.payload.rank
                            if (originalRank == null || originalRank <= 0) {
                              return ["Not ranked", "Rank"]
                            }
                            return [`#${originalRank}`, "Rank"]
                          }}
                          labelFormatter={(label) =>
                            `Date: ${format(new Date(label), "yyyy-MM-dd")}`
                          }
                        />
                        <Line
                          type="monotone"
                          dataKey="displayRank"
                          stroke={CHART_LINE_STROKE}
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          activeDot={{ r: 4 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>

                {/* SERP snapshot list */}
                <div className="mt-4">
                  <h5 className="mb-2 text-xs font-semibold text-gray-900">
                    {snapshot && snapshot.check_date
                      ? `SERP snapshot for ${selectedKeywordRow.keyword} on ${format(
                          new Date(snapshot.check_date),
                          "yyyy-MM-dd",
                        )}`
                      : "SERP snapshot"}
                  </h5>
                  {isSnapshotLoading ? (
                    <div className="flex h-32 items-center justify-center text-sm text-gray-500">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Loading SERP data…
                    </div>
                  ) : snapshotError ? (
                    <div className="flex h-32 items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                      <AlertCircle className="h-4 w-4" />
                      <span>{snapshotError}</span>
                    </div>
                  ) : !snapshot ? (
                    <div className="flex h-32 items-center justify-center text-sm text-gray-500">
                      No SERP data for this date.
                    </div>
                  ) : (
                    <>
                      <p className="mb-2 text-[11px] text-gray-600">
                        {snapshot.rank != null && snapshot.rank > 0
                          ? `Your site ranked #${snapshot.rank} ${
                              snapshot.found_url
                                ? `at ${shortenUrl(snapshot.found_url)}`
                                : ""
                            }.`
                          : "Your site was not found in the top 100 results."}
                      </p>
                      <div className="space-y-2 rounded-md border p-3">
                        {Array.isArray(snapshot.top_results)
                          ? (snapshot.top_results as any[])
                              .slice(0, 10)
                              .map((res: any, idx: number) => {
                                const link = String(res.link || "")
                                const isOurUrl =
                                  (snapshot.found_url &&
                                    link === snapshot.found_url) ||
                                  (snapshot.found_domain &&
                                    (() => {
                                      try {
                                        const u = new URL(link)
                                        return (
                                          u.hostname === snapshot.found_domain
                                        )
                                      } catch {
                                        return false
                                      }
                                    })())

                                return (
                                  <div
                                    key={`${link}-${idx}`}
                                    className={`space-y-1 rounded-md px-2 py-1 ${
                                      isOurUrl ? "bg-blue-50/60" : ""
                                    }`}
                                  >
                                    <div className="text-[11px] font-medium text-gray-900">
                                      {(res.position ?? idx + 1) + ". "}
                                      {res.title || "Untitled"}
                                      {isOurUrl && (
                                        <span className="ml-2 inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                                          Your site
                                        </span>
                                      )}
                                    </div>
                                    {link ? (
                                      <a
                                        href={link}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-[11px] text-blue-600 hover:text-blue-800 break-all"
                                        title={link}
                                      >
                                        {shortenUrl(link)}
                                      </a>
                                    ) : (
                                      <span className="text-[11px] text-gray-400">
                                        —
                                      </span>
                                    )}
                                  </div>
                                )
                              })
                          : null}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null

  const globalRankingsCard = (
    <Card
      className={
        isPreview
          ? "min-w-0 border-0 bg-transparent p-0 shadow-none"
          : "min-w-0 p-4 md:p-6"
      }
    >
      {isPreview ? null : (
        <div className="mb-3 flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-gray-900">
              Global rankings
            </h4>
            <p className="text-[11px] text-gray-500">
              Best and average rank across all tracked keywords.
            </p>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
              Avg rank
            </div>
            <div className="text-xl font-semibold tabular-nums text-gray-900">
              {latestGlobalPoint?.avg_rank != null
                ? `#${Math.round(latestGlobalPoint.avg_rank)}`
                : "—"}
            </div>
            <div className="text-[11px] text-gray-500">
              {latestGlobalPoint
                ? `${latestGlobalPoint.keywords_ranked}/${latestGlobalPoint.keywords_tracked} ranked`
                : "No ranking data yet"}
              {latestGlobalPoint?.best_rank != null
                ? ` · best #${Math.round(latestGlobalPoint.best_rank)}`
                : ""}
            </div>
          </div>
        </div>
      )}
      <div className="h-64 min-w-0">
        {isLoadingGlobal ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-500">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Loading global rankings…
          </div>
        ) : globalError ? (
          <div className="flex h-full items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <AlertCircle className="h-4 w-4" />
            <span>Failed to load global rankings.</span>
          </div>
        ) : !hasGlobalSeries ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-500">
            No ranking data yet. Use &quot;Check rankings now&quot; to
            fetch data.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={globalSeries}
              margin={
                isPreview
                  ? { top: 8, right: 8, left: 0, bottom: 0 }
                  : { top: 5, right: 20, left: 0, bottom: 5 }
              }
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="check_date"
                stroke="#6b7280"
                style={{ fontSize: "12px" }}
                tickFormatter={formatShortDate}
                tickMargin={8}
              />
              <YAxis
                width={isPreview ? 36 : 48}
                stroke="#6b7280"
                style={{ fontSize: "12px" }}
                reversed
              />
              <RechartsTooltip
                formatter={(value: any, name: string) => {
                  if (value == null) return ["—", name]
                  return [value, name === "best_rank" ? "Best rank" : "Avg rank"]
                }}
                labelFormatter={(label) =>
                  `Date: ${format(new Date(label), "yyyy-MM-dd")}`
                }
              />
              {isPreview ? null : (
                <Legend
                  formatter={(value) =>
                    value === "best_rank" ? "Best rank" : "Avg rank"
                  }
                />
              )}
              {isPreview ? null : (
                <Line
                  type="monotone"
                  dataKey="best_rank"
                  stroke={CHART_LINE_STROKE}
                  strokeOpacity={0.45}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              )}
              <Line
                type="monotone"
                dataKey="avg_rank"
                name={isPreview ? "Avg rank" : "avg_rank"}
                stroke={CHART_LINE_STROKE}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  )

  const serpSnapshotBlock = selectedKeywordRow ? (
    <div className="space-y-2">
      <div className="text-[11px] font-medium text-gray-500">
        {snapshot?.check_date
          ? `Top results · ${format(new Date(snapshot.check_date), "MMM d, yyyy")}`
          : "Top results"}
      </div>
      {isSnapshotLoading ? (
        <div className="flex items-center gap-2 py-4 text-xs text-gray-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading SERP data…
        </div>
      ) : snapshotError ? (
        <p className="text-xs text-red-600">{snapshotError}</p>
      ) : !snapshot ? (
        <p className="text-xs text-gray-500">No SERP data for this date.</p>
      ) : (
        <div className="divide-y divide-gray-100 rounded-md border border-gray-100">
          {Array.isArray(snapshot.top_results)
            ? (snapshot.top_results as any[]).slice(0, 5).map((res: any, idx: number) => {
                const link = String(res.link || "")
                const isOurUrl =
                  (snapshot.found_url && link === snapshot.found_url) ||
                  (snapshot.found_domain &&
                    (() => {
                      try {
                        return new URL(link).hostname === snapshot.found_domain
                      } catch {
                        return false
                      }
                    })())
                return (
                  <div
                    key={`${link}-${idx}`}
                    className={cn("px-3 py-2", isOurUrl && "bg-gray-50")}
                  >
                    <div className="text-xs font-medium text-gray-900">
                      {(res.position ?? idx + 1) + ". "}
                      {res.title || "Untitled"}
                      {isOurUrl ? (
                        <span className="ml-1.5 text-[10px] font-medium text-gray-500">
                          Your site
                        </span>
                      ) : null}
                    </div>
                    {link ? (
                      <a
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-0.5 block truncate text-[11px] text-gray-500 hover:text-gray-700"
                        title={link}
                      >
                        {shortenUrl(link)}
                      </a>
                    ) : null}
                  </div>
                )
              })
            : null}
        </div>
      )}
    </div>
  ) : null

  if (isPreview) {
    const showKeywordChart = !!selectedKeywordId
    // Range control only when keywords exist (chart surface is available).
    const chartAvailable = hasKeywords

    if (isLoadingKeywords) {
      return (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      )
    }

    if (!hasKeywords) {
      return (
        <div className="min-w-0 space-y-3">
          <ProjectTrackSuggestions
            projectId={projectId}
            kind="keywords"
            existingTexts={[]}
            onAdd={handleAddSuggestedKeywords}
            regionId={adsRegionIdFromCode(newRegion)}
            languageId={adsLanguageIdFromCode(newLanguage)}
          />
          {showPreviewAddForm ? (
            <KeywordAddFields
              keyword={newKeyword}
              onKeywordChange={setNewKeyword}
              language={newLanguage}
              onLanguageChange={setNewLanguage}
              region={newRegion}
              onRegionChange={setNewRegion}
              isAdding={isAdding}
              onAdd={handleAddKeyword}
              onCancel={() => setShowPreviewAddForm(false)}
              keywordInputId="overview-new-keyword"
            />
          ) : (
            <AddDashedButton
              label="Add keyword"
              className="mt-0"
              onClick={() => setShowPreviewAddForm(true)}
            />
          )}
        </div>
      )
    }

    return (
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
              {showKeywordChart ? "Keyword rank" : "Avg rank"}
            </div>
            <div className="text-2xl font-semibold tabular-nums text-gray-900">
              {showKeywordChart
                ? selectedKeywordRow?.rank != null
                  ? `#${selectedKeywordRow.rank}`
                  : pendingRankKeywordId === selectedKeywordId
                    ? "…"
                    : "—"
                : latestGlobalPoint?.avg_rank != null
                  ? `#${Math.round(latestGlobalPoint.avg_rank)}`
                  : "—"}
            </div>
            <div className="mt-0.5 text-[11px] text-gray-500">
              {showKeywordChart
                ? selectedKeywordRow
                  ? `SV ${formatSearchVolume(selectedKeywordRow.search_volume)}${
                      selectedKeywordRow.competition_index != null
                        ? ` · KD ${selectedKeywordRow.competition_index}`
                        : ""
                    }`
                  : "Select a keyword"
                : latestGlobalPoint
                  ? `${latestGlobalPoint.keywords_ranked}/${latestGlobalPoint.keywords_tracked} ranked`
                  : "Across all tracked keywords"}
            </div>
          </div>
        </div>
        <ChartPreviewHoverActions
          enabled={chartAvailable}
          actions={<ChartPreviewDateRangeButton value={dateRange} onChange={setDateRange} />}
        >
          <div className="h-64 min-w-0">
            {showKeywordChart ? (
              isLoadingKeywordSeries || pendingRankKeywordId === selectedKeywordId ? (
                <div className="flex h-full items-center justify-center text-sm text-gray-500">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  {pendingRankKeywordId === selectedKeywordId
                    ? "Checking rankings…"
                    : "Loading keyword rankings…"}
                </div>
              ) : keywordSeriesError ? (
                <div className="flex h-full items-center gap-2 text-xs text-red-700">
                  <AlertCircle className="h-4 w-4" />
                  <span>Failed to load keyword ranking history.</span>
                </div>
              ) : !hasKeywordSeries ? (
                <div className="flex h-full items-center justify-center text-sm text-gray-500">
                  No ranking data for this keyword in the selected range.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={keywordSeries!.map((point) => ({
                      ...point,
                      displayRank:
                        point.rank == null || point.rank <= 0 ? 101 : point.rank,
                    }))}
                    margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                    onClick={(e: any) => {
                      const payload = e?.activePayload?.[0]?.payload
                      if (payload?.check_date) {
                        setSelectedDate(new Date(payload.check_date))
                      }
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="check_date"
                      stroke="#6b7280"
                      style={{ fontSize: "12px" }}
                      tickFormatter={formatShortDate}
                      tickMargin={8}
                    />
                    <YAxis
                      width={36}
                      stroke="#6b7280"
                      style={{ fontSize: "12px" }}
                      reversed
                      domain={[1, 101]}
                    />
                    <RechartsTooltip
                      formatter={(_value: any, _name: string, props: any) => {
                        const originalRank = props.payload.rank
                        if (originalRank == null || originalRank <= 0) {
                          return ["Not ranked", "Rank"]
                        }
                        return [`#${originalRank}`, "Rank"]
                      }}
                      labelFormatter={(label) =>
                        `Date: ${format(new Date(label), "yyyy-MM-dd")}`
                      }
                    />
                    <Line
                      type="monotone"
                      dataKey="displayRank"
                      stroke={CHART_LINE_STROKE}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )
            ) : (
              globalRankingsCard
            )}
          </div>
        </ChartPreviewHoverActions>

        <div className="space-y-2">
          <div className="text-[11px] font-medium text-gray-500">Keywords</div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => {
                setSelectedKeywordId(null)
                setIsDetailsOpen(false)
              }}
              className={cn(
                "rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors",
                selectedKeywordId == null
                  ? "border-gray-900 bg-gray-900 text-white"
                  : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50",
              )}
            >
              Avg rank
            </button>
            {keywords!.map((row) => {
              const isSelected = row.project_keyword_id === selectedKeywordId
              return (
                <div
                  key={row.project_keyword_id}
                  className={cn(
                    "inline-flex max-w-full items-stretch overflow-hidden rounded-md border text-xs transition-colors",
                    isSelected
                      ? "border-gray-900 bg-gray-900 text-white"
                      : "border-gray-200 bg-white text-gray-700",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedKeywordId(row.project_keyword_id)
                      setIsDetailsOpen(false)
                    }}
                    className={cn(
                      "max-w-full px-2.5 py-1.5 text-left",
                      !isSelected && "hover:bg-gray-50",
                    )}
                  >
                    <span className="line-clamp-2">
                      {row.keyword}
                      <span className={cn("ml-1", isSelected ? "text-gray-300" : "text-gray-400")}>
                        {row.rank != null ? `#${row.rank}` : "—"}
                        {row.search_volume != null
                          ? ` · ${formatSearchVolume(row.search_volume)}`
                          : ""}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${row.keyword}`}
                    className={cn(
                      "border-l px-1.5",
                      isSelected
                        ? "border-white/20 text-gray-300 hover:text-white"
                        : "border-gray-200 text-gray-400 hover:bg-gray-50 hover:text-gray-700",
                    )}
                    onClick={(event) => {
                      event.stopPropagation()
                      void handleRemoveKeyword(row.project_keyword_id)
                        .then(() => {
                          toast({ title: "Keyword tracking stopped" })
                        })
                        .catch((error: unknown) => {
                          toast({
                            title: "Could not remove keyword",
                            description:
                              error instanceof Error
                                ? error.message
                                : "Failed to stop tracking.",
                            variant: "destructive",
                          })
                        })
                    }}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ProjectTrackSuggestions
              projectId={projectId}
              kind="keywords"
              existingTexts={(keywords ?? []).map((row) => row.keyword)}
              onAdd={handleAddSuggestedKeywords}
              regionId={adsRegionIdFromCode(newRegion)}
              languageId={adsLanguageIdFromCode(newLanguage)}
            />
            {showPreviewAddForm ? null : (
              <AddDashedButton
                label="Add keyword"
                className="mt-0"
                onClick={() => setShowPreviewAddForm(true)}
              />
            )}
          </div>
          {showPreviewAddForm ? (
            <KeywordAddFields
              keyword={newKeyword}
              onKeywordChange={setNewKeyword}
              language={newLanguage}
              onLanguageChange={setNewLanguage}
              region={newRegion}
              onRegionChange={setNewRegion}
              isAdding={isAdding}
              onAdd={handleAddKeyword}
              onCancel={() => setShowPreviewAddForm(false)}
              keywordInputId="overview-add-keyword"
            />
          ) : null}
        </div>

        {serpSnapshotBlock}
      </div>
    )
  }

  const keywordsManagementCard = (
    <Card className="min-w-0 p-4 md:p-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-gray-900">Tracked keywords</h3>
          <p className="text-xs text-gray-500">
            Keywords currently being monitored for this project.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          className="shrink-0"
          onClick={handleSyncRankings}
          disabled={isSyncing}
        >
          {isSyncing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Checking…
            </>
          ) : (
            <>Check rankings now</>
          )}
        </Button>
      </div>

      <div className="mb-4">
        <KeywordAddFields
          keyword={newKeyword}
          onKeywordChange={setNewKeyword}
          language={newLanguage}
          onLanguageChange={setNewLanguage}
          region={newRegion}
          onRegionChange={setNewRegion}
          isAdding={isAdding}
          onAdd={handleAddKeyword}
          keywordInputId="new-keyword"
          showCancel={false}
        />
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <ProjectTrackSuggestions
          projectId={projectId}
          kind="keywords"
          existingTexts={(keywords ?? []).map((row) => row.keyword)}
          onAdd={handleAddSuggestedKeywords}
          regionId={adsRegionIdFromCode(newRegion)}
          languageId={adsLanguageIdFromCode(newLanguage)}
        />
        <p className="text-[11px] text-gray-500">
          Rankings and SV/KD are fetched right after you add a keyword.
        </p>
      </div>

      {isLoadingKeywords ? (
        <div className="flex items-center justify-center py-8 text-sm text-gray-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading keywords…
        </div>
      ) : keywordsError ? (
        <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertCircle className="h-4 w-4" />
          <span>Failed to load keywords.</span>
        </div>
      ) : !hasKeywords ? (
        <div className="rounded-md bg-gray-50 px-3 py-4 text-sm text-gray-600">
          No keywords being tracked yet. Add your first keyword to start tracking rankings.
        </div>
      ) : (
        <div className="divide-y divide-gray-100 rounded-md border border-gray-100">
          {keywords!.map((row) => {
            const isSelected = row.project_keyword_id === selectedKeywordId
            return (
              <div
                key={row.project_keyword_id}
                className={cn(
                  "flex w-full flex-col gap-1 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between",
                  isSelected && "bg-gray-50",
                )}
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left transition-colors hover:opacity-80"
                  onClick={() => {
                    const id = row.project_keyword_id
                    setSelectedKeywordId(id)
                    if (!isManage) {
                      setIsDetailsOpen(true)
                      const params = new URLSearchParams(searchParams.toString())
                      params.set("keywordId", String(id))
                      const query = params.toString()
                      router.replace(query ? `${pathname}?${query}` : pathname, {
                        scroll: false,
                      })
                    }
                  }}
                >
                  <div className="line-clamp-2 text-xs text-gray-900">{row.keyword}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-500">
                    <span>
                      {mapLanguageName(row.language_code)} · {mapRegionName(row.region_code)}
                      {row.check_date
                        ? ` · ${format(new Date(row.check_date), "MMM d, yyyy")}`
                        : ""}
                    </span>
                    <span className="tabular-nums">
                      SV {formatSearchVolume(row.search_volume)}
                    </span>
                    {row.competition_index != null ? (
                      <KeywordDifficultyBadge competitionIndex={row.competition_index} />
                    ) : (
                      <span>KD —</span>
                    )}
                  </div>
                </button>
                <div className="flex shrink-0 items-center gap-2">
                  <div className="text-xs text-gray-700">
                    {row.rank != null ? `#${row.rank}` : "Not ranked"}
                  </div>
                  <button
                    type="button"
                    aria-label={`Remove ${row.keyword}`}
                    className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                    onClick={() => {
                      void handleRemoveKeyword(row.project_keyword_id)
                        .then(() => {
                          toast({ title: "Keyword tracking stopped" })
                        })
                        .catch((error: unknown) => {
                          toast({
                            title: "Could not remove keyword",
                            description:
                              error instanceof Error
                                ? error.message
                                : "Failed to stop tracking.",
                            variant: "destructive",
                          })
                        })
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )

  if (isManage) {
    return <div className="min-w-0">{keywordsManagementCard}</div>
  }

  return (
    <>
      <div className="space-y-6">
        <div className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Ranking evolution</h2>
              <p className="text-xs text-gray-500">
                Lower rank is better (1 = top position).
              </p>
            </div>
            <div className="w-full md:w-64">
              <DateRangePicker
                value={dateRange}
                onChange={(range) => setDateRange(range)}
              />
            </div>
          </div>

          {globalRankingsCard}
        </div>

        {keywordsManagementCard}
      </div>
      {detailsPane}
    </>
  )
}

interface KeywordAddFieldsProps {
  keyword: string
  onKeywordChange: (value: string) => void
  language: string
  onLanguageChange: (value: string) => void
  region: string
  onRegionChange: (value: string) => void
  isAdding: boolean
  onAdd: () => void
  onCancel?: () => void
  keywordInputId: string
  showCancel?: boolean
}

function KeywordAddFields({
  keyword,
  onKeywordChange,
  language,
  onLanguageChange,
  region,
  onRegionChange,
  isAdding,
  onAdd,
  onCancel,
  keywordInputId,
  showCancel = true,
}: KeywordAddFieldsProps) {
  return (
    <div className="space-y-3 rounded-lg border border-dashed border-gray-200 p-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1 sm:col-span-2 lg:col-span-1">
          <Label htmlFor={keywordInputId} className="text-xs">
            Keyword
          </Label>
          <Input
            id={keywordInputId}
            placeholder="e.g. best seo agency lisbon"
            value={keyword}
            onChange={(e) => onKeywordChange(e.target.value)}
            className="h-8 text-xs"
            autoFocus
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${keywordInputId}-language`} className="text-xs">
            Language
          </Label>
          <Select value={language} onValueChange={onLanguageChange}>
            <SelectTrigger id={`${keywordInputId}-language`} className="h-8 text-xs">
              <SelectValue placeholder="Language" />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGE_OPTIONS.map((opt) => (
                <SelectItem key={opt.code} value={opt.code}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${keywordInputId}-region`} className="text-xs">
            Region
          </Label>
          <Select value={region} onValueChange={onRegionChange}>
            <SelectTrigger id={`${keywordInputId}-region`} className="h-8 text-xs">
              <SelectValue placeholder="Region" />
            </SelectTrigger>
            <SelectContent>
              {regions.map((item) => (
                <SelectItem key={item.id || "any"} value={item.id || "any"}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={onAdd} disabled={isAdding}>
          {isAdding ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Adding…
            </>
          ) : (
            <>Add keyword</>
          )}
        </Button>
        {showCancel && onCancel ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onCancel}
            disabled={isAdding}
          >
            Cancel
          </Button>
        ) : null}
      </div>
    </div>
  )
}

interface RemoveKeywordTrackingButtonProps {
  selectedKeywordId: number | null
  onRemove: (projectKeywordId: number) => Promise<void>
  onClosePane: () => void
}

function RemoveKeywordTrackingButton({
  selectedKeywordId,
  onRemove,
  onClosePane,
}: RemoveKeywordTrackingButtonProps) {
  const [open, setOpen] = useState(false)
  const [isRemoving, setIsRemoving] = useState(false)

  const handleConfirmRemove = async () => {
    if (!selectedKeywordId) return
    setIsRemoving(true)
    try {
      await onRemove(selectedKeywordId)
      toast({
        title: "Keyword tracking stopped",
        description:
          "We will keep historical data, but no new checks will run for this keyword.",
      })
      setOpen(false)
      onClosePane()
    } catch (error: any) {
      console.error("Error stopping keyword tracking:", error)
      toast({
        title: "Error stopping keyword tracking",
        description:
          error?.message || "Failed to stop keyword tracking.",
        variant: "destructive",
      })
    } finally {
      setIsRemoving(false)
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="destructive"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={!selectedKeywordId}
      >
        Remove tracking
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Stop tracking keyword</DialogTitle>
            <DialogDescription>
              Are you sure you want to stop tracking this keyword? Historical
              data will be kept, but no new ranking checks will run for this
              keyword.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isRemoving}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmRemove}
              disabled={isRemoving}
            >
              {isRemoving ? "Removing..." : "Stop tracking"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}





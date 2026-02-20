"use client"

import { useEffect, useMemo, useState } from "react"
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
import { Loader2, AlertCircle } from "lucide-react"
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

interface ProjectKeywordTrackingTabProps {
  projectId: number
}

type KeywordRow = {
  project_keyword_id: number
  project_id: number
  keyword: string
  language_code: string | null
  region_code: string | null
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

interface DateRangeValue {
  from?: Date
  to?: Date
}

const LANGUAGE_OPTIONS: { code: string; label: string }[] = [
  { code: "any", label: "Any" },
  { code: "EN", label: "English" },
  { code: "PT", label: "Portuguese" },
  { code: "ES", label: "Spanish" },
  { code: "FR", label: "French" },
  { code: "DE", label: "German" },
]

const getDefaultDateRange = (): DateRangeValue => {
  const today = new Date()
  const from = subDays(today, 29)
  return { from, to: today }
}

const formatShortDate = (dateStr: string) => {
  try {
    return format(new Date(dateStr), "MMM d")
  } catch {
    return dateStr
  }
}

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
}: ProjectKeywordTrackingTabProps) {
  const supabase = useMemo(() => createClient(), [])
  const queryClient = useQueryClient()
  const functionsClient = useMemo(() => createClientComponentClient(), [])
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [newKeyword, setNewKeyword] = useState("")
  const [newLanguage, setNewLanguage] = useState<string>("any")
  const [newRegion, setNewRegion] = useState<string>("any")
  const [isAdding, setIsAdding] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [selectedKeywordId, setSelectedKeywordId] = useState<number | null>(null)
  const [isDetailsOpen, setIsDetailsOpen] = useState(false)
  const [dateRange, setDateRange] = useState<DateRangeValue>(() =>
    getDefaultDateRange(),
  )
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
    try {
      const { data, error } = await (supabase as any).rpc(
        "fn_add_project_keyword",
        {
          p_project_id: projectId,
          p_keyword: newKeyword.trim(),
          p_language_code: newLanguage === "any" ? "" : newLanguage,
          p_region_code: newRegion === "any" ? "" : newRegion,
        },
      )

      if (error) {
        throw error
      }

      // Optimistically add to keyword list
      if (data?.id) {
        queryClient.setQueryData(
          ["project-keywords", projectId],
          (old: KeywordRow[] | undefined) => {
            if (!old) return old
            const newRow: KeywordRow = {
              project_keyword_id: data.id as number,
              project_id: projectId,
              keyword: data.keyword,
              language_code: data.language_code,
              region_code: data.region_code,
              is_active: true,
              created_at: data.created_at,
              updated_at: data.updated_at,
              rank: null,
              check_date: null,
              found_url: null,
              found_domain: null,
              top_results: null,
            }
            return [...old, newRow]
          },
        )
      }

      toast({
        title: "Keyword added",
        description: "Checking rankings for this project…",
      })

      setNewKeyword("")

      if (data?.id) {
        setSelectedKeywordId(data.id as number)
      }

      // Immediately trigger rankings sync for this project via Supabase functions API
      const { error: fnError } = await functionsClient.functions.invoke(
        "sync-project-keyword-rankings",
        { body: { project_id: projectId } },
      )

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

      await Promise.all([
        refetchKeywords(),
        refetchGlobal(),
        selectedKeywordId ? refetchKeywordSeries() : Promise.resolve(),
      ])

      toast({
        title: "Keyword added and rankings updated",
        description: "Latest rankings have been fetched for this project.",
      })
    } catch (error: any) {
      toast({
        title: "Error adding keyword",
        description: error?.message || "Failed to add keyword.",
        variant: "destructive",
      })
    } finally {
      setIsAdding(false)
    }
  }

  const handleSyncRankings = async () => {
    setIsSyncing(true)
    try {
      const { error: fnError } = await functionsClient.functions.invoke(
        "sync-project-keyword-rankings",
        { body: { project_id: projectId } },
      )

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

  const hasKeywords = !!keywords && keywords.length > 0
  const hasGlobalSeries = !!globalSeries && globalSeries.length > 0
  const hasKeywordSeries = !!keywordSeries && keywordSeries.length > 0

  const selectedKeywordRow = hasKeywords
    ? keywords!.find((row) => row.project_keyword_id === selectedKeywordId) || null
    : null

  // Auto-open details pane when landing on ?tab=keywords&keywordId=XYZ
  useEffect(() => {
    if (!isClient || !hasKeywords) return

    const keywordIdParam = searchParams.get("keywordId")
    const keywordId = keywordIdParam ? Number(keywordIdParam) : null
    if (!keywordId || Number.isNaN(keywordId)) return

    const exists = keywords!.some(
      (row) => row.project_keyword_id === keywordId,
    )
    if (!exists) return

    setSelectedKeywordId(keywordId)
    setIsDetailsOpen(true)
  }, [isClient, hasKeywords, keywords, searchParams])

  const detailsPane =
    selectedKeywordRow && isDetailsOpen && isClient
      ? createPortal(
          <div className="fixed top-0 right-0 w-96 bg-white border-l border-gray-200 flex flex-col h-screen z-40">
            {/* Header */}
            <div className="flex h-14 items-center justify-between border-b px-4">
              <h2 className="text-sm font-semibold truncate">Keyword details</h2>
              <button
                onClick={() => {
                  setIsDetailsOpen(false)
                  const params = new URLSearchParams(searchParams.toString())
                  params.delete("keywordId")
                  const query = params.toString()
                  router.replace(
                    query ? `${pathname}?${query}` : pathname,
                    { scroll: false },
                  )
                }}
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
              </div>

              <div className="flex items-center justify-end gap-2">
                <RemoveKeywordTrackingButton
                  projectId={projectId}
                  selectedKeywordId={selectedKeywordId}
                  supabase={supabase}
                  queryClient={queryClient}
                  onClosePane={() => {
                    setIsDetailsOpen(false)
                    const params = new URLSearchParams(searchParams.toString())
                    params.delete("keywordId")
                    const query = params.toString()
                    router.replace(
                      query ? `${pathname}?${query}` : pathname,
                      { scroll: false },
                    )
                  }}
                />
              </div>

              <div className="pt-4 flex-1 flex flex-col">
                <h4 className="mb-2 text-sm font-semibold text-gray-900">
                  Ranking history
                </h4>
                <div className="h-64">
                  {isLoadingKeywordSeries ? (
                    <div className="flex h-full items-center justify-center text-sm text-gray-500">
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Loading keyword rankings…
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
                          stroke="#7c3aed"
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

  const handleCloseDetails = () => {
    setIsDetailsOpen(false)
    const params = new URLSearchParams(searchParams.toString())
    params.delete("keywordId")
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    })
  }

  return (
    <>
      <div className="space-y-6">
      {/* Date range + global chart */}
      <div className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-900">
              Ranking evolution
            </h3>
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

        <Card className="p-4 md:p-6">
          <div className="mb-3">
            <h4 className="text-sm font-semibold text-gray-900">
              Global rankings
            </h4>
            <p className="text-[11px] text-gray-500">
              Best and average rank across all tracked keywords.
            </p>
          </div>
          <div className="h-64">
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
                <LineChart data={globalSeries}>
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
                  <Legend
                    formatter={(value) =>
                      value === "best_rank" ? "Best rank" : "Avg rank"
                    }
                  />
                  <Line
                    type="monotone"
                    dataKey="best_rank"
                    stroke="#2563eb"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="avg_rank"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      {/* Keyword list + add form + sync button */}
      <div className="flex flex-col gap-4 lg:flex-row">
        <Card className="flex-1 p-4 md:p-6">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-base font-semibold text-gray-900">
                Tracked keywords
              </h3>
              <p className="text-xs text-gray-500">
                Keywords currently being monitored for this project.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={handleSyncRankings}
                disabled={isSyncing}
              >
                {isSyncing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Checking rankings…
                  </>
                ) : (
                  <>Check rankings now</>
                )}
              </Button>
            </div>
          </div>

          {/* Add keyword form */}
          <div className="mb-4 grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="new-keyword" className="text-xs">
                Keyword
              </Label>
              <Input
                id="new-keyword"
                placeholder="e.g. best seo agency lisbon"
                value={newKeyword}
                onChange={(e) => setNewKeyword(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-language" className="text-xs">
                Language
              </Label>
              <Select
                value={newLanguage}
                onValueChange={(value) => setNewLanguage(value)}
              >
                <SelectTrigger id="new-language" className="h-8 text-xs">
                  <SelectValue placeholder="Any" />
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
              <Label htmlFor="new-region" className="text-xs">
                Region
              </Label>
              <Select
                value={newRegion}
                onValueChange={(value) => setNewRegion(value)}
              >
                <SelectTrigger id="new-region" className="h-8 text-xs">
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  {regions.map((region) => (
                    <SelectItem
                      key={region.id || "any"}
                      value={region.id || "any"}
                    >
                      {region.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="mb-4 flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={handleAddKeyword}
              disabled={isAdding}
            >
              {isAdding ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding…
                </>
              ) : (
                <>Add keyword</>
              )}
            </Button>
            <p className="text-[11px] text-gray-500">
              New keywords will be included the next time you check rankings.
            </p>
          </div>

          {/* Keyword list */}
          {isLoadingKeywords ? (
            <div className="flex items-center justify-center py-8 text-sm text-gray-500">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Loading keywords…
            </div>
          ) : keywordsError ? (
            <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertCircle className="h-4 w-4" />
              <span>Failed to load keywords.</span>
            </div>
          ) : !hasKeywords ? (
            <div className="rounded-md bg-gray-50 px-3 py-4 text-sm text-gray-600">
              No keywords being tracked yet. Add your first keyword to start
              tracking rankings.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="border-b bg-gray-50 text-[11px] font-medium uppercase text-gray-500">
                  <tr>
                    <th className="px-3 py-2">Keyword</th>
                    <th className="px-3 py-2">Language</th>
                    <th className="px-3 py-2">Region</th>
                    <th className="px-3 py-2 text-right">Last rank</th>
                    <th className="px-3 py-2">Ranking URL</th>
                    <th className="px-3 py-2 text-right">Last check</th>
                  </tr>
                </thead>
                <tbody>
                  {keywords!.map((row) => {
                    const isSelected = row.project_keyword_id === selectedKeywordId
                    return (
                      <tr
                        key={row.project_keyword_id}
                        className={`cursor-pointer border-b last:border-0 transition-colors hover:bg-gray-50 ${
                          isSelected ? "bg-blue-50/60" : ""
                        }`}
                        onClick={() => {
                          const id = row.project_keyword_id
                          setSelectedKeywordId(id)
                          setIsDetailsOpen(true)

                          const params = new URLSearchParams(
                            searchParams.toString(),
                          )
                          params.set("keywordId", String(id))
                          const query = params.toString()
                          router.replace(
                            query ? `${pathname}?${query}` : pathname,
                            { scroll: false },
                          )
                        }}
                      >
                        <td className="max-w-xs px-3 py-2 text-xs text-gray-900">
                          <span className="line-clamp-2">{row.keyword}</span>
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-700">
                          {mapLanguageName(row.language_code)}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-700">
                          {mapRegionName(row.region_code)}
                        </td>
                        <td className="px-3 py-2 text-right text-xs text-gray-900">
                          {row.rank != null ? `#${row.rank}` : "Not ranked"}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-700 max-w-xs">
                          {row.found_url ? (
                            <a
                              href={row.found_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 truncate inline-block max-w-[180px]"
                              title={row.found_url}
                            >
                              {shortenUrl(row.found_url)}
                            </a>
                          ) : (
                            <span className="text-gray-400">Not ranked</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right text-xs text-gray-600">
                          {row.check_date
                            ? format(new Date(row.check_date), "yyyy-MM-dd")
                            : "—"}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
      </div>
      {detailsPane}
    </>
  )
}

interface RemoveKeywordTrackingButtonProps {
  projectId: number
  selectedKeywordId: number | null
  supabase: any
  queryClient: any
  onClosePane: () => void
}

function RemoveKeywordTrackingButton({
  projectId,
  selectedKeywordId,
  supabase,
  queryClient,
  onClosePane,
}: RemoveKeywordTrackingButtonProps) {
  const [open, setOpen] = useState(false)
  const [isRemoving, setIsRemoving] = useState(false)

  const handleConfirmRemove = async () => {
    if (!selectedKeywordId) return
    setIsRemoving(true)
    try {
      const { error: deactivateError } = await supabase
        .from("project_keywords")
        .update({
          is_active: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", selectedKeywordId)

      if (deactivateError) {
        throw deactivateError
      }

      // Optimistically remove the keyword from the local list
      queryClient.setQueryData(
        ["project-keywords", projectId],
        (old: KeywordRow[] | undefined) =>
          old
            ? old.filter(
                (row) => row.project_keyword_id !== selectedKeywordId,
              )
            : old,
      )

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





"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertCircle, ExternalLink, Loader2, RefreshCw } from "lucide-react"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select"
import { toast } from "../ui/use-toast"
import {
  PROJECT_SITE_INDEX_STATUS_QUERY_KEY,
  PROJECT_SITE_PAGES_QUERY_KEY,
  fetchProjectSiteIndexStatus,
  fetchProjectSitePageFilterOptions,
  fetchProjectSitePages,
  isProjectSiteIndexRunActive,
  refreshProjectSiteIndex,
} from "@/lib/services/project-site-index"

type ProjectWebsiteIndexSectionProps = {
  projectId: number
  projectUrl: string | null
  /** Same gate as saving project details — edge function enforces `ai_assert_can_edit_project_v1`. */
  canEdit?: boolean
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatPageType(value: string | null): string {
  if (!value) return "—"
  return value.replace(/_/g, " ")
}

function refreshProgressLabel(args: {
  isRefreshing: boolean
  runStatus: string | null | undefined
  discovered: number | null
  enriched: number | null
}): string | null {
  if (!args.isRefreshing && !isProjectSiteIndexRunActive(args.runStatus)) return null
  if ((args.discovered ?? 0) > 0 && (args.enriched ?? 0) === 0) {
    return `Discovering pages… ${args.discovered} found`
  }
  if ((args.enriched ?? 0) > 0) {
    return `Enriching pages… ${args.enriched} of ${args.discovered ?? args.enriched}`
  }
  return "Discovering pages…"
}

export function ProjectWebsiteIndexSection({
  projectId,
  projectUrl,
  canEdit = true,
}: ProjectWebsiteIndexSectionProps) {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [pageType, setPageType] = useState<string>("all")
  const [languageCode, setLanguageCode] = useState<string>("all")
  const [activeOnly, setActiveOnly] = useState(true)
  const [page, setPage] = useState(1)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const pageSize = 25

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, pageType, languageCode, activeOnly])

  const statusQuery = useQuery({
    queryKey: [PROJECT_SITE_INDEX_STATUS_QUERY_KEY, projectId],
    queryFn: () => fetchProjectSiteIndexStatus(projectId),
    enabled: Boolean(projectId && projectUrl),
    refetchInterval: (query) => {
      const status = query.state.data?.latest_run?.status
      return isProjectSiteIndexRunActive(status) || isRefreshing ? 4000 : false
    },
  })

  const pagesQuery = useQuery({
    queryKey: [
      PROJECT_SITE_PAGES_QUERY_KEY,
      projectId,
      debouncedSearch,
      pageType,
      languageCode,
      activeOnly,
      page,
      pageSize,
    ],
    queryFn: () =>
      fetchProjectSitePages({
        projectId,
        search: debouncedSearch,
        pageType: pageType === "all" ? null : pageType,
        languageCode: languageCode === "all" ? null : languageCode,
        activeOnly,
        page,
        pageSize,
      }),
    enabled: Boolean(projectId && projectUrl),
  })

  const filterOptionsQuery = useQuery({
    queryKey: [PROJECT_SITE_PAGES_QUERY_KEY, "filters", projectId],
    queryFn: () => fetchProjectSitePageFilterOptions(projectId),
    enabled: Boolean(projectId && projectUrl),
  })

  const latestRun = statusQuery.data?.latest_run ?? null
  const runIsActive = isProjectSiteIndexRunActive(latestRun?.status) || isRefreshing
  const progressLabel = refreshProgressLabel({
    isRefreshing,
    runStatus: latestRun?.status,
    discovered: latestRun?.discovered_count ?? null,
    enriched: latestRun?.enriched_count ?? null,
  })

  const totalPages = useMemo(() => {
    const total = pagesQuery.data?.total ?? 0
    return Math.max(1, Math.ceil(total / pageSize))
  }, [pagesQuery.data?.total])

  const invalidateIndexQueries = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: [PROJECT_SITE_INDEX_STATUS_QUERY_KEY, projectId] }),
      queryClient.invalidateQueries({ queryKey: [PROJECT_SITE_PAGES_QUERY_KEY, projectId] }),
      queryClient.invalidateQueries({ queryKey: [PROJECT_SITE_PAGES_QUERY_KEY, "filters", projectId] }),
    ])
  }, [projectId, queryClient])

  const handleRefresh = useCallback(async () => {
    if (!canEdit || runIsActive || !projectUrl) return
    setIsRefreshing(true)
    setRefreshError(null)
    try {
      const result = await refreshProjectSiteIndex({ projectId })
      if (!result.ok) {
        setRefreshError(result.error ?? "Refresh failed")
        toast({
          title: "Website index refresh failed",
          description: result.error ?? "Please try again.",
          variant: "destructive",
        })
        return
      }
      toast({
        title: "Website index refreshed",
        description: `Discovered ${result.discovered_count ?? 0} pages · enriched ${result.enriched_count ?? 0}.`,
      })
      await invalidateIndexQueries()
    } catch (error) {
      const message = error instanceof Error ? error.message : "Refresh failed"
      setRefreshError(message)
      toast({
        title: "Website index refresh failed",
        description: message,
        variant: "destructive",
      })
    } finally {
      setIsRefreshing(false)
    }
  }, [canEdit, invalidateIndexQueries, projectId, projectUrl, runIsActive])

  if (!projectUrl?.trim()) {
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-gray-900">Website index</h3>
        <p className="text-xs text-gray-500">
          Add a project URL in Details to map and enrich pages for internal linking.
        </p>
      </div>
    )
  }

  const lastFailed =
    latestRun?.status === "failed"
      ? (latestRun.error_message || latestRun.error_code || "Last refresh failed")
      : null

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h3 className="text-sm font-medium text-gray-900">Website index</h3>
        <p className="text-xs text-gray-500">
          Firecrawl map + enrich catalogue used for natural internal linking. Refresh remains the
          source of truth — pages are not edited manually here.
        </p>
      </div>

      <div className="grid gap-3 rounded-lg border border-gray-200 bg-white p-3 text-sm sm:grid-cols-2">
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
            Project URL
          </div>
          <a
            href={projectUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-0.5 inline-flex max-w-full items-center gap-1 truncate text-gray-900 underline-offset-2 hover:underline"
          >
            <span className="truncate">{projectUrl}</span>
            <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
          </a>
        </div>
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
            Active pages
          </div>
          <div className="mt-0.5 font-medium tabular-nums text-gray-900">
            {statusQuery.isLoading ? "…" : (statusQuery.data?.active_page_count ?? 0)}
          </div>
        </div>
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
            Last refresh status
          </div>
          <div className="mt-0.5 font-medium capitalize text-gray-900">
            {latestRun?.status ?? (statusQuery.isLoading ? "…" : "Never run")}
          </div>
        </div>
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
            Last refresh time
          </div>
          <div className="mt-0.5 text-gray-900">
            {formatDateTime(latestRun?.completed_at ?? latestRun?.started_at)}
          </div>
        </div>
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
            Discovered
          </div>
          <div className="mt-0.5 tabular-nums text-gray-900">
            {latestRun?.discovered_count ?? 0}
          </div>
        </div>
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
            Enriched
          </div>
          <div className="mt-0.5 tabular-nums text-gray-900">
            {latestRun?.enriched_count ?? 0}
          </div>
        </div>
      </div>

      {(lastFailed || refreshError) ? (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <div className="min-w-0 break-words [overflow-wrap:anywhere]">
            {refreshError || lastFailed}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          size="sm"
          onClick={() => void handleRefresh()}
          disabled={!canEdit || runIsActive || statusQuery.isLoading}
        >
          {runIsActive ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          )}
          Refresh website index
        </Button>
        {progressLabel ? (
          <span className="text-xs text-gray-600">{progressLabel}</span>
        ) : null}
        {!canEdit ? (
          <span className="text-xs text-gray-500">You need project edit access to refresh.</span>
        ) : null}
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[180px] flex-1 space-y-1">
            <Label htmlFor="website-index-search">Search</Label>
            <Input
              id="website-index-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Title, URL, summary…"
            />
          </div>
          <div className="w-[150px] space-y-1">
            <Label>Page type</Label>
            <Select value={pageType} onValueChange={setPageType}>
              <SelectTrigger>
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {(filterOptionsQuery.data?.pageTypes ?? []).map((type) => (
                  <SelectItem key={type} value={type}>
                    {formatPageType(type)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-[140px] space-y-1">
            <Label>Language</Label>
            <Select value={languageCode} onValueChange={setLanguageCode}>
              <SelectTrigger>
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {(filterOptionsQuery.data?.languages ?? []).map((code) => (
                  <SelectItem key={code} value={code}>
                    {code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="mb-2 flex items-center gap-2 text-xs text-gray-700">
            <input
              type="checkbox"
              checked={activeOnly}
              onChange={(event) => setActiveOnly(event.target.checked)}
              className="rounded border-gray-300"
            />
            Active only
          </label>
        </div>

        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2 font-medium">Title</th>
                <th className="px-3 py-2 font-medium">URL</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Lang</th>
                <th className="px-3 py-2 font-medium">Summary</th>
                <th className="px-3 py-2 font-medium">Scraped / seen</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {pagesQuery.isLoading ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-gray-500">
                    <Loader2 className="mx-auto h-4 w-4 animate-spin" aria-hidden />
                  </td>
                </tr>
              ) : (pagesQuery.data?.rows.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-gray-500">
                    No indexed pages yet. Refresh the website index to map the site.
                  </td>
                </tr>
              ) : (
                pagesQuery.data!.rows.map((row) => (
                  <tr key={row.id} className="border-t border-gray-100 align-top">
                    <td className="max-w-[160px] px-3 py-2 text-gray-900">
                      <span className="line-clamp-2 break-words">
                        {row.title?.trim() || "Untitled"}
                      </span>
                    </td>
                    <td className="max-w-[200px] px-3 py-2">
                      <a
                        href={row.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="line-clamp-2 break-all text-gray-800 underline-offset-2 hover:underline"
                      >
                        {row.url}
                      </a>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 capitalize text-gray-700">
                      {formatPageType(row.page_type)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-gray-700">
                      {row.language_code || "—"}
                    </td>
                    <td className="max-w-[220px] px-3 py-2 text-gray-600">
                      <span className="line-clamp-2 break-words">
                        {row.summary?.trim() || "—"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-gray-600">
                      <div>{formatDateTime(row.scraped_at)}</div>
                      <div className="text-[11px] text-gray-400">
                        seen {formatDateTime(row.last_seen_at)}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-gray-700">
                      {row.is_active ? "Active" : "Inactive"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between gap-3 text-xs text-gray-600">
          <span>
            {pagesQuery.data
              ? `${pagesQuery.data.total} page${pagesQuery.data.total === 1 ? "" : "s"}`
              : null}
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1 || pagesQuery.isFetching}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              Previous
            </Button>
            <span className="tabular-nums">
              {page} / {totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= totalPages || pagesQuery.isFetching}
              onClick={() => setPage((value) => value + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

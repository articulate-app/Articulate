"use client"

import { useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { format, subDays } from "date-fns"
import { Loader2, RefreshCw } from "lucide-react"
import { Button } from "../ui/button"
import { Card } from "../ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs"
import { toast } from "../ui/use-toast"
import { ProjectAnalyticsTab } from "./ProjectAnalyticsTab"
import { ProjectGoogleIntegrationsSection } from "./project-google-integrations-section"
import { ProjectSearchOverviewSection } from "./project-search-overview-section"
import {
  enqueueSitePageInspection,
  getProjectIndexationSummary,
  getProjectSearchPages,
  getProjectSearchQueries,
  getProjectSearchSitemaps,
  syncProjectSearchConsole,
} from "@/lib/services/project-search-console"

const numberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 })
const percentFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 1,
})
const positionFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 })

function formatCount(value: number | null | undefined) {
  return value == null ? "—" : numberFormatter.format(value)
}
function formatCtr(value: number | null | undefined) {
  return value == null ? "—" : percentFormatter.format(value)
}
function formatPosition(value: number | null | undefined) {
  return value == null ? "—" : positionFormatter.format(value)
}

function MetricsTable({
  rows,
  labelHeader,
  labelKey,
}: {
  rows: Array<Record<string, unknown>>
  labelHeader: string
  labelKey: string
}) {
  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-gray-500">
        No Search Console data for this period.
      </p>
    )
  }
  return (
    <div className="overflow-x-auto rounded-md border border-gray-200">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b bg-gray-50 text-xs font-medium uppercase text-gray-500">
          <tr>
            <th className="px-4 py-2">{labelHeader}</th>
            <th className="px-4 py-2 text-right">Clicks</th>
            <th className="px-4 py-2 text-right">Impressions</th>
            <th className="px-4 py-2 text-right">CTR</th>
            <th className="px-4 py-2 text-right">Avg. position</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={String(row[labelKey])} className="border-b last:border-0">
              <td className="max-w-md truncate px-4 py-2" title={String(row[labelKey])}>
                {String(row[labelKey])}
              </td>
              <td className="px-4 py-2 text-right">{formatCount(Number(row.clicks))}</td>
              <td className="px-4 py-2 text-right">{formatCount(Number(row.impressions))}</td>
              <td className="px-4 py-2 text-right">
                {formatCtr(row.ctr == null ? null : Number(row.ctr))}
              </td>
              <td className="px-4 py-2 text-right">
                {formatPosition(
                  row.position_avg == null ? null : Number(row.position_avg),
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ProjectSeoSearchTab({
  projectId,
  initialSubTab = "overview",
}: {
  projectId: number
  initialSubTab?: string
}) {
  const queryClient = useQueryClient()
  const [subTab, setSubTab] = useState(initialSubTab)
  const [isSyncing, setIsSyncing] = useState(false)

  const range = useMemo(() => {
    const to = subDays(new Date(), 1)
    const from = subDays(to, 27)
    return { from, to }
  }, [])

  const queriesQuery = useQuery({
    queryKey: ["project-search-queries", projectId, format(range.from, "yyyy-MM-dd")],
    enabled: subTab === "queries",
    queryFn: () =>
      getProjectSearchQueries({
        projectId,
        dateFrom: range.from,
        dateTo: range.to,
        limit: 100,
      }),
  })

  const pagesQuery = useQuery({
    queryKey: ["project-search-pages", projectId, format(range.from, "yyyy-MM-dd")],
    enabled: subTab === "pages",
    queryFn: () =>
      getProjectSearchPages({
        projectId,
        dateFrom: range.from,
        dateTo: range.to,
        limit: 100,
      }),
  })

  const indexationQuery = useQuery({
    queryKey: ["project-indexation-summary", projectId],
    enabled: subTab === "indexation",
    queryFn: () => getProjectIndexationSummary(projectId),
  })

  const sitemapsQuery = useQuery({
    queryKey: ["project-search-sitemaps", projectId],
    enabled: subTab === "sitemaps",
    queryFn: () => getProjectSearchSitemaps(projectId),
  })

  async function handleSync() {
    setIsSyncing(true)
    try {
      const result = await syncProjectSearchConsole({
        projectId,
        jobType: "all",
        trigger: "manual",
      })
      if (!result.ok) throw new Error(result.error || "Sync failed")
      toast({ title: "Search Console sync started" })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["project-search-overview", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["project-search-queries", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["project-search-pages", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["project-indexation-summary", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["project-search-sitemaps", projectId] }),
      ])
    } catch (error) {
      toast({
        title: "Sync failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      setIsSyncing(false)
    }
  }

  async function handleInspectUrl() {
    const url = window.prompt("URL to inspect (must belong to the connected property)")
    if (!url) return
    try {
      const result = await enqueueSitePageInspection({ projectId, url })
      toast({
        title: "Inspection queued",
        description: result.url || url,
      })
      await syncProjectSearchConsole({
        projectId,
        jobType: "url_inspection",
        trigger: "manual",
      })
      await queryClient.invalidateQueries({
        queryKey: ["project-indexation-summary", projectId],
      })
    } catch (error) {
      toast({
        title: "Could not queue inspection",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">SEO & search</h2>
          <p className="text-sm text-gray-500">
            Google Search Console performance, monitored-page indexation and sitemaps.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={isSyncing}
          onClick={() => void handleSync()}
        >
          {isSyncing ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          )}
          Sync Search Console
        </Button>
      </div>

      <Tabs value={subTab} onValueChange={setSubTab}>
        <TabsList className="flex h-auto flex-wrap justify-start gap-1 bg-transparent p-0">
          {[
            ["overview", "Overview"],
            ["queries", "Queries"],
            ["pages", "Pages"],
            ["indexation", "Indexation"],
            ["sitemaps", "Sitemaps"],
            ["analytics", "Analytics"],
            ["integrations", "Integrations"],
          ].map(([value, label]) => (
            <TabsTrigger
              key={value}
              value={value}
              className="rounded-md border border-transparent px-3 py-1.5 text-xs data-[state=active]:border-gray-200 data-[state=active]:bg-white"
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <ProjectSearchOverviewSection projectId={projectId} variant="full" />
        </TabsContent>

        <TabsContent value="queries" className="mt-4 space-y-3">
          <p className="text-xs text-gray-500">
            {queriesQuery.data?.coverage_note
              || "Query–page associations from Search Console may be partial."}
          </p>
          {queriesQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading queries…
            </div>
          ) : (
            <MetricsTable
              rows={(queriesQuery.data?.rows ?? []) as Array<Record<string, unknown>>}
              labelHeader="Query"
              labelKey="query"
            />
          )}
        </TabsContent>

        <TabsContent value="pages" className="mt-4 space-y-3">
          <p className="text-xs text-gray-500">
            Search metrics come from Google Search Console. Analytics metrics stay in the
            Analytics tab and are never mixed into competitor comparisons.
          </p>
          {pagesQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading pages…
            </div>
          ) : (
            <MetricsTable
              rows={(pagesQuery.data?.rows ?? []) as Array<Record<string, unknown>>}
              labelHeader="Page"
              labelKey="page"
            />
          )}
        </TabsContent>

        <TabsContent value="indexation" className="mt-4 space-y-4">
          <Card className="p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">
                  Monitored page indexation
                </h3>
                <p className="mt-1 text-xs text-gray-500">
                  {indexationQuery.data?.note
                    || "Indexation status covers monitored project pages only."}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => void handleInspectUrl()}>
                Inspect now
              </Button>
            </div>
            {indexationQuery.isLoading ? (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading indexation…
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {Object.entries({
                  Monitored: indexationQuery.data?.indexation?.monitored_pages,
                  Indexed: indexationQuery.data?.indexation?.indexed,
                  "Not indexed": indexationQuery.data?.indexation?.not_indexed,
                  "With issues": indexationQuery.data?.indexation?.with_issues,
                  "Not inspected": indexationQuery.data?.indexation?.not_inspected,
                  Inspected: indexationQuery.data?.indexation?.inspected,
                }).map(([label, value]) => (
                  <div key={label} className="rounded-md bg-gray-50 px-3 py-2">
                    <p className="text-[11px] text-gray-500">{label}</p>
                    <p className="text-sm font-semibold text-gray-900">
                      {formatCount(value == null ? null : Number(value))}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="sitemaps" className="mt-4 space-y-3">
          <p className="text-xs text-gray-500">
            {sitemapsQuery.data?.note
              || "Read-only sitemap status. Deprecated indexed-URL counts are not used."}
          </p>
          {sitemapsQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading sitemaps…
            </div>
          ) : (sitemapsQuery.data?.rows.length ?? 0) === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">
              No sitemaps synced yet.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-gray-200">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b bg-gray-50 text-xs font-medium uppercase text-gray-500">
                  <tr>
                    <th className="px-4 py-2">Sitemap</th>
                    <th className="px-4 py-2">Type</th>
                    <th className="px-4 py-2 text-right">Submitted URLs</th>
                    <th className="px-4 py-2 text-right">Warnings</th>
                    <th className="px-4 py-2 text-right">Errors</th>
                    <th className="px-4 py-2">Last download</th>
                  </tr>
                </thead>
                <tbody>
                  {(sitemapsQuery.data?.rows ?? []).map((row) => (
                    <tr key={String(row.id)} className="border-b last:border-0">
                      <td className="max-w-md truncate px-4 py-2" title={String(row.path)}>
                        {String(row.path)}
                      </td>
                      <td className="px-4 py-2">{String(row.sitemap_type ?? "—")}</td>
                      <td className="px-4 py-2 text-right">
                        {formatCount(
                          row.submitted_urls_count == null
                            ? null
                            : Number(row.submitted_urls_count),
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {formatCount(
                          row.warnings_count == null ? null : Number(row.warnings_count),
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {formatCount(
                          row.errors_count == null ? null : Number(row.errors_count),
                        )}
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-600">
                        {row.last_downloaded_at
                          ? new Date(String(row.last_downloaded_at)).toLocaleString()
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="analytics" className="mt-4">
          <ProjectAnalyticsTab projectId={projectId} />
        </TabsContent>

        <TabsContent value="integrations" className="mt-4">
          <ProjectGoogleIntegrationsSection projectId={projectId} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

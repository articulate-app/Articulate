"use client"

import { useMemo, useState } from "react"
import { format } from "date-fns"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertCircle, Loader2, RefreshCw } from "lucide-react"

import { Card } from "../ui/card"
import { Button } from "../ui/button"
import { toast } from "../ui/use-toast"
import { GoogleConnectPanel } from "./google-connect-panel"
import { isGoogleOAuthConnectEnabledInMainUi } from "@/lib/google-oauth-feature"
import {
  getSearchConsoleBreakdown,
  type SearchConsoleBreakdown,
  type SearchConsoleBreakdownRow,
} from "@/lib/services/project-competitive-content"
import { syncProjectSearchConsole } from "@/lib/services/project-search-console"

type BreakdownTab = "queries" | "pages"

export interface ProjectSearchConsoleSectionProps {
  projectId: number
  dateRange: { from: Date; to: Date }
}

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
})

const percentFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 1,
})

const positionFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
})

const formatCount = (value: number | null | undefined): string =>
  value == null ? "—" : numberFormatter.format(Number(value))

const formatCtr = (value: number | null | undefined): string =>
  value == null ? "—" : percentFormatter.format(Number(value))

const formatPosition = (value: number | null | undefined): string =>
  value == null ? "—" : positionFormatter.format(Number(value))

function BreakdownTable({
  rows,
  labelHeader,
}: {
  rows: SearchConsoleBreakdownRow[]
  labelHeader: string
}) {
  if (rows.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-gray-500">
        No Search Console data for the selected range.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
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
            <tr key={row.label} className="border-b last:border-0">
              <td className="max-w-md truncate px-4 py-2 text-sm text-gray-900" title={row.label}>
                {row.label}
              </td>
              <td className="px-4 py-2 text-right text-sm">{formatCount(row.clicks)}</td>
              <td className="px-4 py-2 text-right text-sm">
                {formatCount(row.impressions)}
              </td>
              <td className="px-4 py-2 text-right text-sm">{formatCtr(row.ctr)}</td>
              <td className="px-4 py-2 text-right text-sm">
                {formatPosition(row.position_avg)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ProjectSearchConsoleSection({
  projectId,
  dateRange,
}: ProjectSearchConsoleSectionProps) {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<BreakdownTab>("queries")
  const [isSyncing, setIsSyncing] = useState(false)

  const dateFrom = useMemo(() => format(dateRange.from, "yyyy-MM-dd"), [dateRange.from])
  const dateTo = useMemo(() => format(dateRange.to, "yyyy-MM-dd"), [dateRange.to])

  const queryKey = ["project-search-console-breakdown", projectId, dateFrom, dateTo]

  const { data, isLoading, error } = useQuery<SearchConsoleBreakdown>({
    queryKey,
    enabled: !!projectId,
    queryFn: () =>
      getSearchConsoleBreakdown({ projectId, dateFrom, dateTo, limit: 25 }),
  })

  const property = data?.properties?.[0] ?? null
  const totals = data?.totals ?? null
  const rows = activeTab === "queries" ? data?.queries ?? [] : data?.pages ?? []

  async function handleSync() {
    setIsSyncing(true)
    try {
      const result = await syncProjectSearchConsole({
        projectId,
        jobType: "performance",
        trigger: "manual",
      })
      if (!result.ok) {
        throw new Error(result.error || "Search Console sync failed")
      }
      await queryClient.invalidateQueries({ queryKey })
      await queryClient.invalidateQueries({
        queryKey: ["project-search-overview", projectId],
      })
      toast({ title: "Search Console synced" })
    } catch (syncError) {
      toast({
        title: "Search Console sync failed",
        description:
          syncError instanceof Error ? syncError.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      setIsSyncing(false)
    }
  }

  return (
    <Card className="p-4 md:p-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-gray-900">Search Console</h3>
          <p className="text-xs text-gray-500">
            {property
              ? `Keywords and pages from ${property.property_url}.`
              : "Connect Google Search Console to see which keywords and pages bring you traffic."}
          </p>
        </div>
        {data?.connected ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void handleSync()}
            disabled={isSyncing}
          >
            {isSyncing ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
            )}
            Sync now
          </Button>
        ) : null}
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading Search Console data…</span>
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 py-8 text-sm text-red-600">
          <AlertCircle className="h-4 w-4" />
          <span>
            {error instanceof Error ? error.message : "Failed to load Search Console data"}
          </span>
        </div>
      ) : !data?.connected ? (
        isGoogleOAuthConnectEnabledInMainUi() ? (
          <GoogleConnectPanel projectId={projectId} />
        ) : (
          <p className="py-4 text-xs text-gray-500">
            Search Console is not connected for this project.
          </p>
        )
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="text-xs font-medium text-gray-500">Clicks</div>
              <div className="mt-1 text-2xl font-semibold">
                {formatCount(totals?.clicks)}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-gray-500">Impressions</div>
              <div className="mt-1 text-2xl font-semibold">
                {formatCount(totals?.impressions)}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-gray-500">CTR</div>
              <div className="mt-1 text-2xl font-semibold">{formatCtr(totals?.ctr)}</div>
            </div>
            <div>
              <div className="text-xs font-medium text-gray-500">Avg. position</div>
              <div className="mt-1 text-2xl font-semibold">
                {formatPosition(totals?.position_avg)}
              </div>
            </div>
          </div>

          {property?.last_sync_error ? (
            <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="break-words">{property.last_sync_error}</span>
            </div>
          ) : null}

          <div className="flex items-center gap-1 border-b border-gray-100">
            {(["queries", "pages"] as BreakdownTab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={
                  activeTab === tab
                    ? "-mb-px border-b-2 border-gray-900 px-3 py-2 text-xs font-medium text-gray-900"
                    : "-mb-px border-b-2 border-transparent px-3 py-2 text-xs font-medium text-gray-500 hover:text-gray-900"
                }
              >
                {tab === "queries" ? "Top keywords" : "Top pages"}
              </button>
            ))}
          </div>

          <BreakdownTable
            rows={rows}
            labelHeader={activeTab === "queries" ? "Keyword" : "Page"}
          />

          {property?.last_synced_at ? (
            <p className="text-[11px] text-gray-500">
              Last synced {format(new Date(property.last_synced_at), "MMM d, yyyy HH:mm")}.
            </p>
          ) : null}
        </div>
      )}
    </Card>
  )
}

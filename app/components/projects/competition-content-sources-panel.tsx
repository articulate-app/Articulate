"use client"

import { useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  AlertCircle,
  Globe,
  Loader2,
  RefreshCw,
} from "lucide-react"
import { Button } from "../ui/button"
import { Card } from "../ui/card"
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
  CONTENT_SOURCE_STATUS_LABELS,
  CONTENT_SOURCE_TYPE_LABELS,
  CONTENT_SOURCE_TYPES,
  type ContentSourceStatus,
  type ContentSourceType,
} from "@/lib/competitive-content"
import {
  PROJECT_COMPETITIVE_SOURCES_QUERY_KEY,
  PROJECT_COMPETITIVE_WEBSITES_QUERY_KEY,
  PROJECT_SEARCH_CONSOLE_QUERY_KEY,
  createManualContentSource,
  deleteSearchConsoleProperty,
  discoverEditorialSources,
  listProjectCompetitiveSources,
  listProjectCompetitiveWebsites,
  listSearchConsoleProperties,
  syncCompetitiveContent,
  updateContentSource,
  upsertSearchConsoleProperty,
  type ProjectCompetitiveContentSource,
  type ProjectCompetitiveWebsite,
} from "@/lib/services/project-competitive-content"
import type { ProjectCompetitorWithProfiles } from "@/lib/services/project-competitors"
import { faviconUrlForSite } from "@/lib/favicon"
import { GoogleConnectPanel } from "./google-connect-panel"
import { isGoogleOAuthConnectEnabledInMainUi } from "@/lib/google-oauth-feature"

export function CompetitionContentSourcesPanel({
  projectId,
  competitors,
}: {
  projectId: number
  competitors: ProjectCompetitorWithProfiles[]
}) {
  const queryClient = useQueryClient()
  const [isDiscovering, setIsDiscovering] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [manualSourceUrl, setManualSourceUrl] = useState("")
  const [manualWebsiteId, setManualWebsiteId] = useState<string>("")
  const [manualSourceType, setManualSourceType] = useState<ContentSourceType>("blog")
  const [gscPropertyUrl, setGscPropertyUrl] = useState("")
  const [isSavingGsc, setIsSavingGsc] = useState(false)

  const {
    data: websites = [],
    isLoading: websitesLoading,
    refetch: refetchWebsites,
  } = useQuery({
    queryKey: [PROJECT_COMPETITIVE_WEBSITES_QUERY_KEY, projectId],
    queryFn: () => listProjectCompetitiveWebsites(projectId),
  })

  const {
    data: sources = [],
    isLoading: sourcesLoading,
    refetch: refetchSources,
  } = useQuery({
    queryKey: [PROJECT_COMPETITIVE_SOURCES_QUERY_KEY, projectId],
    queryFn: () => listProjectCompetitiveSources(projectId),
  })

  const { data: gscProperties = [], refetch: refetchGsc } = useQuery({
    queryKey: [PROJECT_SEARCH_CONSOLE_QUERY_KEY, projectId],
    queryFn: () => listSearchConsoleProperties(projectId),
  })

  const competitorNameById = useMemo(() => {
    const map = new Map<number, string>()
    for (const competitor of competitors) map.set(competitor.id, competitor.name)
    return map
  }, [competitors])

  async function invalidateContent() {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: [PROJECT_COMPETITIVE_WEBSITES_QUERY_KEY, projectId],
      }),
      queryClient.invalidateQueries({
        queryKey: [PROJECT_COMPETITIVE_SOURCES_QUERY_KEY, projectId],
      }),
      queryClient.invalidateQueries({
        queryKey: [PROJECT_SEARCH_CONSOLE_QUERY_KEY, projectId],
      }),
    ])
  }

  async function handleDiscover() {
    setIsDiscovering(true)
    try {
      const result = await discoverEditorialSources({ projectId })
      await invalidateContent()
      if (!result.ok) {
        toast({
          title: "Discovery finished with issues",
          description: result.error ?? "Some websites failed.",
          variant: "destructive",
        })
      } else {
        toast({
          title: "Editorial source discovery finished",
          description: "Review the detected sources below, then sync articles.",
        })
      }
    } catch (error) {
      toast({
        title: "Discovery failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      setIsDiscovering(false)
    }
  }

  async function handleSyncArticles() {
    setIsSyncing(true)
    try {
      const result = await syncCompetitiveContent({
        projectId,
        runType: "daily",
      })
      await invalidateContent()
      if (!result.ok) {
        toast({
          title: "Content sync issues",
          description: result.error ?? "Partial failure.",
          variant: "destructive",
        })
      } else {
        toast({ title: "Content sync completed" })
      }
    } catch (error) {
      toast({
        title: "Content sync failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      setIsSyncing(false)
    }
  }

  async function handleSourceStatus(sourceId: number, status: ContentSourceStatus) {
    try {
      await updateContentSource(sourceId, { status, is_manual_override: true })
      await refetchSources()
    } catch (error) {
      toast({
        title: "Could not update source",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      })
    }
  }

  async function handleAddManualSource() {
    const websiteId = Number(manualWebsiteId)
    if (!websiteId || !manualSourceUrl.trim()) {
      toast({
        title: "Missing fields",
        description: "Select a website and enter a source URL.",
        variant: "destructive",
      })
      return
    }
    const website = websites.find((row) => row.id === websiteId)
    if (!website) return
    try {
      await createManualContentSource({
        projectId,
        websiteId,
        entityType: website.entity_type,
        competitorId: website.competitor_id,
        sourceUrl: manualSourceUrl.trim(),
        sourceType: manualSourceType,
      })
      setManualSourceUrl("")
      await refetchSources()
      toast({ title: "Editorial source added" })
    } catch (error) {
      toast({
        title: "Could not add source",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      })
    }
  }

  async function handleSaveGsc() {
    if (!gscPropertyUrl.trim()) return
    setIsSavingGsc(true)
    try {
      await upsertSearchConsoleProperty({
        projectId,
        propertyUrl: gscPropertyUrl.trim(),
      })
      setGscPropertyUrl("")
      await refetchGsc()
      toast({
        title: "Search Console property saved",
        description:
          "Ensure the platform Google account has access, then run content sync.",
      })
    } catch (error) {
      toast({
        title: "Could not save Search Console property",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      setIsSavingGsc(false)
    }
  }

  const isLoading = websitesLoading || sourcesLoading

  const competitorWebsites = websites.filter(
    (website) => website.entity_type === "competitor",
  )

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">
            Content & SEO monitoring
          </h3>
          <p className="mt-1 text-xs text-gray-500">
            Articles are collected automatically from the websites above. Nothing to
            configure.
          </p>
        </div>
        <Button size="sm" onClick={() => void handleSyncArticles()} disabled={isSyncing}>
          {isSyncing ? (
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
          )}
          Sync articles
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading content configuration…
        </div>
      ) : null}

      <Card className="space-y-3 p-4">
        {competitorWebsites.length === 0 ? (
          <div className="flex items-start gap-2 text-sm text-gray-500">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Add a competitor above to start tracking their articles.
            </p>
          </div>
        ) : (
          <>
            <ul className="space-y-2">
              {competitorWebsites.map((website) => {
                const favicon = faviconUrlForSite(website.root_url)
                const sourceCount = sources.filter(
                  (source) => source.website_id === website.id,
                ).length
                return (
                  <li
                    key={website.id}
                    className="flex items-center gap-2 rounded-md border border-gray-100 px-3 py-2 text-sm"
                  >
                    {favicon ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={favicon}
                        alt=""
                        width={16}
                        height={16}
                        loading="lazy"
                        className="h-4 w-4 shrink-0 rounded-sm"
                      />
                    ) : (
                      <Globe className="h-4 w-4 shrink-0 text-gray-400" />
                    )}
                    <span className="truncate font-medium text-gray-900">
                      {competitorNameById.get(website.competitor_id ?? -1) ??
                        website.normalized_domain}
                    </span>
                    <span className="ml-auto shrink-0 text-xs text-gray-500">
                      {sourceCount} section(s) tracked
                    </span>
                  </li>
                )
              })}
            </ul>
            <AdvancedSourcesDisclosure
              sources={sources}
              websites={websites}
              competitorNameById={competitorNameById}
              isDiscovering={isDiscovering}
              manualWebsiteId={manualWebsiteId}
              manualSourceUrl={manualSourceUrl}
              manualSourceType={manualSourceType}
              onManualWebsiteIdChange={setManualWebsiteId}
              onManualSourceUrlChange={setManualSourceUrl}
              onManualSourceTypeChange={setManualSourceType}
              onDiscover={handleDiscover}
              onSourceStatus={handleSourceStatus}
              onAddManualSource={handleAddManualSource}
            />
          </>
        )}
      </Card>

      <Card className="space-y-3 p-4">
        <div>
          <h4 className="text-sm font-medium text-gray-900">Google Search Console & Analytics</h4>
          <p className="mt-0.5 text-xs text-gray-500">
            One-click connect with your Google account. Owned-only metrics for this project
            (not used for competitor rankings).
          </p>
        </div>
        {isGoogleOAuthConnectEnabledInMainUi() ? (
          <GoogleConnectPanel
            projectId={projectId}
            onConnected={() => {
              void refetchGsc()
              void invalidateContent()
            }}
          />
        ) : (
          <p className="text-xs text-amber-700">
            One-click Google connect is available on the hidden verification route
            while scopes are under Google review (not exposed in main product UI).
          </p>
        )}
        {gscProperties.length > 0 ? (
          <ul className="space-y-2">
            {gscProperties.map((property) => (
              <li
                key={property.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-gray-100 px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-medium text-gray-900">{property.property_url}</p>
                  <p className="text-xs text-gray-500">
                    {property.last_sync_status ?? "Never synced"}
                    {property.last_sync_error ? ` · ${property.last_sync_error}` : ""}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    void deleteSearchConsoleProperty(property.id).then(() => refetchGsc())
                  }
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        <details className="text-xs text-gray-500">
          <summary className="cursor-pointer text-gray-600">Advanced: paste property URL</summary>
          <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Property URL</Label>
              <Input
                value={gscPropertyUrl}
                onChange={(event) => setGscPropertyUrl(event.target.value)}
                placeholder="https://www.example.com/ or sc-domain:example.com"
              />
            </div>
            <div className="flex items-end">
              <Button
                variant="outline"
                disabled={isSavingGsc}
                onClick={() => void handleSaveGsc()}
              >
                {isSavingGsc ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                Save property
              </Button>
            </div>
          </div>
        </details>
      </Card>

      <div className="flex gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            void refetchWebsites()
            void refetchSources()
            void refetchGsc()
          }}
        >
          Refresh
        </Button>
      </div>
    </div>
  )
}

/**
 * Editorial sources are an implementation detail of competitor tracking, so the
 * per-section list and manual overrides stay collapsed behind this disclosure.
 */
function AdvancedSourcesDisclosure({
  sources,
  websites,
  competitorNameById,
  isDiscovering,
  manualWebsiteId,
  manualSourceUrl,
  manualSourceType,
  onManualWebsiteIdChange,
  onManualSourceUrlChange,
  onManualSourceTypeChange,
  onDiscover,
  onSourceStatus,
  onAddManualSource,
}: {
  sources: ProjectCompetitiveContentSource[]
  websites: ProjectCompetitiveWebsite[]
  competitorNameById: Map<number, string>
  isDiscovering: boolean
  manualWebsiteId: string
  manualSourceUrl: string
  manualSourceType: ContentSourceType
  onManualWebsiteIdChange: (value: string) => void
  onManualSourceUrlChange: (value: string) => void
  onManualSourceTypeChange: (value: ContentSourceType) => void
  onDiscover: () => Promise<void>
  onSourceStatus: (sourceId: number, status: ContentSourceStatus) => Promise<void>
  onAddManualSource: () => Promise<void>
}) {
  return (
    <details className="text-xs text-gray-500">
      <summary className="cursor-pointer text-gray-600">
        Advanced: review tracked sections
      </summary>

      <div className="mt-3 space-y-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => void onDiscover()}
          disabled={isDiscovering}
        >
          {isDiscovering ? (
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
          )}
          Re-detect sections
        </Button>

        {sources.length > 0 ? (
          <ul className="space-y-2">
            {sources.map((source) => (
              <li
                key={source.id}
                className="rounded-md border border-gray-100 px-3 py-2 text-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <p className="truncate font-medium text-gray-900">
                      {source.source_url}
                    </p>
                    <p className="text-xs text-gray-500">
                      {CONTENT_SOURCE_TYPE_LABELS[source.source_type]} ·{" "}
                      {CONTENT_SOURCE_STATUS_LABELS[source.status]} ·{" "}
                      {source.discovery_method}
                      {source.discovery_confidence != null
                        ? ` · confidence ${(source.discovery_confidence * 100).toFixed(0)}%`
                        : ""}
                      {source.is_manual_override ? " · manual" : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {source.status !== "confirmed" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void onSourceStatus(source.id, "confirmed")}
                      >
                        Confirm
                      </Button>
                    ) : null}
                    {source.status !== "ignored" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void onSourceStatus(source.id, "ignored")}
                      >
                        Ignore
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void onSourceStatus(source.id, "suggested")}
                      >
                        Re-suggest
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="grid gap-2 lg:grid-cols-[1fr_1fr_140px_auto]">
          <Select value={manualWebsiteId} onValueChange={onManualWebsiteIdChange}>
            <SelectTrigger>
              <SelectValue placeholder="Website" />
            </SelectTrigger>
            <SelectContent>
              {websites.map((website) => (
                <SelectItem key={website.id} value={String(website.id)}>
                  {website.entity_type === "owned"
                    ? `Our brand · ${website.normalized_domain}`
                    : `${competitorNameById.get(website.competitor_id ?? -1) ?? "Competitor"} · ${website.normalized_domain}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={manualSourceUrl}
            onChange={(event) => onManualSourceUrlChange(event.target.value)}
            placeholder="https://example.com/insights/"
          />
          <Select
            value={manualSourceType}
            onValueChange={(value) => onManualSourceTypeChange(value as ContentSourceType)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONTENT_SOURCE_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {CONTENT_SOURCE_TYPE_LABELS[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => void onAddManualSource()}>
            Add source
          </Button>
        </div>
      </div>
    </details>
  )
}

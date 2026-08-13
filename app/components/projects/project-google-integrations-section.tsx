"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertCircle, CheckCircle2, Loader2, RefreshCw } from "lucide-react"
import { Button } from "../ui/button"
import { Card } from "../ui/card"
import { Label } from "../ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select"
import { toast } from "../ui/use-toast"
import { GoogleConnectPanel, PROJECT_GOOGLE_OAUTH_QUERY_KEY } from "./google-connect-panel"
import { isGoogleOAuthConnectEnabledInMainUi } from "@/lib/google-oauth-feature"
import {
  disconnectProjectGoogleOAuth,
  getProjectGoogleOAuthStatus,
  listGoogleConnectedProperties,
  selectGoogleConnectedProperties,
  syncProjectGoogleAnalytics,
  type GoogleConnectedPropertiesResponse,
  type ProjectGoogleOAuthStatus,
} from "@/lib/services/project-google-oauth"
import {
  getProjectGoogleIntegrationsStatus,
  syncProjectSearchConsole,
  type GoogleIntegrationsStatus,
} from "@/lib/services/project-search-console"

export const PROJECT_GOOGLE_INTEGRATIONS_QUERY_KEY = "project-google-integrations" as const

function StatusBadge({
  connected,
  error,
  expired,
}: {
  connected: boolean
  error?: string | null
  expired?: boolean
}) {
  if (error || expired) {
    return (
      <span className="inline-flex items-center rounded-md bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">
        {expired ? "Authorization expired" : "Error"}
      </span>
    )
  }
  if (connected) {
    return (
      <span className="inline-flex items-center rounded-md bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700">
        Connected
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
      Not connected
    </span>
  )
}

function ServiceCard({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-md border border-gray-200 p-4">
      <div className="mb-3">
        <h4 className="text-sm font-semibold text-gray-900">{title}</h4>
        <p className="mt-1 text-xs text-gray-500">{description}</p>
      </div>
      {children}
    </div>
  )
}

export function ProjectGoogleIntegrationsSection({
  projectId,
  compact = false,
  autoOpenGsc = false,
  onConnected,
}: {
  projectId: number
  compact?: boolean
  /** Open the Search Console property picker once OAuth is ready. */
  autoOpenGsc?: boolean
  onConnected?: () => void
}) {
  const queryClient = useQueryClient()
  const [showGaPicker, setShowGaPicker] = useState(false)
  const [showGscPicker, setShowGscPicker] = useState(autoOpenGsc)
  const [gaPropertyId, setGaPropertyId] = useState("")
  const [gscPropertyUrl, setGscPropertyUrl] = useState("")
  const [isSaving, setIsSaving] = useState<"ga" | "gsc" | null>(null)
  const [isSyncing, setIsSyncing] = useState<"ga" | "gsc" | null>(null)
  const [isReturningFromOAuth, setIsReturningFromOAuth] = useState(false)
  const autoSyncAttemptedRef = useRef(false)

  const integrationsQuery = useQuery<GoogleIntegrationsStatus>({
    queryKey: [PROJECT_GOOGLE_INTEGRATIONS_QUERY_KEY, projectId],
    queryFn: () => getProjectGoogleIntegrationsStatus(projectId),
  })

  const oauthQuery = useQuery<ProjectGoogleOAuthStatus>({
    queryKey: [PROJECT_GOOGLE_OAUTH_QUERY_KEY, projectId],
    queryFn: () => getProjectGoogleOAuthStatus(projectId),
  })

  const propertiesQuery = useQuery<GoogleConnectedPropertiesResponse>({
    queryKey: [PROJECT_GOOGLE_OAUTH_QUERY_KEY, "properties", projectId],
    enabled:
      Boolean(oauthQuery.data?.connected)
      && (showGaPicker || showGscPicker || isReturningFromOAuth),
    queryFn: () => listGoogleConnectedProperties(projectId),
  })

  useEffect(() => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    const flag = params.get("google_connect")
    const pid = Number(params.get("project_id"))
    if (flag === "1" && (!pid || pid === projectId)) {
      setIsReturningFromOAuth(true)
      setShowGaPicker(true)
      setShowGscPicker(true)
      void oauthQuery.refetch()
      void integrationsQuery.refetch()
      params.delete("google_connect")
      params.delete("project_id")
      params.delete("google_connect_error")
      const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`
      window.history.replaceState({}, "", next)
    } else if (flag === "error") {
      toast({
        title: "Google connect failed",
        description: params.get("google_connect_error") || "Google connect failed",
        variant: "destructive",
      })
      params.delete("google_connect")
      params.delete("google_connect_error")
      params.delete("project_id")
      const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`
      window.history.replaceState({}, "", next)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot URL handshake
  }, [projectId])

  useEffect(() => {
    if (!isReturningFromOAuth) return
    if (oauthQuery.isLoading || integrationsQuery.isLoading) return
    if (!oauthQuery.data?.connected) return
    // Wait until properties actually load — a disabled query reports
    // isLoading=false and would clear the skeleton too early.
    if (!propertiesQuery.isFetched) return
    setIsReturningFromOAuth(false)
    toast({
      title: "Google connected",
      description: "Choose Analytics and/or Search Console properties below.",
    })
  }, [
    isReturningFromOAuth,
    oauthQuery.isLoading,
    oauthQuery.data?.connected,
    integrationsQuery.isLoading,
    propertiesQuery.isFetched,
  ])

  const connectHref = useMemo(() => {
    const params = new URLSearchParams({
      project_id: String(projectId),
    })
    if (typeof window !== "undefined") {
      params.set("return_to", `${window.location.pathname}${window.location.search}`)
    }
    return `/api/auth/google/start?${params.toString()}`
  }, [projectId])

  const integrations = integrationsQuery.data
  const oauth = integrations?.oauth ?? oauthQuery.data
  const analytics = integrations?.analytics
  const searchConsole = integrations?.search_console

  async function refreshAll() {
    await Promise.all([
      integrationsQuery.refetch(),
      oauthQuery.refetch(),
      queryClient.invalidateQueries({ queryKey: [PROJECT_GOOGLE_OAUTH_QUERY_KEY, projectId] }),
    ])
    onConnected?.()
  }

  useEffect(() => {
    if (!autoOpenGsc) return
    if (!oauthQuery.data?.connected) return
    if (searchConsole?.connected) return
    setShowGscPicker(true)
    setGscPropertyUrl(searchConsole?.property_url ?? "")
  }, [
    autoOpenGsc,
    oauthQuery.data?.connected,
    searchConsole?.connected,
    searchConsole?.property_url,
  ])

  // Property selected earlier but sync never ran, or backfill stuck in queued.
  useEffect(() => {
    if (autoSyncAttemptedRef.current) return
    if (!oauthQuery.data?.connected) return
    if (!searchConsole?.connected) return
    if (isSyncing === "gsc") return
    const needsCatchUp =
      !searchConsole.last_synced_at
      || searchConsole.backfill_status === "queued"
    if (!needsCatchUp) return
    autoSyncAttemptedRef.current = true
    void syncGsc()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot catch-up sync
  }, [
    oauthQuery.data?.connected,
    searchConsole?.connected,
    searchConsole?.last_synced_at,
    searchConsole?.backfill_status,
  ])

  async function saveGaProperty() {
    if (!gaPropertyId) return
    setIsSaving("ga")
    try {
      await selectGoogleConnectedProperties({
        projectId,
        gaPropertyId,
        gscPropertyUrl: searchConsole?.property_url ?? null,
      })
      await syncProjectGoogleAnalytics({ projectId, gaPropertyId })
      toast({ title: "Google Analytics property saved" })
      setShowGaPicker(false)
      await refreshAll()
    } catch (error) {
      toast({
        title: "Could not save Analytics property",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      setIsSaving(null)
    }
  }

  async function saveGscProperty() {
    if (!gscPropertyUrl) return
    setIsSaving("gsc")
    try {
      await selectGoogleConnectedProperties({
        projectId,
        gscPropertyUrl,
        gaPropertyId: analytics?.ga_property_id ?? null,
      })
      const sync = await syncProjectSearchConsole({
        projectId,
        jobType: "backfill",
        trigger: "oauth_connect",
      })
      if (!sync.ok) {
        toast({
          title: "Property saved, sync pending",
          description: sync.error || "Historical sync could not start yet.",
        })
      } else {
        toast({ title: "Search Console connected", description: "Historical sync started." })
      }
      setShowGscPicker(false)
      await refreshAll()
    } catch (error) {
      toast({
        title: "Could not save Search Console property",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      setIsSaving(null)
    }
  }

  async function syncGa() {
    setIsSyncing("ga")
    try {
      await syncProjectGoogleAnalytics({
        projectId,
        gaPropertyId: analytics?.ga_property_id ?? null,
      })
      toast({ title: "Analytics synced" })
      await refreshAll()
      await queryClient.invalidateQueries({ queryKey: ["project-analytics", projectId] })
    } catch (error) {
      toast({
        title: "Analytics sync failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      setIsSyncing(null)
    }
  }

  async function syncGsc() {
    setIsSyncing("gsc")
    try {
      const result = await syncProjectSearchConsole({
        projectId,
        jobType: "all",
        trigger: "manual",
      })
      if (!result.ok) {
        throw new Error(result.error || "Search Console sync failed")
      }
      toast({ title: "Search Console synced" })
      await refreshAll()
      await queryClient.invalidateQueries({ queryKey: ["project-search-overview", projectId] })
    } catch (error) {
      toast({
        title: "Search Console sync failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      setIsSyncing(null)
    }
  }

  async function disconnectGoogle() {
    try {
      await disconnectProjectGoogleOAuth(projectId)
      toast({ title: "Google account disconnected" })
      await refreshAll()
    } catch (error) {
      toast({
        title: "Disconnect failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      })
    }
  }

  const isConnecting =
    isReturningFromOAuth
    || (
      (showGaPicker || showGscPicker)
      && Boolean(oauthQuery.data?.connected)
      && !propertiesQuery.isFetched
    )

  if ((integrationsQuery.isLoading || oauthQuery.isLoading) && !isReturningFromOAuth) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading Google integrations…
      </div>
    )
  }

  if (isConnecting) {
    return (
      <Card className={compact ? "p-4" : "mb-6 p-4 md:p-5"}>
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-gray-700">
            <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
            Connecting Google account…
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {["Google Analytics", "Google Search Console"].map((title) => (
              <div key={title} className="space-y-3 rounded-md border border-gray-200 p-4">
                <div className="h-4 w-36 animate-pulse rounded bg-gray-200" />
                <div className="h-3 w-full animate-pulse rounded bg-gray-100" />
                <div className="h-9 w-full animate-pulse rounded-md bg-gray-200" />
                <div className="h-8 w-24 animate-pulse rounded-md bg-gray-200" />
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500">
            Loading the properties available for this Google account.
          </p>
        </div>
      </Card>
    )
  }

  if (!isGoogleOAuthConnectEnabledInMainUi()) {
    return (
      <GoogleConnectPanel projectId={projectId} onConnected={() => void refreshAll()} />
    )
  }

  const oauthConnected = Boolean(oauth?.connected)
  const oauthError = oauth && "last_error" in oauth ? oauth.last_error : null
  const oauthExpired = oauth && "status" in oauth ? oauth.status === "error" : false

  return (
    <Card className={compact ? "p-4" : "mb-6 p-4 md:p-5"}>
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Google integrations</h3>
          <p className="mt-1 text-xs text-gray-500">
            Connect Analytics and Search Console separately. The same Google account can be
            reused when available.
          </p>
        </div>

        {oauthConnected ? (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-600">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
            Google account:{" "}
            <span className="font-medium text-gray-900">
              {(oauth as ProjectGoogleOAuthStatus)?.google_account_email || "Connected"}
            </span>
            <Button variant="ghost" size="sm" className="h-7 px-2" asChild>
              <a href={connectHref}>Reauthorize</a>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={() => void disconnectGoogle()}
            >
              Disconnect account
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild>
              <a href={connectHref}>Connect Google account</a>
            </Button>
            <p className="text-xs text-gray-500">
              Required once, then choose Analytics and/or Search Console properties.
            </p>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <ServiceCard
            title="Google Analytics"
            description="Sessions, users, engagement and conversions after the click."
          >
            <div className="space-y-3">
              <StatusBadge
                connected={Boolean(analytics?.connected)}
                error={oauthError}
                expired={oauthExpired}
              />
              {analytics?.connected ? (
                <div className="space-y-1 text-xs text-gray-600">
                  <p>
                    Property:{" "}
                    <span className="font-mono text-[11px] text-gray-900">
                      {analytics.ga_property_id}
                    </span>
                  </p>
                  {analytics.updated_at ? (
                    <p>Updated: {new Date(analytics.updated_at).toLocaleString()}</p>
                  ) : null}
                </div>
              ) : (
                <p className="text-xs text-gray-500">No Analytics property selected.</p>
              )}

              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!oauthConnected}
                  onClick={() => {
                    setShowGaPicker(true)
                    setGaPropertyId(analytics?.ga_property_id ?? "")
                  }}
                >
                  {analytics?.connected ? "Manage" : "Connect"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!analytics?.connected || isSyncing === "ga"}
                  onClick={() => void syncGa()}
                >
                  {isSyncing === "ga" ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Sync now
                </Button>
              </div>

              {showGaPicker && oauthConnected ? (
                <div className="space-y-2 rounded-md border border-gray-200 p-3">
                  <Label className="text-xs text-gray-500">GA4 property</Label>
                  {propertiesQuery.isLoading ? (
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Loading properties…
                    </div>
                  ) : (
                    <Select
                      value={gaPropertyId || "__none__"}
                      onValueChange={(value) =>
                        setGaPropertyId(value === "__none__" ? "" : value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a property" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">None</SelectItem>
                        {(propertiesQuery.data?.analyticsProperties ?? []).map((prop) => (
                          <SelectItem key={prop.propertyId} value={prop.propertyId}>
                            {prop.displayName}
                            {prop.accountName ? ` · ${prop.accountName}` : ""} (
                            {prop.propertyId})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={!gaPropertyId || isSaving === "ga"}
                      onClick={() => void saveGaProperty()}
                    >
                      {isSaving === "ga" ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : null}
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setShowGaPicker(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </ServiceCard>

          <ServiceCard
            title="Google Search Console"
            description="Impressions, clicks, queries, pages and monitored-page indexation."
          >
            <div className="space-y-3">
              <StatusBadge
                connected={Boolean(searchConsole?.connected)}
                error={searchConsole?.last_sync_error || oauthError}
                expired={oauthExpired}
              />
              {searchConsole?.connected ? (
                <div className="space-y-1 text-xs text-gray-600">
                  <p>
                    Property:{" "}
                    <span className="font-mono text-[11px] text-gray-900">
                      {searchConsole.property_url}
                    </span>
                  </p>
                  {searchConsole.site_type ? <p>Type: {searchConsole.site_type}</p> : null}
                  {searchConsole.last_synced_at ? (
                    <p>
                      Last sync:{" "}
                      {new Date(searchConsole.last_synced_at).toLocaleString()}
                    </p>
                  ) : (
                    <p className="text-amber-700">
                      Never synced
                      {oauthConnected
                        ? " — run Sync now to pull Search Console data."
                        : " — reconnect Google, then sync."}
                    </p>
                  )}
                  {searchConsole.backfill_status
                    && searchConsole.backfill_status !== "completed" ? (
                    <p className="text-amber-700">
                      Historical sync: {searchConsole.backfill_status}
                    </p>
                  ) : null}
                  {searchConsole.last_sync_error ? (
                    <p className="flex items-start gap-1 text-red-600">
                      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {searchConsole.last_sync_error}
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="text-xs text-gray-500">
                  Connect Search Console to track impressions, clicks, queries, pages and
                  indexation.
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                {!oauthConnected ? (
                  <Button size="sm" asChild>
                    <a href={connectHref}>
                      {searchConsole?.connected
                        ? "Reconnect Google"
                        : "Connect Google"}
                    </a>
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setShowGscPicker(true)
                      setGscPropertyUrl(searchConsole?.property_url ?? "")
                    }}
                  >
                    {searchConsole?.connected ? "Manage" : "Connect"}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={
                    !oauthConnected
                    || !searchConsole?.connected
                    || isSyncing === "gsc"
                  }
                  onClick={() => void syncGsc()}
                >
                  {isSyncing === "gsc" ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Sync now
                </Button>
              </div>

              {showGscPicker && oauthConnected ? (
                <div className="space-y-2 rounded-md border border-gray-200 p-3">
                  <Label className="text-xs text-gray-500">Search Console property</Label>
                  {propertiesQuery.isLoading ? (
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Loading properties…
                    </div>
                  ) : (
                    <Select
                      value={gscPropertyUrl || "__none__"}
                      onValueChange={(value) =>
                        setGscPropertyUrl(value === "__none__" ? "" : value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a property" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">None</SelectItem>
                        {(propertiesQuery.data?.searchConsoleSites ?? []).map((site) => (
                          <SelectItem key={site.siteUrl} value={site.siteUrl}>
                            {site.siteUrl}
                            {site.permissionLevel ? ` · ${site.permissionLevel}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={!gscPropertyUrl || isSaving === "gsc"}
                      onClick={() => void saveGscProperty()}
                    >
                      {isSaving === "gsc" ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : null}
                      Save & sync
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setShowGscPicker(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </ServiceCard>
        </div>
      </div>
    </Card>
  )
}

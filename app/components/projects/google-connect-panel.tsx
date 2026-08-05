"use client"

import { useEffect, useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { Button } from "../ui/button"
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
  disconnectProjectGoogleOAuth,
  getProjectGoogleOAuthStatus,
  listGoogleConnectedProperties,
  selectGoogleConnectedProperties,
  type GoogleConnectedPropertiesResponse,
  type ProjectGoogleOAuthStatus,
} from "@/lib/services/project-google-oauth"

export const PROJECT_GOOGLE_OAUTH_QUERY_KEY = "project-google-oauth" as const

export function GoogleConnectPanel({
  projectId,
  returnTo,
  onConnected,
}: {
  projectId: number
  returnTo?: string
  onConnected?: () => void
}) {
  const queryClient = useQueryClient()
  const [isSelecting, setIsSelecting] = useState(false)
  const [gscPropertyUrl, setGscPropertyUrl] = useState<string>("")
  const [gaPropertyId, setGaPropertyId] = useState<string>("")
  const [showPicker, setShowPicker] = useState(false)

  const {
    data: status,
    isLoading: statusLoading,
    refetch: refetchStatus,
  } = useQuery<ProjectGoogleOAuthStatus>({
    queryKey: [PROJECT_GOOGLE_OAUTH_QUERY_KEY, projectId],
    queryFn: () => getProjectGoogleOAuthStatus(projectId),
  })

  const propertiesQuery = useQuery<GoogleConnectedPropertiesResponse>({
    queryKey: [PROJECT_GOOGLE_OAUTH_QUERY_KEY, "properties", projectId],
    enabled: Boolean(status?.connected) && showPicker,
    queryFn: () => listGoogleConnectedProperties(projectId),
  })

  useEffect(() => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    const flag = params.get("google_connect")
    const pid = Number(params.get("project_id"))
    if (flag === "1" && (!pid || pid === projectId)) {
      setShowPicker(true)
      void refetchStatus()
      params.delete("google_connect")
      params.delete("project_id")
      params.delete("google_connect_error")
      const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`
      window.history.replaceState({}, "", next)
      toast({ title: "Google connected", description: "Select Search Console and/or Analytics properties." })
    } else if (flag === "error") {
      const message = params.get("google_connect_error") || "Google connect failed"
      toast({ title: "Google connect failed", description: message, variant: "destructive" })
      params.delete("google_connect")
      params.delete("google_connect_error")
      params.delete("project_id")
      const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`
      window.history.replaceState({}, "", next)
    }
  }, [projectId, refetchStatus])

  const connectHref = useMemo(() => {
    const params = new URLSearchParams({
      project_id: String(projectId),
    })
    if (returnTo) params.set("return_to", returnTo)
    else if (typeof window !== "undefined") {
      params.set("return_to", `${window.location.pathname}${window.location.search}`)
    }
    return `/api/auth/google/start?${params.toString()}`
  }, [projectId, returnTo])

  async function handleSaveSelection() {
    setIsSelecting(true)
    try {
      await selectGoogleConnectedProperties({
        projectId,
        gscPropertyUrl: gscPropertyUrl || null,
        gaPropertyId: gaPropertyId || null,
      })
      toast({ title: "Properties saved" })
      setShowPicker(false)
      await queryClient.invalidateQueries({ queryKey: [PROJECT_GOOGLE_OAUTH_QUERY_KEY, projectId] })
      onConnected?.()
    } catch (error) {
      toast({
        title: "Could not save properties",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      setIsSelecting(false)
    }
  }

  async function handleDisconnect() {
    try {
      await disconnectProjectGoogleOAuth(projectId)
      setShowPicker(false)
      setGscPropertyUrl("")
      setGaPropertyId("")
      await refetchStatus()
      toast({ title: "Google disconnected" })
      onConnected?.()
    } catch (error) {
      toast({
        title: "Disconnect failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      })
    }
  }

  if (statusLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Checking Google connection…
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {status?.connected ? (
        <div className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-600">
          Connected as{" "}
          <span className="font-medium text-gray-900">
            {status.google_account_email || "Google account"}
          </span>
        </div>
      ) : (
        <p className="text-xs text-gray-500">
          Connect your Google account in one click to pull Search Console and Analytics
          data for this project.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {!status?.connected ? (
          <Button asChild>
            <a href={connectHref}>Connect Google</a>
          </Button>
        ) : (
          <>
            <Button variant="outline" onClick={() => setShowPicker(true)}>
              Choose properties
            </Button>
            <Button variant="outline" asChild>
              <a href={connectHref}>Reconnect</a>
            </Button>
            <Button variant="ghost" onClick={() => void handleDisconnect()}>
              Disconnect
            </Button>
          </>
        )}
      </div>

      {showPicker && status?.connected ? (
        <div className="space-y-3 rounded-md border border-gray-200 p-3">
          {propertiesQuery.isLoading ? (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading Google properties…
            </div>
          ) : propertiesQuery.error ? (
            <p className="text-xs text-red-600">
              {(propertiesQuery.error as Error).message || "Failed to load properties"}
            </p>
          ) : (
            <>
              <div className="space-y-1">
                <Label className="text-xs text-gray-500">Search Console property</Label>
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
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-gray-500">Google Analytics 4 property</Label>
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
              </div>
              <Button
                disabled={isSelecting || (!gscPropertyUrl && !gaPropertyId)}
                onClick={() => void handleSaveSelection()}
              >
                {isSelecting ? (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : null}
                Save properties
              </Button>
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}

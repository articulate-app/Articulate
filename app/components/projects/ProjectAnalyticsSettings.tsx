"use client"

import { useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react"
import { createClient } from "../../lib/supabase/client"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { Card } from "../ui/card"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import { cn } from "@/lib/utils"
import { ProjectGoogleIntegrationsSection } from "./project-google-integrations-section"
import { isGoogleOAuthConnectEnabledInMainUi } from "@/lib/google-oauth-feature"
import { syncProjectGoogleAnalytics } from "@/lib/services/project-google-oauth"

type Mapping = {
  id: number
  ga_property_id: string
  default_uri: string | null
  is_active: boolean
  updated_at: string
}

type SyncStatus =
  | "idle"
  | "syncing"
  | "success"
  | "no_data"
  | "permission_error"
  | "error"

interface ProjectAnalyticsSettingsProps {
  projectId: number
}

export function ProjectAnalyticsSettings({ projectId }: ProjectAnalyticsSettingsProps) {
  const supabase = useMemo(() => createClient(), [])
  const queryClient = useQueryClient()
  const oauthEnabled = isGoogleOAuthConnectEnabledInMainUi()

  const [propertyId, setPropertyId] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle")
  const [syncMessage, setSyncMessage] = useState<string | null>(null)

  const {
    data: mappings,
    isLoading: isLoadingMappings,
    error: mappingsError,
    refetch: refetchMappings,
  } = useQuery<Mapping[]>({
    queryKey: ["project-analytics-mappings", projectId],
    enabled: !oauthEnabled,
    queryFn: async (): Promise<Mapping[]> => {
      const { data, error } = await (supabase as any)
        .from("project_analytics_properties")
        .select("id, ga_property_id, default_uri, is_active, updated_at")
        .eq("project_id", projectId)

      if (error) {
        throw error
      }

      return (data || []) as Mapping[]
    },
  })

  const triggerSync = async () => {
    setIsSubmitting(true)
    setSyncStatus("syncing")
    setSyncMessage("Syncing analytics data from Google Analytics...")

    try {
      try {
        await syncProjectGoogleAnalytics({ projectId })
        setSyncStatus("success")
        setSyncMessage("Google Analytics property connected and data synced successfully.")
        queryClient.invalidateQueries({
          queryKey: ["project-analytics", projectId],
        })
        return
      } catch {
        // Fall through to platform sync path.
      }

      const authClient = createClientComponentClient()
      const { data, error } = await authClient.functions.invoke("sync-project-analytics", {
        body: { project_id: projectId },
      })
      if (error) {
        setSyncStatus("error")
        setSyncMessage(error.message || "Failed to sync Google Analytics.")
        return
      }

      const rows = Array.isArray((data as { rows?: unknown[] } | null)?.rows)
        ? (data as { rows: unknown[] }).rows
        : null

      if (!rows || rows.length === 0) {
        setSyncStatus("no_data")
        setSyncMessage(
          "We connected to Google Analytics, but didn't find any recent data for this property.",
        )
      } else {
        setSyncStatus("success")
        setSyncMessage("Google Analytics property connected and data synced successfully.")
        queryClient.invalidateQueries({
          queryKey: ["project-analytics", projectId],
        })
      }
    } catch (error: unknown) {
      setSyncStatus("error")
      setSyncMessage(
        error instanceof Error
          ? error.message
          : "Unexpected error while connecting GA property.",
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleConnectAndSync = async () => {
    const trimmedPropertyId = propertyId.trim()

    if (!trimmedPropertyId) {
      setSyncStatus("error")
      setSyncMessage("Please enter a GA4 property ID.")
      return
    }

    setIsSubmitting(true)
    setSyncStatus("syncing")
    setSyncMessage("Connecting property and syncing analytics data...")

    try {
      const { error: rpcError } = await (supabase as any).rpc(
        "fn_set_project_ga_property",
        {
          p_project_id: projectId,
          p_ga_property_id: trimmedPropertyId,
          p_default_uri: null,
        },
      )

      if (rpcError) {
        setSyncStatus("error")
        setSyncMessage(
          rpcError.message || "Failed to save Google Analytics property.",
        )
        return
      }

      await refetchMappings()
      await triggerSync()
    } finally {
      setIsSubmitting(false)
    }
  }

  if (oauthEnabled) {
    return <ProjectGoogleIntegrationsSection projectId={projectId} />
  }

  const hasMappings = Array.isArray(mappings) && mappings.length > 0
  const primaryMapping = hasMappings ? (mappings as Mapping[])[0] : null

  return (
    <Card className="mb-6 p-4 md:p-5">
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">
            Google Analytics connection
          </h3>
          <p className="mt-1 text-xs text-gray-500">
            Connect a GA4 property by sharing Viewer access with{" "}
            <span className="font-mono text-[11px]">app@whyarticulate.com</span>
            , then paste the GA4 property ID below.
          </p>
        </div>

        {isLoadingMappings ? (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading Google Analytics connection…</span>
          </div>
        ) : mappingsError ? (
          <div className="flex items-center gap-2 text-xs text-red-600">
            <AlertCircle className="h-4 w-4" />
            <span>Failed to load existing Google Analytics connection.</span>
          </div>
        ) : hasMappings && primaryMapping ? (
          <div className="rounded-md bg-gray-50 px-3 py-2 text-[11px] text-gray-600">
            Connected Google Analytics property:{" "}
            <span className="font-mono text-xs text-gray-900">
              {primaryMapping.ga_property_id}
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1">
              <Label htmlFor="ga-property-id" className="text-xs">
                GA property ID
              </Label>
              <Input
                id="ga-property-id"
                placeholder="347260813 or properties/347260813"
                value={propertyId}
                onChange={(e) => setPropertyId(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <Button
              type="button"
              size="sm"
              className="mt-2 sm:mt-0"
              onClick={() => void handleConnectAndSync()}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Connecting…
                </>
              ) : (
                <>Connect</>
              )}
            </Button>
          </div>
        )}

        {syncStatus !== "idle" && syncMessage ? (
          <div
            className={cn(
              "mt-2 flex items-start gap-2 rounded-md border px-3 py-2 text-xs",
              syncStatus === "success" && "border-green-200 bg-green-50",
              syncStatus === "no_data" && "border-amber-200 bg-amber-50",
              syncStatus === "permission_error" && "border-red-200 bg-red-50",
              syncStatus === "error" && "border-red-200 bg-red-50",
              syncStatus === "syncing" && "border-gray-200 bg-gray-50",
            )}
          >
            {syncStatus === "success" ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 text-green-600" />
            ) : (
              <AlertCircle className="mt-0.5 h-4 w-4 text-gray-500" />
            )}
            <p className="whitespace-pre-line text-[11px] text-gray-700">
              {syncMessage}
            </p>
          </div>
        ) : null}
      </div>
    </Card>
  )
}

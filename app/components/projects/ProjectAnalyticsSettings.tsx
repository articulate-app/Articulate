"use client"

import { useEffect, useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react"
import { createClient } from "../../lib/supabase/client"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { Card } from "../ui/card"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import { cn } from "@/lib/utils"

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

  useEffect(() => {
    if (mappingsError) {
      console.error("Error loading analytics mappings:", mappingsError)
    }
  }, [mappingsError])

  const triggerSync = async () => {
    setIsSubmitting(true)
    setSyncStatus("syncing")
    setSyncMessage("Syncing analytics data from Google Analytics...")

    try {
      const functionsClient = createClientComponentClient()
      const { data: _, error: fnError } = await functionsClient.functions.invoke(
        "sync-project-analytics",
        { body: { project_id: projectId } },
      )

      if (fnError) {
        const message = fnError.message || "Failed to sync analytics data."
        const isForbidden =
          (fnError as any).status === 403 ||
          message.toLowerCase().includes("403") ||
          message.toLowerCase().includes("permission")

        if (isForbidden) {
          setSyncStatus("permission_error")
          setSyncMessage(
            "We were unable to read data from this Google Analytics property. " +
              "Please add app@whyarticulate.com as a Viewer on this GA4 property in Google Analytics, " +
              "then return here and click 'Sync again'.",
          )
        } else {
          setSyncStatus("error")
          setSyncMessage(
            message ||
              "Failed to sync analytics data. Please try again in a moment.",
          )
        }
        return
      }

      const {
        data: rows,
        error: tsError,
      } = await (supabase as any)
        .from("project_analytics_timeseries")
        .select("id")
        .eq("project_id", projectId)
        .limit(1)

      if (tsError) {
        setSyncStatus("error")
        setSyncMessage(
          tsError.message ||
            "Analytics sync completed, but we could not verify the data.",
        )
        return
      }

      if (!rows || rows.length === 0) {
        setSyncStatus("no_data")
        setSyncMessage(
          "We connected to Google Analytics, but didn't find any recent data for this property. " +
            "Check your date range or confirm you're using the correct property.",
        )
      } else {
        setSyncStatus("success")
        setSyncMessage(
          "Google Analytics property connected and data synced successfully.",
        )

        queryClient.invalidateQueries({
          queryKey: ["project-analytics", projectId],
        })
      }
    } catch (error: any) {
      console.error("Error connecting GA property:", error)
      setSyncStatus("error")
      setSyncMessage(
        error?.message || "Unexpected error while connecting GA property.",
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
            Connect a GA4 property to pull traffic data into this project. Make
            sure{" "}
            <span className="font-mono text-[11px]">
              app@whyarticulate.com
            </span>{" "}
            has Viewer access to your GA4 property.
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
              <p className="text-[11px] text-gray-500">
                Accepts{" "}
                <span className="font-mono">347260813</span> or{" "}
                <span className="font-mono">properties/347260813</span>.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              className="mt-2 sm:mt-0"
              onClick={handleConnectAndSync}
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

        {syncStatus !== "idle" && syncMessage && (
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
            <div className="space-y-1">
              {syncStatus === "permission_error" && (
                <div className="text-xs font-semibold text-red-700">
                  We don&apos;t have access to this GA property. Please add{" "}
                  <span className="font-mono text-[11px]">
                    app@whyarticulate.com
                  </span>{" "}
                  as a Viewer in Google Analytics, then click &quot;Sync
                  again&quot;.
                </div>
              )}
              <p className="whitespace-pre-line text-[11px] text-gray-700">
                {syncMessage}
              </p>
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}



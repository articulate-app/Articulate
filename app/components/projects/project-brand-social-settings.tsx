"use client"

import { useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ExternalLink, Loader2, RefreshCw, Trash2 } from "lucide-react"
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
import { cn } from "@/lib/utils"
import {
  COMPETITOR_NETWORK_LABELS,
  COMPETITOR_SOCIAL_NETWORKS,
  type CompetitorSocialNetwork,
} from "@/lib/competitor-social"
import {
  PROJECT_BRAND_SOCIAL_PROFILES_QUERY_KEY,
  createBrandSocialProfile,
  deleteBrandSocialProfile,
  listProjectBrandSocialProfiles,
  updateBrandSocialProfile,
} from "@/lib/services/project-brand-social"
import { syncCompetitorSocialPosts } from "@/lib/services/project-competitors"
import { BrandSocialConnectCard } from "./competition-connect-cards"

function unusedNetworks(
  used: Iterable<CompetitorSocialNetwork>,
): CompetitorSocialNetwork[] {
  const usedSet = new Set(used)
  return COMPETITOR_SOCIAL_NETWORKS.filter((network) => !usedSet.has(network))
}

/**
 * Project-owned social profiles (not competitors). Lives under Details in settings.
 */
export function ProjectBrandSocialSettings({ projectId }: { projectId: number }) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<{
    network: CompetitorSocialNetwork
    profileUrl: string
  }>({ network: "linkedin", profileUrl: "" })
  const [isSaving, setIsSaving] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)

  const {
    data: brandProfiles = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: [PROJECT_BRAND_SOCIAL_PROFILES_QUERY_KEY, projectId],
    queryFn: () => listProjectBrandSocialProfiles(projectId),
  })

  const networkOptions = useMemo(
    () => unusedNetworks(brandProfiles.map((profile) => profile.network)),
    [brandProfiles],
  )
  const network = networkOptions.includes(draft.network)
    ? draft.network
    : networkOptions[0] ?? draft.network

  const handleAdd = async () => {
    if (!draft.profileUrl.trim()) {
      toast({
        title: "Profile URL required",
        description: "Paste your public brand profile or page URL.",
        variant: "destructive",
      })
      return
    }
    setIsSaving(true)
    try {
      await createBrandSocialProfile({
        projectId,
        network,
        profileUrl: draft.profileUrl,
      })
      setDraft({ network: "linkedin", profileUrl: "" })
      await refetch()
      toast({ title: "Brand social profile added" })
    } catch (error: unknown) {
      toast({
        title: "Could not add brand profile",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleSync = async () => {
    setIsSyncing(true)
    try {
      const result = await syncCompetitorSocialPosts({
        projectId,
        entityType: "owned",
      })
      if (!result.ok) {
        throw new Error(result.error || "Could not start the sync")
      }
      await queryClient.invalidateQueries({
        queryKey: [PROJECT_BRAND_SOCIAL_PROFILES_QUERY_KEY, projectId],
      })
      toast({ title: "Brand social sync started" })
    } catch (error: unknown) {
      toast({
        title: "Sync failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSyncing(false)
    }
  }

  return (
    <section className="space-y-3 border-t border-gray-100 pt-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium text-gray-900">Our social profiles</h3>
          <p className="mt-0.5 text-xs text-gray-500">
            Public profiles for this brand — used in Competition analytics as “Our brand”.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => void handleSync()}
          disabled={isSyncing || brandProfiles.every((profile) => !profile.is_active)}
        >
          {isSyncing ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          )}
          Sync
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading profiles…
        </div>
      ) : brandProfiles.length === 0 ? (
        <BrandSocialConnectCard
          projectId={projectId}
          onDone={() => void refetch()}
        />
      ) : (
        <div className="space-y-2">
          {brandProfiles.map((profile) => (
            <Card
              key={profile.id}
              className="flex min-w-0 flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium text-gray-900">
                    {COMPETITOR_NETWORK_LABELS[profile.network]}
                  </span>
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[11px]",
                      profile.is_active
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-gray-100 text-gray-500",
                    )}
                  >
                    {profile.is_active ? "Active" : "Paused"}
                  </span>
                </div>
                <a
                  href={profile.profile_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-0.5 inline-flex max-w-full items-center gap-1 truncate text-xs text-blue-600 hover:underline"
                >
                  <span className="truncate">{profile.profile_url}</span>
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
                <p className="mt-0.5 text-[11px] text-gray-500">
                  {profile.last_sync_status
                    ?? (profile.last_synced_at ? "Synced" : "Never synced")}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    void updateBrandSocialProfile({
                      profileId: profile.id,
                      isActive: !profile.is_active,
                    }).then(() => refetch())
                  }
                >
                  {profile.is_active ? "Pause" : "Activate"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-red-600 hover:text-red-700"
                  onClick={() => {
                    if (
                      !window.confirm(
                        "Remove this brand social profile and its synced posts?",
                      )
                    ) {
                      return
                    }
                    void deleteBrandSocialProfile(profile.id)
                      .then(() => refetch())
                      .then(() => toast({ title: "Brand profile removed" }))
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </Card>
          ))}

          {networkOptions.length > 0 ? (
            <div className="grid gap-2 rounded-md border border-dashed border-gray-200 p-3 sm:grid-cols-[8rem_1fr_auto]">
              <div className="space-y-1">
                <Label className="text-xs">Network</Label>
                <Select
                  value={network}
                  onValueChange={(value: CompetitorSocialNetwork) =>
                    setDraft((prev) => ({ ...prev, network: value }))
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {networkOptions.map((option) => (
                      <SelectItem key={option} value={option}>
                        {COMPETITOR_NETWORK_LABELS[option]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Profile URL</Label>
                <Input
                  className="h-8 text-xs"
                  value={draft.profileUrl}
                  onChange={(event) =>
                    setDraft((prev) => ({ ...prev, profileUrl: event.target.value }))
                  }
                  placeholder="https://…"
                />
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  size="sm"
                  disabled={isSaving}
                  onClick={() => void handleAdd()}
                >
                  {isSaving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                  Add
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  )
}

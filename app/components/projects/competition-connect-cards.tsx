"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2, Plus, Sparkles } from "lucide-react"
import { Button } from "../ui/button"
import { Card } from "../ui/card"
import { Input } from "../ui/input"
import { toast } from "../ui/use-toast"
import { cn } from "@/lib/utils"
import {
  PROJECT_BRAND_SOCIAL_PROFILES_QUERY_KEY,
  discoverBrandSocialProfilesFromWebsite,
  getProjectWebsiteUrl,
} from "@/lib/services/project-brand-social"
import {
  COMPETITOR_NETWORK_LABELS,
  PROJECT_COMPETITORS_QUERY_KEY,
  discoverCompetitorSocialProfilesFromWebsite,
  type DiscoverSocialProfilesResult,
} from "@/lib/services/project-competitors"
import {
  PROJECT_COMPETITIVE_SOURCES_QUERY_KEY,
  PROJECT_COMPETITIVE_WEBSITES_QUERY_KEY,
  addCompetitorFromUrl,
} from "@/lib/services/project-competitive-content"

export const PROJECT_WEBSITE_URL_QUERY_KEY = "project-website-url" as const

function hostLabel(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(
      /^www\./,
      "",
    )
  } catch {
    return url
  }
}

function networkList(result: DiscoverSocialProfilesResult): string {
  return result.createdNetworks
    .map((network) => COMPETITOR_NETWORK_LABELS[network])
    .join(", ")
}

/** One toast that answers both "what did you find?" and "is it syncing?". */
function discoveryToast(result: DiscoverSocialProfilesResult) {
  if (result.created === 0) {
    const alreadyLinked = result.candidates.length > 0
    return {
      title: alreadyLinked ? "Profiles already linked" : "No social profiles found",
      description: alreadyLinked
        ? "Every profile on the website is already connected."
        : "We could not find social links on that website. Add a profile URL manually below.",
      variant: (alreadyLinked ? "default" : "destructive") as "default" | "destructive",
    }
  }

  const found = `${result.created} profile(s) connected: ${networkList(result)}.`
  if (!result.sync.started) {
    return {
      title: "Profiles connected — sync not started",
      description: `${found} ${result.sync.error ?? "Start the sync from Settings."}`,
      variant: "destructive" as const,
    }
  }
  return {
    title: `${result.created} profile(s) connected`,
    description: `${found} Posts are syncing now and appear within a few minutes.`,
    variant: "default" as const,
  }
}

/**
 * Empty-state CTA for the project's own social presence: read the project
 * website once, link every profile it advertises and start syncing them.
 */
export function BrandSocialConnectCard({
  projectId,
  onDone,
  className,
}: {
  projectId: number
  onDone?: () => void
  className?: string
}) {
  const queryClient = useQueryClient()
  const [manualUrl, setManualUrl] = useState("")
  const [isDiscovering, setIsDiscovering] = useState(false)

  const { data: projectUrl = null, isLoading } = useQuery({
    queryKey: [PROJECT_WEBSITE_URL_QUERY_KEY, projectId],
    queryFn: () => getProjectWebsiteUrl(projectId),
  })

  const websiteUrl = (projectUrl ?? manualUrl).trim()
  const domain = hostLabel(projectUrl)

  const handleDiscover = async () => {
    if (!websiteUrl) {
      toast({
        title: "Website URL required",
        description: "Paste your website address, e.g. https://sparkfood.pt",
        variant: "destructive",
      })
      return
    }
    setIsDiscovering(true)
    try {
      const result = await discoverBrandSocialProfilesFromWebsite({
        projectId,
        websiteUrl,
      })
      await queryClient.invalidateQueries({
        queryKey: [PROJECT_BRAND_SOCIAL_PROFILES_QUERY_KEY, projectId],
      })
      onDone?.()
      toast(discoveryToast(result))
    } catch (error) {
      toast({
        title: "Could not read that website",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsDiscovering(false)
    }
  }

  return (
    <Card className={cn("space-y-3 p-4", className)}>
      <div className="space-y-1">
        <h4 className="text-sm font-medium text-gray-900">
          Connect your social profiles
        </h4>
        <p className="text-xs text-gray-500">
          {domain
            ? `We read ${domain} and link the LinkedIn, Instagram, Facebook, YouTube, TikTok and X profiles it links to.`
            : "Paste your website — we link the social profiles it points to."}
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading project website…
        </div>
      ) : projectUrl ? (
        <Button onClick={() => void handleDiscover()} disabled={isDiscovering}>
          {isDiscovering ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 h-4 w-4" />
          )}
          Find social profiles from website
        </Button>
      ) : (
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <Input
            value={manualUrl}
            onChange={(event) => setManualUrl(event.target.value)}
            placeholder="https://yourbrand.com"
          />
          <Button onClick={() => void handleDiscover()} disabled={isDiscovering}>
            {isDiscovering ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            Find profiles
          </Button>
        </div>
      )}
    </Card>
  )
}

/**
 * Single add action for competitors: one URL links social profiles and starts
 * article monitoring. Users never have to think about editorial sources.
 */
export function AddCompetitorCard({
  projectId,
  onDone,
  className,
}: {
  projectId: number
  onDone?: () => void
  className?: string
}) {
  const queryClient = useQueryClient()
  const [websiteUrl, setWebsiteUrl] = useState("")
  const [isAdding, setIsAdding] = useState(false)

  const handleAdd = async () => {
    if (!websiteUrl.trim()) {
      toast({
        title: "Website URL required",
        description: "Paste the competitor homepage, e.g. https://dreammedia.pt",
        variant: "destructive",
      })
      return
    }
    setIsAdding(true)
    try {
      const result = await addCompetitorFromUrl({
        projectId,
        websiteUrl: websiteUrl.trim(),
      })
      setWebsiteUrl("")
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: [PROJECT_COMPETITORS_QUERY_KEY, projectId],
        }),
        queryClient.invalidateQueries({
          queryKey: [PROJECT_COMPETITIVE_WEBSITES_QUERY_KEY, projectId],
        }),
        queryClient.invalidateQueries({
          queryKey: [PROJECT_COMPETITIVE_SOURCES_QUERY_KEY, projectId],
        }),
      ])
      onDone?.()

      const socialPart =
        result.socialProfilesCreated > 0
          ? `${result.socialProfilesCreated} social profile(s) linked and ${
              result.socialSyncStarted ? "syncing" : "waiting for a sync"
            }. `
          : ""
      if (!result.content.sync.ok || !result.content.discover.ok) {
        toast({
          title: "Competitor added with sync issues",
          description: `${socialPart}${
            result.content.sync.error ??
            result.content.discover.error ??
            "Retry the sync in a moment."
          }`,
          variant: "destructive",
        })
        return
      }
      toast({
        title: "Competitor added",
        description: `${socialPart}Articles are syncing in the background.`,
      })
    } catch (error) {
      toast({
        title: "Could not add competitor",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsAdding(false)
    }
  }

  return (
    <Card className={cn("space-y-3 p-4", className)}>
      <div className="space-y-1">
        <h4 className="text-sm font-medium text-gray-900">Add a competitor</h4>
        <p className="text-xs text-gray-500">
          Paste their website. We link their social profiles and start tracking their
          articles — nothing else to configure.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <Input
          value={websiteUrl}
          onChange={(event) => setWebsiteUrl(event.target.value)}
          placeholder="https://competitor.com"
          onKeyDown={(event) => {
            if (event.key === "Enter") void handleAdd()
          }}
        />
        <Button onClick={() => void handleAdd()} disabled={isAdding}>
          {isAdding ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Plus className="mr-2 h-4 w-4" />
          )}
          Add competitor
        </Button>
      </div>
      {isAdding ? (
        <p className="text-xs text-gray-500">
          Reading the website, finding profiles and article sources… this can take a
          minute.
        </p>
      ) : null}
    </Card>
  )
}

/** Per-competitor action shown when a website is known but no profiles are linked. */
export function DiscoverCompetitorSocialButton({
  projectId,
  competitorId,
  websiteUrl,
  onDone,
}: {
  projectId: number
  competitorId: number
  websiteUrl: string
  onDone?: () => Promise<unknown> | void
}) {
  const [isDiscovering, setIsDiscovering] = useState(false)

  const handleDiscover = async () => {
    setIsDiscovering(true)
    try {
      const result = await discoverCompetitorSocialProfilesFromWebsite({
        projectId,
        competitorId,
        websiteUrl,
      })
      await onDone?.()
      toast(discoveryToast(result))
    } catch (error) {
      toast({
        title: "Could not read that website",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsDiscovering(false)
    }
  }

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => void handleDiscover()}
      disabled={isDiscovering}
    >
      {isDiscovering ? (
        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
      ) : (
        <Sparkles className="mr-1.5 h-3.5 w-3.5" />
      )}
      Find social profiles
    </Button>
  )
}

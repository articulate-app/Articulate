"use client"

import { useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Check, ExternalLink, Loader2, Sparkles } from "lucide-react"
import { getProjectOverview } from "@/lib/services/projects-briefing"
import { PROJECT_COMPETITORS_QUERY_KEY } from "@/lib/services/project-competitors"
import {
  PROJECT_COMPETITIVE_SOURCES_QUERY_KEY,
  PROJECT_COMPETITIVE_WEBSITES_QUERY_KEY,
  addCompetitorFromUrl,
} from "@/lib/services/project-competitive-content"
import { Button } from "../ui/button"
import { toast } from "../ui/use-toast"
import { cn } from "@/lib/utils"

type CompetitorSuggestion = {
  name: string
  website: string
  reason?: string | null
}

export function ProjectCompetitorSuggestions({
  projectId,
  existingNames = [],
  existingWebsites = [],
  onDone,
  className,
}: {
  projectId: number
  existingNames?: string[]
  existingWebsites?: string[]
  onDone?: () => void
  className?: string
}) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [isAdding, setIsAdding] = useState(false)

  const overviewQuery = useQuery({
    queryKey: ["project-overview-seed", projectId],
    queryFn: async () => {
      const result = await getProjectOverview(projectId)
      if (result.error || !result.data) {
        throw result.error || new Error("Project not found")
      }
      return result.data
    },
    enabled: open,
    staleTime: 5 * 60 * 1000,
  })

  const suggestionsQuery = useQuery({
    queryKey: ["project-competitor-suggestions", projectId, overviewQuery.data?.name],
    enabled: open && Boolean(overviewQuery.data?.name),
    queryFn: async () => {
      const overview = overviewQuery.data!
      const response = await fetch("/api/project-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "competitors",
          name: overview.name,
          description: overview.description,
          goal: overview.goal,
          projectUrl: overview.project_url,
          languageCode: "pt",
          existing: existingNames,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.error?.message || "Failed to load competitors")
      }
      return (payload.competitors ?? []) as CompetitorSuggestion[]
    },
    staleTime: 10 * 60 * 1000,
  })

  const existingWebsiteKeys = useMemo(() => {
    return new Set(
      existingWebsites
        .map((url) => {
          try {
            return new URL(url.startsWith("http") ? url : `https://${url}`)
              .hostname.replace(/^www\./, "")
              .toLowerCase()
          } catch {
            return url.toLowerCase()
          }
        })
        .filter(Boolean),
    )
  }, [existingWebsites])

  const suggestions = useMemo(() => {
    return (suggestionsQuery.data ?? []).filter((item) => {
      try {
        const host = new URL(item.website).hostname.replace(/^www\./, "").toLowerCase()
        return !existingWebsiteKeys.has(host)
      } catch {
        return true
      }
    })
  }, [existingWebsiteKeys, suggestionsQuery.data])

  const toggle = (website: string) => {
    setSelected((prev) =>
      prev.includes(website)
        ? prev.filter((item) => item !== website)
        : [...prev, website],
    )
  }

  const handleAdd = async () => {
    if (selected.length === 0) return
    setIsAdding(true)
    let added = 0
    try {
      for (const website of selected) {
        const suggestion = suggestions.find((item) => item.website === website)
        await addCompetitorFromUrl({
          projectId,
          websiteUrl: website,
          competitorName: suggestion?.name,
        })
        added += 1
      }
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
      toast({
        title: added === 1 ? "Competitor added" : `${added} competitors added`,
        description: "Social profiles and articles will sync in the background.",
      })
      setSelected([])
      setOpen(false)
      onDone?.()
    } catch (error) {
      toast({
        title: "Could not add competitors",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsAdding(false)
    }
  }

  if (!open) {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        className={cn("h-8 gap-1.5 text-xs", className)}
        onClick={() => {
          setSelected([])
          setOpen(true)
        }}
      >
        <Sparkles className="h-3.5 w-3.5" />
        Suggest competitors
      </Button>
    )
  }

  return (
    <div className={cn("space-y-3 rounded-lg border border-gray-200 bg-white p-3", className)}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs font-medium text-gray-900">Suggested competitors</div>
          <p className="mt-0.5 text-[11px] text-gray-500">
            Peers to follow on social and blog — we link profiles and start content sync.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={() => {
            setOpen(false)
            setSelected([])
          }}
          disabled={isAdding}
        >
          Close
        </Button>
      </div>

      {overviewQuery.isLoading || suggestionsQuery.isLoading ? (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Finding competitors…
        </div>
      ) : overviewQuery.error || suggestionsQuery.error ? (
        <div className="space-y-2">
          <p className="text-xs text-red-600">
            {(suggestionsQuery.error as Error | null)?.message
              || (overviewQuery.error as Error | null)?.message
              || "Could not load suggestions."}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => void suggestionsQuery.refetch()}
          >
            Retry
          </Button>
        </div>
      ) : suggestions.length === 0 ? (
        <p className="text-xs text-gray-500">No new competitor suggestions right now.</p>
      ) : (
        <div className="grid max-h-72 gap-2 overflow-y-auto sm:grid-cols-2">
          {suggestions.map((item) => {
            const isSelected = selected.includes(item.website)
            return (
              <button
                key={item.website}
                type="button"
                onClick={() => toggle(item.website)}
                className={cn(
                  "flex items-start gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors",
                  isSelected
                    ? "border-sky-300 bg-sky-50"
                    : "border-gray-200 bg-gray-50 hover:border-gray-300 hover:bg-white",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border",
                    isSelected
                      ? "border-sky-500 bg-sky-500 text-white"
                      : "border-gray-300 bg-white",
                  )}
                  aria-hidden
                >
                  {isSelected ? <Check className="h-2.5 w-2.5" /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-medium text-gray-900">
                    {item.name}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-gray-500">
                    {item.website.replace(/^https?:\/\//, "")}
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </span>
                  {item.reason ? (
                    <span className="mt-1 block text-[11px] leading-snug text-gray-500">
                      {item.reason}
                    </span>
                  ) : null}
                </span>
              </button>
            )
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          className="h-8 text-xs"
          disabled={selected.length === 0 || isAdding}
          onClick={() => void handleAdd()}
        >
          {isAdding ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              Adding…
            </>
          ) : (
            <>Add selected{selected.length > 0 ? ` (${selected.length})` : ""}</>
          )}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 text-xs"
          disabled={isAdding || suggestions.length === 0}
          onClick={() => setSelected(suggestions.map((item) => item.website))}
        >
          Select all
        </Button>
      </div>
    </div>
  )
}

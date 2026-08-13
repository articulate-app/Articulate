"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Check, Loader2, Sparkles } from "lucide-react"
import { getProjectOverview } from "@/lib/services/projects-briefing"
import { Button } from "../ui/button"
import { cn } from "@/lib/utils"

export type TrackSuggestionItem = {
  text: string
  meta?: string | null
}

type ProjectTrackSuggestionsProps = {
  projectId: number
  kind: "keywords" | "prompts"
  existingTexts: string[]
  onAdd: (texts: string[]) => Promise<void>
  /** Google Ads language constant id (e.g. 1014 PT). */
  languageId?: string
  /** Google Ads / DataForSEO location id (e.g. 2620 PT). */
  regionId?: string
  className?: string
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ")
}

/**
 * AI suggestions for keyword tracking and AI visibility.
 * Uses project context via /api/project-suggestions (not raw goal text as the seed).
 */
export function ProjectTrackSuggestions({
  projectId,
  kind,
  existingTexts,
  onAdd,
  languageId = "1014",
  regionId = "2620",
  className,
}: ProjectTrackSuggestionsProps) {
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
    queryKey: [
      "project-track-suggestions",
      kind,
      projectId,
      overviewQuery.data?.name,
      languageId,
      regionId,
    ],
    enabled: open && Boolean(overviewQuery.data?.name),
    queryFn: async () => {
      const overview = overviewQuery.data!
      const languageCode = languageId === "1000" ? "en" : "pt"
      const response = await fetch("/api/project-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          name: overview.name,
          description: overview.description,
          goal: overview.goal,
          projectUrl: overview.project_url,
          languageCode,
          languageId,
          regionId,
          existing: existingTexts,
          withVolumes: kind === "keywords",
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.error?.message || "Failed to load suggestions")
      }
      const items = (payload.items ?? []) as TrackSuggestionItem[]
      return items.filter((item) => item?.text)
    },
    staleTime: 10 * 60 * 1000,
  })

  const existingKeys = useMemo(
    () => new Set(existingTexts.map(normalizeKey).filter(Boolean)),
    [existingTexts],
  )

  const suggestions = useMemo(() => {
    const rows = suggestionsQuery.data ?? []
    return rows.filter((row) => !existingKeys.has(normalizeKey(row.text)))
  }, [existingKeys, suggestionsQuery.data])

  const toggle = (text: string) => {
    setSelected((prev) =>
      prev.includes(text) ? prev.filter((item) => item !== text) : [...prev, text],
    )
  }

  const handleAdd = async () => {
    if (selected.length === 0) return
    setIsAdding(true)
    try {
      await onAdd(selected)
      setSelected([])
      setOpen(false)
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
        Suggest {kind === "keywords" ? "keywords" : "prompts"}
      </Button>
    )
  }

  return (
    <div className={cn("space-y-3 rounded-lg border border-gray-200 bg-white p-3", className)}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs font-medium text-gray-900">
            Suggested {kind === "keywords" ? "keywords" : "prompts"}
          </div>
          <p className="mt-0.5 text-[11px] text-gray-500">
            {kind === "keywords"
              ? "Short search phrases with demand, based on this project’s market."
              : "Questions people ask AI tools in this category — not your internal goal."}
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
          Generating suggestions…
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
        <p className="text-xs text-gray-500">
          No new suggestions right now. Try adding one manually.
        </p>
      ) : (
        <div className="flex max-h-56 flex-wrap gap-2 overflow-y-auto">
          {suggestions.map((item) => {
            const isSelected = selected.includes(item.text)
            return (
              <button
                key={item.text}
                type="button"
                onClick={() => toggle(item.text)}
                className={cn(
                  "inline-flex max-w-full items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors",
                  isSelected
                    ? "border-sky-300 bg-sky-50 text-sky-900"
                    : "border-gray-200 bg-gray-50 text-gray-800 hover:border-gray-300 hover:bg-white",
                )}
              >
                <span
                  className={cn(
                    "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border",
                    isSelected
                      ? "border-sky-500 bg-sky-500 text-white"
                      : "border-gray-300 bg-white",
                  )}
                  aria-hidden
                >
                  {isSelected ? <Check className="h-2.5 w-2.5" /> : null}
                </span>
                <span className="min-w-0 truncate font-medium">{item.text}</span>
                {item.meta ? (
                  <span className="shrink-0 tabular-nums text-[10px] text-gray-500">
                    {item.meta}
                  </span>
                ) : null}
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
          onClick={() => setSelected(suggestions.map((item) => item.text))}
        >
          Select all
        </Button>
      </div>
    </div>
  )
}

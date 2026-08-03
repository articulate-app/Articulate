import { useCallback, useEffect, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"

export type PromptResearchEntity = {
  position: number
  name: string
  url: string | null
  snippet: string | null
}

export type PromptResearchResponse = {
  elapsedMs: number
  prompt: string
  languageCode: string
  answerSummary: string
  results: PromptResearchEntity[]
  relatedPrompts: string[]
  fullResponse?: string
  present?: boolean
  checkUrl?: string | null
  metadata?: Record<string, unknown>
}

export type PromptResearchFilters = {
  prompt: string
  languageCode: string
  /** Google Ads / DataForSEO location id for AI Overview market. */
  regionId?: string
}

type UsePromptResearchOptions = {
  enabled?: boolean
}

async function fetchPromptResearch(
  prompt: string,
  languageCode: string,
  mode: "brands" | "related" | "ai-overview" | "full",
  signal: AbortSignal,
  regionId?: string,
): Promise<PromptResearchResponse> {
  const response = await fetch("/api/prompt-research", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      languageCode: languageCode || "pt",
      regionId: regionId || undefined,
      mode,
    }),
    signal,
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(
      errorData.error?.message || `HTTP error! status: ${response.status}`,
    )
  }

  return response.json()
}

export function usePromptResearch(
  filters: PromptResearchFilters,
  options: UsePromptResearchOptions = {},
) {
  const { enabled = true } = options
  const abortControllerRef = useRef<AbortController | null>(null)
  const [debouncedPrompt, setDebouncedPrompt] = useState(filters.prompt)
  const wasEnabledRef = useRef(enabled)
  const [relatedPrompts, setRelatedPrompts] = useState<string[] | null>(null)
  const [isLoadingRelated, setIsLoadingRelated] = useState(false)
  const [aiOverview, setAiOverview] = useState<PromptResearchResponse | null>(null)
  const [isLoadingAiOverview, setIsLoadingAiOverview] = useState(false)
  const [aiOverviewError, setAiOverviewError] = useState<string | null>(null)
  const livePromptRef = useRef(filters.prompt)
  livePromptRef.current = filters.prompt

  useEffect(() => {
    const justEnabled = enabled && !wasEnabledRef.current
    wasEnabledRef.current = enabled
    if (justEnabled) {
      setDebouncedPrompt(filters.prompt)
      return
    }
    const timer = setTimeout(() => {
      setDebouncedPrompt(filters.prompt)
    }, 350)
    return () => clearTimeout(timer)
  }, [enabled, filters.prompt])

  const queryKey = [
    "prompt-research",
    debouncedPrompt,
    filters.languageCode,
    filters.regionId || "",
  ]

  const { data, isLoading, error, refetch, isFetching } = useQuery<PromptResearchResponse>({
    queryKey,
    queryFn: async () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
      abortControllerRef.current = new AbortController()
      setRelatedPrompts(null)
      setAiOverview(null)
      setAiOverviewError(null)
      const promptForSearch = livePromptRef.current.trim() || debouncedPrompt
      // Fast path: ChatGPT brands + summary first.
      return fetchPromptResearch(
        promptForSearch,
        filters.languageCode,
        "brands",
        abortControllerRef.current.signal,
        filters.regionId,
      )
    },
    enabled: enabled && debouncedPrompt.trim().length > 0,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })

  // Background phases: related prompts + Google AI Overview (do not block ChatGPT).
  useEffect(() => {
    if (!enabled || !data || !debouncedPrompt.trim()) return

    const relatedController = new AbortController()
    const overviewController = new AbortController()
    let cancelled = false

    setIsLoadingRelated(true)
    setIsLoadingAiOverview(true)
    setAiOverviewError(null)

    fetchPromptResearch(
      debouncedPrompt,
      filters.languageCode,
      "related",
      relatedController.signal,
      filters.regionId,
    )
      .then((related) => {
        if (cancelled) return
        setRelatedPrompts(related.relatedPrompts ?? [])
      })
      .catch(() => {
        if (!cancelled) setRelatedPrompts([])
      })
      .finally(() => {
        if (!cancelled) setIsLoadingRelated(false)
      })

    fetchPromptResearch(
      debouncedPrompt,
      filters.languageCode,
      "ai-overview",
      overviewController.signal,
      filters.regionId,
    )
      .then((overview) => {
        if (cancelled) return
        setAiOverview(overview)
      })
      .catch((err) => {
        if (cancelled) return
        setAiOverview(null)
        setAiOverviewError(
          err instanceof Error ? err.message : "Failed to load AI Overview",
        )
      })
      .finally(() => {
        if (!cancelled) setIsLoadingAiOverview(false)
      })

    return () => {
      cancelled = true
      relatedController.abort()
      overviewController.abort()
    }
  }, [data, debouncedPrompt, enabled, filters.languageCode, filters.regionId])

  const mergedData: PromptResearchResponse | undefined = data
    ? {
        ...data,
        relatedPrompts: relatedPrompts ?? data.relatedPrompts ?? [],
        metadata: {
          ...(data.metadata ?? {}),
          toolName:
            (data.metadata?.toolName as string | undefined) || "ChatGPT",
          toolCode:
            (data.metadata?.toolCode as string | undefined) || "chatgpt",
        },
      }
    : undefined

  const triggerSearch = useCallback((promptOverride?: string) => {
    const nextPrompt = (promptOverride ?? livePromptRef.current).trim()
    livePromptRef.current = nextPrompt
    setRelatedPrompts(null)
    setAiOverview(null)
    setAiOverviewError(null)
    // Flush debounce so Enter / tab-switch search uses the live prompt immediately.
    setDebouncedPrompt(nextPrompt)
    void refetch()
  }, [refetch])

  const canSearch = filters.prompt.trim().length > 0
  const hasResults = (mergedData?.results?.length ?? 0) > 0

  return {
    data: mergedData,
    aiOverview,
    isLoading: isLoading || (isFetching && !data),
    isLoadingRelated,
    isLoadingAiOverview,
    aiOverviewError,
    error,
    triggerSearch,
    canSearch,
    hasResults,
  }
}

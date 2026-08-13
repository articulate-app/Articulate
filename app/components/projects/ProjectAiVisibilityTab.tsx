"use client"

import { useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { format, subDays } from "date-fns"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from "recharts"
import { createClient } from "../../lib/supabase/client"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { Card } from "../ui/card"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import { DateRangePicker } from "../ui/date-range-picker"
import { MultiSelect } from "../ui/multi-select"
import { Loader2, AlertCircle } from "lucide-react"
import { toast } from "../ui/use-toast"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "../ui/select"
import {
  CHART_LINE_STROKE,
  formatChartAxisDate,
} from "./chart-date-range-footer"
import {
  ChartPreviewDateRangeButton,
  ChartPreviewHoverActions,
} from "./chart-preview-hover-actions"
import { AddDashedButton } from "../ui/add-dashed-button"
import { ProjectTrackSuggestions } from "./project-track-suggestions"
import { cn } from "@/lib/utils"
import {
  computeAiVisibilityScore,
  formatVisibilityScore,
} from "../../lib/ai-visibility-score"
import {
  groupAiPromptsByPrompt,
  type AiPromptToolResult,
} from "../../lib/ai-visibility-prompts"

type DateRangeValue = {
  from?: Date
  to?: Date
}

interface ProjectAiVisibilityTabProps {
  projectId: number
  /** Overview embed: brand-position chart + tracked prompts. Manage: list/add only. */
  variant?: "full" | "preview" | "manage"
  dateRange?: DateRangeValue
  onDateRangeChange?: (range: DateRangeValue) => void
}

type AiPromptRow = {
  project_ai_prompt_id: number
  project_id: number
  prompt_text: string
  language_code: string | null
  is_active: boolean | null
  created_at: string
  updated_at: string
  ai_tool_id: number
  ai_tool_code: string
  ai_tool_name: string
  run_at: string | null
  brand_position: number | null
  brand_name: string | null
  brand_url: string | null
  ranked_entities: any | null
}

type AiTool = {
  id: number
  code: string
  name: string
}

type AiTimeseriesPoint = {
  run_at: string
  brand_position: number | null
  brand_name: string | null
  brand_url: string | null
}

type Snapshot = {
  run_at: string
  brand_position: number | null
  brand_name: string | null
  brand_url: string | null
  ranked_entities: any
  full_response: string
}

type RankedEntity = {
  position?: number
  name?: string
  url?: string
  snippet?: string
}

const getDefaultDateRange = (days = 29): DateRangeValue => {
  const today = new Date()
  const from = subDays(today, days)
  return { from, to: today }
}

const formatShortDateTime = (dateStr: string) => {
  try {
    return format(new Date(dateStr), "MMM d, HH:mm")
  } catch {
    return dateStr
  }
}

/** Networks a prompt runs on, with this run's brand position on each. */
function PromptToolChips({
  tools,
  activeToolId,
  onSelect,
  className,
}: {
  tools: AiPromptToolResult[]
  activeToolId: number | null
  onSelect: (tool: AiPromptToolResult) => void
  className?: string
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      {tools.map((tool) => {
        const isActive = tool.toolId === activeToolId
        return (
          <button
            key={tool.toolId}
            type="button"
            onClick={() => onSelect(tool)}
            title={
              tool.brandPosition != null
                ? `${tool.toolName} · position #${tool.brandPosition}`
                : `${tool.toolName} · not mentioned`
            }
            className={cn(
              "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] transition-colors",
              isActive
                ? "border-gray-900 bg-gray-900 text-white"
                : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50",
            )}
          >
            <span>{tool.toolName}</span>
            <span
              className={cn(
                "tabular-nums",
                isActive ? "text-gray-300" : "text-gray-400",
              )}
            >
              {tool.brandPosition != null ? `#${tool.brandPosition}` : "—"}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export function ProjectAiVisibilityTab({
  projectId,
  variant = "full",
  dateRange: controlledDateRange,
  onDateRangeChange,
}: ProjectAiVisibilityTabProps) {
  const isPreview = variant === "preview"
  const isManage = variant === "manage"
  const supabase = useMemo(() => createClient(), [])
  const functionsClient = useMemo(() => createClientComponentClient(), [])
  const queryClient = useQueryClient()

  const [newPrompt, setNewPrompt] = useState("")
  const [newNotes, setNewNotes] = useState("")
  const [selectedToolIds, setSelectedToolIds] = useState<string[]>([])
  const [isAdding, setIsAdding] = useState(false)
  const [showPreviewAddForm, setShowPreviewAddForm] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isStopping, setIsStopping] = useState(false)

  const [selectedPromptId, setSelectedPromptId] = useState<number | null>(null)
  const [selectedToolId, setSelectedToolId] = useState<number | null>(null)
  const [filterToolId, setFilterToolId] = useState<string>("all")
  const [filterPromptQuery, setFilterPromptQuery] = useState("")

  const [uncontrolledDateRange, setUncontrolledDateRange] = useState<DateRangeValue>(() =>
    getDefaultDateRange(isPreview ? 6 : 29),
  )
  const dateRange = controlledDateRange ?? uncontrolledDateRange
  const setDateRange = onDateRangeChange ?? setUncontrolledDateRange
  const [selectedRunAt, setSelectedRunAt] = useState<Date | null>(null)

  const selectPromptTool = (promptId: number, tool: AiPromptToolResult) => {
    setSelectedPromptId(promptId)
    setSelectedToolId(tool.toolId)
    setSelectedRunAt(tool.runAt ? new Date(tool.runAt) : null)
  }

  const from = dateRange.from
  const to = dateRange.to

  const {
    data: prompts,
    isLoading: isLoadingPrompts,
    error: promptsError,
    refetch: refetchPrompts,
  } = useQuery<AiPromptRow[]>({
    queryKey: ["project-ai-prompts", projectId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("v_project_ai_prompts_with_latest_result")
        .select("*")
        .eq("project_id", projectId)
        .order("prompt_text", { ascending: true })

      if (error) {
        throw error
      }

      return (data || []) as AiPromptRow[]
    },
  })

  const { data: tools, isLoading: isLoadingTools } = useQuery<AiTool[]>({
    queryKey: ["ai-tools"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("ai_tools")
        .select("id, code, name")
        .eq("is_active", true)
        .order("name", { ascending: true })

      if (error) {
        throw error
      }

      return (data || []) as AiTool[]
    },
  })

  const {
    data: timeseries,
    isLoading: isLoadingTimeseries,
    error: timeseriesError,
    refetch: refetchTimeseries,
  } = useQuery<AiTimeseriesPoint[]>({
    queryKey: [
      "project-ai-timeseries",
      projectId,
      selectedPromptId,
      selectedToolId,
      from ? from.toISOString() : null,
      to ? to.toISOString() : null,
    ],
    enabled: !!selectedPromptId && !!selectedToolId && !!from && !!to,
    queryFn: async () => {
      if (!selectedPromptId || !selectedToolId || !from || !to) return []

      const { data, error } = await (supabase as any).rpc(
        "fn_get_project_ai_prompt_timeseries",
        {
          p_project_id: projectId,
          p_project_ai_prompt_id: selectedPromptId,
          p_ai_tool_id: selectedToolId,
          p_start_at: from.toISOString(),
          p_end_at: to.toISOString(),
        },
      )

      if (error) {
        throw error
      }

      return (data || []) as AiTimeseriesPoint[]
    },
  })

  const {
    data: globalTimeseries,
    isLoading: isLoadingGlobalTimeseries,
    error: globalTimeseriesError,
  } = useQuery<
    Array<{
      run_date: string
      best_position: number | null
      avg_position: number | null
      prompts_tracked: number
      prompts_mentioned: number
      visibility_score: number | null
    }>
  >({
    queryKey: [
      "project-ai-global-timeseries",
      projectId,
      from ? from.toISOString() : null,
      to ? to.toISOString() : null,
      filterToolId,
      selectedPromptId,
    ],
    enabled: !!from && !!to && !isManage,
    queryFn: async () => {
      if (!from || !to) return []

      const { data, error } = await (supabase as any).rpc(
        "fn_get_project_ai_global_timeseries",
        {
          p_project_id: projectId,
          p_start_at: from.toISOString(),
          p_end_at: to.toISOString(),
          p_ai_tool_id:
            filterToolId !== "all" && Number.isFinite(Number(filterToolId))
              ? Number(filterToolId)
              : null,
          // Global score ignores single-prompt selection; chart can still switch below.
          p_project_ai_prompt_id: null,
        },
      )
      if (error) throw error
      return (data || []) as Array<{
        run_date: string
        best_position: number | null
        avg_position: number | null
        prompts_tracked: number
        prompts_mentioned: number
        visibility_score: number | null
      }>
    },
  })

  const latestVisibility = useMemo(() => {
    if (!prompts?.length) {
      return computeAiVisibilityScore([])
    }
    const filtered = prompts.filter((row) => {
      if (filterToolId !== "all" && String(row.ai_tool_id) !== filterToolId) return false
      const q = filterPromptQuery.trim().toLowerCase()
      if (q && !row.prompt_text.toLowerCase().includes(q)) return false
      return true
    })
    return computeAiVisibilityScore(
      filtered.map((row) => ({ brand_position: row.brand_position })),
    )
  }, [filterPromptQuery, filterToolId, prompts])

  const filteredPrompts = useMemo(() => {
    if (!prompts) return []
    return prompts.filter((row) => {
      if (filterToolId !== "all" && String(row.ai_tool_id) !== filterToolId) return false
      const q = filterPromptQuery.trim().toLowerCase()
      if (q && !row.prompt_text.toLowerCase().includes(q)) return false
      return true
    })
  }, [filterPromptQuery, filterToolId, prompts])

  const globalChartSeries = useMemo(() => {
    return (globalTimeseries ?? []).map((row) => ({
      run_at: `${row.run_date}T12:00:00`,
      visibility_score: row.visibility_score,
      avg_position: row.avg_position,
      best_position: row.best_position,
      prompts_mentioned: row.prompts_mentioned,
      prompts_tracked: row.prompts_tracked,
    }))
  }, [globalTimeseries])

  const {
    data: snapshotData,
    isLoading: isLoadingSnapshot,
    error: snapshotError,
    refetch: refetchSnapshot,
  } = useQuery<Snapshot[]>({
    queryKey: [
      "project-ai-snapshot",
      selectedPromptId,
      selectedToolId,
      selectedRunAt ? selectedRunAt.toISOString() : null,
    ],
    enabled: !!selectedPromptId && !!selectedToolId,
    queryFn: async () => {
      if (!selectedPromptId || !selectedToolId) return []

      const { data, error } = await (supabase as any).rpc(
        "fn_get_project_ai_prompt_snapshot",
        {
          p_project_ai_prompt_id: selectedPromptId,
          p_ai_tool_id: selectedToolId,
          p_run_at: selectedRunAt ? selectedRunAt.toISOString() : null,
        },
      )

      if (error) {
        throw error
      }

      return (data || []) as Snapshot[]
    },
  })

  const snapshot = snapshotData && snapshotData.length > 0 ? snapshotData[0] : null

  const handleAddSuggestedPrompts = async (texts: string[]) => {
    const promptsToAdd = texts.map((text) => text.trim()).filter(Boolean)
    if (promptsToAdd.length === 0) return

    const toolIds =
      selectedToolIds.length > 0
        ? selectedToolIds
        : (tools ?? []).map((tool) => String(tool.id))

    if (toolIds.length === 0) {
      toast({
        title: "Select at least one tool",
        description: "Choose which AI tools to track before adding suggestions.",
        variant: "destructive",
      })
      throw new Error("No AI tools selected")
    }

    setIsAdding(true)
    try {
      let added = 0
      for (const promptText of promptsToAdd) {
        const { data: promptInsert, error: promptError } = await (supabase as any).rpc(
          "fn_add_project_ai_prompt",
          {
            p_project_id: projectId,
            p_prompt_text: promptText,
            p_notes: null,
          },
        )
        if (promptError || !promptInsert) {
          throw promptError || new Error("Failed to create AI prompt.")
        }
        const promptId = (promptInsert as { id: number }).id
        const { error: toolsError } = await (supabase as any)
          .from("project_ai_prompt_tools")
          .insert(
            toolIds.map((id) => ({
              project_ai_prompt_id: promptId,
              ai_tool_id: Number(id),
            })),
          )
        if (toolsError) throw toolsError
        added += 1
      }

      await refetchPrompts()
      toast({
        title: added === 1 ? "Prompt added" : `${added} prompts added`,
        description: "They will be included the next time you run AI visibility.",
      })
      void functionsClient.functions.invoke("sync-project-ai-prompts", {
        body: { project_id: projectId },
      })
    } catch (error: unknown) {
      toast({
        title: "Could not add suggestions",
        description:
          error instanceof Error ? error.message : "Failed to add prompts.",
        variant: "destructive",
      })
      throw error
    } finally {
      setIsAdding(false)
    }
  }

  const handleAddPrompt = async () => {
    if (!newPrompt.trim()) {
      toast({
        title: "Prompt required",
        description: "Please enter an AI prompt.",
        variant: "destructive",
      })
      return
    }

    if (!selectedToolIds.length) {
      toast({
        title: "Select at least one tool",
        description: "Choose which AI tools to track for this prompt.",
        variant: "destructive",
      })
      return
    }

    setIsAdding(true)
    try {
      const { data: promptInsert, error: promptError } = await (supabase as any).rpc(
        "fn_add_project_ai_prompt",
        {
          p_project_id: projectId,
          p_prompt_text: newPrompt.trim(),
          p_notes: newNotes.trim() ? newNotes.trim() : null,
        },
      )

      if (promptError || !promptInsert) {
        throw promptError || new Error("Failed to create AI prompt.")
      }

      const promptId = (promptInsert as any).id as number

      const toolRows = selectedToolIds.map((id) => ({
        project_ai_prompt_id: promptId,
        ai_tool_id: Number(id),
      }))

      const { error: toolsError } = await (supabase as any)
        .from("project_ai_prompt_tools")
        .insert(toolRows)

      if (toolsError) {
        throw toolsError
      }

      setNewPrompt("")
      setNewNotes("")
      setSelectedToolIds([])
      setShowPreviewAddForm(false)

      await refetchPrompts()

      setSelectedPromptId(promptId)
      setSelectedToolId(Number(selectedToolIds[0]))

      const { error: fnError } = await functionsClient.functions.invoke(
        "sync-project-ai-prompts",
        { body: { project_id: projectId } },
      )

      if (fnError) {
        console.error("AI visibility sync after add failed:", fnError)
        toast({
          title: "Prompt added, but sync failed",
          description: "The AI visibility sync failed. Please try 'Run now'.",
          variant: "destructive",
        })
        return
      }

      await Promise.all([refetchPrompts(), refetchTimeseries(), refetchSnapshot()])

      toast({
        title: "Prompt added",
        description: "AI visibility has been refreshed for this project.",
      })
    } catch (error: any) {
      console.error("Error adding AI prompt:", error)
      toast({
        title: "Error adding prompt",
        description: error?.message || "Failed to add AI prompt.",
        variant: "destructive",
      })
    } finally {
      setIsAdding(false)
    }
  }

  const handleRunNow = async () => {
    setIsSyncing(true)
    try {
      const { error: fnError } = await functionsClient.functions.invoke(
        "sync-project-ai-prompts",
        { body: { project_id: projectId } },
      )

      if (fnError) {
        console.error("AI visibility sync failed:", fnError)
        toast({
          title: "Failed to run AI visibility",
          description: "Please try again in a few moments.",
          variant: "destructive",
        })
        return
      }

      toast({
        title: "AI visibility updated",
        description: "Latest AI responses have been fetched.",
      })

      await Promise.all([refetchPrompts(), refetchTimeseries(), refetchSnapshot()])
    } catch (error: any) {
      console.error("Error syncing AI visibility:", error)
      toast({
        title: "Error running AI visibility",
        description: error?.message || "Unexpected error while syncing.",
        variant: "destructive",
      })
    } finally {
      setIsSyncing(false)
    }
  }

  const handleStopTracking = async () => {
    if (!selectedPromptId) {
      toast({
        title: "Select a prompt",
        description: "Choose a prompt from the table to stop tracking.",
        variant: "destructive",
      })
      return
    }

    setIsStopping(true)
    try {
      const { error } = await (supabase as any)
        .from("project_ai_prompts")
        .update({
          is_active: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", selectedPromptId)

      if (error) {
        throw error
      }

      queryClient.setQueryData<AiPromptRow[]>(
        ["project-ai-prompts", projectId],
        (old: AiPromptRow[] | undefined) =>
          old
            ? old.filter(
                (row) => row.project_ai_prompt_id !== selectedPromptId,
              )
            : old,
      )

      setSelectedPromptId(null)
      setSelectedToolId(null)
      setSelectedRunAt(null)

      toast({
        title: "Stopped tracking prompt",
        description:
          "We will keep historical data, but no new runs will be triggered for this prompt.",
      })
    } catch (error: any) {
      console.error("Error stopping AI prompt tracking:", error)
      toast({
        title: "Error stopping tracking",
        description:
          error?.message || "Failed to stop tracking this AI prompt.",
        variant: "destructive",
      })
    } finally {
      setIsStopping(false)
    }
  }

  const hasPrompts = prompts && prompts.length > 0

  const selectedTool =
    tools && selectedToolId != null
      ? tools.find((t) => t.id === selectedToolId) || null
      : null

  const toolOptions =
    tools?.map((tool) => ({
      id: String(tool.id),
      label: tool.name,
    })) ?? []

  const rankedEntities: RankedEntity[] = Array.isArray(
    snapshot?.ranked_entities,
  )
    ? (snapshot!.ranked_entities as RankedEntity[])
    : []

  // One entry per prompt, with the networks it runs on — the same prompt tracked
  // on ChatGPT and Gemini is one prompt, not two.
  const groupedPrompts = useMemo(
    () => groupAiPromptsByPrompt(prompts ?? []),
    [prompts],
  )
  const groupedFilteredPrompts = useMemo(
    () => groupAiPromptsByPrompt(filteredPrompts),
    [filteredPrompts],
  )

  const showPromptChart = !!selectedPromptId && !!selectedToolId
  const chartSeries = showPromptChart ? timeseries : globalChartSeries
  const isLoadingChart = showPromptChart
    ? isLoadingTimeseries
    : isLoadingGlobalTimeseries
  const chartError = showPromptChart ? timeseriesError : globalTimeseriesError
  const hasChartData = !!chartSeries?.length

  const visibilityFilters = (
    <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <Input
        value={filterPromptQuery}
        onChange={(e) => setFilterPromptQuery(e.target.value)}
        placeholder="Filter prompts…"
        className="h-8 w-full text-xs sm:max-w-xs"
      />
      <Select value={filterToolId} onValueChange={setFilterToolId}>
        <SelectTrigger className="h-8 w-full text-xs sm:w-44">
          <SelectValue placeholder="All tools" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all" className="text-xs">
            All tools
          </SelectItem>
          {(tools ?? []).map((tool) => (
            <SelectItem key={tool.id} value={String(tool.id)} className="text-xs">
              {tool.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!isPreview && !isManage ? (
        <div className="w-full min-w-0 sm:w-56">
          <DateRangePicker value={dateRange} onChange={(range) => setDateRange(range)} />
        </div>
      ) : null}
    </div>
  )

  const brandPositionChart = (
    <Card className="min-w-0 p-4 md:p-6">
      <div className="mb-3 flex min-w-0 flex-col gap-3">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-gray-900">
              {showPromptChart ? "Brand position over time" : "Visibility score over time"}
            </h4>
            <p className="text-[11px] text-gray-500">
              {showPromptChart
                ? "Lower position is better (1 = top mention)."
                : "Aggregate across tracked prompts (mention rate + position quality)."}
            </p>
            {showPromptChart && selectedTool ? (
              <p className="mt-1 text-[11px] text-gray-500">
                Tool:{" "}
                <span className="font-medium text-gray-900">{selectedTool.name}</span>
              </p>
            ) : null}
          </div>
          <div className="shrink-0 text-right">
            <div className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
              {showPromptChart ? "Prompt position" : "Global score"}
            </div>
            <div className="text-xl font-semibold tabular-nums text-gray-900">
              {showPromptChart
                ? snapshot?.brand_position != null
                  ? `#${snapshot.brand_position}`
                  : "—"
                : (
                    <>
                      {formatVisibilityScore(latestVisibility.visibilityScore)}
                      <span className="ml-1 text-sm font-normal text-gray-400">/ 100</span>
                    </>
                  )}
            </div>
            {!showPromptChart ? (
              <div className="text-[11px] text-gray-500">
                {latestVisibility.mentionedCount}/{latestVisibility.trackedCount} mentioned
                {latestVisibility.avgPosition != null
                  ? ` · avg #${latestVisibility.avgPosition}`
                  : ""}
              </div>
            ) : null}
          </div>
        </div>
        {visibilityFilters}
        {showPromptChart ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 w-fit px-2 text-xs text-gray-500"
            onClick={() => {
              setSelectedPromptId(null)
              setSelectedToolId(null)
              setSelectedRunAt(null)
            }}
          >
            Show global score
          </Button>
        ) : null}
      </div>

      <div className="h-64 min-w-0">
        {!hasPrompts ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-500">
            Add prompts below to start tracking AI visibility.
          </div>
        ) : isLoadingChart ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-500">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Loading visibility…
          </div>
        ) : chartError ? (
          <div className="flex h-full items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <AlertCircle className="h-4 w-4" />
            <span>Failed to load visibility history.</span>
          </div>
        ) : !hasChartData ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-500">
            {showPromptChart
              ? "No runs yet for this prompt and tool. Use “Run now” to fetch AI responses."
              : "No AI visibility runs yet for this period."}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartSeries}
              onClick={(e: any) => {
                if (!showPromptChart) return
                const payload =
                  e && e.activePayload && e.activePayload[0]
                    ? e.activePayload[0].payload
                    : null
                if (payload && payload.run_at) {
                  setSelectedRunAt(new Date(payload.run_at))
                }
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="run_at"
                stroke="#6b7280"
                style={{ fontSize: "12px" }}
                tickFormatter={showPromptChart ? formatShortDateTime : formatChartAxisDate}
              />
              <YAxis
                stroke="#6b7280"
                style={{ fontSize: "12px" }}
                reversed={showPromptChart}
                domain={showPromptChart ? [1, "dataMax + 1"] : [0, 100]}
                allowDecimals={!showPromptChart}
              />
              <RechartsTooltip
                formatter={(value: any) => {
                  const v = value as number | null
                  if (showPromptChart) {
                    if (v == null) return ["Not mentioned", "Position"]
                    return [`#${v}`, "Position"]
                  }
                  if (v == null) return ["—", "Visibility"]
                  return [v, "Visibility score"]
                }}
                labelFormatter={(label) =>
                  showPromptChart
                    ? `Run at: ${format(new Date(label), "yyyy-MM-dd HH:mm")}`
                    : `Date: ${format(new Date(label), "yyyy-MM-dd")}`
                }
              />
              <Line
                type="monotone"
                dataKey={showPromptChart ? "brand_position" : "visibility_score"}
                stroke={CHART_LINE_STROKE}
                strokeWidth={2}
                dot={showPromptChart ? { r: 3 } : false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  )

  if (isPreview) {
    const previewShowPromptChart =
      !!selectedPromptId && !!selectedToolId && !!timeseries?.length
    const chartData = previewShowPromptChart ? timeseries : globalChartSeries
    const isLoadingChartPreview = previewShowPromptChart
      ? isLoadingTimeseries
      : isLoadingGlobalTimeseries
    const chartErrorPreview = previewShowPromptChart
      ? timeseriesError
      : globalTimeseriesError
    const hasChart = !!chartData?.length
    const chartAvailable = Boolean(hasPrompts)
    const previewEntities = Array.isArray(snapshot?.ranked_entities)
      ? (snapshot!.ranked_entities as RankedEntity[])
      : []

    const previewAddForm = (
      <div className="space-y-3 rounded-lg border border-dashed border-gray-200 p-3">
        <div className="space-y-1">
          <Label htmlFor="overview-new-prompt" className="text-xs">
            Prompt
          </Label>
          <Input
            id="overview-new-prompt"
            placeholder="e.g. What are the best SEO agencies in Lisbon?"
            value={newPrompt}
            onChange={(e) => setNewPrompt(e.target.value)}
            className="h-8 text-xs"
            autoFocus
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">AI tools</Label>
          <MultiSelect
            options={toolOptions}
            value={selectedToolIds}
            onChange={setSelectedToolIds}
            placeholder={isLoadingTools ? "Loading tools…" : "Select AI tools to track"}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" onClick={handleAddPrompt} disabled={isAdding}>
            {isAdding ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Adding…
              </>
            ) : (
              <>Add prompt</>
            )}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setShowPreviewAddForm(false)}
            disabled={isAdding}
          >
            Cancel
          </Button>
        </div>
      </div>
    )

    if (isLoadingPrompts) {
      return (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      )
    }

    if (!hasPrompts) {
      return (
        <div className="min-w-0 space-y-3">
          <ProjectTrackSuggestions
            projectId={projectId}
            kind="prompts"
            existingTexts={[]}
            onAdd={handleAddSuggestedPrompts}
          />
          {showPreviewAddForm ? (
            previewAddForm
          ) : (
            <AddDashedButton
              label="Add prompt"
              className="mt-0"
              onClick={() => setShowPreviewAddForm(true)}
            />
          )}
        </div>
      )
    }

    return (
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
              {selectedPromptId && selectedToolId ? "Prompt position" : "Visibility score"}
            </div>
            <div className="text-2xl font-semibold tabular-nums text-gray-900">
              {selectedPromptId && selectedToolId ? (
                snapshot?.brand_position != null ? (
                  `#${snapshot.brand_position}`
                ) : (
                  "—"
                )
              ) : (
                <>
                  {formatVisibilityScore(latestVisibility.visibilityScore)}
                  <span className="ml-1 text-sm font-normal text-gray-400">/ 100</span>
                </>
              )}
            </div>
            {!(selectedPromptId && selectedToolId) ? (
              <div className="mt-0.5 text-[11px] text-gray-500">
                {latestVisibility.mentionedCount}/{latestVisibility.trackedCount} mentioned
                {latestVisibility.avgPosition != null
                  ? ` · avg #${latestVisibility.avgPosition}`
                  : ""}
              </div>
            ) : null}
          </div>
          <div className="w-full min-w-0 sm:max-w-md sm:flex-1">
            <Select
              value={
                selectedPromptId != null && selectedToolId != null
                  ? `${selectedPromptId}:${selectedToolId}`
                  : "global"
              }
              onValueChange={(value) => {
                if (value === "global") {
                  setSelectedPromptId(null)
                  setSelectedToolId(null)
                  setSelectedRunAt(null)
                  return
                }
                const [promptIdRaw, toolIdRaw] = value.split(":")
                const promptId = Number(promptIdRaw)
                const toolId = Number(toolIdRaw)
                if (!Number.isFinite(promptId) || !Number.isFinite(toolId)) return
                const tool = groupedPrompts
                  .find((group) => group.promptId === promptId)
                  ?.tools.find((entry) => entry.toolId === toolId)
                if (!tool) return
                selectPromptTool(promptId, tool)
              }}
            >
              <SelectTrigger className="h-8 w-full text-xs">
                <SelectValue placeholder="Global score" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="global" className="text-xs">
                  Global score (all prompts)
                </SelectItem>
                {groupedPrompts.map((group) => (
                  <SelectGroup key={group.promptId}>
                    <SelectLabel className="pr-2 text-[11px] font-medium text-gray-500">
                      <span className="line-clamp-2">{group.promptText}</span>
                    </SelectLabel>
                    {group.tools.map((tool) => (
                      <SelectItem
                        key={tool.toolId}
                        value={`${group.promptId}:${tool.toolId}`}
                        className="text-xs"
                      >
                        {tool.toolName}
                        {tool.brandPosition != null ? ` · #${tool.brandPosition}` : ""}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <ChartPreviewHoverActions
          enabled={chartAvailable}
          actions={<ChartPreviewDateRangeButton value={dateRange} onChange={setDateRange} />}
        >
          <div className="h-64 min-w-0">
            {isLoadingChartPreview ? (
              <div className="flex h-full items-center justify-center text-sm text-gray-500">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Loading visibility…
              </div>
            ) : chartErrorPreview ? (
              <div className="flex h-full items-center gap-2 text-xs text-red-700">
                <AlertCircle className="h-4 w-4" />
                <span>Failed to load visibility history.</span>
              </div>
            ) : !hasChart ? (
              <div className="flex h-full items-center justify-center text-sm text-gray-500">
                No AI visibility runs yet for this period.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartData}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="run_at"
                    stroke="#6b7280"
                    style={{ fontSize: "12px" }}
                    tickFormatter={formatChartAxisDate}
                    tickMargin={8}
                  />
                  <YAxis
                    width={36}
                    stroke="#6b7280"
                    style={{ fontSize: "12px" }}
                    reversed={previewShowPromptChart}
                    domain={previewShowPromptChart ? [1, "dataMax + 1"] : [0, 100]}
                    allowDecimals={!previewShowPromptChart}
                  />
                  <RechartsTooltip
                    formatter={(value: any) => {
                      const v = value as number | null
                      if (previewShowPromptChart) {
                        if (v == null) return ["Not mentioned", "Position"]
                        return [`#${v}`, "Position"]
                      }
                      if (v == null) return ["—", "Visibility"]
                      return [v, "Visibility score"]
                    }}
                    labelFormatter={(label) =>
                      `Date: ${format(new Date(label), "yyyy-MM-dd")}`
                    }
                  />
                  <Line
                    type="monotone"
                    dataKey={
                      previewShowPromptChart ? "brand_position" : "visibility_score"
                    }
                    stroke={CHART_LINE_STROKE}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </ChartPreviewHoverActions>

        {selectedPromptId && selectedToolId ? (
          <div className="space-y-2">
            <div className="text-[11px] font-medium text-gray-500">
              Top results
              {snapshot?.run_at
                ? ` · ${format(new Date(snapshot.run_at), "MMM d, HH:mm")}`
                : ""}
            </div>
            {isLoadingSnapshot ? (
              <div className="flex items-center gap-2 py-3 text-xs text-gray-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading entities…
              </div>
            ) : previewEntities.length === 0 ? (
              <p className="text-xs text-gray-500">No entities for this prompt yet.</p>
            ) : (
              <div className="divide-y divide-gray-100 rounded-md border border-gray-100">
                {previewEntities.slice(0, 5).map((entity, index) => (
                  <div key={`${entity.name}-${index}`} className="px-3 py-2">
                    <div className="text-xs font-medium text-gray-900">
                      {(entity.position ?? index + 1) + ". "}
                      {entity.name || "Untitled"}
                    </div>
                    {entity.url ? (
                      <a
                        href={entity.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-0.5 block truncate text-[11px] text-gray-500 hover:text-gray-700"
                      >
                        {entity.url}
                      </a>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}

        <div className="space-y-2">
          <div className="text-[11px] font-medium text-gray-500">Tracked prompts</div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {groupedPrompts.map((group) => {
              const isSelected = group.promptId === selectedPromptId
              return (
                <div
                  key={group.promptId}
                  className={cn(
                    "min-w-0 rounded-md border px-2.5 py-2 transition-colors",
                    isSelected
                      ? "border-gray-900 bg-gray-50"
                      : "border-gray-200 bg-white",
                  )}
                >
                  <button
                    type="button"
                    onClick={() =>
                      group.tools[0]
                        ? selectPromptTool(group.promptId, group.tools[0])
                        : undefined
                    }
                    className="block w-full text-left"
                  >
                    <span className="line-clamp-2 text-xs text-gray-800">
                      {group.promptText}
                    </span>
                  </button>
                  <PromptToolChips
                    className="mt-1.5"
                    tools={group.tools}
                    activeToolId={isSelected ? selectedToolId : null}
                    onSelect={(tool) => selectPromptTool(group.promptId, tool)}
                  />
                </div>
              )
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ProjectTrackSuggestions
              projectId={projectId}
              kind="prompts"
              existingTexts={(prompts ?? []).map((row) => row.prompt_text)}
              onAdd={handleAddSuggestedPrompts}
            />
            {showPreviewAddForm ? null : (
              <AddDashedButton
                label="Add prompt"
                className="mt-0"
                onClick={() => setShowPreviewAddForm(true)}
              />
            )}
          </div>
          {showPreviewAddForm ? previewAddForm : null}
        </div>
      </div>
    )
  }

  const promptsManagementCard = (
      <Card className="min-w-0 p-4 md:p-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-gray-900">
              AI prompts & tools
            </h3>
            <p className="text-xs text-gray-500">
              Configure prompts and track how your brand appears in AI answers.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={handleRunNow}
              disabled={isSyncing}
            >
              {isSyncing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Running…
                </>
              ) : (
                <>Run now</>
              )}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleStopTracking}
              disabled={isStopping || !selectedPromptId}
            >
              {isStopping ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Stopping…
                </>
              ) : (
                <>Stop tracking</>
              )}
            </Button>
          </div>
        </div>

        {isManage ? (
          <div className="mb-4">{visibilityFilters}</div>
        ) : null}

        <div className="mb-4 grid min-w-0 gap-3 md:grid-cols-3">
          <div className="min-w-0 space-y-1 md:col-span-2">
            <Label htmlFor="new-prompt" className="text-xs">
              Prompt
            </Label>
            <Input
              id="new-prompt"
              placeholder="e.g. What are the best SEO agencies in Lisbon?"
              value={newPrompt}
              onChange={(e) => setNewPrompt(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <div className="min-w-0 space-y-1">
            <Label htmlFor="new-notes" className="text-xs">
              Notes (optional)
            </Label>
            <Input
              id="new-notes"
              placeholder="Internal notes about this prompt (optional)"
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
        </div>

        <div className="mb-4 grid min-w-0 gap-3 md:grid-cols-3 md:items-end">
          <div className="min-w-0 space-y-1 md:col-span-2">
            <Label className="text-xs">AI tools</Label>
            <MultiSelect
              options={toolOptions}
              value={selectedToolIds}
              onChange={setSelectedToolIds}
              placeholder={
                isLoadingTools ? "Loading tools…" : "Select AI tools to track"
              }
            />
          </div>
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
            <Button
              type="button"
              size="sm"
              className="w-full shrink-0 sm:w-auto"
              onClick={handleAddPrompt}
              disabled={isAdding}
            >
              {isAdding ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding…
                </>
              ) : (
                <>Add prompt</>
              )}
            </Button>
            <ProjectTrackSuggestions
              projectId={projectId}
              kind="prompts"
              existingTexts={(prompts ?? []).map((row) => row.prompt_text)}
              onAdd={handleAddSuggestedPrompts}
            />
            <p className="text-[11px] text-gray-500">
              New prompts will be included the next time you run AI visibility.
            </p>
          </div>
        </div>

        {isLoadingPrompts ? (
          <div className="flex items-center justify-center py-8 text-sm text-gray-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading prompts…
          </div>
        ) : promptsError ? (
          <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <AlertCircle className="h-4 w-4" />
            <span>Failed to load AI prompts.</span>
          </div>
        ) : !hasPrompts ? (
          <div className="rounded-md bg-gray-50 px-3 py-4 text-sm text-gray-600">
            No AI prompts configured yet. Add your first prompt to start tracking
            AI visibility.
          </div>
        ) : !filteredPrompts.length ? (
          <div className="rounded-md bg-gray-50 px-3 py-4 text-sm text-gray-600">
            No prompts match the current filters.
          </div>
        ) : (
          <div className="divide-y divide-gray-100 rounded-md border border-gray-100">
            {groupedFilteredPrompts.map((group) => {
              const isSelected = group.promptId === selectedPromptId
              const lastRunAt = group.tools
                .map((tool) => tool.runAt)
                .filter((value): value is string => Boolean(value))
                .sort()
                .at(-1)
              return (
                <div
                  key={group.promptId}
                  className={cn(
                    "flex flex-col gap-2 px-3 py-2.5 transition-colors sm:flex-row sm:items-center sm:justify-between",
                    isSelected && "bg-gray-50",
                  )}
                >
                  <button
                    type="button"
                    className="min-w-0 text-left"
                    onClick={() =>
                      group.tools[0]
                        ? selectPromptTool(group.promptId, group.tools[0])
                        : undefined
                    }
                  >
                    <div className="line-clamp-2 text-xs text-gray-900">
                      {group.promptText}
                    </div>
                    <div className="mt-0.5 text-[11px] text-gray-500">
                      {group.tools.length === 1
                        ? group.tools[0]!.toolName
                        : `${group.tools.length} networks`}
                      {lastRunAt
                        ? ` · ${format(new Date(lastRunAt), "MMM d, yyyy")}`
                        : ""}
                    </div>
                  </button>
                  <PromptToolChips
                    className="shrink-0 sm:justify-end"
                    tools={group.tools}
                    activeToolId={isSelected ? selectedToolId : null}
                    onSelect={(tool) => selectPromptTool(group.promptId, tool)}
                  />
                </div>
              )
            })}
          </div>
        )}
      </Card>
  )

  if (isManage) {
    return <div className="min-w-0">{promptsManagementCard}</div>
  }

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">AI visibility</h2>
      </div>

      {brandPositionChart}

      <Card className="min-w-0 p-4 md:p-6">
        <div className="mb-3">
          <h4 className="text-sm font-semibold text-gray-900">
            Latest entities in answer
          </h4>
          <p className="text-[11px] text-gray-500">
            Top brands, URLs, and entities extracted from the selected run.
          </p>
        </div>

        {!selectedPromptId || !selectedToolId ? (
          <div className="flex h-32 items-center justify-center text-sm text-gray-500">
            Select a prompt below to inspect ranked entities.
          </div>
        ) : isLoadingSnapshot ? (
          <div className="flex h-40 items-center justify-center text-sm text-gray-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading entities…
          </div>
        ) : snapshotError ? (
          <div className="flex h-40 items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <AlertCircle className="h-4 w-4" />
            <span>
              {snapshotError instanceof Error
                ? snapshotError.message
                : "Failed to load entities snapshot."}
            </span>
          </div>
        ) : !snapshot ? (
          <div className="flex h-40 items-center justify-center text-sm text-gray-500">
            No snapshot available. Select a run from the chart or run AI
            visibility.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-[11px] text-gray-600">
              <div>
                Run at:{" "}
                <span className="font-medium text-gray-900">
                  {format(new Date(snapshot.run_at), "yyyy-MM-dd HH:mm")}
                </span>
                {selectedTool ? (
                  <>
                    {" "}
                    ·{" "}
                    <span className="font-medium text-gray-900">{selectedTool.name}</span>
                  </>
                ) : null}
              </div>
              {snapshot.brand_position != null ? (
                <div>
                  Your brand appears at position{" "}
                  <span className="font-semibold">#{snapshot.brand_position}</span>
                  {snapshot.brand_url && (
                    <>
                      {" "}
                      with URL{" "}
                      <a
                        href={snapshot.brand_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800"
                      >
                        {snapshot.brand_url}
                      </a>
                      .
                    </>
                  )}
                </div>
              ) : (
                <div>Your brand is not mentioned in this answer.</div>
              )}
            </div>

            <div className="max-h-64 min-w-0 overflow-auto rounded-md border">
              <table className="w-full min-w-[28rem] table-fixed text-left text-xs">
                <thead className="border-b bg-gray-50 text-[11px] font-medium uppercase text-gray-500">
                  <tr>
                    <th className="w-14 px-3 py-2">Pos</th>
                    <th className="px-3 py-2">Brand / Name</th>
                    <th className="hidden px-3 py-2 sm:table-cell">URL</th>
                    <th className="hidden px-3 py-2 md:table-cell">Snippet</th>
                  </tr>
                </thead>
                <tbody>
                  {rankedEntities.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-3 py-3 text-center text-xs text-gray-500"
                      >
                        No entities parsed from this answer.
                      </td>
                    </tr>
                  ) : (
                    rankedEntities.map((entity, index) => {
                      const isBrandMatch =
                        (snapshot.brand_url &&
                          entity.url === snapshot.brand_url) ||
                        (snapshot.brand_name &&
                          entity.name === snapshot.brand_name)
                      return (
                        <tr
                          key={`${entity.name || entity.url || index}`}
                          className={`border-b last:border-0 ${
                            isBrandMatch ? "bg-blue-50/60" : ""
                          }`}
                        >
                          <td className="px-3 py-2 text-xs text-gray-700">
                            {entity.position ?? index + 1}
                          </td>
                          <td className="min-w-0 px-3 py-2 text-xs text-gray-900">
                            <div className="truncate">{entity.name || "—"}</div>
                            {entity.url ? (
                              <a
                                href={entity.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-0.5 block truncate text-[11px] text-blue-600 hover:text-blue-800 sm:hidden"
                                title={entity.url}
                              >
                                {entity.url}
                              </a>
                            ) : null}
                          </td>
                          <td className="hidden min-w-0 px-3 py-2 text-xs text-gray-700 sm:table-cell">
                            {entity.url ? (
                              <a
                                href={entity.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-block max-w-full truncate text-blue-600 hover:text-blue-800"
                                title={entity.url}
                              >
                                {entity.url}
                              </a>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                          <td className="hidden min-w-0 px-3 py-2 text-xs text-gray-700 md:table-cell">
                            <span className="line-clamp-2">
                              {entity.snippet || "—"}
                            </span>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>

      {promptsManagementCard}
    </div>
  )
}



"use client"

import { useEffect, useMemo, useState } from "react"
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
  SelectItem,
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
import { cn } from "@/lib/utils"

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

  const [uncontrolledDateRange, setUncontrolledDateRange] = useState<DateRangeValue>(() =>
    getDefaultDateRange(isPreview ? 6 : 29),
  )
  const dateRange = controlledDateRange ?? uncontrolledDateRange
  const setDateRange = onDateRangeChange ?? setUncontrolledDateRange
  const [selectedRunAt, setSelectedRunAt] = useState<Date | null>(null)

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
  } = useQuery<Array<{ run_at: string; brand_position: number | null }>>({
    queryKey: [
      "project-ai-global-timeseries",
      projectId,
      from ? from.toISOString() : null,
      to ? to.toISOString() : null,
    ],
    enabled: isPreview && !!from && !!to,
    queryFn: async () => {
      if (!from || !to) return []

      const { data: promptRows, error: promptError } = await (supabase as any)
        .from("project_ai_prompts")
        .select("id")
        .eq("project_id", projectId)
      if (promptError) throw promptError

      const promptIds = ((promptRows || []) as Array<{ id: number }>).map((row) => row.id)
      if (!promptIds.length) return []

      const { data: resultRows, error: resultError } = await (supabase as any)
        .from("project_ai_prompt_results")
        .select("run_at, brand_position")
        .in("project_ai_prompt_id", promptIds)
        .gte("run_at", from.toISOString())
        .lte("run_at", to.toISOString())
        .order("run_at", { ascending: true })
      if (resultError) throw resultError

      const byDay = new Map<string, number[]>()
      for (const row of (resultRows || []) as Array<{ run_at: string; brand_position: number | null }>) {
        const dayKey = format(new Date(row.run_at), "yyyy-MM-dd")
        if (row.brand_position == null || !Number.isFinite(row.brand_position)) continue
        const bucket = byDay.get(dayKey) ?? []
        bucket.push(row.brand_position)
        byDay.set(dayKey, bucket)
      }

      return Array.from(byDay.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([day, positions]) => ({
          run_at: `${day}T12:00:00`,
          brand_position:
            positions.length > 0
              ? Math.round((positions.reduce((sum, value) => sum + value, 0) / positions.length) * 10) / 10
              : null,
        }))
    },
  })

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

  useEffect(() => {
    if (!selectedPromptId && prompts && prompts.length > 0) {
      const first = prompts[0]
      setSelectedPromptId(first.project_ai_prompt_id)
      setSelectedToolId(first.ai_tool_id)
      if (first.run_at) {
        setSelectedRunAt(new Date(first.run_at))
      }
    }
  }, [prompts, selectedPromptId])

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
  const hasTimeseries = timeseries && timeseries.length > 0

  useEffect(() => {
    if (!isPreview || !hasPrompts || selectedPromptId != null) return
    const first = prompts![0]
    setSelectedPromptId(first.project_ai_prompt_id)
    setSelectedToolId(first.ai_tool_id)
    if (first.run_at) setSelectedRunAt(new Date(first.run_at))
  }, [hasPrompts, isPreview, prompts, selectedPromptId])

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

  const promptSelectOptions = useMemo(() => {
    if (!prompts?.length) return []
    const seen = new Set<string>()
    return prompts
      .map((row) => {
        const key = `${row.project_ai_prompt_id}:${row.ai_tool_id}`
        if (seen.has(key)) return null
        seen.add(key)
        return {
          key,
          promptId: row.project_ai_prompt_id,
          toolId: row.ai_tool_id,
          label: `${row.prompt_text} · ${row.ai_tool_name}`,
        }
      })
      .filter(Boolean) as Array<{
      key: string
      promptId: number
      toolId: number
      label: string
    }>
  }, [prompts])

  const brandPositionChart = (
    <Card className="min-w-0 p-4 md:p-6">
      <div className="mb-3 flex min-w-0 flex-col gap-3">
        {isPreview ? null : (
          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-gray-900">
              Brand position over time
            </h4>
            <p className="text-[11px] text-gray-500">
              Lower position is better (1 = top mention).
            </p>
            {selectedTool ? (
              <p className="mt-1 text-[11px] text-gray-500">
                Tool:{" "}
                <span className="font-medium text-gray-900">
                  {selectedTool.name}
                </span>
              </p>
            ) : null}
          </div>
        )}
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          {isPreview && promptSelectOptions.length > 0 ? (
            <div className="w-full min-w-0 sm:max-w-md sm:flex-1">
              <Select
                value={
                  selectedPromptId != null && selectedToolId != null
                    ? `${selectedPromptId}:${selectedToolId}`
                    : undefined
                }
                onValueChange={(value) => {
                  const [promptIdRaw, toolIdRaw] = value.split(":")
                  const promptId = Number(promptIdRaw)
                  const toolId = Number(toolIdRaw)
                  if (!Number.isFinite(promptId) || !Number.isFinite(toolId)) return
                  setSelectedPromptId(promptId)
                  setSelectedToolId(toolId)
                  const match = prompts?.find(
                    (row) =>
                      row.project_ai_prompt_id === promptId &&
                      row.ai_tool_id === toolId,
                  )
                  setSelectedRunAt(match?.run_at ? new Date(match.run_at) : null)
                }}
              >
                <SelectTrigger className="h-8 w-full text-xs">
                  <SelectValue placeholder="Select prompt & tool" />
                </SelectTrigger>
                <SelectContent>
                  {promptSelectOptions.map((option) => (
                    <SelectItem key={option.key} value={option.key} className="text-xs">
                      <span className="line-clamp-1">{option.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          {isPreview ? null : (
            <div className="w-full min-w-0 sm:w-56">
              <DateRangePicker
                value={dateRange}
                onChange={(range) => setDateRange(range)}
              />
            </div>
          )}
        </div>
      </div>

      <div className="h-64 min-w-0">
        {!selectedPromptId || !selectedToolId ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-500">
            {isPreview
              ? "No AI prompts configured yet."
              : "Select a prompt and tool from the table below to see history."}
          </div>
        ) : isLoadingTimeseries ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-500">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Loading brand position history…
          </div>
        ) : timeseriesError ? (
          <div className="flex h-full items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <AlertCircle className="h-4 w-4" />
            <span>Failed to load brand position timeseries.</span>
          </div>
        ) : !hasTimeseries ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-500">
            No runs yet for this prompt and tool. Use &quot;Run now&quot; to
            fetch AI responses.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={timeseries}
              onClick={(e: any) => {
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
                tickFormatter={formatShortDateTime}
              />
              <YAxis
                stroke="#6b7280"
                style={{ fontSize: "12px" }}
                reversed
                domain={[1, "dataMax + 1"]}
                allowDecimals={false}
              />
              <RechartsTooltip
                formatter={(value: any) => {
                  const v = value as number | null
                  if (v == null) return ["Not mentioned", "Position"]
                  return [`#${v}`, "Position"]
                }}
                labelFormatter={(label) =>
                  `Run at: ${format(
                    new Date(label),
                    "yyyy-MM-dd HH:mm",
                  )}`
                }
              />
              <Line
                type="monotone"
                dataKey="brand_position"
                stroke={CHART_LINE_STROKE}
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  )

  if (isPreview) {
    const chartData = hasTimeseries ? timeseries : globalTimeseries
    const isLoadingChart = selectedPromptId
      ? isLoadingTimeseries
      : isLoadingGlobalTimeseries
    const chartError = selectedPromptId ? timeseriesError : globalTimeseriesError
    const hasChart = !!chartData?.length
    const metricLabel = selectedPromptId ? "Position" : "Avg position"
    const chartAvailable = Boolean(hasPrompts)

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
        <ChartPreviewHoverActions
          enabled={chartAvailable}
          actions={<ChartPreviewDateRangeButton value={dateRange} onChange={setDateRange} />}
        >
          <div className="h-64 min-w-0">
            {isLoadingChart ? (
              <div className="flex h-full items-center justify-center text-sm text-gray-500">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Loading brand position…
              </div>
            ) : chartError ? (
              <div className="flex h-full items-center gap-2 text-xs text-red-700">
                <AlertCircle className="h-4 w-4" />
                <span>Failed to load brand position history.</span>
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
                    reversed
                    domain={[1, "dataMax + 1"]}
                    allowDecimals={false}
                  />
                  <RechartsTooltip
                    formatter={(value: any) => {
                      const v = value as number | null
                      if (v == null) return ["Not mentioned", metricLabel]
                      return [`#${v}`, metricLabel]
                    }}
                    labelFormatter={(label) =>
                      `Date: ${format(new Date(label), "yyyy-MM-dd")}`
                    }
                  />
                  <Line
                    type="monotone"
                    dataKey="brand_position"
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

        <div className="space-y-2">
          <div className="text-[11px] font-medium text-gray-500">Tracked prompts</div>
          <div className="flex flex-wrap gap-1.5">
            {prompts!.map((row) => {
              const isSelected =
                row.project_ai_prompt_id === selectedPromptId &&
                row.ai_tool_id === selectedToolId
              return (
                <button
                  key={`${row.project_ai_prompt_id}-${row.ai_tool_id}`}
                  type="button"
                  onClick={() => {
                    setSelectedPromptId(row.project_ai_prompt_id)
                    setSelectedToolId(row.ai_tool_id)
                    if (row.run_at) setSelectedRunAt(new Date(row.run_at))
                  }}
                  className={cn(
                    "max-w-full rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors",
                    isSelected
                      ? "border-gray-900 bg-gray-900 text-white"
                      : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50",
                  )}
                >
                  <span className="line-clamp-2">
                    {row.prompt_text}
                    {row.ai_tool_name ? (
                      <span className={cn("ml-1", isSelected ? "text-gray-300" : "text-gray-400")}>
                        · {row.ai_tool_name}
                      </span>
                    ) : null}
                    {row.brand_position != null ? (
                      <span className={cn("ml-1", isSelected ? "text-gray-300" : "text-gray-500")}>
                        #{row.brand_position}
                      </span>
                    ) : null}
                  </span>
                </button>
              )
            })}
          </div>
          {showPreviewAddForm ? (
            previewAddForm
          ) : (
            <AddDashedButton
              label="Add prompt"
              className="mt-1"
              onClick={() => setShowPreviewAddForm(true)}
            />
          )}
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
        ) : (
          <div className="divide-y divide-gray-100 rounded-md border border-gray-100">
            {prompts!.map((row) => {
              const isSelected =
                row.project_ai_prompt_id === selectedPromptId &&
                row.ai_tool_id === selectedToolId
              return (
                <button
                  key={`${row.project_ai_prompt_id}-${row.ai_tool_id}`}
                  type="button"
                  className={cn(
                    "flex w-full flex-col gap-1 px-3 py-2.5 text-left transition-colors hover:bg-gray-50 sm:flex-row sm:items-center sm:justify-between",
                    isSelected && "bg-gray-50",
                  )}
                  onClick={() => {
                    setSelectedPromptId(row.project_ai_prompt_id)
                    setSelectedToolId(row.ai_tool_id)
                    if (row.run_at) setSelectedRunAt(new Date(row.run_at))
                  }}
                >
                  <div className="min-w-0">
                    <div className="line-clamp-2 text-xs text-gray-900">{row.prompt_text}</div>
                    <div className="mt-0.5 text-[11px] text-gray-500">
                      {row.ai_tool_name || "Tool"}
                      {row.run_at
                        ? ` · ${format(new Date(row.run_at), "MMM d, yyyy")}`
                        : ""}
                    </div>
                  </div>
                  <div className="shrink-0 text-xs text-gray-700">
                    {row.brand_position != null ? `#${row.brand_position}` : "Not mentioned"}
                  </div>
                </button>
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
    <div className="min-w-0 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">AI visibility</h2>
      </div>

      {/* Brand position + snapshot at top */}
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
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

          {isLoadingSnapshot ? (
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
                </div>
                {snapshot.brand_position != null ? (
                  <div>
                    Your brand appears at position{" "}
                    <span className="font-semibold">
                      #{snapshot.brand_position}
                    </span>
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
      </div>

      {promptsManagementCard}
    </div>
  )
}



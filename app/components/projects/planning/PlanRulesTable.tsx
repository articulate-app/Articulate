"use client"

import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Edit2, Plus, Trash2 } from "lucide-react"

import { Button } from "../../ui/button"
import { Card } from "../../ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../ui/dialog"
import { Input } from "../../ui/input"
import { Label } from "../../ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select"
import { Switch } from "../../ui/switch"
import { MultiSelect } from "../../ui/multi-select"
import { toast } from "../../ui/use-toast"
import {
  createProjectTaskPlan,
  listProjectTaskPlans,
  softDeleteProjectTaskPlan,
  updateProjectTaskPlan,
  type ChannelsMode,
  type FrequencyUnit,
  type PlanningLookups,
  type ProjectTaskPlanRow,
} from "../../../lib/services/project-planning"

type PlanFormState = {
  contentTypeId: string // "any" | number as string
  productionTypeId: string
  languageId: string
  briefingTypeId: string
  frequencyCount: string
  frequencyUnit: FrequencyUnit
  channelsMode: ChannelsMode
  channelIds: string[]
  isActive: boolean
}

const ANY = "any"

function toNullableId(value: string): number | null {
  if (!value || value === ANY) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function toPositiveInt(value: string): number | null {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  const i = Math.floor(n)
  if (i <= 0) return null
  return i
}

function defaultFormState(): PlanFormState {
  return {
    contentTypeId: ANY,
    productionTypeId: ANY,
    languageId: ANY,
    briefingTypeId: ANY,
    frequencyCount: "1",
    frequencyUnit: "week",
    channelsMode: "project_default",
    channelIds: [],
    isActive: true,
  }
}

export function PlanRulesTable({
  projectId,
  lookups,
}: {
  projectId: number
  lookups: PlanningLookups
}) {
  const queryClient = useQueryClient()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingPlan, setEditingPlan] = useState<ProjectTaskPlanRow | null>(null)
  const [form, setForm] = useState<PlanFormState>(() => defaultFormState())

  const { data: plans, isLoading } = useQuery<ProjectTaskPlanRow[]>({
    queryKey: ["planning:plans", projectId],
    queryFn: async () => {
      const { data, error } = await listProjectTaskPlans(projectId)
      if (error) throw error
      return data ?? []
    },
  })

  const idToContentType = useMemo(() => new Map(lookups.contentTypes.map((r) => [r.id, r.title])), [lookups.contentTypes])
  const idToProductionType = useMemo(() => new Map(lookups.productionTypes.map((r) => [r.id, r.title])), [lookups.productionTypes])
  const idToLanguage = useMemo(() => new Map(lookups.languages.map((r) => [r.id, r.code])), [lookups.languages])
  const idToBriefingType = useMemo(() => new Map(lookups.briefingTypes.map((r) => [r.id, r.title])), [lookups.briefingTypes])
  const idToChannel = useMemo(() => new Map(lookups.channels.map((r) => [r.id, r.name])), [lookups.channels])

  const channelOptions = useMemo(
    () => lookups.channels.map((c) => ({ id: String(c.id), label: c.name })),
    [lookups.channels],
  )

  const upsertMutation = useMutation({
    mutationFn: async () => {
      const frequencyCount = toPositiveInt(form.frequencyCount)
      if (!frequencyCount) {
        throw new Error("Frequency count must be a number greater than 0")
      }
      if (form.channelsMode === "explicit" && form.channelIds.length === 0) {
        throw new Error("Please select at least one channel")
      }

      const payload = {
        project_id: projectId,
        content_type_id: toNullableId(form.contentTypeId),
        production_type_id: toNullableId(form.productionTypeId),
        language_id: toNullableId(form.languageId),
        briefing_type_id: toNullableId(form.briefingTypeId),
        frequency_count: frequencyCount,
        frequency_unit: form.frequencyUnit,
        channels_mode: form.channelsMode,
        channel_ids:
          form.channelsMode === "explicit"
            ? form.channelIds.map((id) => Number(id)).filter((n) => Number.isFinite(n))
            : null,
        is_active: form.isActive,
      }

      if (editingPlan) {
        const { error } = await updateProjectTaskPlan(editingPlan.id, payload)
        if (error) throw error
        return { mode: "edit" as const }
      }

      const { error } = await createProjectTaskPlan(payload)
      if (error) throw error
      return { mode: "create" as const }
    },
    onSuccess: ({ mode }) => {
      toast({
        title: "Success",
        description: mode === "create" ? "Plan rule created" : "Plan rule updated",
      })
      queryClient.invalidateQueries({ queryKey: ["planning:plans", projectId] })
      queryClient.invalidateQueries({ queryKey: ["planning:preview", projectId] })
      setIsModalOpen(false)
      setEditingPlan(null)
      setForm(defaultFormState())
    },
    onError: (err: any) => {
      toast({
        title: "Error",
        description: err?.message || "Failed to save plan rule",
        variant: "destructive",
      })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (planId: number) => {
      const { error } = await softDeleteProjectTaskPlan(planId)
      if (error) throw error
      return planId
    },
    onSuccess: () => {
      toast({ title: "Deleted", description: "Plan rule deleted" })
      queryClient.invalidateQueries({ queryKey: ["planning:plans", projectId] })
      queryClient.invalidateQueries({ queryKey: ["planning:preview", projectId] })
    },
    onError: (err: any) => {
      toast({
        title: "Error",
        description: err?.message || "Failed to delete plan rule",
        variant: "destructive",
      })
    },
  })

  const openCreate = () => {
    setEditingPlan(null)
    setForm(defaultFormState())
    setIsModalOpen(true)
  }

  const openEdit = (row: ProjectTaskPlanRow) => {
    setEditingPlan(row)
    setForm({
      contentTypeId: row.content_type_id ? String(row.content_type_id) : ANY,
      productionTypeId: row.production_type_id ? String(row.production_type_id) : ANY,
      languageId: row.language_id ? String(row.language_id) : ANY,
      briefingTypeId: row.briefing_type_id ? String(row.briefing_type_id) : ANY,
      frequencyCount: String(row.frequency_count ?? 1),
      frequencyUnit: (row.frequency_unit as FrequencyUnit) ?? "week",
      channelsMode: (row.channels_mode as ChannelsMode) ?? "project_default",
      channelIds: (row.channel_ids ?? []).map((id) => String(id)),
      isActive: !!row.is_active,
    })
    setIsModalOpen(true)
  }

  const renderAny = (value: string | null | undefined) => value || "Any"

  const formatChannels = (row: ProjectTaskPlanRow) => {
    if (row.channels_mode !== "explicit") return "Project default"
    const names =
      row.channel_ids?.map((id) => idToChannel.get(id)).filter(Boolean) as string[] | undefined
    return names && names.length ? names.join(", ") : "—"
  }

  return (
    <Card className="p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-sm font-semibold text-gray-900">Plan rules</div>
          <div className="text-xs text-gray-500">
            Define recurring planning rules for this project.
          </div>
        </div>
        <Button type="button" onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          Add rule
        </Button>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b bg-gray-50 text-xs font-medium uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2">Active</th>
              <th className="px-3 py-2">Content</th>
              <th className="px-3 py-2">Production</th>
              <th className="px-3 py-2">Language</th>
              <th className="px-3 py-2">Briefing</th>
              <th className="px-3 py-2">Frequency</th>
              <th className="px-3 py-2">Channels</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {!isLoading && (plans?.length ?? 0) === 0 && (
              <tr>
                <td className="px-3 py-6 text-sm text-gray-500" colSpan={8}>
                  No plan rules yet. Add your first rule to get started.
                </td>
              </tr>
            )}

            {(plans ?? []).map((row) => (
              <tr key={row.id} className="border-b last:border-0">
                <td className="px-3 py-3">
                  <span className={row.is_active ? "text-emerald-700" : "text-gray-400"}>
                    {row.is_active ? "Yes" : "No"}
                  </span>
                </td>
                <td className="px-3 py-3">
                  {renderAny(row.content_type_id ? idToContentType.get(row.content_type_id) : null)}
                </td>
                <td className="px-3 py-3">
                  {renderAny(row.production_type_id ? idToProductionType.get(row.production_type_id) : null)}
                </td>
                <td className="px-3 py-3">
                  {renderAny(row.language_id ? idToLanguage.get(row.language_id) : null)}
                </td>
                <td className="px-3 py-3">
                  {renderAny(row.briefing_type_id ? idToBriefingType.get(row.briefing_type_id) : null)}
                </td>
                <td className="px-3 py-3">
                  {row.frequency_count} / {row.frequency_unit}
                </td>
                <td className="px-3 py-3">{formatChannels(row)}</td>
                <td className="px-3 py-3">
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => openEdit(row)}
                    >
                      <Edit2 className="h-4 w-4" />
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-2 text-red-600 hover:text-red-700"
                      disabled={deleteMutation.isPending}
                      onClick={() => {
                        const ok = window.confirm("Delete this plan rule? This cannot be undone.")
                        if (!ok) return
                        deleteMutation.mutate(row.id)
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog
        open={isModalOpen}
        onOpenChange={(open) => {
          setIsModalOpen(open)
          if (!open) {
            setEditingPlan(null)
            setForm(defaultFormState())
          }
        }}
      >
        <DialogContent className="sm:max-w-[720px]">
          <DialogHeader>
            <DialogTitle>{editingPlan ? "Edit plan rule" : "Add plan rule"}</DialogTitle>
            <DialogDescription>
              Define what to plan, how often, and where it should be published.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4 py-2 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Content type</Label>
              <Select value={form.contentTypeId} onValueChange={(v) => setForm((p) => ({ ...p, contentTypeId: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>Any</SelectItem>
                  {lookups.contentTypes.map((r) => (
                    <SelectItem key={r.id} value={String(r.id)}>
                      {r.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Production type</Label>
              <Select value={form.productionTypeId} onValueChange={(v) => setForm((p) => ({ ...p, productionTypeId: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>Any</SelectItem>
                  {lookups.productionTypes.map((r) => (
                    <SelectItem key={r.id} value={String(r.id)}>
                      {r.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Language</Label>
              <Select value={form.languageId} onValueChange={(v) => setForm((p) => ({ ...p, languageId: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>Any</SelectItem>
                  {lookups.languages.map((r) => (
                    <SelectItem key={r.id} value={String(r.id)}>
                      {r.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Briefing type</Label>
              <Select value={form.briefingTypeId} onValueChange={(v) => setForm((p) => ({ ...p, briefingTypeId: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>Any</SelectItem>
                  {lookups.briefingTypes.map((r) => (
                    <SelectItem key={r.id} value={String(r.id)}>
                      {r.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Frequency</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  inputMode="numeric"
                  value={form.frequencyCount}
                  onChange={(e) => setForm((p) => ({ ...p, frequencyCount: e.target.value }))}
                  placeholder="Count"
                />
                <Select
                  value={form.frequencyUnit}
                  onValueChange={(v) => setForm((p) => ({ ...p, frequencyUnit: v as FrequencyUnit }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Unit" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="week">Week</SelectItem>
                    <SelectItem value="month">Month</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Channels</Label>
              <Select
                value={form.channelsMode}
                onValueChange={(v) => setForm((p) => ({ ...p, channelsMode: v as ChannelsMode }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Project default" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="project_default">Project default</SelectItem>
                  <SelectItem value="explicit">Explicit</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.channelsMode === "explicit" ? (
              <div className="space-y-2 md:col-span-2">
                <Label>
                  Channels <span className="text-red-500">*</span>
                </Label>
                <MultiSelect
                  options={channelOptions}
                  value={form.channelIds}
                  onChange={(value) => setForm((p) => ({ ...p, channelIds: value }))}
                  placeholder="Select channels..."
                />
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-3 rounded-md border p-3 md:col-span-2">
              <div>
                <div className="text-sm font-medium text-gray-900">Active</div>
                <div className="text-xs text-gray-500">Inactive rules won’t generate suggestions.</div>
              </div>
              <Switch
                checked={form.isActive}
                onCheckedChange={(checked) => setForm((p) => ({ ...p, isActive: checked }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsModalOpen(false)}
              disabled={upsertMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => upsertMutation.mutate()}
              disabled={upsertMutation.isPending}
              className="gap-2"
            >
              {editingPlan ? (
                <>
                  <Edit2 className="h-4 w-4" />
                  Save
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Create
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}



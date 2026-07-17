"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { Badge } from "../ui/badge"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import { Textarea } from "../ui/textarea"
import { toast } from "../ui/use-toast"
import { ExternalLink, Loader2 } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog"
import {
  loadProjectComponentIndex,
  updateProjectComponentInProject,
  type ComponentIndexItem,
} from "../../lib/services/project-briefings"
import { ChannelRequirementsSection } from "./channel-requirements-section"

type Props = {
  projectId: number
  componentKey: string
  onClose: () => void
}

function parseComponentKey(key: string): { kind: "project" | "global"; id: number } | null {
  const [kind, raw] = String(key).split(":")
  if (kind !== "project" && kind !== "global") return null
  const id = Number(raw)
  if (!Number.isFinite(id)) return null
  return { kind, id }
}

export function ComponentDetailsPane({ projectId, componentKey }: Props) {
  const supabase = createClientComponentClient()
  const queryClient = useQueryClient()

  const parsed = useMemo(() => parseComponentKey(componentKey), [componentKey])
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)

  const { data: indexItems, isLoading: isIndexLoading } = useQuery({
    queryKey: ["projBriefings:library:index", projectId],
    queryFn: async () => {
      const { data, error } = await loadProjectComponentIndex(projectId)
      if (error) throw error
      return (data || []) as ComponentIndexItem[]
    },
  })

  const selectedItem = useMemo(() => {
    if (!indexItems || !parsed) return null
    return indexItems.find((i) => i.key === componentKey) || null
  }, [componentKey, indexItems, parsed])

  const selectedProjectComponentId = selectedItem?.kind === "project" ? selectedItem.component_id : null
  const selectedGlobalComponentId = selectedItem?.kind === "global" ? selectedItem.component_id : null

  const [editTitle, setEditTitle] = useState("")
  const [editDescription, setEditDescription] = useState("")
  const [isSavingMeta, setIsSavingMeta] = useState(false)

  // Global usage (templates)
  const { data: globalTemplateUsage } = useQuery({
    queryKey: ["projBriefings:library:globalUsage:templates", projectId, selectedGlobalComponentId],
    enabled: !!selectedGlobalComponentId,
    queryFn: async () => {
      if (!selectedGlobalComponentId) return []

      const [rowsRes, btRes] = await Promise.all([
        supabase
          .from("v_project_briefing_types_components_resolved")
          .select("briefing_type_id, position")
          .eq("project_id", projectId)
          .eq("is_project_component", false)
          .eq("component_id", selectedGlobalComponentId),
        supabase.from("v_project_briefing_types").select("briefing_type_id, display_title").eq("project_id", projectId),
      ])
      if (rowsRes.error) throw rowsRes.error
      if (btRes.error) throw btRes.error

      const titleById = new Map<number, string>(
        ((btRes.data || []) as any[]).map((bt: any) => [bt.briefing_type_id, bt.display_title])
      )

      return (rowsRes.data || []).map((row: any) => ({
        briefing_type_id: row.briefing_type_id,
        briefing_type_title: titleById.get(row.briefing_type_id) ?? `Briefing ${row.briefing_type_id}`,
        position: row.position ?? null,
      }))
    },
  })

  // Global usage (CT×Channel)
  const { data: globalCtUsage } = useQuery({
    queryKey: ["projBriefings:library:globalUsage:ct", projectId, selectedGlobalComponentId],
    enabled: !!selectedGlobalComponentId,
    queryFn: async () => {
      if (!selectedGlobalComponentId) return []

      const ctRes = await supabase
        .from("project_ct_channel_briefing_components")
        .select("content_type_id, channel_id, briefing_type_id, position, custom_title, custom_description")
        .eq("project_id", projectId)
        .eq("briefing_component_id", selectedGlobalComponentId)
      if (ctRes.error) throw ctRes.error

      const rows = (ctRes.data || []) as Array<{
        content_type_id: number
        channel_id: number
        briefing_type_id: number | null
        position: number | null
        custom_title: string | null
        custom_description: string | null
      }>

      const needsDefaults = rows.some((r) => r.briefing_type_id == null)
      const defaultByPair = new Map<string, number | null>()
      if (needsDefaults) {
        const ctIds = Array.from(new Set(rows.map((r) => r.content_type_id)))
        const chIds = Array.from(new Set(rows.map((r) => r.channel_id)))
        const defaultsRes = await supabase
          .from("project_ct_channel_briefings")
          .select("content_type_id, channel_id, briefing_type_id, is_default")
          .eq("project_id", projectId)
          .eq("is_default", true)
          .in("content_type_id", ctIds)
          .in("channel_id", chIds)
        if (defaultsRes.error) throw defaultsRes.error
        ;((defaultsRes.data || []) as any[]).forEach((row: any) => {
          defaultByPair.set(`${row.content_type_id}:${row.channel_id}`, row.briefing_type_id ?? null)
        })
      }

      const briefingTypesRes = await supabase
        .from("v_project_briefing_types")
        .select("briefing_type_id, display_title")
        .eq("project_id", projectId)
      if (briefingTypesRes.error) throw briefingTypesRes.error
      const briefingTitleById = new Map<number, string>(
        ((briefingTypesRes.data || []) as any[]).map((bt: any) => [bt.briefing_type_id, bt.display_title])
      )

      const contentTypeIds = Array.from(new Set(rows.map((r) => r.content_type_id)))
      const channelIds = Array.from(new Set(rows.map((r) => r.channel_id)))
      const [contentTypesRes, channelsRes] = await Promise.all([
        contentTypeIds.length ? supabase.from("content_types").select("id, title").in("id", contentTypeIds) : Promise.resolve({ data: [], error: null } as any),
        channelIds.length ? supabase.from("channels").select("id, name").in("id", channelIds) : Promise.resolve({ data: [], error: null } as any),
      ])
      if (contentTypesRes.error) throw contentTypesRes.error
      if (channelsRes.error) throw channelsRes.error

      const contentTypeTitleById = new Map<number, string>(((contentTypesRes.data || []) as any[]).map((ct: any) => [ct.id, ct.title]))
      const channelTitleById = new Map<number, string>(((channelsRes.data || []) as any[]).map((ch: any) => [ch.id, ch.name]))

      return rows
        .map((row) => {
          const bt = row.briefing_type_id ?? defaultByPair.get(`${row.content_type_id}:${row.channel_id}`) ?? null
          if (!bt) return null
          return {
            content_type_id: row.content_type_id,
            content_type_title: contentTypeTitleById.get(row.content_type_id) ?? `Content type ${row.content_type_id}`,
            channel_id: row.channel_id,
            channel_title: channelTitleById.get(row.channel_id) ?? `Channel ${row.channel_id}`,
            briefing_type_id: bt,
            briefing_type_title: briefingTitleById.get(bt) ?? `Briefing ${bt}`,
            position: row.position ?? null,
            custom_title: row.custom_title ?? "",
            custom_description: row.custom_description ?? "",
          }
        })
        .filter(Boolean)
    },
  })

  // Keep right-pane form in sync when selection changes.
  useEffect(() => {
    if (!selectedItem) {
      setEditTitle("")
      setEditDescription("")
      return
    }
    setEditTitle(selectedItem.title)
    setEditDescription(selectedItem.description || "")
  }, [selectedItem])

  const invalidateUsageEverywhere = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["projBriefings:library:index", projectId] })
    queryClient.invalidateQueries({ queryKey: ["projBriefings:library:globalUsage:templates", projectId] })
    queryClient.invalidateQueries({ queryKey: ["projBriefings:library:globalUsage:ct", projectId] })
    queryClient.invalidateQueries({ queryKey: ["projBriefings:library:channelPolicies", projectId] })
    queryClient.invalidateQueries({ queryKey: ["projBriefings:components"] })
    queryClient.invalidateQueries({ queryKey: ["availableComponents"] })
    queryClient.invalidateQueries({ queryKey: ["allowedGlobalComponents"] })
  }, [projectId, queryClient])

  const handleSaveProjectMeta = useCallback(async () => {
    if (!selectedProjectComponentId || !selectedItem || selectedItem.kind !== "project") return
    if (!editTitle.trim()) {
      toast({ title: "Error", description: "Title is required", variant: "destructive" })
      return
    }
    setIsSavingMeta(true)
    try {
      const hasTitleChange = editTitle.trim() !== selectedItem.title
      const hasDescChange = (editDescription.trim() || "") !== (selectedItem.description || "")
      if (!hasTitleChange && !hasDescChange) return
      const { error } = await updateProjectComponentInProject(projectId, selectedProjectComponentId, {
        title: editTitle.trim(),
        description: editDescription.trim() || null,
      })
      if (error) throw error
      toast({ title: "Success", description: "Component updated" })
      invalidateUsageEverywhere()
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to update component", variant: "destructive" })
    } finally {
      setIsSavingMeta(false)
    }
  }, [editDescription, editTitle, invalidateUsageEverywhere, projectId, selectedItem, selectedProjectComponentId])

  const handleSaveGlobalMeta = useCallback(async () => {
    if (!selectedGlobalComponentId || !selectedItem || selectedItem.kind !== "global") return
    if (!editTitle.trim()) {
      toast({ title: "Error", description: "Title is required", variant: "destructive" })
      return
    }
    const rows = (globalCtUsage || []) as any[]
    if (!rows.length) {
      toast({
        title: "Nothing to update",
        description: "This component has no Channel/Content-Type selections yet. Add it to a briefing first.",
        variant: "destructive",
      })
      return
    }
    if (rows.length > 25) {
      toast({
        title: "Too many selections",
        description: `This component is used in ${rows.length} briefings. Please edit it from the Library tab.`,
        variant: "destructive",
      })
      return
    }

    setIsSavingMeta(true)
    try {
      const results = await Promise.allSettled(
        rows.map((row: any) =>
          supabase.rpc("pcctbc_update", {
            p_project_id: projectId,
            p_content_type_id: row.content_type_id,
            p_channel_id: row.channel_id,
            p_briefing_type_id: row.briefing_type_id,
            p_component_id: selectedGlobalComponentId,
            p_is_project_component: false,
            p_custom_title: editTitle.trim() || null,
            p_custom_description: editDescription.trim() || null,
          })
        )
      )
      const rejected = results.filter((r) => r.status === "rejected") as Array<PromiseRejectedResult>
      if (rejected.length) throw rejected[0].reason
      toast({ title: "Success", description: "Component updated" })
      invalidateUsageEverywhere()
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to update component", variant: "destructive" })
    } finally {
      setIsSavingMeta(false)
    }
  }, [editDescription, editTitle, globalCtUsage, invalidateUsageEverywhere, projectId, selectedGlobalComponentId, selectedItem, supabase])

  const handleRemoveGlobalFromTemplate = useCallback(
    async (briefingTypeId: number) => {
      if (!selectedGlobalComponentId) return
      const { error } = await supabase.rpc("pbtc_remove", {
        p_project_id: projectId,
        p_briefing_type_id: briefingTypeId,
        p_component_id: selectedGlobalComponentId,
        p_is_project_component: false,
      })
      if (error) throw error
      toast({ title: "Success", description: "Removed from template" })
      invalidateUsageEverywhere()
    },
    [invalidateUsageEverywhere, projectId, selectedGlobalComponentId, supabase]
  )

  const handleRemoveGlobalFromCtChannel = useCallback(
    async (args: { contentTypeId: number; channelId: number; briefingTypeId: number }) => {
      if (!selectedGlobalComponentId) return
      const { error } = await supabase.rpc("pcctbc_remove", {
        p_project_id: projectId,
        p_content_type_id: args.contentTypeId,
        p_channel_id: args.channelId,
        p_briefing_type_id: args.briefingTypeId,
        p_component_id: selectedGlobalComponentId,
        p_is_project_component: false,
      })
      if (error) throw error
      toast({ title: "Success", description: "Removed from briefing" })
      invalidateUsageEverywhere()
    },
    [invalidateUsageEverywhere, projectId, selectedGlobalComponentId, supabase]
  )

  // Inline override editing for CT×Channel rows (global system components only)
  const [overrideDrafts, setOverrideDrafts] = useState<Record<string, { custom_title: string; custom_description: string }>>({})
  const [overrideInitialByKey, setOverrideInitialByKey] = useState<Record<string, { custom_title: string; custom_description: string }>>({})

  useEffect(() => {
    if (selectedItem?.kind !== "global") return
    const rows: any[] = globalCtUsage || []
    if (!rows.length) return
    const next: Record<string, { custom_title: string; custom_description: string }> = {}
    const initial: Record<string, { custom_title: string; custom_description: string }> = {}
    rows.forEach((row: any) => {
      const key = `${row.content_type_id}:${row.channel_id}:${row.briefing_type_id}`
      next[key] = { custom_title: row.custom_title || "", custom_description: row.custom_description || "" }
      initial[key] = { custom_title: row.custom_title || "", custom_description: row.custom_description || "" }
    })
    setOverrideDrafts(next)
    setOverrideInitialByKey(initial)
  }, [globalCtUsage, selectedItem?.kind])

  const handleSaveOverride = useCallback(
    async (args: { contentTypeId: number; channelId: number; briefingTypeId: number }) => {
      const key = `${args.contentTypeId}:${args.channelId}:${args.briefingTypeId}`
      const draft = overrideDrafts[key]
      if (!draft) return
      const initial = overrideInitialByKey[key]
      const isSameTitle = (draft.custom_title.trim() || "") === ((initial?.custom_title ?? "").trim() || "")
      const isSameDesc = (draft.custom_description.trim() || "") === ((initial?.custom_description ?? "").trim() || "")
      if (isSameTitle && isSameDesc) return
      if (!selectedGlobalComponentId) return

      const { error } = await supabase.rpc("pcctbc_update", {
        p_project_id: projectId,
        p_content_type_id: args.contentTypeId,
        p_channel_id: args.channelId,
        p_briefing_type_id: args.briefingTypeId,
        p_component_id: selectedGlobalComponentId,
        p_is_project_component: false,
        p_custom_title: draft.custom_title.trim() || null,
        p_custom_description: draft.custom_description.trim() || null,
      })
      if (error) throw error
      toast({ title: "Success", description: "Overrides updated" })
      invalidateUsageEverywhere()
    },
    [
      invalidateUsageEverywhere,
      overrideDrafts,
      overrideInitialByKey,
      projectId,
      selectedGlobalComponentId,
      supabase,
    ]
  )

  const handleDeleteFromProject = useCallback(async () => {
    if (!selectedItem) return
    try {
      const { error } =
        selectedItem.kind === "project"
          ? await supabase.rpc("pbc_delete_project_component", {
              p_project_id: projectId,
              p_project_component_id: selectedProjectComponentId,
            })
          : await supabase.rpc("pbc_remove_global_component_from_project", {
              p_project_id: projectId,
              p_briefing_component_id: selectedGlobalComponentId,
            })
      if (error) throw error
      toast({ title: "Success", description: "Component removed from project" })
      setIsDeleteDialogOpen(false)
      invalidateUsageEverywhere()
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to delete component", variant: "destructive" })
    }
  }, [invalidateUsageEverywhere, projectId, selectedGlobalComponentId, selectedItem, selectedProjectComponentId, supabase])

  if (!parsed) {
    return <div className="text-sm text-gray-500">Invalid component.</div>
  }

  if (!selectedItem) {
    return <div className="text-sm text-gray-500">{isIndexLoading ? "Loading component…" : "Component not found."}</div>
  }

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 space-y-6 overflow-auto pr-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">
                {selectedItem.kind === "project" ? "Custom (Project component)" : "System component"}
              </Badge>
              {isSavingMeta ? (
                <span className="text-xs text-gray-500 inline-flex items-center">
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  Saving…
                </span>
              ) : null}
            </div>
            <div className="mt-3">
              <h3 className="text-base font-semibold text-gray-900 leading-tight">{selectedItem.title}</h3>
              <p className="text-sm text-gray-500 mt-1">
                {selectedItem.kind === "project"
                  ? "Edit the component and set channel requirements for AI builds."
                  : "Edit the component and manage where it’s used."}
              </p>
            </div>
          </div>

          <Button
            size="sm"
            variant="outline"
            className="gap-2"
            onClick={() => {
              window.open(
                `/projects/${projectId}?tab=library&component=${encodeURIComponent(componentKey)}`,
                "_blank"
              )
            }}
          >
            <ExternalLink className="w-4 h-4" />
            Open in Library
          </Button>
        </div>

        {selectedItem.kind === "project" ? (
          <div className="space-y-3">
            <div>
              <Label htmlFor="edit-title">Title</Label>
              <Input
                id="edit-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onBlur={handleSaveProjectMeta}
                placeholder="Component title"
              />
            </div>
            <div>
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                onBlur={handleSaveProjectMeta}
                placeholder="Component description"
                rows={4}
              />
            </div>
            <div className="text-xs text-gray-500">Auto-saves on blur.</div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <Label htmlFor="edit-global-title">Title</Label>
              <Input
                id="edit-global-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onBlur={handleSaveGlobalMeta}
                placeholder="Custom title"
              />
            </div>
            <div>
              <Label htmlFor="edit-global-description">Description</Label>
              <Textarea
                id="edit-global-description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                onBlur={handleSaveGlobalMeta}
                placeholder="Custom description"
                rows={4}
              />
            </div>
            <div className="text-xs text-gray-500">Auto-saves on blur (updates all selected briefings).</div>
          </div>
        )}

        {selectedItem.kind === "project" && selectedProjectComponentId != null ? (
          <ChannelRequirementsSection
            projectId={projectId}
            component={{ kind: "project", projectComponentId: selectedProjectComponentId }}
          />
        ) : (
          <>
            {/* Usage in templates (system / global components only) */}
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-semibold text-gray-900">Used in Project Briefing Templates</h4>
                <p className="text-xs text-gray-500 mt-1">Project-level template usage for this component.</p>
              </div>

              {(globalTemplateUsage?.length || 0) === 0 ? (
                <div className="text-sm text-gray-500">Not used in any project briefing templates.</div>
              ) : (
                <div className="space-y-2">
                  {(globalTemplateUsage as any[]).map((row: any) => (
                    <div key={row.briefing_type_id} className="border rounded-md border-gray-200 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-gray-900">{row.briefing_type_title}</div>
                          <div className="text-xs text-gray-500 mt-1">Position: {row.position ?? "—"}</div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 border-red-200 hover:bg-red-50"
                          onClick={() => handleRemoveGlobalFromTemplate(row.briefing_type_id)}
                        >
                          Remove from template
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Usage in CT×Channel (system / global components only) */}
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-semibold text-gray-900">Used in Channel/Content-Type Briefings</h4>
                <p className="text-xs text-gray-500 mt-1">Per channel/content-type usage for this component.</p>
              </div>

              {(globalCtUsage?.length || 0) === 0 ? (
                <div className="text-sm text-gray-500">Not used in any channel/content-type briefings.</div>
              ) : (
                <div className="space-y-3">
                  {(globalCtUsage as any[]).map((row: any) => {
                    const key = `${row.content_type_id}:${row.channel_id}:${row.briefing_type_id}`
                    const draft = overrideDrafts[key] || { custom_title: "", custom_description: "" }
                    return (
                      <div key={key} className="border rounded-md border-gray-200 p-3 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-gray-900">
                              {row.briefing_type_title} - {row.channel_title} - {row.content_type_title}
                            </div>
                            <div className="text-xs text-gray-500 mt-1">Position: {row.position ?? "—"}</div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 border-red-200 hover:bg-red-50"
                            onClick={() =>
                              handleRemoveGlobalFromCtChannel({
                                contentTypeId: row.content_type_id,
                                channelId: row.channel_id,
                                briefingTypeId: row.briefing_type_id,
                              })
                            }
                          >
                            Remove from this briefing
                          </Button>
                        </div>

                        <div className="grid grid-cols-1 gap-3">
                          <div>
                            <Label className="text-xs">Override title</Label>
                            <Input
                              value={draft.custom_title}
                              onChange={(e) =>
                                setOverrideDrafts((prev) => ({
                                  ...prev,
                                  [key]: { ...draft, custom_title: e.target.value },
                                }))
                              }
                              onBlur={() =>
                                handleSaveOverride({
                                  contentTypeId: row.content_type_id,
                                  channelId: row.channel_id,
                                  briefingTypeId: row.briefing_type_id,
                                })
                              }
                              placeholder="(optional)"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Override description</Label>
                            <Textarea
                              value={draft.custom_description}
                              onChange={(e) =>
                                setOverrideDrafts((prev) => ({
                                  ...prev,
                                  [key]: { ...draft, custom_description: e.target.value },
                                }))
                              }
                              onBlur={() =>
                                handleSaveOverride({
                                  contentTypeId: row.content_type_id,
                                  channelId: row.channel_id,
                                  briefingTypeId: row.briefing_type_id,
                                })
                              }
                              placeholder="(optional)"
                              rows={3}
                            />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {/* Delete */}
        <div className="pt-2 border-t border-gray-200">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-gray-900">Danger zone</div>
              <div className="text-xs text-gray-500 mt-1">
                {selectedItem.kind === "project"
                  ? "Deleting removes this project component from the library. Channel requirement settings for it are cleared."
                  : "Deleting will remove this component from all briefings where it is used."}
              </div>
            </div>
            <Button variant="destructive" size="sm" onClick={() => setIsDeleteDialogOpen(true)}>
              Delete from project
            </Button>
          </div>
        </div>
      </div>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete component from project</AlertDialogTitle>
            <AlertDialogDescription>
              Delete this component from the project? It will be removed from all briefings where it is used.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setIsDeleteDialogOpen(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={handleDeleteFromProject}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}


